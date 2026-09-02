import db from '../db.js';
import bcrypt from 'bcryptjs';

async function runUsersTest() {
  console.log('🧪 Тестирование управления пользователями и паролями...');
  await db.initDatabase();

  // 1. Проверяем существующих пользователей
  const users = await db.query('SELECT id, username, full_name, role FROM users');
  console.log('Существующие пользователи:', users.map(u => `${u.username} (${u.role})`));

  // 2. Создаем тестового пользователя
  const testUsername = 'test_manager_' + Date.now();
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync('testpass123', salt);

  const res = await db.run(
    'INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
    [testUsername, hash, 'Тестовый Менеджер', 'manager']
  );
  console.log('✔️ [PASS] Создан пользователь с ID:', res.id);

  // 3. Проверяем его в базе
  const created = await db.get('SELECT * FROM users WHERE id = ?', [res.id]);
  if (created && bcrypt.compareSync('testpass123', created.password_hash)) {
    console.log('✔️ [PASS] Пароль успешно хеширован и верифицирован');
  } else {
    console.error('❌ [FAIL] Ошибка проверки пароля');
    process.exit(1);
  }

  // 4. Обновляем пароль
  const newHash = bcrypt.hashSync('newpassword456', salt);
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, res.id]);
  const updated = await db.get('SELECT * FROM users WHERE id = ?', [res.id]);
  if (updated && bcrypt.compareSync('newpassword456', updated.password_hash)) {
    console.log('✔️ [PASS] Смена пароля работает корректно');
  } else {
    console.error('❌ [FAIL] Ошибка смены пароля');
    process.exit(1);
  }

  // 5. Удаляем тестового пользователя
  await db.run('DELETE FROM users WHERE id = ?', [res.id]);
  const deleted = await db.get('SELECT * FROM users WHERE id = ?', [res.id]);
  if (!deleted) {
    console.log('✔️ [PASS] Пользователь успешно удален');
  } else {
    console.error('❌ [FAIL] Пользователь не был удален');
    process.exit(1);
  }

  console.log('🎉 ВСЕ ТЕСТЫ УПРАВЛЕНИЯ ПОЛЬЗОВАТЕЛЯМИ ПРОЙДЕНЫ!');
}

runUsersTest().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
