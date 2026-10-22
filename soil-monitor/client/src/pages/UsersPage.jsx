import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { ROLE } from '../lib/constants.js';
import { ErrorText, Loading } from '../components/ui.jsx';

export default function UsersPage() {
  const [list, setList] = useState(null);
  const [d, setD] = useState({ email: '', full_name: '', password: '', role: 'specialist' });
  const [error, setError] = useState(null);
  const load = () => api.users().then(setList).catch(setError);
  useEffect(() => { load(); }, []);
  const submit = (e) => { e.preventDefault(); setError(null); api.createUser(d).then(() => { setD({ email: '', full_name: '', password: '', role: 'specialist' }); load(); }).catch(setError); };
  return (
    <div className="stack">
      <h1 className="pg">Користувачі</h1>
      <div className="card tbl">
        {!list ? <Loading /> : (
          <table className="t"><thead><tr><th>Email</th><th>Ім’я</th><th>Роль</th><th>Активний</th></tr></thead>
            <tbody>{list.map((u) => (
              <tr key={u.id}><td>{u.email}</td><td>{u.full_name || '—'}</td>
                <td><select id={`role-${u.id}`} className="in" value={u.role} onChange={(e) => api.updateUser(u.id, { role: e.target.value }).then(load).catch(setError)}>
                  {Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                <td><input id={`active-${u.id}`} type="checkbox" checked={u.is_active} onChange={(e) => api.updateUser(u.id, { is_active: e.target.checked }).then(load).catch(setError)} /></td></tr>
            ))}</tbody></table>
        )}
      </div>
      <form className="card stack" onSubmit={submit}>
        <h2>Новий користувач</h2>
        <div className="form-grid">
          <label className="f"><span>Email</span><input id="u-email" className="in" type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} required /></label>
          <label className="f"><span>Ім’я</span><input id="u-name" className="in" value={d.full_name} onChange={(e) => setD({ ...d, full_name: e.target.value })} /></label>
          <label className="f"><span>Пароль (≥ 8)</span><input id="u-pass" className="in" type="password" value={d.password} onChange={(e) => setD({ ...d, password: e.target.value })} required minLength={8} /></label>
          <label className="f"><span>Роль</span><select id="u-role" className="in" value={d.role} onChange={(e) => setD({ ...d, role: e.target.value })}>{Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        </div>
        <ErrorText error={error} />
        <div><button className="btn">Створити</button></div>
      </form>
    </div>
  );
}
