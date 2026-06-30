import { useState, useEffect } from 'react';
import { 
  FileDown, 
  Search, 
  RefreshCw, 
  Trash2,
  Calendar,
  Lock,
  User,
  FolderOpen,
  DollarSign
} from 'lucide-react';
import { UserSession } from '../App';

interface ReportsViewProps {
  token: string;
  user: UserSession;
}

export default function ReportsView({ token, user }: ReportsViewProps) {
  const isAdmin = user.role === 'admin';
  const [activeReportTab, setActiveReportTab] = useState<'by-order' | 'by-employee' | 'by-account' | 'detailed'>('by-order');
  
  // Dictionaries for filters
  const [employees, setEmployees] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);

  // Shared Filter States
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterEmployeeId, setFilterEmployeeId] = useState('');
  const [filterOrderId, setFilterOrderId] = useState('');
  const [filterOrderNum, setFilterOrderNum] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterAccount, setFilterAccount] = useState('');

  // Report Data
  const [reportData, setReportData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Load filter dictionaries
  useEffect(() => {
    const fetchDictionaries = async () => {
      try {
        const headers = { 'Authorization': `Bearer ${token}` };
        
        // Fetch all employees (including inactive, since we need to show historical reports)
        const empRes = await fetch('/api/employees', { headers });
        const empData = await empRes.json();
        setEmployees(empData);

        // Fetch all orders
        const orderRes = await fetch('/api/orders', { headers });
        const orderData = await orderRes.json();
        setOrders(orderData);
      } catch (err) {
        console.error('Błąd ładowania słowników filtrów:', err);
      }
    };
    fetchDictionaries();
  }, [token]);

  // Trigger data fetch when tab or filters change
  useEffect(() => {
    fetchReportData();
  }, [activeReportTab, dateFrom, dateTo, filterEmployeeId, filterOrderId, filterOrderNum, filterStatus, filterAccount]);

  const fetchReportData = async () => {
    setReportData([]); // Clear previous data to prevent rendering crashes
    setLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      let url = '';
      const params = new URLSearchParams();

      if (dateFrom) params.append('dateFrom', dateFrom);
      if (dateTo) params.append('dateTo', dateTo);

      switch (activeReportTab) {
        case 'by-order':
          url = '/api/analytics/report-by-order';
          if (filterStatus) params.append('status', filterStatus);
          if (filterOrderNum) params.append('orderNumber', filterOrderNum);
          break;
        case 'by-employee':
          url = '/api/analytics/report-by-employee';
          if (filterEmployeeId) params.append('employeeId', filterEmployeeId);
          break;
        case 'by-account':
          url = '/api/analytics/report-by-account';
          if (filterAccount) params.append('accountingAccount', filterAccount);
          break;
        case 'detailed':
          url = '/api/analytics/report-detailed';
          if (filterEmployeeId) params.append('employeeId', filterEmployeeId);
          if (filterOrderId) params.append('orderId', filterOrderId);
          break;
      }

      const res = await fetch(`${url}?${params.toString()}`, { headers });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setReportData(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Błąd wczytywania raportu:', err);
      setReportData([]);
    } finally {
      setLoading(false);
    }
  };

  // Trigger excel file download from backend
  const handleExportXLSX = async () => {
    const params = new URLSearchParams();
    if (dateFrom) params.append('dateFrom', dateFrom);
    if (dateTo) params.append('dateTo', dateTo);

    let path = '';
    switch (activeReportTab) {
      case 'by-order':
        path = '/api/analytics/export/by-order';
        if (filterStatus) params.append('status', filterStatus);
        if (filterOrderNum) params.append('orderNumber', filterOrderNum);
        break;
      case 'by-employee':
        path = '/api/analytics/export/by-employee';
        if (filterEmployeeId) params.append('employeeId', filterEmployeeId);
        break;
      case 'by-account':
        path = '/api/analytics/export/by-account';
        if (filterAccount) params.append('accountingAccount', filterAccount);
        break;
      case 'detailed':
        path = '/api/analytics/export/detailed';
        if (filterEmployeeId) params.append('employeeId', filterEmployeeId);
        if (filterOrderId) params.append('orderId', filterOrderId);
        break;
    }

    const downloadUrl = `${path}?${params.toString()}`;
    const filename = 
      activeReportTab === 'by-order' ? 'Raport_godzin_wg_zlecen.xlsx' :
      activeReportTab === 'by-employee' ? 'Raport_miesieczny_pracownicy.xlsx' :
      activeReportTab === 'by-account' ? 'Raport_kont_ksiegowych.xlsx' : 
      'Raport_szczegolowy_czasu_pracy.xlsx';

    try {
      const res = await fetch(downloadUrl, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      alert('Błąd pobierania pliku Excel.');
    }
  };

  // Client-side CSV generation with Polish character support
  const handleExportCSV = () => {
    let headers: string[] = [];
    let rows: any[][] = [];
    let filename = '';
    const safeReportData = Array.isArray(reportData) ? reportData : [];

    switch (activeReportTab) {
      case 'by-order':
        filename = 'Raport_godzin_wg_zlecen.csv';
        headers = ['Numer zlecenia', 'Nazwa produktu', 'Kod produktu', 'Plan (h)', 'Rzeczywiste (h)', 'Odchylenie (h)', 'Wykorzystanie (%)', 'Status'];
        rows = safeReportData.map(o => [
          o.orderNumber,
          o.productName,
          o.productCode,
          o.plannedHours,
          o.actualHours,
          o.deviation,
          o.percent,
          o.status === 'OPEN' ? 'Otwarte' : o.status === 'SUSPENDED' ? 'Wstrzymane' : 'Zamknięte'
        ]);
        break;
      case 'by-employee':
        filename = 'Raport_miesieczny_pracownicy.csv';
        headers = ['Pracownik', 'G', 'NDR', 'NS', 'UW', 'UOK', 'UŻ', 'L4', 'Suma'];
        rows = safeReportData.map(r => [r.employeeName, r.G, r.NDR, r.NS, r.UW, r.UOK, r.UŻ, r.L4, r.suma]);
        break;
      case 'by-account':
        filename = 'Raport_kont_ksiegowych.csv';
        headers = ['Data', 'Konto księgowe', 'Pracownik', 'Zlecenie', 'Produkt', 'Godziny', 'Kod czasu'];
        rows = safeReportData.map(r => [r.date, r.accountingAccount, r.employeeName, r.orderNumber, r.productName, r.hours, r.workTimeTypeCode]);
        break;
      case 'detailed':
        filename = 'Raport_szczegolowy_czasu_pracy.csv';
        headers = ['Data', 'Pracownik', 'Zlecenie', 'Kod produktu', 'Nazwa produktu', 'Konto księgowe', 'Godziny', 'Typ czasu', 'Wprowadził', 'Data wpisu'];
        rows = safeReportData.map(r => [r.date, r.employeeName, r.orderNumber, r.productCode, r.productName, r.accountingAccount, r.hours, r.workTimeTypeCode, r.creatorName, r.createdAt]);
        break;
    }

    const csvContent = "\uFEFF" + [
      headers.join(';'),
      ...rows.map(row => row.map(val => {
        if (val === null || val === undefined) return '';
        const strVal = val.toString();
        if (strVal.includes(';') || strVal.includes('"') || strVal.includes('\n')) {
          return `"${strVal.replace(/"/g, '""')}"`;
        }
        return strVal;
      }).join(';'))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Administrator tool: soft-delete a detailed report entry
  const handleDeleteEntry = async (id: string) => {
    if (!confirm('Czy na pewno chcesz usunąć ten wpis z czasu pracy (Soft Delete)? Zmiana zostanie zarejestrowana w logu audytu.')) return;
    try {
      const res = await fetch(`/api/reports/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      fetchReportData(); // Reload
    } catch (err) {
      alert('Nie udało się usunąć wpisu.');
    }
  };

  const handleClearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setFilterEmployeeId('');
    setFilterOrderId('');
    setFilterOrderNum('');
    setFilterStatus('');
    setFilterAccount('');
  };

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem', fontFamily: 'var(--font-header)', fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <FileDown size={28} />
        Centrum Raportów
      </h2>

      {/* Tabs */}
      <div style={{ 
        display: 'flex', 
        borderBottom: '1px solid var(--border-color)', 
        marginBottom: '1.5rem',
        overflowX: 'auto',
        gap: '0.5rem',
        paddingBottom: '2px'
      }}>
        <button 
          onClick={() => { setActiveReportTab('by-order'); handleClearFilters(); }}
          className={`nav-item ${activeReportTab === 'by-order' ? 'active' : ''}`}
          style={{ padding: '0.6rem 1.2rem', borderRadius: 'var(--radius-md) var(--radius-md) 0 0', border: '1px solid var(--border-color)', borderBottom: 'none' }}
        >
          <FolderOpen size={16} />
          Godziny wg Zleceń
        </button>
        <button 
          onClick={() => { setActiveReportTab('by-employee'); handleClearFilters(); }}
          className={`nav-item ${activeReportTab === 'by-employee' ? 'active' : ''}`}
          style={{ padding: '0.6rem 1.2rem', borderRadius: 'var(--radius-md) var(--radius-md) 0 0', border: '1px solid var(--border-color)', borderBottom: 'none' }}
        >
          <User size={16} />
          Wg Pracowników (Miesięczny)
        </button>
        <button 
          onClick={() => { setActiveReportTab('by-account'); handleClearFilters(); }}
          className={`nav-item ${activeReportTab === 'by-account' ? 'active' : ''}`}
          style={{ padding: '0.6rem 1.2rem', borderRadius: 'var(--radius-md) var(--radius-md) 0 0', border: '1px solid var(--border-color)', borderBottom: 'none' }}
        >
          <DollarSign size={16} />
          Wg Kont Księgowych
        </button>
        <button 
          onClick={() => { setActiveReportTab('detailed'); handleClearFilters(); }}
          className={`nav-item ${activeReportTab === 'detailed' ? 'active' : ''}`}
          style={{ padding: '0.6rem 1.2rem', borderRadius: 'var(--radius-md) var(--radius-md) 0 0', border: '1px solid var(--border-color)', borderBottom: 'none' }}
        >
          <Search size={16} />
          Raport Szczegółowy
        </button>
      </div>

      {/* Filters Form Card */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h4 style={{ margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Calendar size={16} /> Filtry wyszukiwania</h4>
          <button className="btn btn-secondary btn-sm" onClick={handleClearFilters}>Wyczyść filtry</button>
        </div>

        <div className="form-row">
          {/* Always show Date Range */}
          <div className="form-group">
            <label className="form-label">Data od</label>
            <input type="date" className="form-control" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Data do</label>
            <input type="date" className="form-control" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>

          {/* Conditional Filters depending on tab */}
          {activeReportTab === 'by-order' && (
            <>
              <div className="form-group">
                <label className="form-label">Numer zlecenia</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="np. ZL-2026" 
                  value={filterOrderNum} 
                  onChange={e => setFilterOrderNum(e.target.value)} 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Status zlecenia</label>
                <select className="form-control" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="">Wszystkie statusy</option>
                  <option value="open">Otwarte</option>
                  <option value="suspended">Wstrzymane</option>
                  <option value="closed">Zamknięte</option>
                </select>
              </div>
            </>
          )}

          {(activeReportTab === 'by-employee' || activeReportTab === 'detailed') && (
            <div className="form-group">
              <label className="form-label">Pracownik</label>
              <select className="form-control" value={filterEmployeeId} onChange={e => setFilterEmployeeId(e.target.value)}>
                <option value="">Wszyscy pracownicy</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
              </select>
            </div>
          )}

          {activeReportTab === 'by-account' && (
            <div className="form-group">
              <label className="form-label">Konto księgowe</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="np. KK-902" 
                value={filterAccount} 
                onChange={e => setFilterAccount(e.target.value)} 
              />
            </div>
          )}

          {activeReportTab === 'detailed' && (
            <div className="form-group">
              <label className="form-label">Zlecenie</label>
              <select className="form-control" value={filterOrderId} onChange={e => setFilterOrderId(e.target.value)}>
                <option value="">Wszystkie zlecenia</option>
                {orders.map(o => <option key={o.id} value={o.id}>{o.orderNumber} - {o.productName}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Export & Actions Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <button 
          className="btn btn-secondary btn-sm" 
          onClick={fetchReportData} 
          disabled={loading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <RefreshCw size={14} className={loading ? 'spin-anim' : ''} />
          Odśwież dane
        </button>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-success btn-sm" onClick={handleExportXLSX} disabled={reportData.length === 0 || loading}>
            <FileDown size={14} />
            Pobierz Excel (XLSX)
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleExportCSV} disabled={reportData.length === 0 || loading}>
            Pobierz plik CSV
          </button>
        </div>
      </div>

      {/* Report Table Display */}
      {loading ? (
        <div className="card" style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          Ładowanie danych raportowych...
        </div>
      ) : reportData.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
          Brak danych dla wybranych filtrów.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {activeReportTab === 'by-order' && (
            <div className="table-container" style={{ margin: 0, border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Numer zlecenia</th>
                    <th>Produkt</th>
                    <th>Kod produktu</th>
                    <th style={{ textAlign: 'right' }}>Godziny planowane</th>
                    <th style={{ textAlign: 'right' }}>Godziny rzeczywiste</th>
                    <th style={{ textAlign: 'right' }}>Odchylenie</th>
                    <th style={{ textAlign: 'right' }}>Wykorzystanie</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(reportData) && reportData.map((row, idx) => {
                    const devVal = row.deviation;
                    const devStyle = devVal < 0 ? { color: 'var(--danger-color)', fontWeight: 600 } : { color: 'var(--success-color)' };
                    const useVal = row.percent;
                    const useBadge = 
                      useVal > 100 ? 'badge-danger' : 
                      useVal >= 80 ? 'badge-suspended' : 'badge-open';

                    return (
                      <tr key={idx}>
                        <td style={{ fontWeight: 'bold' }}>{row.orderNumber}</td>
                        <td>{row.productName}</td>
                        <td><code>{row.productCode}</code></td>
                        <td style={{ textAlign: 'right' }}>{(Number(row.plannedHours) || 0).toFixed(1)} h</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{(Number(row.actualHours) || 0).toFixed(1)} h</td>
                        <td style={{ textAlign: 'right', ...devStyle }}>{(Number(devVal) || 0).toFixed(1)} h</td>
                        <td style={{ textAlign: 'right' }}>
                          <span className={`badge ${useBadge}`}>{Math.round(useVal)}%</span>
                        </td>
                        <td>
                          {row.status === 'OPEN' ? <span className="badge badge-open">Otwarte</span> :
                           row.status === 'SUSPENDED' ? <span className="badge badge-suspended">Wstrzymane</span> :
                           <span className="badge badge-closed">Zamknięte</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {activeReportTab === 'by-employee' && (
            <div className="table-container" style={{ margin: 0, border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Pracownik</th>
                    <th style={{ textAlign: 'right' }}>G (Standard)</th>
                    <th style={{ textAlign: 'right' }}>NDR (Nadgodz.)</th>
                    <th style={{ textAlign: 'right' }}>NS (Weekend)</th>
                    <th style={{ textAlign: 'right' }}>UW (Urlop wyp.)</th>
                    <th style={{ textAlign: 'right' }}>UOK (Okoliczn.)</th>
                    <th style={{ textAlign: 'right' }}>UŻ (Żądanie)</th>
                    <th style={{ textAlign: 'right' }}>L4 (Choroba)</th>
                    <th style={{ textAlign: 'right', fontWeight: 'bold' }}>Suma godzin</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(reportData) && reportData.map((row, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 'bold' }}>{row.employeeName}</td>
                      <td style={{ textAlign: 'right' }}>{(Number(row.G) || 0).toFixed(1)} h</td>
                      <td style={{ textAlign: 'right' }}>{(Number(row.NDR) || 0).toFixed(1)} h</td>
                      <td style={{ textAlign: 'right' }}>{(Number(row.NS) || 0).toFixed(1)} h</td>
                      <td style={{ textAlign: 'right' }}>{(Number(row.UW) || 0).toFixed(1)} h</td>
                      <td style={{ textAlign: 'right' }}>{(Number(row.UOK) || 0).toFixed(1)} h</td>
                      <td style={{ textAlign: 'right' }}>{(Number(row.UŻ) || 0).toFixed(1)} h</td>
                      <td style={{ textAlign: 'right' }}>{(Number(row.L4) || 0).toFixed(1)} h</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '0.95rem', color: 'var(--primary-color)' }}>
                        {(Number(row.suma) || 0).toFixed(1)} h
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeReportTab === 'by-account' && (
            <div className="table-container" style={{ margin: 0, border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Konto księgowe</th>
                    <th>Pracownik</th>
                    <th>Zlecenie</th>
                    <th>Produkt</th>
                    <th style={{ textAlign: 'right' }}>Liczba godzin</th>
                    <th>Kod czasu</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(reportData) && reportData.map((row, idx) => (
                    <tr key={idx}>
                      <td>{row.date}</td>
                      <td><code>{row.accountingAccount}</code></td>
                      <td style={{ fontWeight: 600 }}>{row.employeeName}</td>
                      <td style={{ fontWeight: 'bold' }}>{row.orderNumber}</td>
                      <td>{row.productName}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{(Number(row.hours) || 0).toFixed(1)} h</td>
                      <td>
                        <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{row.workTimeTypeCode}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeReportTab === 'detailed' && (
            <div className="table-container" style={{ margin: 0, border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Data pracy</th>
                    <th>Pracownik</th>
                    <th>Zlecenie / Produkt</th>
                    <th>Konto księgowe</th>
                    <th style={{ textAlign: 'right' }}>Godziny</th>
                    <th>Typ czasu</th>
                    <th>Wprowadził</th>
                    <th>Data utworzenia wpisu</th>
                    {isAdmin && <th style={{ textAlign: 'center' }}>Akcje</th>}
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(reportData) && reportData.map((row) => (
                    <tr key={row.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{row.date}</td>
                      <td style={{ fontWeight: 600 }}>{row.employeeName}</td>
                      <td>
                        {row.orderNumber !== '-' ? (
                          <div>
                            <div style={{ fontWeight: 'bold' }}>{row.orderNumber}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {row.productName}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Brak zlecenia</span>
                        )}
                      </td>
                      <td><code>{row.accountingAccount}</code></td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '0.95rem' }}>{(Number(row.hours) || 0).toFixed(1)} h</td>
                      <td>
                        <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{row.workTimeTypeCode}</span>
                      </td>
                      <td style={{ fontSize: '0.8rem' }}>{row.creatorName}</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(row.createdAt).toLocaleString('pl-PL')}
                      </td>
                      {isAdmin && (
                        <td>
                          <button 
                            className="btn btn-danger btn-sm"
                            style={{ padding: '0.25rem 0.4rem', backgroundColor: 'transparent', color: 'var(--danger-color)', borderColor: 'var(--danger-border)' }}
                            onClick={() => handleDeleteEntry(row.id)}
                            title="Usuń wpis (Soft Delete)"
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      
      {activeReportTab === 'detailed' && !isAdmin && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <Lock size={12} />
          Usuwanie wpisów z czasu pracy (korekty audytowe) w raporcie szczegółowym jest dostępne wyłącznie dla Administratorów.
        </p>
      )}
    </div>
  );
}
