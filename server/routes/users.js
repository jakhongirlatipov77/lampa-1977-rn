import express from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { requireAuth } from './auth.js';

const router = express.Router();

// Проверка прав администратора
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ разрешен только администраторам системы' });
  }
  next();
};

/**
 * GET /api/users
 * Получить список всех пользователей
 */
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await db.query(
      'SELECT id, username, full_name, role, created_at FROM users ORDER BY id ASC'
    );
    res.json({
      success: true,
      users,
      current_user_id: req.user.id
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Ошибка получения списка пользователей' });
  }
});

/**
 * POST /api/users
 * Создать нового пользователя
 */
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, password, full_name, role = 'manager' } = req.body;

    if (!username || !username.trim()) {
      return res.status(400).json({ error: 'Укажите логин пользователя' });
    }

    if (username.trim().length < 3) {
      return res.status(400).json({ error: 'Логин должен содержать не менее 3 символов' });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен содержать не менее 6 символов' });
    }

    const cleanUsername = username.trim();
    const cleanFullName = full_name ? full_name.trim() : cleanUsername;
    const userRole = role === 'admin' ? 'admin' : 'manager';

    // Проверка уникальности логина
    const existing = await db.get(
      'SELECT id FROM users WHERE LOWER(username) = LOWER(?)',
      [cleanUsername]
    );

    if (existing) {
      return res.status(400).json({
        error: `Пользователь с логином «${cleanUsername}» уже существует`
      });
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    const result = await db.run(
      `INSERT INTO users (username, password_hash, full_name, role, created_at) 
       VALUES (?, ?, ?, ?, datetime('now', 'localtime'))`,
      [cleanUsername, passwordHash, cleanFullName, userRole]
    );

    const newUser = await db.get(
      'SELECT id, username, full_name, role, created_at FROM users WHERE id = ?',
      [result.id]
    );

    res.status(201).json({
      success: true,
      message: 'Пользователь успешно создан',
      user: newUser
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Ошибка при создании пользователя' });
  }
});

/**
 * PUT /api/users/:id
 * Редактировать данные пользователя или сменить ему пароль
 */
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, full_name, role, password } = req.body;

    const user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    let nextUsername = user.username;
    if (username !== undefined && username.trim()) {
      nextUsername = username.trim();
      const duplicate = await db.get(
        'SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?',
        [nextUsername, id]
      );
      if (duplicate) {
        return res.status(400).json({
          error: `Пользователь с логином «${nextUsername}» уже существует`
        });
      }
    }

    const nextFullName = full_name !== undefined ? full_name.trim() : user.full_name;
    let nextRole = role !== undefined ? (role === 'admin' ? 'admin' : 'manager') : user.role;

    // Защита: нельзя понизить роль последнего администратора
    if (user.role === 'admin' && nextRole !== 'admin') {
      const remainingAdmins = await db.get(
        'SELECT COUNT(*) as count FROM users WHERE role = "admin" AND id != ?',
        [id]
      );
      if (remainingAdmins.count === 0) {
        return res.status(400).json({
          error: 'Нельзя изменить роль последнего администратора. В системе должен оставаться как минимум один администратор.'
        });
      }
    }

    // Если передан новый пароль
    let nextPasswordHash = user.password_hash;
    if (password && password.trim()) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'Новый пароль должен содержать не менее 6 символов' });
      }
      const salt = bcrypt.genSaltSync(10);
      nextPasswordHash = bcrypt.hashSync(password, salt);
    }

    await db.run(
      `UPDATE users 
       SET username = ?, full_name = ?, role = ?, password_hash = ? 
       WHERE id = ?`,
      [nextUsername, nextFullName, nextRole, nextPasswordHash, id]
    );

    const updated = await db.get(
      'SELECT id, username, full_name, role, created_at FROM users WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Данные пользователя успешно обновлены',
      user: updated
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Ошибка при обновлении пользователя' });
  }
});

/**
 * DELETE /api/users/:id
 * Удалить пользователя
 */
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Защита 1: нельзя удалить самого себя
    if (parseInt(id, 10) === req.user.id) {
      return res.status(400).json({
        error: 'Вы не можете удалить собственную учетную запись во время активного сеанса'
      });
    }

    // Защита 2: нельзя удалить последнего администратора
    if (user.role === 'admin') {
      const remainingAdmins = await db.get(
        'SELECT COUNT(*) as count FROM users WHERE role = "admin" AND id != ?',
        [id]
      );
      if (remainingAdmins.count === 0) {
        return res.status(400).json({
          error: 'Нельзя удалить последнего администратора системы.'
        });
      }
    }

    await db.run('DELETE FROM users WHERE id = ?', [id]);

    res.json({
      success: true,
      message: `Пользователь «${user.username}» успешно удален`
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Ошибка при удалении пользователя' });
  }
});

export default router;
