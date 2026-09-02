import express from 'express';

const router = express.Router();

// Кэш курсов валют в памяти (10 минут)
let cachedRates = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 минут

async function fetchIpakYuliRates() {
  const now = Date.now();
  if (cachedRates && (now - lastFetchTime < CACHE_TTL_MS)) {
    return cachedRates;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch('https://ru.ipakyulibank.uz/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru,en;q=0.9'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const html = await response.text();
      
      const buyMatch = html.match(/Покупка<\/span>\s*<span[^>]*>([\d\s]+)<\/span>/i);
      const sellMatch = html.match(/Продажа<\/span>\s*<span[^>]*>([\d\s]+)<\/span>/i);

      if (buyMatch && sellMatch) {
        const buyStr = buyMatch[1].trim();
        const sellStr = sellMatch[1].trim();
        const buyNum = parseFloat(buyStr.replace(/\s+/g, ''));
        const sellNum = parseFloat(sellStr.replace(/\s+/g, ''));

        cachedRates = {
          bank: 'Ипак Йули',
          currency: 'USD',
          buy: buyStr,
          sell: sellStr,
          buyNum,
          sellNum,
          source: 'https://ru.ipakyulibank.uz/',
          updatedAt: new Date().toISOString()
        };
        lastFetchTime = now;
        return cachedRates;
      }
    }
  } catch (err) {
    console.warn('Ipak Yuli fetch failed, attempting CBU fallback:', err.message);
  }

  // Fallback: Центральный Банк Узбекистана (CBU)
  try {
    const cbuRes = await fetch('https://cbu.uz/ru/arkhiv-kursov-valyut/json/USD/');
    if (cbuRes.ok) {
      const cbuData = await cbuRes.json();
      if (Array.isArray(cbuData) && cbuData.length > 0) {
        const cbuRate = parseFloat(cbuData[0].Rate);
        const formatted = Math.round(cbuRate).toLocaleString('ru-RU');
        cachedRates = {
          bank: 'ЦБ РУз (Ипак Йули)',
          currency: 'USD',
          buy: formatted,
          sell: formatted,
          buyNum: cbuRate,
          sellNum: cbuRate,
          source: 'https://cbu.uz/',
          updatedAt: new Date().toISOString()
        };
        lastFetchTime = now;
        return cachedRates;
      }
    }
  } catch (e) {
    console.warn('CBU fetch failed:', e.message);
  }

  // Если кэш уже был — вернем старый кэш
  if (cachedRates) {
    return cachedRates;
  }

  // Резервное значение по умолчанию
  return {
    bank: 'Ипак Йули',
    currency: 'USD',
    buy: '11 775',
    sell: '11 865',
    buyNum: 11775,
    sellNum: 11865,
    source: 'https://ru.ipakyulibank.uz/',
    updatedAt: new Date().toISOString()
  };
}

// Получить актуальный курс доллара
router.get('/rates', async (req, res) => {
  try {
    const rates = await fetchIpakYuliRates();
    res.json({ success: true, ...rates });
  } catch (error) {
    console.error('Error fetching currency rates:', error);
    res.status(500).json({
      error: 'Не удалось получить курс валют',
      bank: 'Ипак Йули',
      currency: 'USD',
      buy: '11 775',
      sell: '11 865'
    });
  }
});

export default router;
