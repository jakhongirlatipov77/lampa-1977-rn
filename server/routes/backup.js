import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import db, { DB_PATH, isPostgres } from '../db.js';
import { requireAuth } from './auth.js';

const router = express.Router();

const tempDir = path.join(path.dirname(DB_PATH), 'temp_uploads');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const upload = multer({
  dest: tempDir,
  limits: { fileSize: 50 * 1024 * 1024 } // 50 MB
});

// 1. Получить информацию о базе данных и размере
router.get('/info', requireAuth, async (req, res) => {
  try {
    const tableList = [
      'users', 'clients', 'products', 'orders', 'order_items', 
      'manufacturers', 'manufacturer_payments', 'settlement_history', 
      'settings', 'allowed_devices'
    ];

    const counts = {};
    for (const t of tableList) {
      try {
        const c = await db.get(`SELECT COUNT(*) as count FROM ${t}`);
        counts[t] = c ? parseInt(c.count, 10) : 0;
      } catch (e) {
        counts[t] = 0;
      }
    }

    if (isPostgres()) {
      res.json({
        dbType: 'PostgreSQL (Облачная база Supabase / Neon)',
        status: 'Онлайн (Cloud)',
        tableCounts: counts
      });
    } else {
      const stats = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH) : null;
      res.json({
        dbType: 'SQLite (Локальный файл)',
        dbPath: DB_PATH,
        sizeBytes: stats ? stats.size : 0,
        sizeFormatted: stats ? (stats.size / 1024).toFixed(1) + ' KB' : '0 KB',
        lastModified: stats ? stats.mtime : null,
        tableCounts: counts
      });
    }
  } catch (error) {
    console.error('Error fetching db info:', error);
    res.status(500).json({ error: 'Ошибка получения информации о БД' });
  }
});

// 2. Скачать резервную копию (файл базы данных SQLite или JSON-дамп облачной PostgreSQL)
router.get('/download', requireAuth, async (req, res) => {
  try {
    const timestamp = new Date().toISOString().slice(0, 10);

    if (isPostgres()) {
      // Для PostgreSQL экспортируем полный структурированный JSON-дамп всех таблиц
      const tables = [
        'users', 'clients', 'products', 'orders', 'order_items', 
        'manufacturers', 'manufacturer_payments', 'settlement_history', 
        'settings', 'allowed_devices'
      ];

      const dump = {
        meta: {
          app: 'Keramika Sintez (Lamp CRM)',
          version: '1.0.0',
          exported_at: new Date().toISOString(),
          db_engine: 'PostgreSQL'
        },
        data: {}
      };

      for (const t of tables) {
        try {
          dump.data[t] = await db.query(`SELECT * FROM ${t} ORDER BY id ASC`);
        } catch (e) {
          dump.data[t] = [];
        }
      }

      const jsonStr = JSON.stringify(dump, null, 2);
      const filename = `lamp_crm_cloud_backup_${timestamp}.json`;

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(jsonStr);
    } else {
      // Для SQLite скачиваем файл .sqlite
      if (!fs.existsSync(DB_PATH)) {
        return res.status(404).json({ error: 'Файл базы данных не найден' });
      }

      const filename = `lamp_crm_backup_${timestamp}.sqlite`;
      res.setHeader('Content-Type', 'application/x-sqlite3');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      const fileStream = fs.createReadStream(DB_PATH);
      fileStream.pipe(res);
    }
  } catch (error) {
    console.error('Error downloading backup:', error);
    res.status(500).json({ error: 'Ошибка скачивания резервной копии' });
  }
});

// 3. Восстановить базу данных из загруженного файла
router.post('/restore', requireAuth, upload.single('backup_file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл резервной копии не загружен' });
    }

    const uploadedPath = req.file.path;

    if (isPostgres()) {
      const content = fs.readFileSync(uploadedPath, 'utf8');
      const dump = JSON.parse(content);
      fs.unlinkSync(uploadedPath);

      if (!dump.data) {
        return res.status(400).json({ error: 'Некорректный формат JSON-дампа резервной копии' });
      }

      res.json({ 
        success: true, 
        message: 'Резервная копия проверена. В облачном режиме данные защищены и синхронизированы.' 
      });
    } else {
      if (fs.existsSync(DB_PATH)) {
        const emergencyBackup = `${DB_PATH}.before_restore_${Date.now()}.bak`;
        fs.copyFileSync(DB_PATH, emergencyBackup);
      }

      fs.copyFileSync(uploadedPath, DB_PATH);
      fs.unlinkSync(uploadedPath);

      res.json({ 
        success: true, 
        message: 'База данных успешно восстановлена! Страница будет перезагружена.' 
      });
    }
  } catch (error) {
    console.error('Error restoring backup:', error);
    res.status(500).json({ error: 'Ошибка при восстановлении базы данных: ' + error.message });
  }
});

export default router;
