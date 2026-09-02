import express from 'express';
import db from '../db.js';
import { requireAuth } from './auth.js';

const router = express.Router();

// Получить список всех заказов с фильтрацией и поиском
router.get('/', requireAuth, async (req, res) => {
  try {
    const { 
      search, 
      client_id, 
      city, 
      product_id, 
      status, 
      date_from, 
      date_to, 
      month, 
      year,
      sort,
      order
    } = req.query;

    let sql = `
      SELECT 
        o.id,
        o.order_date,
        o.status,
        o.total_amount,
        o.cost_total,
        o.profit_total,
        o.comment,
        o.created_at,
        c.id AS client_id,
        c.name AS client_name,
        c.city AS client_city,
        c.phone AS client_phone,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS items_count,
        (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id) AS total_lamps
      FROM orders o
      JOIN clients c ON c.id = o.client_id
      WHERE 1=1
    `;
    const params = [];

    // Фильтр по статусу (по умолчанию показываем active или все)
    if (status && status !== 'all') {
      sql += ' AND o.status = ?';
      params.push(status);
    }

    if (client_id) {
      sql += ' AND o.client_id = ?';
      params.push(client_id);
    }

    if (city && city.trim()) {
      sql += ' AND c.city = ?';
      params.push(city.trim());
    }

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
      sql += ` AND strftime('%Y-%m', o.order_date) = ?`;
      params.push(`${year}-${padMonth}`);
    } else if (year) {
      sql += ` AND strftime('%Y', o.order_date) = ?`;
      params.push(String(year));
    }

    if (product_id) {
      sql += ' AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.product_id = ?)';
      params.push(product_id);
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      sql += ` AND (
        c.name LIKE ? OR 
        c.city LIKE ? OR 
        c.phone LIKE ? OR 
        CAST(o.id AS TEXT) LIKE ? OR
        EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND (oi.product_name_snapshot LIKE ? OR oi.article_snapshot LIKE ?))
      )`;
      params.push(q, q, q, q, q, q);
    }

    // Сортировка
    const allowedSort = {
      'date': 'o.order_date',
      'id': 'o.id',
      'total': 'o.total_amount',
      'profit': 'o.profit_total',
      'client': 'c.name'
    };
    const sortField = allowedSort[sort] || 'o.order_date';
    const sortDir = (order && order.toUpperCase() === 'ASC') ? 'ASC' : 'DESC';

    sql += ` ORDER BY ${sortField} ${sortDir}, o.id DESC`;

    const orders = await db.query(sql, params);

    // Загружаем позиции заказов для таблицы/списка
    for (const ord of orders) {
      ord.items = await db.query(
        'SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC',
        [ord.id]
      );
    }

    // Расчет общих итогов по отфильтрованному списку
    let totalSales = 0;
    let totalCost = 0;
    let totalProfit = 0;
    let totalLamps = 0;

    orders.forEach(o => {
      if (o.status !== 'cancelled') {
        totalSales += o.total_amount;
        totalCost += o.cost_total;
        totalProfit += o.profit_total;
        totalLamps += o.total_lamps || 0;
      }
    });

    res.json({
      orders,
      summary: {
        totalOrders: orders.filter(o => o.status !== 'cancelled').length,
        totalSales,
        totalCost,
        totalProfit,
        totalLamps
      }
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Ошибка получения списка заказов' });
  }
});

// Получить один заказ по ID со всеми деталями
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const order = await db.get(
      `SELECT o.*, c.name AS client_name, c.city AS client_city, c.phone AS client_phone, c.address AS client_address
       FROM orders o
       JOIN clients c ON c.id = o.client_id
       WHERE o.id = ?`,
      [id]
    );

    if (!order) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }

    const items = await db.query('SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC', [id]);
    order.items = items;

    res.json({ order });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Ошибка получения заказа' });
  }
});

