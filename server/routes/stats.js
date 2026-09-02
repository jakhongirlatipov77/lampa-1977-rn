import express from 'express';
import db from '../db.js';
import { requireAuth } from './auth.js';

const router = express.Router();

// 1. Главная сводка Dashboard
router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = String(today.getMonth() + 1).padStart(2, '0');
    const currentYearMonth = `${currentYear}-${currentMonth}`;

    // KPI за текущий месяц (без дублирования строк от JOIN)
    const monthOrders = await db.get(
      `SELECT 
        COUNT(id) AS orders_count,
        COALESCE(SUM(total_amount), 0) AS revenue,
        COALESCE(SUM(cost_total), 0) AS cost,
        COALESCE(SUM(profit_total), 0) AS profit
       FROM orders
       WHERE status != 'cancelled' AND strftime('%Y-%m', order_date) = ?`,
      [currentYearMonth]
    );

    const monthLamps = await db.get(
      `SELECT COALESCE(SUM(oi.quantity), 0) AS lamps_sold
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status != 'cancelled' AND strftime('%Y-%m', o.order_date) = ?`,
      [currentYearMonth]
    );

    const monthKpi = {
      orders_count: monthOrders ? monthOrders.orders_count : 0,
      revenue: monthOrders ? monthOrders.revenue : 0,
      cost: monthOrders ? monthOrders.cost : 0,
      profit: monthOrders ? monthOrders.profit : 0,
      lamps_sold: monthLamps ? monthLamps.lamps_sold : 0
    };

    // Всего клиентов
    const totalClientsRes = await db.get('SELECT COUNT(*) AS total_clients FROM clients');
    const totalClients = totalClientsRes ? totalClientsRes.total_clients : 0;

    // Всего товаров в каталоге
    const totalProductsRes = await db.get('SELECT COUNT(*) AS total_products FROM products WHERE active = 1');
    const totalProducts = totalProductsRes ? totalProductsRes.total_products : 0;

    // Распределение между производителями (за текущий месяц и за все время)
    const manufacturers = await db.query('SELECT * FROM manufacturers ORDER BY id ASC');
    const mfg1 = manufacturers[0] || { id: 1, name: 'Производитель 1', percentage: 50 };
    const mfg2 = manufacturers[1] || { id: 2, name: 'Производитель 2', percentage: 50 };

    // За все время общая прибыль
    const allProfitRes = await db.get("SELECT COALESCE(SUM(profit_total), 0) AS all_profit FROM orders WHERE status != 'cancelled'");
    const allProfit = allProfitRes ? allProfitRes.all_profit : 0;

    // Выплаты производителям за все время
    const p1All = await db.get('SELECT COALESCE(SUM(amount), 0) AS paid FROM manufacturer_payments WHERE manufacturer_id = ?', [mfg1.id]);
    const p2All = await db.get('SELECT COALESCE(SUM(amount), 0) AS paid FROM manufacturer_payments WHERE manufacturer_id = ?', [mfg2.id]);

    const mfg1AccruedAll = Math.round(allProfit * (mfg1.percentage / 100) * 100) / 100;
    const mfg1PaidAll = p1All ? p1All.paid : 0;
    const mfg1Remaining = Math.round((mfg1AccruedAll - mfg1PaidAll) * 100) / 100;

    const mfg2AccruedAll = Math.round(allProfit * (mfg2.percentage / 100) * 100) / 100;
    const mfg2PaidAll = p2All ? p2All.paid : 0;
    const mfg2Remaining = Math.round((mfg2AccruedAll - mfg2PaidAll) * 100) / 100;

    // График помесячной динамики (последние 12 месяцев)
    const monthlyTrend = await db.query(
      `SELECT 
        strftime('%Y-%m', order_date) AS month,
        COUNT(DISTINCT id) AS orders_count,
        COALESCE(SUM(total_amount), 0) AS revenue,
        COALESCE(SUM(cost_total), 0) AS cost,
        COALESCE(SUM(profit_total), 0) AS profit
       FROM orders
       WHERE status != 'cancelled'
       GROUP BY strftime('%Y-%m', order_date)
       ORDER BY month ASC
       LIMIT 12`
    );

    // Топ-5 ламп по выручке и продажам
    const topProducts = await db.query(
      `SELECT 
        oi.product_name_snapshot AS name,
        SUM(oi.quantity) AS quantity,
        SUM(oi.total) AS total,
        SUM(oi.profit) AS profit
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status != 'cancelled'
       GROUP BY oi.product_name_snapshot
       ORDER BY total DESC
       LIMIT 6`
    );

    // Топ-5 клиентов
    const topClients = await db.query(
      `SELECT 
        c.name,
        c.city,
        COUNT(DISTINCT o.id) AS orders_count,
        SUM(o.total_amount) AS total_spent,
        SUM(o.profit_total) AS profit
       FROM clients c
       JOIN orders o ON o.client_id = c.id
       WHERE o.status != 'cancelled'
       GROUP BY c.id
       ORDER BY total_spent DESC
       LIMIT 6`
    );

    res.json({
      currentMonth: {
        yearMonth: currentYearMonth,
        revenue: monthKpi ? monthKpi.revenue : 0,
        cost: monthKpi ? monthKpi.cost : 0,
        profit: monthKpi ? monthKpi.profit : 0,
        lampsSold: monthKpi ? monthKpi.lamps_sold : 0,
        ordersCount: monthKpi ? monthKpi.orders_count : 0
      },
      counts: {
        totalClients,
        totalProducts
      },
      manufacturers: {
        mfg1: {
          id: mfg1.id,
          name: mfg1.name,
          percentage: mfg1.percentage,
          accrued: mfg1AccruedAll,
          paid: mfg1PaidAll,
          remaining: mfg1Remaining
        },
        mfg2: {
          id: mfg2.id,
          name: mfg2.name,
          percentage: mfg2.percentage,
          accrued: mfg2AccruedAll,
          paid: mfg2PaidAll,
          remaining: mfg2Remaining
        }
      },
      charts: {
        monthlyTrend,
        topProducts,
        topClients
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Ошибка получения статистики дашборда' });
  }
});

