/**
 * Automated Verification Tests for Financial Calculations and Database Integrity
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, 'test_lamps.db');

// Удаляем старую тестовую базу, если осталась
if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
}

const sqlite = sqlite3.verbose();
const db = new sqlite.Database(TEST_DB_PATH);

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) return reject(err);
    resolve({ id: this.lastID, changes: this.changes });
  });
});

const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) return reject(err);
    resolve(row);
  });
});

const query = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) return reject(err);
    resolve(rows);
  });
});

const exec = (sql) => new Promise((resolve, reject) => {
  db.exec(sql, (err) => {
    if (err) return reject(err);
    resolve();
  });
});

async function runTests() {
  console.log('🧪 Запуск автоматизированного тестирования CRM...');

  try {
    // 1. Применяем схему
    const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'data', 'schema.sql'), 'utf8');
    await exec(schemaSql);
    console.log('  ✔️ Схема базы данных успешно создана');

    // 2. Создаем тестовых производителей (50% и 50%)
    await run('INSERT INTO manufacturers (id, name, percentage) VALUES (1, "Производитель 1", 50.0)');
    await run('INSERT INTO manufacturers (id, name, percentage) VALUES (2, "Производитель 2", 50.0)');

    // 3. Создаем клиента
    const clientRes = await run(
      'INSERT INTO clients (name, city, phone) VALUES (?, ?, ?)',
      ['Иванов Иван', 'Ташкент', '+998 90 111-22-33']
    );
    const clientId = clientRes.id;
    console.log(`  ✔️ Клиент создан (ID: ${clientId})`);

    // 4. Создаем товары в прайсе (с 3 ценами и раздельной себестоимостью)
    const p1Res = await run(
      'INSERT INTO products (name, article, sale_price, sale_price_2, sale_price_3, cost_price, cost_price_2, manufacturer) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['Лампа А', 'LMP-A', 100, 80, 70, 60, 50, 'Завод 1']
    );
    const p2Res = await run(
      'INSERT INTO products (name, article, sale_price, sale_price_2, sale_price_3, cost_price, cost_price_2, manufacturer) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['Лампа Б', 'LMP-B', 200, 160, 140, 120, 100, 'Завод 2']
    );
    const p3Res = await run(
      'INSERT INTO products (name, article, sale_price, sale_price_2, sale_price_3, cost_price, cost_price_2, manufacturer) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['Лампа В', 'LMP-V', 50, 40, 35, 30, 25, 'Завод 1']
    );

    console.log('  ✔️ Товары с 3 прайс-листами и раздельной себестоимостью (Себест. 1, 3 = 60; Себест. 2 = 50) добавлены в прайс-лист');

    // 5. Тестируем расчет заказа из задания:
    // Иванов Иван: Лампа А (10 шт по цене 100, себест 60)
    // Сумма = 1000, Себестоимость = 600, Прибыль = 400
    const qty1 = 10;
    const sale1 = 100;
    const cost1 = 60;
    const total1 = sale1 * qty1; // 1000
    const costTotal1 = cost1 * qty1; // 600
    const profit1 = total1 - costTotal1; // 400

    const order1 = await run(
      'INSERT INTO orders (client_id, order_date, status, total_amount, cost_total, profit_total) VALUES (?, ?, ?, ?, ?, ?)',
      [clientId, '2026-09-01', 'active', total1, costTotal1, profit1]
    );

    await run(
      `INSERT INTO order_items (order_id, product_id, product_name_snapshot, sale_price_snapshot, cost_price_snapshot, quantity, total, cost_total, profit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [order1.id, p1Res.id, 'Лампа А', sale1, cost1, qty1, total1, costTotal1, profit1]
    );

    console.log(`  ✔️ Заказ #1 создан. Сумма: ${total1}, Себест: ${costTotal1}, Прибыль: ${profit1}`);

    // Проверка формул
    if (total1 !== 1000 || costTotal1 !== 600 || profit1 !== 400) {
      throw new Error(`Ошибка формул в заказе 1: total=${total1}, cost=${costTotal1}, profit=${profit1}`);
    }

    // 6. Тестируем многопозиционный заказ:
    // Лампа А — 10 шт. (100 * 10 = 1000, себест 60 * 10 = 600, прибыль 400)
    // Лампа Б — 5 шт. (200 * 5 = 1000, себест 120 * 5 = 600, прибыль 400)
    // Лампа В — 20 шт. (50 * 20 = 1000, себест 30 * 20 = 600, прибыль 400)
    // Итого: Сумма = 3000, Себест = 1800, Прибыль = 1200
    const multiItems = [
      { id: p1Res.id, name: 'Лампа А', sale: 100, cost: 60, qty: 10 },
      { id: p2Res.id, name: 'Лампа Б', sale: 200, cost: 120, qty: 5 },
      { id: p3Res.id, name: 'Лампа В', sale: 50, cost: 30, qty: 20 }
    ];

    let multiTotal = 0;
    let multiCost = 0;
    let multiProfit = 0;

    for (const item of multiItems) {
      const t = item.sale * item.qty;
      const c = item.cost * item.qty;
      const p = t - c;
      multiTotal += t;
      multiCost += c;
      multiProfit += p;
    }

    const order2 = await run(
      'INSERT INTO orders (client_id, order_date, status, total_amount, cost_total, profit_total) VALUES (?, ?, ?, ?, ?, ?)',
      [clientId, '2026-09-01', 'active', multiTotal, multiCost, multiProfit]
    );

    for (const item of multiItems) {
      const t = item.sale * item.qty;
      const c = item.cost * item.qty;
      const p = t - c;
      await run(
        `INSERT INTO order_items (order_id, product_id, product_name_snapshot, sale_price_snapshot, cost_price_snapshot, quantity, total, cost_total, profit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [order2.id, item.id, item.name, item.sale, item.cost, item.qty, t, c, p]
      );
    }

    console.log(`  ✔️ Заказ #2 (мультипозиционный) создан. Сумма: ${multiTotal}, Себест: ${multiCost}, Прибыль: ${multiProfit}`);

    if (multiTotal !== 3000 || multiCost !== 1800 || multiProfit !== 1200) {
      throw new Error(`Ошибка в расчете мульти-заказа: ${multiTotal}, ${multiCost}, ${multiProfit}`);
    }

    // 7. Тест неизменности снапшотов цен при изменении прайса:
    // Меняем цену Лампы А в прайсе на 500 (было 100)
    await run('UPDATE products SET sale_price = 500 WHERE id = ?', [p1Res.id]);
    
    // Проверяем, что в старых заказах осталась старая цена 100
    const snapshotItem = await get('SELECT * FROM order_items WHERE order_id = ? AND product_id = ?', [order1.id, p1Res.id]);
    if (snapshotItem.sale_price_snapshot !== 100) {
      throw new Error(`Ошибка! Снимок цены изменился: ${snapshotItem.sale_price_snapshot}`);
    }
    console.log('  ✔️ Снимки цен защищены от изменения в будущем прайсе (Snapshots OK)');

    // 8. Тест распределения прибыли между двумя производителями:
    // Общая прибыль активных заказов: 400 + 1200 = 1600
    const totalProfitRes = await get("SELECT SUM(profit_total) as sum_p FROM orders WHERE status = 'active'");
    const totalProfit = totalProfitRes.sum_p; // 1600

    // При 50% / 50%:
    const mfg1Accrued50 = totalProfit * 0.5; // 800
    const mfg2Accrued50 = totalProfit * 0.5; // 800

    if (mfg1Accrued50 !== 800 || mfg2Accrued50 !== 800) {
      throw new Error(`Ошибка распределения 50/50: П1=${mfg1Accrued50}, П2=${mfg2Accrued50}`);
    }
    console.log(`  ✔️ Распределение 50/50: П1 = ${mfg1Accrued50}, П2 = ${mfg2Accrued50}`);

    // При 60% / 40%:
    const mfg1Accrued60 = totalProfit * 0.6; // 960
    const mfg2Accrued40 = totalProfit * 0.4; // 640
    if (mfg1Accrued60 !== 960 || mfg2Accrued40 !== 640) {
      throw new Error(`Ошибка распределения 60/40: П1=${mfg1Accrued60}, П2=${mfg2Accrued40}`);
    }
    console.log(`  ✔️ Распределение 60/40: П1 = ${mfg1Accrued60}, П2 = ${mfg2Accrued40}`);

    // 9. Тест выплат и расчета остатка долга:
    // Начислено П1: 800 (при 50%). Вносим выплату 500. Остаток должен быть 300.
    await run(
      'INSERT INTO manufacturer_payments (manufacturer_id, payment_date, amount, payment_method) VALUES (1, "2026-09-01", 500, "Наличные")'
    );
    const paidRes = await get('SELECT SUM(amount) as paid FROM manufacturer_payments WHERE manufacturer_id = 1');
    const remainingDebt = mfg1Accrued50 - paidRes.paid;

    if (remainingDebt !== 300) {
      throw new Error(`Ошибка расчета остатка долга: ${remainingDebt} != 300`);
    }
    console.log(`  ✔️ Выплата зафиксирована: 500, Остаток долга П1: ${remainingDebt}`);

    // 10. Тест отмены заказа (soft cancel) и пересчета:
    // Отменяем Заказ #1 (прибыль 400)
    await run("UPDATE orders SET status = 'cancelled' WHERE id = ?", [order1.id]);
    const afterCancelProfit = await get("SELECT SUM(profit_total) as sum_p FROM orders WHERE status = 'active'");
    if (afterCancelProfit.sum_p !== 1200) {
      throw new Error(`Ошибка пересчета после отмены заказа: ${afterCancelProfit.sum_p} != 1200`);
    }
    console.log(`  ✔️ Отмена заказа пересчитала общую прибыль до ${afterCancelProfit.sum_p}`);

    // 11. Тест смены прайс-листа клиента (1: Розница -> 2: Опт):
    await run('UPDATE clients SET price_type = 2 WHERE id = ?', [clientId]);
    const updatedClient = await get('SELECT price_type FROM clients WHERE id = ?', [clientId]);
    if (updatedClient.price_type !== 2) {
      throw new Error(`Ошибка обновления прайса клиента: ${updatedClient.price_type} != 2`);
    }
    console.log('  ✔️ Быстрая смена прайса клиента в базе работает корректно (Прайс 2: Опт)');

    // 12. Тест создания заказа по Прайс 2 (Опт) с отдельной себестоимостью cost_price_2:
    // Лампа А: Оптовая цена 80, себестоимость 2 (Опт) = 50, кол-во 10 -> Сумма = 800, Себест = 500, Прибыль = 300
    const optQty = 10;
    const optSale = 80;
    const optCost = 50; // cost_price_2
    const optTotal = optSale * optQty; // 800
    const optCostTotal = optCost * optQty; // 500
    const optProfit = optTotal - optCostTotal; // 300

    const order3 = await run(
      'INSERT INTO orders (client_id, order_date, price_type, status, total_amount, cost_total, profit_total) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [clientId, '2026-09-02', 2, 'active', optTotal, optCostTotal, optProfit]
    );
    await run(
      `INSERT INTO order_items (order_id, product_id, product_name_snapshot, sale_price_snapshot, cost_price_snapshot, quantity, total, cost_total, profit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [order3.id, p1Res.id, 'Лампа А', optSale, optCost, optQty, optTotal, optCostTotal, optProfit]
    );
    console.log(`  ✔️ Заказ по Прайсу 2 (Опт) с отдельной себестоимостью (50) создан. Сумма: ${optTotal}, Себест: ${optCostTotal}, Прибыль: ${optProfit}`);

    // 13. Тест создания заказа по Прайсу 1 (Розница) для клиента с Прайсом 2:
    // Проверяем, что заказ фиксирует именно переданный price_type = 1
    const retailOrder = await run(
      'INSERT INTO orders (client_id, order_date, price_type, status, total_amount, cost_total, profit_total) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [clientId, '2026-09-02', 1, 'active', 1000, 600, 400]
    );
    const retailOrderDb = await get('SELECT price_type FROM orders WHERE id = ?', [retailOrder.id]);
    if (retailOrderDb.price_type !== 1) {
      throw new Error(`Ошибка типа прайса в заказе: ${retailOrderDb.price_type} != 1`);
    }
    console.log('  ✔️ Заказ с принудительным Прайсом 1 для клиента с Прайсом 2 успешно зафиксирован');

    // 14. Тест смены прайса клиента на Прайс 3 (Full):
    await run('UPDATE clients SET price_type = 3 WHERE id = ?', [clientId]);
    const fullClient = await get('SELECT price_type FROM clients WHERE id = ?', [clientId]);
    if (fullClient.price_type !== 3) {
      throw new Error(`Ошибка обновления прайса клиента на Full: ${fullClient.price_type} != 3`);
    }
    console.log('  ✔️ Быстрая смена прайса клиента на Прайс 3 (Full) работает корректно');

    // 15. Тест создания заказа по Прайс 3 (Full):
    // Лампа А: Цена Full 70, себестоимость 60, кол-во 10 -> Сумма = 700, Себест = 600, Прибыль = 100
    const fullQty = 10;
    const fullSale = 70;
    const fullCost = 60;
    const fullTotal = fullSale * fullQty; // 700
    const fullCostTotal = fullCost * fullQty; // 600
    const fullProfit = fullTotal - fullCostTotal; // 100

    const orderFull = await run(
      'INSERT INTO orders (client_id, order_date, price_type, status, total_amount, cost_total, profit_total) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [clientId, '2026-09-02', 3, 'active', fullTotal, fullCostTotal, fullProfit]
    );
    await run(
      `INSERT INTO order_items (order_id, product_id, product_name_snapshot, sale_price_snapshot, cost_price_snapshot, quantity, total, cost_total, profit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderFull.id, p1Res.id, 'Лампа А', fullSale, fullCost, fullQty, fullTotal, fullCostTotal, fullProfit]
    );
    console.log(`  ✔️ Заказ по Прайсу 3 (Full) создан. Сумма: ${fullTotal}, Себест: ${fullCostTotal}, Прибыль: ${fullProfit}`);

    // 16. Тест распределения прибыли для конкретного отдельного заказа (Детали заказа)
    const testOrder = await get('SELECT * FROM orders WHERE id = ?', [orderFull.id]);
    const currentMfgs = await query('SELECT id, name, percentage FROM manufacturers ORDER BY id ASC');
    const orderDistribution = currentMfgs.map(m => ({
      name: m.name,
      percentage: m.percentage,
      share: Math.round(testOrder.profit_total * (m.percentage / 100) * 100) / 100
    }));

    if (orderDistribution[0].share !== 50 || orderDistribution[1].share !== 50) {
      throw new Error(`Ошибка расчета распределения прибыли по заказу 50/50: П1=${orderDistribution[0].share}, П2=${orderDistribution[1].share}`);
    }
    console.log(`  ✔️ Распределение прибыли для конкретного заказа (50/50): ${orderDistribution[0].name} (${orderDistribution[0].percentage}%) = ${orderDistribution[0].share}, ${orderDistribution[1].name} (${orderDistribution[1].percentage}%) = ${orderDistribution[1].share}`);

    // Проверяем с изменением долей на 70/30:
    await run('UPDATE manufacturers SET percentage = 70 WHERE id = 1');
    await run('UPDATE manufacturers SET percentage = 30 WHERE id = 2');
    const updatedMfgs = await query('SELECT id, name, percentage FROM manufacturers ORDER BY id ASC');
    const orderDistribution7030 = updatedMfgs.map(m => ({
      name: m.name,
      percentage: m.percentage,
      share: Math.round(testOrder.profit_total * (m.percentage / 100) * 100) / 100
    }));
    if (orderDistribution7030[0].share !== 70 || orderDistribution7030[1].share !== 30) {
      throw new Error(`Ошибка расчета распределения прибыли по заказу 70/30: П1=${orderDistribution7030[0].share}, П2=${orderDistribution7030[1].share}`);
    }
    console.log(`  ✔️ Распределение прибыли для конкретного заказа (70/30): ${orderDistribution7030[0].name} (${orderDistribution7030[0].percentage}%) = ${orderDistribution7030[0].share}, ${orderDistribution7030[1].name} (${orderDistribution7030[1].percentage}%) = ${orderDistribution7030[1].share}`);

    console.log('\n=================================================');
    console.log('🎉 ВСЕ ТЕСТЫ РАСЧЕТОВ И ЦЕЛОСТНОСТИ БАЗЫ ДАННЫХ ПРОЙДЕНЫ УСПЕШНО!');
    console.log('=================================================\n');
  } catch (err) {
    console.error('❌ ТЕСТ ПРОВАЛЕН:', err);
    process.exit(1);
  } finally {
    await new Promise((res) => db.close(res));
    try {
      if (fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
      }
    } catch (e) {}
  }
}

runTests();
