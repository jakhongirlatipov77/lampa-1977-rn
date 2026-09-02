/**
 * Keramika Sintez — Core Application Engine & SPA Router
 */

// Глобальное состояние приложения
const AppState = {
  currentUser: null,
  currentPage: 'dashboard',
  currency: 'сум',
  usdRate: { buy: 11775, sell: 11865 },
  productsCache: [],
  clientsCache: [],
  manufacturersCache: []
};

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', async () => {
  setupTheme();
  setupSidebar();
  
  // Загружаем курс доллара
  loadCurrencyRates();
  setInterval(loadCurrencyRates, 5 * 60 * 1000);

  // Проверка авторизации
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    window.location.href = '/login.html';
    return;
  }

  // Навешиваем слушатели навигации
  window.addEventListener('hashchange', handleRoute);
  
  // Первая загрузка маршрута
  handleRoute();
});

/* ==========================================================================
   Курс доллара к суму (Ипак Йули Банк)
   ========================================================================== */
async function loadCurrencyRates() {
  const buyEl = document.getElementById('rate-usd-buy');
  const sellEl = document.getElementById('rate-usd-sell');
  if (!buyEl || !sellEl) return;

  try {
    const res = await fetch('/api/currency/rates');
    if (res.ok) {
      const data = await res.json();
      if (data && data.buy && data.sell) {
        buyEl.textContent = data.buy;
        sellEl.textContent = data.sell;
        AppState.usdRate = {
          buy: data.buyNum || parseFloat(data.buy.replace(/\s+/g, '')),
          sell: data.sellNum || parseFloat(data.sell.replace(/\s+/g, '')),
          bank: data.bank
        };
      }
    }
  } catch (err) {
    console.warn('Could not update live currency rate:', err.message);
  }
}

/* ==========================================================================
   Авторизация и сессия
   ========================================================================== */
