import express from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';

const router = express.Router();

// Middleware проверки авторизации
export const requireAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const sessionUser = req.cookies?.user_session || (authHeader && authHeader.replace('Bearer ', ''));
  
  if (!sessionUser) {
    return res.status(401).json({ error: 'Необходима авторизация' });
  }

  try {
    const user = JSON.parse(Buffer.from(sessionUser, 'base64').toString('utf8'));
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Недействительная сессия' });
  }
};

// Вход в систему: Логин + Пароль + Кодовое слово доступа
router.post('/login', async (req, res) => {
  try {
    const { username, password, code_word } = req.body;

    // 1. Проверка обязательных полей
    if (!username || !username.trim()) {
      return res.status(400).json({ error: 'Укажите имя пользователя (логин)' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Укажите пароль' });
    }
    if (!code_word || !code_word.trim()) {
      return res.status(400).json({ error: 'Укажите кодовое слово доступа' });
    }

    // 2. Проверка пользователя в базе
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username.trim()]);
    if (!user) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    // 3. Проверка пароля (bcrypt)
    const isValidPassword = bcrypt.compareSync(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    // 4. Проверка кодового слова доступа (регистронезависимо для кириллицы и латиницы)
    const cleanCodeWord = code_word.trim().toUpperCase();
    const activePasscodes = await db.query(
      'SELECT id, code_word, assigned_to FROM security_passcodes WHERE status = "active"'
    );
    const matchedPasscode = activePasscodes.find(
      p => p.code_word && p.code_word.trim().toUpperCase() === cleanCodeWord
    );

    if (!matchedPasscode) {
      console.warn(`[Security Alert] Отказ во входе для пользователя "${user.username}": неверное кодовое слово «${code_word.trim()}»`);
      return res.status(403).json({
        error: 'Неверное кодовое слово доступа. Проверьте правильность или обратитесь к администратору.'
      });
    }

    // 5. Успешный вход
    const sessionPayload = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      passcode_id: matchedPasscode.id
    };

    const sessionToken = Buffer.from(JSON.stringify(sessionPayload)).toString('base64');

    // Устанавливаем cookie на 30 дней
    res.cookie('user_session', sessionToken, {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/'
    });

    console.log(`✅ Успешный вход пользователя "${user.username}" (кодовое слово: «${matchedPasscode.code_word}» [${matchedPasscode.assigned_to}])`);

    res.json({
      success: true,
      token: sessionToken,
      user: sessionPayload
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Ошибка сервера при авторизации' });
  }
});

// Выход
router.post('/logout', (req, res) => {
  res.clearCookie('user_session', { path: '/' });
  res.json({ success: true, message: 'Успешный выход' });
});

// Получить текущего пользователя
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await db.get('SELECT id, username, full_name, role, created_at FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка получения данных пользователя' });
  }
});

// Смена пароля
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Заполните текущий и новый пароль' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'Новый пароль должен содержать не менее 6 символов' });
    }

    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user || !bcrypt.compareSync(current_password, user.password_hash)) {
      return res.status(400).json({ error: 'Текущий пароль указан неверно' });
    }

    const salt = bcrypt.genSaltSync(10);
    const newHash = bcrypt.hashSync(new_password, salt);
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);

    res.json({ success: true, message: 'Пароль успешно изменен' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Ошибка при смене пароля' });
  }
});

export default router;
