import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ShiftEditor from './pages/ShiftEditor';
import EmployeeManagement from './pages/EmployeeManagement';
import Settings from './pages/Settings';
import PreferenceForm from './pages/PreferenceForm';
import PreferenceSummary from './pages/PreferenceSummary';
import ShortageEmail from './pages/ShortageEmail';
import './App.css';

function AppContent() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [storeName, setStoreName] = useState<string | null>(localStorage.getItem('storeName'));
  const location = useLocation();

  const handleLogin = (newToken: string, name: string) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('storeName', name);
    setToken(newToken);
    setStoreName(name);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('storeName');
    setToken(null);
    setStoreName(null);
  };

  if (!token) {
    return (
      <Routes>
        <Route path="/prefer/:employeeId" element={<PreferenceForm />} />
        <Route path="*" element={<Login onLogin={handleLogin} />} />
      </Routes>
    );
  }

  const isPreferPage = location.pathname.startsWith('/prefer/');

  if (isPreferPage) {
    return (
      <Routes>
        <Route path="/prefer/:employeeId" element={<PreferenceForm />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
      <div className="app">
        <header className="app-header">
          <h1>南京亭 シフト表</h1>
          <div className="header-right">
            <span className="store-name">{storeName}</span>
            <button onClick={handleLogout} className="logout-btn">ログアウト</button>
          </div>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/shift/:periodId" element={<ShiftEditor />} />
            <Route path="/employees" element={<EmployeeManagement />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/prefer/:employeeId" element={<PreferenceForm />} />
            <Route path="/preferences/:periodId" element={<PreferenceSummary />} />
            <Route path="/qrcodes/:periodId" element={<PreferenceSummary showQRCodes={true} />} />
            <Route path="/shortage-email/:periodId" element={<ShortageEmail />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;