import { useState, useEffect } from 'react';
import packageJson from '../package.json';
import { 
  BarChart3, 
  Clock, 
  FolderGit2, 
  Users, 
  Settings, 
  UserCheck, 
  FileSpreadsheet, 
  FileDown, 
  LogOut, 
  Sun, 
  Moon, 
  Lock 
} from 'lucide-react';

// View Components (to be created)
import DashboardView from './components/DashboardView';
import ReportingPanel from './components/ReportingPanel';
import OrdersView from './components/OrdersView';
import EmployeesView from './components/EmployeesView';
import DictionariesView from './components/DictionariesView';
import UsersView from './components/UsersView';
import ReportsView from './components/ReportsView';
import ImportsView from './components/ImportsView';

export interface UserSession {
  id: string;
  username: string;
  role: 'admin' | 'leader';
  fullName: string;
}

// Intercept all fetch requests globally to handle 401/403 errors
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  if (response.status === 401 || response.status === 403) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] as any).url;
    if (url && !url.includes('/api/auth/login')) {
      const event = new CustomEvent('auth-error', { detail: { status: response.status } });
      window.dispatchEvent(event);
    }
  }
  return response;
};

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<UserSession | null>(
    localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!) : null
  );
  const [theme, setTheme] = useState<'dark' | 'light'>(
    (localStorage.getItem('theme') as 'dark' | 'light') || 'dark'
  );
  const [currentTab, setCurrentTab] = useState<string>('reporting');
  
  // Login form state
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Listen for global auth errors (401/403)
  useEffect(() => {
    const handleAuthError = () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      setToken(null);
      setUser(null);
      setLoginError('Sesja wygasła, zaloguj się ponownie');
    };

    window.addEventListener('auth-error', handleAuthError);
    return () => window.removeEventListener('auth-error', handleAuthError);
  }, []);

  // Sync theme with body data-theme attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Set default tab based on user role on login
  useEffect(() => {
    if (user) {
      if (user.role === 'admin') {
        setCurrentTab('dashboard');
      } else {
        setCurrentTab('reporting');
      }
    }
  }, [user]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername || !loginPassword) {
      setLoginError('Wprowadź login i hasło');
      return;
    }

    setLoginError('');
    setIsLoggingIn(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Błąd logowania');
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      setToken(data.token);
      setUser(data.user);
      
      // Clear credentials
      setLoginUsername('');
      setLoginPassword('');
    } catch (err: any) {
      setLoginError(err.message || 'Niepoprawny login lub hasło');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  // Render Login Page if not authenticated
  if (!token || !user) {
    return (
      <div className="modal-overlay" style={{ background: 'var(--bg-primary)' }}>
        <div className="modal-content" style={{ maxWidth: '400px', padding: '2.5rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
            <span style={{ fontSize: '3rem' }}>⚙️</span>
            <h1 style={{ marginTop: '0.5rem', fontFamily: 'var(--font-header)', fontWeight: 800 }}>
              WARSZTAT
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              System Raportowania Czasu Pracy
            </p>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {loginError && (
              <div className="alert alert-danger" style={{ padding: '0.75rem', marginBottom: 0 }}>
                {loginError}
              </div>
            )}

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Login</label>
              <input
                type="text"
                className="form-control"
                value={loginUsername}
                onChange={e => setLoginUsername(e.target.value)}
                placeholder="np. admin"
                disabled={isLoggingIn}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Hasło</label>
              <input
                type="password"
                className="form-control"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isLoggingIn}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={isLoggingIn}>
              <Lock size={16} />
              {isLoggingIn ? 'Logowanie...' : 'Zaloguj się'}
            </button>
          </form>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button className="theme-toggle" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Wersja v{packageJson.version}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Define sidebar menu options based on role
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 size={18} />, roles: ['admin'] },
    { id: 'reporting', label: 'Raportowanie', icon: <Clock size={18} />, roles: ['admin', 'leader'] },
    { id: 'orders', label: 'Zlecenia', icon: <FolderGit2 size={18} />, roles: ['admin', 'leader'] },
    { id: 'employees', label: 'Pracownicy', icon: <Users size={18} />, roles: ['admin'] },
    { id: 'dictionaries', label: 'Słowniki', icon: <Settings size={18} />, roles: ['admin'] },
    { id: 'users', label: 'Użytkownicy', icon: <UserCheck size={18} />, roles: ['admin'] },
    { id: 'imports', label: 'Import danych', icon: <FileSpreadsheet size={18} />, roles: ['admin'] },
    { id: 'reports', label: 'Raporty', icon: <FileDown size={18} />, roles: ['admin', 'leader'] },
  ];

  const filteredMenuItems = menuItems.filter(item => item.roles.includes(user.role));

  const renderActiveTab = () => {
    switch (currentTab) {
      case 'dashboard':
        return <DashboardView token={token} />;
      case 'reporting':
        return <ReportingPanel token={token} user={user} />;
      case 'orders':
        return <OrdersView token={token} user={user} />;
      case 'employees':
        return <EmployeesView token={token} />;
      case 'dictionaries':
        return <DictionariesView token={token} />;
      case 'users':
        return <UsersView token={token} currentUser={user} />;
      case 'imports':
        return <ImportsView token={token} />;
      case 'reports':
        return <ReportsView token={token} user={user} />;
      default:
        return <ReportingPanel token={token} user={user} />;
    }
  };

  return (
    <div className="app-container">
      {/* Top Navbar */}
      <header className="navbar">
        <div className="navbar-brand">
          <span className="brand-logo">⚙️</span>
          <span className="brand-title">WARSZTAT</span>
        </div>

        <div className="navbar-actions">
          <button className="theme-toggle" onClick={toggleTheme} title="Przełącz motyw">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <div className="user-profile-badge">
            <span style={{ 
              width: '8px', 
              height: '8px', 
              borderRadius: '50%', 
              backgroundColor: user.role === 'admin' ? '#ef4444' : '#10b981' 
            }}></span>
            <span>{user.fullName} ({user.role === 'admin' ? 'Admin' : 'Leader'})</span>
          </div>

          <button className="btn btn-secondary btn-sm" onClick={handleLogout} title="Wyloguj się">
            <LogOut size={16} />
            <span className="hide-mobile">Wyloguj</span>
          </button>
        </div>
      </header>

      {/* Main Layout Area */}
      <div className="main-layout">
        {/* Sidebar Menu */}
        <aside className="sidebar">
          <nav className="nav-links">
            {filteredMenuItems.map(item => (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                className={`nav-item ${currentTab === item.id ? 'active' : ''}`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div style={{ marginTop: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            System Ewidencji Czasu Pracy v{packageJson.version}
          </div>
        </aside>

        {/* Content Area */}
        <main style={{ flex: 1, backgroundColor: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>
          <div className="content-wrapper">
            {renderActiveTab()}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
