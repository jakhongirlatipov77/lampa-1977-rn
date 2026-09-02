/**
 * Dashboard Page Module (LumiCRM)
 * Отображение всех 12 ключевых KPI блоков и 4 интерактивных диаграмм
 */

let dashboardCharts = {};

async function renderDashboardPage(container) {
  const data = await api('/api/stats/dashboard');
  if (!data) return;

  const { currentMonth, counts, manufacturers, charts } = data;
  const { mfg1, mfg2 } = manufacturers;

  container.innerHTML = `
    <!-- Заголовок раздела показателей -->
    <div style="margin-bottom: 1.25rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
      <h2 style="font-size: 1.35rem; font-weight: 800;">
        <i class="fa-solid fa-gauge-high text-primary mr-2"></i>
        Показатели за текущий месяц (${currentMonth.yearMonth})
      </h2>
      <div class="quick-actions-bar">
        <button class="btn btn-primary btn-sm glow-btn" onclick="navigate('new-order')">
          <i class="fa-solid fa-cart-plus"></i> + Новый заказ
        </button>
        <button class="btn btn-secondary btn-sm" onclick="openAddClientModal()">
          <i class="fa-solid fa-user-plus"></i> + Клиент
        </button>
        <button class="btn btn-secondary btn-sm" onclick="openAddPaymentModal()">
          <i class="fa-solid fa-money-bill-transfer"></i> + Выплата
        </button>
      </div>
    </div>

    <!-- 1. Основные финансовые KPI текущего месяца (6 блоков) -->
    <div class="metrics-grid">
      <!-- 1. Выручка -->
      <div class="metric-card" style="--card-accent: #3b82f6; --icon-bg: rgba(59, 130, 246, 0.15); --icon-color: #3b82f6;">
        <div class="metric-header">
          <span class="metric-label">Выручка за месяц</span>
          <div class="metric-icon-box"><i class="fa-solid fa-wallet"></i></div>
        </div>
        <div class="metric-value">${formatMoney(currentMonth.revenue)}</div>
        <div class="metric-footer"><i class="fa-solid fa-calendar-day text-primary"></i> Продажи за текущий месяц</div>
      </div>

      <!-- 2. Себестоимость -->
      <div class="metric-card" style="--card-accent: #f59e0b; --icon-bg: rgba(245, 158, 11, 0.15); --icon-color: #f59e0b;">
        <div class="metric-header">
          <span class="metric-label">Себестоимость</span>
          <div class="metric-icon-box"><i class="fa-solid fa-boxes-stacked"></i></div>
        </div>
        <div class="metric-value">${formatMoney(currentMonth.cost)}</div>
        <div class="metric-footer"><i class="fa-solid fa-calculator text-warning"></i> Затраты на изготовление ламп</div>
      </div>

      <!-- 3. Прибыль -->
      <div class="metric-card" style="--card-accent: #10b981; --icon-bg: rgba(16, 185, 129, 0.15); --icon-color: #10b981;">
        <div class="metric-header">
          <span class="metric-label">Чистая прибыль</span>
          <div class="metric-icon-box"><i class="fa-solid fa-arrow-trend-up"></i></div>
        </div>
        <div class="metric-value text-success">${formatMoney(currentMonth.profit)}</div>
        <div class="metric-footer">
          <i class="fa-solid fa-percent text-success"></i> Маржинальность: 
          <strong>${currentMonth.revenue > 0 ? ((currentMonth.profit / currentMonth.revenue) * 100).toFixed(1) : 0}%</strong>
        </div>
      </div>

      <!-- 4. Продано ламп -->
      <div class="metric-card" style="--card-accent: #8b5cf6; --icon-bg: rgba(139, 92, 246, 0.15); --icon-color: #8b5cf6;">
        <div class="metric-header">
          <span class="metric-label">Продано ламп</span>
          <div class="metric-icon-box"><i class="fa-solid fa-lightbulb"></i></div>
        </div>
        <div class="metric-value">${currentMonth.lampsSold.toLocaleString('ru-RU')} <span style="font-size: 1rem; color: var(--text-muted);">шт</span></div>
        <div class="metric-footer"><i class="fa-solid fa-box text-primary"></i> Объем отгрузок</div>
      </div>

      <!-- 5. Количество клиентов -->
      <div class="metric-card" style="--card-accent: #06b6d4; --icon-bg: rgba(6, 182, 212, 0.15); --icon-color: #06b6d4;">
        <div class="metric-header">
          <span class="metric-label">Клиентов в базе</span>
          <div class="metric-icon-box"><i class="fa-solid fa-users"></i></div>
        </div>
        <div class="metric-value">${counts.totalClients}</div>
        <div class="metric-footer"><i class="fa-solid fa-user-check text-info"></i> Активная база покупателей</div>
      </div>

      <!-- 6. Количество заказов -->
      <div class="metric-card" style="--card-accent: #ec4899; --icon-bg: rgba(236, 72, 153, 0.15); --icon-color: #ec4899;">
        <div class="metric-header">
          <span class="metric-label">Заказов за месяц</span>
          <div class="metric-icon-box"><i class="fa-solid fa-cart-shopping"></i></div>
        </div>
        <div class="metric-value">${currentMonth.ordersCount}</div>
        <div class="metric-footer"><i class="fa-solid fa-receipt"></i> Успешно оформлено</div>
      </div>
    </div>

    <!-- 2. Блоки Производителей 1 и 2 (Начислено, Получено, Остаток долга) -->
    <div style="margin-bottom: 1.25rem; display: flex; justify-content: space-between; align-items: center;">
      <h3 style="font-size: 1.25rem; font-weight: 800;">
        <i class="fa-solid fa-scale-balanced text-primary mr-2"></i>
        Распределение прибыли и расчеты с производителями
      </h3>
      <button class="btn btn-sm btn-outline" onclick="openMfgSettingsModal()">
        <i class="fa-solid fa-sliders"></i> Настройки долей (%)
      </button>
    </div>

    <div class="mfg-split-grid mb-4">
      <!-- Производитель 1 -->
      <div class="mfg-card" style="border-top: 4px solid var(--primary);">
        <div class="mfg-card-header">
          <span class="mfg-name">
            <i class="fa-solid fa-industry text-primary"></i> ${mfg1.name}
          </span>
          <span class="mfg-share-badge">${mfg1.percentage}% прибыли</span>
        </div>
        <div class="mfg-stats-row mb-3">
          <div class="mfg-stat-box">
            <div class="mfg-stat-title">Начислено</div>
            <div class="mfg-stat-num text-primary">${formatMoney(mfg1.accrued)}</div>
          </div>
          <div class="mfg-stat-box">
            <div class="mfg-stat-title">Получено</div>
            <div class="mfg-stat-num mfg-stat-paid">${formatMoney(mfg1.paid)}</div>
          </div>
          <div class="mfg-stat-box">
            <div class="mfg-stat-title">Остаток долга</div>
            <div class="mfg-stat-num mfg-stat-debt">${formatMoney(mfg1.remaining)}</div>
          </div>
        </div>
        <button class="btn btn-sm btn-primary btn-block" onclick="openAddPaymentModalFor(${mfg1.id})">
          <i class="fa-solid fa-money-bill-transfer"></i> Внести выплату для ${mfg1.name}
        </button>
      </div>

      <!-- Производитель 2 -->
      <div class="mfg-card" style="border-top: 4px solid var(--accent);">
        <div class="mfg-card-header">
          <span class="mfg-name">
            <i class="fa-solid fa-industry text-accent"></i> ${mfg2.name}
          </span>
          <span class="mfg-share-badge" style="background-color: rgba(16, 185, 129, 0.15); color: var(--accent); border-color: rgba(16, 185, 129, 0.3);">${mfg2.percentage}% прибыли</span>
        </div>
        <div class="mfg-stats-row mb-3">
          <div class="mfg-stat-box">
            <div class="mfg-stat-title">Начислено</div>
            <div class="mfg-stat-num text-accent">${formatMoney(mfg2.accrued)}</div>
          </div>
          <div class="mfg-stat-box">
            <div class="mfg-stat-title">Получено</div>
            <div class="mfg-stat-num mfg-stat-paid">${formatMoney(mfg2.paid)}</div>
          </div>
          <div class="mfg-stat-box">
            <div class="mfg-stat-title">Остаток долга</div>
            <div class="mfg-stat-num mfg-stat-debt">${formatMoney(mfg2.remaining)}</div>
          </div>
        </div>
        <button class="btn btn-sm btn-accent btn-block" onclick="openAddPaymentModalFor(${mfg2.id})">
          <i class="fa-solid fa-money-bill-transfer"></i> Внести выплату для ${mfg2.name}
        </button>
      </div>
    </div>

    <!-- 3. Графики (4 диаграммы) -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
      
      <!-- График 1: Выручка по месяцам -->
      <div class="card">
        <div class="card-header">
          <h4 class="card-title"><i class="fa-solid fa-chart-column text-primary"></i> Выручка по месяцам</h4>
        </div>
        <div class="card-body" style="height: 280px; position: relative;">
          <canvas id="chart-monthly-revenue"></canvas>
        </div>
      </div>

      <!-- График 2: Прибыль по месяцам -->
      <div class="card">
        <div class="card-header">
          <h4 class="card-title"><i class="fa-solid fa-arrow-trend-up text-success"></i> Прибыль по месяцам</h4>
        </div>
        <div class="card-body" style="height: 280px; position: relative;">
          <canvas id="chart-monthly-profit"></canvas>
        </div>
      </div>

      <!-- График 3: Продажи по видам ламп -->
      <div class="card">
        <div class="card-header">
          <h4 class="card-title"><i class="fa-solid fa-lightbulb text-warning"></i> Продажи по видам ламп</h4>
        </div>
        <div class="card-body" style="height: 280px; position: relative;">
          <canvas id="chart-top-products"></canvas>
        </div>
      </div>

      <!-- График 4: Продажи по клиентам -->
      <div class="card">
        <div class="card-header">
          <h4 class="card-title"><i class="fa-solid fa-users text-info"></i> Продажи по клиентам</h4>
        </div>
        <div class="card-body" style="height: 280px; position: relative;">
          <canvas id="chart-top-clients"></canvas>
        </div>
      </div>

    </div>
  `;

  // Инициализируем 4 графика
  initDashboardCharts(charts);
}

