import express from 'express';
import db from '../db.js';
import { requireAuth } from './auth.js';

const router = express.Router();

// Middleware для проверки прав администратора
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ разрешен только администраторам системы' });
  }
  next();
};

/**
 * GET /api/passcodes
 * Получить список всех кодовых слов доступа
 */
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const passcodes = await db.query(
      'SELECT id, code_word, assigned_to, status, created_at, updated_at FROM security_passcodes ORDER BY id ASC'
    );
    res.json({
      success: true,
      passcodes
    });
  } catch (error) {
    console.error('Error fetching passcodes:', error);
    res.status(500).json({ error: 'Ошибка получения списка кодовых слов' });
  }
});

/**
 * POST /api/passcodes
 * Добавить новое кодовое слово
 */
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { code_word, assigned_to, status = 'active' } = req.body;

    if (!code_word || !code_word.trim()) {
      return res.status(400).json({ error: 'Укажите кодовое слово' });
    }

    if (!assigned_to || !assigned_to.trim()) {
      return res.status(400).json({ error: 'Укажите, кому выдано кодовое слово (название устройства или имя сотрудника)' });
    }

    const cleanWord = code_word.trim();
    const cleanAssigned = assigned_to.trim();
    const cleanStatus = status === 'blocked' ? 'blocked' : 'active';

    const allPasscodes = await db.query('SELECT id, code_word FROM security_passcodes');
    const existing = allPasscodes.find(p => p.code_word && p.code_word.trim().toUpperCase() === cleanWord.toUpperCase());

    if (existing) {
      return res.status(400).json({
        error: `Кодовое слово «${cleanWord}» уже существует в системе`
      });
    }

    const result = await db.run(
      `INSERT INTO security_passcodes (code_word, assigned_to, status, created_at, updated_at) 
       VALUES (?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))`,
      [cleanWord, cleanAssigned, cleanStatus]
    );

    const newPasscode = await db.get('SELECT * FROM security_passcodes WHERE id = ?', [result.id]);

    res.status(201).json({
      success: true,
      message: 'Кодовое слово успешно добавлено',
      passcode: newPasscode
    });
  } catch (error) {
    console.error('Error adding passcode:', error);
    res.status(500).json({ error: 'Ошибка при сохранении кодового слова' });
  }
});

/**
 * PUT /api/passcodes/:id
 * Редактировать кодовое слово или изменить статус (Активно / Заблокировано)
 */
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { code_word, assigned_to, status } = req.body;

    const passcode = await db.get('SELECT * FROM security_passcodes WHERE id = ?', [id]);
    if (!passcode) {
      return res.status(404).json({ error: 'Кодовое слово не найдено' });
    }

    let nextWord = passcode.code_word;
    if (code_word !== undefined) {
      if (!code_word.trim()) {
        return res.status(400).json({ error: 'Кодовое слово не может быть пустым' });
      }
      nextWord = code_word.trim();
      const allPasscodes = await db.query('SELECT id, code_word FROM security_passcodes WHERE id != ?', [id]);
      const duplicate = allPasscodes.find(p => p.code_word && p.code_word.trim().toUpperCase() === nextWord.toUpperCase());
      if (duplicate) {
        return res.status(400).json({
          error: `Кодовое слово «${nextWord}» уже занято`
        });
      }
    }

    let nextAssigned = passcode.assigned_to;
    if (assigned_to !== undefined) {
      if (!assigned_to.trim()) {
        return res.status(400).json({ error: 'Укажите, кому выдано кодовое слово' });
      }
      nextAssigned = assigned_to.trim();
    }

    let nextStatus = passcode.status;
    if (status !== undefined) {
      nextStatus = status === 'blocked' ? 'blocked' : 'active';
      
      // Защита: нельзя заблокировать последнее активное кодовое слово
      if (nextStatus === 'blocked' && passcode.status === 'active') {
        const remainingActive = await db.get(
          'SELECT COUNT(*) as count FROM security_passcodes WHERE status = "active" AND id != ?',
          [id]
        );
        if (remainingActive.count === 0) {
          return res.status(400).json({
            error: 'Невозможно заблокировать последнее активное кодовое слово. В системе должно оставаться как минимум одно рабочее кодовое слово для входа.'
          });
        }
      }
    }

    await db.run(
      `UPDATE security_passcodes 
       SET code_word = ?, assigned_to = ?, status = ?, updated_at = datetime('now', 'localtime') 
       WHERE id = ?`,
      [nextWord, nextAssigned, nextStatus, id]
    );

    const updated = await db.get('SELECT * FROM security_passcodes WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Кодовое слово успешно обновлено',
      passcode: updated
    });
  } catch (error) {
    console.error('Error updating passcode:', error);
    res.status(500).json({ error: 'Ошибка при обновлении кодового слова' });
  }
});

/**
 * DELETE /api/passcodes/:id
 * Удалить кодовое слово
 */
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const passcode = await db.get('SELECT * FROM security_passcodes WHERE id = ?', [id]);
    if (!passcode) {
      return res.status(404).json({ error: 'Кодовое слово не найдено' });
    }

    // Защита: нельзя удалить последнее активное кодовое слово
    if (passcode.status === 'active') {
      const remainingActive = await db.get(
        'SELECT COUNT(*) as count FROM security_passcodes WHERE status = "active" AND id != ?',
        [id]
      );
      if (remainingActive.count === 0) {
        return res.status(400).json({
          error: 'Невозможно удалить последнее активное кодовое слово. В системе должно оставаться как минимум одно рабочее кодовое слово для входа.'
        });
      }
    }

    await db.run('DELETE FROM security_passcodes WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Кодовое слово успешно удалено'
    });
  } catch (error) {
    console.error('Error deleting passcode:', error);
    res.status(500).json({ error: 'Ошибка при удалении кодового слова' });
  }
});

export default router;
