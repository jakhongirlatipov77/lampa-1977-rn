/**
 * Settings Page Module:
 * - Profit Distribution
 * - Price Lists
 * - User Management (Пользователи и пароли)
 * - Passcode Security (Кодовые слова доступа)
 * - Backup & Database
 */

let _settingsCachedPasscodes = [];
let _settingsCachedUsers = [];
let _settingsCurrentUserId = null;

async function renderSettingsPage(container) {
  const [mfgData, dbInfo, passcodesData, usersData] = await Promise.all([
    api('/api/manufacturers'),
    api('/api/backup/info'),
    api('/api/passcodes').catch(() => ({ passcodes: [] })),
    api('/api/users').catch(() => ({ users: [], current_user_id: null }))
  ]);

  const [m1, m2] = mfgData ? mfgData.manufacturers : [
    { id: 1, name: 'Производитель 1', percentage: 50 },
    { id: 2, name: 'Производитель 2', percentage: 50 }
  ];

  _settingsCachedPasscodes = passcodesData?.passcodes || [];
  _settingsCachedUsers = usersData?.users || [];
  _settingsCurrentUserId = usersData?.current_user_id || null;

  container.innerHTML = `
    <div style="max-width: 950px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.5rem;">
      
      <!-- 1. Настройки распределения прибыли -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">
            <i class="fa-solid fa-scale-balanced text-primary"></i>
            Распределение чистой прибыли между производителями
          </h3>
        </div>
        <form id="settings-mfg-form" onsubmit="handleSettingsMfgSubmit(event)">
          <div class="card-body">
            <p class="text-muted mb-3" style="font-size: 0.875rem;">
              Вы можете изменить названия двух фабрик/производителей и процентное соотношение распределения чистой прибыли. При изменении система мгновенно пересчитывает балансы начислений и задолженностей.
            </p>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.25rem;">
              
              <!-- Производитель 1 -->
              <div class="card p-3 bg-subtle">
                <h5 class="font-bold text-primary mb-2">Производитель №1</h5>
                <div class="form-group">
                  <label class="form-label">ФИО / Название</label>
                  <input type="text" id="set-mfg1-name" class="form-control" value="${m1.name}" required>
                </div>
                <div class="form-group mb-0">
                  <label class="form-label">Доля чистой прибыли (%)</label>
                  <input type="number" id="set-mfg1-pct" class="form-control font-bold" min="0" max="100" step="any" value="${m1.percentage}" required oninput="balanceSettingsMfgPct(1)">
                </div>
              </div>

              <!-- Производитель 2 -->
              <div class="card p-3 bg-subtle">
                <h5 class="font-bold text-accent mb-2">Производитель №2</h5>
                <div class="form-group">
                  <label class="form-label">ФИО / Название</label>
                  <input type="text" id="set-mfg2-name" class="form-control" value="${m2.name}" required>
                </div>
                <div class="form-group mb-0">
                  <label class="form-label">Доля чистой прибыли (%)</label>
                  <input type="number" id="set-mfg2-pct" class="form-control font-bold" min="0" max="100" step="any" value="${m2.percentage}" required oninput="balanceSettingsMfgPct(2)">
                </div>
              </div>

            </div>

            <div class="alert alert-info d-flex justify-content-between align-items-center">
              <span>Сумма долей должна равняться 100%:</span>
              <strong id="set-mfg-sum-status" class="font-bold text-success" style="font-size: 1.1rem;">100%</strong>
            </div>
          </div>
          <div class="card-header" style="justify-content: flex-end; border-top: 1px solid var(--border-color); border-bottom: none;">
            <button type="submit" id="btn-save-mfg-settings" class="btn btn-primary">
              <i class="fa-solid fa-floppy-disk"></i> Сохранить доли производителей
            </button>
          </div>
        </form>
      </div>

      <!-- 1.1 Названия прайс-листов -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">
            <i class="fa-solid fa-tags text-primary"></i>
            Названия прайс-листов (Прайс 1, Прайс 2 и Прайс 3)
          </h3>
        </div>
        <div class="card-body">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.5rem;">
            <div class="form-group mb-0">
              <label class="form-label">Прайс-лист №1 (Основной)</label>
              <input type="text" class="form-control" value="Прайс-лист 1 (Розница)" readonly>
            </div>
            <div class="form-group mb-0">
              <label class="form-label">Прайс-лист №2 (Специальный / Оптовый)</label>
              <input type="text" class="form-control" value="Прайс-лист 2 (Опт)" readonly>
            </div>
            <div class="form-group mb-0">
              <label class="form-label">Прайс-лист №3 (Full / Иностранный)</label>
              <input type="text" class="form-control text-purple font-bold" value="Прайс-лист №3 (Иностранный)" readonly>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. Пользователи системы и пароли -->
      <div class="card">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
          <div>
            <h3 class="card-title" style="margin-bottom: 0.25rem;">
              <i class="fa-solid fa-users text-primary"></i>
              Пользователи системы и сотрудники
              <span class="badge badge-primary" id="users-count-badge">${_settingsCachedUsers.length}</span>
            </h3>
            <p class="text-muted mb-0" style="font-size: 0.825rem;">
              Создавайте учетные записи для администраторов и менеджеров с индивидуальными логинами и паролями.
            </p>
          </div>
          <button type="button" class="btn btn-primary" onclick="openAddUserModal()">
            <i class="fa-solid fa-user-plus"></i> Добавить пользователя
          </button>
        </div>
        <div class="card-body">
          <!-- Таблица пользователей -->
          <div class="table-responsive">
            <table class="table" id="users-table">
              <thead>
                <tr>
                  <th>Логин</th>
                  <th>ФИО / Должность</th>
                  <th>Роль</th>
                  <th>Дата создания</th>
                  <th style="text-align: right;">Действия</th>
                </tr>
              </thead>
              <tbody id="users-table-body">
                ${renderUsersTableRows(_settingsCachedUsers, _settingsCurrentUserId)}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 3. Кодовые слова доступа и Смена собственного пароля -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">
            <i class="fa-solid fa-shield-halved text-warning"></i>
            Безопасность и кодовые слова доступа
          </h3>
        </div>
        
        <!-- Смена собственного пароля -->
        <div class="card-body" style="border-bottom: 1px solid var(--border-color); padding-bottom: 1.5rem;">
          <h4 class="font-bold mb-3" style="font-size: 1rem; display: flex; align-items: center; gap: 0.5rem;">
            <i class="fa-solid fa-lock text-muted"></i>
            Быстрая смена своего текущего пароля
          </h4>
          <form id="form-change-password" onsubmit="handleChangePassword(event)">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
              <div class="form-group mb-0">
                <label class="form-label">Текущий пароль <span class="req">*</span></label>
                <input type="password" id="current-password" class="form-control" placeholder="••••••••" required>
              </div>
              <div class="form-group mb-0">
                <label class="form-label">Новый пароль <span class="req">*</span></label>
                <input type="password" id="new-password" class="form-control" placeholder="Минимум 6 символов" required minlength="6">
              </div>
              <div class="form-group mb-0">
                <label class="form-label">Повторите новый пароль <span class="req">*</span></label>
                <input type="password" id="confirm-password" class="form-control" placeholder="Повторите пароль" required>
              </div>
            </div>
            <div style="display: flex; justify-content: flex-end;">
              <button type="submit" id="btn-save-password" class="btn btn-warning">
                <i class="fa-solid fa-key"></i> Сменить пароль
              </button>
            </div>
          </form>
        </div>

        <!-- Подраздел: Управление кодовыми словами доступа -->
        <div class="card-body">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.75rem;">
            <div>
              <h4 class="font-bold" style="font-size: 1.05rem; display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                <i class="fa-solid fa-key text-primary"></i>
                Кодовые слова доступа (Секретные пароли)
                <span class="badge badge-primary" id="passcodes-count-badge">${_settingsCachedPasscodes.length}</span>
              </h4>
              <p class="text-muted mb-0" style="font-size: 0.825rem;">
                При входе в программу система требует ввести кодовое слово. Вы можете в любой момент добавить или заблокировать секретный код.
              </p>
            </div>
            <button type="button" class="btn btn-primary" onclick="openAddPasscodeModal()">
              <i class="fa-solid fa-plus"></i> Добавить кодовое слово
            </button>
          </div>

          <!-- Таблица кодовых слов -->
          <div class="table-responsive">
            <table class="table" id="passcodes-table">
              <thead>
                <tr>
                  <th>Кодовое слово</th>
                  <th>Кому выдано / Назначение</th>
                  <th>Дата создания</th>
                  <th>Статус</th>
                  <th style="text-align: right;">Действия</th>
                </tr>
              </thead>
              <tbody id="passcodes-table-body">
                ${renderPasscodesTableRows(_settingsCachedPasscodes)}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 4. Резервное копирование и база данных -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title"><i class="fa-solid fa-database text-accent"></i> База данных и Резервное копирование (Backup)</h3>
        </div>
        <div class="card-body">
          <p class="text-muted mb-3" style="font-size: 0.875rem;">
            Все данные (пользователи, клиенты, лампы, заказы, снимки цен, выплаты, кодовые слова) сохраняются в постоянной базе данных. Вы можете в любой момент скачать полную резервную копию.
          </p>

          <!-- Инфо о БД -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem; margin-bottom: 1.5rem;">
            <div class="mfg-stat-box">
              <div class="mfg-stat-title">Тип базы данных</div>
              <div class="mfg-stat-num text-primary" style="font-size: 1.1rem;">${dbInfo?.dbType || 'SQLite / Postgres'}</div>
            </div>
            <div class="mfg-stat-box">
              <div class="mfg-stat-title">Пользователей</div>
              <div class="mfg-stat-num">${_settingsCachedUsers.length || 1}</div>
            </div>
            <div class="mfg-stat-box">
              <div class="mfg-stat-title">Заказов в базе</div>
              <div class="mfg-stat-num">${dbInfo?.tableCounts?.orders || 0}</div>
            </div>
            <div class="mfg-stat-box">
              <div class="mfg-stat-title">Позиций в прайсе</div>
              <div class="mfg-stat-num">${dbInfo?.tableCounts?.products || 0}</div>
            </div>
          </div>

          <!-- Кнопки бэкапа и восстановления -->
          <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
            <button class="btn btn-primary btn-lg" onclick="downloadDatabaseBackup()">
              <i class="fa-solid fa-download"></i> Скачать резервную копию
            </button>
          </div>
        </div>
      </div>

    </div>
  `;
}

