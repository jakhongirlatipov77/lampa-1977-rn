/**
 * Settlements with Manufacturers Page Module
 */

async function renderSettlementsPage(container) {
  const data = await api('/api/manufacturers');
  if (!data) return;

  const { totalProfit, allTimeProfit, manufacturers = [] } = data;
  const m1 = manufacturers[0] || { id: 1, name: 'Производитель 1', percentage: 50, accrued_all_time: 0, paid_all_time: 0, remaining_debt: 0 };
  const m2 = manufacturers[1] || { id: 2, name: 'Производитель 2', percentage: 50, accrued_all_time: 0, paid_all_time: 0, remaining_debt: 0 };

  container.innerHTML = `
    <!-- Карточки производителей с балансами -->
    <div class="mfg-split-grid mb-4">
      
      <!-- Производитель 1 -->
      <div class="mfg-card">
        <div class="mfg-card-header">
          <span class="mfg-name"><i class="fa-solid fa-industry text-primary"></i> ${m1.name}</span>
          <span class="mfg-share-badge">${m1.percentage}% прибыли</span>
        </div>
        <div class="mfg-stats-row mb-3">
          <div class="mfg-stat-box">
            <div class="mfg-stat-title">Начислено прибыли</div>
            <div class="mfg-stat-num">${formatMoney(m1.accrued_all_time)}</div>
          </div>
          <div class="mfg-stat-box">
            <div class="mfg-stat-title">Выплачено</div>
            <div class="mfg-stat-num mfg-stat-paid">${formatMoney(m1.paid_all_time)}</div>
          </div>
          <div class="mfg-stat-box">
            <div class="mfg-stat-title">Остаток к выплате</div>
            <div class="mfg-stat-num mfg-stat-debt">${formatMoney(m1.remaining_debt)}</div>
          </div>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-sm btn-primary btn-block" onclick="openAddPaymentModalFor(${m1.id})">
            <i class="fa-solid fa-money-bill-transfer"></i> Внести выплату
          </button>
        </div>
      </div>

      <!-- Производитель 2 -->
      <div class="mfg-card">
        <div class="mfg-card-header">
          <span class="mfg-name"><i class="fa-solid fa-industry text-accent"></i> ${m2.name}</span>
          <span class="mfg-share-badge" style="background-color: rgba(16, 185, 129, 0.15); color: var(--accent); border-color: rgba(16, 185, 129, 0.3);">${m2.percentage}% прибыли</span>
        </div>
        <div class="mfg-stats-row mb-3">
          <div class="mfg-stat-box">
            <div class="mfg-stat-title">Начислено прибыли</div>
            <div class="mfg-stat-num">${formatMoney(m2.accrued_all_time)}</div>
          </div>
          <div class="mfg-stat-box">
            <div class="mfg-stat-title">Выплачено</div>
            <div class="mfg-stat-num mfg-stat-paid">${formatMoney(m2.paid_all_time)}</div>
          </div>
          <div class="mfg-stat-box">
            <div class="mfg-stat-title">Остаток к выплате</div>
            <div class="mfg-stat-num mfg-stat-debt">${formatMoney(m2.remaining_debt)}</div>
          </div>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-sm btn-accent btn-block" onclick="openAddPaymentModalFor(${m2.id})">
            <i class="fa-solid fa-money-bill-transfer"></i> Внести выплату
          </button>
        </div>
      </div>

    </div>

    <!-- Раздел истории выплат -->
    <div class="card">
      <div class="card-header">
        <h4 class="card-title"><i class="fa-solid fa-clock-rotate-left text-primary"></i> История взаиморасчетов и выплат</h4>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-sm btn-outline" onclick="openMfgSettingsModal()">
            <i class="fa-solid fa-sliders"></i> Изменить % долей
          </button>
          <button class="btn btn-sm btn-primary" onclick="openModal('modal-payment')">
            <i class="fa-solid fa-plus"></i> Добавить выплату
          </button>
        </div>
      </div>
      <div class="card-body" id="settlements-payments-container">
        <div class="text-center" style="padding: 1.5rem;">Загрузка истории выплат...</div>
      </div>
    </div>
  `;

  await loadSettlementsPayments();
}

async function openAddPaymentModalFor(mfgId) {
  openModal('modal-payment');
  await loadManufacturersIntoPaymentSelect();
  setTimeout(() => {
    const sel = document.getElementById('payment-manufacturer-id');
    if (sel) sel.value = mfgId;
  }, 50);
}

async function loadSettlementsPayments() {
  const container = document.getElementById('settlements-payments-container');
  if (!container) return;

  const data = await api('/api/payments');
  if (!data) return;

  const payments = data.payments || [];

  if (payments.length === 0) {
    container.innerHTML = `
      <div class="text-center" style="padding: 2.5rem; color: var(--text-muted);">
        <i class="fa-solid fa-hand-holding-dollar" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
        Выплат пока не зафиксировано. Нажмите кнопку «Добавить выплату», чтобы внести первый платеж.
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="table-responsive">
      <table class="data-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Производитель</th>
            <th class="text-right">Сумма выплаты</th>
            <th>Способ оплаты</th>
            <th>Комментарий</th>
            <th class="text-center">Действия</th>
          </tr>
        </thead>
        <tbody>
          ${payments.map(p => `
            <tr>
              <td><strong>${formatDate(p.payment_date)}</strong></td>
              <td><span class="badge badge-primary">${p.manufacturer_name}</span></td>
              <td class="text-right font-bold text-success" style="font-size: 1rem;">${formatMoney(p.amount)}</td>
              <td><span class="badge badge-warning">${p.payment_method}</span></td>
              <td>${p.comment || '—'}</td>
              <td class="text-center" style="white-space: nowrap;">
                <button class="btn btn-sm btn-outline" onclick="openEditPaymentModal(${p.id})" title="Редактировать">
                  <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deletePayment(${p.id})" title="Удалить выплату">
                  <i class="fa-solid fa-trash-can"></i>
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function openEditPaymentModal(paymentId) {
  const data = await api('/api/payments');
  const p = data?.payments?.find(item => item.id === paymentId);
  if (!p) return;

  await loadManufacturersIntoPaymentSelect();

  document.getElementById('payment-id').value = p.id;
  document.getElementById('payment-manufacturer-id').value = p.manufacturer_id;
  document.getElementById('payment-date').value = p.payment_date;
  document.getElementById('payment-amount').value = p.amount;
  document.getElementById('payment-method').value = p.payment_method;
  document.getElementById('payment-comment').value = p.comment || '';
  document.getElementById('modal-payment-title').textContent = 'Редактировать выплату';

  openModal('modal-payment');
}

async function deletePayment(paymentId) {
  if (confirm('Вы уверены, что хотите удалить эту выплату? Задолженность производителя будет пересчитана автоматически.')) {
    try {
      await api(`/api/payments/${paymentId}`, { method: 'DELETE' });
      showToast('Выплата успешно удалена');
      renderPage('settlements');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}
