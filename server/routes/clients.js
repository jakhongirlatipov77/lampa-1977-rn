import express from 'express';
import db from '../db.js';
import { requireAuth } from './auth.js';

const router = express.Router();

// Получить список всех клиентов со сводной статистикой
router.get('/', requireAuth, async (req, res) => {
  try {
    const { search, city, sort, order } = req.query;
    
    let sql = `
      SELECT 
        c.*,
        COUNT(DISTINCT CASE WHEN o.status != 'cancelled' THEN o.id END) AS orders_count,
        COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN oi.quantity ELSE 0 END), 0) AS total_lamps,
        COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN oi.total ELSE 0 END), 0) AS total_spent,
        COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN oi.cost_total ELSE 0 END), 0) AS total_cost,
        COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN oi.profit ELSE 0 END), 0) AS total_profit
      FROM clients c
      LEFT JOIN orders o ON o.client_id = c.id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE 1=1
    `;
    const params = [];

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      sql += ' AND (c.name LIKE ? OR c.phone LIKE ? OR c.address LIKE ? OR c.comment LIKE ?)';
      params.push(q, q, q, q);
    }

    if (city && city.trim()) {
      sql += ' AND c.city = ?';
      params.push(city.trim());
    }

    sql += ' GROUP BY c.id';

    // Сортировка
    const allowedSort = {
      'name': 'c.name',
      'city': 'c.city',
      'created_at': 'c.created_at',
      'total_spent': 'total_spent',
      'total_profit': 'total_profit',
      'total_lamps': 'total_lamps',
      'orders_count': 'orders_count'
    };

    const sortField = allowedSort[sort] || 'c.name';
    const sortDir = (order && order.toUpperCase() === 'DESC') ? 'DESC' : 'ASC';

    sql += ` ORDER BY ${sortField} ${sortDir}`;

    const clients = await db.query(sql, params);
    res.json({ clients });
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: 'Ошибка получения списка клиентов' });
  }
});

// Получить одного клиента со статистикой и историей заказов
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const client = await db.get('SELECT * FROM clients WHERE id = ?', [id]);
    if (!client) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }

    // История заказов клиента
    const orders = await db.query(
      `SELECT o.*, 
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS items_count,
        (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id) AS total_lamps_in_order
       FROM orders o 
       WHERE o.client_id = ? 
       ORDER BY o.order_date DESC, o.id DESC`,
      [id]
    );

    // Загружаем позиции каждого заказа
    for (const ord of orders) {
      ord.items = await db.query('SELECT * FROM order_items WHERE order_id = ?', [ord.id]);
    }

    // Сводка по клиенту
    const stats = await db.get(
      `SELECT 
        COUNT(DISTINCT CASE WHEN o.status != 'cancelled' THEN o.id END) AS orders_count,
        COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN oi.quantity ELSE 0 END), 0) AS total_lamps,
        COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN oi.total ELSE 0 END), 0) AS total_spent,
        COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN oi.cost_total ELSE 0 END), 0) AS total_cost,
        COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN oi.profit ELSE 0 END), 0) AS total_profit
      FROM clients c
      LEFT JOIN orders o ON o.client_id = c.id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE c.id = ?`,
      [id]
    );

    res.json({ client, orders, stats });
  } catch (error) {
    console.error('Error fetching client details:', error);
    res.status(500).json({ error: 'Ошибка получения информации о клиенте' });
  }
});

// Создать клиента
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, city, phone, address, price_type, comment } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Укажите ФИО клиента' });
    }
    if (!city || !city.trim()) {
      return res.status(400).json({ error: 'Укажите город клиента' });
    }

    const parsedPt = parseInt(price_type, 10);
    const priceType = [1, 2, 3].includes(parsedPt) ? parsedPt : 1;

    const result = await db.run(
      `INSERT INTO clients (name, city, phone, address, price_type, comment, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))`,
      [
        name.trim(),
        city.trim(),
        phone ? phone.trim() : null,
        address ? address.trim() : null,
        priceType,
        comment ? comment.trim() : null
      ]
    );

    const newClient = await db.get('SELECT * FROM clients WHERE id = ?', [result.id]);
    res.status(201).json({ success: true, client: newClient });
  } catch (error) {
    console.error('Error creating client:', error);
    res.status(500).json({ error: 'Ошибка при сохранении клиента' });
  }
});

// Обновить клиента
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { name, city, phone, address, price_type, comment } = req.body;
    const { id } = req.params;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Укажите ФИО клиента' });
    }
    if (!city || !city.trim()) {
      return res.status(400).json({ error: 'Укажите город клиента' });
    }

    const parsedPt = parseInt(price_type, 10);
    const priceType = [1, 2, 3].includes(parsedPt) ? parsedPt : 1;

    await db.run(
      `UPDATE clients 
       SET name = ?, city = ?, phone = ?, address = ?, price_type = ?, comment = ?, updated_at = datetime('now', 'localtime')
       WHERE id = ?`,
      [
        name.trim(),
        city.trim(),
        phone ? phone.trim() : null,
        address ? address.trim() : null,
        priceType,
        comment ? comment.trim() : null,
        id
      ]
    );

    const updatedClient = await db.get('SELECT * FROM clients WHERE id = ?', [id]);
    res.json({ success: true, client: updatedClient });
  } catch (error) {
    console.error('Error updating client:', error);
    res.status(500).json({ error: 'Ошибка обновления данных клиента' });
  }
});

// Быстро изменить прайс-лист клиента (1: Розница, 2: Опт, 3: Full)
router.patch('/:id/price-type', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { price_type } = req.body;
    const parsedPt = parseInt(price_type, 10);
    const priceType = [1, 2, 3].includes(parsedPt) ? parsedPt : 1;

    const client = await db.get('SELECT * FROM clients WHERE id = ?', [id]);
    if (!client) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }

    await db.run(
      `UPDATE clients SET price_type = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`,
      [priceType, id]
    );

    const updatedClient = await db.get('SELECT * FROM clients WHERE id = ?', [id]);
    res.json({ success: true, client: updatedClient });
  } catch (error) {
    console.error('Error updating client price type:', error);
    res.status(500).json({ error: 'Ошибка при изменении прайса клиента' });
  }
});

// Удалить клиента
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const ordersCount = await db.get('SELECT COUNT(*) as count FROM orders WHERE client_id = ?', [id]);
    if (ordersCount.count > 0) {
      return res.status(400).json({ 
        error: `Нельзя удалить клиента: у него есть ${ordersCount.count} оформленных заказов. Вы можете изменить данные клиента или удалить/отменить его заказы.` 
      });
    }

    await db.run('DELETE FROM clients WHERE id = ?', [id]);
    res.json({ success: true, message: 'Клиент успешно удален' });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при удалении клиента' });
  }
});

export default router;
