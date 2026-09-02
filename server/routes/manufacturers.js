import express from 'express';
import db from '../db.js';
import { requireAuth } from './auth.js';

const router = express.Router();

// Получить список производителей со сводными балансами
router.get('/', requireAuth, async (req, res) => {
  try {
    const { period, month, year, date_from, date_to } = req.query;

    // 1. Получаем производителей
    const manufacturers = await db.query('SELECT * FROM manufacturers ORDER BY id ASC');

    // 2. Рассчитываем общую прибыль по активным заказам (с учетом фильтра по периоду, если передан)
    let profitSql = "SELECT COALESCE(SUM(profit_total), 0) AS total_profit FROM orders WHERE status != 'cancelled'";
    const profitParams = [];

    if (date_from) {
      profitSql += ' AND order_date >= ?';
      profitParams.push(date_from);
    }
    if (date_to) {
      profitSql += ' AND order_date <= ?';
      profitParams.push(date_to);
    }
    if (month && year) {
      const padMonth = String(month).padStart(2, '0');
      profitSql += " AND strftime('%Y-%m', order_date) = ?";
      profitParams.push(`${year}-${padMonth}`);
    } else if (year) {
      profitSql += " AND strftime('%Y', order_date) = ?";
      profitParams.push(String(year));
    }

    const profitRes = await db.get(profitSql, profitParams);
    const totalProfit = profitRes ? profitRes.total_profit : 0;

    // Также считаем общую прибыль за ВСЕ время для итогового баланса задолженности
    const allTimeProfitRes = await db.get("SELECT COALESCE(SUM(profit_total), 0) AS all_profit FROM orders WHERE status != 'cancelled'");
    const allTimeProfit = allTimeProfitRes ? allTimeProfitRes.all_profit : 0;

    // 3. Получаем выплаты для каждого производителя
    const result = [];
    for (const m of manufacturers) {
      // Начислено за выбранный период
      const accruedInPeriod = Math.round(totalProfit * (m.percentage / 100) * 100) / 100;
      
      // Начислено за ВСЕ время
      const accruedAllTime = Math.round(allTimeProfit * (m.percentage / 100) * 100) / 100;

      // Получено выплат за ВСЕ время
      const paymentsAllTimeRes = await db.get(
        'SELECT COALESCE(SUM(amount), 0) AS total_paid, COUNT(*) AS payments_count FROM manufacturer_payments WHERE manufacturer_id = ?',
        [m.id]
      );
      const totalPaidAllTime = paymentsAllTimeRes ? paymentsAllTimeRes.total_paid : 0;
      const paymentsCount = paymentsAllTimeRes ? paymentsAllTimeRes.payments_count : 0;

      // Получено выплат за выбранный период
      let payPeriodSql = 'SELECT COALESCE(SUM(amount), 0) AS paid_period FROM manufacturer_payments WHERE manufacturer_id = ?';
      const payPeriodParams = [m.id];
      if (date_from) {
        payPeriodSql += ' AND payment_date >= ?';
        payPeriodParams.push(date_from);
      }
      if (date_to) {
        payPeriodSql += ' AND payment_date <= ?';
        payPeriodParams.push(date_to);
      }
      if (month && year) {
        const padMonth = String(month).padStart(2, '0');
        payPeriodSql += " AND strftime('%Y-%m', payment_date) = ?";
        payPeriodParams.push(`${year}-${padMonth}`);
      } else if (year) {
        payPeriodSql += " AND strftime('%Y', payment_date) = ?";
        payPeriodParams.push(String(year));
      }

      const payPeriodRes = await db.get(payPeriodSql, payPeriodParams);
      const paidInPeriod = payPeriodRes ? payPeriodRes.paid_period : 0;

      // Остаток к выплате (всего начислено за все время минус всего выплачено)
      const remainingDebt = Math.round((accruedAllTime - totalPaidAllTime) * 100) / 100;

      result.push({
        id: m.id,
        name: m.name,
        percentage: m.percentage,
        accrued: accruedInPeriod,
        paid: paidInPeriod,
        accrued_all_time: accruedAllTime,
        paid_all_time: totalPaidAllTime,
        remaining_debt: remainingDebt,
        payments_count: paymentsCount
      });
    }

    res.json({
      totalProfit,
      allTimeProfit,
      manufacturers: result
    });
  } catch (error) {
    console.error('Error fetching manufacturers:', error);
    res.status(500).json({ error: 'Ошибка получения данных производителей' });
  }
});

// Обновить имена и проценты производителей
router.put('/', requireAuth, async (req, res) => {
  try {
    const { manufacturers } = req.body;

    if (!manufacturers || !Array.isArray(manufacturers) || manufacturers.length !== 2) {
      return res.status(400).json({ error: 'Необходимо передать данные двух производителей' });
    }

    const [m1, m2] = manufacturers;

    if (!m1.name || !m1.name.trim() || !m2.name || !m2.name.trim()) {
      return res.status(400).json({ error: 'Укажите названия обоих производителей' });
    }

    const p1 = parseFloat(m1.percentage);
    const p2 = parseFloat(m2.percentage);

    if (isNaN(p1) || isNaN(p2) || p1 < 0 || p2 < 0) {
      return res.status(400).json({ error: 'Проценты должны быть неотрицательными числами' });
    }

    if (Math.round((p1 + p2) * 100) / 100 !== 100) {
      return res.status(400).json({ error: `Сумма процентов должна быть строго равна 100% (сейчас: ${(p1 + p2)}%)` });
    }

    // Сохраняем в базу
    await db.run(
      'UPDATE manufacturers SET name = ?, percentage = ?, updated_at = datetime("now", "localtime") WHERE id = ?',
      [m1.name.trim(), p1, m1.id || 1]
    );

    await db.run(
      'UPDATE manufacturers SET name = ?, percentage = ?, updated_at = datetime("now", "localtime") WHERE id = ?',
      [m2.name.trim(), p2, m2.id || 2]
    );

    const updated = await db.query('SELECT * FROM manufacturers ORDER BY id ASC');
    res.json({ success: true, manufacturers: updated, message: 'Настройки производителей успешно сохранены' });
  } catch (error) {
    console.error('Error updating manufacturers:', error);
    res.status(500).json({ error: 'Ошибка обновления настроек производителей' });
  }
});

export default router;
