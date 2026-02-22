import React, { useEffect, useState } from 'https://esm.sh/react@18.3.1';
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client';
import htm from 'https://esm.sh/htm@3.1.1';

const html = htm.bind(React.createElement);
const API_BASE = window.CAFEA_API_BASE;
const ROLE_ADMIN = 'admin';

async function api(path, { method = 'GET', token, body, raw = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body)
  });
  if (raw) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function useSession() {
  const [token, setToken] = useState(localStorage.getItem('cafea_token') || '');
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }
    api('/api/auth/me', { token })
      .then((d) => setUser(d.user))
      .catch(() => {
        setToken('');
        localStorage.removeItem('cafea_token');
      });
  }, [token]);

  const login = async (email, password) => {
    const d = await api('/api/auth/login', { method: 'POST', body: { email, password } });
    localStorage.setItem('cafea_token', d.token);
    setToken(d.token);
    setUser(d.user);
  };

  const logout = () => {
    localStorage.removeItem('cafea_token');
    setToken('');
    setUser(null);
  };

  return { token, user, login, logout };
}

function Login({ onLogin, error }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return html`
    <div className="cafea-shell">
      <div className="max-w-3xl mx-auto cafea-glass p-6 md:p-8">
        <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider">
          <span className="w-2 h-2 rounded-full bg-primary"></span>
          Cafea Namespace
        </p>
        <h1 className="text-3xl md:text-5xl font-bold mt-4">Cafea Office Dashboard</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-300">Login cu cont existent. Utilizatorii sunt creați doar de admin.</p>
        <form className="grid md:grid-cols-2 gap-3 mt-6" onSubmit=${(e) => { e.preventDefault(); onLogin(email, password); }}>
          <input className="cafea-input" type="email" placeholder="email" value=${email} onChange=${(e) => setEmail(e.target.value)} required />
          <input className="cafea-input" type="password" placeholder="parolă" value=${password} onChange=${(e) => setPassword(e.target.value)} required />
          <button className="cafea-btn cafea-btn-primary md:col-span-2" type="submit">Intră în aplicație</button>
        </form>
        ${error ? html`<p className="text-red-500 mt-3">${error}</p>` : null}
      </div>
    </div>
  `;
}

function StockCard({ stock, onConsume }) {
  const badge = stock.current_stock <= 0 ? ['cafea-badge-empty', 'Epuizat'] : stock.low ? ['cafea-badge-low', 'Stoc minim'] : ['cafea-badge-ok', 'OK'];
  return html`
    <div className="cafea-glass p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-xl">Stoc Cafea</h2>
        <span className=${`cafea-badge ${badge[0]}`}>${badge[1]}</span>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center mb-5">
        <div><p className="text-xs uppercase tracking-wider text-slate-500">Inițial</p><p className="text-2xl font-bold">${stock.initial_stock}</p></div>
        <div><p className="text-xs uppercase tracking-wider text-slate-500">Curent</p><p className="text-2xl font-bold">${stock.current_stock}</p></div>
        <div><p className="text-xs uppercase tracking-wider text-slate-500">Minim</p><p className="text-2xl font-bold">${stock.min_stock}</p></div>
      </div>
      <button className="cafea-btn cafea-btn-primary w-full" disabled=${stock.current_stock <= 0} onClick=${onConsume}>Consumă 1 cafea</button>
    </div>
  `;
}

