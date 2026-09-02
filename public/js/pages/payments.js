/**
 * Payments Page Module
 */

async function renderPaymentsPage(container) {
  const mfgData = await api('/api/manufacturers');
  const manufacturers = mfgData ? mfgData.manufacturers : [];

  container.innerHTML = `
    <!-- Панель управления и фильтры -->
    <div class="card mb-4">
      <div class="card-body">
        <div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: flex-end; justify-content: space-between;">
          
          <!-- Фильтр по производителю -->
          <div style="flex: 1; min-width: 200px;">
            <label class="form-label">Производитель</label>
            <select id="payments-filter-mfg" class="form-control" onchange="loadPaymentsTable()">
              <option value="">Все производители</option>
              ${manufacturers.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}
            </select>
          </div>

          <!-- Фильтр по дате с -->
          <div style="flex: 1; min-width: 140px;">
            <label class="form-label">Дата с</label>
            <input type="date" id="payments-filter-date-from" class="form-control" onchange="loadPaymentsTable()">
          </div>

          <!-- Фильтр по дате по -->
          <div style="flex: 1; min-width: 140px;">
            <label class="form-label">Дата по</label>
            <input type="date" id="payments-filter-date-to" class="form-control" onchange="loadPaymentsTable()">
          </div>

          <!-- Кнопки действий -->
          <div style="display: flex; gap: 0.5rem; align-items: flex-end;">
            <button class="btn btn-primary" onclick="openModal('modal-payment')">
              <i class="fa-solid fa-plus"></i> <span class="btn-text-desktop">Добавить выплату</span>
            </button>
            <button class="btn btn-outline" onclick="exportPayments('xlsx')" title="Экспорт в Excel">
              <i class="fa-solid fa-file-excel text-success"></i> Excel
            </button>
            <button class="btn btn-outline" onclick="exportPayments('csv')" title="Экспорт в CSV">
              <i class="fa-solid fa-file-csv text-primary"></i> CSV
            </button>
          </div>

        </div>
      </div>
    </div>

    <!-- Таблица выплат -->
    <div class="card">
      <div class="card-header">
        <h4 class="card-title"><i class="fa-solid fa-receipt text-primary"></i> Реестр всех выплат</h4>
        <div id="payments-total-sum" class="font-bold text-success" style="font-size: 1.1rem;">Итого: 0 сум</div>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Дата выплаты</th>
              <th>Производитель</th>
              <th class="text-right">Сумма выплаты</th>
              <th>Способ оплаты</th>
              <th>Комментарий</th>
              <th class="text-center">Действия</th>
            </tr>
          </thead>
          <tbody id="all-payments-table-body">
            <tr><td colspan="7" class="text-center" style="padding: 2rem;">Загрузка выплат...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  await loadPaymentsTable();
}

async function loadPaymentsTable() {
  const mfgId = document.getElementById('payments-filter-mfg')?.value || '';
  const dateFrom = document.getElementById('payments-filter-date-from')?.value || '';
  const dateTo = document.getElementById('payments-filter-date-to')?.value || '';

  const query = new URLSearchParams();
  if (mfgId) query.set('manufacturer_id', mfgId);
  if (dateFrom) query.set('date_from', dateFrom);
  if (dateTo) query.set('date_to', dateTo);

  const data = await api(`/api/payments?${query.toString()}`);
  if (!data) return;

  const tbody = document.getElementById('all-payments-table-body');
  const totalEl = document.getElementById('payments-total-sum');
  if (!tbody) return;

  totalEl.textContent = `Итого выплат: ${formatMoney(data.totalAmount)}`;

  const payments = data.payments || [];
  if (payments.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center" style="padding: 3rem; color: var(--text-muted);">
          <i class="fa-solid fa-receipt" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
          Выплат по заданным фильтрам не найдено.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = payments.map(p => `
    <tr>
      <td>#${p.id}</td>
      <td><strong>${formatDate(p.payment_date)}</strong></td>
      <td><span class="badge badge-primary">${p.manufacturer_name}</span></td>
      <td class="text-right font-bold text-success" style="font-size: 1rem;">${formatMoney(p.amount)}</td>
      <td><span class="badge badge-warning">${p.payment_method}</span></td>
      <td>${p.comment || '—'}</td>
      <td class="text-center" style="white-space: nowrap;">
        <button class="btn btn-sm btn-outline" onclick="openEditPaymentModal(${p.id})" title="Редактировать">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="deletePaymentFromList(${p.id})" title="Удалить">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

async function deletePaymentFromList(id) {
  if (confirm('Удалить эту выплату? Баланс производителя автоматически пересчитается.')) {
    try {
      await api(`/api/payments/${id}`, { method: 'DELETE' });
      showToast('Выплата удалена');
      await loadPaymentsTable();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}

function exportPayments(format) {
  window.open(`/api/export/payments?format=${format}`, '_blank');
}