function initDashboardCharts(chartsData) {
  if (typeof Chart === 'undefined') return;

  // Очистка предыдущих инстансов
  ['revenue', 'profit', 'products', 'clients'].forEach(key => {
    if (dashboardCharts[key]) dashboardCharts[key].destroy();
  });

  const isDark = document.body.classList.contains('dark-theme');
  const textColor = isDark ? '#9ca3af' : '#4b5563';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';

  const months = chartsData?.monthlyTrend || [];
  const labels = months.length > 0 ? months.map(m => m.month) : ['Текущий месяц'];
  const revenues = months.length > 0 ? months.map(m => m.revenue) : [0];
  const profits = months.length > 0 ? months.map(m => m.profit) : [0];

  // 1. График: Выручка по месяцам
  const revCtx = document.getElementById('chart-monthly-revenue')?.getContext('2d');
  if (revCtx) {
    dashboardCharts.revenue = new Chart(revCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Выручка (сум)',
          data: revenues,
          backgroundColor: 'rgba(59, 130, 246, 0.8)',
          borderColor: '#3b82f6',
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: textColor } } },
        scales: {
          x: { ticks: { color: textColor }, grid: { color: gridColor } },
          y: { ticks: { color: textColor, callback: (v) => formatMoney(v, false) }, grid: { color: gridColor } }
        }
      }
    });
  }

  // 2. График: Прибыль по месяцам
  const profCtx = document.getElementById('chart-monthly-profit')?.getContext('2d');
  if (profCtx) {
    dashboardCharts.profit = new Chart(profCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Чистая прибыль (сум)',
          data: profits,
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          borderColor: '#10b981',
          borderWidth: 3,
          fill: true,
          tension: 0.35,
          pointRadius: 5,
          pointBackgroundColor: '#10b981'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: textColor } } },
        scales: {
          x: { ticks: { color: textColor }, grid: { color: gridColor } },
          y: { ticks: { color: textColor, callback: (v) => formatMoney(v, false) }, grid: { color: gridColor } }
        }
      }
    });
  }

  // 3. График: Продажи по видам ламп
  const prodCtx = document.getElementById('chart-top-products')?.getContext('2d');
  if (prodCtx) {
    const topProds = chartsData?.topProducts || [];
    const pLabels = topProds.length > 0 ? topProds.map(p => p.name.length > 18 ? p.name.substring(0, 18) + '...' : p.name) : ['Нет продаж'];
    const pData = topProds.length > 0 ? topProds.map(p => p.total) : [0];

    dashboardCharts.products = new Chart(prodCtx, {
      type: 'doughnut',
      data: {
        labels: pLabels,
        datasets: [{
          data: pData,
          backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899'],
          borderWidth: 2,
          borderColor: isDark ? '#111827' : '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: textColor, boxWidth: 12, font: { size: 10 } } },
          tooltip: { callbacks: { label: (i) => ` ${i.label}: ${formatMoney(i.raw)}` } }
        }
      }
    });
  }

  // 4. График: Продажи по клиентам
  const clientCtx = document.getElementById('chart-top-clients')?.getContext('2d');
  if (clientCtx) {
    const topClients = chartsData?.topClients || [];
    const cLabels = topClients.length > 0 ? topClients.map(c => c.name.length > 15 ? c.name.substring(0, 15) + '...' : c.name) : ['Нет клиентов'];
    const cData = topClients.length > 0 ? topClients.map(c => c.total_spent) : [0];

    dashboardCharts.clients = new Chart(clientCtx, {
      type: 'bar',
      data: {
        labels: cLabels,
        datasets: [{
          label: 'Сумма покупок (сум)',
          data: cData,
          backgroundColor: 'rgba(6, 182, 212, 0.75)',
          borderColor: '#06b6d4',
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: textColor, callback: (v) => formatMoney(v, false) }, grid: { color: gridColor } },
          y: { ticks: { color: textColor, font: { size: 11 } }, grid: { display: false } }
        }
      }
    });
  }
}
