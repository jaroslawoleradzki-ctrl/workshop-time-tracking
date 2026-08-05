import React, { useState, useEffect, useMemo } from 'react';
import { 
  FolderGit2, 
  Plus, 
  Edit2, 
  Trash2, 
  Search, 
  X,
  Lock,
  FileSpreadsheet
} from 'lucide-react';
import { UserSession } from '../App';
import ScrollableTable from './ScrollableTable';

interface Order {
  id: string;
  orderNumber: string;
  orderDate: string;
  plannedShipmentDate: string | null;
  productCode: string | null;
  productName: string;
  accountingAccount: string | null;
  orderedBy: string | null;
  notes: string | null;
  plannedHours: number;
  quantity: number | null;
  quantityUnit: string;
  hoursPerUnit: number;
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
  const isLeader = user.role === 'leader';
  const canExport = isAdmin || isLeader;

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'SUSPENDED' | 'CLOSED'>('ALL');
  const [isExporting, setIsExporting] = useState(false);

  // Form states (Admin only)
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [plannedShipmentDate, setPlannedShipmentDate] = useState('');
  const [productCode, setProductCode] = useState('');
  const [productName, setProductName] = useState('');
  const [accountingAccount, setAccountingAccount] = useState('');
  const [orderedBy, setOrderedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [quantity, setQuantity] = useState('1.00');
  const [quantityUnit, setQuantityUnit] = useState('szt.');
  const [hoursPerUnit, setHoursPerUnit] = useState('0.00');
  const [orderStatus, setOrderStatus] = useState<'OPEN' | 'SUSPENDED' | 'CLOSED'>('OPEN');
  const [isActive, setIsActive] = useState(true);
  const [completionDate, setCompletionDate] = useState('');
  const [formValidationError, setFormValidationError] = useState('');

  const derivedPlannedHours = useMemo(() => {
    const qty = parseFloat(quantity);
    const hpu = parseFloat(hoursPerUnit);
    if (isNaN(qty) || isNaN(hpu)) return '0.00';
    return (qty * hpu).toFixed(2);
  }, [quantity, hoursPerUnit]);

  useEffect(() => {
    fetchOrders();
  }, [token]);

  useEffect(() => {
    if (showFormModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showFormModal]);

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
    setOrderDate(new Date().toISOString().split('T')[0]);
    setPlannedShipmentDate('');
    setProductCode('');
    setProductName('');
    setAccountingAccount('');
    setOrderedBy('');
    setNotes('');
    setQuantity('1.00');
    setQuantityUnit('szt.');
    setHoursPerUnit('0.00');
    setOrderStatus('OPEN');
    setIsActive(true);
    setCompletionDate('');
    setFormValidationError('');
    setShowFormModal(true);
  };

  const handleOpenEditModal = (order: Order) => {
    setEditingOrderId(order.id);
    setOrderNumber(order.orderNumber);
    setOrderDate(order.orderDate ? new Date(order.orderDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
    setPlannedShipmentDate(order.plannedShipmentDate ? new Date(order.plannedShipmentDate).toISOString().split('T')[0] : '');
    setProductCode(order.productCode || '');
    setProductName(order.productName);
    setAccountingAccount(order.accountingAccount || '');
    setOrderedBy(order.orderedBy || '');
    setNotes(order.notes || '');
    setQuantity(order.quantity !== null ? order.quantity.toString() : '1.00');
    setQuantityUnit(order.quantityUnit);
    setHoursPerUnit(order.hoursPerUnit !== null ? order.hoursPerUnit.toString() : '0.00');
    setOrderStatus(order.status);
    setIsActive(order.isActive);
    setCompletionDate(order.completionDate ? new Date(order.completionDate).toISOString().split('T')[0] : '');
    setFormValidationError('');
    setShowFormModal(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormValidationError('');

    if (!orderNumber || !orderDate || !productName || !quantity || hoursPerUnit === undefined) {
      setFormValidationError('Pola: Numer zlecenia, Data zlecenia, Nazwa produktu, Ilość i Godziny / szt. są wymagane.');
      return;
    }

    const qty = parseFloat(quantity);
    const hrsPerUnit = parseFloat(hoursPerUnit);
    if (isNaN(qty) || qty <= 0 || isNaN(hrsPerUnit) || hrsPerUnit < 0) {
      setFormValidationError('Ilość musi być liczbą większą od 0, a godziny/szt. musi być liczbą większą lub równą 0.');
      return;
    }

    if (orderStatus === 'CLOSED' && (!completionDate || completionDate.trim() === '')) {
      setFormValidationError('Podaj rzeczywistą datę zakończenia zlecenia.');
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
          orderDate,
          plannedShipmentDate: plannedShipmentDate || null,
          productCode: productCode.trim(),
          productName: productName.trim(),
          accountingAccount: accountingAccount.trim(),
          orderedBy: orderedBy.trim() || null,
          notes: notes.trim() || null,
          quantity: qty,
          quantityUnit: quantityUnit.trim() || 'szt.',
          hoursPerUnit: hrsPerUnit,
          status: orderStatus,
          isActive,
          completionDate: completionDate || null,
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

  const [sortField, setSortField] = useState<'orderDate' | 'plannedShipmentDate' | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const filteredOrders = orders.filter(o => {
    const matchesSearch =
      (o.orderNumber?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (o.orderedBy?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (o.productCode?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (o.productName?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (o.accountingAccount?.toLowerCase() || '').includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const sortedOrders = useMemo(() => {
    if (!sortField) return filteredOrders;
    return [...filteredOrders].sort((a, b) => {
      const valA = a[sortField] ? new Date(a[sortField]).getTime() : (sortOrder === 'asc' ? Infinity : -Infinity);
      const valB = b[sortField] ? new Date(b[sortField]).getTime() : (sortOrder === 'asc' ? Infinity : -Infinity);
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredOrders, sortField, sortOrder]);

  const toggleSort = (field: 'orderDate' | 'plannedShipmentDate') => {
    if (sortField === field) {
      if (sortOrder === 'asc') setSortOrder('desc');
      else {
        setSortField(null);
        setSortOrder('asc');
      }
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleExportXLSX = async () => {
    if (isExporting) return;
    setIsExporting(true);

    try {
      const res = await fetch('/api/orders/export-xlsx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          searchQuery,
          statusFilter,
          sortField,
          sortOrder,
        }),
      });

      if (!res.ok) {
        let errorMsg = 'Nie udało się wygenerować pliku Excel.';
        try {
          const errData = await res.json();
          if (errData.message) errorMsg = errData.message;
        } catch (_) {}
        throw new Error(errorMsg);
      }

      const blob = await res.blob();

      // Get filename from Content-Disposition header if provided
      let filename = 'baza_zlecen.xlsx';
      const disposition = res.headers.get('Content-Disposition');
      if (disposition && disposition.includes('filename=')) {
        const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
        if (matches != null && matches[1]) {
          filename = matches[1].replace(/['"]/g, '');
        }
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Wystąpił błąd podczas eksportowania pliku Excel.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}>
      {/* Create/Edit Form Modal (Admin only) */}
      {showFormModal && isAdmin && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowFormModal(false);
          }}
        >
          <div
            className="modal-content"
            style={{
              maxWidth: '550px',
              maxHeight: 'calc(100vh - 2rem)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid var(--border-color)',
                paddingBottom: '0.75rem',
                flexShrink: 0,
              }}
            >
              <h3 className="modal-header" style={{ margin: 0 }}>
                {editingOrderId ? 'Edycja Zlecenia Produkcyjnego' : 'Nowe Zlecenie Produkcyjne'}
              </h3>
              <button className="theme-toggle" onClick={() => setShowFormModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={handleFormSubmit}
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  minHeight: 0,
                  paddingRight: '0.35rem',
                  marginTop: '0.5rem',
                }}
              >
                {formValidationError && (
                  <div
                    className="alert alert-danger"
                    style={{ padding: '0.75rem', fontSize: '0.85rem', marginBottom: '0.75rem' }}
                  >
                    {formValidationError}
                  </div>
                )}

                {/* === Informacje o zleceniu === */}
                <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem', marginBottom: '0.75rem', marginTop: '0.5rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Informacje o zleceniu
                  </h4>
                </div>

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
                    <label className="form-label">Data zlecenia</label>
                    <input
                      type="date"
                      className="form-control"
                      value={orderDate}
                      onChange={e => setOrderDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-row" style={{ marginTop: '0.5rem' }}>
                  <div className="form-group">
                    <label className="form-label">Planowana wysyłka (opcjonalnie)</label>
                    <input
                      type="date"
                      className="form-control"
                      value={plannedShipmentDate}
                      onChange={e => setPlannedShipmentDate(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Zamawiający (opcjonalnie)</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="np. MetalWorks Sp. z o.o."
                      value={orderedBy}
                      onChange={e => setOrderedBy(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: '0.5rem' }}>
                  <label className="form-label" htmlFor="orderNotes">Uwagi (opcjonalnie)</label>
                  <textarea
                    id="orderNotes"
                    className="form-control"
                    rows={3}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
                </div>

                {/* === Produkt === */}
                <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem', marginBottom: '0.75rem', marginTop: '1.25rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Produkt
                  </h4>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Numer produktu (opcjonalnie)</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="np. PR-99823"
                      value={productCode}
                      onChange={e => setProductCode(e.target.value)}
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

                {/* === Plan === */}
                <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem', marginBottom: '0.75rem', marginTop: '1.25rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Plan
                  </h4>
                </div>

                <div className="form-row">
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

                <div className="form-row" style={{ marginTop: '0.5rem' }}>
                  <div className="form-group">
                    <label className="form-label">Godziny / szt.</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="np. 0.50"
                      value={hoursPerUnit}
                      onChange={e => setHoursPerUnit(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Plan godzin (auto)</label>
                    <input
                      type="text"
                      className="form-control"
                      value={derivedPlannedHours}
                      readOnly
                      disabled
                      style={{ backgroundColor: 'var(--border-color)', cursor: 'not-allowed' }}
                    />
                  </div>
                </div>

                <div className="form-row" style={{ marginTop: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="orderStatusSelect">Status zlecenia</label>
                    <select
                      id="orderStatusSelect"
                      className="form-control"
                      value={orderStatus}
                      onChange={e => setOrderStatus(e.target.value as any)}
                    >
                      <option value="OPEN">Otwarte (aktywne do raportowania)</option>
                      <option value="SUSPENDED">Wstrzymane</option>
                      <option value="CLOSED">Zamknięte</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="completionDateInput">
                      Rzeczywista data zakończenia {orderStatus === 'CLOSED' && <span style={{ color: 'var(--danger-color)' }}>*</span>}
                    </label>
                    <input
                      id="completionDateInput"
                      type="date"
                      className="form-control"
                      value={completionDate}
                      onChange={e => setCompletionDate(e.target.value)}
                      disabled={orderStatus !== 'CLOSED'}
                      required={orderStatus === 'CLOSED'}
                      placeholder="Wybierz datę zakończenia"
                    />
                  </div>
                </div>

                <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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

              <div
                className="modal-actions"
                style={{
                  marginTop: '1rem',
                  paddingTop: '0.75rem',
                  borderTop: '1px solid var(--border-color)',
                  flexShrink: 0,
                }}
              >
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

      {/* Tytuł */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', flexShrink: 0 }}>
        <FolderGit2 size={28} />
        <h2 style={{ fontFamily: 'var(--font-header)', fontSize: '1.8rem', margin: 0 }}>
          Baza Zleceń Produkcyjnych
        </h2>
      </div>

      {/* Główne akcje */}
      {(isAdmin || canExport) && (
        <div style={{ marginBottom: '1rem', flexShrink: 0, display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {isAdmin && (
            <button className="btn btn-primary" onClick={handleOpenCreateModal}>
              <Plus size={16} />
              Dodaj zlecenie
            </button>
          )}
          {canExport && (
            <button
              className="btn btn-secondary"
              onClick={handleExportXLSX}
              disabled={isExporting}
              title="Eksportuj aktualny widok Bazy Zleceń do pliku Excel (.xlsx)"
            >
              <FileSpreadsheet size={16} />
              {isExporting ? 'Eksportowanie...' : 'Eksportuj do Excel'}
            </button>
          )}
        </div>
      )}

      {/* Wyszukiwanie i Sortowanie */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1rem', flexShrink: 0 }}>
        <div className="form-row" style={{ alignItems: 'center', gap: '0.75rem' }}>
          <div className="form-group" style={{ flex: 1, position: 'relative', margin: 0 }}>
            <Search size={18} style={{ color: 'var(--text-muted)', position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              className="form-control"
              style={{ paddingLeft: '38px' }}
              placeholder="Szukaj zlecenia po numerze, produkcie, koncie księgowym..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ width: '170px', margin: 0 }}>
            <select
              className="form-control"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              aria-label="Filtr statusu"
            >
              <option value="ALL">Wszystkie statusy</option>
              <option value="OPEN">Otwarte</option>
              <option value="SUSPENDED">Wstrzymane</option>
              <option value="CLOSED">Zamknięte</option>
            </select>
          </div>
          <div className="form-group" style={{ width: '220px', margin: 0 }}>
            <select
              className="form-control"
              value={sortField ? `${sortField}:${sortOrder}` : ''}
              onChange={e => {
                const val = e.target.value;
                if (!val) {
                  setSortField(null);
                  setSortOrder('asc');
                } else {
                  const [field, order] = val.split(':') as ['orderDate' | 'plannedShipmentDate', 'asc' | 'desc'];
                  setSortField(field);
                  setSortOrder(order);
                }
              }}
            >
              <option value="">Sortowanie domyślne</option>
              <option value="orderDate:asc">Data zlecenia (rosnąco)</option>
              <option value="orderDate:desc">Data zlecenia (malejąco)</option>
              <option value="plannedShipmentDate:asc">Data wysyłki (rosnąco)</option>
              <option value="plannedShipmentDate:desc">Data wysyłki (malejąco)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabela */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem', flex: 1 }}>
          <div>Ładowanie bazy zleceń...</div>
        </div>
      ) : error ? (
        <div className="alert alert-danger" style={{ flexShrink: 0 }}>{error}</div>
      ) : sortedOrders.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', flex: 1 }}>
          Brak zleceń spełniających kryteria wyszukiwania.
        </div>
      ) : (
        <ScrollableTable ariaLabel="Tabela zleceń" tableClassName="table-orders">
            <thead>
              <tr>
                {isAdmin && <th style={{ textAlign: 'center' }}>Akcje</th>}
                <th>Status</th>
                <th>Numer zlecenia</th>
                <th
                  style={{ whiteSpace: 'normal', minWidth: '100px', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => toggleSort('plannedShipmentDate')}
                  title="Kliknij, aby posortować po dacie wysyłki"
                >
                  Planowana<br />wysyłka {sortField === 'plannedShipmentDate' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th>Zamawiający</th>
                <th>Uwagi</th>
                <th>Nazwa produktu</th>
                <th>Numer produktu</th>
                <th style={{ textAlign: 'right' }}>Ilość</th>
                <th style={{ textAlign: 'right' }}>Godziny/szt.</th>
                <th style={{ textAlign: 'right' }}>Plan godzin</th>
                <th>Wykorzystanie</th>
                <th
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => toggleSort('orderDate')}
                  title="Kliknij, aby posortować po dacie zlecenia"
                >
                  Data zlecenia {sortField === 'orderDate' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th>Konto księgowe</th>
              </tr>
            </thead>
            <tbody>
              {sortedOrders.map(order => {
                const percent = order.utilizationPercent;
                const colorClass = percent > 100 ? 'red' : percent >= 80 ? 'yellow' : 'green';
                const statusBadge = 
                  order.status === 'OPEN' ? <span className="badge badge-open">Otwarte</span> :
                  order.status === 'SUSPENDED' ? <span className="badge badge-suspended">Wstrzymane</span> :
                  <span className="badge badge-closed" title={order.completionDate ? `Data zamknięcia: ${new Date(order.completionDate).toLocaleDateString('pl-PL')}` : undefined}>
                    Zamknięte {order.completionDate ? `(${new Date(order.completionDate).toLocaleDateString('pl-PL')})` : ''}
                  </span>;

                const orderNumberDisplay = order.isActive ? (
                  order.orderNumber
                ) : (
                  <span style={{ color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                    {order.orderNumber} (nieaktywne)
                  </span>
                );

                return (
                  <tr key={order.id} style={{ opacity: order.isActive ? 1 : 0.65 }}>
                    {isAdmin && (
                      <td>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                          <button 
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '0.25rem' }}
                            onClick={() => handleOpenEditModal(order)}
                            title="Edytuj"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button 
                            className="btn btn-danger btn-sm"
                            style={{ padding: '0.25rem', backgroundColor: 'transparent', color: 'var(--danger-color)', borderColor: 'var(--danger-border)' }}
                            onClick={() => handleDeleteOrder(order.id, order.orderNumber)}
                            title="Usuń"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    )}
                    <td>{statusBadge}</td>
                    <td style={{ fontWeight: 'bold' }}>{orderNumberDisplay}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {order.plannedShipmentDate ? new Date(order.plannedShipmentDate).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}
                    </td>
                    <td>{order.orderedBy || '-'}</td>
                    <td style={{ minWidth: '180px', whiteSpace: 'pre-wrap' }}>{order.notes || '-'}</td>
                    <td style={{ fontWeight: 600 }}>{order.productName}</td>
                    <td>{order.productCode ? <code>{order.productCode}</code> : '-'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {order.quantity !== null ? `${Number(order.quantity)} ${order.quantityUnit}` : '-'}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {order.hoursPerUnit !== null ? `${Number(order.hoursPerUnit).toFixed(2)} h` : '0.00 h'}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{order.plannedHours.toFixed(1)} h</td>
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
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {order.orderDate ? new Date(order.orderDate).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}
                    </td>
                    <td>{order.accountingAccount ? <code>{order.accountingAccount}</code> : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
        </ScrollableTable>
      )}

      {!isAdmin && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
          <Lock size={12} />
          Modyfikowanie bazy zleceń jest zarezerwowane wyłącznie dla Administratorów.
        </p>
      )}
    </div>
  );
}
