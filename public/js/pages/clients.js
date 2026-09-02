/**
 * Clients Page Module — Support for Price List assignment
 */

let clientsList = [];

async function renderClientsPage(container) {
  container.innerHTML = `
    <!-- Панель управления и поиск -->
    <div class="card mb-4">
      <div class="card-body">
        <div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: flex-end; justify-content: space-between;">
          
          <div style="flex: 2; min-width: 260px;">
            <label class="form-label">Поиск клиентов</label>
            <div class="input-icon-wrapper">
              <i class="fa-solid fa-magnifying-glass input-icon"></i>
              <input type="text" id="clients-search-input" class="form-control with-icon" placeholder="Поиск по имени, городу, телефону..." oninput="debounceClientsSearch()">
            </div>
          </div>

          <div style="flex: 1; min-width: 180px;">
            <label class="form-label">Сортировка</label>
            <select id="clients-sort-select" class="form-control" onchange="loadClients()">
              <option value="total_spent" selected>По сумме покупок (макс)</option>
              <option value="total_profit">По принесенной прибыли (макс)</option>
              <option value="total_lamps">По количеству купленных ламп</option>
              <option value="orders_count">По количеству заказов</option>
              <option value="name">По алфавиту (ФИО)</option>
            </select>
          </div>

          <div style="display: flex; gap: 0.5rem; align-items: flex-end;">
            <button class="btn btn-primary" onclick="openAddClientModal()">
              <i class="fa-solid fa-user-plus"></i> <span class="btn-text-desktop">Новый клиент</span>
            </button>
            <button class="btn btn-outline" onclick="exportClients('xlsx')" title="Экспорт в Excel">
              <i class="fa-solid fa-file-excel text-success"></i> Excel
            </button>
            <button class="btn btn-outline" onclick="exportClients('csv')" title="Экспорт в CSV">
              <i class="fa-solid fa-file-csv text-primary"></i> CSV
            </button>
          </div>

        </div>
      </div>
    </div>

    <!-- Таблица клиентов -->
    <div class="card">
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>ФИО Клиента</th>
              <th>Город</th>
              <th>Телефон</th>
              <th class="text-center">Прайс-лист</th>
              <th class="text-center">Заказов</th>
              <th class="text-center">Куплено ламп</th>
              <th class="text-right">Сумма покупок</th>
              <th class="text-right">Прибыль</th>
              <th class="text-center">Действия</th>
            </tr>
          </thead>
          <tbody id="clients-table-body">
            <tr><td colspan="10" class="text-center" style="padding: 2rem;">Загрузка клиентов...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  await loadClients();
}

let clientSearchTimeout;
function debounceClientsSearch() {
  clearTimeout(clientSearchTimeout);
  clientSearchTimeout = setTimeout(() => {
    loadClients();
  }, 300);
}

async function loadClients() {
  const search = document.getElementById('clients-search-input')?.value || '';
  const sort = document.getElementById('clients-sort-select')?.value || 'total_spent';

  const query = new URLSearchParams();
  if (search) query.set('search', search);
  if (sort) query.set('sort', sort);
  query.set('order', sort === 'name' ? 'ASC' : 'DESC');

  const data = await api(`/api/clients?${query.toString()}`);
  if (!data) return;

  clientsList = data.clients || [];
  const tbody = document.getElementById('clients-table-body');
  if (!tbody) return;

  if (clientsList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center" style="padding: 3rem; color: var(--text-muted);">
          <i class="fa-solid fa-user-slash" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
          Клиентов не найдено. Нажмите «+ Новый клиент», чтобы добавить первого.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = clientsList.map(c => {
    let priceBadge = '<span class="badge badge-primary"><i class="fa-solid fa-tag"></i> Прайс 1 (Розница)</span>';
    if (c.price_type === 2) {
      priceBadge = '<span class="badge badge-success"><i class="fa-solid fa-tags"></i> Прайс 2 (Опт)</span>';
    } else if (c.price_type === 3) {
      priceBadge = '<span class="badge badge-purple"><i class="fa-solid fa-bolt"></i> Прайс 3 (Иностранный)</span>';
    }

    return `
      <tr>
        <td>#${c.id}</td>
        <td>
          <a href="javascript:void(0)" onclick="openClientDetailsModal(${c.id})" style="font-weight: 600; font-size: 0.95rem;">
            ${c.name}
          </a>
          ${c.address ? `<div style="font-size: 0.75rem; color: var(--text-dim);">${c.address}</div>` : ''}
        </td>
        <td><span class="badge badge-primary">${c.city}</span></td>
        <td>${c.phone || '—'}</td>
        <td class="text-center">${priceBadge}</td>
        <td class="text-center font-bold">${c.orders_count || 0}</td>
        <td class="text-center">${(c.total_lamps || 0).toLocaleString('ru-RU')} шт</td>
        <td class="text-right font-bold">${formatMoney(c.total_spent)}</td>
        <td class="text-right font-bold text-success">${formatMoney(c.total_profit)}</td>
        <td class="text-center" style="white-space: nowrap;">
          <button class="btn btn-sm btn-outline" onclick="openClientDetailsModal(${c.id})" title="История заказов">
            <i class="fa-solid fa-chart-user"></i>
          </button>
          <button class="btn btn-sm btn-outline" onclick="openEditClientModal(${c.id})" title="Редактировать">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteClient(${c.id}, '${c.name.replace(/'/g, "\\'")}')" title="Удалить">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function openAddClientModal() {
  document.getElementById('form-client').reset();
  document.getElementById('client-id').value = '';
  document.getElementById('client-price-type').value = '1';
  document.getElementById('modal-client-title').textContent = 'Новый клиент';
  openModal('modal-client');
}

