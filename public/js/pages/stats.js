/**
 * Statistics & Analytics Page Module
 */

let activeStatsTab = 'months'; // 'months' | 'clients' | 'products'

async function renderStatsPage(container) {
  container.innerHTML = `
    <!-- Фильтр периодов и переключатель вкладок -->
    <div class="card mb-4">
      <div class="card-body">
        <div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: flex-end; justify-content: space-between;">
          
          <!-- Вкладки аналитики -->
          <div>
            <label class="form-label">Разрез аналитики</label>
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn ${activeStatsTab === 'months' ? 'btn-primary' : 'btn-secondary'}" onclick="switchStatsTab('months')">
                <i class="fa-solid fa-calendar-days"></i> По месяцам
              </button>
              <button class="btn ${activeStatsTab === 'clients' ? 'btn-primary' : 'btn-secondary'}" onclick="switchStatsTab('clients')">
                <i class="fa-solid fa-users"></i> По клиентам
              </button>
              <button class="btn ${activeStatsTab === 'products' ? 'btn-primary' : 'btn-secondary'}" onclick="switchStatsTab('products')">
                <i class="fa-solid fa-lightbulb"></i> По лампам
              </button>
            </div>
          </div>

          <!-- Быстрый выбор периода -->
          <div style="flex: 1; min-width: 180px;">
            <label class="form-label">Период</label>
            <select id="stats-period-preset" class="form-control" onchange="onPeriodPresetChange()">
              <option value="all" selected>Все время</option>
              <option value="current_month">Текущий месяц</option>
              <option value="prev_month">Предыдущий месяц</option>
              <option value="current_year">Текущий год</option>
              <option value="custom">Произвольный период</option>
            </select>
          </div>

          <!-- Дата с -->
          <div id="stats-date-from-group" style="flex: 1; min-width: 130px;">
            <label class="form-label">Дата с</label>
            <input type="date" id="stats-date-from" class="form-control" onchange="loadActiveStats()">
          </div>

          <!-- Дата по -->
          <div id="stats-date-to-group" style="flex: 1; min-width: 130px;">
            <label class="form-label">Дата по</label>
            <input type="date" id="stats-date-to" class="form-control" onchange="loadActiveStats()">
          </div>

          <!-- Экспорт -->
          <div>
            <button class="btn btn-outline" onclick="exportStatsReport('xlsx')" title="Экспорт отчета в Excel">
              <i class="fa-solid fa-file-excel text-success"></i> Экспорт Excel
            </button>
          </div>

        </div>
      </div>
    </div>

    <!-- Область отображения отчета -->
    <div id="stats-content-area">
      <div class="text-center" style="padding: 2rem;">Загрузка аналитики...</div>
    </div>
  `;

  await loadActiveStats();
}

function switchStatsTab(tab) {
  activeStatsTab = tab;
  renderPage('stats');
}

function onPeriodPresetChange() {
  const preset = document.getElementById('stats-period-preset').value;
  const dateFrom = document.getElementById('stats-date-from');
  const dateTo = document.getElementById('stats-date-to');

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-indexed

  if (preset === 'all') {
    dateFrom.value = '';
    dateTo.value = '';
  } else if (preset === 'current_month') {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    dateFrom.value = firstDay.toISOString().slice(0, 10);
    dateTo.value = lastDay.toISOString().slice(0, 10);
  } else if (preset === 'prev_month') {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    dateFrom.value = firstDay.toISOString().slice(0, 10);
    dateTo.value = lastDay.toISOString().slice(0, 10);
  } else if (preset === 'current_year') {
    dateFrom.value = `${year}-01-01`;
    dateTo.value = `${year}-12-31`;
  }

  loadActiveStats();
}

async function loadActiveStats() {
  const dateFrom = document.getElementById('stats-date-from')?.value || '';
  const dateTo = document.getElementById('stats-date-to')?.value || '';
  const area = document.getElementById('stats-content-area');
  if (!area) return;

  const query = new URLSearchParams();
  if (dateFrom) query.set('date_from', dateFrom);
  if (dateTo) query.set('date_to', dateTo);

  if (activeStatsTab === 'months') {
    await renderMonthlyStatsTable(area, query);
  } else if (activeStatsTab === 'clients') {
    await renderClientStatsTable(area, query);
  } else if (activeStatsTab === 'products') {
    await renderProductStatsTable(area, query);
  }
}

