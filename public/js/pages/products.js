/**
 * Products (Price List) Page Module — Support for 2 Price Lists
 */

let productsList = [];

async function renderProductsPage(container) {
  container.innerHTML = `
    <!-- Панель управления и поиск -->
    <div class="card mb-4">
      <div class="card-body">
        <div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: flex-end; justify-content: space-between;">
          
          <div style="flex: 2; min-width: 260px;">
            <label class="form-label">Поиск по прайс-листу</label>
            <div class="input-icon-wrapper">
              <i class="fa-solid fa-magnifying-glass input-icon"></i>
              <input type="text" id="products-search-input" class="form-control with-icon" placeholder="Поиск по названию лампы, артикулу, бренду..." oninput="debounceProductsSearch()">
            </div>
          </div>

          <div style="flex: 1; min-width: 160px;">
            <label class="form-label">Статус лампы</label>
            <select id="products-status-select" class="form-control" onchange="loadProducts()">
              <option value="">Все лампы</option>
              <option value="1" selected>Активные (в продаже)</option>
              <option value="0">В архиве</option>
            </select>
          </div>

          <div style="flex: 1; min-width: 180px;">
            <label class="form-label">Сортировка</label>
            <select id="products-sort-select" class="form-control" onchange="loadProducts()">
              <option value="name" selected>По названию (А-Я)</option>
              <option value="sale_price">По Прайсу 1 (Розница)</option>
              <option value="sale_price_2">По Прайсу 2 (Опт)</option>
              <option value="sale_price_3">По Прайсу 3 (Иностранный)</option>
              <option value="cost_price">По себестоимости</option>
            </select>
          </div>

          <div style="display: flex; gap: 0.5rem; align-items: flex-end;">
            <button class="btn btn-primary" onclick="openAddProductModal()">
              <i class="fa-solid fa-lightbulb"></i> <span class="btn-text-desktop">Добавить лампу</span>
            </button>
            <button class="btn btn-outline" onclick="exportProducts('xlsx')" title="Экспорт в Excel">
              <i class="fa-solid fa-file-excel text-success"></i> Excel
            </button>
            <button class="btn btn-outline" onclick="exportProducts('csv')" title="Экспорт в CSV">
              <i class="fa-solid fa-file-csv text-primary"></i> CSV
            </button>
          </div>

        </div>
      </div>
    </div>

    <!-- Таблица прайс-листа с 3 ценами -->
    <div class="card">
      <div class="card-header">
        <h4 class="card-title">
          <i class="fa-solid fa-list-check text-primary"></i>
          Прайс-лист ламп (Прайс 1 — Розница | Прайс 2 — Опт | Прайс 3 — Иностранный)
        </h4>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Наименование лампы</th>
              <th class="text-right" style="color: var(--primary);">Цена 1 (Розница)</th>
              <th class="text-right" style="color: var(--accent);">Цена 2 (Опт)</th>
              <th class="text-right" style="color: #a855f7;">Цена 3 (Иностранный)</th>
              <th class="text-right text-warning" title="Себестоимость для Прайса 1 и Прайса 3">Себест. 1, 3</th>
              <th class="text-right text-warning" title="Себестоимость для Прайса 2 (Опт)">Себест. 2 (Опт)</th>
              <th class="text-right text-primary">Маржа 1</th>
              <th class="text-right text-accent">Маржа 2</th>
              <th class="text-right" style="color: #a855f7;">Маржа 3</th>
              <th class="text-center">Статус</th>
              <th class="text-center">Действия</th>
            </tr>
          </thead>
          <tbody id="products-table-body">
            <tr><td colspan="12" class="text-center" style="padding: 2rem;">Загрузка прайс-листа...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  await loadProducts();
}

let prodSearchTimeout;
function debounceProductsSearch() {
  clearTimeout(prodSearchTimeout);
  prodSearchTimeout = setTimeout(() => {
    loadProducts();
  }, 300);
}

async function loadProducts() {
  const search = document.getElementById('products-search-input')?.value || '';
  const active = document.getElementById('products-status-select')?.value || '';
  const sort = document.getElementById('products-sort-select')?.value || 'name';

  const query = new URLSearchParams();
  if (search) query.set('search', search);
  if (active !== '') query.set('active', active);
  if (sort) query.set('sort', sort);
  query.set('order', sort === 'name' ? 'ASC' : 'DESC');

  const data = await api(`/api/products?${query.toString()}`);
  if (!data) return;

  productsList = data.products || [];
  const tbody = document.getElementById('products-table-body');
  if (!tbody) return;

  if (productsList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12" class="text-center" style="padding: 3rem; color: var(--text-muted);">
          <i class="fa-solid fa-lightbulb" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
          Ламп по заданным критериям не найдено. Нажмите «+ Добавить лампу».
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = productsList.map(p => {
    const p1 = p.sale_price || 0;
    const p2 = p.sale_price_2 !== undefined && p.sale_price_2 !== null ? p.sale_price_2 : p1;
    const p3 = p.sale_price_3 !== undefined && p.sale_price_3 !== null ? p.sale_price_3 : p2;
    const cost1 = p.cost_price || 0;
    const cost2 = p.cost_price_2 !== undefined && p.cost_price_2 !== null && p.cost_price_2 > 0 ? p.cost_price_2 : cost1;

    // Маржа в суммах за вычетом соответствующей себестоимости
    const margin1 = p1 - cost1;
    const margin2 = p2 - cost2;
    const margin3 = p3 - cost1;
    const isActive = p.active === 1;

    return `
      <tr style="${!isActive ? 'opacity: 0.6;' : ''}">
        <td>#${p.id}</td>
        <td>
          <span style="font-weight: 600; font-size: 0.95rem;">${p.name}</span>
          ${p.article ? `<span style="font-size: 0.75rem; color: var(--text-dim); display: block;">Арт: ${p.article}</span>` : ''}
        </td>
        
        <!-- Цена Прайс 1 -->
        <td class="text-right font-bold text-primary">${formatMoney(p1)}</td>
        
        <!-- Цена Прайс 2 -->
        <td class="text-right font-bold text-accent">${formatMoney(p2)}</td>

        <!-- Цена Прайс 3 -->
        <td class="text-right font-bold text-purple">${formatMoney(p3)}</td>

        <!-- Себестоимость 1 и 2 -->
        <td class="text-right text-warning font-bold">${formatMoney(cost1)}</td>
        <td class="text-right text-warning font-bold">${formatMoney(cost2)}</td>

        <!-- Маржа 1, 2 и 3 в суммах -->
        <td class="text-right font-bold text-primary">${formatMoney(margin1)}</td>
        <td class="text-right font-bold text-accent">${formatMoney(margin2)}</td>
        <td class="text-right font-bold text-purple">${formatMoney(margin3)}</td>

        <td class="text-center">
          <button class="badge ${isActive ? 'badge-success' : 'badge-danger'}" style="cursor: pointer; border: none;" onclick="toggleProductActive(${p.id})" title="Нажмите для смены статуса">
            <i class="fa-solid ${isActive ? 'fa-check' : 'fa-box-archive'}"></i>
            ${isActive ? 'Активна' : 'В архиве'}
          </button>
        </td>
        <td class="text-center" style="white-space: nowrap;">
          <button class="btn btn-sm btn-outline" onclick="openEditProductModal(${p.id})" title="Редактировать">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteProduct(${p.id}, '${p.name.replace(/'/g, "\\'")}')" title="Удалить или в архив">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function openAddProductModal() {
  document.getElementById('form-product').reset();
  document.getElementById('product-id').value = '';
  document.getElementById('product-cost-price-2').value = '';
  document.getElementById('product-unit').value = 'шт';
  document.getElementById('product-active').value = '1';
  document.getElementById('modal-product-title').textContent = 'Добавить новую лампу в прайс';
  calculateProductMarginPreview();
  openModal('modal-product');
}

