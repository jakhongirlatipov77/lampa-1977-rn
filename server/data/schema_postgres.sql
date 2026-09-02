-- Схема PostgreSQL для облачной базы данных (Supabase, Neon, Render Postgres)
-- Keramika Sintez — CRM учета продаж ламп

-- 1. Пользователи системы
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'admin',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Клиенты
CREATE TABLE IF NOT EXISTS clients (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    city VARCHAR(255) NOT NULL,
    phone VARCHAR(100),
    address TEXT,
    price_type INTEGER NOT NULL DEFAULT 1, -- 1: Прайс 1 (Розница), 2: Прайс 2 (Опт), 3: Прайс 3 (Full)
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Каталог товаров / Ламп
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    article VARCHAR(100) UNIQUE,
    sale_price NUMERIC(15, 2) NOT NULL DEFAULT 0,    -- Цена по Прайс-листу 1 (Розница)
    sale_price_2 NUMERIC(15, 2) NOT NULL DEFAULT 0,  -- Цена по Прайс-листу 2 (Опт)
    sale_price_3 NUMERIC(15, 2) NOT NULL DEFAULT 0,  -- Цена по Прайс-листу 3 (Full)
    cost_price NUMERIC(15, 2) NOT NULL DEFAULT 0,    -- Себестоимость для Прайса 1 и 3
    cost_price_2 NUMERIC(15, 2) NOT NULL DEFAULT 0,  -- Себестоимость для Прайса 2 (Опт)
    manufacturer VARCHAR(255),
    unit VARCHAR(50) DEFAULT 'шт',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Заказы
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    order_date DATE NOT NULL,
    price_type INTEGER NOT NULL DEFAULT 1, -- 1: Розница, 2: Опт, 3: Full
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active' или 'cancelled'
    total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
    cost_total NUMERIC(15, 2) NOT NULL DEFAULT 0,
    profit_total NUMERIC(15, 2) NOT NULL DEFAULT 0,
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Позиции заказов (с фиксацией снимков цен на момент сделки)
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name_snapshot VARCHAR(255) NOT NULL,
    article_snapshot VARCHAR(100),
    sale_price_snapshot NUMERIC(15, 2) NOT NULL,
    cost_price_snapshot NUMERIC(15, 2) NOT NULL,
    quantity INTEGER NOT NULL,
    total NUMERIC(15, 2) NOT NULL,
    cost_total NUMERIC(15, 2) NOT NULL,
    profit NUMERIC(15, 2) NOT NULL
);

-- 6. Производители (распределение прибыли)
CREATE TABLE IF NOT EXISTS manufacturers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    percentage NUMERIC(5, 2) NOT NULL DEFAULT 50.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Выплаты производителям
CREATE TABLE IF NOT EXISTS manufacturer_payments (
    id SERIAL PRIMARY KEY,
    manufacturer_id INTEGER NOT NULL REFERENCES manufacturers(id) ON DELETE RESTRICT,
    payment_date DATE NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    payment_method VARCHAR(100) NOT NULL DEFAULT 'Наличные',
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. История взаиморасчетов
CREATE TABLE IF NOT EXISTS settlement_history (
    id SERIAL PRIMARY KEY,
    manufacturer_id INTEGER NOT NULL REFERENCES manufacturers(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. Системные настройки
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. Разрешенные устройства (при работе в локальной сети)
CREATE TABLE IF NOT EXISTS allowed_devices (
    id SERIAL PRIMARY KEY,
    device_name VARCHAR(255) NOT NULL,
    mac_address VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'allowed',
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для быстрой фильтрации и высокой производительности
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
