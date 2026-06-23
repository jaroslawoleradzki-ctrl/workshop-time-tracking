import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Plus, 
  Edit2, 
  Trash2, 
  Search, 
  X, 
  UserCheck, 
  UserMinus2
} from 'lucide-react';

interface Employee {
  id: string;
  fullName: string;
  isActive: boolean;
  createdAt: string;
}

interface EmployeesViewProps {
  token: string;
}

export default function EmployeesView({ token }: EmployeesViewProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Form states
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [formValidationError, setFormValidationError] = useState('');

  useEffect(() => {
    fetchEmployees();
  }, [token]);

  const fetchEmployees = async () => {
    try {
      const res = await fetch('/api/employees', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Nie udało się pobrać listy pracowników');
      const data = await res.json();
      setEmployees(data);
    } catch (err: any) {
      setError(err.message || 'Błąd ładowania pracowników');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingEmployeeId(null);
    setFullName('');
    setIsActive(true);
    setFormValidationError('');
    setShowFormModal(true);
  };

  const handleOpenEditModal = (emp: Employee) => {
    setEditingEmployeeId(emp.id);
    setFullName(emp.fullName);
    setIsActive(emp.isActive);
    setFormValidationError('');
    setShowFormModal(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormValidationError('');

    if (!fullName) {
      setFormValidationError('Imię i nazwisko jest wymagane.');
      return;
    }

    try {
      const url = editingEmployeeId ? `/api/employees/${editingEmployeeId}` : '/api/employees';
      const method = editingEmployeeId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          fullName: fullName.trim(),
          isActive
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Błąd zapisu danych pracownika');
      }

      setShowFormModal(false);
      fetchEmployees();
    } catch (err: any) {
      setFormValidationError(err.message || 'Wystąpił błąd.');
    }
  };

  const handleDeleteEmployee = async (id: string, name: string) => {
    if (!confirm(`Czy na pewno chcesz usunąć pracownika ${name}? \nCzas pracy tego pracownika nie zostanie usunięty (soft delete).`)) return;

    try {
      const res = await fetch(`/api/employees/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      fetchEmployees();
    } catch (err) {
      alert('Nie udało się usunąć pracownika.');
    }
  };

  const filteredEmployees = employees.filter(e => 
    e.fullName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      {/* Create/Edit Form Modal */}
      {showFormModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '450px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <h3 className="modal-header" style={{ margin: 0 }}>
                {editingEmployeeId ? 'Edycja Pracownika' : 'Nowy Pracownik'}
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
                <label className="form-label">Imię i nazwisko pracownika</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="np. Nowak Jan"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                <input
                  type="checkbox"
                  id="isActive"
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  checked={isActive}
                  onChange={e => setIsActive(e.target.checked)}
                />
                <label htmlFor="isActive" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>
                  Pracownik aktywny (widoczny w panelu raportowania)
                </label>
              </div>

              <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowFormModal(false)}>
                  Anuluj
                </button>
                <button type="submit" className="btn btn-primary">
                  Zapisz pracownika
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Header bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem' }}>
        <h2 style={{ fontFamily: 'var(--font-header)', fontSize: '1.8rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Users size={28} />
          Baza Pracowników
        </h2>

        <button className="btn btn-primary" onClick={handleOpenCreateModal}>
          <Plus size={16} />
          Dodaj pracownika
        </button>
      </div>

      {/* Filter and search bar */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', position: 'relative' }}>
          <Search size={18} style={{ color: 'var(--text-muted)', position: 'absolute', left: '12px' }} />
          <input
            type="text"
            className="form-control"
            style={{ paddingLeft: '38px' }}
            placeholder="Szukaj pracownika po imieniu i nazwisku..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <div>Ładowanie bazy pracowników...</div>
        </div>
      ) : error ? (
        <div className="alert alert-danger">{error}</div>
      ) : filteredEmployees.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          Brak pracowników spełniających kryteria.
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Imię i nazwisko</th>
                <th>Data utworzenia konta</th>
                <th style={{ textAlign: 'center' }}>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map(emp => (
                <tr key={emp.id}>
                  <td>
                    {emp.isActive ? (
                      <span className="badge badge-open" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        <UserCheck size={12} />
                        Aktywny
                      </span>
                    ) : (
                      <span className="badge badge-suspended" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        <UserMinus2 size={12} />
                        Nieaktywny
                      </span>
                    )}
                  </td>
                  <td style={{ fontWeight: 'bold', fontSize: '1rem' }}>{emp.fullName}</td>
                  <td>{new Date(emp.createdAt).toLocaleDateString('pl-PL', { year: 'numeric', month: '2-digit', day: '2-digit' })}</td>
                  <td>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                      <button 
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.25rem 0.5rem' }}
                        onClick={() => handleOpenEditModal(emp)}
                      >
                        <Edit2 size={12} />
                        Edytuj
                      </button>
                      <button 
                        className="btn btn-danger btn-sm"
                        style={{ padding: '0.25rem 0.5rem', backgroundColor: 'transparent', color: 'var(--danger-color)', borderColor: 'var(--danger-border)' }}
                        onClick={() => handleDeleteEmployee(emp.id, emp.fullName)}
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