async function checkAuth() {
  try {
    const res = await api('/api/auth/me');
    if (res && res.user) {
      AppState.currentUser = res.user;
      const nameEl = document.getElementById('user-display-name');
      if (nameEl) nameEl.textContent = res.user.full_name || res.user.username;
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

async function handleLogout() {
  if (confirm('Вы уверены, что хотите выйти из системы?')) {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    localStorage.removeItem('user_token');
    localStorage.removeItem('user_info');
    window.location.href = '/login.html';
  }
}

// Привязка кнопок выхода
document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
document.getElementById('header-logout-btn')?.addEventListener('click', handleLogout);

/* ==========================================================================
   API Client Wrapper
   ========================================================================== */
async function api(endpoint, options = {}) {
  const token = localStorage.getItem('user_token');
  const headers = {
    ...options.headers
  };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(endpoint, {
      ...options,
      headers
    });

    if (response.status === 401) {
      localStorage.removeItem('user_token');
      window.location.href = '/login.html';
      return null;
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Произошла ошибка при выполнении запроса');
    }

    return data;
  } catch (error) {
    console.error(`API Error on [${endpoint}]:`, error);
    throw error;
  }
}

/* ==========================================================================
   SPA Router
   ========================================================================== */
function navigate(pageName, params = {}) {
  window.location.hash = `#${pageName}`;
  if (params && Object.keys(params).length > 0) {
    window.pageParams = params;
  }
}

function handleRoute() {
  const hash = window.location.hash.replace('#', '') || 'dashboard';
  const [pageName] = hash.split('?');
  
  AppState.currentPage = pageName;

  // Обновляем активные ссылки в меню
  document.querySelectorAll('.nav-link, .mobile-nav-item').forEach(link => {
    if (link.getAttribute('data-page') === pageName) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Закрываем мобильное меню при переходе
  closeMobileSidebar();

  // Загружаем соответствующую страницу
  renderPage(pageName);
}

async function renderPage(pageName) {
  const container = document.getElementById('page-view');
  const loader = document.getElementById('page-loading');
  const titleEl = document.getElementById('page-title');
  const subtitleEl = document.getElementById('page-subtitle');

  if (loader) loader.classList.remove('d-none');
  if (container) container.innerHTML = '';

  try {
    switch (pageName) {
      case 'dashboard':
        titleEl.textContent = 'Главная панель';
        subtitleEl.textContent = 'Ключевые финансовые показатели, продажи и расчеты с производителями';
        await renderDashboardPage(container);
        break;

      case 'orders':
        titleEl.textContent = 'Журнал продаж';
        subtitleEl.textContent = 'Полный список заказов с составом ламп, суммами, себестоимостью и прибылью';
        await renderOrdersPage(container);
        break;

      case 'new-order':
        titleEl.textContent = 'Новый заказ';
        subtitleEl.textContent = 'Оформление продажи с автоподстановкой цен, расчетом себестоимости и прибыли';
        await renderNewOrderPage(container);
        break;

      case 'clients':
        titleEl.textContent = 'База клиентов';
        subtitleEl.textContent = 'Клиенты, история заказов, общая сумма покупок и принесенная прибыль';
        await renderClientsPage(container);
        break;

      case 'products':
        titleEl.textContent = 'Прайс-лист ламп';
        subtitleEl.textContent = 'Управление ценами продажи, себестоимостью и активностью ламп';
        await renderProductsPage(container);
        break;

      case 'settlements':
        titleEl.textContent = 'Расчеты с производителями';
        subtitleEl.textContent = 'Начисленная прибыль, полученные выплаты и текущие остатки задолженности';
        await renderSettlementsPage(container);
        break;

      case 'payments':
        titleEl.textContent = 'Журнал выплат';
        subtitleEl.textContent = 'История всех выплат производителям с фильтрацией и способами оплаты';
        await renderPaymentsPage(container);
        break;

      case 'stats':
        titleEl.textContent = 'Статистика и Аналитика';
        subtitleEl.textContent = 'Детальные отчеты по клиентам, лампам и помесячная сводная таблица';
        await renderStatsPage(container);
        break;

      case 'settings':
        titleEl.textContent = 'Настройки системы';
        subtitleEl.textContent = 'Распределение долей прибыли, смена пароля и резервное копирование БД';
        await renderSettingsPage(container);
        break;

      default:
        container.innerHTML = `<div class="card p-4 text-center"><h3>Страница не найдена</h3><button class="btn btn-primary mt-3" onclick="navigate('dashboard')">На главную</button></div>`;
    }
  } catch (err) {
    console.error('Render page error:', err);
    container.innerHTML = `
      <div class="card p-4 text-center">
        <h4 class="text-danger mb-2"><i class="fa-solid fa-triangle-exclamation"></i> Ошибка загрузки страницы</h4>
        <p class="text-muted">${err.message || 'Не удалось загрузить данные'}</p>
        <button class="btn btn-secondary mt-3" onclick="renderPage('${pageName}')">Попробовать снова</button>
      </div>
    `;
  } finally {
    if (loader) loader.classList.add('d-none');
  }
}

/* ==========================================================================
   Утилиты форматирования
   ========================================================================== */
function formatMoney(amount, showCurrency = true) {
  if (amount === undefined || amount === null || isNaN(amount)) return '0 ' + (showCurrency ? AppState.currency : '');
  const num = Math.round(Number(amount) * 100) / 100;
  const parts = num.toString().split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const formatted = parts.join('.');
  return showCurrency ? `${formatted} ${AppState.currency}` : formatted;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  } catch (e) {
    return dateStr;
  }
}

function getTodayDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/* ==========================================================================
   Модальные окна (Modal Management)
   ========================================================================== */
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Специфические подготовки
    if (modalId === 'modal-payment') {
      loadManufacturersIntoPaymentSelect();
      document.getElementById('payment-date').value = getTodayDateString();
    }
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// Глобальные хелперы открытия модальных окон добавления
function openAddClientModal() {
  const form = document.getElementById('form-client');
  if (form) form.reset();
  const idEl = document.getElementById('client-id');
  if (idEl) idEl.value = '';
  const priceTypeEl = document.getElementById('client-price-type');
  if (priceTypeEl) priceTypeEl.value = '1';
  const titleEl = document.getElementById('modal-client-title');
  if (titleEl) titleEl.textContent = 'Новый клиент';
  openModal('modal-client');
}

function openAddProductModal() {
  const form = document.getElementById('form-product');
  if (form) form.reset();
  const idEl = document.getElementById('product-id');
  if (idEl) idEl.value = '';
  const activeEl = document.getElementById('product-active');
  if (activeEl) activeEl.value = '1';
  const titleEl = document.getElementById('modal-product-title');
  if (titleEl) titleEl.textContent = 'Добавить лампу в прайс';
  if (typeof calculateProductMarginPreview === 'function') calculateProductMarginPreview();
  openModal('modal-product');
}

async function openAddPaymentModal(mfgId = null) {
  const form = document.getElementById('form-payment');
  if (form) form.reset();
  const idEl = document.getElementById('payment-id');
  if (idEl) idEl.value = '';
  const titleEl = document.getElementById('modal-payment-title');
  if (titleEl) titleEl.textContent = 'Внести выплату производителю';
  
  await loadManufacturersIntoPaymentSelect();
  const dateEl = document.getElementById('payment-date');
  if (dateEl) dateEl.value = getTodayDateString();

  if (mfgId) {
    setTimeout(() => {
      const sel = document.getElementById('payment-manufacturer-id');
      if (sel) sel.value = mfgId;
    }, 50);
  }

  openModal('modal-payment');
}

// Закрытие модального окна по клику вне диалога
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal(modal.id);
    }
  });
});

