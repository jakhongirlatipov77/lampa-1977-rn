import express from 'express';
import db from '../db.js';
import { requireAuth } from './auth.js';

const router = express.Router();

// Получить список всех ламп
router.get('/', requireAuth, async (req, res) => {
  try {
    const { search, active, sort, order } = req.query;
    let sql = 'SELECT * FROM products WHERE 1=1';
    const params = [];

    if (active !== undefined && active !== '') {
      sql += ' AND active = ?';
      params.push(parseInt(active, 10));
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      sql += ' AND (name LIKE ? OR article LIKE ? OR manufacturer LIKE ?)';
      params.push(q, q, q);
    }

    // Сортировка
    const allowedSortCols = ['id', 'name', 'article', 'sale_price', 'sale_price_2', 'sale_price_3', 'cost_price', 'cost_price_2', 'manufacturer', 'active', 'created_at'];
    const sortCol = allowedSortCols.includes(sort) ? sort : 'name';
    const sortDir = (order && order.toUpperCase() === 'DESC') ? 'DESC' : 'ASC';

    sql += ` ORDER BY ${sortCol} ${sortDir}`;

    const products = await db.query(sql, params);
    res.json({ products });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Ошибка получения списка ламп' });
  }
});

// Получить лампу по ID
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const product = await db.get('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!product) {
      return res.status(404).json({ error: 'Лампа не найдена' });
    }
    res.json({ product });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка получения лампы' });
  }
});

// Добавить новую лампу
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, article, sale_price, sale_price_2, sale_price_3, cost_price, cost_price_2, manufacturer, unit, active } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Укажите наименование лампы' });
    }

    const sPrice = parseFloat(sale_price) || 0;
    const sPrice2 = parseFloat(sale_price_2 !== undefined ? sale_price_2 : sale_price) || 0;
    const sPrice3 = parseFloat(sale_price_3 !== undefined ? sale_price_3 : (sale_price_2 !== undefined ? sale_price_2 : sale_price)) || 0;
    const cPrice = parseFloat(cost_price) || 0;
    const cPrice2 = parseFloat(cost_price_2 !== undefined ? cost_price_2 : cost_price) || 0;

    if (sPrice < 0 || sPrice2 < 0 || sPrice3 < 0 || cPrice < 0 || cPrice2 < 0) {
      return res.status(400).json({ error: 'Цены и себестоимость не могут быть отрицательными' });
    }

    const result = await db.run(
      `INSERT INTO products (name, article, sale_price, sale_price_2, sale_price_3, cost_price, cost_price_2, manufacturer, unit, active, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))`,
      [
        name.trim(),
        article ? article.trim() : null,
        sPrice,
        sPrice2,
        sPrice3,
        cPrice,
        cPrice2,
        manufacturer ? manufacturer.trim() : null,
        unit ? unit.trim() : 'шт',
        active !== undefined ? (active ? 1 : 0) : 1
      ]
    );

    const newProduct = await db.get('SELECT * FROM products WHERE id = ?', [result.id]);
    res.status(201).json({ success: true, product: newProduct });
  } catch (error) {
    if (error.message && error.message.includes('UNIQUE constraint failed: products.article')) {
      return res.status(400).json({ error: 'Лампа с таким артикулом уже существует' });
    }
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Ошибка при сохранении лампы' });
  }
});

// Обновить лампу
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { name, article, sale_price, sale_price_2, sale_price_3, cost_price, cost_price_2, manufacturer, unit, active } = req.body;
    const { id } = req.params;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Укажите наименование лампы' });
    }

    const sPrice = parseFloat(sale_price) || 0;
    const sPrice2 = parseFloat(sale_price_2 !== undefined ? sale_price_2 : sale_price) || 0;
    const sPrice3 = parseFloat(sale_price_3 !== undefined ? sale_price_3 : (sale_price_2 !== undefined ? sale_price_2 : sale_price)) || 0;
    const cPrice = parseFloat(cost_price) || 0;
    const cPrice2 = parseFloat(cost_price_2 !== undefined ? cost_price_2 : cost_price) || 0;

    await db.run(
      `UPDATE products 
       SET name = ?, article = ?, sale_price = ?, sale_price_2 = ?, sale_price_3 = ?, cost_price = ?, cost_price_2 = ?, manufacturer = ?, unit = ?, active = ?, updated_at = datetime('now', 'localtime')
       WHERE id = ?`,
      [
        name.trim(),
        article ? article.trim() : null,
        sPrice,
        sPrice2,
        sPrice3,
        cPrice,
        cPrice2,
        manufacturer ? manufacturer.trim() : null,
        unit ? unit.trim() : 'шт',
        active !== undefined ? (active ? 1 : 0) : 1,
        id
      ]
    );

    const updatedProduct = await db.get('SELECT * FROM products WHERE id = ?', [id]);
    res.json({ success: true, product: updatedProduct });
  } catch (error) {
    if (error.message && error.message.includes('UNIQUE constraint failed: products.article')) {
      return res.status(400).json({ error: 'Лампа с таким артикулом уже существует' });
    }
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Ошибка при обновлении лампы' });
  }
});

// Переключить активность (активна / неактивна)
router.patch('/:id/toggle-active', requireAuth, async (req, res) => {
  try {
    const product = await db.get('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!product) {
      return res.status(404).json({ error: 'Лампа не найдена' });
    }

    const newActive = product.active === 1 ? 0 : 1;
    await db.run('UPDATE products SET active = ?, updated_at = datetime("now", "localtime") WHERE id = ?', [newActive, product.id]);

    res.json({ success: true, active: newActive });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка изменения статуса лампы' });
  }
});

// Удалить лампу (если нет в заказах) или деактивировать
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    // Проверяем наличие в заказах
    const inOrders = await db.get('SELECT COUNT(*) as count FROM order_items WHERE product_id = ?', [id]);
    if (inOrders.count > 0) {
      // Деактивируем вместо физического удаления для сохранения истории
      await db.run('UPDATE products SET active = 0, updated_at = datetime("now", "localtime") WHERE id = ?', [id]);
      return res.json({ success: true, message: 'Лампа перенесена в архив (деактивирована), так как есть в истории заказов', archived: true });
    }

    await db.run('DELETE FROM products WHERE id = ?', [id]);
    res.json({ success: true, message: 'Лампа успешно удалена' });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при удалении лампы' });
  }
});

export default router;
