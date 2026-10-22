import { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { ErrorText } from '../components/ui.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { await login(email, password); } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return (
    <form className="card login" onSubmit={submit}>
      <h1 className="pg">ҐрунтМонітор Львівщини</h1>
      <p className="sub">Інформаційна система моніторингу забруднення ґрунтів з нечітким оцінюванням і AI-підтримкою рішень.</p>
      <label className="f"><span>Email</span><input id="email" className="in" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></label>
      <label className="f"><span>Пароль</span><input id="password" className="in" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></label>
      <ErrorText error={error} />
      <button className="btn" disabled={busy}>{busy ? 'Вхід…' : 'Увійти'}</button>
    </form>
  );
}
