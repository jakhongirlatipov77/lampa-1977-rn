/**
 * New Order (Order Builder) Page Module — Support for 2 Price Lists & Client Price Management
 */

let orderItemsRows = [];
let availableProducts = [];
let availableClients = [];
let mfgSettings = [];
let editingOrderId = null;
let currentOrderPriceType = 1; // 1: Прайс 1 (Розница), 2: Прайс 2 (Опт)

async function renderNewOrderPage(container) {
  editingOrderId = window.pageParams?.editOrderId || null;
  window.pageParams = null; // сбрасываем

  // Загружаем каталог ламп, клиентов и производителей
  const [prodsData, clientsData, mfgData] = await Promise.all([
    api('/api/products?active=1'),
    api('/api/clients'),
    api('/api/manufacturers')
  ]);

  availableProducts = prodsData ? prodsData.products : [];
  availableClients = clientsData ? clientsData.clients : [];
  mfgSettings = mfgData ? mfgData.manufacturers : [];
  currentOrderPriceType = 1;

  container.innerHTML = `
    <div style="max-width: 1050px; margin: 0 auto;">
      <form id="order-builder-form" onsubmit="handleOrderBuilderSubmit(event)">
        
        <!-- Верхняя карточка: Клиент, Прайс-лист и Дата -->
        <div class="card mb-4">
          <div class="card-header">
            <h3 class="card-title">
              <i class="fa-solid fa-file-invoice-dollar text-primary"></i>
              ${editingOrderId ? `Редактирование заказа #${editingOrderId}` : 'Создание нового заказа'}
            </h3>
          </div>
          <div class="card-body">
            <div class="form-row mb-3">
              
              <!-- Выбор клиента -->
              <div class="form-group col-md-5 mb-0">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.45rem;">
                  <label for="order-client-select" class="form-label" style="margin-bottom: 0;">Клиент <span class="req">*</span></label>
                  <div style="display: flex; gap: 0.4rem;">
                    <button type="button" id="btn-edit-selected-client" class="btn btn-sm btn-outline" style="display: none;" onclick="openEditSelectedClientModal()" title="Редактировать выбранного клиента">
                      <i class="fa-solid fa-user-pen"></i> Редактировать
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-primary" onclick="openAddClientModal()">
                      <i class="fa-solid fa-user-plus"></i> + Новый клиент
                    </button>
                  </div>
                </div>
                <select id="order-client-select" class="form-control" required onchange="onClientSelected()">
                  <option value="">-- Выберите клиента из базы --</option>
                  ${availableClients.map(c => {
                    const pt = c.price_type || 1;
                    const ptLabel = pt === 3 ? 'Прайс 3 (Иностранный)' : (pt === 2 ? 'Прайс 2 (Опт)' : 'Прайс 1 (Розница)');
                    return `
                      <option value="${c.id}" data-city="${c.city}" data-phone="${c.phone || ''}" data-address="${c.address || ''}" data-pricetype="${pt}">
                        ${c.name} (${c.city}) [${ptLabel}]
                      </option>
                    `;
                  }).join('')}
                </select>
                <div id="selected-client-info" style="display: none;"></div>
              </div>

              <!-- Переключатель Прайс-листа для этого заказа -->
              <div class="form-group col-md-3 mb-0">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.45rem;">
                  <label class="form-label" style="margin-bottom: 0;">Прайс в заказе</label>
                  <span id="price-type-indicator-badge" class="badge badge-primary">Розница</span>
                </div>
                <div style="display: flex; gap: 0.35rem;">
                  <button type="button" id="btn-price-type-1" class="btn btn-block ${currentOrderPriceType === 1 ? 'btn-primary' : 'btn-secondary'}" onclick="setOrderPriceType(1)">
                    <i class="fa-solid fa-tag"></i> Прайс 1
                  </button>
                  <button type="button" id="btn-price-type-2" class="btn btn-block ${currentOrderPriceType === 2 ? 'btn-accent' : 'btn-secondary'}" onclick="setOrderPriceType(2)">
                    <i class="fa-solid fa-tags"></i> Прайс 2
                  </button>
                  <button type="button" id="btn-price-type-3" class="btn btn-block ${currentOrderPriceType === 3 ? 'btn-purple' : 'btn-secondary'}" onclick="setOrderPriceType(3)">
                    <i class="fa-solid fa-bolt"></i> Прайс 3
                  </button>
                </div>
                <div style="margin-top: 0.45rem;">
                  <label class="checkbox-label" title="Если отметить, при сохранении заказа выбранный прайс-лист сохранится как постоянный прайс для этого клиента">
                    <input type="checkbox" id="update-client-price-checkbox">
                    <span>Закрепить за клиентом</span>
                  </label>
                </div>
              </div>

              <!-- Статус заказа -->
              <div class="form-group col-md-2 mb-0">
                <label for="order-status-select" class="form-label">Статус заказа</label>
                <select id="order-status-select" class="form-control font-bold">
                  <option value="in_process" selected>⏳ В процессе</option>
                  <option value="shipped">🚚 Отправлен</option>
                  <option value="completed">✅ Завершен</option>
                </select>
              </div>

              <!-- Дата заказа -->
              <div class="form-group col-md-2 mb-0">
                <label for="order-date-input" class="form-label">Дата продажи <span class="req">*</span></label>
                <input type="date" id="order-date-input" class="form-control" value="${getTodayDateString()}" required>
              </div>

            </div>

            <!-- Комментарий к заказу -->
            <div class="form-group" style="margin-bottom: 0;">
              <label for="order-comment-input" class="form-label">Комментарий / Примечание к заказу</label>
              <input type="text" id="order-comment-input" class="form-control" placeholder="Например: Самовывоз со склада, предоплата 50%...">
            </div>
          </div>
        </div>

        <!-- Центральная карточка: Список ламп в заказе -->
        <div class="card mb-4">
          <div class="card-header">
            <h4 class="card-title">
              <i class="fa-solid fa-boxes-stacked text-accent"></i>
              Позиции заказа (Лампы)
            </h4>
            <button type="button" class="btn btn-sm btn-outline" onclick="openAddProductModal()">
              <i class="fa-solid fa-plus"></i> Добавить новую лампу в прайс
            </button>
          </div>
          <div class="card-body">
            
            <div class="table-responsive">
              <table class="order-items-table">
                <thead>
                  <tr>
                    <th style="width: 34%;">Лампа из прайса <span class="req">*</span></th>
                    <th style="width: 14%;" class="text-right">Цена (1 шт)</th>
                    <th style="width: 14%;" class="text-right">Себест. (1 шт)</th>
                    <th style="width: 10%;" class="text-center">Кол-во <span class="req">*</span></th>
                    <th style="width: 14%;" class="text-right">Сумма</th>
                    <th style="width: 14%;" class="text-right">Прибыль</th>
                    <th style="width: 4%;"></th>
                  </tr>
                </thead>
                <tbody id="order-items-tbody">
                  <!-- Динамические строки -->
                </tbody>
              </table>
            </div>

            <div style="margin-top: 1.25rem;">
              <button type="button" class="btn btn-secondary" onclick="addOrderItemRow()">
                <i class="fa-solid fa-plus"></i> + Добавить еще лампу в заказ
              </button>
            </div>

          </div>
        </div>

        <!-- Нижняя карточка: Итоговые расчеты и распределение прибыли -->
        <div class="card mb-4">
          <div class="card-body">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem;">
              
              <!-- Финансовый итог -->
              <div class="order-summary-box">
                <h5 class="font-bold text-primary mb-2">Итоги по заказу</h5>
                <div class="summary-row">
                  <span>Общая сумма продажи:</span>
                  <strong id="builder-total-sale" style="font-size: 1.15rem;">0 сум</strong>
                </div>
                <div class="summary-row">
                  <span>Общая себестоимость:</span>
                  <strong id="builder-total-cost" class="text-warning">0 сум</strong>
                </div>
                <div class="summary-row total-row">
                  <span>Общая чистая прибыль:</span>
                  <span id="builder-total-profit">0 сум</span>
                </div>
              </div>

              <!-- Превью распределения между производителями -->
              <div class="order-summary-box" style="background: var(--bg-subtle);">
                <h5 class="font-bold text-accent mb-2">Распределение прибыли</h5>
                <div class="summary-row">
                  <span>${mfgSettings[0]?.name || 'Производитель 1'} (${mfgSettings[0]?.percentage || 50}%):</span>
                  <strong id="builder-mfg1-share" class="text-primary">0 сум</strong>
                </div>
                <div class="summary-row">
                  <span>${mfgSettings[1]?.name || 'Производитель 2'} (${mfgSettings[1]?.percentage || 50}%):</span>
                  <strong id="builder-mfg2-share" class="text-accent">0 сум</strong>
                </div>
                <div style="font-size: 0.775rem; color: var(--text-dim); margin-top: 0.5rem;">
                  <i class="fa-solid fa-circle-info"></i> Доли рассчитываются автоматически согласно настройкам системы.
                </div>
              </div>

            </div>
          </div>
        </div>

        <!-- Кнопки отправки -->
        <div style="display: flex; gap: 1rem; justify-content: flex-end;">
          <button type="button" class="btn btn-secondary btn-lg" onclick="navigate('orders')">
            Отмена
          </button>
          <button type="submit" id="btn-save-order" class="btn btn-primary btn-lg glow-btn">
            <i class="fa-solid fa-check"></i>
            <span>${editingOrderId ? 'Сохранить изменения' : 'Подтвердить и сохранить заказ'}</span>
          </button>
        </div>

      </form>
    </div>
  `;

  if (editingOrderId) {
    await loadOrderForEdit(editingOrderId);
  } else {
    addOrderItemRow();
  }
}

function setOrderPriceType(type) {
  const parsed = Number(type);
  currentOrderPriceType = [1, 2, 3].includes(parsed) ? parsed : 1;

  const btn1 = document.getElementById('btn-price-type-1');
  const btn2 = document.getElementById('btn-price-type-2');
  const btn3 = document.getElementById('btn-price-type-3');
  const badge = document.getElementById('price-type-indicator-badge');

  if (btn1 && btn2 && btn3) {
    btn1.className = currentOrderPriceType === 1 ? 'btn btn-block btn-primary' : 'btn btn-block btn-secondary';
    btn2.className = currentOrderPriceType === 2 ? 'btn btn-block btn-accent' : 'btn btn-block btn-secondary';
    btn3.className = currentOrderPriceType === 3 ? 'btn btn-block btn-purple' : 'btn btn-block btn-secondary';

    if (badge) {
      if (currentOrderPriceType === 1) {
        badge.className = 'badge badge-primary';
        badge.textContent = 'Розница';
      } else if (currentOrderPriceType === 2) {
        badge.className = 'badge badge-success';
        badge.textContent = 'Опт';
      } else {
        badge.className = 'badge badge-purple';
        badge.textContent = 'Иностранный';
      }
    }
  }

  // Обновляем цены и себестоимость во всех существующих строках ламп
  const rows = document.querySelectorAll('#order-items-tbody tr');
  rows.forEach(row => {
    const select = row.querySelector('.item-product-select');
    const opt = select?.options[select.selectedIndex];
    if (select && select.value && opt) {
      const sale1 = parseFloat(opt.getAttribute('data-sale1')) || 0;
      const sale2 = parseFloat(opt.getAttribute('data-sale2')) || sale1;
      const sale3 = parseFloat(opt.getAttribute('data-sale3')) || sale2;
      const cost1 = parseFloat(opt.getAttribute('data-cost1') || opt.getAttribute('data-cost')) || 0;
      const cost2 = parseFloat(opt.getAttribute('data-cost2') || opt.getAttribute('data-cost1')) || cost1;

      let targetSale = sale1;
      let targetCost = cost1;

      if (currentOrderPriceType === 3) {
        targetSale = sale3;
        targetCost = cost1; // Себестоимость для Прайса 3 равна Себестоимости 1
      } else if (currentOrderPriceType === 2) {
        targetSale = sale2;
        targetCost = cost2; // Отдельная себестоимость для Прайса 2 (Опт)
      } else {
        targetSale = sale1;
        targetCost = cost1; // Себестоимость 1 для Прайса 1
      }

      const priceInput = row.querySelector('.item-sale-price');
      if (priceInput) priceInput.value = targetSale;

      const costInput = row.querySelector('.item-cost-price');
      if (costInput) costInput.value = targetCost;
    }
  });

  calculateOrderBuilderTotals();
}

function onClientSelected() {
  const select = document.getElementById('order-client-select');
  const infoEl = document.getElementById('selected-client-info');
  const editBtn = document.getElementById('btn-edit-selected-client');
  if (!select) return;

  const selectedClientId = select.value ? parseInt(select.value, 10) : null;
  const client = availableClients.find(c => c.id === selectedClientId);

  if (client) {
    if (editBtn) editBtn.style.display = 'inline-flex';
    const clientPriceType = client.price_type || 1;
    let badgeHtml = '<span class="badge badge-primary"><i class="fa-solid fa-tag"></i> Прайс 1 (Розница)</span>';
    if (clientPriceType === 2) {
      badgeHtml = '<span class="badge badge-success"><i class="fa-solid fa-tags"></i> Прайс 2 (Опт)</span>';
    } else if (clientPriceType === 3) {
      badgeHtml = '<span class="badge badge-purple"><i class="fa-solid fa-bolt"></i> Прайс 3 (Иностранный)</span>';
    }

    infoEl.className = 'client-order-card';
    infoEl.innerHTML = `
      <div class="client-order-header">
        <div class="client-order-details">
          <span><i class="fa-solid fa-location-dot text-primary"></i> <strong>${client.city}</strong></span>
          ${client.phone ? `<span><i class="fa-solid fa-phone text-muted"></i> ${client.phone}</span>` : ''}
          ${client.address ? `<span><i class="fa-solid fa-house text-muted"></i> ${client.address}</span>` : ''}
        </div>
        <div>
          <button type="button" class="btn btn-sm btn-outline" onclick="openEditSelectedClientModal()" title="Изменить данные клиента">
            <i class="fa-solid fa-pen-to-square"></i> Изменить данные
          </button>
        </div>
      </div>
      
      <!-- Блок мгновенной смены прайс-листа клиента -->
      <div class="client-order-price-bar">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span style="font-size: 0.8rem; color: var(--text-muted);">Прайс клиента в базе:</span>
          ${badgeHtml}
        </div>
        <div style="display: flex; align-items: center; gap: 0.35rem;">
          <span style="font-size: 0.75rem; color: var(--text-dim);">Сменить:</span>
          <button type="button" 
                  class="price-type-toggle-btn ${clientPriceType === 1 ? 'active-p1' : 'inactive'}" 
                  onclick="changeClientPriceTypeFast(${client.id}, 1)"
                  title="Установить Прайс 1 (Розница) для этого клиента в базе">
            <i class="fa-solid fa-tag"></i> Розница
          </button>
          <button type="button" 
                  class="price-type-toggle-btn ${clientPriceType === 2 ? 'active-p2' : 'inactive'}" 
                  onclick="changeClientPriceTypeFast(${client.id}, 2)"
                  title="Установить Прайс 2 (Опт) для этого клиента в базе">
            <i class="fa-solid fa-tags"></i> Опт
          </button>
          <button type="button" 
                  class="price-type-toggle-btn ${clientPriceType === 3 ? 'active-p3' : 'inactive'}" 
                  onclick="changeClientPriceTypeFast(${client.id}, 3)"
                  title="Установить Прайс-лист №3 (Иностранный) для этого клиента в базе">
            <i class="fa-solid fa-bolt"></i> Иностранный
          </button>
        </div>
      </div>
    `;
    infoEl.style.display = 'flex';

    // Автоматически переключаем прайс-лист в заказе на закрепленный за клиентом
    setOrderPriceType(client.price_type || 1);
  } else {
    if (editBtn) editBtn.style.display = 'none';
    infoEl.style.display = 'none';
  }
}

async function changeClientPriceTypeFast(clientId, newPriceType) {
  const parsed = Number(newPriceType);
  const targetType = [1, 2, 3].includes(parsed) ? parsed : 1;
  const client = availableClients.find(c => c.id === Number(clientId));
  if (!client) return;

  try {
    const res = await api(`/api/clients/${clientId}/price-type`, {
      method: 'PATCH',
      body: JSON.stringify({ price_type: targetType })
    });

    if (res && res.client) {
      client.price_type = res.client.price_type;
      updateClientInOrderSelect(res.client);
      onClientSelected();
      setOrderPriceType(targetType);
      const nameMap = { 1: 'Прайс 1 (Розница)', 2: 'Прайс 2 (Опт)', 3: 'Прайс-лист №3 (Иностранный)' };
      showToast(`Прайс клиента "${client.name}" успешно изменен на ${nameMap[targetType]}!`);
    }
  } catch (err) {
    showToast(err.message || 'Ошибка изменения прайса клиента', 'error');
  }
}

function openEditSelectedClientModal() {
  const select = document.getElementById('order-client-select');
  if (select && select.value) {
    openEditClientModal(parseInt(select.value, 10));
  } else {
    showToast('Сначала выберите клиента', 'error');
  }
}

function updateClientInOrderSelect(updatedClient) {
  const select = document.getElementById('order-client-select');
  if (!select) return;

  // Обновляем в массиве
  const idx = availableClients.findIndex(c => c.id === updatedClient.id);
  if (idx !== -1) {
    availableClients[idx] = { ...availableClients[idx], ...updatedClient };
  } else {
    availableClients.push(updatedClient);
  }

  // Обновляем <option>
  let opt = select.querySelector(`option[value="${updatedClient.id}"]`);
  if (!opt) {
    opt = document.createElement('option');
    opt.value = updatedClient.id;
    select.appendChild(opt);
  }

  const pt = updatedClient.price_type || 1;
  const labelPt = pt === 3 ? 'Прайс 3 (Иностранный)' : (pt === 2 ? 'Прайс 2 (Опт)' : 'Прайс 1 (Розница)');

  opt.setAttribute('data-city', updatedClient.city);
  opt.setAttribute('data-phone', updatedClient.phone || '');
  opt.setAttribute('data-address', updatedClient.address || '');
  opt.setAttribute('data-pricetype', pt);
  opt.textContent = `${updatedClient.name} (${updatedClient.city}) [${labelPt}]`;
}

function onClientUpdatedInline(updatedClient) {
  updateClientInOrderSelect(updatedClient);
  const select = document.getElementById('order-client-select');
  if (select) {
    select.value = updatedClient.id;
    onClientSelected();
  }
}

function onClientCreatedInline(newClient) {
  updateClientInOrderSelect(newClient);
  const select = document.getElementById('order-client-select');
  if (select) {
    select.value = newClient.id;
    onClientSelected();
  }
}

let rowCounter = 0;

function addOrderItemRow(initialData = null) {
  rowCounter++;
  const rowId = `item-row-${rowCounter}`;
  const tbody = document.getElementById('order-items-tbody');

  const tr = document.createElement('tr');
  tr.id = rowId;
  tr.innerHTML = `
    <td>
      <select class="form-control item-product-select" required onchange="onProductRowChange('${rowId}')">
        <option value="">-- Выберите лампу --</option>
        ${availableProducts.map(p => {
          const p1 = p.sale_price;
          const p2 = p.sale_price_2 !== undefined && p.sale_price_2 !== null ? p.sale_price_2 : p1;
          const p3 = p.sale_price_3 !== undefined && p.sale_price_3 !== null ? p.sale_price_3 : p2;
          const c1 = p.cost_price || 0;
          const c2 = p.cost_price_2 !== undefined && p.cost_price_2 !== null && p.cost_price_2 > 0 ? p.cost_price_2 : c1;
          return `
            <option value="${p.id}" data-name="${p.name}" data-article="${p.article || ''}" data-sale1="${p1}" data-sale2="${p2}" data-sale3="${p3}" data-cost1="${c1}" data-cost2="${c2}" ${initialData && initialData.product_id == p.id ? 'selected' : ''}>
              ${p.name} ${p.article ? '[' + p.article + ']' : ''} — Р: ${formatMoney(p1)} | О: ${formatMoney(p2)} | Ин: ${formatMoney(p3)}
            </option>
          `;
        }).join('')}
      </select>
      <input type="hidden" class="item-custom-name" value="${initialData ? initialData.product_name_snapshot : ''}">
      <input type="hidden" class="item-custom-article" value="${initialData ? (initialData.article_snapshot || '') : ''}">
    </td>
    <td>
      <input type="number" class="form-control text-right item-sale-price font-bold" min="0" step="any" placeholder="0" value="${initialData ? (initialData.sale_price_snapshot !== undefined ? initialData.sale_price_snapshot : initialData.sale_price) : 0}" required oninput="calculateOrderBuilderTotals()">
    </td>
    <td>
      <input type="number" class="form-control text-right item-cost-price text-warning font-bold" min="0" step="any" placeholder="0" value="${initialData ? (initialData.cost_price_snapshot !== undefined ? initialData.cost_price_snapshot : initialData.cost_price) : 0}" required oninput="calculateOrderBuilderTotals()">
    </td>
    <td>
      <input type="number" class="form-control text-center font-bold item-quantity" min="1" step="1" placeholder="1" value="${initialData ? initialData.quantity : 1}" required oninput="calculateOrderBuilderTotals()">
    </td>
    <td class="text-right font-bold item-total-cell">0 сум</td>
    <td class="text-right font-bold text-success item-profit-cell">0 сум</td>
    <td class="text-center">
      <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeOrderItemRow('${rowId}')" title="Удалить строку">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </td>
  `;

  tbody.appendChild(tr);

  if (initialData) {
    calculateOrderBuilderTotals();
  }
}

function removeOrderItemRow(rowId) {
  const row = document.getElementById(rowId);
  const allRows = document.querySelectorAll('#order-items-tbody tr');
  if (allRows.length <= 1) {
    showToast('В заказе должна оставаться хотя бы одна лампа', 'error');
    return;
  }
  row?.remove();
  calculateOrderBuilderTotals();
}

function onProductRowChange(rowId) {
  const row = document.getElementById(rowId);
  if (!row) return;

  const select = row.querySelector('.item-product-select');
  const opt = select.options[select.selectedIndex];

  if (select.value && opt) {
    const sale1 = parseFloat(opt.getAttribute('data-sale1')) || 0;
    const sale2 = parseFloat(opt.getAttribute('data-sale2')) || sale1;
    const sale3 = parseFloat(opt.getAttribute('data-sale3')) || sale2;
    const cost1 = parseFloat(opt.getAttribute('data-cost1')) || 0;
    const cost2 = parseFloat(opt.getAttribute('data-cost2')) || cost1;
    const name = opt.getAttribute('data-name') || '';
    const article = opt.getAttribute('data-article') || '';

    let targetSale = sale1;
    let targetCost = cost1;

    if (currentOrderPriceType === 3) {
      targetSale = sale3;
      targetCost = cost1;
    } else if (currentOrderPriceType === 2) {
      targetSale = sale2;
      targetCost = cost2;
    } else {
      targetSale = sale1;
      targetCost = cost1;
    }

    row.querySelector('.item-sale-price').value = targetSale;
    row.querySelector('.item-cost-price').value = targetCost;
    row.querySelector('.item-custom-name').value = name;
    row.querySelector('.item-custom-article').value = article;
  }

  calculateOrderBuilderTotals();
}

function calculateOrderBuilderTotals() {
  let totalSale = 0;
  let totalCost = 0;
  let totalProfit = 0;

  const rows = document.querySelectorAll('#order-items-tbody tr');
  rows.forEach(row => {
    const salePrice = parseFloat(row.querySelector('.item-sale-price')?.value) || 0;
    const costPrice = parseFloat(row.querySelector('.item-cost-price')?.value) || 0;
    const qty = parseInt(row.querySelector('.item-quantity')?.value, 10) || 0;

    const rowSale = Math.round(salePrice * qty * 100) / 100;
    const rowCost = Math.round(costPrice * qty * 100) / 100;
    const rowProfit = Math.round((rowSale - rowCost) * 100) / 100;

    totalSale += rowSale;
    totalCost += rowCost;
    totalProfit += rowProfit;

    const totalCell = row.querySelector('.item-total-cell');
    const profitCell = row.querySelector('.item-profit-cell');

    if (totalCell) totalCell.textContent = formatMoney(rowSale);
    if (profitCell) profitCell.textContent = formatMoney(rowProfit);
  });

  totalSale = Math.round(totalSale * 100) / 100;
  totalCost = Math.round(totalCost * 100) / 100;
  totalProfit = Math.round(totalProfit * 100) / 100;

  const saleEl = document.getElementById('builder-total-sale');
  const costEl = document.getElementById('builder-total-cost');
  const profitEl = document.getElementById('builder-total-profit');

  if (saleEl) saleEl.textContent = formatMoney(totalSale);
  if (costEl) costEl.textContent = formatMoney(totalCost);
  if (profitEl) profitEl.textContent = formatMoney(totalProfit);

  const p1 = mfgSettings[0]?.percentage || 50;
  const p2 = mfgSettings[1]?.percentage || 50;

  const mfg1Share = Math.round(totalProfit * (p1 / 100) * 100) / 100;
  const mfg2Share = Math.round(totalProfit * (p2 / 100) * 100) / 100;

  const mfg1El = document.getElementById('builder-mfg1-share');
  const mfg2El = document.getElementById('builder-mfg2-share');

  if (mfg1El) mfg1El.textContent = formatMoney(mfg1Share);
  if (mfg2El) mfg2El.textContent = formatMoney(mfg2Share);
}

async function handleOrderBuilderSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-save-order');

  const clientId = document.getElementById('order-client-select').value;
  const orderDate = document.getElementById('order-date-input').value;
  const status = document.getElementById('order-status-select')?.value || 'in_process';
  const comment = document.getElementById('order-comment-input').value.trim();
  const updateClientPrice = document.getElementById('update-client-price-checkbox')?.checked || false;

  if (!clientId) {
    showToast('Выберите клиента', 'error');
    return;
  }

  const items = [];
  const rows = document.querySelectorAll('#order-items-tbody tr');

  rows.forEach(row => {
    const prodSelect = row.querySelector('.item-product-select');
    const productId = prodSelect?.value || null;
    const productName = row.querySelector('.item-custom-name')?.value || prodSelect?.options[prodSelect.selectedIndex]?.text;
    const article = row.querySelector('.item-custom-article')?.value || null;
    const salePrice = parseFloat(row.querySelector('.item-sale-price')?.value);
    const costPrice = parseFloat(row.querySelector('.item-cost-price')?.value);
    const quantity = parseInt(row.querySelector('.item-quantity')?.value, 10);

    if (quantity > 0) {
      items.push({
        product_id: productId,
        product_name: productName,
        article: article,
        sale_price: salePrice,
        cost_price: costPrice,
        quantity: quantity
      });
    }
  });

  if (items.length === 0) {
    showToast('Добавьте хотя бы одну лампу с количеством больше 0', 'error');
    return;
  }

  btn.disabled = true;

  try {
    const payload = {
      client_id: clientId,
      order_date: orderDate,
      price_type: currentOrderPriceType,
      update_client_price_type: updateClientPrice,
      status: status,
      comment: comment,
      items: items
    };

    if (editingOrderId) {
      await api(`/api/orders/${editingOrderId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showToast(`Заказ #${editingOrderId} успешно обновлен!`);
    } else {
      const res = await api('/api/orders', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast(`Заказ #${res.order.id} успешно создан!`);
    }

    navigate('orders');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function loadOrderForEdit(orderId) {
  const data = await api(`/api/orders/${orderId}`);
  if (!data || !data.order) return;

  const ord = data.order;
  document.getElementById('order-client-select').value = ord.client_id;
  document.getElementById('order-date-input').value = ord.order_date;
  if (document.getElementById('order-status-select') && ord.status) {
    document.getElementById('order-status-select').value = ord.status === 'active' ? 'completed' : ord.status;
  }
  document.getElementById('order-comment-input').value = ord.comment || '';
  if (ord.price_type) setOrderPriceType(ord.price_type);
  onClientSelected();

  const tbody = document.getElementById('order-items-tbody');
  tbody.innerHTML = '';

  ord.items.forEach(item => {
    addOrderItemRow(item);
  });
}
