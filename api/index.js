import { app, ensureDatabaseReady } from '../server/server.js';

export default async function handler(req, res) {
  try {
    await ensureDatabaseReady();
    return app(req, res);
  } catch (error) {
    console.error('Vercel serverless execution error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера (Database/Serverless error): ' + error.message });
  }
}
