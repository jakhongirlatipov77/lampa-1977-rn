import os from 'os';
import { exec } from 'child_process';

/**
 * Нормализует MAC-адрес к формату XX:XX:XX:XX:XX:XX в верхнем регистре
 * @param {string} mac 
 * @returns {string|null}
 */
export function normalizeMac(mac) {
  if (!mac || typeof mac !== 'string') return null;
  const cleaned = mac.trim().replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
  if (cleaned.length !== 12) return null;
  return cleaned.match(/.{1,2}/g).join(':');
}

/**
 * Проверяет корректность формата MAC-адреса
 * @param {string} mac 
 * @returns {boolean}
 */
export function isValidMac(mac) {
  if (!mac || typeof mac !== 'string') return false;
  const regex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$|^[0-9A-Fa-f]{12}$/;
  return regex.test(mac.trim());
}

/**
 * Получает очищенный IP-адрес клиента из HTTP-запроса Express
 * @param {import('express').Request} req 
 * @returns {string}
 */
export function getClientIp(req) {
  let ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '';
  if (typeof ip === 'string' && ip.includes(',')) {
    ip = ip.split(',')[0].trim();
  }
  // Очистка от префикса IPv6-mapped IPv4
  if (typeof ip === 'string') {
    if (ip.startsWith('::ffff:')) {
      ip = ip.replace('::ffff:', '');
    }
    if (ip === '::1') {
      ip = '127.0.0.1';
    }
  }
  return ip.trim();
}

/**
 * Получает список всех физических MAC-адресов текущего сервера
 * @returns {string[]}
 */
export function getServerMacs() {
  const macs = new Set();
  const interfaces = os.networkInterfaces();
  
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.mac && net.mac !== '00:00:00:00:00:00' && !net.internal) {
        const norm = normalizeMac(net.mac);
        if (norm) macs.add(norm);
      }
    }
  }
  return Array.from(macs);
}

/**
 * Проверяет, принадлежит ли указанный IP текущему серверу (localhost или локальный IP сетевой карты)
 * @param {string} ip 
 * @returns {boolean}
 */
export function isServerIp(ip) {
  if (!ip) return false;
  if (ip === '127.0.0.1' || ip === 'localhost' || ip === '::1' || ip === '0.0.0.0') {
    return true;
  }
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.address === ip) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Разрешает MAC-адрес удаленного IP через системную ARP-таблицу (Windows / Linux / macOS)
 * @param {string} ip 
 * @returns {Promise<string|null>}
 */
export function resolveMacFromArp(ip) {
  return new Promise((resolve) => {
    if (!ip || isServerIp(ip)) {
      return resolve(null);
    }

    const cmd = process.platform === 'win32' ? `arp -a ${ip}` : `arp -n ${ip}`;
    
    exec(cmd, { timeout: 2000 }, (error, stdout) => {
      if (error || !stdout) {
        return resolve(null);
      }

      // Поиск MAC-адреса в выводе команды ARP
      // Поддерживает форматы XX-XX-XX-XX-XX-XX и XX:XX:XX:XX:XX:XX
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (line.includes(ip)) {
          const match = line.match(/([0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2})/);
          if (match) {
            const mac = normalizeMac(match[1]);
            if (mac && mac !== '00:00:00:00:00:00' && mac !== 'FF:FF:FF:FF:FF:FF') {
              return resolve(mac);
            }
          }
        }
      }

      // Если строка с конкретным IP не отфильтровалась, ищем любой валидный MAC в выводе
      const match = stdout.match(/([0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2})/);
      if (match) {
        const mac = normalizeMac(match[1]);
        if (mac && mac !== '00:00:00:00:00:00' && mac !== 'FF:FF:FF:FF:FF:FF') {
          return resolve(mac);
        }
      }

      resolve(null);
    });
  });
}

/**
 * Комплексно определяет MAC-адрес клиента по HTTP-запросу
 * @param {import('express').Request} req 
 * @returns {Promise<{ mac: string|null, isLocalhost: boolean, serverMacs: string[], ip: string }>}
 */
export async function resolveClientMac(req) {
  const ip = getClientIp(req);
  const serverMacs = getServerMacs();
  const isLocal = isServerIp(ip);

  if (isLocal) {
    // Клиент подключается непосредственно с сервера/компьютера
    const primaryMac = serverMacs[0] || null;
    return {
      mac: primaryMac,
      isLocalhost: true,
      serverMacs,
      ip
    };
  }

  // Клиент подключается по локальной сети
  const arpMac = await resolveMacFromArp(ip);
  return {
    mac: arpMac,
    isLocalhost: false,
    serverMacs,
    ip
  };
}

export default {
  normalizeMac,
  isValidMac,
  getClientIp,
  getServerMacs,
  isServerIp,
  resolveMacFromArp,
  resolveClientMac
};
