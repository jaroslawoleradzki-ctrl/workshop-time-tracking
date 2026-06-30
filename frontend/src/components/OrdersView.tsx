import React, { useState, useEffect } from 'react';
import { 
  FolderGit2, 
  Plus, 
  Edit2, 
  Trash2, 
  Search, 
  X,
  Lock
} from 'lucide-react';
import { UserSession } from '../App';

interface Order {
  id: string;
  orderNumber: string;
  productCode: string;
  productName: string;
  accountingAccount: string;
  plannedHours: number;
  quantity: number | null;
  quantityUnit: string;
  actualHours: number;
  utilizationPercent: number;
  status: 'OPEN' | 'SUSPENDED' | 'CLOSED';
  isActive: boolean;
  createdAt: string;
  completionDate: string | null;
}

interface OrdersViewProps {
  token: string;
  user: UserSession;
}

export default function OrdersView({ token, user }: OrdersViewProps) {
  const isAdmin = user.role === 'admin';
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Form states (Admin only)
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState('');
  const [productCode, setProductCode] = useState('');
  const [productName, setProductName] = useState('');
  const [accountingAccount, setAccountingAccount] = useState('');
  const [plannedHours, setPlannedHours] = useState('0.00');
  const [quantity, setQuantity] = useState('1.00');
  const [quantityUnit, setQuantityUnit] = useState('szt.');
  const [orderStatus, setOrderStatus] = useState<'OPEN' | 'SUSPENDED' | 'CLOSED'>('OPEN');
  const [isActive, setIsActive] = useState(true);
  const [formValidationError, setFormValidationError] = useState('');

  useEffect(() => {
    fetchOrders();
  }, [token]);

  const fetchOrders = async () => {
    try {
      const res = await fetch('/api/orders', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Nie udało się załadować listy zleceń');
      const data = await res.json();
      setOrders(data);
    } catch (err: any) {
      setError(err.message || 'Błąd ładowania zleceń');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingOrderId(null);
    setOrderNumber('');
    setProductCode('');
    setProductName('');
    setAccountingAccount('');
    setPlannedHours('0.00');
    setQuantity('1.00');
    setQuantityUnit('szt.');
    setOrderStatus('OPEN');
    setIsActive(true);
    setFormValidationError('');
    setShowFormModal(true);
  };

  const handleOpenEditModal = (order: Order) => {
    setEditingOrderId(order.id);
    setOrderNumber(order.orderNumber);
    setProductCode(order.productCode || '');
    setProductName(order.productName);
    setAccountingAccount(order.accountingAccount || '');
    setPlannedHours(order.plannedHours.toString());
    setQuantity(order.quantity !== null ? order.quantity.toString() : '1.00');
    setQuantityUnit(order.quantityUnit);
    setOrderStatus(order.status);
    setIsActive(order.isActive);
    setFormValidationError('');
    setShowFormModal(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormValidationError('');

    if (!orderNumber || !productName || !plannedHours || !quantity) {
      setFormValidationError('Pola: Numer zlecenia, Nazwa produktu, Planowane godziny i Ilość są wymagane.');
      return;
    }

    const planHrs = parseFloat(plannedHours);
    const qty = parseFloat(quantity);
    if (isNaN(planHrs) || planHrs < 0 || isNaN(qty) || qty <= 0) {
      setFormValidationError('Planowane godziny muszą być liczbą większą lub równą 0, a ilość musi być większa od 0.');
      return;
    }

    try {
      const url = editingOrderId ? `/api/orders/${editingOrderId}` : '/api/orders';
      const method = editingOrderId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          orderNumber: orderNumber.trim(),
          productCode: productCode.trim(),
          productName: productName.trim(),
          accountingAccount: accountingAccount.trim(),
          plannedHours: planHrs,
          quantity: qty,
          quantityUnit: quantityUnit.trim() || 'szt.',
          status: orderStatus,
          isActive
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Błąd zapisu zlecenia');
      }

      setShowFormModal(false);
      fetchOrders();
    } catch (err: any) {
      setFormValidationError(err.message || 'Wystąpił błąd zapisu.');
    }
  };

  const handleDeleteOrder = async (id: string, code: string) => {
    if (!confirm(`Czy na pewno chcesz usunąć zlecenie ${code}? \nWpisane już godziny nie zostaną usunięte z bazy danych (soft delete).`)) return;

    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      fetchOrders();
    } catch (err) {
      alert('Nie udało się usunąć zlecenia.');
    }
  };

  const filteredOrders = orders.filter(o => 
    (o.orderNumber?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (o.productCode?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (o.productName?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (o.accountingAccount?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      {/* Create/Edit Form Modal (Admin only) */}
      {showFormModal && isAdmin && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '550px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <h3 className="modal-header" style={{ margin: 0 }}>
                {editingOrderId ? 'Edycja Zlecenia Produkcyjnego' : 'Nowe Zlecenie Produkcyjne'}
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

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Numer Zlecenia (unikalny)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="np. ZL-2026-001"
                    value={orderNumber}
                    onChange={e => setOrderNumber(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Konto księgowe (opcjonalnie)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="np. KK-90210"
                    value={accountingAccount}
                    onChange={e => setAccountingAccount(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row" style={{ marginTop: '0.5rem' }}>
                <div className="form-group">
                  <label className="form-label">Kod produktu (opcjonalnie)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="np. PR-99823"
                    value={productCode}
                    onChange={e => setProductCode(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Planowana liczba godzin</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="np. 40.00"
                    value={plannedHours}
                    onChange={e => setPlannedHours(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '0.5rem' }}>
                <label className="form-label">Nazwa produktu</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="np. Silnik Elektryczny 15kW"
                  value={productName}
                  onChange={e => setProductName(e.target.value)}
                />
              </div>

              <div className="form-row" style={{ marginTop: '0.5rem' }}>
                <div className="form-group">
                  <label className="form-label">Ilość</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="np. 150.00"
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Jednostka</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="np. szt., kg, m"
                    value={quantityUnit}
                    onChange={e => setQuantityUnit(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row" style={{ marginTop: '0.5rem', alignItems: 'center' }}>
                <div className="form-group">
                  <label className="form-label">Status zlecenia</label>
                  <select
                    className="form-control"
                    value={orderStatus}
                    onChange={e => setOrderStatus(e.target.value as any)}
                  >
                    <option value="OPEN">Otwarte (aktywne do raportowania)</option>
                    <option value="SUSPENDED">Wstrzymane</option>
                    <option value="CLOSED">Zamknięte</option>
                  </select>
                </div>

                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.2rem' }}>
                  <input
                    type="checkbox"
                    id="isActiveCheckbox"
                    checked={isActive}
                    onChange={e => setIsActive(e.target.checked)}
                    style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                  />
                  <label htmlFor="isActiveCheckbox" style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>
                    Zlecenie aktywne
                  </label>
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowFormModal(false)}>
                  Anuluj
                </button>
                <button type="submit" className="btn btn-primary">
                  Zapisz zlecenie
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Panel layout */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem' }}>
        <h2 style={{ fontFamily: 'var(--font-header)', fontSize: '1.8rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FolderGit2 size={28} />
          Baza Zleceń Produkcyjnych
        </h2>

        {isAdmin && (
          <button className="btn btn-primary" onClick={handleOpenCreateModal}>
            <Plus size={16} />
            Dodaj zlecenie
          </button>
        )}
      </div>

      {/* Filter and search bar */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', position: 'relative' }}>
          <Search size={18} style={{ color: 'var(--text-muted)', position: 'absolute', left: '12px' }} />
          <input
            type="text"
            className="form-control"
            style={{ paddingLeft: '38px' }}
            placeholder="Szukaj zlecenia po numerze, produkcie, koncie księgowym..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <div>Ładowanie bazy zleceń...</div>
        </div>
      ) : error ? (
        <div className="alert alert-danger">{error}</div>
      ) : filteredOrders.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          Brak zleceń spełniających kryteria wyszukiwania.
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Numer zlecenia</th>
                <th>Konto księgowe</th>
                <th>Kod produktu</th>
                <th>Nazwa produktu</th>
                <th style={{ textAlign: 'right' }}>Ilość</th>
                <th style={{ textAlign: 'right' }}>Plan</th>
                <th style={{ textAlign: 'right' }}>Rzeczywiste</th>
                <th>Pasek realizacji budżetu</th>
                {isAdmin && <th style={{ textAlign: 'center' }}>Akcje</th>}
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map(order => {
                const percent = order.utilizationPercent;
                const colorClass = percent > 100 ? 'red' : percent >= 80 ? 'yellow' : 'green';
                const statusBadge = 
                  order.status === 'OPEN' ? <span className="badge badge-open">Otwarte</span> :
                  order.status === 'SUSPENDED' ? <span className="badge badge-suspended">Wstrzymane</span> :
                  <span className="badge badge-closed">Zamknięte</span>;

                // Add indicator if order is marked as inactive
                const orderNumberDisplay = order.isActive ? (
                  order.orderNumber
                ) : (
                  <span style={{ color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                    {order.orderNumber} (nieaktywne)
                  </span>
                );

                return (
                  <tr key={order.id} style={{ opacity: order.isActive ? 1 : 0.65 }}>
                    <td>{statusBadge}</td>
                    <td style={{ fontWeight: 'bold' }}>{orderNumberDisplay}</td>
                    <td>{order.accountingAccount ? <code>{order.accountingAccount}</code> : '-'}</td>
                    <td>{order.productCode ? <code>{order.productCode}</code> : '-'}</td>
                    <td style={{ fontWeight: 600 }}>{order.productName}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {order.quantity !== null ? `${Number(order.quantity)} ${order.quantityUnit}` : '-'}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{order.plannedHours.toFixed(1)} h</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{order.actualHours.toFixed(1)} h</td>
                    <td style={{ minWidth: '150px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div className="progress-bar-container" style={{ flex: 1, marginTop: 0 }}>
                          <div 
                            className={`progress-bar ${colorClass}`} 
                            style={{ width: `${Math.min(percent, 100)}%` }}
                          ></div>
                        </div>
                        <span style={{ 
                          fontSize: '0.8rem', 
                          fontWeight: 700, 
                          color: `var(--${colorClass === 'green' ? 'success' : colorClass === 'yellow' ? 'warning' : 'danger'}-color)` 
                        }}>
                          {Math.round(percent)}%
                        </span>
                      </div>
                    </td>
                    {isAdmin && (
                      <td>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                          <button 
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '0.25rem 0.5rem' }}
                            onClick={() => handleOpenEditModal(order)}
                          >
                            <Edit2 size={12} />
                          </button>
                          <button 
                            className="btn btn-danger btn-sm"
                            style={{ padding: '0.25rem 0.5rem', backgroundColor: 'transparent', color: 'var(--danger-color)', borderColor: 'var(--danger-border)' }}
                            onClick={() => handleDeleteOrder(order.id, order.orderNumber)}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isAdmin && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <Lock size={12} />
          Modyfikowanie bazy zleceń jest zarezerwowane wyłącznie dla Administratorów.
        </p>
      )}
    </div>
  );
}