// 2. Статистика по клиентам
router.get('/clients', requireAuth, async (req, res) => {
  try {
    const { date_from, date_to, month, year, sort, order } = req.query;

    let sql = `
      SELECT 
        c.id,
        c.name,
        c.city,
        c.phone,
        COUNT(DISTINCT o.id) AS orders_count,
        COALESCE(SUM(oi.quantity), 0) AS lamps_count,
        COALESCE(SUM(oi.total), 0) AS total_spent,
        COALESCE(SUM(oi.cost_total), 0) AS total_cost,
        COALESCE(SUM(oi.profit), 0) AS profit
      FROM clients c
      LEFT JOIN orders o ON o.client_id = c.id AND o.status != 'cancelled'
    `;
    const params = [];

    const whereConditions = [];
    if (date_from) {
      whereConditions.push('o.order_date >= ?');
      params.push(date_from);
    }
    if (date_to) {
      whereConditions.push('o.order_date <= ?');
      params.push(date_to);
    }
    if (month && year) {
      const padMonth = String(month).padStart(2, '0');
      whereConditions.push("strftime('%Y-%m', o.order_date) = ?");
      params.push(`${year}-${padMonth}`);
    } else if (year) {
      whereConditions.push("strftime('%Y', o.order_date) = ?");
      params.push(String(year));
    }

    if (whereConditions.length > 0) {
      sql += ` AND ${whereConditions.join(' AND ')}`;
    }

    sql += ' LEFT JOIN order_items oi ON oi.order_id = o.id GROUP BY c.id';

    // Сортировка: по сумме покупок, прибыли, кол-ву ламп
    const sortMap = {
      'total_spent': 'total_spent',
      'profit': 'profit',
      'lamps_count': 'lamps_count',
      'orders_count': 'orders_count',
      'name': 'c.name',
      'city': 'c.city'
    };

    const sortCol = sortMap[sort] || 'total_spent';
    const sortDir = (order && order.toUpperCase() === 'ASC') ? 'ASC' : 'DESC';

    sql += ` ORDER BY ${sortCol} ${sortDir}`;

    const clientStats = await db.query(sql, params);
    res.json({ clients: clientStats });
  } catch (error) {
    console.error('Error in stats/clients:', error);
    res.status(500).json({ error: 'Ошибка получения статистики по клиентам' });
  }
});

