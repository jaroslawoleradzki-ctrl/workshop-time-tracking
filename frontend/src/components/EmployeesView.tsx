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
  firstName?: string | null;
  lastName?: string | null;
  employeeNumber?: string | null;
  isActive: boolean;
  createdAt: string;
}

interface EmployeesViewProps {
  token: string;
}

export function getEmployeeDisplayNames(emp: Employee) {
  let displayFirstName = emp.firstName || '';
  let displayLastName = emp.lastName || '';

  if (!displayFirstName && !displayLastName && emp.fullName) {
    const cleanFullName = emp.fullName.trim();
    const lastSpaceIdx = cleanFullName.lastIndexOf(' ');
    if (lastSpaceIdx > 0) {
      displayFirstName = cleanFullName.substring(0, lastSpaceIdx).trim();
      displayLastName = cleanFullName.substring(lastSpaceIdx + 1).trim();
    } else {
      displayFirstName = '-';
      displayLastName = cleanFullName;
    }
  }
  return { displayFirstName, displayLastName };
}

export default function EmployeesView({ token }: EmployeesViewProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Form states
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [employeeNumber, setEmployeeNumber] = useState('');
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
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Nie udało się pobrać listy pracowników');
      }
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
    setFirstName('');
    setLastName('');
    setEmployeeNumber('');
    setIsActive(true);
    setFormValidationError('');
    setShowFormModal(true);
  };

  const handleOpenEditModal = (emp: Employee) => {
    setEditingEmployeeId(emp.id);
    setEmployeeNumber(emp.employeeNumber || '');
    setIsActive(emp.isActive);
    setFormValidationError('');

    let derivedFirstName = emp.firstName || '';
    let derivedLastName = emp.lastName || '';

    if (!derivedFirstName && !derivedLastName && emp.fullName) {
      const cleanFullName = emp.fullName.trim();
      const lastSpaceIdx = cleanFullName.lastIndexOf(' ');
      if (lastSpaceIdx > 0) {
        derivedFirstName = cleanFullName.substring(0, lastSpaceIdx).trim();
        derivedLastName = cleanFullName.substring(lastSpaceIdx + 1).trim();
      } else {
        derivedFirstName = '';
        derivedLastName = cleanFullName;
      }
    }

    setFirstName(derivedFirstName);
    setLastName(derivedLastName);
    setShowFormModal(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormValidationError('');

    if (!firstName || !lastName) {
      setFormValidationError('Imię i nazwisko są wymagane.');
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
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          employeeNumber: employeeNumber.trim() || null,
          isActive
        })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setFormValidationError(data.message || 'Unknown API error');
        return;
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
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Nie udało się usunąć pracownika.');
      }
      fetchEmployees();
    } catch (err: any) {
      alert(err.message || 'Nie udało się usunąć pracownika.');
    }
  };

  const filteredEmployees = employees.filter(e => {
    const query = searchQuery.toLowerCase();
    const nameMatch = e.fullName.toLowerCase().includes(query);
    const idMatch = e.employeeNumber && e.employeeNumber.toLowerCase().includes(query);
    const firstMatch = e.firstName && e.firstName.toLowerCase().includes(query);
    const lastMatch = e.lastName && e.lastName.toLowerCase().includes(query);
    return nameMatch || idMatch || firstMatch || lastMatch;
  });

  const sortedEmployees = [...filteredEmployees].sort((a, b) => {
    const nameA = getEmployeeDisplayNames(a);
    const nameB = getEmployeeDisplayNames(b);
    const lastNameCompare = nameA.displayLastName.localeCompare(nameB.displayLastName, 'pl');
    if (lastNameCompare !== 0) {
      return lastNameCompare;
    }
    return nameA.displayFirstName.localeCompare(nameB.displayFirstName, 'pl');
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
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
                <label className="form-label">Identyfikator (ID) pracownika</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="np. 12345 (opcjonalnie)"
                  value={employeeNumber}
                  onChange={e => setEmployeeNumber(e.target.value)}
                  autoFocus={!editingEmployeeId}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Imię</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="np. Jan"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  autoFocus={!!editingEmployeeId}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Nazwisko</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="np. Nowak"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
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

      {/* Tytuł */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', flexShrink: 0 }}>
        <Users size={28} />
        <h2 style={{ fontFamily: 'var(--font-header)', fontSize: '1.8rem', margin: 0 }}>
          Baza Pracowników
        </h2>
      </div>

      {/* Główna akcja */}
      <div style={{ marginBottom: '1rem', flexShrink: 0 }}>
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
      ) : sortedEmployees.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          Brak pracowników spełniających kryteria.
        </div>
      ) : (
        <div className="table-container-fixed">
          <table className="table-fixed">
            <thead>
              <tr>
                <th>Lp.</th>
                <th>Status</th>
                <th>ID</th>
                <th>Imię</th>
                <th>Nazwisko</th>
                <th>Data utworzenia konta</th>
                <th style={{ textAlign: 'center' }}>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {sortedEmployees.map((emp, index) => {
                const { displayFirstName, displayLastName } = getEmployeeDisplayNames(emp);

                return (
                  <tr key={emp.id}>
                    <td>{index + 1}</td>
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
                    <td><code>{emp.employeeNumber || '-'}</code></td>
                    <td style={{ fontWeight: 'bold' }}>{displayFirstName || '-'}</td>
                    <td style={{ fontWeight: 'bold' }}>{displayLastName || '-'}</td>
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
