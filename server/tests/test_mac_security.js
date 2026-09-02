/**
 * Automated Test Suite for MAC Address Authentication & Security
 */

import { normalizeMac, isValidMac, getServerMacs, isServerIp } from '../utils/macResolver.js';
import db from '../db.js';

const BASE_URL = 'http://localhost:3000';

async function runMacSecurityTests() {
  console.log('====================================================');
  console.log('🔒 Запуск тестирования безопасности MAC-адресов...');
  console.log('====================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✔️ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 1. Тестирование утилит macResolver
    console.log('\n--- 1. Тестирование macResolver (Нормализация и Валидация) ---');
    assert(normalizeMac('38-a7-46-6e-2f-3a') === '38:A7:46:6E:2F:3A', 'Нормализация MAC с дефисами в нижнем регистре');
    assert(normalizeMac('38:A7:46:6E:2F:3A') === '38:A7:46:6E:2F:3A', 'Нормализация MAC с двоеточиями');
    assert(normalizeMac('38A7466E2F3A') === '38:A7:46:6E:2F:3A', 'Нормализация сплошного MAC-адреса');
    assert(normalizeMac('invalid-mac') === null, 'Обработка невалидной строки');

    assert(isValidMac('38:A7:46:6E:2F:3A') === true, 'Валидация корректного MAC');
    assert(isValidMac('38-A7-46-6E-2F-3A') === true, 'Валидация корректного MAC с дефисами');
    assert(isValidMac('GG:11:22:33:44:55') === false, 'Отклонение нешестнадцатеричных символов');
    assert(isValidMac('11:22:33') === false, 'Отклонение неполного MAC');

    const serverMacs = getServerMacs();
    assert(Array.isArray(serverMacs) && serverMacs.length > 0, `Обнаружены физические сетевые адаптеры сервера (${serverMacs.join(', ')})`);
    assert(isServerIp('127.0.0.1') === true, '127.0.0.1 распознается как серверный IP');
    assert(isServerIp('::1') === true, '::1 распознается как серверный IP');

    // 2. Тестирование БД и схемы
    console.log('\n--- 2. Тестирование базы данных allowed_devices ---');
    await db.initDatabase();
    const dbDevices = await db.query('SELECT * FROM allowed_devices');
    assert(dbDevices.length > 0, `В таблице allowed_devices присутствуют записи (${dbDevices.length} шт.)`);
    assert(dbDevices.some(d => d.status === 'allowed'), 'В базе есть как минимум одно разрешённое устройство');

    // 3. Авторизация под администратором
    console.log('\n--- 3. Тестирование авторизации и API устройств ---');
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const loginData = await loginRes.json();
    assert(loginRes.ok && loginData.success === true && Boolean(loginData.token), 'Успешный вход с разрешённого устройства (localhost / сервер)');

    const token = loginData.token;
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    // 4. Получение списка устройств через API
    const getDevicesRes = await fetch(`${BASE_URL}/api/devices`, { headers: authHeaders });
    const getDevicesData = await getDevicesRes.json();
    assert(getDevicesRes.ok && Array.isArray(getDevicesData.devices), 'GET /api/devices возвращает список устройств');
    assert(Boolean(getDevicesData.current_device), 'GET /api/devices возвращает информацию о текущем подключении');

    // 5. Добавление нового устройства
    const testMac = 'AA:BB:CC:11:22:33';
    // Очистим тестовую запись если осталась
    await db.run('DELETE FROM allowed_devices WHERE mac_address = ?', [testMac]);

    const addDeviceRes = await fetch(`${BASE_URL}/api/devices`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        device_name: 'Тестовый ноутбук бухгалтера',
        mac_address: testMac,
        status: 'allowed',
        comment: 'Тестовое устройство'
      })
    });
    const addDeviceData = await addDeviceRes.json();
    assert(addDeviceRes.status === 201 && addDeviceData.success === true, 'POST /api/devices успешно создаёт доверенное устройство');
    const createdDeviceId = addDeviceData.device.id;

    // 6. Проверка дублирования MAC
    const dupRes = await fetch(`${BASE_URL}/api/devices`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        device_name: 'Дубликат',
        mac_address: 'aa-bb-cc-11-22-33'
      })
    });
    assert(dupRes.status === 400, 'POST /api/devices отклоняет дубликат MAC-адреса');

    // 7. Обновление устройства (блокировка)
    const blockRes = await fetch(`${BASE_URL}/api/devices/${createdDeviceId}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        status: 'blocked'
      })
    });
    const blockData = await blockRes.json();
    assert(blockRes.ok && blockData.device.status === 'blocked', 'PUT /api/devices/:id блокирует устройство (status: blocked)');

    // 8. Разблокировка устройства
    const unblockRes = await fetch(`${BASE_URL}/api/devices/${createdDeviceId}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        status: 'allowed'
      })
    });
    const unblockData = await unblockRes.json();
    assert(unblockRes.ok && unblockData.device.status === 'allowed', 'PUT /api/devices/:id разблокирует устройство (status: allowed)');

    // 9. Удаление тестового устройства
    const deleteRes = await fetch(`${BASE_URL}/api/devices/${createdDeviceId}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    assert(deleteRes.ok, 'DELETE /api/devices/:id успешно удаляет устройство');

    // 10. Защита от удаления/блокировки последнего разрешённого устройства
    console.log('\n--- 4. Тестирование защиты от блокировки администратора ---');
    // Удалим все тестовые и оставим ровно одно активное устройство
    const remainingDevices = await db.query('SELECT * FROM allowed_devices WHERE status = "allowed"');
    if (remainingDevices.length > 1) {
      for (let i = 1; i < remainingDevices.length; i++) {
        await db.run('DELETE FROM allowed_devices WHERE id = ?', [remainingDevices[i].id]);
      }
    }

    const lastDevice = await db.get('SELECT * FROM allowed_devices WHERE status = "allowed" LIMIT 1');
    assert(Boolean(lastDevice), 'Осталось ровно одно разрешённое устройство в БД');

    // Попытка удалить последнее разрешённое устройство
    const deleteLastRes = await fetch(`${BASE_URL}/api/devices/${lastDevice.id}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    const deleteLastData = await deleteLastRes.json();
    assert(deleteLastRes.status === 400 && deleteLastData.error.includes('последнее разрешённое устройство'), 'Защита: отклонено удаление последнего разрешённого устройства');

    // Попытка заблокировать последнее разрешённое устройство
    const blockLastRes = await fetch(`${BASE_URL}/api/devices/${lastDevice.id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ status: 'blocked' })
    });
    const blockLastData = await blockLastRes.json();
    assert(blockLastRes.status === 400 && blockLastData.error.includes('последнее разрешённое устройство'), 'Защита: отклонена блокировка последнего разрешённого устройства');

    // 11. Тестирование блокировки неавторизованного устройства
    console.log('\n--- 5. Тестирование отказа во входе с неразрешённого MAC ---');
    // Временно снимем статус 'allowed' у текущего устройства через прямой SQL
    await db.run('UPDATE allowed_devices SET status = "blocked" WHERE id = ?', [lastDevice.id]);

    const blockedLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const blockedLoginData = await blockedLoginRes.json();
    assert(blockedLoginRes.status === 403, 'При неразрешённом MAC возвращается HTTP 403 Forbidden');
    assert(blockedLoginData.error === 'Доступ с данного устройства запрещён. Обратитесь к администратору.', 'Корректный текст сообщения об отказе');

    // Восстанавливаем статус
    await db.run('UPDATE allowed_devices SET status = "allowed" WHERE id = ?', [lastDevice.id]);
    const restoredLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    assert(restoredLoginRes.ok, 'После возвращения статуса вход снова разрешён');

    console.log('\n====================================================');
    console.log(`📊 Итоги тестирования: Пройдено: ${passed}, Ошибок: ${failed}`);
    console.log('====================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Критическая ошибка при тестировании:', err);
    process.exit(1);
  }
}

runMacSecurityTests();
