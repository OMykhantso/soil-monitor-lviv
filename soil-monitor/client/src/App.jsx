import { useState } from 'react';
import { NavLink, Navigate, Route, Routes, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import { ROLE } from './lib/constants.js';
import { THEMES, getTheme, saveTheme } from './lib/theme.js';
import LoginPage from './pages/LoginPage.jsx';
import MapPage from './pages/MapPage.jsx';
import LocationPage from './pages/LocationPage.jsx';
import LocationForm from './pages/LocationForm.jsx';
import MeasurementForm from './pages/MeasurementForm.jsx';
import AnalyticsPage from './pages/AnalyticsPage.jsx';
import MethodsPage from './pages/MethodsPage.jsx';
import FisPage from './pages/FisPage.jsx';
import UsersPage from './pages/UsersPage.jsx';

function Shell() {
  const { user, ready, logout, can } = useAuth();
  const [theme, setTheme] = useState(getTheme);
  if (!ready) return null;
  if (!user) return <LoginPage />;
  return (
    <div className="app">
      <header className="top">
        <Link to="/" className="brand">
          <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><rect x="1" y="1" width="28" height="28" rx="6" fill="none" stroke="currentColor" strokeWidth="1.6"/><path d="M5 11h20M5 16h20M5 21h20" stroke="currentColor" strokeWidth="1.2" opacity=".35"/><circle cx="19" cy="13" r="3.4" fill="var(--lv-high)"/></svg>
          <div><b>ҐрунтМонітор</b><small>Львівська область</small></div>
        </Link>
        <nav className="tabs">
          <NavLink to="/" end>Карта</NavLink>
          <NavLink to="/analytics">Аналітика</NavLink>
          <NavLink to="/fis">Нечітка модель</NavLink>
          {can('specialist') && <NavLink to="/methods">База знань</NavLink>}
          {can('specialist') && <NavLink to="/measurements/new">Внести дані</NavLink>}
          {can('admin') && <NavLink to="/admin/users">Користувачі</NavLink>}
        </nav>
        <div className="who"><span className="hide">{user.email}</span><span className="tag">{ROLE[user.role]}</span>
          <select className="in" style={{ width: 'auto', padding: '4px 6px' }} aria-label="Тема" value={theme}
            onChange={(e) => { saveTheme(e.target.value); setTheme(e.target.value); }}>
            {Object.entries(THEMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <button className="btn ghost small" onClick={logout}>Вийти</button></div>
      </header>
      <main key={theme}>
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/locations/new" element={can('specialist') ? <LocationForm /> : <Navigate to="/" />} />
          <Route path="/locations/:id/edit" element={can('specialist') ? <LocationForm /> : <Navigate to="/" />} />
          <Route path="/locations/:id" element={<LocationPage />} />
          <Route path="/measurements/new" element={can('specialist') ? <MeasurementForm /> : <Navigate to="/" />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/fis" element={<FisPage />} />
          <Route path="/methods" element={can('specialist') ? <MethodsPage /> : <Navigate to="/" />} />
          <Route path="/admin/users" element={can('admin') ? <UsersPage /> : <Navigate to="/" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return <AuthProvider><Shell /></AuthProvider>;
}
