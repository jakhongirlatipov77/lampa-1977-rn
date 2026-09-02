import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDatabase } from './db.js';

import authRouter from './routes/auth.js';
import productsRouter from './routes/products.js';
import clientsRouter from './routes/clients.js';
import ordersRouter from './routes/orders.js';
import manufacturersRouter from './routes/manufacturers.js';
import paymentsRouter from './routes/payments.js';
import statsRouter from './routes/stats.js';
import exportRouter from './routes/export.js';
import backupRouter from './routes/backup.js';
import currencyRouter from './routes/currency.js';
import devicesRouter from './routes/devices.js';
import passcodesRouter from './routes/passcodes.js';
import usersRouter from './routes/users.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Запрет индексации поисковиками (HTTP Header)
app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  next();
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Статические файлы фронтенда
app.use(express.static(path.join(__dirname, '..', 'public')));

// Подключение API маршрутов
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/passcodes', passcodesRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/products', productsRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/manufacturers', manufacturersRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/export', exportRouter);
app.use('/api/backup', backupRouter);
app.use('/api/currency', currencyRouter);

// Проверка работоспособности (Health check)
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    time: new Date().toISOString(), 
    system: 'Lamp Sales CRM (Keramika Sintez)',
    mode: process.env.DATABASE_URL ? 'PostgreSQL (Cloud)' : 'SQLite (Local)'
  });
});

// SPA fallback - перенаправление всех остальных GET-запросов на index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Маршрут API не найден' });
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Флаг и функция инициализации для serverless и standalone
let dbInitialized = false;
let initPromise = null;

export async function ensureDatabaseReady() {
  if (dbInitialized) return;
  if (!initPromise) {
    initPromise = (async () => {
      console.log('🔄 Инициализация базы данных...');
      await initDatabase();
      dbInitialized = true;
      console.log('✅ База данных готова к работе');
    })();
  }
  await initPromise;
}

// Запуск сервера в standalone режиме (Node.js / Docker / Render / VPS / Локально)
if (process.env.VERCEL !== '1') {
  async function startServer() {
    try {
      await ensureDatabaseReady();

      app.listen(PORT, HOST, () => {
        console.log(`=================================================`);
        console.log(`🚀 Сервер CRM учета ламп успешно запущен!`);
        console.log(`🔗 Локальный адрес:   http://localhost:${PORT}`);
        console.log(`🌐 Сетевой адрес:     http://${HOST}:${PORT}`);
        console.log(`🔑 Логин по умолчанию: admin`);
        console.log(`🔒 Пароль:             admin123`);
        console.log(`=================================================`);
      });
    } catch (error) {
      console.error('❌ Фатальная ошибка при запуске сервера:', error);
      process.exit(1);
    }
  }

  startServer();
}

export { app };
export default app;
