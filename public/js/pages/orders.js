/**
 * Orders (Sales) Page Module (LumiCRM)
 * Статусы заказов: "В процессе", "Отправлен", "Завершен", "Отменен"
 */

let currentOrdersList = [];

function getStatusBadge(status) {
  switch (status) {
    case 'in_process':
      return `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.35); font-weight: 600;"><i class="fa-solid fa-clock mr-1"></i> В процессе</span>`;
    case 'shipped':
      return `<span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.35); font-weight: 600;"><i class="fa-solid fa-truck-fast mr-1"></i> Отправлен</span>`;
    case 'completed':
    case 'active':
      return `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.35); font-weight: 600;"><i class="fa-solid fa-circle-check mr-1"></i> Завершен</span>`;
    case 'cancelled':
      return `<span class="badge badge-danger" style="font-weight: 600;"><i class="fa-solid fa-ban mr-1"></i> Отменен</span>`;
    default:
      return `<span class="badge badge-primary">${status}</span>`;
  }
}

async function renderOrdersPage(container) {
  container.innerHTML = `
    <!-- Панель управления и фильтры -->
    <div class="card mb-4">
      <div class="card-body">
        <div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: flex-end; justify-content: space-between;">
          
          <!-- Поисковая строка -->
          <div style="flex: 2; min-width: 260px;">
            <label class="form-label">Поиск продаж</label>
            <div class="input-icon-wrapper">
              <i class="fa-solid fa-magnifying-glass input-icon"></i>
              <input type="text" id="orders-search-input" class="form-control with-icon" placeholder="Поиск по клиенту, городу, лампе, номеру..." oninput="debounceOrdersSearch()">
            </div>
          </div>

          <!-- Фильтр по статусу (В процессе, Отправлен, Завершен, Отменен) -->
          <div style="flex: 1.2; min-width: 170px;">
            <label class="form-label">Статус заказа</label>
            <select id="orders-filter-status" class="form-control font-bold" onchange="loadOrders()">
              <option value="all">Все статусы</option>
              <option value="in_process">⏳ В процессе</option>
              <option value="shipped">🚚 Отправлен</option>
              <option value="completed">✅ Завершен</option>
              <option value="cancelled">❌ Отменен</option>
            </select>
          </div>

          <!-- Фильтр по дате с -->
          <div style="flex: 1; min-width: 130px;">
            <label class="form-label">Дата с</label>
            <input type="date" id="orders-filter-date-from" class="form-control" onchange="loadOrders()">
          </div>

          <!-- Фильтр по дате по -->
          <div style="flex: 1; min-width: 130px;">
            <label class="form-label">Дата по</label>
            <input type="date" id="orders-filter-date-to" class="form-control" onchange="loadOrders()">
          </div>

          <!-- Кнопки действий -->
          <div style="display: flex; gap: 0.5rem; align-items: flex-end;">
            <button class="btn btn-primary" onclick="navigate('new-order')">
              <i class="fa-solid fa-plus"></i> <span class="btn-text-desktop">Новый заказ</span>
            </button>
            <button class="btn btn-outline" onclick="exportOrders('xlsx')" title="Экспорт в Excel">
              <i class="fa-solid fa-file-excel text-success"></i> Excel
            </button>
            <button class="btn btn-outline" onclick="exportOrders('csv')" title="Экспорт в CSV">
              <i class="fa-solid fa-file-csv text-primary"></i> CSV
            </button>
          </div>

        </div>
      </div>
    </div>

    <!-- Итоговая сводка (Summary Bar) -->
    <div class="card mb-4" id="orders-summary-bar">
      <div class="card-body" style="padding: 1rem 1.5rem;">
        <div style="display: flex; gap: 2rem; flex-wrap: wrap; justify-content: space-around; text-align: center;">
          <div>
            <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Всего заказов</span>
            <div id="sum-orders-count" class="font-bold" style="font-size: 1.35rem;">0</div>
          </div>
          <div>
            <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Продано ламп</span>
            <div id="sum-lamps-count" class="font-bold text-primary" style="font-size: 1.35rem;">0 шт</div>
          </div>
          <div>
            <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Общая выручка</span>
            <div id="sum-sales-total" class="font-bold" style="font-size: 1.35rem;">0 сум</div>
          </div>
          <div>
            <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Общая себестоимость</span>
            <div id="sum-cost-total" class="font-bold text-warning" style="font-size: 1.35rem;">0 сум</div>
          </div>
          <div>
            <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Чистая прибыль</span>
            <div id="sum-profit-total" class="font-bold text-success" style="font-size: 1.35rem;">0 сум</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Основная таблица продаж -->
    <div class="card">
      <div class="card-header">
        <h4 class="card-title"><i class="fa-solid fa-cart-shopping text-primary"></i> Журнал продаж и заказов</h4>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Дата и Статус</th>
              <th>ФИО клиента</th>
              <th>Город</th>
              <th>Наименование лампы</th>
              <th class="text-right">Цена</th>
              <th class="text-center">Кол-во</th>
              <th class="text-right">Сумма</th>
              <th class="text-right">Себестоимость 1 шт.</th>
              <th class="text-right">Общая себестоимость</th>
              <th class="text-right">Прибыль</th>
              <th class="text-center">Действия</th>
            </tr>
          </thead>
          <tbody id="orders-table-body">
            <tr><td colspan="11" class="text-center" style="padding: 2rem;">Загрузка продаж...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  await loadOrders();
}

let searchTimeout;
function debounceOrdersSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    loadOrders();
  }, 300);
}

async function loadOrders() {
  const search = document.getElementById('orders-search-input')?.value || '';
  const status = document.getElementById('orders-filter-status')?.value || 'all';
  const dateFrom = document.getElementById('orders-filter-date-from')?.value || '';
  const dateTo = document.getElementById('orders-filter-date-to')?.value || '';

  const query = new URLSearchParams();
  if (search) query.set('search', search);
  if (status && status !== 'all') query.set('status', status);
  if (dateFrom) query.set('date_from', dateFrom);
  if (dateTo) query.set('date_to', dateTo);

  const data = await api(`/api/orders?${query.toString()}`);
  if (!data) return;

  currentOrdersList = data.orders || [];
  const tbody = document.getElementById('orders-table-body');
  if (!tbody) return;

  // Обновляем сводку
  document.getElementById('sum-orders-count').textContent = data.summary?.totalOrders ?? 0;
  document.getElementById('sum-lamps-count').textContent = `${(data.summary?.totalLamps ?? 0).toLocaleString('ru-RU')} шт`;
  document.getElementById('sum-sales-total').textContent = formatMoney(data.summary?.totalSales ?? 0);
  document.getElementById('sum-cost-total').textContent = formatMoney(data.summary?.totalCost ?? 0);
  document.getElementById('sum-profit-total').textContent = formatMoney(data.summary?.totalProfit ?? 0);

  if (currentOrdersList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="text-center" style="padding: 3rem; color: var(--text-muted);">
          <i class="fa-solid fa-folder-open" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
          Заказов по заданным критериям не найдено. Нажмите «+ Новый заказ».
        </td>
      </tr>
    `;
    return;
  }

  let html = '';

  currentOrdersList.forEach(order => {
    const isCancelled = order.status === 'cancelled';
    const items = order.items && order.items.length > 0 ? order.items : [
      { product_name_snapshot: 'Без позиций', sale_price_snapshot: 0, quantity: 0, total: 0, cost_price_snapshot: 0, cost_total: 0, profit: 0 }
    ];

    const rowCount = items.length;
    const cancelStyle = isCancelled ? 'opacity: 0.55; text-decoration: line-through;' : '';

    items.forEach((item, idx) => {
      const isFirst = idx === 0;
      const isMulti = rowCount > 1;

      html += `
        <tr style="${cancelStyle} ${isMulti && idx > 0 ? 'background-color: var(--bg-subtle);' : ''}">
          ${isFirst ? `
            <td rowspan="${rowCount}" style="vertical-align: top; white-space: nowrap; border-right: 1px solid var(--border-color);">
              <div class="font-bold">${formatDate(order.order_date)}</div>
              <div style="font-size: 0.75rem; color: var(--text-dim); margin-bottom: 0.25rem;">Заказ #${order.id}</div>
              <div>${getStatusBadge(order.status)}</div>
            </td>
            <td rowspan="${rowCount}" style="vertical-align: top; border-right: 1px solid var(--border-color);">
              <a href="javascript:void(0)" onclick="openClientDetailsModal(${order.client_id})" style="font-weight: 600; font-size: 0.95rem;">
                ${order.client_name}
              </a>
              <div style="font-size: 0.75rem; color: var(--text-dim);">${order.client_phone || ''}</div>
            </td>
            <td rowspan="${rowCount}" style="vertical-align: top; border-right: 1px solid var(--border-color);">
              <span class="badge badge-primary">${order.client_city}</span>
            </td>
          ` : ''}

          <!-- Позиция лампы -->
          <td>
            <strong>${item.product_name_snapshot}</strong>
            ${item.article_snapshot ? `<span style="font-size: 0.75rem; color: var(--text-dim);"> [${item.article_snapshot}]</span>` : ''}
          </td>
          <td class="text-right">${formatMoney(item.sale_price_snapshot)}</td>
          <td class="text-center font-bold">${item.quantity} шт</td>
          <td class="text-right font-bold">${formatMoney(item.total)}</td>
          <td class="text-right text-warning">${formatMoney(item.cost_price_snapshot)}</td>
          <td class="text-right text-warning">${formatMoney(item.cost_total)}</td>
          <td class="text-right font-bold text-success">${formatMoney(item.profit)}</td>

          ${isFirst ? `
            <td rowspan="${rowCount}" class="text-center" style="vertical-align: top; white-space: nowrap; border-left: 1px solid var(--border-color);">
              <div style="display: flex; gap: 0.35rem; justify-content: center; align-items: center;">
                <button class="btn btn-sm btn-outline" onclick="viewOrderDetails(${order.id})" title="Детали заказа">
                  <i class="fa-solid fa-eye"></i>
                </button>
                <select class="form-control" style="padding: 0.2rem 0.4rem; font-size: 0.78rem; width: auto; height: 30px;" onchange="changeOrderStatusDirect(${order.id}, this.value)" title="Изменить статус">
                  <option value="in_process" ${order.status === 'in_process' ? 'selected' : ''}>⏳ В процессе</option>
                  <option value="shipped" ${order.status === 'shipped' ? 'selected' : ''}>🚚 Отправлен</option>
                  <option value="completed" ${order.status === 'completed' || order.status === 'active' ? 'selected' : ''}>✅ Завершен</option>
                  <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>❌ Отменен</option>
                </select>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteOrderDirect(${order.id})" title="Удалить заказ из базы данных">
                  <i class="fa-solid fa-trash-can"></i>
                </button>
              </div>
            </td>
          ` : ''}
        </tr>
      `;
    });

    if (rowCount > 1) {
      html += `
        <tr style="background: rgba(59, 130, 246, 0.05); font-weight: 700; border-bottom: 2px solid var(--border-color); ${cancelStyle}">
          <td colspan="4" class="text-right" style="color: var(--text-muted); font-size: 0.825rem; text-transform: uppercase;">
            Итого по заказу #${order.id} (${order.total_lamps || 0} шт):
          </td>
          <td class="text-center font-bold text-primary">${order.total_lamps || 0} шт</td>
          <td class="text-right font-bold text-primary">${formatMoney(order.total_amount)}</td>
          <td class="text-right text-muted">—</td>
          <td class="text-right font-bold text-warning">${formatMoney(order.cost_total)}</td>
          <td class="text-right font-bold text-success">${formatMoney(order.profit_total)}</td>
          <td></td>
        </tr>
      `;
    }
  });

  tbody.innerHTML = html;
}

