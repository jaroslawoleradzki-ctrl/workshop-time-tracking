import { useState, useEffect } from 'react';
import { 
  UserCheck, 
  Plus, 
  Edit2, 
  X, 
  KeyRound,
  ShieldCheck
} from 'lucide-react';
import { UserSession } from '../App';

interface SystemUser {
  id: string;
  username: string;
  fullName: string;
  role: 'admin' | 'leader';
  isActive: boolean;
  createdAt: string;
}

interface UsersViewProps {
  token: string;
  currentUser: UserSession;
}

export default function UsersView({ token, currentUser }: UsersViewProps) {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form states
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'leader'>('leader');
  const [isActive, setIsActive] = useState(true);
  const [formValidationError, setFormValidationError] = useState('');

  // Password reset state
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetUserName, setResetUserName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetValidationError, setResetValidationError] = useState('');

  useEffect(() => {
    fetchUsers();
  }, [token]);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Błąd ładowania użytkowników');
      const data = await res.json();
      setUsers(data);
    } catch (err: any) {
      setError(err.message || 'Błąd wczytywania użytkowników');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingUserId(null);
    setUsername('');
    setFullName('');
    setPassword('');
    setRole('leader');
    setIsActive(true);
    setFormValidationError('');
    setShowFormModal(true);
  };

  const handleOpenEditModal = (u: SystemUser) => {
    setEditingUserId(u.id);
    setUsername(u.username);
    setFullName(u.fullName);
    setPassword('');
    setRole(u.role);
    setIsActive(u.isActive);
    setFormValidationError('');
    setShowFormModal(true);
  };

  const handleOpenResetModal = (u: SystemUser) => {
    setResetUserId(u.id);
    setResetUserName(u.fullName);
    setNewPassword('');
    setResetValidationError('');
    setShowResetModal(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormValidationError('');

    if (!fullName || !role || (!editingUserId && (!username || !password))) {
      setFormValidationError('Wszystkie pola są wymagane.');
      return;
    }

    try {
      const url = editingUserId ? `/api/users/${editingUserId}` : '/api/users';
      const method = editingUserId ? 'PUT' : 'POST';

      const body = editingUserId 
        ? { fullName: fullName.trim(), role, isActive }
        : { username: username.trim(), password, fullName: fullName.trim(), role };

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Błąd zapisu konta użytkownika');
      }

      setShowFormModal(false);
      fetchUsers();
    } catch (err: any) {
      setFormValidationError(err.message || 'Wystąpił błąd.');
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetValidationError('');

    if (!newPassword) {
      setResetValidationError('Wpisz nowe hasło.');
      return;
    }

    try {
      const res = await fetch(`/api/users/${resetUserId}/reset-password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password: newPassword })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Błąd resetowania hasła');
      }

      setShowResetModal(false);
      alert('Hasło zostało pomyślnie zresetowane.');
    } catch (err: any) {
      setResetValidationError(err.message || 'Wystąpił błąd.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Create/Edit User Form Modal */}
      {showFormModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <h3 className="modal-header" style={{ margin: 0 }}>
                {editingUserId ? 'Edycja Użytkownika' : 'Nowe Konto Użytkownika'}
              </h3>
              <button className="theme-toggle" onClick={() => setShowFormModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleFormSubmit}>
              {formValidationError && (
                <div className="alert alert-danger" style={{ padding: '0.75rem', fontSize: '0.85rem' }}>
                  {formValidationError}
                </div>
              )}

              {/* Login field is disabled on update */}
              <div className="form-group">
                <label className="form-label">Login (identyfikator)</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="np. jkowalski"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  disabled={editingUserId !== null}
                />
              </div>

              {!editingUserId && (
                <div className="form-group">
                  <label className="form-label">Hasło startowe</label>
                  <input
                    type="password"
                    className="form-control"
                    placeholder="Wpisz bezpieczne hasło..."
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Imię i nazwisko użytkownika</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="np. Jan Kowalski"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Rola w systemie</label>
                <select
                  className="form-control"
                  value={role}
                  onChange={e => setRole(e.target.value as any)}
                  disabled={editingUserId === currentUser.id} // Cannot demote self
                >
                  <option value="leader">Leader (raportowanie czasu pracy, zlecenia, raporty)</option>
                  <option value="admin">Administrator (pełny dostęp do systemu)</option>
                </select>
              </div>

              {editingUserId && (
                <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="isActiveUser"
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    checked={isActive}
                    onChange={e => setIsActive(e.target.checked)}
                    disabled={editingUserId === currentUser.id} // Cannot lock out self
                  />
                  <label htmlFor="isActiveUser" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>
                    Konto aktywne (umożliwia logowanie)
                  </label>
                </div>
              )}

              <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowFormModal(false)}>
                  Anuluj
                </button>
                <button type="submit" className="btn btn-primary">
                  Zapisz użytkownika
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <h3 className="modal-header" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <KeyRound size={20} />
                Reset Hasła
              </h3>
              <button className="theme-toggle" onClick={() => setShowResetModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleResetPasswordSubmit}>
              {resetValidationError && (
                <div className="alert alert-danger" style={{ padding: '0.75rem', fontSize: '0.85rem' }}>
                  {resetValidationError}
                </div>
              )}

              <p style={{ fontSize: '0.9rem' }}>
                Resetujesz hasło dla użytkownika: <strong style={{ color: 'var(--primary-color)' }}>{resetUserName}</strong>
              </p>

              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label className="form-label">Nowe hasło</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="Wpisz nowe hasło..."
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowResetModal(false)}>
                  Anuluj
                </button>
                <button type="submit" className="btn btn-primary">
                  Zatwierdź nowe hasło
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tytuł */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', flexShrink: 0 }}>
        <UserCheck size={28} />
        <h2 style={{ fontFamily: 'var(--font-header)', fontSize: '1.8rem', margin: 0 }}>
          Użytkownicy Systemu
        </h2>
      </div>

      {/* Główna akcja */}
      <div style={{ marginBottom: '1rem', flexShrink: 0 }}>
        <button className="btn btn-primary" onClick={handleOpenCreateModal}>
          <Plus size={16} />
          Utwórz konto
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <div>Ładowanie kont użytkowników...</div>
        </div>
      ) : error ? (
        <div className="alert alert-danger">{error}</div>
      ) : (
        <div className="table-container-fixed">
          <table className="table-fixed">
            <thead>
              <tr>
                <th>Status</th>
                <th>Login (Username)</th>
                <th>Imię i nazwisko</th>
                <th>Rola w systemie</th>
                <th style={{ textAlign: 'center' }}>Zabezpieczenia</th>
                <th style={{ textAlign: 'center' }}>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ 
                  opacity: u.isActive ? 1 : 0.6 
                }}>
                  <td>
                    {u.isActive ? (
                      <span className="badge badge-open">Aktywny</span>
                    ) : (
                      <span className="badge badge-suspended">Zablokowany</span>
                    )}
                  </td>
                  <td style={{ fontWeight: 'bold' }}>{u.username}</td>
                  <td>{u.fullName} {u.id === currentUser.id && <span style={{ color: 'var(--primary-color)', fontSize: '0.8rem' }}>(To Ty)</span>}</td>
                  <td>
                    {u.role === 'admin' ? (
                      <span className="badge badge-open" style={{ borderColor: 'var(--danger-border)', color: 'var(--danger-color)', backgroundColor: 'var(--danger-bg)' }}>
                        Administrator
                      </span>
                    ) : (
                      <span className="badge badge-open" style={{ borderColor: 'var(--success-border)', color: 'var(--success-color)', backgroundColor: 'var(--success-bg)' }}>
                        Leader
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {u.role === 'admin' ? (
                      <span style={{ color: 'var(--success-color)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.8rem', fontWeight: 600 }}>
                        <ShieldCheck size={14} />
                        Pełne
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Standardowe</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                      <button 
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.25rem 0.5rem' }}
                        onClick={() => handleOpenEditModal(u)}
                      >
                        <Edit2 size={12} />
                        Modyfikuj
                      </button>
                      <button 
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.25rem 0.5rem', backgroundColor: 'var(--bg-tertiary)' }}
                        onClick={() => handleOpenResetModal(u)}
                      >
                        <KeyRound size={12} />
                        Hasło
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