async function openEditClientModal(clientId) {
  let c = clientsList?.find(item => item.id === Number(clientId));
  if (!c && typeof availableClients !== 'undefined' && Array.isArray(availableClients)) {
    c = availableClients.find(item => item.id === Number(clientId));
  }
  if (!c) {
    try {
      const data = await api(`/api/clients/${clientId}`);
      if (data && data.client) c = data.client;
    } catch (e) {
      console.error('Error fetching client for edit modal:', e);
    }
  }
  if (!c) return;

  document.getElementById('client-id').value = c.id;
  document.getElementById('client-name').value = c.name;
  document.getElementById('client-city').value = c.city;
  document.getElementById('client-phone').value = c.phone || '';
  document.getElementById('client-address').value = c.address || '';
  document.getElementById('client-price-type').value = c.price_type || 1;
  document.getElementById('client-comment').value = c.comment || '';
  document.getElementById('modal-client-title').textContent = 'Редактировать клиента';

  openModal('modal-client');
}

async function openClientDetailsModal(clientId) {
  const data = await api(`/api/clients/${clientId}`);
  if (!data || !data.client) return;

  const { client, orders, stats } = data;
  window.currentSelectedClient = client;

  const content = document.getElementById('modal-client-details-content');
  const title = document.getElementById('modal-client-details-title');

  title.textContent = `Клиент: ${client.name}`;

  let priceBadge = '<span class="badge badge-primary"><i class="fa-solid fa-tag"></i> Прайс 1 (Розница)</span>';
  if (client.price_type === 2) {
    priceBadge = '<span class="badge badge-success"><i class="fa-solid fa-tags"></i> Прайс 2 (Опт)</span>';
  } else if (client.price_type === 3) {
    priceBadge = '<span class="badge badge-purple"><i class="fa-solid fa-bolt"></i> Прайс 3 (Иностранный)</span>';
  }

  content.innerHTML = `
    <!-- Карточка профиля клиента -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; background: var(--bg-subtle); padding: 1.25rem; border-radius: var(--radius-md);">
      <div>
        <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Город и прайс:</div>
        <div class="font-bold">${client.city} | ${priceBadge}</div>
        <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem;"><i class="fa-solid fa-phone"></i> ${client.phone || 'Нет телефона'}</div>
        <div style="font-size: 0.8rem; color: var(--text-dim);">${client.address || 'Адрес не указан'}</div>
      </div>
      <div>
        <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Сумма покупок (LTV):</div>
        <div class="font-bold text-primary" style="font-size: 1.15rem;">${formatMoney(stats.total_spent)}</div>
        <div style="font-size: 0.8rem; color: var(--text-dim);">${stats.orders_count} активных заказов (${stats.total_lamps} шт ламп)</div>
      </div>
      <div>
        <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Принесенная прибыль:</div>
        <div class="font-bold text-success" style="font-size: 1.15rem;">${formatMoney(stats.total_profit)}</div>
        <div style="font-size: 0.8rem; color: var(--text-muted);">Себестоимость: ${formatMoney(stats.total_cost)}</div>
      </div>
    </div>

    <!-- Заметки/комментарий -->
    ${client.comment ? `
      <div style="margin-bottom: 1.5rem; padding: 0.75rem 1rem; background: rgba(59, 130, 246, 0.08); border-left: 3px solid var(--primary); border-radius: var(--radius-sm); font-size: 0.85rem;">
        <strong>Заметка:</strong> ${client.comment}
      </div>
    ` : ''}

    <h5 class="font-bold mb-2">История заказов клиента (${orders.length}):</h5>
    <div class="table-responsive">
      <table class="data-table">
        <thead>
          <tr>
            <th>№ Заказа</th>
            <th>Дата</th>
            <th>Состав заказа</th>
            <th class="text-right">Сумма</th>
            <th class="text-right">Прибыль</th>
            <th class="text-center">Статус</th>
          </tr>
        </thead>
        <tbody>
          ${orders.length > 0 ? orders.map(o => `
            <tr>
              <td>#${o.id}</td>
              <td>${formatDate(o.order_date)}</td>
              <td style="font-size: 0.8rem;">
                ${o.items ? o.items.map(i => `${i.product_name_snapshot} (${i.quantity} шт)`).join(', ') : '—'}
              </td>
              <td class="text-right font-bold">${formatMoney(o.total_amount)}</td>
              <td class="text-right text-success">${formatMoney(o.profit_total)}</td>
              <td class="text-center">
                ${o.status === 'active' ? '<span class="badge badge-success">Активен</span>' : '<span class="badge badge-danger">Отменен</span>'}
              </td>
            </tr>
          `).join('') : `<tr><td colspan="6" class="text-center" style="padding: 1.5rem;">У клиента пока нет заказов</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  openModal('modal-client-details');
}

function createOrderForClient() {
  if (window.currentSelectedClient) {
    closeModal('modal-client-details');
    navigate('new-order');
    setTimeout(() => {
      const select = document.getElementById('order-client-select');
      if (select) {
        select.value = window.currentSelectedClient.id;
        if (typeof onClientSelected === 'function') onClientSelected();
      }
    }, 100);
  }
}

async function deleteClient(clientId, clientName) {
  if (confirm(`Вы действительно хотите удалить клиента "${clientName}"?`)) {
    try {
      await api(`/api/clients/${clientId}`, { method: 'DELETE' });
      showToast('Клиент успешно удален');
      await loadClients();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}

function exportClients(format) {
  window.open(`/api/export/clients?format=${format}`, '_blank');
}
