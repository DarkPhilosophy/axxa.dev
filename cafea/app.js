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
    userConsumption: {},
    pendingRequests: 0,
    lastRequestMs: 0,
    historyWindowStart: 0,
    historyWindowSize: 15,
    historyWindowStep: 10,
    historyScrollHint: '',
    historyFilterFrom: '',
    historyFilterTo: '',
    historyQuickDays: 0,
    historySortKey: 'consumed_at',
    historySortDir: 'desc'
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

  function parseConsumedAt(value) {
    if (!value) return null;
    const raw = String(value).trim();
    let d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
    // PostgreSQL text-like fallback: "YYYY-MM-DD HH:mm:ss+00"
    d = new Date(raw.replace(' ', 'T'));
    if (!Number.isNaN(d.getTime())) return d;
    return null;
  }

  function fmtConsumedAt(value) {
    const d = parseConsumedAt(value);
    if (!d) return 'Data invalidă';
    return d.toLocaleString('ro-RO');
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
    return `<button class="cafea-btn btn-tab ${active ? 'cafea-btn-primary' : 'cafea-btn-muted'}" data-tab="${esc(id)}">${esc(label)}</button>`;
  }

  function renderStockRow(field, label, value, isAdmin, extraHtml = '') {
    const busy = state.pendingRequests > 0;
    const shownValue = busy ? skeleton('72px', '30px') : esc(value);
    return `
      <div class="relative rounded-xl border border-slate-300/20 dark:border-white/10 p-3">
        <div class="text-center pr-24 min-w-0">
          <p class="text-xs uppercase tracking-wider text-slate-500">${esc(label)}</p>
          <p id="stock-value-${field}" class="text-2xl font-bold flex justify-center">${shownValue}</p>
          ${busy ? `<p class="text-xs mt-1 text-slate-500 flex justify-center">${skeleton('180px', '12px')}</p>` : extraHtml}
          <input id="stock-input-${field}" class="cafea-input hidden text-center" style="width:100%;max-width:160px;margin:8px auto 0 auto;" type="number" min="0" value="${esc(value)}" />
        </div>
        ${isAdmin ? `<button id="btn-edit-${field}" data-mode="idle" class="cafea-btn cafea-btn-muted" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);z-index:2;">Edit</button>` : ''}
      </div>
    `;
  }

  function getVisibleHistoryRows() {
    const allRows = getProcessedHistoryRows();
    const windowSize = Math.max(10, Number(state.historyWindowSize) || 15);
    const maxStart = Math.max(0, allRows.length - windowSize);
    state.historyWindowStart = Math.min(Math.max(0, state.historyWindowStart), maxStart);
    const start = state.historyWindowStart;
    const end = Math.min(allRows.length, start + windowSize);
    return {
      rows: allRows.slice(start, end),
      start,
      end,
      total: allRows.length,
      maxStart
    };
  }

  function toggleHistorySort(key) {
    if (!key) return;
    if (state.historySortKey === key) {
      state.historySortDir = state.historySortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.historySortKey = key;
      state.historySortDir = (key === 'consumed_at') ? 'desc' : 'asc';
    }
    state.historyWindowStart = 0;
    state.historyScrollHint = '';
  }

  function historySortMark(key) {
    if (state.historySortKey !== key) return '';
    return state.historySortDir === 'asc' ? ' ↑' : ' ↓';
  }

  function getProcessedHistoryRows() {
    const rows = [...(state.rows || [])];
    let out = rows;
    const from = state.historyFilterFrom ? new Date(`${state.historyFilterFrom}T00:00:00`) : null;
    const to = state.historyFilterTo ? new Date(`${state.historyFilterTo}T23:59:59`) : null;
    const days = Number(state.historyQuickDays || 0);
    if (days > 0) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - (days - 1));
      out = out.filter((r) => {
        const t = parseConsumedAt(r.consumed_at);
        return t && t >= d;
      });
    }
    if (from || to) {
      out = out.filter((r) => {
        const t = parseConsumedAt(r.consumed_at);
        if (!t) return false;
        if (from && t < from) return false;
        if (to && t > to) return false;
        return true;
      });
    }

    const sortKey = state.historySortKey;
    const dir = state.historySortDir === 'asc' ? 1 : -1;
    const stats = buildPerRowStats(state.user?.role === ROLE_ADMIN);
    out.sort((a, b) => {
      let av;
      let bv;
      if (sortKey === 'name') {
        av = String(a.name || a.email || '').toLowerCase();
        bv = String(b.name || b.email || '').toLowerCase();
      } else if (sortKey === 'consumed_at') {
        av = parseConsumedAt(a.consumed_at)?.getTime() ?? 0;
        bv = parseConsumedAt(b.consumed_at)?.getTime() ?? 0;
      } else if (sortKey === 'delta') {
        av = Number(a.delta || 0);
        bv = Number(b.delta || 0);
      } else if (sortKey === 'consumed') {
        av = Number(stats[String(a.id)]?.consumed ?? -1);
        bv = Number(stats[String(b.id)]?.consumed ?? -1);
      } else if (sortKey === 'remaining') {
        av = stats[String(a.id)]?.remaining;
        bv = stats[String(b.id)]?.remaining;
        av = av == null ? Number.POSITIVE_INFINITY : Number(av);
        bv = bv == null ? Number.POSITIVE_INFINITY : Number(bv);
      } else {
        av = Number(a.id || 0);
        bv = Number(b.id || 0);
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return (Number(b.id) - Number(a.id)) * dir;
    });
    return out;
  }

  function renderHistoryRows() {
    const isAdmin = state.user?.role === ROLE_ADMIN;
    const visible = getVisibleHistoryRows();
    if (state.pendingRequests > 0 && (!visible.rows || !visible.rows.length)) {
      return Array.from({ length: 5 }).map(() => `
        <tr class="border-b border-slate-300/10 dark:border-white/5">
          <td class="py-2">${skeleton('180px', '14px')}</td>
          <td class="py-2">${skeleton('150px', '14px')}</td>
          <td class="py-2">${skeleton('70px', '14px')}</td>
        </tr>
      `).join('');
    }
    let lastDateKey = '';
    const dayCount = {};
    for (const r of visible.rows || []) {
      const dt = parseConsumedAt(r.consumed_at);
      const key = dt ? dt.toLocaleDateString('ro-RO') : String(r.consumed_at).slice(0, 10);
      dayCount[key] = (dayCount[key] || 0) + 1;
    }
    const perRowStats = buildPerRowStats(isAdmin);
    return visible.rows.map((r) => {
      const dt = parseConsumedAt(r.consumed_at);
      const dateKey = dt ? dt.toLocaleDateString('ro-RO') : String(r.consumed_at).slice(0, 10);
      const dateHeader = dateKey !== lastDateKey
        ? `<tr class="border-b border-emerald-400/30 dark:border-emerald-400/40 bg-emerald-500/10">
             <td class="py-2 px-2 font-bold text-emerald-300" colspan="${isAdmin ? 6 : 3}">
               <div class="flex items-center justify-between gap-3">
                 <span>${esc(dateKey)}</span>
                 <span class="text-xs text-emerald-200/90">${esc(dayCount[dateKey] || 0)} înregistrări</span>
               </div>
             </td>
           </tr>`
        : '';
      lastDateKey = dateKey;
      return `
      ${dateHeader}
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
        <td class="py-2">${esc(fmtConsumedAt(r.consumed_at))}</td>
        <td class="py-2">+${esc(r.delta)}</td>
        ${isAdmin ? `<td class="py-2 text-center"><button class="cafea-btn cafea-btn-muted btn-delete-log btn-delete-float" data-id="${r.id}" data-name="${esc(r.name || r.email || 'utilizator')}" data-delta="${esc(r.delta)}" data-at="${esc(fmtConsumedAt(r.consumed_at))}" style="padding:0.35rem 0.6rem;font-size:12px;">Delete</button></td>` : ''}
        ${isAdmin ? `<td class="py-2">${esc(perRowStats[String(r.id)]?.consumed ?? '-')}</td>` : ''}
        ${isAdmin ? `<td class="py-2">${esc(perRowStats[String(r.id)]?.remaining == null ? 'nelimitat' : perRowStats[String(r.id)].remaining)}</td>` : ''}
      </tr>
    `;
    }).join('');
  }

  function buildPerRowStats(isAdmin) {
    const perRowStats = {};
    if (!isAdmin) return perRowStats;
    const maxByUser = {};
    for (const u of state.users || []) {
      maxByUser[String(u.id)] = u.max_coffees == null ? null : Number(u.max_coffees);
    }
    const asc = [...(state.rows || [])].sort((a, b) => {
      const ta = parseConsumedAt(a.consumed_at)?.getTime() ?? 0;
      const tb = parseConsumedAt(b.consumed_at)?.getTime() ?? 0;
      if (ta !== tb) return ta - tb;
      return Number(a.id) - Number(b.id);
    });
    const consumedMap = {};
    for (const r of asc) {
      const uid = String(r.user_id);
      consumedMap[uid] = (consumedMap[uid] || 0) + Number(r.delta || 0);
      const consumed = consumedMap[uid];
      const max = maxByUser[uid];
      const remaining = max == null ? null : Math.max(0, Number(max) - consumed);
      perRowStats[String(r.id)] = { consumed, remaining };
    }
    return perRowStats;
  }

  function renderHistoryCards(isAdmin) {
    const visible = getVisibleHistoryRows();
    const rows = visible.rows || [];
    if (state.pendingRequests > 0 && !rows.length) {
      return `<div class="text-xs text-slate-500">Se încarcă istoricul...</div>`;
    }
    const perRowStats = buildPerRowStats(isAdmin);
    let lastDateKey = '';
    const out = [];
    for (const r of rows) {
      const dt = parseConsumedAt(r.consumed_at);
      const dateKey = dt ? dt.toLocaleDateString('ro-RO') : String(r.consumed_at).slice(0, 10);
      if (dateKey !== lastDateKey) {
        out.push(`<div class="mt-3 mb-1 text-xs font-bold text-emerald-300">${esc(dateKey)}</div>`);
        lastDateKey = dateKey;
      }
      const stats = perRowStats[String(r.id)] || {};
      out.push(`
        <article class="border border-slate-300/20 dark:border-white/10 rounded-xl p-3 mb-2">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2">
            <img src="${esc(r.avatar_url || 'https://placehold.co/40x40?text=U')}" class="rounded-full object-cover" style="width:28px;height:28px;min-width:28px;max-width:28px;" />
            <div>
              <p class="font-semibold leading-tight">${esc(r.name || r.email)}</p>
              <p class="text-xs text-slate-500">${esc(r.email || '')}</p>
            </div>
          </div>
            ${isAdmin ? `<button class="cafea-btn cafea-btn-muted btn-delete-log btn-delete-float" data-id="${r.id}" data-name="${esc(r.name || r.email || 'utilizator')}" data-delta="${esc(r.delta)}" data-at="${esc(fmtConsumedAt(r.consumed_at))}" style="padding:0.35rem 0.6rem;font-size:12px;">Delete</button>` : ''}
          </div>
          <div class="mt-2 text-xs text-slate-400">${esc(fmtConsumedAt(r.consumed_at))}</div>
          <div class="mt-1 text-sm">Delta: <span class="font-semibold">+${esc(r.delta)}</span></div>
          ${isAdmin ? `<div class="mt-1 text-xs text-slate-400">Consumate: ${esc(stats.consumed ?? '-')} · Rămase: ${esc(stats.remaining == null ? 'nelimitat' : stats.remaining)}</div>` : ''}
        </article>
      `);
    }
    return out.join('');
  }

  function renderUserTab(isAdmin) {
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    const selectedUser = (state.users || []).find((u) => u.id === state.selectedAdminUserId) || null;
    const userStats = state.selectedUserStats;
    const remainingLabel = userStats?.remaining == null ? 'nelimitat' : String(userStats.remaining);
    const maxLabel = userStats?.max_coffees == null ? 'nelimitat' : String(userStats.max_coffees);
    const selectedHistoryRowsDesktop = (state.selectedUserHistory || []).map((r) => `
      <tr class="border-b border-slate-300/10 dark:border-white/5">
        <td class="py-1">${esc(r.id)}</td>
        <td class="py-1"><input class="cafea-input input-log-datetime" style="width:100%;max-width:260px;" data-id="${r.id}" value="${esc(r.consumed_at)}" /></td>
        <td class="py-1"><input class="cafea-input input-log-delta" style="width:100%;max-width:70px;" data-id="${r.id}" type="number" min="1" value="${esc(r.delta)}" /></td>
        <td class="py-1"><button class="cafea-btn cafea-btn-muted btn-save-log" data-id="${r.id}">Save</button></td>
      </tr>
    `).join('');
    const selectedHistoryRowsMobile = (state.selectedUserHistory || []).map((r) => `
      <div class="cafea-log-row border-b border-slate-300/10 dark:border-white/5 py-1">
        <div class="text-xs text-slate-300 px-1">${esc(r.id)}</div>
        <input class="cafea-input input-log-datetime" data-id="${r.id}" value="${esc(r.consumed_at)}" />
        <input class="cafea-input input-log-delta" data-id="${r.id}" type="number" min="1" value="${esc(r.delta)}" />
        <button class="cafea-btn cafea-btn-muted cafea-btn-xs btn-save-log" data-id="${r.id}">OK</button>
      </div>
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
    const historyWindow = getVisibleHistoryRows();
    const historyFrom = historyWindow.total ? historyWindow.start + 1 : 0;
    const historyTo = historyWindow.end;

    const adminUserList = `
      <div class="cafea-glass p-5">
        <h3 class="font-bold text-lg mb-3">${isAdmin ? 'Consum în numele userului' : 'Vizualizare coleg'}</h3>
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
                <div class="border border-slate-300/20 dark:border-white/10 rounded-lg p-2 relative">
                  Maxim:
                  <span id="max-value-inline" class="font-semibold">${esc(maxLabel)}</span>
                  ${isAdmin ? `
                    <input id="max-input-inline" class="cafea-input hidden" type="number" min="0" placeholder="nelimitat" value="${esc(userStats?.max_coffees ?? '')}" style="width:100%;max-width:140px;display:none;margin-top:6px;" />
                    <button id="btn-edit-max-inline" data-mode="idle" class="cafea-btn cafea-btn-muted" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);z-index:2;">Edit</button>
                  ` : ''}
                </div>
                <div class="border border-slate-300/20 dark:border-white/10 rounded-lg p-2">Rămase: <span class="font-semibold">${esc(remainingLabel)}</span></div>
                <div class="border border-slate-300/20 dark:border-white/10 rounded-lg p-2">Ultima: <span class="font-semibold">${esc(userStats?.last_consumed_at || '-')}</span></div>
              </div>
              ${isAdmin ? `
                <button id="btn-consume-selected-user" class="cafea-btn cafea-btn-primary w-full" ${state.stock?.current_stock <= 0 ? 'disabled' : ''}>Consumă 1 cafea pentru ${esc(selectedUser.name)}</button>
                <form id="form-add-history-user" class="flex items-center gap-2 mt-3 flex-wrap">
                  <input id="input-add-delta" class="cafea-input" type="number" min="1" value="1" style="width:100%;max-width:95px;" />
                  <input id="input-add-datetime" class="cafea-input" type="datetime-local" style="width:100%;max-width:260px;" />
                  <button class="cafea-btn cafea-btn-muted" type="submit">Adaugă istoric</button>
                </form>
              ` : ''}
              ${isMobile ? `
                <div class="mt-3 cafea-local-history-wrap">
                  <div class="cafea-log-head text-xs border-b border-slate-300/20 dark:border-white/10 pb-1 mb-1">
                    <div>ID</div><div>Data</div><div>Delta</div><div></div>
                  </div>
                  <div class="cafea-local-history-list">${selectedHistoryRowsMobile}</div>
                </div>
              ` : `
                <div class="mt-3 overflow-auto">
                  <table class="w-full text-xs">
                    <thead><tr class="border-b border-slate-300/20 dark:border-white/10"><th class="text-left py-1">ID</th><th class="text-left py-1">Data</th><th class="text-left py-1">Delta</th><th></th></tr></thead>
                    <tbody>${selectedHistoryRowsDesktop}</tbody>
                  </table>
                </div>
              `}
            ` : '<p class="text-slate-500">Selectează un user din listă.</p>'}
          </div>
        </div>
      </div>
    `;

    return `
      <section class="grid gap-4 md:grid-cols-2">
        <div class="cafea-glass p-5">
          <div class="flex items-center justify-between mb-4"><h2 class="font-bold text-xl">Stoc Cafea</h2>${stockBadge()}</div>
          <div class="space-y-3 mb-5">
            ${renderStockRow('initial_stock', 'Inițial', state.stock?.initial_stock ?? 0, isAdmin)}
            ${renderStockRow('current_stock', 'Curent', state.stock?.current_stock ?? 0, isAdmin, currentExtra)}
            ${renderStockRow('min_stock', 'Minim', state.stock?.min_stock ?? 0, isAdmin)}
          </div>
          <button id="btn-consume" class="cafea-btn cafea-btn-primary w-full" ${state.stock?.current_stock <= 0 ? 'disabled' : ''}>Consumă 1 cafea</button>
        </div>
        ${adminUserList}
      </section>
      <section class="cafea-glass p-5">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-bold text-lg">${isAdmin ? 'Istoric complet consum' : 'Istoricul tău'}</h3>
        </div>
        <div class="mb-2 flex items-center justify-between gap-2 flex-wrap text-xs text-slate-500">
          <span>Poziție ${historyFrom}/${historyWindow.total} • Afișate ${Math.max(0, historyTo - historyFrom + 1)} iteme</span>
          <div class="flex items-center gap-2">
            <button id="btn-history-top" class="cafea-btn cafea-btn-muted cafea-btn-xs hidden">Top</button>
          </div>
        </div>
        <div class="mb-3 flex items-center gap-2 flex-wrap">
          <select id="history-quick-days" class="cafea-input" style="max-width:150px;">
            <option value="0" ${Number(state.historyQuickDays) === 0 ? 'selected' : ''}>Toate zilele</option>
            <option value="1" ${Number(state.historyQuickDays) === 1 ? 'selected' : ''}>Azi</option>
            <option value="7" ${Number(state.historyQuickDays) === 7 ? 'selected' : ''}>Ultimele 7 zile</option>
            <option value="30" ${Number(state.historyQuickDays) === 30 ? 'selected' : ''}>Ultimele 30 zile</option>
          </select>
          <input id="history-date-from" class="cafea-input" type="date" value="${esc(state.historyFilterFrom)}" style="max-width:170px;" />
          <input id="history-date-to" class="cafea-input" type="date" value="${esc(state.historyFilterTo)}" style="max-width:170px;" />
          <button id="history-filter-clear" class="cafea-btn cafea-btn-muted cafea-btn-xs" type="button">Reset filtre</button>
        </div>
        ${isMobile
          ? `<div id="history-scroll" class="cafea-history-scroll">${renderHistoryCards(isAdmin)}</div>`
          : `<div id="history-scroll" class="cafea-history-scroll overflow-auto cafea-table-wrap"><table class="w-full text-sm cafea-history-table"><thead><tr class="border-b border-slate-300/20 dark:border-white/10 text-slate-500"><th class="text-left py-2"><button class="btn-history-sort" data-sort-key="name">Cine${historySortMark('name')}</button></th><th class="text-left py-2"><button class="btn-history-sort" data-sort-key="consumed_at">Când${historySortMark('consumed_at')}</button></th><th class="text-left py-2"><button class="btn-history-sort" data-sort-key="delta">Delta${historySortMark('delta')}</button></th>${isAdmin ? '<th class="text-center py-2 text-amber-300">Del ⚠</th><th class="text-left py-2"><button class="btn-history-sort" data-sort-key=\"consumed\">Consumate' + historySortMark('consumed') + '</button></th><th class="text-left py-2"><button class="btn-history-sort" data-sort-key=\"remaining\">Rămase' + historySortMark('remaining') + '</button></th>' : ''}</tr></thead><tbody>${renderHistoryRows()}</tbody></table></div>`}
      </section>
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
        <header class="cafea-glass p-3 md:p-5">
          <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div class="flex items-center gap-3">
              <img src="${esc(state.user.avatar_url || 'https://placehold.co/72x72?text=U')}" class="w-10 h-10 md:w-12 md:h-12 rounded-full object-cover" />
              <div class="min-w-0">
                <h1 class="text-lg md:text-2xl font-bold leading-tight whitespace-nowrap">Cafea Office Dashboard</h1>
                <div class="mt-1 flex items-center justify-between gap-2 md:hidden cafea-mobile-meta-row">
                  <p class="text-slate-600 dark:text-slate-300 whitespace-nowrap">${esc(state.user.name)} • ${esc(state.user.role)}</p>
                  <div class="flex items-center gap-2 whitespace-nowrap">
                    ${loadingBadge()}
                    <button class="cafea-btn cafea-btn-muted btn-refresh" aria-label="Refresh" title="Refresh" style="padding:0.44rem 0.6rem;min-width:40px">
                      <i class="fas fa-rotate-right"></i>
                    </button>
                    <button class="cafea-btn cafea-btn-muted btn-logout">Logout</button>
                  </div>
                </div>
              </div>
            </div>

            <div class="cafea-mobile-actions md:hidden">
              <div class="cafea-mobile-actions-inner">
                ${renderTabButton('user', 'Acasă')}
                ${renderTabButton('profile', 'Profile')}
                ${isAdmin ? renderTabButton('admin', 'Admin Panel') : ''}
              </div>
            </div>

            <div class="hidden md:flex gap-2 flex-wrap md:justify-center">
            ${renderTabButton('user', 'Acasă')}
            ${renderTabButton('profile', 'Profile')}
            ${isAdmin ? renderTabButton('admin', 'Admin Panel') : ''}
            </div>
            <div class="hidden md:flex gap-2 md:justify-end">
              ${loadingBadge()}
            <button class="cafea-btn cafea-btn-muted btn-refresh">Refresh</button>
            <button class="cafea-btn cafea-btn-muted btn-logout">Logout</button>
            </div>
          </div>
        </header>

        ${state.error ? `<div class="cafea-glass p-3 text-red-500">${esc(state.error)}</div>` : ''}
        ${state.info ? `<div class="cafea-glass p-3 text-emerald-400">${esc(state.info)}</div>` : ''}

        ${state.activeTab === 'user' ? renderUserTab(isAdmin) : ''}
        ${state.activeTab === 'profile' ? renderProfileTab() : ''}
        ${state.activeTab === 'admin' && isAdmin ? renderAdminTab() : ''}
      </main>
    `;

    document.querySelectorAll('.btn-logout').forEach((el) => {
      el.onclick = () => {
        localStorage.removeItem('cafea_token');
        state.token = '';
        state.user = null;
        state.error = '';
        state.info = '';
        renderAuth('login');
      };
    });

    document.querySelectorAll('.btn-refresh').forEach((el) => {
      el.onclick = async () => {
        try {
          await loadDashboard();
        } catch (err) {
          state.error = err.message;
        }
        renderApp();
      };
    });

    document.querySelectorAll('.btn-tab').forEach((el) => {
      el.onclick = () => {
        const tab = el.dataset.tab;
        if (!tab) return;
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

    if (state.activeTab === 'user') {
      document.querySelectorAll('.btn-pick-consume-user').forEach((btn) => {
        btn.onclick = async () => {
          state.selectedAdminUserId = Number(btn.dataset.id);
          try {
            await loadDashboard();
          } catch (err) {
            state.error = err.message;
          }
          renderApp();
        };
      });
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

      const editMaxBtn = document.getElementById('btn-edit-max-inline');
      if (editMaxBtn) {
        editMaxBtn.onclick = async () => {
          const maxValueEl = document.getElementById('max-value-inline');
          const maxInputEl = document.getElementById('max-input-inline');
          const editing = editMaxBtn.dataset.mode === 'editing';
          if (!editing) {
            editMaxBtn.dataset.mode = 'editing';
            editMaxBtn.textContent = 'Save';
            maxValueEl?.classList.add('hidden');
            maxInputEl?.classList.remove('hidden');
            if (maxInputEl) maxInputEl.style.display = 'block';
            maxInputEl?.focus();
            return;
          }
          try {
            const raw = maxInputEl?.value?.trim() || '';
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
          const who = btn.dataset.name || 'utilizator';
          const delta = btn.dataset.delta || '?';
          const when = btn.dataset.at || '-';
          const msg = `Atenție: vrei să ștergi înregistrarea pentru ${who} (delta +${delta}, ${when})?`;
          if (!window.confirm(msg)) return;
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

    const historyScroll = document.getElementById('history-scroll');
    const historyTopBtn = document.getElementById('btn-history-top');
    const totalRows = (state.rows || []).length;
    const windowSize = Math.max(10, Number(state.historyWindowSize) || 15);
    const step = Math.max(1, Number(state.historyWindowStep) || 10);
    const maxStart = Math.max(0, totalRows - windowSize);
    if (historyTopBtn) {
      historyTopBtn.onclick = () => {
        state.historyWindowStart = 0;
        state.historyScrollHint = '';
        renderApp();
      };
    }
    if (historyScroll) {
      if (state.historyScrollHint === 'down') {
        historyScroll.scrollTop = Math.max(140, Math.floor(historyScroll.scrollHeight * 0.58));
        state.historyScrollHint = '';
      } else if (state.historyScrollHint === 'up') {
        historyScroll.scrollTop = Math.max(0, historyScroll.scrollHeight - historyScroll.clientHeight - 140);
        state.historyScrollHint = '';
      }
      historyScroll.onscroll = () => {
        if (historyTopBtn) historyTopBtn.classList.toggle('hidden', historyScroll.scrollTop < 220);
        const nearBottom = historyScroll.scrollTop + historyScroll.clientHeight >= historyScroll.scrollHeight - 24;
        const nearTop = historyScroll.scrollTop <= 4;
        if (nearBottom && state.historyWindowStart < maxStart) {
          state.historyWindowStart = Math.min(maxStart, state.historyWindowStart + step);
          state.historyScrollHint = 'down';
          renderApp();
          return;
        }
        if (nearTop && state.historyWindowStart > 0) {
          state.historyWindowStart = Math.max(0, state.historyWindowStart - step);
          state.historyScrollHint = 'up';
          renderApp();
        }
      };
    }

    document.querySelectorAll('.btn-history-sort').forEach((btn) => {
      btn.onclick = () => {
        toggleHistorySort(btn.dataset.sortKey);
        renderApp();
      };
    });

    const historyQuickDays = document.getElementById('history-quick-days');
    if (historyQuickDays) {
      historyQuickDays.onchange = () => {
        state.historyQuickDays = Number(historyQuickDays.value || 0);
        state.historyWindowStart = 0;
        state.historyScrollHint = '';
        renderApp();
      };
    }
    const historyDateFrom = document.getElementById('history-date-from');
    if (historyDateFrom) {
      historyDateFrom.onchange = () => {
        state.historyFilterFrom = historyDateFrom.value || '';
        state.historyWindowStart = 0;
        state.historyScrollHint = '';
        renderApp();
      };
    }
    const historyDateTo = document.getElementById('history-date-to');
    if (historyDateTo) {
      historyDateTo.onchange = () => {
        state.historyFilterTo = historyDateTo.value || '';
        state.historyWindowStart = 0;
        state.historyScrollHint = '';
        renderApp();
      };
    }
    const historyFilterClear = document.getElementById('history-filter-clear');
    if (historyFilterClear) {
      historyFilterClear.onclick = () => {
        state.historyQuickDays = 0;
        state.historyFilterFrom = '';
        state.historyFilterTo = '';
        state.historySortKey = 'consumed_at';
        state.historySortDir = 'desc';
        state.historyWindowStart = 0;
        state.historyScrollHint = '';
        renderApp();
      };
    }
  }

  async function loadMe() {
    const d = await api('/api/auth/me');
    state.user = d.user;
  }

  async function loadDashboard() {
    if (!state.user) return;
    const selected = state.selectedAdminUserId != null ? `&selected_user_id=${encodeURIComponent(state.selectedAdminUserId)}` : '';
    const snap = await api(`/api/coffee/snapshot?limit=1000${selected}`);
    state.stock = snap.stock;
    state.user = snap.user || state.user;
    state.rows = snap.rows || [];
    state.historyWindowStart = 0;
    state.historyScrollHint = '';
    state.userConsumption = snap.user_consumption || {};
    const isAdmin = state.user.role === ROLE_ADMIN;
    if (isAdmin) {
      state.users = snap.users || [];
      state.selectedAdminUserId = snap.selected_user_id || null;
      if (!state.selectedAdminUserId && state.users.length) {
        state.selectedAdminUserId = state.users[0].id;
      }
      state.selectedUserStats = snap.selected_user_stats || null;
      state.selectedUserHistory = snap.selected_user_history || [];
    } else {
      state.users = snap.users || state.users || [];
      state.selectedAdminUserId = snap.selected_user_id || state.selectedAdminUserId || null;
      if (!state.selectedAdminUserId && state.users.length) {
        state.selectedAdminUserId = state.users[0].id;
      }
      state.selectedUserStats = snap.selected_user_stats || null;
      state.selectedUserHistory = snap.selected_user_history || [];
      state.userConsumption = {};
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
