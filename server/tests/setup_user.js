import bcrypt from 'bcryptjs';
import db from '../db.js';

async function setupUser() {
  const username = 'ruslatna';
  const password = '21177@RuS';
  const fullName = 'Руслан';
  const role = 'admin';

  const existing = await db.get('SELECT * FROM users WHERE username = ?', [username]);
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(password, salt);

  if (existing) {
    await db.run('UPDATE users SET password_hash = ?, full_name = ?, role = ? WHERE username = ?', [hash, fullName, role, username]);
    console.log(`✅ Пользователь ${username} успешно обновлен с новым паролем!`);
  } else {
    await db.run('INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)', [username, hash, fullName, role]);
    console.log(`✅ Создан пользователь ${username} с указанным паролем!`);
  }
}

setupUser().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
