import express from 'express';
import XLSX from 'xlsx';
import db from '../db.js';
import { requireAuth } from './auth.js';

const router = express.Router();

// 1. Экспорт заказов (Excel / CSV)
router.get('/orders', requireAuth, async (req, res) => {
  try {
    const { format = 'xlsx', status } = req.query;

    let sql = `
      SELECT 
        o.id AS 'Номер заказа',
        o.order_date AS 'Дата',
        c.name AS 'Клиент',
        c.city AS 'Город',
        c.phone AS 'Телефон',
        o.status AS 'Статус',
        o.total_amount AS 'Сумма продажи',
        o.cost_total AS 'Себестоимость',
        o.profit_total AS 'Прибыль',
        o.comment AS 'Комментарий'
      FROM orders o
      JOIN clients c ON c.id = o.client_id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') {
      sql += ' AND o.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY o.order_date DESC, o.id DESC';

    const orders = await db.query(sql, params);

    // Добавляем перечень позиций строкой для удобства
    for (const ord of orders) {
      const items = await db.query(
        'SELECT product_name_snapshot, quantity, sale_price_snapshot, total, profit FROM order_items WHERE order_id = ?',
        [ord['Номер заказа']]
      );
      ord['Состав заказа'] = items.map(i => `${i.product_name_snapshot} (${i.quantity} шт. x ${i.sale_price_snapshot})`).join('; ');
      ord['Всего ламп (шт)'] = items.reduce((sum, i) => sum + i.quantity, 0);
      ord['Статус'] = ord['Статус'] === 'active' ? 'Активен' : 'Отменен';
    }

    const ws = XLSX.utils.json_to_sheet(orders);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Заказы');

    if (format === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(ws);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=orders_${Date.now()}.csv`);
      return res.send('\uFEFF' + csv); // UTF-8 BOM для корректного открытия в Excel
    }

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=orders_${Date.now()}.xlsx`);
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting orders:', error);
    res.status(500).json({ error: 'Ошибка экспорта заказов' });
  }
});

// 2. Экспорт клиентов
router.get('/clients', requireAuth, async (req, res) => {
  try {
    const { format = 'xlsx' } = req.query;

    const sql = `
      SELECT 
        c.id AS 'ID',
        c.name AS 'ФИО',
        c.city AS 'Город',
        c.phone AS 'Телефон',
        c.address AS 'Адрес',
        CASE 
          WHEN c.price_type = 3 THEN 'Прайс 3 (Иностранный)'
          WHEN c.price_type = 2 THEN 'Прайс 2 (Опт)'
          ELSE 'Прайс 1 (Розница)'
        END AS 'Прайс-лист',
        COUNT(DISTINCT CASE WHEN o.status != 'cancelled' THEN o.id END) AS 'Кол-во заказов',
        COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN oi.quantity ELSE 0 END), 0) AS 'Куплено ламп (шт)',
        COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN oi.total ELSE 0 END), 0) AS 'Сумма покупок',
        COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN oi.cost_total ELSE 0 END), 0) AS 'Себестоимость',
        COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN oi.profit ELSE 0 END), 0) AS 'Прибыль',
        c.created_at AS 'Дата добавления',
        c.comment AS 'Комментарий'
      FROM clients c
      LEFT JOIN orders o ON o.client_id = c.id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      GROUP BY c.id
      ORDER BY 'Сумма покупок' DESC
    `;

    const clients = await db.query(sql);

    const ws = XLSX.utils.json_to_sheet(clients);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Клиенты');

    if (format === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(ws);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=clients_${Date.now()}.csv`);
      return res.send('\uFEFF' + csv);
    }

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=clients_${Date.now()}.xlsx`);
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting clients:', error);
    res.status(500).json({ error: 'Ошибка экспорта клиентов' });
  }
});

// 3. Экспорт прайс-листа ламп
router.get('/products', requireAuth, async (req, res) => {
  try {
    const { format = 'xlsx' } = req.query;

    const sql = `
      SELECT 
        id AS 'ID',
        name AS 'Наименование лампы',
        article AS 'Артикул',
        sale_price AS 'Цена: Прайс 1 (Розница)',
        cost_price AS 'Себестоимость 1 (Розница/Иностр)',
        (sale_price - cost_price) AS 'Маржа 1 (сум)',
        COALESCE(sale_price_2, sale_price) AS 'Цена: Прайс 2 (Опт)',
        COALESCE(cost_price_2, cost_price) AS 'Себестоимость 2 (Опт)',
        (COALESCE(sale_price_2, sale_price) - COALESCE(cost_price_2, cost_price)) AS 'Маржа 2 (сум)',
        COALESCE(sale_price_3, sale_price_2, sale_price) AS 'Цена: Прайс 3 (Иностранный)',
        (COALESCE(sale_price_3, sale_price_2, sale_price) - cost_price) AS 'Маржа 3 (сум)',
        unit AS 'Ед. изм.',
        CASE WHEN active = 1 THEN 'Активна' ELSE 'В архиве' END AS 'Статус'
      FROM products
      ORDER BY name ASC
    `;

    const products = await db.query(sql);

    const ws = XLSX.utils.json_to_sheet(products);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Прайс-лист');

    if (format === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(ws);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=price_list_${Date.now()}.csv`);
      return res.send('\uFEFF' + csv);
    }

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=price_list_${Date.now()}.xlsx`);
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting products:', error);
    res.status(500).json({ error: 'Ошибка экспорта прайса' });
  }
});

// 4. Экспорт помесячной аналитики
router.get('/monthly-stats', requireAuth, async (req, res) => {
  try {
    const { format = 'xlsx', year } = req.query;

    const manufacturers = await db.query('SELECT * FROM manufacturers ORDER BY id ASC');
    const mfg1 = manufacturers[0] || { id: 1, name: 'Производитель 1', percentage: 50 };
    const mfg2 = manufacturers[1] || { id: 2, name: 'Производитель 2', percentage: 50 };

    let sql = `
      SELECT 
        strftime('%Y-%m', o.order_date) AS 'Месяц',
        COUNT(o.id) AS 'Кол-во заказов',
        (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi JOIN orders ord ON ord.id = oi.order_id WHERE ord.status != 'cancelled' AND strftime('%Y-%m', ord.order_date) = strftime('%Y-%m', o.order_date)) AS 'Продано ламп (шт)',
        COALESCE(SUM(o.total_amount), 0) AS 'Выручка',
        COALESCE(SUM(o.cost_total), 0) AS 'Себестоимость',
        COALESCE(SUM(o.profit_total), 0) AS 'Прибыль'
      FROM orders o
      WHERE o.status != 'cancelled'
    `;
    const params = [];

    if (year) {
      sql += " AND strftime('%Y', o.order_date) = ?";
      params.push(String(year));
    }

    sql += " GROUP BY strftime('%Y-%m', o.order_date) ORDER BY 'Месяц' DESC";

    const monthlyData = await db.query(sql, params);

    for (const m of monthlyData) {
      const profit = m['Прибыль'];
      const p1Share = Math.round(profit * (mfg1.percentage / 100) * 100) / 100;
      const p2Share = Math.round(profit * (mfg2.percentage / 100) * 100) / 100;

      const p1 = await db.get(
        "SELECT COALESCE(SUM(amount), 0) AS paid FROM manufacturer_payments WHERE manufacturer_id = ? AND strftime('%Y-%m', payment_date) = ?",
        [mfg1.id, m['Месяц']]
      );
      const p2 = await db.get(
        "SELECT COALESCE(SUM(amount), 0) AS paid FROM manufacturer_payments WHERE manufacturer_id = ? AND strftime('%Y-%m', payment_date) = ?",
        [mfg2.id, m['Месяц']]
      );

      const p1Paid = p1 ? p1.paid : 0;
      const p2Paid = p2 ? p2.paid : 0;

      m[`Доля ${mfg1.name} (${mfg1.percentage}%)`] = p1Share;
      m[`Выплачено ${mfg1.name}`] = p1Paid;
      m[`Остаток ${mfg1.name}`] = Math.round((p1Share - p1Paid) * 100) / 100;

      m[`Доля ${mfg2.name} (${mfg2.percentage}%)`] = p2Share;
      m[`Выплачено ${mfg2.name}`] = p2Paid;
      m[`Остаток ${mfg2.name}`] = Math.round((p2Share - p2Paid) * 100) / 100;
    }

    const ws = XLSX.utils.json_to_sheet(monthlyData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Помесячная статистика');

    if (format === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(ws);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=monthly_stats_${Date.now()}.csv`);
      return res.send('\uFEFF' + csv);
    }

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=monthly_stats_${Date.now()}.xlsx`);
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting monthly stats:', error);
    res.status(500).json({ error: 'Ошибка экспорта статистики' });
  }
});

// 5. Экспорт выплат производителям
router.get('/payments', requireAuth, async (req, res) => {
  try {
    const { format = 'xlsx' } = req.query;

    const sql = `
      SELECT 
        p.id AS 'ID',
        p.payment_date AS 'Дата выплаты',
        m.name AS 'Производитель',
        p.amount AS 'Сумма выплаты',
        p.payment_method AS 'Способ оплаты',
        p.comment AS 'Комментарий',
        p.created_at AS 'Дата внесения'
      FROM manufacturer_payments p
      JOIN manufacturers m ON m.id = p.manufacturer_id
      ORDER BY p.payment_date DESC
    `;

    const payments = await db.query(sql);

    const ws = XLSX.utils.json_to_sheet(payments);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Выплаты');

    if (format === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(ws);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=payments_${Date.now()}.csv`);
      return res.send('\uFEFF' + csv);
    }

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=payments_${Date.now()}.xlsx`);
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting payments:', error);
    res.status(500).json({ error: 'Ошибка экспорта выплат' });
  }
});

export default router;
