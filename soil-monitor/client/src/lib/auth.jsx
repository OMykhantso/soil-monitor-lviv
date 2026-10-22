import { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!getToken()) { setReady(true); return; }
    api.me().then((r) => setUser(r.user)).catch(() => setToken(null)).finally(() => setReady(true));
    const out = () => setUser(null);
    window.addEventListener('auth:logout', out);
    return () => window.removeEventListener('auth:logout', out);
  }, []);
  const login = async (email, password) => { const r = await api.login(email, password); setToken(r.token); setUser(r.user); };
  const logout = () => { setToken(null); setUser(null); };
  const can = (role) => ({ viewer: 1, specialist: 2, admin: 3 }[user?.role] >= { viewer: 1, specialist: 2, admin: 3 }[role]);
  return <AuthCtx.Provider value={{ user, ready, login, logout, can }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
