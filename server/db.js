import sqlite3 from 'sqlite3';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { getServerMacs } from './utils/macResolver.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Настройка парсеров типов для PostgreSQL (NUMERIC, DECIMAL, BIGINT -> Number)
pg.types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val))); // NUMERIC
pg.types.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10))); // INT8 / BIGINT
pg.types.setTypeParser(700, (val) => (val === null ? null : parseFloat(val))); // FLOAT4
pg.types.setTypeParser(701, (val) => (val === null ? null : parseFloat(val))); // FLOAT8

// Проверяем наличие строки подключения к PostgreSQL (Supabase, Neon, Render Postgres и т.д.)
// На Vercel PostgreSQL должен использоваться через DATABASE_URL/POSTGRES_URL/SUPABASE_DB_URL.
const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.SUPABASE_DB_URL;

const IS_POSTGRES = Boolean(
  DATABASE_URL && DATABASE_URL.trim().length > 0
);

// SQLite используется только локально.
// В PostgreSQL-режиме не пытаемся создавать /var/task/data на Vercel.
const DATA_DIR = path.join(__dirname, '..', 'data');

if (!IS_POSTGRES && !fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const DB_PATH = path.join(DATA_DIR, 'lamps.db');

let pgPool = null;
let sqliteDb = null;

if (IS_POSTGRES) {
  console.log('🔌 Подключение к облачной базе данных PostgreSQL (Supabase/Neon/Render)...');
  const isLocalPg = DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1');
  pgPool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: isLocalPg ? false : { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  pgPool.on('error', (err) => {
    console.error('❌ Ошибка пула подключений PostgreSQL:', err);
  });
} else {
  console.log('📁 Использование локальной базы данных SQLite:', DB_PATH);
  const sqlite = sqlite3.verbose();
  sqliteDb = new sqlite.Database(DB_PATH);
  sqliteDb.serialize(() => {
    sqliteDb.run('PRAGMA foreign_keys = ON');
    sqliteDb.run('PRAGMA journal_mode = WAL');
    sqliteDb.run('PRAGMA synchronous = NORMAL');
  });
}

/**
 * Преобразует SQLite SQL синтаксис в PostgreSQL синтаксис:
 * - Заменяет ? на $1, $2, ...
 * - Преобразует функции strftime, datetime, date
 */
export function transformSqlForPostgres(sql) {
  if (!sql) return sql;

  let paramIndex = 1;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let out = '';

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const prev = i > 0 ? sql[i - 1] : '';

    if (ch === "'" && prev !== '\\') {
      inSingleQuote = !inSingleQuote;
      out += ch;
    } else if (ch === '"' && prev !== '\\') {
      inDoubleQuote = !inDoubleQuote;
      out += ch;
    } else if (ch === '?' && !inSingleQuote && !inDoubleQuote) {
      out += `$${paramIndex++}`;
    } else {
      out += ch;
    }
  }

  // Замена функций дат и времени
  out = out
    .replace(/strftime\s*\(\s*'%Y-%m'\s*,\s*([^)]+)\)/gi, 'to_char($1, \'YYYY-MM\')')
    .replace(/strftime\s*\(\s*'%Y'\s*,\s*([^)]+)\)/gi, 'to_char($1, \'YYYY\')')
    .replace(/datetime\s*\(\s*['"]now['"]\s*,\s*['"]localtime['"]\s*\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/datetime\s*\(\s*['"]now['"]\s*\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/date\s*\(\s*['"]now['"]\s*,\s*['"]-([0-9]+)\s*days?['"]\s*\)/gi, "(CURRENT_DATE - INTERVAL '$1 days')")
    .replace(/date\s*\(\s*['"]now['"]\s*\)/gi, 'CURRENT_DATE');

  return out;
}

export const isPostgres = () => IS_POSTGRES;

// 1. Выполнение запроса с получением массива строк
export const query = async (sql, params = []) => {
  if (IS_POSTGRES) {
    const pgSql = transformSqlForPostgres(sql);
    const res = await pgPool.query(pgSql, params);
    return res.rows;
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }
};

// 2. Выполнение запроса с получением одной строки
export const get = async (sql, params = []) => {
  if (IS_POSTGRES) {
    const pgSql = transformSqlForPostgres(sql);
    const res = await pgPool.query(pgSql, params);
    return res.rows[0] || null;
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.get(sql, params, (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      });
    });
  }
};

// 3. Выполнение DML запроса (INSERT / UPDATE / DELETE)
export const run = async (sql, params = []) => {
  if (IS_POSTGRES) {
    let pgSql = transformSqlForPostgres(sql).trim();

    // Если это INSERT и нет RETURNING, добавляем RETURNING id
    const isInsert = /^INSERT\s+INTO/i.test(pgSql);
    let appendedReturning = false;
    if (isInsert && !/RETURNING/i.test(pgSql)) {
      pgSql += ' RETURNING id';
      appendedReturning = true;
    }

    try {
      const res = await pgPool.query(pgSql, params);
      const insertedId = res.rows && res.rows[0] && res.rows[0].id !== undefined ? res.rows[0].id : null;
      return { id: insertedId, changes: res.rowCount };
    } catch (err) {
      // Если таблица не имеет колонки id (например, settings), пробуем без RETURNING id
      if (appendedReturning && err.message && err.message.includes('column "id" does not exist')) {
        const fallbackSql = transformSqlForPostgres(sql);
        const res2 = await pgPool.query(fallbackSql, params);
        return { id: null, changes: res2.rowCount };
      }
      throw err;
    }
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }
};

// 4. Выполнение скрипта с множественными выражениями
export const exec = async (sql) => {
  if (IS_POSTGRES) {
    await pgPool.query(sql);
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.exec(sql, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }
};

// 5. Инициализация базы данных и начальных значений
export async function initDatabase() {
  if (IS_POSTGRES) {
    await initPostgresDatabase();
  } else {
    await initSqliteDatabase();
  }
}

async function initPostgresDatabase() {
  const schemaPath = path.join(__dirname, 'data', 'schema_postgres.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await exec(schemaSql);
  }

  // 1. Проверка администратора
  const adminUser = await get('SELECT * FROM users WHERE username = ?', ['admin']);
  if (!adminUser) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync('admin123', salt);
    await run(
      'INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
      ['admin', hash, 'Главный Администратор', 'admin']
    );
    console.log('✅ [PostgreSQL] Создан администратор по умолчанию (логин: admin, пароль: admin123)');
  }

  // 1.1 Проверка кодовых слов доступа (PostgreSQL)
  try {
    await exec(`
      CREATE TABLE IF NOT EXISTS security_passcodes (
          id SERIAL PRIMARY KEY,
          code_word VARCHAR(255) UNIQUE NOT NULL,
          assigned_to VARCHAR(255) NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'active',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_passcodes_word ON security_passcodes(code_word);
      CREATE INDEX IF NOT EXISTS idx_passcodes_status ON security_passcodes(status);
    `);

    const passCount = await get('SELECT COUNT(*) as count FROM security_passcodes');
    if (parseInt(passCount?.count || 0, 10) === 0) {
      await run('INSERT INTO security_passcodes (code_word, assigned_to, status) VALUES (?, ?, ?)', ['КЕРАМИКА', 'Основной мастер-код администратора', 'active']);
      await run('INSERT INTO security_passcodes (code_word, assigned_to, status) VALUES (?, ?, ?)', ['21177', 'Персональный код доступа Руслана', 'active']);
      await run('INSERT INTO security_passcodes (code_word, assigned_to, status) VALUES (?, ?, ?)', ['СИНТЕЗ', 'Код для менеджеров и склада', 'active']);
      console.log('✅ [PostgreSQL] Инициализированы начальные кодовые слова доступа (КЕРАМИКА, 21177, СИНТЕЗ)');
    }
  } catch (e) {
    console.error('Ошибка инициализации security_passcodes:', e);
  }

  // 2. Проверка производителей
  const mfgRes = await get('SELECT COUNT(*) as count FROM manufacturers');
  const mfgCount = parseInt(mfgRes ? mfgRes.count : 0, 10);
  if (mfgCount === 0) {
    const m1 = await run('INSERT INTO manufacturers (name, percentage) VALUES (?, ?)', ['Фабрика Восток', 50.0]);
    const m2 = await run('INSERT INTO manufacturers (name, percentage) VALUES (?, ?)', ['Завод Светотехника', 50.0]);
    await run('INSERT INTO settlement_history (manufacturer_id, type, amount, note) VALUES (?, ?, ?, ?)', [
      m1.id || 1, 'adjustment', 0, 'Начальный баланс взаиморасчетов'
    ]);
    await run('INSERT INTO settlement_history (manufacturer_id, type, amount, note) VALUES (?, ?, ?, ?)', [
      m2.id || 2, 'adjustment', 0, 'Начальный баланс взаиморасчетов'
    ]);
    console.log('✅ [PostgreSQL] Инициализированы 2 производителя с распределением 50% / 50%');
  }

  // 3. Проверка настроек
  const currencySetting = await get('SELECT * FROM settings WHERE key = ?', ['currency']);
  if (!currencySetting) {
    await run('INSERT INTO settings (key, value) VALUES (?, ?)', ['currency', 'сум']);
    await run('INSERT INTO settings (key, value) VALUES (?, ?)', ['company_name', 'Учет ламп']);
    await run('INSERT INTO settings (key, value) VALUES (?, ?)', ['price_list_1_name', 'Прайс-лист 1 (Розница)']);
    await run('INSERT INTO settings (key, value) VALUES (?, ?)', ['price_list_2_name', 'Прайс-лист 2 (Опт)']);
  }

  // 4. Начальные товары (если каталог пуст)
  const prodRes = await get('SELECT COUNT(*) as count FROM products');
  const prodCount = parseInt(prodRes ? prodRes.count : 0, 10);
  if (prodCount === 0) {
    const sampleProducts = [
      ['Лампа LED E27 10W Теплый свет', 'LMP-E27-10W-W', 25000, 20000, 18000, 15000, 13000, 'Завод №1', 'шт', 1],
      ['Лампа LED E27 15W Холодный свет', 'LMP-E27-15W-C', 35000, 28000, 25000, 21000, 18000, 'Завод №1', 'шт', 1],
      ['Лампа LED T8 120cm 18W', 'LMP-T8-18W', 48000, 39000, 35000, 28000, 25000, 'Фабрика Света', 'шт', 1],
      ['Светодиодный прожектор SMD 50W IP65', 'FL-50W-IP65', 120000, 95000, 85000, 75000, 68000, 'Фабрика Света', 'шт', 1],
      ['Трековый светильник COB 20W Черный', 'TR-COB-20W-B', 180000, 145000, 130000, 110000, 98000, 'Завод №1', 'шт', 1],
      ['Лампа филаментная Vintage G95 6W E27', 'FIL-G95-6W', 65000, 52000, 46000, 38000, 33000, 'Фабрика Света', 'шт', 1]
    ];

    for (const p of sampleProducts) {
      await run(
        'INSERT INTO products (name, article, sale_price, sale_price_2, sale_price_3, cost_price, cost_price_2, manufacturer, unit, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        p
      );
    }
    console.log('✅ [PostgreSQL] Добавлены начальные позиции в прайс-лист');
  }

  // 5. Начальные клиенты
  const clientRes = await get('SELECT COUNT(*) as count FROM clients');
  const clientCount = parseInt(clientRes ? clientRes.count : 0, 10);
  if (clientCount === 0) {
    const sampleClients = [
      ['Иванов Иван Иванович', 'Ташкент', '+998 90 123-45-67', 'ул. Навои, д. 15', 'Постоянный оптовый клиент'],
      ['Каримов Анвар Рустамович', 'Самарканд', '+998 93 987-65-43', 'ул. Регистан, 4', 'Магазин стройматериалов'],
      ['ООО "Светлый Дом"', 'Бухара', '+998 71 200-11-22', 'ул. Мирзо Улугбека, 88', 'Дизайнерские проекты']
    ];

    for (const c of sampleClients) {
      await run(
        'INSERT INTO clients (name, city, phone, address, comment) VALUES (?, ?, ?, ?, ?)',
        c
      );
    }
    console.log('✅ [PostgreSQL] Добавлены начальные клиенты');
  }

  // 6. Начальные заказы
  const ordRes = await get('SELECT COUNT(*) as count FROM orders');
  const orderCount = parseInt(ordRes ? ordRes.count : 0, 10);
  if (orderCount === 0) {
    const clients = await query('SELECT id FROM clients ORDER BY id ASC');
    const prods = await query('SELECT * FROM products ORDER BY id ASC');

    if (clients.length >= 2 && prods.length >= 5) {
      const p1 = prods[0];
      const p2 = prods[1];
      const q1 = 10, q2 = 5;
      const t1 = p1.sale_price * q1, c1 = p1.cost_price * q1, pr1 = t1 - c1;
      const t2 = p2.sale_price * q2, c2 = p2.cost_price * q2, pr2 = t2 - c2;
      const sum1 = t1 + t2, cost1 = c1 + c2, profit1 = pr1 + pr2;

      const o1 = await run(
        `INSERT INTO orders (client_id, order_date, status, total_amount, cost_total, profit_total, comment)
         VALUES (?, CURRENT_DATE - INTERVAL '5 days', 'active', ?, ?, ?, ?)`,
        [clients[0].id, sum1, cost1, profit1, 'Оптовая поставка в магазин']
      );
      if (o1 && o1.id) {
        await run(
          `INSERT INTO order_items (order_id, product_id, product_name_snapshot, article_snapshot, sale_price_snapshot, cost_price_snapshot, quantity, total, cost_total, profit)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [o1.id, p1.id, p1.name, p1.article, p1.sale_price, p1.cost_price, q1, t1, c1, pr1]
        );
        await run(
          `INSERT INTO order_items (order_id, product_id, product_name_snapshot, article_snapshot, sale_price_snapshot, cost_price_snapshot, quantity, total, cost_total, profit)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [o1.id, p2.id, p2.name, p2.article, p2.sale_price, p2.cost_price, q2, t2, c2, pr2]
        );
      }

      const p3 = prods[3];
      const p4 = prods[4];
      const q3 = 8, q4 = 4;
      const t3 = p3.sale_price * q3, c3 = p3.cost_price * q3, pr3 = t3 - c3;
      const t4 = p4.sale_price * q4, c4 = p4.cost_price * q4, pr4 = t4 - c4;
      const sum2 = t3 + t4, cost2 = c3 + c4, profit2 = pr3 + pr4;

      const o2 = await run(
        `INSERT INTO orders (client_id, order_date, status, total_amount, cost_total, profit_total, comment)
         VALUES (?, CURRENT_DATE - INTERVAL '2 days', 'active', ?, ?, ?, ?)`,
        [clients[1].id, sum2, cost2, profit2, 'Светильники для стройки']
      );
      if (o2 && o2.id) {
        await run(
          `INSERT INTO order_items (order_id, product_id, product_name_snapshot, article_snapshot, sale_price_snapshot, cost_price_snapshot, quantity, total, cost_total, profit)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [o2.id, p3.id, p3.name, p3.article, p3.sale_price, p3.cost_price, q3, t3, c3, pr3]
        );
        await run(
          `INSERT INTO order_items (order_id, product_id, product_name_snapshot, article_snapshot, sale_price_snapshot, cost_price_snapshot, quantity, total, cost_total, profit)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [o2.id, p4.id, p4.name, p4.article, p4.sale_price, p4.cost_price, q4, t4, c4, pr4]
        );
      }

      const mfgs = await query('SELECT id FROM manufacturers ORDER BY id ASC');
      if (mfgs.length > 0) {
        await run(
          `INSERT INTO manufacturer_payments (manufacturer_id, payment_date, amount, payment_method, comment)
           VALUES (?, CURRENT_DATE - INTERVAL '1 day', 200000, 'Перевод на карту (P2P)', 'Авансовый расчет')`,
          [mfgs[0].id]
        );
      }
      console.log('✅ [PostgreSQL] Созданы начальные демонстрационные заказы и выплаты');
    }
  }
}

async function initSqliteDatabase() {
  const schemaPath = path.join(__dirname, 'data', 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  await exec(schemaSql);

  // Автомиграция колонок
  try {
    const prodCols = await query("PRAGMA table_info(products)");
    if (!prodCols.some(c => c.name === 'sale_price_2')) {
      await run("ALTER TABLE products ADD COLUMN sale_price_2 REAL DEFAULT 0");
      await run("UPDATE products SET sale_price_2 = ROUND(sale_price * 0.85, -2) WHERE sale_price_2 = 0 OR sale_price_2 IS NULL");
    }
    if (!prodCols.some(c => c.name === 'sale_price_3')) {
      await run("ALTER TABLE products ADD COLUMN sale_price_3 REAL DEFAULT 0");
      await run("UPDATE products SET sale_price_3 = ROUND(sale_price * 0.75, -2) WHERE sale_price_3 = 0 OR sale_price_3 IS NULL");
    }
    if (!prodCols.some(c => c.name === 'cost_price_2')) {
      await run("ALTER TABLE products ADD COLUMN cost_price_2 REAL DEFAULT 0");
      await run("UPDATE products SET cost_price_2 = cost_price WHERE cost_price_2 = 0 OR cost_price_2 IS NULL");
    }
  } catch (e) { }

  try {
    const clientCols = await query("PRAGMA table_info(clients)");
    if (!clientCols.some(c => c.name === 'price_type')) {
      await run("ALTER TABLE clients ADD COLUMN price_type INTEGER NOT NULL DEFAULT 1");
    }
  } catch (e) { }

  try {
    const orderCols = await query("PRAGMA table_info(orders)");
    if (!orderCols.some(c => c.name === 'price_type')) {
      await run("ALTER TABLE orders ADD COLUMN price_type INTEGER NOT NULL DEFAULT 1");
    }
    await run("UPDATE orders SET status = 'completed' WHERE status = 'active'");
  } catch (e) { }

  // 1. Проверка администратора
  const adminUser = await get('SELECT * FROM users WHERE username = ?', ['admin']);
  if (!adminUser) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync('admin123', salt);
    await run(
      'INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
      ['admin', hash, 'Главный Администратор', 'admin']
    );
    console.log('✅ [SQLite] Создан администратор по умолчанию (логин: admin, пароль: admin123)');
  }

  // 1.1 Разрешённые устройства
  try {
    await exec(`
      CREATE TABLE IF NOT EXISTS allowed_devices (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          device_name TEXT NOT NULL,
          mac_address TEXT UNIQUE NOT NULL,
          status TEXT NOT NULL DEFAULT 'allowed',
          comment TEXT,
          created_at DATETIME DEFAULT (datetime('now', 'localtime')),
          updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
      );
      CREATE INDEX IF NOT EXISTS idx_allowed_devices_mac ON allowed_devices(mac_address);
      CREATE INDEX IF NOT EXISTS idx_allowed_devices_status ON allowed_devices(status);
    `);

    const devCount = await get('SELECT COUNT(*) as count FROM allowed_devices');
    if (devCount.count === 0) {
      const serverMacs = getServerMacs();
      if (serverMacs.length > 0) {
        for (let i = 0; i < serverMacs.length; i++) {
          const mac = serverMacs[i];
          const name = i === 0 ? 'Основной сервер / Компьютер администратора' : `Сетевой адаптер сервера #${i + 1}`;
          await run(
            'INSERT OR IGNORE INTO allowed_devices (device_name, mac_address, status, comment) VALUES (?, ?, ?, ?)',
            [name, mac, 'allowed', 'Автоматически добавлен при первичной настройке безопасности']
          );
        }
      } else {
        await run(
          'INSERT INTO allowed_devices (device_name, mac_address, status, comment) VALUES (?, ?, ?, ?)',
          ['Основной компьютер администратора', '00:11:22:33:44:55', 'allowed', 'Начальное устройство по умолчанию']
        );
      }
    }
  } catch (err) { }

  // 2. Производители
  const mfgCount = await get('SELECT COUNT(*) as count FROM manufacturers');
  if (mfgCount.count === 0) {
    await run('INSERT INTO manufacturers (id, name, percentage) VALUES (?, ?, ?)', [1, 'Фабрика Восток', 50.0]);
    await run('INSERT INTO manufacturers (id, name, percentage) VALUES (?, ?, ?)', [2, 'Завод Светотехника', 50.0]);
    await run('INSERT INTO settlement_history (manufacturer_id, type, amount, note) VALUES (?, ?, ?, ?)', [1, 'adjustment', 0, 'Начальный баланс взаиморасчетов']);
    await run('INSERT INTO settlement_history (manufacturer_id, type, amount, note) VALUES (?, ?, ?, ?)', [2, 'adjustment', 0, 'Начальный баланс взаиморасчетов']);
  }

  // 2.1 Проверка кодовых слов доступа (SQLite)
  try {
    await exec(`
      CREATE TABLE IF NOT EXISTS security_passcodes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code_word TEXT UNIQUE NOT NULL,
          assigned_to TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          created_at DATETIME DEFAULT (datetime('now', 'localtime')),
          updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
      );
      CREATE INDEX IF NOT EXISTS idx_passcodes_word ON security_passcodes(code_word);
      CREATE INDEX IF NOT EXISTS idx_passcodes_status ON security_passcodes(status);
    `);

    const passCount = await get('SELECT COUNT(*) as count FROM security_passcodes');
    if (parseInt(passCount?.count || 0, 10) === 0) {
      await run('INSERT INTO security_passcodes (code_word, assigned_to, status) VALUES (?, ?, ?)', ['КЕРАМИКА', 'Основной мастер-код администратора', 'active']);
      await run('INSERT INTO security_passcodes (code_word, assigned_to, status) VALUES (?, ?, ?)', ['21177', 'Персональный код доступа Руслана', 'active']);
      await run('INSERT INTO security_passcodes (code_word, assigned_to, status) VALUES (?, ?, ?)', ['СИНТЕЗ', 'Код для менеджеров и склада', 'active']);
      console.log('✅ [SQLite] Инициализированы начальные кодовые слова доступа (КЕРАМИКА, 21177, СИНТЕЗ)');
    }
  } catch (err) {
    console.error('Ошибка инициализации security_passcodes (SQLite):', err);
  }

  // 3. Настройки
  const currencySetting = await get('SELECT * FROM settings WHERE key = ?', ['currency']);
  if (!currencySetting) {
    await run('INSERT INTO settings (key, value) VALUES (?, ?)', ['currency', 'сум']);
    await run('INSERT INTO settings (key, value) VALUES (?, ?)', ['company_name', 'Учет ламп']);
    await run('INSERT INTO settings (key, value) VALUES (?, ?)', ['price_list_1_name', 'Прайс-лист 1 (Розница)']);
    await run('INSERT INTO settings (key, value) VALUES (?, ?)', ['price_list_2_name', 'Прайс-лист 2 (Опт)']);
  }

  // 4. Товары
  const prodCount = await get('SELECT COUNT(*) as count FROM products');
  if (prodCount.count === 0) {
    const sampleProducts = [
      ['Лампа LED E27 10W Теплый свет', 'LMP-E27-10W-W', 25000, 20000, 18000, 15000, 13000, 'Завод №1', 'шт', 1],
      ['Лампа LED E27 15W Холодный свет', 'LMP-E27-15W-C', 35000, 28000, 25000, 21000, 18000, 'Завод №1', 'шт', 1],
      ['Лампа LED T8 120cm 18W', 'LMP-T8-18W', 48000, 39000, 35000, 28000, 25000, 'Фабрика Света', 'шт', 1],
      ['Светодиодный прожектор SMD 50W IP65', 'FL-50W-IP65', 120000, 95000, 85000, 75000, 68000, 'Фабрика Света', 'шт', 1],
      ['Трековый светильник COB 20W Черный', 'TR-COB-20W-B', 180000, 145000, 130000, 110000, 98000, 'Завод №1', 'шт', 1],
      ['Лампа филаментная Vintage G95 6W E27', 'FIL-G95-6W', 65000, 52000, 46000, 38000, 33000, 'Фабрика Света', 'шт', 1]
    ];

    for (const p of sampleProducts) {
      await run(
        'INSERT INTO products (name, article, sale_price, sale_price_2, sale_price_3, cost_price, cost_price_2, manufacturer, unit, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        p
      );
    }
  }

  // 5. Клиенты
  const clientCount = await get('SELECT COUNT(*) as count FROM clients');
  if (clientCount.count === 0) {
    const sampleClients = [
      ['Иванов Иван Иванович', 'Ташкент', '+998 90 123-45-67', 'ул. Навои, д. 15', 'Постоянный оптовый клиент'],
      ['Каримов Анвар Рустамович', 'Самарканд', '+998 93 987-65-43', 'ул. Регистан, 4', 'Магазин стройматериалов'],
      ['ООО "Светлый Дом"', 'Бухара', '+998 71 200-11-22', 'ул. Мирзо Улугбека, 88', 'Дизайнерские проекты']
    ];

    for (const c of sampleClients) {
      await run(
        'INSERT INTO clients (name, city, phone, address, comment) VALUES (?, ?, ?, ?, ?)',
        c
      );
    }
  }

  // 6. Заказы
  const orderCount = await get('SELECT COUNT(*) as count FROM orders');
  if (orderCount.count === 0) {
    const clients = await query('SELECT id FROM clients ORDER BY id ASC');
    const prods = await query('SELECT * FROM products ORDER BY id ASC');

    if (clients.length >= 2 && prods.length >= 5) {
      const p1 = prods[0];
      const p2 = prods[1];
      const q1 = 10, q2 = 5;
      const t1 = p1.sale_price * q1, c1 = p1.cost_price * q1, pr1 = t1 - c1;
      const t2 = p2.sale_price * q2, c2 = p2.cost_price * q2, pr2 = t2 - c2;
      const sum1 = t1 + t2, cost1 = c1 + c2, profit1 = pr1 + pr2;

      const o1 = await run(
        `INSERT INTO orders (client_id, order_date, status, total_amount, cost_total, profit_total, comment)
         VALUES (?, date('now', '-5 days'), 'active', ?, ?, ?, ?)`,
        [clients[0].id, sum1, cost1, profit1, 'Оптовая поставка в магазин']
      );
      await run(
        `INSERT INTO order_items (order_id, product_id, product_name_snapshot, article_snapshot, sale_price_snapshot, cost_price_snapshot, quantity, total, cost_total, profit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [o1.id, p1.id, p1.name, p1.article, p1.sale_price, p1.cost_price, q1, t1, c1, pr1]
      );
      await run(
        `INSERT INTO order_items (order_id, product_id, product_name_snapshot, article_snapshot, sale_price_snapshot, cost_price_snapshot, quantity, total, cost_total, profit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [o1.id, p2.id, p2.name, p2.article, p2.sale_price, p2.cost_price, q2, t2, c2, pr2]
      );

      const p3 = prods[3];
      const p4 = prods[4];
      const q3 = 8, q4 = 4;
      const t3 = p3.sale_price * q3, c3 = p3.cost_price * q3, pr3 = t3 - c3;
      const t4 = p4.sale_price * q4, c4 = p4.cost_price * q4, pr4 = t4 - c4;
      const sum2 = t3 + t4, cost2 = c3 + c4, profit2 = pr3 + pr4;

      const o2 = await run(
        `INSERT INTO orders (client_id, order_date, status, total_amount, cost_total, profit_total, comment)
         VALUES (?, date('now', '-2 days'), 'active', ?, ?, ?, ?)`,
        [clients[1].id, sum2, cost2, profit2, 'Светильники для стройки']
      );
      await run(
        `INSERT INTO order_items (order_id, product_id, product_name_snapshot, article_snapshot, sale_price_snapshot, cost_price_snapshot, quantity, total, cost_total, profit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [o2.id, p3.id, p3.name, p3.article, p3.sale_price, p3.cost_price, q3, t3, c3, pr3]
      );
      await run(
        `INSERT INTO order_items (order_id, product_id, product_name_snapshot, article_snapshot, sale_price_snapshot, cost_price_snapshot, quantity, total, cost_total, profit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [o2.id, p4.id, p4.name, p4.article, p4.sale_price, p4.cost_price, q4, t4, c4, pr4]
      );

      await run(
        `INSERT INTO manufacturer_payments (manufacturer_id, payment_date, amount, payment_method, comment)
         VALUES (1, date('now', '-1 days'), 200000, 'Перевод на карту (P2P)', 'Авансовый расчет')`,
        []
      );
    }
  }
}

export default {
  query,
  get,
  run,
  exec,
  initDatabase,
  isPostgres,
  DB_PATH
};