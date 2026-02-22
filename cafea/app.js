import React, { useEffect, useMemo, useState } from 'https://esm.sh/react@18.3.1';
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
    <div className="min-h-screen grid place-items-center p-4">
      <div className="card w-full max-w-md p-6">
        <h1 className="text-3xl font-bold mb-1">Cafea Office</h1>
        <p className="text-slate-300 mb-5">Autentificare cu email și parolă</p>
        <form onSubmit=${(e) => { e.preventDefault(); onLogin(email, password); }} className="space-y-3">
          <input className="input" type="email" placeholder="email" value=${email} onChange=${(e) => setEmail(e.target.value)} required />
          <input className="input" type="password" placeholder="parolă" value=${password} onChange=${(e) => setPassword(e.target.value)} required />
          <button className="btn btn-primary w-full" type="submit">Login</button>
        </form>
        ${error ? html`<p className="text-red-300 mt-3">${error}</p>` : null}
      </div>
    </div>
  `;
}

function StockCard({ stock, onConsume }) {
  const badge = stock.current_stock <= 0
    ? ['badge-empty', 'Epuizat']
    : stock.low
      ? ['badge-low', 'Stoc minim']
      : ['badge-ok', 'OK'];
  return html`
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-xl">Stoc Cafea</h2>
        <span className=${`badge ${badge[0]}`}>${badge[1]}</span>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center mb-4">
        <div><p className="text-slate-400 text-sm">Inițial</p><p className="text-2xl font-bold">${stock.initial_stock}</p></div>
        <div><p className="text-slate-400 text-sm">Curent</p><p className="text-2xl font-bold">${stock.current_stock}</p></div>
        <div><p className="text-slate-400 text-sm">Minim</p><p className="text-2xl font-bold">${stock.min_stock}</p></div>
      </div>
      <button className="btn btn-primary w-full" disabled=${stock.current_stock <= 0} onClick=${onConsume}>Consumă 1 cafea</button>
    </div>
  `;
}

function HistoryTable({ rows, title = 'Istoric' }) {
  return html`
    <div className="card p-5">
      <h3 className="font-bold text-lg mb-3">${title}</h3>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-300">
              <th className="text-left py-2">Cine</th>
              <th className="text-left py-2">Când</th>
              <th className="text-left py-2">Delta</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => html`
              <tr key=${r.id} className="border-t border-white/10">
                <td className="py-2">${r.name || r.email}</td>
                <td className="py-2">${new Date(r.consumed_at + 'Z').toLocaleString('ro-RO')}</td>
                <td className="py-2">-${r.delta}</td>
              </tr>
            `)}
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

  const submitStock = async (e) => {
    e.preventDefault();
    await api('/api/admin/stock/init', { method: 'POST', token, body: stockForm });
    setMsg('Stoc actualizat.');
    onRefresh();
  };

  const submitUser = async (e) => {
    e.preventDefault();
    await api('/api/admin/users', { method: 'POST', token, body: userForm });
    setMsg('Utilizator creat.');
    setUserForm({ email: '', password: '', name: '', role: 'user', avatar_url: '' });
    onRefresh();
  };

  const exportCsv = () => {
    window.open(`${API_BASE}/api/admin/export.csv`, '_blank');
  };

  return html`
    <div className="card p-5 space-y-5">
      <h3 className="font-bold text-lg">Admin</h3>

      <form className="grid md:grid-cols-4 gap-3" onSubmit=${submitStock}>
        <input className="input" type="number" min="0" placeholder="stoc inițial" value=${stockForm.initial_stock} onChange=${(e) => setStockForm({ ...stockForm, initial_stock: Number(e.target.value) })} />
        <input className="input" type="number" min="0" placeholder="stoc curent" value=${stockForm.current_stock} onChange=${(e) => setStockForm({ ...stockForm, current_stock: Number(e.target.value) })} />
        <input className="input" type="number" min="0" placeholder="stoc minim" value=${stockForm.min_stock} onChange=${(e) => setStockForm({ ...stockForm, min_stock: Number(e.target.value) })} />
        <button className="btn btn-primary" type="submit">Setează stoc</button>
      </form>

      <form className="grid md:grid-cols-6 gap-3" onSubmit=${submitUser}>
        <input className="input" placeholder="nume" value=${userForm.name} onChange=${(e) => setUserForm({ ...userForm, name: e.target.value })} />
        <input className="input" type="email" placeholder="email" value=${userForm.email} onChange=${(e) => setUserForm({ ...userForm, email: e.target.value })} />
        <input className="input" type="password" placeholder="parolă" value=${userForm.password} onChange=${(e) => setUserForm({ ...userForm, password: e.target.value })} />
        <input className="input" placeholder="avatar url" value=${userForm.avatar_url} onChange=${(e) => setUserForm({ ...userForm, avatar_url: e.target.value })} />
        <select className="input" value=${userForm.role} onChange=${(e) => setUserForm({ ...userForm, role: e.target.value })}>
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
        <button className="btn btn-primary" type="submit">Adaugă user</button>
      </form>

      <div className="flex gap-3 items-center">
        <button className="btn btn-danger" onClick=${exportCsv}>Export CSV</button>
        <button className="btn" onClick=${onRefresh}>Refresh</button>
        ${msg ? html`<span className="text-green-300 text-sm">${msg}</span>` : null}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        ${users.map((u) => html`
          <div className="border border-white/10 rounded-xl p-3" key=${u.id}>
            <div className="flex items-center gap-3">
              <img src=${u.avatar_url || 'https://placehold.co/64x64?text=U'} className="w-10 h-10 rounded-full object-cover" />
              <div>
                <p className="font-bold">${u.name}</p>
                <p className="text-xs text-slate-300">${u.email}</p>
              </div>
            </div>
            <p className="text-xs mt-2">rol: ${u.role} • activ: ${u.active ? 'da' : 'nu'}</p>
          </div>
        `)}
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
      setStock(s.stock);
      setRows(h.rows || []);
      if (isAdmin) {
        const u = await api('/api/admin/users', { token });
        setUsers(u.users || []);
      }
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => { refresh(); }, [token, user?.role]);

  const consume = async () => {
    try {
      setError('');
      await api('/api/coffee/consume', { method: 'POST', token });
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  if (!user) {
    return html`<${Login} onLogin=${async (email, pass) => {
      try {
        setError('');
        await login(email, pass);
      } catch (e) {
        setError(e.message);
      }
    }} error=${error} />`;
  }

  return html`
    <main className="max-w-6xl mx-auto p-4 md:p-8 space-y-4">
      <header className="card p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src=${user.avatar_url || 'https://placehold.co/72x72?text=U'} className="w-12 h-12 rounded-full object-cover" />
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Cafea Office Dashboard</h1>
            <p className="text-slate-300">${user.name} • ${user.role}</p>
          </div>
        </div>
        <button className="btn" onClick=${logout}>Logout</button>
      </header>

      ${error ? html`<div className="card p-3 text-red-300">${error}</div>` : null}

      <section className="grid md:grid-cols-2 gap-4">
        <${StockCard} stock=${stock} onConsume=${consume} />
        <${HistoryTable} rows=${rows} title=${isAdmin ? 'Istoric complet consum' : 'Istoricul tău'} />
      </section>

      ${isAdmin ? html`<${AdminPanel} token=${token} users=${users} onRefresh=${refresh} />` : null}
    </main>
  `;
}

createRoot(document.getElementById('root')).render(html`<${App} />`);