/* ==========================================================================
   Всплывающие уведомления (Toasts)
   ========================================================================== */
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icon = type === 'success' ? 'fa-circle-check text-success' : (type === 'error' ? 'fa-circle-exclamation text-danger' : 'fa-circle-info text-primary');
  
  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/* ==========================================================================
   Тема и Навигация
   ========================================================================== */
function setupTheme() {
  const savedTheme = localStorage.getItem('app_theme') || 'dark-theme';
  document.body.className = savedTheme;

  const btn = document.getElementById('theme-toggle-btn');
  btn?.addEventListener('click', () => {
    if (document.body.classList.contains('dark-theme')) {
      document.body.classList.remove('dark-theme');
      document.body.classList.add('light-theme');
      localStorage.setItem('app_theme', 'light-theme');
    } else {
      document.body.classList.remove('light-theme');
      document.body.classList.add('dark-theme');
      localStorage.setItem('app_theme', 'dark-theme');
    }
  });
}

function setupSidebar() {
  const toggleBtn = document.getElementById('sidebar-toggle-btn');
  const closeBtn = document.getElementById('sidebar-close-btn');
  const overlay = document.getElementById('sidebar-overlay');
  const sidebar = document.getElementById('sidebar');

  toggleBtn?.addEventListener('click', () => {
    sidebar.classList.add('mobile-open');
    overlay.classList.add('active');
  });

  closeBtn?.addEventListener('click', closeMobileSidebar);
  overlay?.addEventListener('click', closeMobileSidebar);
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar?.classList.remove('mobile-open');
  overlay?.classList.remove('active');
}

/* ==========================================================================
   Глобальные обработчики форм
   ========================================================================== */

