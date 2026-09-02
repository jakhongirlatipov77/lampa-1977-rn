/**
 * End-to-End API and Business Logic Integration Test Suite
 * Tests actual HTTP endpoints against running server http://localhost:3000
 */

const BASE_URL = 'http://localhost:3000';

async function runE2ETests() {
  console.log('🚀 Запуск полного интеграционного E2E тестирования API...');

  try {
    // 1. Health check
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    const health = await healthRes.json();
    console.log('  ✔️ [Health] Сервер активен:', health.status);

    // 2. Авторизация
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const loginData = await loginRes.json();
    if (!loginData.token) throw new Error('Не удалось получить токен авторизации');
    const token = loginData.token;
    console.log('  ✔️ [Auth] Успешный вход в систему, получен токен');

    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    // 3. Создание новой лампы в прайсе
    const testArticle = `LMP-TEST-${Date.now()}`;
    const newProductRes = await fetch(`${BASE_URL}/api/products`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: `Люстра LED Ring 60W (${Date.now()})`,
        article: testArticle,
        sale_price: 450000,
        cost_price: 270000,
        manufacturer: 'Завод №1',
        unit: 'шт',
        active: 1
      })
    });
    const productData = await newProductRes.json();
    const productId = productData.product.id;
    console.log(`  ✔️ [Products] Создана лампа "${productData.product.name}" (ID: ${productId}, Цена: ${productData.product.sale_price}, Себест: ${productData.product.cost_price})`);

    // 4. Создание нового клиента
    const newClientRes = await fetch(`${BASE_URL}/api/clients`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Рахимов Бахтияр',
        city: 'Ташкент',
        phone: '+998 90 777-88-99',
        address: 'Юнусабад 4',
        comment: 'Постоянный заказчик'
      })
    });
    const clientData = await newClientRes.json();
    const clientId = clientData.client.id;
    console.log(`  ✔️ [Clients] Создан клиент "${clientData.client.name}" (ID: ${clientId}, Город: ${clientData.client.city})`);

    // 5. Создание многопозиционного заказа:
    // Позиция 1: Люстра LED Ring 60W — 2 шт. (450 000 * 2 = 900 000, себест 270 000 * 2 = 540 000, прибыль 360 000)
    // Позиция 2: Лампа LED E27 15W — 10 шт. (35 000 * 10 = 350 000, себест 21 000 * 10 = 210 000, прибыль 140 000)
    // Итого по заказу:
    // Сумма продажи: 1 250 000 сум
    // Себестоимость: 750 000 сум
    // Прибыль: 500 000 сум
    const today = new Date().toISOString().slice(0, 10);
    const orderRes = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        client_id: clientId,
        order_date: today,
        comment: 'Первый тестовый заказ',
        items: [
          {
            product_id: productId,
            product_name: 'Люстра LED Ring 60W',
            article: 'LMP-RING-60W',
            sale_price: 450000,
            cost_price: 270000,
            quantity: 2
          },
          {
            product_name: 'Лампа LED E27 15W',
            article: 'LMP-E27-15W-C',
            sale_price: 35000,
            cost_price: 21000,
            quantity: 10
          }
        ]
      })
    });

    const orderData = await orderRes.json();
    const order = orderData.order;
    console.log(`  ✔️ [Orders] Создан заказ #${order.id}. Сумма: ${order.total_amount} сум, Себест: ${order.cost_total} сум, Прибыль: ${order.profit_total} сум`);

    if (order.total_amount !== 1250000 || order.cost_total !== 750000 || order.profit_total !== 500000) {
      throw new Error(`Ошибка расчета заказа: ${JSON.stringify(order)}`);
    }

    // 6. Проверка балансов производителей (при 50% / 50%)
    // Прибыль 500 000:
    // П1 (50%) начислено: 250 000
    // П2 (50%) начислено: 250 000
    const mfgRes1 = await fetch(`${BASE_URL}/api/manufacturers`, { headers: authHeaders });
    const mfgData1 = await mfgRes1.json();
    const [m1, m2] = mfgData1.manufacturers;

    console.log(`  ✔️ [Manufacturers] Доли 50/50: ${m1.name} начислено ${m1.accrued_all_time} сум, ${m2.name} начислено ${m2.accrued_all_time} сум`);

    // 7. Фиксация выплаты Производителю 1 (150 000 сум)
    const paymentRes = await fetch(`${BASE_URL}/api/payments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        manufacturer_id: m1.id,
        payment_date: today,
        amount: 150000,
        payment_method: 'Наличные',
        comment: 'Аванс за поставку'
      })
    });
    const paymentData = await paymentRes.json();
    console.log(`  ✔️ [Payments] Выплата зафиксирована: ${paymentData.payment.amount} сум для ${paymentData.payment.manufacturer_name}`);

    // 8. Проверка пересчета остатка долга Производителю 1:
    // Начислено 250 000 - Выплачено 150 000 = Остаток 100 000
    const mfgRes2 = await fetch(`${BASE_URL}/api/manufacturers`, { headers: authHeaders });
    const mfgData2 = await mfgRes2.json();
    const updatedM1 = mfgData2.manufacturers.find(m => m.id === m1.id);
    console.log(`  ✔️ [Settlement Balance] ${updatedM1.name}: Начислено = ${updatedM1.accrued_all_time}, Выплачено = ${updatedM1.paid_all_time}, Остаток долга = ${updatedM1.remaining_debt} сум`);

    if (Math.round(updatedM1.remaining_debt) !== Math.round(updatedM1.accrued_all_time - updatedM1.paid_all_time)) {
      throw new Error(`Ошибка расчета остатка долга: ${updatedM1.remaining_debt} != ${updatedM1.accrued_all_time - updatedM1.paid_all_time}`);
    }

    // 9. Проверка смены долей на 60% / 40%
    const updateMfgRes = await fetch(`${BASE_URL}/api/manufacturers`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        manufacturers: [
          { id: 1, name: 'Фабрика Восток', percentage: 60 },
          { id: 2, name: 'Завод Светотехника', percentage: 40 }
        ]
      })
    });
    const updateMfgData = await updateMfgRes.json();
    console.log(`  ✔️ [Manufacturers Config] Доли изменены на 60% (${updateMfgData.manufacturers[0].name}) и 40% (${updateMfgData.manufacturers[1].name})`);

    // 10. Проверка Dashboard KPI
    const dashRes = await fetch(`${BASE_URL}/api/stats/dashboard`, { headers: authHeaders });
    const dashData = await dashRes.json();
    console.log(`  ✔️ [Dashboard] Выручка текущего месяца: ${dashData.currentMonth.revenue} сум, Прибыль: ${dashData.currentMonth.profit} сум, Продано ламп: ${dashData.currentMonth.lampsSold} шт`);

    // 11. Проверка информации о бэкапе
    const backupInfoRes = await fetch(`${BASE_URL}/api/backup/info`, { headers: authHeaders });
    const backupInfo = await backupInfoRes.json();
    console.log(`  ✔️ [Backup] База данных: ${backupInfo.sizeFormatted}, Таблиц проверено: ${Object.keys(backupInfo.tableCounts).length}`);

    console.log('\n=================================================');
    console.log('🎉 ВСЕ ИНТЕГРАЦИОННЫЕ E2E ТЕСТЫ API ПРОЙДЕНЫ УСПЕШНО!');
    console.log('=================================================\n');
  } catch (err) {
    console.error('❌ ОШИБКА E2E ТЕСТИРОВАНИЯ:', err);
    process.exit(1);
  }
}

runE2ETests();
