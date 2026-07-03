import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Plus, 
  Edit2, 
  Trash2, 
  X,
  ShieldAlert
} from 'lucide-react';

interface WorkTimeType {
  code: string;
  name: string;
  requiresOrder: boolean;
  isSystem: boolean;
}

interface DictionariesViewProps {
  token: string;
}

export default function DictionariesView({ token }: DictionariesViewProps) {
  const [types, setTypes] = useState<WorkTimeType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form states
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [requiresOrder, setRequiresOrder] = useState(false);
  const [formValidationError, setFormValidationError] = useState('');

  useEffect(() => {
    fetchTypes();
  }, [token]);

  const fetchTypes = async () => {
    try {
      const res = await fetch('/api/work-time-types', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Nie udało się wczytać słownika typów czasu pracy');
      const data = await res.json();
      setTypes(data);
    } catch (err: any) {
      setError(err.message || 'Błąd ładowania słownika');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingCode(null);
    setCode('');
    setName('');
    setRequiresOrder(false);
    setFormValidationError('');
    setShowFormModal(true);
  };

  const handleOpenEditModal = (t: WorkTimeType) => {
    setEditingCode(t.code);
    setCode(t.code);
    setName(t.name);
    setRequiresOrder(t.requiresOrder);
    setFormValidationError('');
    setShowFormModal(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormValidationError('');

    if (!code || !name) {
      setFormValidationError('Wszystkie pola są wymagane.');
      return;
    }

    try {
      const url = editingCode ? `/api/work-time-types/${editingCode}` : '/api/work-time-types';
      const method = editingCode ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          requiresOrder
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Błąd zapisu słownika');
      }

      setShowFormModal(false);
      fetchTypes();
    } catch (err: any) {
      setFormValidationError(err.message || 'Wystąpił błąd.');
    }
  };

  const handleDeleteType = async (itemCode: string, isSystem: boolean) => {
    if (isSystem) {
      alert('Pozycje słownika systemowego nie mogą być usuwane.');
      return;
    }

    if (!confirm(`Czy na pewno chcesz usunąć typ czasu pracy '${itemCode}'? \nZlecenie powiązane z tym kodem nie zostanie usunięte.`)) return;

    try {
      const res = await fetch(`/api/work-time-types/${itemCode}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Błąd usuwania');
      fetchTypes();
    } catch (err: any) {
      alert(err.message || 'Nie udało się usunąć typu.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Create/Edit Form Modal */}
      {showFormModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '450px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <h3 className="modal-header" style={{ margin: 0 }}>
                {editingCode ? 'Edycja Rodzaju Czasu Pracy' : 'Nowy Rodzaj Czasu Pracy'}
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

              <div className="form-group">
                <label className="form-label">Kod rodzaju czasu pracy</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="np. NDR2"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  disabled={editingCode !== null} // Lock code editing
                  style={{ textTransform: 'uppercase' }}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label">Pełna nazwa</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="np. Nadgodziny nocne"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>

              {/* requiresOrder is locked for system codes to prevent workflow breaking */}
              {(!editingCode || !(Array.isArray(types) ? types : []).find(t => t.code === editingCode)?.isSystem) ? (
                <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="requiresOrder"
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    checked={requiresOrder}
                    onChange={e => setRequiresOrder(e.target.checked)}
                  />
                  <label htmlFor="requiresOrder" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>
                    Wymaga podania zlecenia produkcyjnego
                  </label>
                </div>
              ) : (
                <div style={{ 
                  marginTop: '0.75rem', 
                  padding: '0.75rem', 
                  backgroundColor: 'var(--bg-tertiary)', 
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)'
                }}>
                  <ShieldAlert size={16} style={{ color: 'var(--warning-color)' }} />
                  Dla kodów systemowych parametry wymagalności zlecenia są zablokowane.
                </div>
              )}

              <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowFormModal(false)}>
                  Anuluj
                </button>
                <button type="submit" className="btn btn-primary">
                  Zapisz pozycję
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tytuł */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', flexShrink: 0 }}>
        <Settings size={28} />
        <h2 style={{ fontFamily: 'var(--font-header)', fontSize: '1.8rem', margin: 0 }}>
          Słownik Rodzajów Czasu Pracy
        </h2>
      </div>

      {/* Główna akcja */}
      <div style={{ marginBottom: '1rem', flexShrink: 0 }}>
        <button className="btn btn-primary" onClick={handleOpenCreateModal}>
          <Plus size={16} />
          Dodaj nowy kod
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <div>Ładowanie słowników...</div>
        </div>
      ) : error ? (
        <div className="alert alert-danger">{error}</div>
      ) : (
        <div className="table-container-fixed">
          <table className="table-fixed">
            <thead>
              <tr>
                <th>Kod</th>
                <th>Pełna nazwa</th>
                <th>Zlecenie produkcyjne</th>
                <th>Typ słownika</th>
                <th style={{ textAlign: 'center' }}>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {types.map(t => (
                <tr key={t.code}>
                  <td style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                    <code style={{ 
                      backgroundColor: 'var(--bg-tertiary)', 
                      padding: '0.2rem 0.5rem', 
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)'
                    }}>
                      {t.code}
                    </code>
                  </td>
                  <td style={{ fontWeight: 500 }}>{t.name}</td>
                  <td>
                    {t.requiresOrder ? (
                      <span className="badge badge-suspended">Wymagane</span>
                    ) : (
                      <span className="badge badge-open" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)', borderColor: 'var(--border-color)' }}>
                        Niewymagane
                      </span>
                    )}
                  </td>
                  <td>
                    {t.isSystem ? (
                      <span className="badge badge-open" style={{ borderColor: 'var(--primary-glow)', backgroundColor: 'var(--primary-glow)', color: 'var(--border-focus)' }}>
                        Systemowy
                      </span>
                    ) : (
                      <span className="badge badge-closed">Własny</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                      <button 
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.25rem 0.5rem' }}
                        onClick={() => handleOpenEditModal(t)}
                      >
                        <Edit2 size={12} />
                        Edytuj
                      </button>
                      <button 
                        className="btn btn-danger btn-sm"
                        style={{ 
                          padding: '0.25rem 0.5rem', 
                          backgroundColor: 'transparent', 
                          color: t.isSystem ? 'var(--text-muted)' : 'var(--danger-color)', 
                          borderColor: t.isSystem ? 'var(--border-color)' : 'var(--danger-border)',
                          cursor: t.isSystem ? 'not-allowed' : 'pointer'
                        }}
                        disabled={t.isSystem}
                        onClick={() => handleDeleteType(t.code, t.isSystem)}
                        title={t.isSystem ? 'Kody systemowe nie mogą być usuwane' : 'Usuń kod'}
                      >
                        <Trash2 size={12} />
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