function openEditProductModal(productId) {
  const p = productsList.find(item => item.id === productId);
  if (!p) return;

  document.getElementById('product-id').value = p.id;
  document.getElementById('product-name').value = p.name;
  document.getElementById('product-article').value = p.article || '';
  document.getElementById('product-sale-price').value = p.sale_price;
  document.getElementById('product-sale-price-2').value = p.sale_price_2 !== undefined ? p.sale_price_2 : p.sale_price;
  document.getElementById('product-sale-price-3').value = p.sale_price_3 !== undefined ? p.sale_price_3 : (p.sale_price_2 !== undefined ? p.sale_price_2 : p.sale_price);
  document.getElementById('product-cost-price').value = p.cost_price;
  document.getElementById('product-cost-price-2').value = p.cost_price_2 !== undefined && p.cost_price_2 !== null ? p.cost_price_2 : p.cost_price;
  document.getElementById('product-manufacturer').value = p.manufacturer || '';
  document.getElementById('product-unit').value = p.unit || 'шт';
  document.getElementById('product-active').value = p.active;
  document.getElementById('modal-product-title').textContent = 'Редактировать лампу в прайсе';

  calculateProductMarginPreview();
  openModal('modal-product');
}

async function toggleProductActive(productId) {
  try {
    const res = await api(`/api/products/${productId}/toggle-active`, { method: 'PATCH' });
    showToast(`Статус лампы изменен на "${res.active === 1 ? 'Активна' : 'В архиве'}"`);
    await loadProducts();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteProduct(productId, productName) {
  if (confirm(`Вы действительно хотите удалить или перенести в архив лампу "${productName}"?`)) {
    try {
      const res = await api(`/api/products/${productId}`, { method: 'DELETE' });
      showToast(res.message || 'Лампа успешно удалена');
      await loadProducts();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}

function exportProducts(format) {
  window.open(`/api/export/products?format=${format}`, '_blank');
}
