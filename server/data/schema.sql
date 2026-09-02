-- Схема базы данных для учета продаж ламп и расчетов с производителями

PRAGMA foreign_keys = ON;

-- Пользователи системы
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at DATETIME DEFAULT (datetime('now', 'localtime'))
);

-- Клиенты
CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    price_type INTEGER NOT NULL DEFAULT 1, -- 1: Прайс 1 (Розница), 2: Прайс 2 (Опт), 3: Прайс 3 (Full)
    comment TEXT,
    created_at DATETIME DEFAULT (datetime('now', 'localtime')),
    updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
);

-- Товары / Лампы (Прайс-лист с 3 ценами и раздельной себестоимостью)
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    article TEXT UNIQUE,
    sale_price REAL NOT NULL DEFAULT 0,    -- Цена по Прайс-листу 1 (Розница)
    sale_price_2 REAL NOT NULL DEFAULT 0,  -- Цена по Прайс-листу 2 (Опт)
    sale_price_3 REAL NOT NULL DEFAULT 0,  -- Цена по Прайс-листу 3 (Иностранный)
    cost_price REAL NOT NULL DEFAULT 0,    -- Себестоимость (для Прайс 1 и Прайс 3)
    cost_price_2 REAL NOT NULL DEFAULT 0,  -- Себестоимость (для Прайс 2 Опт)
    manufacturer TEXT,
    unit TEXT DEFAULT 'шт',
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT (datetime('now', 'localtime')),
    updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
);

-- Заказы
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    order_date DATE NOT NULL,
    price_type INTEGER NOT NULL DEFAULT 1, -- 1: Розница, 2: Опт, 3: Full (какой прайс был применен)
    status TEXT NOT NULL DEFAULT 'active', -- 'active' или 'cancelled'
    total_amount REAL NOT NULL DEFAULT 0,
    cost_total REAL NOT NULL DEFAULT 0,
    profit_total REAL NOT NULL DEFAULT 0,
    comment TEXT,
    created_at DATETIME DEFAULT (datetime('now', 'localtime')),
    updated_at DATETIME DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT
);

-- Позиции заказов (с фиксацией цен на момент сделки)
CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER,
    product_name_snapshot TEXT NOT NULL,
    article_snapshot TEXT,
    sale_price_snapshot REAL NOT NULL,
    cost_price_snapshot REAL NOT NULL,
    quantity INTEGER NOT NULL,
    total REAL NOT NULL,
    cost_total REAL NOT NULL,
    profit REAL NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

-- Производители (распределение прибыли)
CREATE TABLE IF NOT EXISTS manufacturers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    percentage REAL NOT NULL DEFAULT 50.0,
    created_at DATETIME DEFAULT (datetime('now', 'localtime')),
    updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
);

-- Выплаты производителям
CREATE TABLE IF NOT EXISTS manufacturer_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    manufacturer_id INTEGER NOT NULL,
    payment_date DATE NOT NULL,
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'Наличные',
    comment TEXT,
    created_at DATETIME DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (manufacturer_id) REFERENCES manufacturers(id) ON DELETE RESTRICT
);

-- Системные настройки
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
);

-- Разрешённые устройства для авторизации (проверка MAC-адреса)
CREATE TABLE IF NOT EXISTS allowed_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_name TEXT NOT NULL,
    mac_address TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'allowed', -- 'allowed' (Разрешено) или 'blocked' (Заблокировано)
    comment TEXT,
    created_at DATETIME DEFAULT (datetime('now', 'localtime')),
    updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
);

-- Индексы для быстрого поиска и фильтрации
CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_payments_mfg ON manufacturer_payments(manufacturer_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON manufacturer_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_clients_city ON clients(city);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
CREATE INDEX IF NOT EXISTS idx_allowed_devices_mac ON allowed_devices(mac_address);
CREATE INDEX IF NOT EXISTS idx_allowed_devices_status ON allowed_devices(status);
