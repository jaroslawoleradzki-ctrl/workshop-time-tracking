import { useState, useEffect, useRef } from 'react';
import { 
  BarChart3, 
  Clock, 
  FolderGit2, 
  Users, 
  Settings, 
  FileDown, 
  LogOut, 
  Sun, 
  Moon, 
  Lock,
  ChevronDown,
  CalendarDays
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
import CompanyCalendarView from './components/CompanyCalendarView';

export interface UserSession {
  id: string;
  username: string;
  role: 'admin' | 'leader' | 'employee';
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
  const [currentTab, setCurrentTab] = useState<string>(() => {
    return sessionStorage.getItem('current_tab') || 'reporting';
  });
  
  // Login form state
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // App version state
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const initialVersionRef = useRef<string | null>(null);
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(() => {
    return sessionStorage.getItem('sidebar_admin_open') === 'true';
  });

  // Helper to clear all application-specific storage keys
  const clearApplicationStorage = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('current_tab');
    sessionStorage.removeItem('sidebar_admin_open');
  };

  // Fetch app version on mount
  useEffect(() => {
    fetch('/api/version')
      .then(res => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then(data => {
        const ver = data.version || null;
        setAppVersion(ver);
        if (!initialVersionRef.current && ver) {
          initialVersionRef.current = ver;
        }
      })
      .catch(() => {
        setAppVersion('error');
      });
  }, []);

  // Poll version periodically to check for updates
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      fetch('/api/version')
        .then(res => {
          if (!res.ok) throw new Error();
          return res.json();
        })
        .then(data => {
          const latestVer = data.version || null;
          if (latestVer && initialVersionRef.current && latestVer !== initialVersionRef.current) {
            clearInterval(interval);
            clearApplicationStorage();
            setToken(null);
            setUser(null);
            setCurrentTab('reporting');
            setLoginError('Aplikacja została zaktualizowana. Zaloguj się ponownie.');
          }
        })
        .catch(err => {
          console.warn('Błąd sprawdzania wersji:', err);
        });
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [user]);

  // Listen for global auth errors (401/403)
  useEffect(() => {
    const handleAuthError = () => {
      clearApplicationStorage();
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

  // Save currentTab to sessionStorage and auto-expand Administracja submenu if active page is inside it
  useEffect(() => {
    sessionStorage.setItem('current_tab', currentTab);
    if (['users', 'dictionaries', 'imports', 'calendar'].includes(currentTab)) {
      setIsAdminOpen(true);
    }
  }, [currentTab]);

  // Set default tab based on user role on login
  useEffect(() => {
    if (user) {
      if (!sessionStorage.getItem('current_tab')) {
        if (user.role === 'admin') {
          setCurrentTab('dashboard');
        } else {
          setCurrentTab('reporting');
        }
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
    clearApplicationStorage();
    setToken(null);
    setUser(null);
  };

  // Render Login Page if not authenticated
  if (!token || !user) {
    return (
      <div className="modal-overlay" style={{ background: 'var(--bg-primary)' }}>
        <div className="modal-content" style={{ maxWidth: '400px', padding: '2.5rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <img src="/pv-logo.png" alt="P.V. Logo" className="login-logo" />
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
              {appVersion === 'error' ? 'Wersja systemu niedostępna' : (appVersion ? `Wersja systemu v${appVersion}` : '')}
            </span>
          </div>
        </div>
      </div>
    );
  }



  const renderActiveTab = () => {
    switch (currentTab) {
      case 'dashboard':
        return <DashboardView token={token} />;
      case 'reporting':
        return <ReportingPanel token={token} user={user} />;
      case 'orders':
        if (user.role !== 'admin' && user.role !== 'leader') {
          return <ReportingPanel token={token} user={user} />;
        }
        return <OrdersView token={token} user={user} />;
      case 'employees':
        return <EmployeesView token={token} />;
      case 'dictionaries':
        return <DictionariesView token={token} />;
      case 'users':
        return <UsersView token={token} currentUser={user} />;
      case 'imports':
        return <ImportsView token={token} />;
      case 'calendar':
        return user.role === 'admin' ? <CompanyCalendarView token={token} /> : <ReportingPanel token={token} user={user} />;
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
          <img src="/pv-logo.png" alt="P.V. Logo" className="brand-logo" />
          <span className="brand-title">WARSZTAT</span>
        </div>

        <div className="navbar-actions">
          <button className="theme-toggle" onClick={toggleTheme} title="Przełącz motyw">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)', marginRight: '0.5rem' }}>
            <span>{user.fullName} / {user.role === 'admin' ? 'Administrator' : 'Leader'}</span>
          </div>

          <button className="btn btn-danger btn-sm" onClick={handleLogout} title="Wyloguj się" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <LogOut size={16} />
            <span>Wyloguj</span>
          </button>
        </div>
      </header>

      {/* Main Layout Area */}
      <div className="main-layout">
        {/* Sidebar Menu */}
        <aside className="sidebar">
          <nav className="nav-links">
            {user.role === 'leader' ? (
              <>
                <button
                  onClick={() => setCurrentTab('orders')}
                  className={`nav-item ${currentTab === 'orders' ? 'active' : ''}`}
                >
                  <FolderGit2 size={18} />
                  <span>Zlecenia</span>
                </button>
                <button
                  onClick={() => setCurrentTab('reporting')}
                  className={`nav-item ${currentTab === 'reporting' ? 'active' : ''}`}
                >
                  <Clock size={18} />
                  <span>Raportowanie</span>
                </button>
                <button
                  onClick={() => setCurrentTab('reports')}
                  className={`nav-item ${currentTab === 'reports' ? 'active' : ''}`}
                >
                  <FileDown size={18} />
                  <span>Raporty</span>
                </button>
              </>
            ) : user.role === 'admin' ? (
              <>
                {/* Robocza (Workspace) Section */}
                <button
                  onClick={() => setCurrentTab('dashboard')}
                  className={`nav-item ${currentTab === 'dashboard' ? 'active' : ''}`}
                >
                  <BarChart3 size={18} />
                  <span>Dashboard</span>
                </button>
                <button
                  onClick={() => setCurrentTab('orders')}
                  className={`nav-item ${currentTab === 'orders' ? 'active' : ''}`}
                >
                  <FolderGit2 size={18} />
                  <span>Zlecenia</span>
                </button>
                <button
                  onClick={() => setCurrentTab('reporting')}
                  className={`nav-item ${currentTab === 'reporting' ? 'active' : ''}`}
                >
                  <Clock size={18} />
                  <span>Raportowanie</span>
                </button>
                <button
                  onClick={() => setCurrentTab('reports')}
                  className={`nav-item ${currentTab === 'reports' ? 'active' : ''}`}
                >
                  <FileDown size={18} />
                  <span>Raporty</span>
                </button>

                {/* Divider separating Workspace from Administration */}
                <div className="sidebar-divider"></div>

                {/* Administracja Section */}
                <button
                  onClick={() => setCurrentTab('employees')}
                  className={`nav-item ${currentTab === 'employees' ? 'active' : ''}`}
                >
                  <Users size={18} />
                  <span>Pracownicy</span>
                </button>

                {/* Collapsible Administracja parent */}
                <button
                  onClick={() => {
                    setIsAdminOpen(prev => {
                      const next = !prev;
                      sessionStorage.setItem('sidebar_admin_open', String(next));
                      return next;
                    });
                  }}
                  className={`nav-item ${['users', 'dictionaries', 'imports', 'calendar'].includes(currentTab) ? 'parent-active' : ''}`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Settings size={18} />
                    <span>Administracja</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <ChevronDown size={16} className={`nav-chevron ${isAdminOpen ? 'open' : ''}`} />
                  </div>
                </button>

                {/* Submenu wrapper with collapse/expand CSS transition */}
                <div className={`sidebar-submenu-wrapper ${isAdminOpen ? 'open' : ''}`}>
                  <div className="sidebar-submenu">
                    <button
                      onClick={() => setCurrentTab('users')}
                      className={`nav-submenu-item ${currentTab === 'users' ? 'active' : ''}`}
                    >
                      <span className="bullet">•</span>
                      <span>Użytkownicy</span>
                    </button>
                    <button
                      onClick={() => setCurrentTab('dictionaries')}
                      className={`nav-submenu-item ${currentTab === 'dictionaries' ? 'active' : ''}`}
                    >
                      <span className="bullet">•</span>
                      <span>Słowniki</span>
                    </button>
                    <button
                      onClick={() => setCurrentTab('calendar')}
                      className={`nav-submenu-item ${currentTab === 'calendar' ? 'active' : ''}`}
                    >
                      <CalendarDays size={15} />
                      <span>Kalendarz zakładowy</span>
                    </button>
                    <button
                      onClick={() => setCurrentTab('imports')}
                      className={`nav-submenu-item ${currentTab === 'imports' ? 'active' : ''}`}
                    >
                      <span className="bullet">•</span>
                      <span>Import danych</span>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={() => setCurrentTab('reporting')}
                  className={`nav-item ${currentTab === 'reporting' ? 'active' : ''}`}
                >
                  <Clock size={18} />
                  <span>Raportowanie</span>
                </button>
                <button
                  onClick={() => setCurrentTab('reports')}
                  className={`nav-item ${currentTab === 'reports' ? 'active' : ''}`}
                >
                  <FileDown size={18} />
                  <span>Raporty</span>
                </button>
              </>
            )}
          </nav>

          {/* Sidebar Footer */}
          <div className="sidebar-footer">
            <div className="sidebar-version-section">
              <span className="sidebar-version-label">Wersja systemu</span>
              <span className="sidebar-version-value">
                {appVersion === 'error' ? 'niedostępna' : (appVersion ? `v${appVersion}` : '')}
              </span>
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <main className="main-content">
          <div className={`content-wrapper ${['orders', 'employees', 'users', 'dictionaries', 'imports', 'calendar', 'reports'].includes(currentTab) ? 'orders-tab-wrapper' : ''}`}>
            {renderActiveTab()}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
