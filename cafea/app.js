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
    error: ''
  };

  async function api(path, opts = {}) {
    const method = opts.method || 'GET';
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const normalizedPath = API_BASE.endsWith('/api') && path.startsWith('/api/') ? path.slice(4) : path;
    const res = await fetch(`${API_BASE}${normalizedPath}`, {
      method,
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
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

  function renderApp() {
    const isAdmin = state.user?.role === ROLE_ADMIN;
    const rows = state.rows
      .map((r) => `<tr class="border-b border-slate-300/10 dark:border-white/5"><td class="py-2">${esc(r.name || r.email)}</td><td class="py-2">${esc(new Date(r.consumed_at + 'Z').toLocaleString('ro-RO'))}</td><td class="py-2">-${esc(r.delta)}</td></tr>`)
      .join('');

    const pending = (state.users || []).filter((u) => !u.active);
    const pendingHtml = pending.map((u) => `
      <div class="border border-amber-400/40 rounded-xl p-3">
        <p class="font-bold">${esc(u.name)}</p>
        <p class="text-xs text-slate-500 mb-2">${esc(u.email)}</p>
        <button class="cafea-btn cafea-btn-primary w-full btn-approve" data-id="${u.id}">Aprobă</button>
      </div>
    `).join('');

    const profileName = esc(state.user?.name || '');
    const profileAvatar = esc(state.user?.avatar_url || '');

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
          <div class="flex gap-2">
            <button id="btn-refresh" class="cafea-btn cafea-btn-muted">Refresh</button>
            <button id="btn-logout" class="cafea-btn cafea-btn-muted">Logout</button>
          </div>
        </header>

        ${state.error ? `<div class="cafea-glass p-3 text-red-500">${esc(state.error)}</div>` : ''}

        <section class="grid md:grid-cols-2 gap-4">
          <div class="cafea-glass p-5">
            <div class="flex items-center justify-between mb-4"><h2 class="font-bold text-xl">Stoc Cafea</h2>${stockBadge()}</div>
            <div class="grid grid-cols-3 gap-3 text-center mb-5">
              <div><p class="text-xs uppercase tracking-wider text-slate-500">Inițial</p><p class="text-2xl font-bold">${esc(state.stock?.initial_stock ?? 0)}</p></div>
              <div><p class="text-xs uppercase tracking-wider text-slate-500">Curent</p><p class="text-2xl font-bold">${esc(state.stock?.current_stock ?? 0)}</p></div>
              <div><p class="text-xs uppercase tracking-wider text-slate-500">Minim</p><p class="text-2xl font-bold">${esc(state.stock?.min_stock ?? 0)}</p></div>
            </div>
            <button id="btn-consume" class="cafea-btn cafea-btn-primary w-full" ${state.stock?.current_stock <= 0 ? 'disabled' : ''}>Consumă 1 cafea</button>
          </div>

          <div class="cafea-glass p-5">
            <h3 class="font-bold text-lg mb-3">${isAdmin ? 'Istoric complet consum' : 'Istoricul tău'}</h3>
            <div class="overflow-auto"><table class="w-full text-sm"><thead><tr class="border-b border-slate-300/20 dark:border-white/10 text-slate-500"><th class="text-left py-2">Cine</th><th class="text-left py-2">Când</th><th class="text-left py-2">Delta</th></tr></thead><tbody>${rows}</tbody></table></div>
          </div>
        </section>

        <section class="cafea-glass p-5">
          <h3 class="font-bold text-lg mb-3">Profilul meu</h3>
          <form id="form-profile" class="grid md:grid-cols-3 gap-3">
            <input id="profile-name" class="cafea-input" value="${profileName}" placeholder="nume" required />
            <input id="profile-avatar" class="cafea-input md:col-span-2" value="${profileAvatar}" placeholder="avatar url" />
            <button class="cafea-btn cafea-btn-primary md:col-span-3" type="submit">Salvează profil</button>
          </form>
        </section>

        ${isAdmin ? `
          <section class="cafea-glass p-5 space-y-5">
            <h3 class="font-bold text-lg">Admin Controls</h3>
            ${pending.length ? `<div><h4 class="font-semibold mb-2">Cereri pending (${pending.length})</h4><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">${pendingHtml}</div></div>` : ''}
            <div>
              <h4 class="font-semibold mb-2">Setează stoc</h4>
              <form id="form-stock" class="grid md:grid-cols-4 gap-3">
                <input id="stock-initial" class="cafea-input" type="number" min="0" value="${esc(state.stock?.initial_stock ?? 0)}" placeholder="stoc inițial" required />
                <input id="stock-current" class="cafea-input" type="number" min="0" value="${esc(state.stock?.current_stock ?? 0)}" placeholder="stoc curent" required />
                <input id="stock-min" class="cafea-input" type="number" min="0" value="${esc(state.stock?.min_stock ?? 20)}" placeholder="stoc minim" required />
                <button class="cafea-btn cafea-btn-primary" type="submit">Salvează stoc</button>
              </form>
            </div>
            <div class="flex gap-2 flex-wrap">
              <button id="btn-export" class="cafea-btn cafea-btn-muted">Export CSV</button>
            </div>
          </section>
        ` : ''}
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

    document.getElementById('btn-consume').onclick = async () => {
      try {
        state.error = '';
        await api('/api/coffee/consume', { method: 'POST' });
        await loadDashboard();
      } catch (err) {
        state.error = err.message;
      }
      renderApp();
    };

    const profileForm = document.getElementById('form-profile');
    if (profileForm) {
      profileForm.onsubmit = async (e) => {
        e.preventDefault();
        try {
          state.error = '';
          const name = document.getElementById('profile-name').value.trim();
          const avatar_url = document.getElementById('profile-avatar').value.trim();
          const d = await api('/api/auth/profile', { method: 'PUT', body: { name, avatar_url } });
          state.user = d.user;
          await loadDashboard();
        } catch (err) {
          state.error = err.message;
        }
        renderApp();
      };
    }

    if (isAdmin) {
      const stockForm = document.getElementById('form-stock');
      if (stockForm) {
        stockForm.onsubmit = async (e) => {
          e.preventDefault();
          try {
            state.error = '';
            await api('/api/admin/stock/init', {
              method: 'POST',
              body: {
                initial_stock: Number(document.getElementById('stock-initial').value),
                current_stock: Number(document.getElementById('stock-current').value),
                min_stock: Number(document.getElementById('stock-min').value)
              }
            });
            await loadDashboard();
          } catch (err) {
            state.error = err.message;
          }
          renderApp();
        };
      }

      const exportBtn = document.getElementById('btn-export');
      if (exportBtn) exportBtn.onclick = () => window.open('/api/admin/export.csv', '_blank');

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
    state.rows = h.rows || [];
    if (isAdmin) {
      const u = await api('/api/admin/users');
      state.users = u.users || [];
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

  boot();
})();
