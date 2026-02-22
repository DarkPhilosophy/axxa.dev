(() => {
  const API_BASE = (window.CAFEA_API_BASE || '/api').replace(/\/$/, '');
  const ROLE_ADMIN = 'admin';
  const root = document.getElementById('root');

  const state = {
    token: localStorage.getItem('cafea_token') || '',
    user: null,
    stock: null,
    rows: [],
    users: [],
    info: '',
    error: '',
    activeTab: 'user',
    selectedAdminUserId: null,
    selectedUserStats: null,
    selectedUserHistory: [],
    pendingRequests: 0,
    lastRequestMs: 0
  };
  const inflight = new Map();
  let loadingEl = null;

  function ensureLoadingEl() {
    if (loadingEl) return loadingEl;
    loadingEl = document.createElement('div');
    loadingEl.id = 'cafea-global-loading';
    loadingEl.className = 'cafea-global-loading hidden';
    loadingEl.innerHTML = `
      <div class="cafea-global-loading__dot" aria-hidden="true"></div>
      <div class="cafea-global-loading__text">Se procesează cererea...</div>
    `;
    document.body.appendChild(loadingEl);
    return loadingEl;
  }

  function updateNetworkUi() {
    const el = ensureLoadingEl();
    const busy = state.pendingRequests > 0;
    root?.classList.toggle('is-busy', busy);
    if (!busy) {
      el.classList.add('hidden');
      return;
    }
    const t = state.lastRequestMs > 0 ? ` (${(state.lastRequestMs / 1000).toFixed(1)}s ultima)` : '';
    const textEl = el.querySelector('.cafea-global-loading__text');
    if (textEl) textEl.textContent = `Se procesează cererea...${t}`;
    el.classList.remove('hidden');
  }

  async function api(path, opts = {}) {
    const method = opts.method || 'GET';
    const normalizedPath = API_BASE.endsWith('/api') && path.startsWith('/api/') ? path.slice(4) : path;
    const requestKey = opts.dedupeKey || ((method !== 'GET') ? `${method}:${normalizedPath}` : null);
    if (requestKey && inflight.has(requestKey)) return inflight.get(requestKey);

    const runReq = (async () => {
      const startedAt = performance.now();
      state.pendingRequests += 1;
      updateNetworkUi();
      renderBusyTick();
      const headers = { 'Content-Type': 'application/json' };
      if (state.token) headers.Authorization = `Bearer ${state.token}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), opts.timeoutMs || 20000);
      try {
        const res = await fetch(`${API_BASE}${normalizedPath}`, {
          method,
          headers,
          body: opts.body ? JSON.stringify(opts.body) : undefined,
          signal: controller.signal
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        return data;
      } catch (err) {
        if (err?.name === 'AbortError') throw new Error('Cererea a expirat. Încearcă din nou.');
        throw err;
      } finally {
        state.lastRequestMs = Math.max(0, performance.now() - startedAt);
        clearTimeout(timeout);
        state.pendingRequests = Math.max(0, state.pendingRequests - 1);
        updateNetworkUi();
        renderBusyTick();
      }
    })();

    if (requestKey) inflight.set(requestKey, runReq);
    try {
      return await runReq;
    } finally {
      if (requestKey) inflight.delete(requestKey);
    }
  }

  function loadingBadge() {
    if (!state.pendingRequests) return '';
    return '<div class="text-xs px-2 py-1 rounded-lg border border-emerald-400/50 text-emerald-300">Se încarcă...</div>';
  }

  function skeleton(width = '100%', height = '14px') {
    return `<span class="cafea-skeleton" style="width:${width};height:${height};"></span>`;
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderAuth(mode = 'login') {
    root.innerHTML = `
      <div class="cafea-shell">
        <div class="max-w-3xl mx-auto cafea-glass p-6 md:p-8">
          <div class="flex gap-2 mb-5">
            <button id="tab-login" class="cafea-btn ${mode === 'login' ? 'cafea-btn-primary' : 'cafea-btn-muted'}">Login</button>
            <button id="tab-register" class="cafea-btn ${mode === 'register' ? 'cafea-btn-primary' : 'cafea-btn-muted'}">Register</button>
            ${loadingBadge()}
          </div>
          <h1 class="text-3xl md:text-5xl font-bold">Cafea Office Dashboard</h1>
          <p class="mt-2 text-slate-600 dark:text-slate-300">${mode === 'login' ? 'Login cu cont existent.' : 'Creezi cont nou (pending), apoi admin aprobă.'}</p>
          <form id="auth-form" class="grid md:grid-cols-2 gap-3 mt-6">
            ${mode === 'register' ? '<input id="name" class="cafea-input md:col-span-2" placeholder="nume" required />' : ''}
            <input id="email" type="email" class="cafea-input" placeholder="email" required />
            <input id="password" type="password" class="cafea-input" placeholder="parolă" required />
            ${mode === 'register' ? '<input id="avatar_url" class="cafea-input md:col-span-2" placeholder="avatar url (opțional)" />' : ''}
            <button class="cafea-btn cafea-btn-primary md:col-span-2" type="submit">${mode === 'login' ? 'Intră în aplicație' : 'Trimite cerere cont'}</button>
          </form>
          ${state.info ? `<p class="text-green-500 mt-3">${esc(state.info)}</p>` : ''}
          ${state.error ? `<p class="text-red-500 mt-3">${esc(state.error)}</p>` : ''}
        </div>
      </div>
    `;

    document.getElementById('tab-login').onclick = () => {
      state.error = '';
      state.info = '';
      renderAuth('login');
    };
    document.getElementById('tab-register').onclick = () => {
      state.error = '';
      state.info = '';
      renderAuth('register');
    };

    document.getElementById('auth-form').onsubmit = async (e) => {
      e.preventDefault();
      state.error = '';
      state.info = '';
      try {
        const email = document.getElementById('email').value.trim().toLowerCase();
        const password = document.getElementById('password').value;
        if (mode === 'login') {
          const d = await api('/api/auth/login', { method: 'POST', body: { email, password } });
          state.token = d.token;
          localStorage.setItem('cafea_token', d.token);
          await loadMe();
          await loadDashboard();
          renderApp();
          return;
        }
        const name = document.getElementById('name').value.trim();
        const avatar = (document.getElementById('avatar_url')?.value || '').trim();
        await api('/api/auth/register', { method: 'POST', body: { email, password, name, avatar_url: avatar } });
        state.info = 'Cont creat. Așteaptă aprobarea admin înainte de login.';
        renderAuth('login');
      } catch (err) {
        state.error = err.message;
        renderAuth(mode);
      }
    };
  }

  function stockBadge() {
    if (!state.stock) return '<span class="cafea-badge cafea-badge-low">N/A</span>';
    if (state.stock.current_stock <= 0) return '<span class="cafea-badge cafea-badge-empty">Epuizat</span>';
    if (state.stock.low) return '<span class="cafea-badge cafea-badge-low">Stoc minim</span>';
    return '<span class="cafea-badge cafea-badge-ok">OK</span>';
  }

  function renderTabButton(id, label) {
    const active = state.activeTab === id;
    return `<button id="tab-${id}" class="cafea-btn ${active ? 'cafea-btn-primary' : 'cafea-btn-muted'}">${esc(label)}</button>`;
  }

  function renderStockRow(field, label, value, isAdmin, extraHtml = '') {
    const busy = state.pendingRequests > 0;
    const shownValue = busy ? skeleton('72px', '30px') : esc(value);
    return `
      <div class="relative rounded-xl border border-slate-300/20 dark:border-white/10 p-3">
        <div class="text-center pr-28">
          <p class="text-xs uppercase tracking-wider text-slate-500">${esc(label)}</p>
          <p id="stock-value-${field}" class="text-2xl font-bold flex justify-center">${shownValue}</p>
          ${busy ? `<p class="text-xs mt-1 text-slate-500 flex justify-center">${skeleton('180px', '12px')}</p>` : extraHtml}
          <input id="stock-input-${field}" class="cafea-input hidden text-center" style="width:160px;max-width:160px;margin:8px auto 0 auto;" type="number" min="0" value="${esc(value)}" />
        </div>
        ${isAdmin ? `<button id="btn-edit-${field}" data-mode="idle" class="cafea-btn cafea-btn-muted" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);z-index:2;">Edit</button>` : ''}
      </div>
    `;
  }

  function renderHistoryRows() {
    const isAdmin = state.user?.role === ROLE_ADMIN;
    if (state.pendingRequests > 0 && (!state.rows || !state.rows.length)) {
      return Array.from({ length: 5 }).map(() => `
        <tr class="border-b border-slate-300/10 dark:border-white/5">
          <td class="py-2">${skeleton('180px', '14px')}</td>
          <td class="py-2">${skeleton('150px', '14px')}</td>
          <td class="py-2">${skeleton('70px', '14px')}</td>
        </tr>
      `).join('');
    }
    return state.rows.map((r) => `
      <tr class="border-b border-slate-300/10 dark:border-white/5">
        <td class="py-2">
          <div class="flex items-center gap-2">
            <img src="${esc(r.avatar_url || 'https://placehold.co/40x40?text=U')}" class="rounded-full object-cover" style="width:32px;height:32px;min-width:32px;max-width:32px;" />
            <div>
              <p class="font-semibold leading-tight">${esc(r.name || r.email)}</p>
              <p class="text-xs text-slate-500">${esc(r.email || '')}</p>
            </div>
          </div>
        </td>
        <td class="py-2">${esc(new Date(r.consumed_at + 'Z').toLocaleString('ro-RO'))}</td>
        <td class="py-2">
          <div class="flex items-center gap-2">
            <span>-${esc(r.delta)}</span>
            ${isAdmin ? `<button class="cafea-btn cafea-btn-muted btn-delete-log" data-id="${r.id}">Delete</button>` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  }

  function renderUserTab(isAdmin) {
    const selectedUser = isAdmin ? (state.users || []).find((u) => u.id === state.selectedAdminUserId) || null : null;
    const userStats = state.selectedUserStats;
    const remainingLabel = userStats?.remaining == null ? 'nelimitat' : String(userStats.remaining);
    const maxLabel = userStats?.max_coffees == null ? 'nelimitat' : String(userStats.max_coffees);
    const selectedHistoryRows = (state.selectedUserHistory || []).map((r) => `
      <tr class="border-b border-slate-300/10 dark:border-white/5">
        <td class="py-1">${esc(r.id)}</td>
        <td class="py-1"><input class="cafea-input input-log-datetime" style="max-width:220px;" data-id="${r.id}" value="${esc(r.consumed_at)}" /></td>
        <td class="py-1"><input class="cafea-input input-log-delta" style="max-width:90px;" data-id="${r.id}" type="number" min="1" value="${esc(r.delta)}" /></td>
        <td class="py-1"><button class="cafea-btn cafea-btn-muted btn-save-log" data-id="${r.id}">Save</button></td>
      </tr>
    `).join('');
    const manualDelta = Number(state.stock?.manual_delta || 0);
    const expectedCurrent = state.stock?.expected_current ?? 0;
    const deltaColor = manualDelta > 0 ? '#22c55e' : (manualDelta < 0 ? '#ef4444' : '#94a3b8');
    const deltaPrefix = manualDelta > 0 ? '+' : '';
    const currentExtra = `
      <p class="text-xs mt-1 text-slate-400">
        Real: ${esc(expectedCurrent)} · Ajustare:
        <span style="color:${deltaColor};font-weight:700;">${esc(deltaPrefix + manualDelta)}</span>
      </p>
    `;

    const adminUserList = isAdmin ? `
      <div class="cafea-glass p-5">
        <h3 class="font-bold text-lg mb-3">Consum în numele userului</h3>
        <div class="grid md:grid-cols-[280px_1fr] gap-3">
          <div class="space-y-2">
            ${(state.users || []).filter((u) => u.active).map((u) => `
              <button class="w-full text-left border rounded-xl p-2 btn-pick-consume-user ${state.selectedAdminUserId === u.id ? 'border-emerald-400' : 'border-slate-300/20 dark:border-white/10'}" data-id="${u.id}">
                <div class="flex items-center gap-2">
                  <img src="${esc(u.avatar_url || 'https://placehold.co/40x40?text=U')}" style="width:32px;height:32px;min-width:32px;max-width:32px;" class="rounded-full object-cover" />
                  <div>
                    <p class="font-semibold leading-tight">${esc(u.name)}</p>
                    <p class="text-xs text-slate-500">${esc(u.email)}</p>
                  </div>
                </div>
              </button>
            `).join('')}
          </div>
          <div class="border border-slate-300/20 dark:border-white/10 rounded-xl p-3">
            ${selectedUser ? `
              <p class="mb-3">Selectat: <span class="font-semibold">${esc(selectedUser.name)}</span></p>
              <div class="grid md:grid-cols-2 gap-2 mb-3 text-sm">
                <div class="border border-slate-300/20 dark:border-white/10 rounded-lg p-2">Consumate: <span class="font-semibold">${esc(userStats?.consumed_count ?? 0)}</span></div>
                <div class="border border-slate-300/20 dark:border-white/10 rounded-lg p-2">Maxim: <span class="font-semibold">${esc(maxLabel)}</span></div>
                <div class="border border-slate-300/20 dark:border-white/10 rounded-lg p-2">Rămase: <span class="font-semibold">${esc(remainingLabel)}</span></div>
                <div class="border border-slate-300/20 dark:border-white/10 rounded-lg p-2">Ultima: <span class="font-semibold">${esc(userStats?.last_consumed_at || '-')}</span></div>
              </div>
              <form id="form-set-user-max" class="flex items-center gap-2 mb-3">
                <input id="input-user-max" class="cafea-input" type="number" min="0" placeholder="max cafele (gol = nelimitat)" value="${esc(userStats?.max_coffees ?? '')}" />
                <button class="cafea-btn cafea-btn-muted" type="submit" style="white-space:nowrap;">Setează maxim</button>
              </form>
              <button id="btn-consume-selected-user" class="cafea-btn cafea-btn-primary w-full" ${state.stock?.current_stock <= 0 ? 'disabled' : ''}>Consumă 1 cafea pentru ${esc(selectedUser.name)}</button>
              <form id="form-add-history-user" class="grid md:grid-cols-[120px_1fr_auto] gap-2 mt-3">
                <input id="input-add-delta" class="cafea-input" type="number" min="1" value="1" />
                <input id="input-add-datetime" class="cafea-input" placeholder="YYYY-MM-DD HH:mm:ss (opțional)" />
                <button class="cafea-btn cafea-btn-muted" type="submit">Adaugă istoric</button>
              </form>
              <div class="mt-3 overflow-auto">
                <table class="w-full text-xs">
                  <thead><tr class="border-b border-slate-300/20 dark:border-white/10"><th class="text-left py-1">ID</th><th class="text-left py-1">Data</th><th class="text-left py-1">Delta</th><th></th></tr></thead>
                  <tbody>${selectedHistoryRows}</tbody>
                </table>
              </div>
            ` : '<p class="text-slate-500">Selectează un user din listă.</p>'}
          </div>
        </div>
      </div>
    ` : '';

    return `
      <section class="grid md:grid-cols-2 gap-4">
        <div class="cafea-glass p-5">
          <div class="flex items-center justify-between mb-4"><h2 class="font-bold text-xl">Stoc Cafea</h2>${stockBadge()}</div>
          <div class="space-y-3 mb-5">
            ${renderStockRow('initial_stock', 'Inițial', state.stock?.initial_stock ?? 0, isAdmin)}
            ${renderStockRow('current_stock', 'Curent', state.stock?.current_stock ?? 0, isAdmin, currentExtra)}
            ${renderStockRow('min_stock', 'Minim', state.stock?.min_stock ?? 0, isAdmin)}
          </div>
          <button id="btn-consume" class="cafea-btn cafea-btn-primary w-full" ${state.stock?.current_stock <= 0 ? 'disabled' : ''}>Consumă 1 cafea</button>
        </div>

        <div class="cafea-glass p-5">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-lg">${isAdmin ? 'Istoric complet consum' : 'Istoricul tău'}</h3>
          </div>
          <div class="overflow-auto"><table class="w-full text-sm"><thead><tr class="border-b border-slate-300/20 dark:border-white/10 text-slate-500"><th class="text-left py-2">Cine</th><th class="text-left py-2">Când</th><th class="text-left py-2">Delta</th></tr></thead><tbody>${renderHistoryRows()}</tbody></table></div>
        </div>
      </section>
      ${adminUserList}
    `;
  }

  function renderProfileTab() {
    return `
      <section class="cafea-glass p-5">
        <h3 class="font-bold text-lg mb-3">Profile edit</h3>
        <form id="form-profile" class="grid md:grid-cols-2 gap-3">
          <input id="profile-name" class="cafea-input" value="${esc(state.user?.name || '')}" placeholder="nume" required />
          <input id="profile-email" type="email" class="cafea-input" value="${esc(state.user?.email || '')}" placeholder="email" required />
          <input id="profile-avatar" class="cafea-input md:col-span-2" value="${esc(state.user?.avatar_url || '')}" placeholder="avatar url" />
          <input id="profile-password" type="password" class="cafea-input md:col-span-2" placeholder="parolă nouă (opțional)" />
          <label class="flex items-center gap-2 text-sm md:col-span-2">
            <input id="profile-notify" type="checkbox" ${state.user?.notify_enabled === 0 ? '' : 'checked'} />
            Notificări email la consum cafea
          </label>
          <input class="cafea-input" value="${state.user?.active ? 'active' : 'pending'}" placeholder="status" disabled />
          <input class="cafea-input" value="${esc(state.user?.role || 'user')}" placeholder="rol" disabled />
          <button class="cafea-btn cafea-btn-primary md:col-span-2" type="submit">Salvează profil</button>
          ${state.user?.role === ROLE_ADMIN ? '<button id="btn-test-mail" class="cafea-btn cafea-btn-muted md:col-span-2" type="button">Trimite email test (doar mie)</button>' : ''}
        </form>
      </section>
    `;
  }

  function renderAdminTab() {
    const pending = (state.users || []).filter((u) => !u.active);
    const list = (state.users || []).map((u) => `
      <button class="w-full text-left border rounded-xl p-2 btn-pick-user ${state.selectedAdminUserId === u.id ? 'border-emerald-400' : 'border-slate-300/20 dark:border-white/10'}" data-id="${u.id}">
        <div class="flex items-center gap-2">
          <img src="${esc(u.avatar_url || 'https://placehold.co/40x40?text=U')}" style="width:32px;height:32px;min-width:32px;max-width:32px;" class="rounded-full object-cover" />
          <div>
            <p class="font-semibold leading-tight">${esc(u.name)}</p>
            <p class="text-xs text-slate-500">${esc(u.email)}</p>
          </div>
        </div>
      </button>
    `).join('');
    const selectedUser = (state.users || []).find((u) => u.id === state.selectedAdminUserId) || null;
    const editor = selectedUser ? `
      <form id="form-user-edit-selected" data-id="${selectedUser.id}" class="border border-slate-300/20 dark:border-white/10 rounded-xl p-3 grid md:grid-cols-2 gap-2">
        <input class="cafea-input" name="name" value="${esc(selectedUser.name)}" placeholder="nume" required />
        <input class="cafea-input" name="email" type="email" value="${esc(selectedUser.email)}" placeholder="email" required />
        <input class="cafea-input md:col-span-2" name="avatar_url" value="${esc(selectedUser.avatar_url || '')}" placeholder="avatar url" />
        <input class="cafea-input md:col-span-2" name="password" type="password" placeholder="parolă nouă (opțional)" />
        <select class="cafea-input" name="role"><option value="user" ${selectedUser.role === 'user' ? 'selected' : ''}>user</option><option value="admin" ${selectedUser.role === 'admin' ? 'selected' : ''}>admin</option></select>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="active" ${selectedUser.active ? 'checked' : ''}/> active</label>
        <label class="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" name="notify_enabled" ${Number(selectedUser.notify_enabled ?? 1) ? 'checked' : ''}/> notificări email (opt-in)</label>
        <button class="cafea-btn cafea-btn-primary" type="submit">Save ${esc(selectedUser.name)}</button>
        <button class="cafea-btn" id="btn-delete-user" type="button" style="background:#7f1d1d;color:#fff;border-color:#ef4444;">Delete ${esc(selectedUser.name)}</button>
      </form>
    ` : '<div class="border border-slate-300/20 dark:border-white/10 rounded-xl p-3 text-slate-500">Selectează un user din listă.</div>';

    return `
      <section class="cafea-glass p-5 space-y-5">
        <h3 class="font-bold text-lg text-center">Admin Panel</h3>
        <div>
          <h4 class="font-semibold mb-2">Admin Controls Cereri pending (${pending.length})</h4>
          <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            ${pending.map((u) => `
              <div class="border border-amber-400/40 rounded-xl p-3">
                <p class="font-bold">${esc(u.name)}</p>
                <p class="text-xs text-slate-500 mb-2">${esc(u.email)}</p>
                <div class="grid grid-cols-2 gap-2">
                  <button class="cafea-btn cafea-btn-primary w-full btn-approve" data-id="${u.id}">Aprobă</button>
                  <button class="cafea-btn w-full btn-reject" data-id="${u.id}" style="background:#7f1d1d;color:#fff;border-color:#ef4444;">Respinge</button>
                </div>
              </div>
            `).join('') || '<p class="text-slate-500">Nu există cereri pending.</p>'}
          </div>
        </div>

        <div>
          <h4 class="font-semibold mb-2">Adaugă user</h4>
          <form id="form-user-add" class="grid md:grid-cols-2 gap-2">
            <input class="cafea-input" name="name" placeholder="nume" required />
            <input class="cafea-input" name="email" type="email" placeholder="email" required />
            <input class="cafea-input" name="password" type="password" placeholder="parolă" required />
            <input class="cafea-input" name="avatar_url" placeholder="avatar url" />
            <select class="cafea-input" name="role"><option value="user">user</option><option value="admin">admin</option></select>
            <button class="cafea-btn cafea-btn-primary" type="submit">Creează user</button>
          </form>
        </div>

        <div>
          <h4 class="font-semibold mb-2">Editează useri</h4>
          <div class="grid md:grid-cols-[280px_1fr] gap-3">
            <div class="space-y-2">${list}</div>
            <div>${editor}</div>
          </div>
        </div>

        <div class="flex gap-2 flex-wrap justify-center">
          <button id="btn-export" class="cafea-btn cafea-btn-muted">Export CSV</button>
        </div>
      </section>
    `;
  }

  function renderApp() {
    const isAdmin = state.user?.role === ROLE_ADMIN;
    if (!isAdmin && state.activeTab === 'admin') state.activeTab = 'user';

    root.innerHTML = `
      <main class="cafea-shell space-y-4">
        <header class="cafea-glass p-4 md:p-5 flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-3">
            <img src="${esc(state.user.avatar_url || 'https://placehold.co/72x72?text=U')}" class="w-12 h-12 rounded-full object-cover" />
            <div>
              <h1 class="text-xl md:text-2xl font-bold">Cafea Office Dashboard</h1>
              <p class="text-slate-600 dark:text-slate-300">${esc(state.user.name)} • ${esc(state.user.role)}</p>
            </div>
          </div>
          <div class="flex gap-2 justify-center flex-wrap">
            ${renderTabButton('user', 'Acasă')}
            ${renderTabButton('profile', 'Profile')}
            ${isAdmin ? renderTabButton('admin', 'Admin Panel') : ''}
          </div>
          <div class="flex gap-2">
            ${loadingBadge()}
            <button id="btn-refresh" class="cafea-btn cafea-btn-muted">Refresh</button>
            <button id="btn-logout" class="cafea-btn cafea-btn-muted">Logout</button>
          </div>
        </header>

        ${state.error ? `<div class="cafea-glass p-3 text-red-500">${esc(state.error)}</div>` : ''}
        ${state.info ? `<div class="cafea-glass p-3 text-emerald-400">${esc(state.info)}</div>` : ''}

        ${state.activeTab === 'user' ? renderUserTab(isAdmin) : ''}
        ${state.activeTab === 'profile' ? renderProfileTab() : ''}
        ${state.activeTab === 'admin' && isAdmin ? renderAdminTab() : ''}
      </main>
    `;

    document.getElementById('btn-logout').onclick = () => {
      localStorage.removeItem('cafea_token');
      state.token = '';
      state.user = null;
      state.error = '';
      state.info = '';
      renderAuth('login');
    };

    document.getElementById('btn-refresh').onclick = async () => {
      await loadDashboard();
      renderApp();
    };

    ['user', 'profile', 'admin'].forEach((tab) => {
      const el = document.getElementById(`tab-${tab}`);
      if (!el) return;
      el.onclick = () => {
        state.activeTab = tab;
        state.error = '';
        renderApp();
      };
    });

    const consumeBtn = document.getElementById('btn-consume');
    if (consumeBtn) {
      consumeBtn.onclick = async () => {
        try {
          state.error = '';
          await api('/api/coffee/consume', { method: 'POST' });
          await loadDashboard();
        } catch (err) {
          state.error = err.message;
        }
        renderApp();
      };
    }

    if (isAdmin && state.activeTab === 'user') {
      const fields = ['initial_stock', 'current_stock', 'min_stock'];
      for (const field of fields) {
        const btn = document.getElementById(`btn-edit-${field}`);
        if (!btn) continue;
        btn.onclick = async () => {
          const valueEl = document.getElementById(`stock-value-${field}`);
          const inputEl = document.getElementById(`stock-input-${field}`);
          const editing = btn.dataset.mode === 'editing';
          if (!editing) {
            btn.dataset.mode = 'editing';
            btn.textContent = 'Save';
            valueEl.classList.add('hidden');
            inputEl.classList.remove('hidden');
            inputEl.focus();
            return;
          }
          try {
            state.error = '';
            const payload = {
              initial_stock: Number(field === 'initial_stock' ? inputEl.value : state.stock.initial_stock),
              current_stock: Number(field === 'current_stock' ? inputEl.value : state.stock.current_stock),
              min_stock: Number(field === 'min_stock' ? inputEl.value : state.stock.min_stock)
            };
            await api('/api/admin/stock/init', { method: 'POST', body: payload });
            await loadDashboard();
          } catch (err) {
            state.error = err.message;
          }
          renderApp();
        };
      }

      document.querySelectorAll('.btn-pick-consume-user').forEach((btn) => {
        btn.onclick = async () => {
          state.selectedAdminUserId = Number(btn.dataset.id);
          await loadDashboard();
          renderApp();
        };
      });

      const consumeSelectedBtn = document.getElementById('btn-consume-selected-user');
      if (consumeSelectedBtn) {
        consumeSelectedBtn.onclick = async () => {
          if (!state.selectedAdminUserId) return;
          try {
            state.error = '';
            await api(`/api/admin/consume/${state.selectedAdminUserId}`, { method: 'POST' });
            await loadDashboard();
          } catch (err) {
            state.error = err.message;
          }
          renderApp();
        };
      }

      const setMaxForm = document.getElementById('form-set-user-max');
      if (setMaxForm) {
        setMaxForm.onsubmit = async (e) => {
          e.preventDefault();
          try {
            const raw = document.getElementById('input-user-max').value.trim();
            await api(`/api/admin/users/${state.selectedAdminUserId}/max`, {
              method: 'PUT',
              body: { max_coffees: raw === '' ? null : Number(raw) }
            });
            await loadDashboard();
          } catch (err) {
            state.error = err.message;
          }
          renderApp();
        };
      }

      const addHistoryForm = document.getElementById('form-add-history-user');
      if (addHistoryForm) {
        addHistoryForm.onsubmit = async (e) => {
          e.preventDefault();
          try {
            const delta = Number(document.getElementById('input-add-delta').value || 1);
            const consumed_at = document.getElementById('input-add-datetime').value.trim();
            await api(`/api/admin/users/${state.selectedAdminUserId}/history`, {
              method: 'POST',
              body: { delta, consumed_at: consumed_at || null }
            });
            await loadDashboard();
          } catch (err) {
            state.error = err.message;
          }
          renderApp();
        };
      }

      document.querySelectorAll('.btn-save-log').forEach((btn) => {
        btn.onclick = async () => {
          try {
            const id = btn.dataset.id;
            const consumedAt = document.querySelector(`.input-log-datetime[data-id="${id}"]`)?.value?.trim();
            const delta = Number(document.querySelector(`.input-log-delta[data-id="${id}"]`)?.value || 1);
            await api(`/api/admin/history/${id}`, {
              method: 'PUT',
              body: { consumed_at: consumedAt, delta }
            });
            await loadDashboard();
          } catch (err) {
            state.error = err.message;
          }
          renderApp();
        };
      });

    }

    const profileForm = document.getElementById('form-profile');
    if (profileForm) {
      profileForm.onsubmit = async (e) => {
        e.preventDefault();
        try {
          state.error = '';
          const name = document.getElementById('profile-name').value.trim();
          const avatar_url = document.getElementById('profile-avatar').value.trim();
          const email = document.getElementById('profile-email').value.trim().toLowerCase();
          const password = document.getElementById('profile-password').value.trim();
          const notify_enabled = document.getElementById('profile-notify').checked;
          const d = await api('/api/auth/profile', { method: 'PUT', body: { name, avatar_url, email, password, notify_enabled } });
          state.user = d.user;
          await loadDashboard();
        } catch (err) {
          state.error = err.message;
        }
        renderApp();
      };
    }

    const testMailBtn = document.getElementById('btn-test-mail');
    if (testMailBtn) {
      testMailBtn.onclick = async () => {
        try {
          state.error = '';
          await api('/api/admin/mail/test', { method: 'POST' });
          state.info = 'Email test trimis.';
        } catch (err) {
          state.error = err.message;
        }
        renderApp();
      };
    }

    if (isAdmin && state.activeTab === 'admin') {
      const exportBtn = document.getElementById('btn-export');
      if (exportBtn) exportBtn.onclick = () => window.open('/api/admin/export.csv', '_blank');

      const formAdd = document.getElementById('form-user-add');
      if (formAdd) {
        formAdd.onsubmit = async (e) => {
          e.preventDefault();
          try {
            state.error = '';
            const fd = new FormData(formAdd);
            await api('/api/admin/users', {
              method: 'POST',
              body: {
                name: String(fd.get('name') || '').trim(),
                email: String(fd.get('email') || '').trim().toLowerCase(),
                password: String(fd.get('password') || ''),
                avatar_url: String(fd.get('avatar_url') || '').trim(),
                role: String(fd.get('role') || 'user')
              }
            });
            await loadDashboard();
          } catch (err) {
            state.error = err.message;
          }
          renderApp();
        };
      }

      document.querySelectorAll('.btn-approve').forEach((btn) => {
        btn.onclick = async () => {
          try {
            await api(`/api/admin/users/${btn.dataset.id}/approve`, { method: 'POST' });
            await loadDashboard();
          } catch (err) {
            state.error = err.message;
          }
          renderApp();
        };
      });

      document.querySelectorAll('.btn-reject').forEach((btn) => {
        btn.onclick = async () => {
          if (!window.confirm('Respingi și ștergi userul pending?')) return;
          try {
            await api(`/api/admin/users/${btn.dataset.id}`, { method: 'DELETE' });
            await loadDashboard();
          } catch (err) {
            state.error = err.message;
          }
          renderApp();
        };
      });

      document.querySelectorAll('.btn-pick-user').forEach((btn) => {
        btn.onclick = () => {
          state.selectedAdminUserId = Number(btn.dataset.id);
          renderApp();
        };
      });

      const selectedForm = document.getElementById('form-user-edit-selected');
      if (selectedForm) {
        selectedForm.onsubmit = async (e) => {
          e.preventDefault();
          try {
            const id = selectedForm.dataset.id;
            const fd = new FormData(selectedForm);
            await api(`/api/admin/users/${id}`, {
              method: 'PUT',
              body: {
                name: String(fd.get('name') || '').trim(),
                email: String(fd.get('email') || '').trim().toLowerCase(),
                avatar_url: String(fd.get('avatar_url') || '').trim(),
                password: String(fd.get('password') || '').trim(),
                role: String(fd.get('role') || 'user'),
                active: fd.get('active') === 'on',
                notify_enabled: fd.get('notify_enabled') === 'on'
              }
            });
            await loadDashboard();
          } catch (err) {
            state.error = err.message;
          }
          renderApp();
        };
      }

      const deleteUserBtn = document.getElementById('btn-delete-user');
      if (deleteUserBtn) {
        deleteUserBtn.onclick = async () => {
          const id = state.selectedAdminUserId;
          if (!id) return;
          if (!window.confirm('Ștergi userul selectat?')) return;
          try {
            await api(`/api/admin/users/${id}`, { method: 'DELETE' });
            state.selectedAdminUserId = null;
            await loadDashboard();
          } catch (err) {
            state.error = err.message;
          }
          renderApp();
        };
      }
    }

    if (isAdmin) {
      document.querySelectorAll('.btn-delete-log').forEach((btn) => {
        btn.onclick = async () => {
          if (!window.confirm('Ștergi acest record din istoric?')) return;
          try {
            await api(`/api/admin/history/${btn.dataset.id}`, { method: 'DELETE' });
            await loadDashboard();
          } catch (err) {
            state.error = err.message;
          }
          renderApp();
        };
      });
    }
  }

  async function loadMe() {
    const d = await api('/api/auth/me');
    state.user = d.user;
  }

  async function loadDashboard() {
    if (!state.user) return;
    const isAdmin = state.user.role === ROLE_ADMIN;
    const [s, h] = await Promise.all([
      api('/api/coffee/status'),
      api(`/api/coffee/history?mine=${isAdmin ? '0' : '1'}&limit=100`)
    ]);
    state.stock = s.stock;
    state.user = s.user || state.user;
    state.rows = h.rows || [];
    if (isAdmin) {
      const u = await api('/api/admin/users');
      state.users = u.users || [];
      if (!state.selectedAdminUserId || !state.users.some((x) => x.id === state.selectedAdminUserId)) {
        state.selectedAdminUserId = state.users[0]?.id || null;
      }
      if (state.selectedAdminUserId) {
        const stats = await api(`/api/admin/users/${state.selectedAdminUserId}/stats`);
        state.selectedUserStats = stats.stats || null;
        state.selectedUserHistory = stats.rows || [];
      } else {
        state.selectedUserStats = null;
        state.selectedUserHistory = [];
      }
    } else {
      state.users = [];
      state.selectedAdminUserId = null;
      state.selectedUserStats = null;
      state.selectedUserHistory = [];
    }
  }

  async function boot() {
    if (!root) return;
    if (!state.token) {
      renderAuth('login');
      return;
    }
    try {
      await loadMe();
      await loadDashboard();
      renderApp();
    } catch (err) {
      localStorage.removeItem('cafea_token');
      state.token = '';
      state.user = null;
      state.error = err.message;
      renderAuth('login');
    }
  }

  function renderBusyTick() {
    if (!state.user) return;
    renderApp();
  }

  boot();
})();
