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
    activeTab: 'user'
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

  function renderTabButton(id, label) {
    const active = state.activeTab === id;
    return `<button id="tab-${id}" class="cafea-btn ${active ? 'cafea-btn-primary' : 'cafea-btn-muted'}">${esc(label)}</button>`;
  }

  function renderStockRow(field, label, value, isAdmin) {
    return `
      <div class="relative rounded-xl border border-slate-300/20 dark:border-white/10 p-3">
        <div class="text-center">
          <p class="text-xs uppercase tracking-wider text-slate-500">${esc(label)}</p>
          <p id="stock-value-${field}" class="text-2xl font-bold">${esc(value)}</p>
          <input id="stock-input-${field}" class="cafea-input hidden mt-2 w-32 mx-auto text-center" type="number" min="0" value="${esc(value)}" />
        </div>
        ${isAdmin ? `<button id="btn-edit-${field}" data-mode="idle" class="cafea-btn cafea-btn-muted absolute right-3 top-1/2 -translate-y-1/2">Edit</button>` : ''}
      </div>
    `;
  }

  function renderHistoryRows() {
    return state.rows.map((r) => `
      <tr class="border-b border-slate-300/10 dark:border-white/5">
        <td class="py-2">
          <div class="flex items-center gap-2">
            <img src="${esc(r.avatar_url || 'https://placehold.co/40x40?text=U')}" class="w-8 h-8 rounded-full object-cover" />
            <div>
              <p class="font-semibold leading-tight">${esc(r.name || r.email)}</p>
              <p class="text-xs text-slate-500">${esc(r.email || '')}</p>
            </div>
          </div>
        </td>
        <td class="py-2">${esc(new Date(r.consumed_at + 'Z').toLocaleString('ro-RO'))}</td>
        <td class="py-2">-${esc(r.delta)}</td>
      </tr>
    `).join('');
  }

  function renderUserTab(isAdmin) {
    return `
      <section class="grid md:grid-cols-2 gap-4">
        <div class="cafea-glass p-5">
          <div class="flex items-center justify-between mb-4"><h2 class="font-bold text-xl">Stoc Cafea</h2>${stockBadge()}</div>
          <div class="space-y-3 mb-5">
            ${renderStockRow('initial_stock', 'Inițial', state.stock?.initial_stock ?? 0, isAdmin)}
            ${renderStockRow('current_stock', 'Curent', state.stock?.current_stock ?? 0, isAdmin)}
            ${renderStockRow('min_stock', 'Minim', state.stock?.min_stock ?? 0, isAdmin)}
          </div>
          <button id="btn-consume" class="cafea-btn cafea-btn-primary w-full" ${state.stock?.current_stock <= 0 ? 'disabled' : ''}>Consumă 1 cafea</button>
        </div>

        <div class="cafea-glass p-5">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-lg">${isAdmin ? 'Istoric complet consum' : 'Istoricul tău'}</h3>
            ${isAdmin ? '<button id="btn-history-clear" class="cafea-btn cafea-btn-muted">Șterge istoric</button>' : ''}
          </div>
          <div class="overflow-auto"><table class="w-full text-sm"><thead><tr class="border-b border-slate-300/20 dark:border-white/10 text-slate-500"><th class="text-left py-2">Cine</th><th class="text-left py-2">Când</th><th class="text-left py-2">Delta</th></tr></thead><tbody>${renderHistoryRows()}</tbody></table></div>
        </div>
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
          <input class="cafea-input" value="${state.user?.active ? 'active' : 'pending'}" placeholder="status" disabled />
          <input class="cafea-input" value="${esc(state.user?.role || 'user')}" placeholder="rol" disabled />
          <button class="cafea-btn cafea-btn-primary md:col-span-2" type="submit">Salvează profil</button>
        </form>
      </section>
    `;
  }

  function renderAdminTab() {
    const pending = (state.users || []).filter((u) => !u.active);
    const users = (state.users || []).map((u) => `
      <form class="border border-slate-300/20 dark:border-white/10 rounded-xl p-3 grid md:grid-cols-6 gap-2 form-user-edit" data-id="${u.id}">
        <input class="cafea-input" name="name" value="${esc(u.name)}" placeholder="nume" required />
        <input class="cafea-input" name="email" type="email" value="${esc(u.email)}" placeholder="email" required />
        <input class="cafea-input" name="avatar_url" value="${esc(u.avatar_url || '')}" placeholder="avatar url" />
        <input class="cafea-input" name="password" type="password" placeholder="parolă nouă (opțional)" />
        <select class="cafea-input" name="role"><option value="user" ${u.role === 'user' ? 'selected' : ''}>user</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option></select>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}/> active</label>
        <button class="cafea-btn cafea-btn-primary md:col-span-6" type="submit">Save ${esc(u.name)}</button>
      </form>
    `).join('');

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
                <button class="cafea-btn cafea-btn-primary w-full btn-approve" data-id="${u.id}">Aprobă</button>
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
          <div class="space-y-3">${users}</div>
        </div>

        <div class="flex gap-2 flex-wrap justify-center">
          <button id="btn-export" class="cafea-btn cafea-btn-muted">Export CSV</button>
          <button id="btn-history-clear-all" class="cafea-btn cafea-btn-muted">Șterge tot istoricul</button>
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
          <div class="flex gap-2">
            <button id="btn-refresh" class="cafea-btn cafea-btn-muted">Refresh</button>
            <button id="btn-logout" class="cafea-btn cafea-btn-muted">Logout</button>
          </div>
        </header>

        <section class="cafea-glass p-3">
          <div class="flex gap-2 justify-center flex-wrap">
            ${renderTabButton('user', 'User')}
            ${renderTabButton('profile', 'Profile')}
            ${isAdmin ? renderTabButton('admin', 'Admin Panel') : ''}
          </div>
        </section>

        ${state.error ? `<div class="cafea-glass p-3 text-red-500">${esc(state.error)}</div>` : ''}

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

      const clearBtn = document.getElementById('btn-history-clear');
      if (clearBtn) {
        clearBtn.onclick = async () => {
          if (!window.confirm('Ștergi tot istoricul?')) return;
          try {
            await api('/api/admin/history', { method: 'DELETE' });
            await loadDashboard();
          } catch (err) {
            state.error = err.message;
          }
          renderApp();
        };
      }
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
          const d = await api('/api/auth/profile', { method: 'PUT', body: { name, avatar_url, email } });
          state.user = d.user;
          await loadDashboard();
        } catch (err) {
          state.error = err.message;
        }
        renderApp();
      };
    }

    if (isAdmin && state.activeTab === 'admin') {
      const exportBtn = document.getElementById('btn-export');
      if (exportBtn) exportBtn.onclick = () => window.open('/api/admin/export.csv', '_blank');

      const clearAllBtn = document.getElementById('btn-history-clear-all');
      if (clearAllBtn) {
        clearAllBtn.onclick = async () => {
          if (!window.confirm('Ștergi tot istoricul?')) return;
          try {
            await api('/api/admin/history', { method: 'DELETE' });
            await loadDashboard();
          } catch (err) {
            state.error = err.message;
          }
          renderApp();
        };
      }

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

      document.querySelectorAll('.form-user-edit').forEach((form) => {
        form.onsubmit = async (e) => {
          e.preventDefault();
          try {
            const id = form.dataset.id;
            const fd = new FormData(form);
            await api(`/api/admin/users/${id}`, {
              method: 'PUT',
              body: {
                name: String(fd.get('name') || '').trim(),
                email: String(fd.get('email') || '').trim().toLowerCase(),
                avatar_url: String(fd.get('avatar_url') || '').trim(),
                password: String(fd.get('password') || '').trim(),
                role: String(fd.get('role') || 'user'),
                active: fd.get('active') === 'on'
              }
            });
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
    } else {
      state.users = [];
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