// 1. Помесячный сводный отчет
async function renderMonthlyStatsTable(area, query) {
  const data = await api(`/api/stats/months?${query.toString()}`);
  if (!data) return;

  const { manufacturers, months } = data;
  const { mfg1, mfg2 } = manufacturers;

  if (months.length === 0) {
    area.innerHTML = `
      <div class="card p-4 text-center text-muted">
        <i class="fa-solid fa-calendar-xmark" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
        Данных за выбранный период нет
      </div>
    `;
    return;
  }

  area.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h4 class="card-title"><i class="fa-solid fa-table text-primary"></i> Помесячная сводная таблица продаж и расчетов</h4>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th rowspan="2" style="vertical-align: middle;">Месяц</th>
              <th rowspan="2" class="text-center" style="vertical-align: middle;">Заказов</th>
              <th rowspan="2" class="text-center" style="vertical-align: middle;">Ламп (шт)</th>
              <th rowspan="2" class="text-right" style="vertical-align: middle;">Выручка</th>
              <th rowspan="2" class="text-right" style="vertical-align: middle;">Себестоимость</th>
              <th rowspan="2" class="text-right" style="vertical-align: middle;">Прибыль</th>
              <th colspan="3" class="text-center" style="background: rgba(59, 130, 246, 0.1); border-left: 2px solid var(--primary);">${mfg1.name} (${mfg1.percentage}%)</th>
              <th colspan="3" class="text-center" style="background: rgba(16, 185, 129, 0.1); border-left: 2px solid var(--accent);">${mfg2.name} (${mfg2.percentage}%)</th>
            </tr>
            <tr>
              <th class="text-right" style="background: rgba(59, 130, 246, 0.05); border-left: 2px solid var(--primary);">Доля</th>
              <th class="text-right" style="background: rgba(59, 130, 246, 0.05);">Выплачено</th>
              <th class="text-right" style="background: rgba(59, 130, 246, 0.05);">Остаток</th>
              
              <th class="text-right" style="background: rgba(16, 185, 129, 0.05); border-left: 2px solid var(--accent);">Доля</th>
              <th class="text-right" style="background: rgba(16, 185, 129, 0.05);">Выплачено</th>
              <th class="text-right" style="background: rgba(16, 185, 129, 0.05);">Остаток</th>
            </tr>
          </thead>
          <tbody>
            ${months.map(m => `
              <tr>
                <td><strong>${m.month}</strong></td>
                <td class="text-center font-bold">${m.orders_count}</td>
                <td class="text-center">${m.lamps_sold.toLocaleString('ru-RU')} шт</td>
                <td class="text-right font-bold">${formatMoney(m.revenue)}</td>
                <td class="text-right text-warning">${formatMoney(m.cost)}</td>
                <td class="text-right font-bold text-success">${formatMoney(m.profit)}</td>
                
                <!-- П1 -->
                <td class="text-right font-bold text-primary" style="border-left: 2px solid var(--primary);">${formatMoney(m.mfg1_share)}</td>
                <td class="text-right text-success">${formatMoney(m.mfg1_paid)}</td>
                <td class="text-right ${m.mfg1_debt > 0 ? 'text-danger font-bold' : 'text-muted'}">${formatMoney(m.mfg1_debt)}</td>

                <!-- П2 -->
                <td class="text-right font-bold text-accent" style="border-left: 2px solid var(--accent);">${formatMoney(m.mfg2_share)}</td>
                <td class="text-right text-success">${formatMoney(m.mfg2_paid)}</td>
                <td class="text-right ${m.mfg2_debt > 0 ? 'text-danger font-bold' : 'text-muted'}">${formatMoney(m.mfg2_debt)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// 2. Статистика по клиентам
async function renderClientStatsTable(area, query) {
  const data = await api(`/api/stats/clients?${query.toString()}`);
  if (!data) return;

  const clients = data.clients || [];

  area.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h4 class="card-title"><i class="fa-solid fa-users text-primary"></i> Рейтинг клиентов по продажам и прибыли</h4>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Клиент</th>
              <th>Город</th>
              <th class="text-center">Заказов</th>
              <th class="text-center">Куплено ламп</th>
              <th class="text-right">Сумма покупок</th>
              <th class="text-right">Себестоимость</th>
              <th class="text-right">Прибыль</th>
            </tr>
          </thead>
          <tbody>
            ${clients.map(c => `
              <tr>
                <td>
                  <a href="javascript:void(0)" onclick="openClientDetailsModal(${c.id})" class="font-bold">
                    ${c.name}
                  </a>
                </td>
                <td><span class="badge badge-primary">${c.city}</span></td>
                <td class="text-center font-bold">${c.orders_count}</td>
                <td class="text-center">${c.lamps_count.toLocaleString('ru-RU')} шт</td>
                <td class="text-right font-bold">${formatMoney(c.total_spent)}</td>
                <td class="text-right text-warning">${formatMoney(c.total_cost)}</td>
                <td class="text-right font-bold text-success">${formatMoney(c.profit)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// 3. Статистика по лампам
async function renderProductStatsTable(area, query) {
  const data = await api(`/api/stats/products?${query.toString()}`);
  if (!data) return;

  const products = data.products || [];

  area.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h4 class="card-title"><i class="fa-solid fa-lightbulb text-accent"></i> Аналитика продаж по видам ламп</h4>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Наименование лампы</th>
              <th>Артикул</th>
              <th class="text-center">Продано штук</th>
              <th class="text-right">Выручка</th>
              <th class="text-right">Себестоимость</th>
              <th class="text-right">Прибыль</th>
              <th class="text-right">Маржинальность</th>
            </tr>
          </thead>
          <tbody>
            ${products.map(p => `
              <tr>
                <td><strong>${p.name}</strong></td>
                <td><code>${p.article || '—'}</code></td>
                <td class="text-center font-bold" style="font-size: 1rem;">${p.quantity_sold.toLocaleString('ru-RU')} шт</td>
                <td class="text-right font-bold">${formatMoney(p.revenue)}</td>
                <td class="text-right text-warning">${formatMoney(p.cost)}</td>
                <td class="text-right font-bold text-success">${formatMoney(p.profit)}</td>
                <td class="text-right">${p.margin_percent}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function exportStatsReport(format) {
  window.open(`/api/export/monthly-stats?format=${format}`, '_blank');
}