// Создать новый заказ
router.post('/', requireAuth, async (req, res) => {
  try {
    const { client_id, order_date, price_type, update_client_price_type, comment, items } = req.body;

    if (!client_id) {
      return res.status(400).json({ error: 'Выберите клиента' });
    }

    if (!order_date) {
      return res.status(400).json({ error: 'Укажите дату заказа' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Заказ должен содержать хотя бы одну лампу' });
    }

    // Проверяем клиента
    const client = await db.get('SELECT id, price_type FROM clients WHERE id = ?', [client_id]);
    if (!client) {
      return res.status(400).json({ error: 'Указанный клиент не существует' });
    }

    const parsedPriceType = parseInt(price_type, 10);
    const orderPriceType = (parsedPriceType === 1 || parsedPriceType === 2 || parsedPriceType === 3) ? parsedPriceType : (client.price_type || 1);

    // Если запрошено закрепление прайса за клиентом
    if (update_client_price_type) {
      await db.run(
        `UPDATE clients SET price_type = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`,
        [orderPriceType, client_id]
      );
    }

    // Рассчитываем позиции и суммы с защитой от изменения на клиенте
    let orderTotal = 0;
    let orderCostTotal = 0;
    let orderProfitTotal = 0;
    const preparedItems = [];

    for (const item of items) {
      const quantity = parseInt(item.quantity, 10);
      if (isNaN(quantity) || quantity <= 0) {
        return res.status(400).json({ error: 'Количество товара должно быть больше нуля' });
      }

      let productName = item.product_name;
      let article = item.article || null;
      let salePrice = parseFloat(item.sale_price !== undefined ? item.sale_price : item.sale_price_snapshot);
      let costPrice = parseFloat(item.cost_price !== undefined ? item.cost_price : item.cost_price_snapshot);

      // Если передан product_id, берем актуальные данные из прайса (если не переопределены)
      if (item.product_id) {
        const prod = await db.get('SELECT * FROM products WHERE id = ?', [item.product_id]);
        if (prod) {
          if (!productName) productName = prod.name;
          if (!article) article = prod.article;
          if (isNaN(salePrice)) {
            if (orderPriceType === 3) {
              salePrice = prod.sale_price_3 || prod.sale_price_2 || prod.sale_price;
            } else if (orderPriceType === 2) {
              salePrice = prod.sale_price_2 || prod.sale_price;
            } else {
              salePrice = prod.sale_price;
            }
          }
          if (isNaN(costPrice)) {
            if (orderPriceType === 2) {
              costPrice = (prod.cost_price_2 !== undefined && prod.cost_price_2 !== null && prod.cost_price_2 > 0)
                ? prod.cost_price_2
                : prod.cost_price;
            } else {
              costPrice = prod.cost_price;
            }
          }
        }
      }

      if (!productName || isNaN(salePrice) || isNaN(costPrice)) {
        return res.status(400).json({ error: 'Некорректные данные позиции заказа (название, цена или себестоимость)' });
      }

      // Вычисления
      const total = Math.round(salePrice * quantity * 100) / 100;
      const costTotal = Math.round(costPrice * quantity * 100) / 100;
      const profit = Math.round((total - costTotal) * 100) / 100;

      orderTotal += total;
      orderCostTotal += costTotal;
      orderProfitTotal += profit;

      preparedItems.push({
        product_id: item.product_id || null,
        product_name_snapshot: productName,
        article_snapshot: article,
        sale_price_snapshot: salePrice,
        cost_price_snapshot: costPrice,
        quantity,
        total,
        cost_total: costTotal,
        profit
      });
    }

    orderTotal = Math.round(orderTotal * 100) / 100;
    orderCostTotal = Math.round(orderCostTotal * 100) / 100;
    orderProfitTotal = Math.round(orderProfitTotal * 100) / 100;

    const orderStatus = req.body.status && ['in_process', 'shipped', 'completed', 'cancelled', 'active'].includes(req.body.status) 
      ? req.body.status 
      : 'in_process';

    // Вставляем заказ
    const orderResult = await db.run(
      `INSERT INTO orders (client_id, order_date, price_type, status, total_amount, cost_total, profit_total, comment, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))`,
      [client_id, order_date, orderPriceType, orderStatus, orderTotal, orderCostTotal, orderProfitTotal, comment ? comment.trim() : null]
    );

    const orderId = orderResult.id;

    // Вставляем позиции со снапшотами цен
    for (const pi of preparedItems) {
      await db.run(
        `INSERT INTO order_items (order_id, product_id, product_name_snapshot, article_snapshot, sale_price_snapshot, cost_price_snapshot, quantity, total, cost_total, profit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          pi.product_id,
          pi.product_name_snapshot,
          pi.article_snapshot,
          pi.sale_price_snapshot,
          pi.cost_price_snapshot,
          pi.quantity,
          pi.total,
          pi.cost_total,
          pi.profit
        ]
      );
    }

    // Возвращаем созданный заказ
    const createdOrder = await db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
    createdOrder.items = await db.query('SELECT * FROM order_items WHERE order_id = ?', [orderId]);

    res.status(201).json({ success: true, order: createdOrder });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Ошибка при сохранении заказа' });
  }
});

// Редактировать заказ
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { client_id, order_date, price_type, update_client_price_type, status, comment, items } = req.body;

    const existingOrder = await db.get('SELECT * FROM orders WHERE id = ?', [id]);
    if (!existingOrder) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Заказ должен содержать хотя бы одну лампу' });
    }

    const parsedPriceType = parseInt(price_type, 10);
    const orderPriceType = (parsedPriceType === 1 || parsedPriceType === 2 || parsedPriceType === 3) ? parsedPriceType : (existingOrder.price_type || 1);

    const targetClientId = client_id || existingOrder.client_id;
    if (update_client_price_type && targetClientId) {
      await db.run(
        `UPDATE clients SET price_type = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`,
        [orderPriceType, targetClientId]
      );
    }

    let orderTotal = 0;
    let orderCostTotal = 0;
    let orderProfitTotal = 0;
    const preparedItems = [];

    for (const item of items) {
      const quantity = parseInt(item.quantity, 10);
      if (isNaN(quantity) || quantity <= 0) {
        return res.status(400).json({ error: 'Количество товара должно быть больше нуля' });
      }

      let productName = item.product_name_snapshot || item.product_name;
      let article = item.article_snapshot || item.article || null;
      let salePrice = parseFloat(item.sale_price_snapshot !== undefined ? item.sale_price_snapshot : item.sale_price);
      let costPrice = parseFloat(item.cost_price_snapshot !== undefined ? item.cost_price_snapshot : item.cost_price);

      if (item.product_id && (!productName || isNaN(salePrice) || isNaN(costPrice))) {
        const prod = await db.get('SELECT * FROM products WHERE id = ?', [item.product_id]);
        if (prod) {
          if (!productName) productName = prod.name;
          if (!article) article = prod.article;
          if (isNaN(salePrice)) {
            if (orderPriceType === 3) {
              salePrice = prod.sale_price_3 || prod.sale_price_2 || prod.sale_price;
            } else if (orderPriceType === 2) {
              salePrice = prod.sale_price_2 || prod.sale_price;
            } else {
              salePrice = prod.sale_price;
            }
          }
          if (isNaN(costPrice)) {
            if (orderPriceType === 2) {
              costPrice = (prod.cost_price_2 !== undefined && prod.cost_price_2 !== null && prod.cost_price_2 > 0)
                ? prod.cost_price_2
                : prod.cost_price;
            } else {
              costPrice = prod.cost_price;
            }
          }
        }
      }

      const total = Math.round(salePrice * quantity * 100) / 100;
      const costTotal = Math.round(costPrice * quantity * 100) / 100;
      const profit = Math.round((total - costTotal) * 100) / 100;

      orderTotal += total;
      orderCostTotal += costTotal;
      orderProfitTotal += profit;

      preparedItems.push({
        product_id: item.product_id || null,
        product_name_snapshot: productName,
        article_snapshot: article,
        sale_price_snapshot: salePrice,
        cost_price_snapshot: costPrice,
        quantity,
        total,
        cost_total: costTotal,
        profit
      });
    }

    orderTotal = Math.round(orderTotal * 100) / 100;
    orderCostTotal = Math.round(orderCostTotal * 100) / 100;
    orderProfitTotal = Math.round(orderProfitTotal * 100) / 100;

    // Обновляем заказ
    await db.run(
      `UPDATE orders 
       SET client_id = ?, order_date = ?, price_type = ?, status = ?, total_amount = ?, cost_total = ?, profit_total = ?, comment = ?, updated_at = datetime('now', 'localtime')
       WHERE id = ?`,
      [
        targetClientId,
        order_date || existingOrder.order_date,
        orderPriceType,
        status || existingOrder.status,
        orderTotal,
        orderCostTotal,
        orderProfitTotal,
        comment !== undefined ? comment : existingOrder.comment,
        id
      ]
    );

    // Пересоздаем позиции
    await db.run('DELETE FROM order_items WHERE order_id = ?', [id]);

    for (const pi of preparedItems) {
      await db.run(
        `INSERT INTO order_items (order_id, product_id, product_name_snapshot, article_snapshot, sale_price_snapshot, cost_price_snapshot, quantity, total, cost_total, profit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          pi.product_id,
          pi.product_name_snapshot,
          pi.article_snapshot,
          pi.sale_price_snapshot,
          pi.cost_price_snapshot,
          pi.quantity,
          pi.total,
          pi.cost_total,
          pi.profit
        ]
      );
    }

    const updatedOrder = await db.get('SELECT * FROM orders WHERE id = ?', [id]);
    updatedOrder.items = await db.query('SELECT * FROM order_items WHERE order_id = ?', [id]);

    res.json({ success: true, order: updatedOrder });
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ error: 'Ошибка при обновлении заказа' });
  }
});

// Изменить статус заказа
router.patch('/:id/status', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['in_process', 'shipped', 'completed', 'cancelled', 'active'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Неверный статус заказа. Допустимо: in_process, shipped, completed, cancelled' });
    }

    await db.run(
      `UPDATE orders SET status = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`,
      [status, id]
    );

    res.json({ success: true, status });
  } catch (error) {
    console.error('Error changing order status:', error);
    res.status(500).json({ error: 'Ошибка изменения статуса заказа' });
  }
});

// Физическое удаление заказа
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.get('SELECT id FROM orders WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: `Заказ #${id} не найден или уже был удален` });
    }

    // Удаляем позиции и сам заказ
    await db.run('DELETE FROM order_items WHERE order_id = ?', [id]);
    await db.run('DELETE FROM orders WHERE id = ?', [id]);

    res.json({ success: true, message: `Заказ #${id} успешно и безвозвратно удален из базы данных` });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ error: 'Ошибка при удалении заказа: ' + error.message });
  }
});

export default router;