/* ==========================================================================
   Таблица пользователей
   ========================================================================== */

function renderUsersTableRows(users, currentUserId) {
  if (!users || users.length === 0) {
    return `
      <tr>
        <td colspan="5" class="text-center text-muted py-4">
          <i class="fa-solid fa-users-slash" style="font-size: 2rem; display: block; margin-bottom: 0.5rem; opacity: 0.4;"></i>
          Список пользователей пуст.
        </td>
      </tr>
    `;
  }

  return users.map(u => {
    const isCurrentUser = currentUserId && u.id === currentUserId;
    const isAdmin = u.role === 'admin';
    const roleBadge = isAdmin
      ? `<span class="badge badge-accent" style="display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-shield"></i> Администратор</span>`
      : `<span class="badge badge-primary" style="display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-user"></i> Менеджер</span>`;

    return `
      <tr id="user-row-${u.id}">
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid ${isAdmin ? 'fa-user-tie text-accent' : 'fa-user text-primary'}"></i>
            <code class="font-bold" style="font-size: 0.95rem;">${escapeHtml(u.username)}</code>
            ${isCurrentUser ? `<span class="badge badge-success" style="font-size: 0.7rem; padding: 2px 6px;">Вы</span>` : ''}
          </div>
        </td>
        <td>
          <span class="font-bold">${escapeHtml(u.full_name || u.username)}</span>
        </td>
        <td>
          ${roleBadge}
        </td>
        <td>
          <span class="text-muted" style="font-size: 0.85rem;">${formatDateString(u.created_at)}</span>
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <div style="display: inline-flex; gap: 6px; align-items: center;">
            <button type="button" class="btn btn-sm btn-outline-primary" onclick="openEditUserModal(${u.id})" title="Редактировать пользователя или сменить пароль">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            ${!isCurrentUser ? `
              <button type="button" class="btn btn-sm btn-outline-danger" onclick="deleteUser(${u.id}, '${escapeHtml(u.username)}')" title="Удалить пользователя">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function reloadUsersList() {
  try {
    const data = await api('/api/users');
    _settingsCachedUsers = data?.users || [];
    _settingsCurrentUserId = data?.current_user_id || _settingsCurrentUserId;

    const badge = document.getElementById('users-count-badge');
    if (badge) badge.textContent = _settingsCachedUsers.length;

    const tbody = document.getElementById('users-table-body');
    if (tbody) {
      tbody.innerHTML = renderUsersTableRows(_settingsCachedUsers, _settingsCurrentUserId);
    }
  } catch (err) {
    console.error('Failed to reload users list:', err);
  }
}

function openAddUserModal() {
  document.getElementById('form-user')?.reset();
  document.getElementById('user-id').value = '';
  document.getElementById('modal-user-title').textContent = 'Добавить пользователя';
  document.getElementById('btn-save-user-text').textContent = 'Создать пользователя';
  document.getElementById('user-password-req').style.display = 'inline';
  document.getElementById('user-password').required = true;
  document.getElementById('user-password-hint').textContent = 'Придумайте надежный пароль для входа в систему (минимум 6 символов)';
  document.getElementById('user-role').value = 'manager';
  openModal('modal-user');
}

function openEditUserModal(id) {
  const user = _settingsCachedUsers.find(u => u.id === id);
  if (!user) return;

  document.getElementById('user-id').value = user.id;
  document.getElementById('user-username').value = user.username || '';
  document.getElementById('user-fullname').value = user.full_name || '';
  document.getElementById('user-role').value = user.role || 'manager';
  
  // Пароль при редактировании не обязателен
  document.getElementById('user-password').value = '';
  document.getElementById('user-password').required = false;
  document.getElementById('user-password-req').style.display = 'none';
  document.getElementById('user-password-hint').textContent = 'Оставьте пустым, если не хотите менять текущий пароль';

  document.getElementById('modal-user-title').textContent = `Редактирование: ${user.username}`;
  document.getElementById('btn-save-user-text').textContent = 'Сохранить изменения';

  openModal('modal-user');
}

async function handleUserFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('user-id').value;
  const username = document.getElementById('user-username').value.trim();
  const fullName = document.getElementById('user-fullname').value.trim();
  const password = document.getElementById('user-password').value;
  const role = document.getElementById('user-role').value;

  if (!username) {
    showToast('Укажите логин пользователя', 'error');
    return;
  }

  if (!id && (!password || password.length < 6)) {
    showToast('Пароль должен содержать не менее 6 символов', 'error');
    return;
  }

  if (id && password && password.length < 6) {
    showToast('Новый пароль должен содержать не менее 6 символов', 'error');
    return;
  }

  const btn = document.getElementById('btn-save-user');
  if (btn) btn.disabled = true;

  try {
    if (id) {
      // Редактирование
      const body = { username, full_name: fullName, role };
      if (password) body.password = password;

      const res = await api(`/api/users/${id}`, {
        method: 'PUT',
        body
      });
      showToast(res.message || 'Пользователь успешно обновлен', 'success');
    } else {
      // Создание
      const res = await api('/api/users', {
        method: 'POST',
        body: { username, full_name: fullName, password, role }
      });
      showToast(res.message || 'Пользователь успешно создан', 'success');
    }

    closeModal('modal-user');
    await reloadUsersList();
  } catch (err) {
    showToast(err.message || 'Ошибка сохранения пользователя', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function deleteUser(id, username) {
  if (!confirm(`Вы действительно хотите удалить пользователя «${username}»? Доступ к системе для него будет закрыт.`)) {
    return;
  }

  try {
    const res = await api(`/api/users/${id}`, {
      method: 'DELETE'
    });
    showToast(res.message || 'Пользователь удален', 'success');
    await reloadUsersList();
  } catch (err) {
    showToast(err.message || 'Ошибка удаления пользователя', 'error');
  }
}

/* ==========================================================================
   Таблица кодовых слов
   ========================================================================== */

function renderPasscodesTableRows(passcodes) {
  if (!passcodes || passcodes.length === 0) {
    return `
      <tr>
        <td colspan="5" class="text-center text-muted py-4">
          <i class="fa-solid fa-key" style="font-size: 2rem; display: block; margin-bottom: 0.5rem; opacity: 0.4;"></i>
          Список кодовых слов пуст.
        </td>
      </tr>
    `;
  }

  return passcodes.map(p => {
    const isActive = p.status === 'active';
    const statusBadge = isActive
      ? `<span class="badge badge-success" style="display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-circle-check"></i> Активно</span>`
      : `<span class="badge badge-danger" style="display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-circle-xmark"></i> Заблокировано</span>`;

    const toggleAction = isActive
      ? `<button type="button" class="btn btn-sm btn-outline-warning" onclick="togglePasscodeStatus(${p.id}, 'blocked')" title="Заблокировать">
          <i class="fa-solid fa-ban"></i> Блок
         </button>`
      : `<button type="button" class="btn btn-sm btn-outline-success" onclick="togglePasscodeStatus(${p.id}, 'active')" title="Разблокировать">
          <i class="fa-solid fa-unlock"></i> Включить
         </button>`;

    return `
      <tr id="passcode-row-${p.id}">
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-key ${isActive ? 'text-primary' : 'text-muted'}"></i>
            <code class="font-bold" style="font-size: 1rem; letter-spacing: 0.5px; color: ${isActive ? 'var(--primary-color, #3b82f6)' : '#94a3b8'};">
              ${escapeHtml(p.code_word)}
            </code>
          </div>
        </td>
        <td>
          <span class="font-bold">${escapeHtml(p.assigned_to)}</span>
        </td>
        <td>
          <span class="text-muted" style="font-size: 0.85rem;">${formatDateString(p.created_at)}</span>
        </td>
        <td>
          ${statusBadge}
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <div style="display: inline-flex; gap: 6px; align-items: center;">
            ${toggleAction}
            <button type="button" class="btn btn-sm btn-outline-primary" onclick="openEditPasscodeModal(${p.id})" title="Редактировать">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button type="button" class="btn btn-sm btn-outline-danger" onclick="deletePasscode(${p.id}, '${escapeHtml(p.code_word)}')" title="Удалить">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function formatDateString(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch (e) {
    return dateStr;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ==========================================================================
   Управление кодовыми словами (CRUD Actions)
   ========================================================================== */

async function reloadPasscodesList() {
  try {
    const data = await api('/api/passcodes');
    _settingsCachedPasscodes = data?.passcodes || [];

    const badge = document.getElementById('passcodes-count-badge');
    if (badge) badge.textContent = _settingsCachedPasscodes.length;

    const tbody = document.getElementById('passcodes-table-body');
    if (tbody) {
      tbody.innerHTML = renderPasscodesTableRows(_settingsCachedPasscodes);
    }
  } catch (err) {
    console.error('Failed to reload passcodes list:', err);
  }
}

function openAddPasscodeModal() {
  document.getElementById('form-passcode')?.reset();
  document.getElementById('passcode-id').value = '';
  document.getElementById('modal-passcode-title').textContent = 'Добавить кодовое слово';
  document.getElementById('btn-save-passcode-text').textContent = 'Добавить слово';
  document.getElementById('passcode-status').value = 'active';
  openModal('modal-passcode');
}

function openEditPasscodeModal(id) {
  const passcode = _settingsCachedPasscodes.find(p => p.id === id);
  if (!passcode) return;

  document.getElementById('passcode-id').value = passcode.id;
  document.getElementById('passcode-word').value = passcode.code_word || '';
  document.getElementById('passcode-assigned').value = passcode.assigned_to || '';
  document.getElementById('passcode-status').value = passcode.status || 'active';

  document.getElementById('modal-passcode-title').textContent = 'Редактировать кодовое слово';
  document.getElementById('btn-save-passcode-text').textContent = 'Сохранить изменения';

  openModal('modal-passcode');
}

async function handlePasscodeFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('passcode-id').value;
  const word = document.getElementById('passcode-word').value.trim();
  const assigned = document.getElementById('passcode-assigned').value.trim();
  const status = document.getElementById('passcode-status').value;

  if (!word) {
    showToast('Укажите кодовое слово', 'error');
    return;
  }

  if (!assigned) {
    showToast('Укажите, кому выдано кодовое слово', 'error');
    return;
  }

  const btn = document.getElementById('btn-save-passcode');
  if (btn) btn.disabled = true;

  try {
    if (id) {
      const res = await api(`/api/passcodes/${id}`, {
        method: 'PUT',
        body: { code_word: word, assigned_to: assigned, status }
      });
      showToast(res.message || 'Кодовое слово обновлено', 'success');
    } else {
      const res = await api('/api/passcodes', {
        method: 'POST',
        body: { code_word: word, assigned_to: assigned, status }
      });
      showToast(res.message || 'Кодовое слово добавлено', 'success');
    }

    closeModal('modal-passcode');
    await reloadPasscodesList();
  } catch (err) {
    showToast(err.message || 'Ошибка сохранения кодового слова', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function togglePasscodeStatus(id, nextStatus) {
  const isBlocking = nextStatus === 'blocked';
  const actionName = isBlocking ? 'заблокировать' : 'разблокировать';

  if (!confirm(`Вы действительно хотите ${actionName} это кодовое слово?`)) {
    return;
  }

  try {
    const res = await api(`/api/passcodes/${id}`, {
      method: 'PUT',
      body: { status: nextStatus }
    });
    showToast(res.message || 'Статус успешно изменен', 'success');
    await reloadPasscodesList();
  } catch (err) {
    showToast(err.message || 'Ошибка изменения статуса', 'error');
  }
}

async function deletePasscode(id, word) {
  if (!confirm(`Удалить кодовое слово «${word}»? После удаления вход с этим словом будет невозможен.`)) {
    return;
  }

  try {
    const res = await api(`/api/passcodes/${id}`, {
      method: 'DELETE'
    });
    showToast(res.message || 'Кодовое слово удалено', 'success');
    await reloadPasscodesList();
  } catch (err) {
    showToast(err.message || 'Ошибка удаления кодового слова', 'error');
  }
}

/* ==========================================================================
   Производители и Пароль
   ========================================================================== */

function balanceSettingsMfgPct(changedIdx) {
  const p1 = document.getElementById('set-mfg1-pct');
  const p2 = document.getElementById('set-mfg2-pct');
  const status = document.getElementById('set-mfg-sum-status');

  if (changedIdx === 1) {
    let v1 = parseFloat(p1.value) || 0;
    if (v1 > 100) v1 = 100;
    if (v1 < 0) v1 = 0;
    p2.value = Math.round((100 - v1) * 100) / 100;
  } else {
    let v2 = parseFloat(p2.value) || 0;
    if (v2 > 100) v2 = 100;
    if (v2 < 0) v2 = 0;
    p1.value = Math.round((100 - v2) * 100) / 100;
  }

  const sum = (parseFloat(p1.value) || 0) + (parseFloat(p2.value) || 0);
  if (status) {
    status.textContent = `${sum}%`;
    status.className = sum === 100 ? 'font-bold text-success' : 'font-bold text-danger';
  }
}

async function handleSettingsMfgSubmit(e) {
  e.preventDefault();
  const name1 = document.getElementById('set-mfg1-name').value.trim();
  const pct1 = parseFloat(document.getElementById('set-mfg1-pct').value);
  const name2 = document.getElementById('set-mfg2-name').value.trim();
  const pct2 = parseFloat(document.getElementById('set-mfg2-pct').value);

  if (Math.round((pct1 + pct2) * 100) / 100 !== 100) {
    showToast('Сумма долей должна быть строго равна 100%', 'error');
    return;
  }

  try {
    await api('/api/manufacturers', {
      method: 'PUT',
      body: {
        manufacturers: [
          { id: 1, name: name1, percentage: pct1 },
          { id: 2, name: name2, percentage: pct2 }
        ]
      }
    });

    showToast('Настройки производителей успешно сохранены', 'success');
  } catch (err) {
    showToast(err.message || 'Ошибка сохранения производителей', 'error');
  }
}

async function handleChangePassword(e) {
  e.preventDefault();
  const cur = document.getElementById('current-password').value;
  const next = document.getElementById('new-password').value;
  const confirm = document.getElementById('confirm-password').value;

  if (next !== confirm) {
    showToast('Новый пароль и подтверждение не совпадают', 'error');
    return;
  }

  try {
    await api('/api/auth/change-password', {
      method: 'POST',
      body: { current_password: cur, new_password: next }
    });

    showToast('Пароль успешно изменен', 'success');
    document.getElementById('form-change-password').reset();
  } catch (err) {
    showToast(err.message || 'Ошибка смены пароля', 'error');
  }
}

async function downloadDatabaseBackup() {
  window.location.href = '/api/backup/download';
}