// 1. Сохранение клиента
async function handleClientSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('client-id').value;
  const name = document.getElementById('client-name').value.trim();
  const city = document.getElementById('client-city').value.trim();
  const phone = document.getElementById('client-phone').value.trim();
  const address = document.getElementById('client-address').value.trim();
  const price_type = parseInt(document.getElementById('client-price-type')?.value, 10) || 1;
  const comment = document.getElementById('client-comment').value.trim();

  const btn = document.getElementById('btn-save-client');
  btn.disabled = true;

  try {
    const payload = { name, city, phone, address, price_type, comment };
    let res;
    if (id) {
      res = await api(`/api/clients/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Данные клиента успешно обновлены');

      if (AppState.currentPage === 'new-order' && typeof onClientUpdatedInline === 'function') {
        onClientUpdatedInline(res.client);
      }
    } else {
      res = await api('/api/clients', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Новый клиент успешно добавлен!');
      
      // Если мы находимся на странице нового заказа, подставим созданного клиента
      if (AppState.currentPage === 'new-order' && typeof onClientCreatedInline === 'function') {
        onClientCreatedInline(res.client);
      }
    }

    closeModal('modal-client');
    document.getElementById('form-client').reset();
    document.getElementById('client-id').value = '';

    // Перерисовываем страницу, если нужно (на new-order обновляем точечно без сброса набранных товаров)
    if (['clients', 'dashboard', 'orders'].includes(AppState.currentPage)) {
      renderPage(AppState.currentPage);
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// 2. Сохранение лампы в прайсе (с тремя ценами и раздельной себестоимостью)
async function handleProductSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('product-id').value;
  const name = document.getElementById('product-name').value.trim();
  const article = document.getElementById('product-article').value.trim();
  const sale_price = parseFloat(document.getElementById('product-sale-price').value);
  const sale_price_2 = parseFloat(document.getElementById('product-sale-price-2').value);
  const sale_price_3 = parseFloat(document.getElementById('product-sale-price-3')?.value || document.getElementById('product-sale-price-2').value);
  const cost_price = parseFloat(document.getElementById('product-cost-price').value);
  const cost_price_2 = parseFloat(document.getElementById('product-cost-price-2')?.value || document.getElementById('product-cost-price').value);
  const manufacturer = document.getElementById('product-manufacturer').value.trim();
  const unit = document.getElementById('product-unit').value.trim();
  const active = parseInt(document.getElementById('product-active').value, 10);

  const btn = document.getElementById('btn-save-product');
  btn.disabled = true;

  try {
    const payload = { name, article, sale_price, sale_price_2, sale_price_3, cost_price, cost_price_2, manufacturer, unit, active };
    if (id) {
      await api(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Лампа в прайсе успешно обновлена');
    } else {
      await api('/api/products', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Новая лампа добавлена в прайс-лист!');
    }

    closeModal('modal-product');
    document.getElementById('form-product').reset();
    document.getElementById('product-id').value = '';

    if (['products', 'dashboard', 'new-order'].includes(AppState.currentPage)) {
      renderPage(AppState.currentPage);
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

function calculateProductMarginPreview() {
  const sale1 = parseFloat(document.getElementById('product-sale-price')?.value) || 0;
  const sale2 = parseFloat(document.getElementById('product-sale-price-2')?.value) || 0;
  const sale3 = parseFloat(document.getElementById('product-sale-price-3')?.value) || 0;
  const cost1 = parseFloat(document.getElementById('product-cost-price')?.value) || 0;
  const cost2 = parseFloat(document.getElementById('product-cost-price-2')?.value) || cost1;

  const profit1 = sale1 - cost1;
  const profit2 = sale2 - cost2;
  const profit3 = sale3 - cost1;

  const p1El = document.getElementById('preview-unit-profit-1');
  const p2El = document.getElementById('preview-unit-profit-2');
  const p3El = document.getElementById('preview-unit-profit-3');

  if (p1El) p1El.textContent = formatMoney(profit1);
  if (p2El) p2El.textContent = formatMoney(profit2);
  if (p3El) p3El.textContent = formatMoney(profit3);
}

// 3. Сохранение выплаты производителю
async function handlePaymentSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('payment-id').value;
  const manufacturer_id = document.getElementById('payment-manufacturer-id').value;
  const payment_date = document.getElementById('payment-date').value;
  const amount = parseFloat(document.getElementById('payment-amount').value);
  const payment_method = document.getElementById('payment-method').value;
  const comment = document.getElementById('payment-comment').value.trim();

  const btn = document.getElementById('btn-save-payment');
  btn.disabled = true;

  try {
    const payload = { manufacturer_id, payment_date, amount, payment_method, comment };
    if (id) {
      await api(`/api/payments/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Выплата успешно отредактирована');
    } else {
      await api('/api/payments', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Выплата производителю успешно зафиксирована!');
    }

    closeModal('modal-payment');
    document.getElementById('form-payment').reset();
    document.getElementById('payment-id').value = '';

    if (['settlements', 'payments', 'dashboard', 'stats'].includes(AppState.currentPage)) {
      renderPage(AppState.currentPage);
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function loadManufacturersIntoPaymentSelect() {
  try {
    const data = await api('/api/manufacturers');
    const select = document.getElementById('payment-manufacturer-id');
    if (select && data.manufacturers) {
      select.innerHTML = data.manufacturers.map(m => `
        <option value="${m.id}">${m.name} (${m.percentage}%) — остаток долга: ${formatMoney(m.remaining_debt)}</option>
      `).join('');
    }
  } catch (e) {}
}

// 4. Настройки долей производителей
async function openMfgSettingsModal(p1, n1, p2, n2) {
  if (p1 === undefined || n1 === undefined) {
    try {
      const data = await api('/api/manufacturers');
      if (data && data.manufacturers && data.manufacturers.length >= 2) {
        n1 = data.manufacturers[0].name;
        p1 = data.manufacturers[0].percentage;
        n2 = data.manufacturers[1].name;
        p2 = data.manufacturers[1].percentage;
      }
    } catch (e) {
      console.error('Error loading mfg settings:', e);
    }
  }
  const elN1 = document.getElementById('mfg1-name');
  const elP1 = document.getElementById('mfg1-percentage');
  const elN2 = document.getElementById('mfg2-name');
  const elP2 = document.getElementById('mfg2-percentage');

  if (elN1) elN1.value = n1 || 'Производитель 1';
  if (elP1) elP1.value = (p1 !== undefined && p1 !== null) ? p1 : 50;
  if (elN2) elN2.value = n2 || 'Производитель 2';
  if (elP2) elP2.value = (p2 !== undefined && p2 !== null) ? p2 : 50;
  
  autoBalanceMfgPct(1);
  openModal('modal-mfg-settings');
}

function autoBalanceMfgPct(changedIndex) {
  const p1 = document.getElementById('mfg1-percentage');
  const p2 = document.getElementById('mfg2-percentage');
  
  if (changedIndex === 1) {
    const val1 = parseFloat(p1.value) || 0;
    p2.value = Math.max(0, 100 - val1);
  } else {
    const val2 = parseFloat(p2.value) || 0;
    p1.value = Math.max(0, 100 - val2);
  }

  const sum = (parseFloat(p1.value) || 0) + (parseFloat(p2.value) || 0);
  const statusEl = document.getElementById('mfg-total-pct-val');
  if (statusEl) {
    statusEl.textContent = `${sum}%`;
    statusEl.className = sum === 100 ? 'text-success' : 'text-danger';
  }
}

async function handleMfgSettingsSubmit(e) {
  e.preventDefault();
  const name1 = document.getElementById('mfg1-name').value.trim();
  const p1 = parseFloat(document.getElementById('mfg1-percentage').value);
  const name2 = document.getElementById('mfg2-name').value.trim();
  const p2 = parseFloat(document.getElementById('mfg2-percentage').value);

  if (p1 + p2 !== 100) {
    showToast('Сумма процентов должна быть строго равна 100%', 'error');
    return;
  }

  try {
    await api('/api/manufacturers', {
      method: 'PUT',
      body: JSON.stringify({
        manufacturers: [
          { id: 1, name: name1, percentage: p1 },
          { id: 2, name: name2, percentage: p2 }
        ]
      })
    });

    showToast('Настройки производителей и процентов успешно сохранены!');
    closeModal('modal-mfg-settings');
    renderPage(AppState.currentPage);
  } catch (err) {
    showToast(err.message, 'error');
  }
}
