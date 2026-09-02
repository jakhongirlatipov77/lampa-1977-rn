import express from 'express';
import db from '../db.js';
import { requireAuth } from './auth.js';

const router = express.Router();

// Получить список всех выплат с фильтрами
router.get('/', requireAuth, async (req, res) => {
  try {
    const { manufacturer_id, date_from, date_to, month, year, search } = req.query;

    let sql = `
      SELECT 
        p.*,
        m.name AS manufacturer_name
      FROM manufacturer_payments p
      JOIN manufacturers m ON m.id = p.manufacturer_id
      WHERE 1=1
    `;
    const params = [];

    if (manufacturer_id) {
      sql += ' AND p.manufacturer_id = ?';
      params.push(manufacturer_id);
    }

    if (date_from) {
      sql += ' AND p.payment_date >= ?';
      params.push(date_from);
    }

    if (date_to) {
      sql += ' AND p.payment_date <= ?';
      params.push(date_to);
    }

    if (month && year) {
      const padMonth = String(month).padStart(2, '0');
      sql += ` AND strftime('%Y-%m', p.payment_date) = ?`;
      params.push(`${year}-${padMonth}`);
    } else if (year) {
      sql += ` AND strftime('%Y', p.payment_date) = ?`;
      params.push(String(year));
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      sql += ' AND (m.name LIKE ? OR p.payment_method LIKE ? OR p.comment LIKE ?)';
      params.push(q, q, q);
    }

    sql += ' ORDER BY p.payment_date DESC, p.id DESC';

    const payments = await db.query(sql, params);

    // Подсчет общей суммы выплат
    const totalAmount = payments.reduce((acc, p) => acc + p.amount, 0);

    res.json({
      payments,
      totalAmount
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Ошибка получения списка выплат' });
  }
});

// Добавить выплату
router.post('/', requireAuth, async (req, res) => {
  try {
    const { manufacturer_id, payment_date, amount, payment_method, comment } = req.body;

    if (!manufacturer_id) {
      return res.status(400).json({ error: 'Выберите производителя' });
    }

    if (!payment_date) {
      return res.status(400).json({ error: 'Укажите дату выплаты' });
    }

    const payAmount = parseFloat(amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      return res.status(400).json({ error: 'Сумма выплаты должна быть больше нуля' });
    }

    const mfg = await db.get('SELECT id FROM manufacturers WHERE id = ?', [manufacturer_id]);
    if (!mfg) {
      return res.status(400).json({ error: 'Производитель не найден' });
    }

    const result = await db.run(
      `INSERT INTO manufacturer_payments (manufacturer_id, payment_date, amount, payment_method, comment, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
      [
        manufacturer_id,
        payment_date,
        payAmount,
        payment_method ? payment_method.trim() : 'Наличные',
        comment ? comment.trim() : null
      ]
    );

    const newPayment = await db.get(
      `SELECT p.*, m.name AS manufacturer_name 
       FROM manufacturer_payments p 
       JOIN manufacturers m ON m.id = p.manufacturer_id 
       WHERE p.id = ?`,
      [result.id]
    );

    res.status(201).json({ success: true, payment: newPayment });
  } catch (error) {
    console.error('Error creating payment:', error);
    res.status(500).json({ error: 'Ошибка при сохранении выплаты' });
  }
});

// Редактировать выплату
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { manufacturer_id, payment_date, amount, payment_method, comment } = req.body;

    const payAmount = parseFloat(amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      return res.status(400).json({ error: 'Сумма выплаты должна быть больше нуля' });
    }

    await db.run(
      `UPDATE manufacturer_payments 
       SET manufacturer_id = ?, payment_date = ?, amount = ?, payment_method = ?, comment = ?
       WHERE id = ?`,
      [
        manufacturer_id,
        payment_date,
        payAmount,
        payment_method ? payment_method.trim() : 'Наличные',
        comment ? comment.trim() : null,
        id
      ]
    );

    const updated = await db.get(
      `SELECT p.*, m.name AS manufacturer_name 
       FROM manufacturer_payments p 
       JOIN manufacturers m ON m.id = p.manufacturer_id 
       WHERE p.id = ?`,
      [id]
    );

    res.json({ success: true, payment: updated });
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({ error: 'Ошибка обновления выплаты' });
  }
});

// Удалить выплату
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await db.run('DELETE FROM manufacturer_payments WHERE id = ?', [id]);
    res.json({ success: true, message: 'Выплата успешно удалена' });
  } catch (error) {
    console.error('Error deleting payment:', error);
    res.status(500).json({ error: 'Ошибка при удалении выплаты' });
  }
});

export default router;