// Быстрая смена статуса из таблицы
async function changeOrderStatusDirect(orderId, newStatus) {
  try {
    await api(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus })
    });
    const statusNames = {
      'in_process': 'В процессе',
      'shipped': 'Отправлен',
      'completed': 'Завершен',
      'cancelled': 'Отменен'
    };
    showToast(`Статус заказа #${orderId} изменен на "${statusNames[newStatus] || newStatus}"`);
    await loadOrders();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Просмотр детальной информации о заказе в модальном окне
async function viewOrderDetails(orderId) {
  const data = await api(`/api/orders/${orderId}`);
  if (!data || !data.order) return;

  const ord = data.order;
  window.currentSelectedOrder = ord;

  const content = document.getElementById('modal-order-details-content');
  const title = document.getElementById('modal-order-title');

  title.textContent = `Заказ #${ord.id} от ${formatDate(ord.order_date)}`;

  const pt = ord.price_type || 1;
  const ptBadge = pt === 3
    ? '<span class="badge badge-purple"><i class="fa-solid fa-bolt"></i> Прайс 3 (Иностранный)</span>'
    : (pt === 2 ? '<span class="badge badge-success"><i class="fa-solid fa-tags"></i> Прайс 2 (Опт)</span>' : '<span class="badge badge-primary"><i class="fa-solid fa-tag"></i> Прайс 1 (Розница)</span>');

  // Распределение прибыли по заказу между производителями
  let mfgList = ord.profit_distribution || [];
  if (!mfgList || mfgList.length === 0) {
    const mfgData = await api('/api/manufacturers');
    if (mfgData && mfgData.manufacturers) {
      const isCancelledOrder = ord.status === 'cancelled';
      mfgList = mfgData.manufacturers.map(m => ({
        id: m.id,
        name: m.name,
        percentage: m.percentage,
        share: isCancelledOrder ? 0 : Math.round(ord.profit_total * (m.percentage / 100) * 100) / 100
      }));
    }
  }

  const isCancelled = ord.status === 'cancelled';

  const mfgCardsHtml = (mfgList && mfgList.length > 0) ? mfgList.map((m, idx) => {
    const isFirst = idx === 0;
    const accentColor = isFirst ? 'var(--primary)' : 'var(--accent)';
    const cardBg = isFirst ? 'rgba(59, 130, 246, 0.08)' : 'rgba(16, 185, 129, 0.08)';
    const cardBorder = isFirst ? 'rgba(59, 130, 246, 0.25)' : 'rgba(16, 185, 129, 0.25)';
    const badgeBg = isFirst ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)';
    const badgeBorder = isFirst ? 'rgba(59, 130, 246, 0.35)' : 'rgba(16, 185, 129, 0.35)';

    return `
      <div style="background: ${cardBg}; border: 1px solid ${cardBorder}; border-radius: var(--radius-md); padding: 1rem 1.15rem; display: flex; flex-direction: column; justify-content: space-between;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem;">
          <span class="font-bold" style="font-size: 0.95rem; color: var(--text-main); display: flex; align-items: center; gap: 0.45rem;">
            <i class="fa-solid fa-industry" style="color: ${accentColor}; font-size: 0.95rem;"></i>
            ${m.name}
          </span>
          <span class="badge" style="background: ${badgeBg}; color: ${accentColor}; border: 1px solid ${badgeBorder}; font-weight: 700; font-size: 0.8rem;">
            ${m.percentage}%
          </span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed ${cardBorder};">
          <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Начислено с заказа:</span>
          <strong style="font-size: 1.2rem; color: ${accentColor}; font-weight: 800;">
            ${formatMoney(m.share)}
          </strong>
        </div>
      </div>
    `;
  }).join('') : `
    <div style="color: var(--text-muted); font-size: 0.85rem; padding: 0.5rem;">Производители не настроены в системе</div>
  `;

  content.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; background: var(--bg-subtle); padding: 1.25rem; border-radius: var(--radius-md);">
      <div>
        <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Клиент и прайс:</div>
        <div class="font-bold" style="font-size: 1.15rem;">${ord.client_name} ${ptBadge}</div>
        <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem;"><i class="fa-solid fa-location-dot"></i> ${ord.client_city}, ${ord.client_address || 'Адрес не указан'}</div>
        <div style="font-size: 0.85rem; color: var(--text-muted);"><i class="fa-solid fa-phone"></i> ${ord.client_phone || 'Телефон не указан'}</div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Текущий статус:</div>
        <div style="margin-top: 0.25rem;">
          <select id="modal-order-status-select" class="form-control font-bold" style="display: inline-block; width: auto;" onchange="changeOrderStatusDirect(${ord.id}, this.value); closeModal('modal-order-details');">
            <option value="in_process" ${ord.status === 'in_process' ? 'selected' : ''}>⏳ В процессе</option>
            <option value="shipped" ${ord.status === 'shipped' ? 'selected' : ''}>🚚 Отправлен</option>
            <option value="completed" ${ord.status === 'completed' || ord.status === 'active' ? 'selected' : ''}>✅ Завершен</option>
            <option value="cancelled" ${ord.status === 'cancelled' ? 'selected' : ''}>❌ Отменен</option>
          </select>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem; text-transform: uppercase;">Комментарий:</div>
        <div style="font-size: 0.85rem;">${ord.comment || 'Нет примечаний'}</div>
      </div>
    </div>

    <h5 class="mb-2 font-bold">Состав ламп в заказе:</h5>
    <div class="table-responsive mb-3">
      <table class="data-table">
        <thead>
          <tr>
            <th>Наименование лампы</th>
            <th class="text-right">Цена (1 шт)</th>
            <th class="text-center">Кол-во</th>
            <th class="text-right">Сумма продажи</th>
            <th class="text-right">Себестоимость</th>
            <th class="text-right">Прибыль</th>
          </tr>
        </thead>
        <tbody>
          ${ord.items.map(i => `
            <tr>
              <td>
                <strong>${i.product_name_snapshot}</strong>
                ${i.article_snapshot ? `<div style="font-size: 0.75rem; color: var(--text-dim);">${i.article_snapshot}</div>` : ''}
              </td>
              <td class="text-right">${formatMoney(i.sale_price_snapshot)}</td>
              <td class="text-center font-bold">${i.quantity} шт</td>
              <td class="text-right font-bold">${formatMoney(i.total)}</td>
              <td class="text-right text-warning">${formatMoney(i.cost_total)}</td>
              <td class="text-right font-bold text-success">${formatMoney(i.profit)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="order-summary-box mb-3">
      <div class="summary-row">
        <span>Общая сумма продажи:</span>
        <strong style="font-size: 1.15rem;">${formatMoney(ord.total_amount)}</strong>
      </div>
      <div class="summary-row">
        <span>Общая себестоимость:</span>
        <strong class="text-warning">${formatMoney(ord.cost_total)}</strong>
      </div>
      <div class="summary-row total-row">
        <span>Чистая прибыль по заказу:</span>
        <span>${formatMoney(ord.profit_total)}</span>
      </div>
    </div>

    <!-- Распределение чистой прибыли по заказу -->
    <div style="background: linear-gradient(135deg, rgba(31, 41, 55, 0.75), rgba(17, 24, 39, 0.9)); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 1.25rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.85rem; padding-bottom: 0.6rem; border-bottom: 1px solid var(--border-color);">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <i class="fa-solid fa-scale-balanced text-primary" style="font-size: 1.1rem;"></i>
          <h5 class="font-bold" style="margin: 0; font-size: 0.95rem;">Распределение прибыли по заказу</h5>
        </div>
        ${isCancelled ? '<span class="badge badge-danger">Заказ отменен (0 сум)</span>' : `<span style="font-size: 0.775rem; color: var(--text-dim);"><i class="fa-solid fa-circle-info"></i> Доли из настроек системы</span>`}
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem;">
        ${mfgCardsHtml}
      </div>
    </div>
  `;

  openModal('modal-order-details');
}

function editOrderFromDetails() {
  if (window.currentSelectedOrder) {
    closeModal('modal-order-details');
    navigate('new-order', { editOrderId: window.currentSelectedOrder.id });
  }
}

// Физическое удаление заказа с переподтверждением
async function deleteOrderDirect(orderId) {
  const confirmed = confirm(
    `⚠️ ВНИМАНИЕ: Вы действительно хотите безвозвратно удалить Заказ #${orderId} из базы данных?\n\n` +
    `• Все позиции этого заказа будут удалены.\n` +
    `• Выручка, себестоимость и чистая прибыль будут автоматически пересчитаны.\n` +
    `• Балансы начислений и выплат производителей мгновенно обновятся.\n\n` +
    `Нажмите «ОК», чтобы подтвердить удаление.`
  );

  if (!confirmed) return;

  try {
    await api(`/api/orders/${orderId}`, { method: 'DELETE' });
    showToast(`Заказ #${orderId} успешно удален из базы данных`);
    closeModal('modal-order-details');
    await loadOrders();
  } catch (err) {
    showToast(err.message || 'Ошибка удаления заказа', 'error');
  }
}

function deleteOrderFromDetails() {
  if (window.currentSelectedOrder) {
    deleteOrderDirect(window.currentSelectedOrder.id);
  }
}

function exportOrders(format) {
  const status = document.getElementById('orders-filter-status')?.value || 'all';
  window.open(`/api/export/orders?format=${format}&status=${status}`, '_blank');
}
