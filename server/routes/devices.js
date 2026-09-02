import express from 'express';
import db from '../db.js';
import { requireAuth } from './auth.js';
import { normalizeMac, isValidMac, resolveClientMac } from '../utils/macResolver.js';

const router = express.Router();

// Middleware для проверки прав администратора
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ разрешен только администраторам системы' });
  }
  next();
};

/**
 * GET /api/devices
 * Получить список всех разрешённых/заблокированных устройств
 */
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const devices = await db.query(
      'SELECT id, device_name, mac_address, status, comment, created_at, updated_at FROM allowed_devices ORDER BY id ASC'
    );
    
    // Также определяем текущее устройство администратора
    const currentDevice = await resolveClientMac(req);

    res.json({
      success: true,
      devices,
      current_device: currentDevice
    });
  } catch (error) {
    console.error('Error fetching allowed devices:', error);
    res.status(500).json({ error: 'Ошибка при получении списка устройств' });
  }
});

/**
 * GET /api/devices/current-mac
 * Получить текущий MAC-адрес и сетевой статус клиента
 */
router.get('/current-mac', requireAuth, async (req, res) => {
  try {
    const currentDevice = await resolveClientMac(req);
    res.json({
      success: true,
      ...currentDevice
    });
  } catch (error) {
    console.error('Error resolving current client MAC:', error);
    res.status(500).json({ error: 'Ошибка определения текущего MAC-адреса' });
  }
});

/**
 * POST /api/devices
 * Добавить новое устройство в список (по MAC или по Device ID)
 */
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { device_name, mac_address, status = 'allowed', comment = '' } = req.body;

    if (!device_name || !device_name.trim()) {
      return res.status(400).json({ error: 'Укажите название устройства' });
    }

    if (!mac_address || !mac_address.trim()) {
      return res.status(400).json({
        error: 'Укажите MAC-адрес (XX:XX:XX:XX:XX:XX) или Код устройства (DEV-XXXX-XXXX)'
      });
    }

    const cleanInput = mac_address.trim().toUpperCase();
    const normMac = normalizeMac(cleanInput) || cleanInput;

    const existing = await db.get('SELECT id FROM allowed_devices WHERE mac_address = ?', [normMac]);
    if (existing) {
      return res.status(400).json({
        error: `Устройство с идентификатором ${normMac} уже зарегистрировано в системе`
      });
    }

    const deviceStatus = status === 'blocked' ? 'blocked' : 'allowed';

    const result = await db.run(
      'INSERT INTO allowed_devices (device_name, mac_address, status, comment) VALUES (?, ?, ?, ?)',
      [device_name.trim(), normMac, deviceStatus, comment ? comment.trim() : '']
    );

    const newDevice = await db.get('SELECT * FROM allowed_devices WHERE id = ?', [result.id]);

    res.status(201).json({
      success: true,
      message: 'Устройство успешно добавлено',
      device: newDevice
    });
  } catch (error) {
    console.error('Error adding allowed device:', error);
    res.status(500).json({ error: 'Ошибка при добавлении устройства' });
  }
});

/**
 * PUT /api/devices/:id
 * Редактировать устройство или изменить статус (Разрешено / Заблокировано)
 */
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { device_name, mac_address, status, comment } = req.body;

    const device = await db.get('SELECT * FROM allowed_devices WHERE id = ?', [id]);
    if (!device) {
      return res.status(404).json({ error: 'Устройство не найдено' });
    }

    let nextName = device.device_name;
    if (device_name !== undefined) {
      if (!device_name.trim()) {
        return res.status(400).json({ error: 'Название устройства не может быть пустым' });
      }
      nextName = device_name.trim();
    }

    let nextMac = device.mac_address;
    if (mac_address !== undefined) {
      const cleanInput = mac_address.trim().toUpperCase();
      nextMac = normalizeMac(cleanInput) || cleanInput;
      const duplicate = await db.get('SELECT id FROM allowed_devices WHERE mac_address = ? AND id != ?', [nextMac, id]);
      if (duplicate) {
        return res.status(400).json({
          error: `Устройство с идентификатором ${nextMac} уже зарегистрировано в системе`
        });
      }
    }

    let nextStatus = device.status;
    if (status !== undefined) {
      nextStatus = status === 'blocked' ? 'blocked' : 'allowed';
      
      // Защита: нельзя заблокировать последнее разрешенное устройство
      if (nextStatus === 'blocked' && device.status === 'allowed') {
        const remainingAllowed = await db.get(
          'SELECT COUNT(*) as count FROM allowed_devices WHERE status = "allowed" AND id != ?',
          [id]
        );
        if (remainingAllowed.count === 0) {
          return res.status(400).json({
            error: 'Невозможно заблокировать последнее разрешённое устройство. В системе должно оставаться как минимум одно активное устройство для доступа администратора.'
          });
        }
      }
    }

    const nextComment = comment !== undefined ? (comment ? comment.trim() : '') : device.comment;

    await db.run(
      `UPDATE allowed_devices 
       SET device_name = ?, mac_address = ?, status = ?, comment = ?, updated_at = datetime('now', 'localtime') 
       WHERE id = ?`,
      [nextName, nextMac, nextStatus, nextComment, id]
    );

    const updated = await db.get('SELECT * FROM allowed_devices WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Устройство успешно обновлено',
      device: updated
    });
  } catch (error) {
    console.error('Error updating allowed device:', error);
    res.status(500).json({ error: 'Ошибка при обновлении устройства' });
  }
});

/**
 * DELETE /api/devices/:id
 * Удалить устройство из списка разрешённых
 */
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const device = await db.get('SELECT * FROM allowed_devices WHERE id = ?', [id]);
    if (!device) {
      return res.status(404).json({ error: 'Устройство не найдено' });
    }

    // Защита: нельзя удалить последнее разрешенное устройство
    if (device.status === 'allowed') {
      const remainingAllowed = await db.get(
        'SELECT COUNT(*) as count FROM allowed_devices WHERE status = "allowed" AND id != ?',
        [id]
      );
      if (remainingAllowed.count === 0) {
        return res.status(400).json({
          error: 'Невозможно удалить последнее разрешённое устройство. В системе должно оставаться как минимум одно активное устройство для доступа администратора.'
        });
      }
    }

    await db.run('DELETE FROM allowed_devices WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Устройство успешно удалено'
    });
  } catch (error) {
    console.error('Error deleting allowed device:', error);
    res.status(500).json({ error: 'Ошибка при удалении устройства' });
  }
});

export default router;