// 3. Статистика по лампам
router.get('/products', requireAuth, async (req, res) => {
  try {
    const { date_from, date_to, month, year, sort, order } = req.query;

    let sql = `
      SELECT 
        COALESCE(p.id, 0) AS product_id,
        oi.product_name_snapshot AS name,
        oi.article_snapshot AS article,
        SUM(oi.quantity) AS quantity_sold,
        SUM(oi.total) AS revenue,
        SUM(oi.cost_total) AS cost,
        SUM(oi.profit) AS profit,
        CASE WHEN SUM(oi.total) > 0 THEN ROUND((SUM(oi.profit) / SUM(oi.total)) * 100, 1) ELSE 0 END AS margin_percent
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE o.status != 'cancelled'
    `;
    const params = [];

    if (date_from) {
      sql += ' AND o.order_date >= ?';
      params.push(date_from);
    }
    if (date_to) {
      sql += ' AND o.order_date <= ?';
      params.push(date_to);
    }
    if (month && year) {
      const padMonth = String(month).padStart(2, '0');
      sql += " AND strftime('%Y-%m', o.order_date) = ?";
      params.push(`${year}-${padMonth}`);
    } else if (year) {
      sql += " AND strftime('%Y', o.order_date) = ?";
      params.push(String(year));
    }

    sql += ' GROUP BY oi.product_name_snapshot, oi.article_snapshot';

    const sortMap = {
      'quantity_sold': 'quantity_sold',
      'revenue': 'revenue',
      'cost': 'cost',
      'profit': 'profit',
      'margin_percent': 'margin_percent',
      'name': 'name'
    };
    const sortCol = sortMap[sort] || 'quantity_sold';
    const sortDir = (order && order.toUpperCase() === 'ASC') ? 'ASC' : 'DESC';

    sql += ` ORDER BY ${sortCol} ${sortDir}`;

    const productStats = await db.query(sql, params);
    res.json({ products: productStats });
  } catch (error) {
    console.error('Error in stats/products:', error);
    res.status(500).json({ error: 'Ошибка получения статистики по лампам' });
  }
});

// 4. Помесячная сводная статистика (с долями производителей и выплатами)
router.get('/months', requireAuth, async (req, res) => {
  try {
    const { year } = req.query;

    const manufacturers = await db.query('SELECT * FROM manufacturers ORDER BY id ASC');
    const mfg1 = manufacturers[0] || { id: 1, name: 'Производитель 1', percentage: 50 };
    const mfg2 = manufacturers[1] || { id: 2, name: 'Производитель 2', percentage: 50 };

    let sql = `
      SELECT 
        strftime('%Y-%m', o.order_date) AS month,
        COUNT(o.id) AS orders_count,
        (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi JOIN orders ord ON ord.id = oi.order_id WHERE ord.status != 'cancelled' AND strftime('%Y-%m', ord.order_date) = strftime('%Y-%m', o.order_date)) AS lamps_sold,
        COALESCE(SUM(o.total_amount), 0) AS revenue,
        COALESCE(SUM(o.cost_total), 0) AS cost,
        COALESCE(SUM(o.profit_total), 0) AS profit
      FROM orders o
      WHERE o.status != 'cancelled'
    `;
    const params = [];

    if (year) {
      sql += " AND strftime('%Y', o.order_date) = ?";
      params.push(String(year));
    }

    sql += " GROUP BY strftime('%Y-%m', o.order_date) ORDER BY month DESC";

    const monthlyData = await db.query(sql, params);

    // Дополняем каждый месяц данными о долях и выплатах
    for (const m of monthlyData) {
      // Доли производителей
      m.mfg1_share = Math.round(m.profit * (mfg1.percentage / 100) * 100) / 100;
      m.mfg2_share = Math.round(m.profit * (mfg2.percentage / 100) * 100) / 100;

      // Выплаты в этом месяце
      const p1 = await db.get(
        "SELECT COALESCE(SUM(amount), 0) AS paid FROM manufacturer_payments WHERE manufacturer_id = ? AND strftime('%Y-%m', payment_date) = ?",
        [mfg1.id, m.month]
      );
      const p2 = await db.get(
        "SELECT COALESCE(SUM(amount), 0) AS paid FROM manufacturer_payments WHERE manufacturer_id = ? AND strftime('%Y-%m', payment_date) = ?",
        [mfg2.id, m.month]
      );

      m.mfg1_paid = p1 ? p1.paid : 0;
      m.mfg2_paid = p2 ? p2.paid : 0;
      m.mfg1_debt = Math.round((m.mfg1_share - m.mfg1_paid) * 100) / 100;
      m.mfg2_debt = Math.round((m.mfg2_share - m.mfg2_paid) * 100) / 100;
    }

    res.json({
      manufacturers: { mfg1, mfg2 },
      months: monthlyData
    });
  } catch (error) {
    console.error('Error in stats/months:', error);
    res.status(500).json({ error: 'Ошибка получения помесячной статистики' });
  }
});

export default router;