function HistoryTable({ rows, title }) {
  return html`
    <div className="cafea-glass p-5">
      <h3 className="font-bold text-lg mb-3">${title}</h3>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-300/20 dark:border-white/10 text-slate-500"><th className="text-left py-2">Cine</th><th className="text-left py-2">Când</th><th className="text-left py-2">Delta</th></tr></thead>
          <tbody>
            ${rows.map((r) => html`<tr key=${r.id} className="border-b border-slate-300/10 dark:border-white/5"><td className="py-2">${r.name || r.email}</td><td className="py-2">${new Date(r.consumed_at + 'Z').toLocaleString('ro-RO')}</td><td className="py-2">-${r.delta}</td></tr>`)}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function AdminPanel({ token, users, onRefresh }) {
  const [stockForm, setStockForm] = useState({ initial_stock: 200, current_stock: 200, min_stock: 20 });
  const [userForm, setUserForm] = useState({ email: '', password: '', name: '', role: 'user', avatar_url: '' });
  const [msg, setMsg] = useState('');

  const submitStock = async (e) => { e.preventDefault(); await api('/api/admin/stock/init', { method: 'POST', token, body: stockForm }); setMsg('Stoc actualizat.'); onRefresh(); };
  const submitUser = async (e) => { e.preventDefault(); await api('/api/admin/users', { method: 'POST', token, body: userForm }); setMsg('Utilizator creat.'); setUserForm({ email: '', password: '', name: '', role: 'user', avatar_url: '' }); onRefresh(); };

  return html`
    <div className="cafea-glass p-5 space-y-5">
      <h3 className="font-bold text-lg">Admin Controls</h3>
      <form className="grid md:grid-cols-4 gap-3" onSubmit=${submitStock}>
        <input className="cafea-input" type="number" min="0" placeholder="stoc inițial" value=${stockForm.initial_stock} onChange=${(e) => setStockForm({ ...stockForm, initial_stock: Number(e.target.value) })} />
        <input className="cafea-input" type="number" min="0" placeholder="stoc curent" value=${stockForm.current_stock} onChange=${(e) => setStockForm({ ...stockForm, current_stock: Number(e.target.value) })} />
        <input className="cafea-input" type="number" min="0" placeholder="stoc minim" value=${stockForm.min_stock} onChange=${(e) => setStockForm({ ...stockForm, min_stock: Number(e.target.value) })} />
        <button className="cafea-btn cafea-btn-primary" type="submit">Setează stoc</button>
      </form>
      <form className="grid md:grid-cols-6 gap-3" onSubmit=${submitUser}>
        <input className="cafea-input" placeholder="nume" value=${userForm.name} onChange=${(e) => setUserForm({ ...userForm, name: e.target.value })} required />
        <input className="cafea-input" type="email" placeholder="email" value=${userForm.email} onChange=${(e) => setUserForm({ ...userForm, email: e.target.value })} required />
        <input className="cafea-input" type="password" placeholder="parolă" value=${userForm.password} onChange=${(e) => setUserForm({ ...userForm, password: e.target.value })} required />
        <input className="cafea-input" placeholder="avatar url" value=${userForm.avatar_url} onChange=${(e) => setUserForm({ ...userForm, avatar_url: e.target.value })} />
        <select className="cafea-input" value=${userForm.role} onChange=${(e) => setUserForm({ ...userForm, role: e.target.value })}><option value="user">user</option><option value="admin">admin</option></select>
        <button className="cafea-btn cafea-btn-primary" type="submit">Adaugă user</button>
      </form>
      <div className="flex gap-3 items-center flex-wrap">
        <button className="cafea-btn cafea-btn-muted" onClick=${() => window.open(`${API_BASE}/api/admin/export.csv`, '_blank')}>Export CSV</button>
        <button className="cafea-btn cafea-btn-muted" onClick=${onRefresh}>Refresh</button>
        ${msg ? html`<span className="text-green-500 text-sm">${msg}</span>` : null}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        ${users.map((u) => html`<div className="border border-slate-300/25 dark:border-white/10 rounded-xl p-3" key=${u.id}><div className="flex items-center gap-3"><img src=${u.avatar_url || 'https://placehold.co/64x64?text=U'} className="w-10 h-10 rounded-full object-cover" /><div><p className="font-bold">${u.name}</p><p className="text-xs text-slate-500">${u.email}</p></div></div><p className="text-xs mt-2">rol: ${u.role} • activ: ${u.active ? 'da' : 'nu'}</p></div>`)}
      </div>
    </div>
  `;
}

function App() {
  const { token, user, login, logout } = useSession();
  const [error, setError] = useState('');
  const [stock, setStock] = useState({ initial_stock: 0, current_stock: 0, min_stock: 0, low: false });
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const isAdmin = user?.role === ROLE_ADMIN;

  const refresh = async () => {
    if (!token) return;
    try {
      const [s, h] = await Promise.all([
        api('/api/coffee/status', { token }),
        api(`/api/coffee/history?mine=${isAdmin ? '0' : '1'}&limit=100`, { token })
      ]);
      setStock(s.stock); setRows(h.rows || []);
      if (isAdmin) { const u = await api('/api/admin/users', { token }); setUsers(u.users || []); }
    } catch (e) { setError(e.message); }
  };

  useEffect(() => { refresh(); }, [token, user?.role]);

  if (!user) return html`<${Login} onLogin=${async (email, pass) => { try { setError(''); await login(email, pass); } catch (e) { setError(e.message); } }} error=${error} />`;

  return html`
    <main className="cafea-shell space-y-4">
      <header className="cafea-glass p-4 md:p-5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3"><img src=${user.avatar_url || 'https://placehold.co/72x72?text=U'} className="w-12 h-12 rounded-full object-cover" /><div><h1 className="text-xl md:text-2xl font-bold">Cafea Office Dashboard</h1><p className="text-slate-600 dark:text-slate-300">${user.name} • ${user.role}</p></div></div>
        <div className="flex gap-2"><button className="cafea-btn cafea-btn-muted" onClick=${refresh}>Refresh</button><button className="cafea-btn cafea-btn-muted" onClick=${logout}>Logout</button></div>
      </header>
      ${error ? html`<div className="cafea-glass p-3 text-red-500">${error}</div>` : null}
      <section className="grid md:grid-cols-2 gap-4"><${StockCard} stock=${stock} onConsume=${async()=>{ try { setError(''); await api('/api/coffee/consume', { method: 'POST', token }); await refresh(); } catch (e) { setError(e.message); } }} /><${HistoryTable} rows=${rows} title=${isAdmin ? 'Istoric complet consum' : 'Istoricul tău'} /></section>
      ${isAdmin ? html`<${AdminPanel} token=${token} users=${users} onRefresh=${refresh} />` : null}
    </main>
  `;
}

createRoot(document.getElementById('root')).render(html`<${App} />`);
