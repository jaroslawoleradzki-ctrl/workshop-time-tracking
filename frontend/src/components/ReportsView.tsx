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
  DollarSign,
  CalendarOff,
  CheckCircle
} from 'lucide-react';
import { UserSession } from '../App';
import ScrollableTable from './ScrollableTable';
import { useReportFilters } from '../hooks/useReportFilters';

interface ReportsViewProps {
  token: string;
  user: UserSession;
}

interface WorkTimeType {
  code: string;
  name: string;
  createdAt: string;
  requiresOrder: boolean;
  isAbsence: boolean;
}

export interface AbsenceSummaryItem {
  code: string;
  name: string;
  hours: number;
}

export interface ClosureControlSummary {
  ordersHours: number;
  absences: AbsenceSummaryItem[];
  totalAbsenceHours: number;
  totalSettledHours: number;
  totalEmployeeHours: number;
  difference: number;
  status: 'MATCHED' | 'MISMATCHED';
  statusLabel: 'Zgodne' | 'Niezgodne';
}

type ReportTab = 'by-order' | 'by-employee' | 'by-account' | 'detailed' | 'absence-periods';

interface ReportFilters extends Record<string, string | boolean> {
  dateFrom: string;
  dateTo: string;
  employeeId: string;
  orderId: string;
  orderNumber: string;
  status: string;
  accountingAccount: string;
  absenceType: string;
  onlyWithHours: boolean;
  closureReport: boolean;
}

const DEFAULT_REPORT_FILTERS: ReportFilters = {
  dateFrom: '',
  dateTo: '',
  employeeId: '',
  orderId: '',
  orderNumber: '',
  status: '',
  accountingAccount: '',
  absenceType: '',
  onlyWithHours: false,
  closureReport: false,
};

export default function ReportsView({ token, user }: ReportsViewProps) {
  const isAdmin = user.role === 'admin';
  const [activeReportTab, setActiveReportTab] = useState<ReportTab>('by-order');
  
  // Dictionaries for filters
  const [employees, setEmployees] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [workTimeTypes, setWorkTimeTypes] = useState<WorkTimeType[]>([]);

  const byOrderFilters = useReportFilters('report.by-order', DEFAULT_REPORT_FILTERS);
  const byEmployeeFilters = useReportFilters('report.by-employee', DEFAULT_REPORT_FILTERS);
  const byAccountFilters = useReportFilters('report.by-account', DEFAULT_REPORT_FILTERS);
  const detailedFilters = useReportFilters('report.detailed', DEFAULT_REPORT_FILTERS);
  const absenceFilters = useReportFilters('report.absence', DEFAULT_REPORT_FILTERS);

  const filtersByTab = {
    'by-order': byOrderFilters,
    'by-employee': byEmployeeFilters,
    'by-account': byAccountFilters,
    detailed: detailedFilters,
    'absence-periods': absenceFilters,
  } satisfies Record<ReportTab, typeof byOrderFilters>;
  const activeFilters = filtersByTab[activeReportTab];
  const {
    dateFrom,
    dateTo,
    employeeId: filterEmployeeId,
    orderId: filterOrderId,
    orderNumber: filterOrderNum,
    status: filterStatus,
    accountingAccount: filterAccount,
    absenceType: filterAbsenceType,
    onlyWithHours: filterOnlyWithHours,
    closureReport: filterClosureReport,
  } = activeFilters.filters;
  const updateFilters = activeFilters.setFilters;

  // Report Data
  const [reportData, setReportData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [controlSummary, setControlSummary] = useState<ClosureControlSummary | null>(null);
  const [loadingControlSummary, setLoadingControlSummary] = useState(false);

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

        // Preserve dictionary creation order so existing columns stay in place
        // and newly added work time types appear at the end.
        const typeRes = await fetch('/api/work-time-types', { headers });
        const typeData = await typeRes.json();
        setWorkTimeTypes(
          Array.isArray(typeData)
            ? [...typeData].sort(
                (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
              )
            : [],
        );
      } catch (err) {
        console.error('Błąd ładowania słowników filtrów:', err);
      }
    };
    fetchDictionaries();
  }, [token]);

  // Trigger data fetch when tab or filters change
  useEffect(() => {
    fetchReportData();
  }, [activeReportTab, dateFrom, dateTo, filterEmployeeId, filterOrderId, filterOrderNum, filterStatus, filterAccount, filterAbsenceType, filterOnlyWithHours, filterClosureReport]);

  const fetchReportData = async () => {
    setReportData([]); // Clear previous data to prevent rendering crashes
    setLoading(true);
    if (activeReportTab === 'by-order' && filterClosureReport && dateFrom && dateTo) {
      setLoadingControlSummary(true);
    } else {
      setControlSummary(null);
    }

    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      let url = '';
      const params = new URLSearchParams();

      if (dateFrom) params.append('dateFrom', dateFrom);
      if (dateTo) params.append('dateTo', dateTo);

      switch (activeReportTab) {
        case 'by-order':
          url = '/api/analytics/report-by-order';
          if (!filterClosureReport && filterStatus) params.append('status', filterStatus);
          if (filterOrderNum) params.append('orderNumber', filterOrderNum);
          if (!filterClosureReport && filterOnlyWithHours) params.append('onlyWithHours', 'true');
          if (filterClosureReport) params.append('closureReport', 'true');
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
        case 'absence-periods':
          url = '/api/analytics/report-absence-periods';
          if (filterEmployeeId) params.append('employeeId', filterEmployeeId);
          if (filterAbsenceType) params.append('workTimeTypeCode', filterAbsenceType);
          break;
      }

      const fetchTablePromise = fetch(`${url}?${params.toString()}`, { headers });
      const fetchControlPromise =
        activeReportTab === 'by-order' && filterClosureReport && dateFrom && dateTo
          ? fetch(`/api/analytics/closure-control-summary?dateFrom=${dateFrom}&dateTo=${dateTo}`, { headers })
          : Promise.resolve(null);

      const [res, controlRes] = await Promise.all([fetchTablePromise, fetchControlPromise]);

      if (!res.ok) throw new Error();
      const data = await res.json();
      setReportData(Array.isArray(data) ? data : []);

      if (controlRes) {
        if (controlRes.ok) {
          const summaryData = await controlRes.json();
          if (
            summaryData &&
            typeof summaryData === 'object' &&
            !Array.isArray(summaryData) &&
            typeof summaryData.ordersHours === 'number'
          ) {
            setControlSummary(summaryData);
          } else {
            setControlSummary(null);
          }
        } else {
          setControlSummary(null);
        }
      }
    } catch (err) {
      console.error('Błąd wczytywania raportu:', err);
      setReportData([]);
      setControlSummary(null);
    } finally {
      setLoading(false);
      setLoadingControlSummary(false);
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
        if (!filterClosureReport && filterStatus) params.append('status', filterStatus);
        if (filterOrderNum) params.append('orderNumber', filterOrderNum);
        if (!filterClosureReport && filterOnlyWithHours) params.append('onlyWithHours', 'true');
        if (filterClosureReport) params.append('closureReport', 'true');
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
      case 'absence-periods':
        path = '/api/analytics/export/absence-periods';
        if (filterEmployeeId) params.append('employeeId', filterEmployeeId);
        if (filterAbsenceType) params.append('workTimeTypeCode', filterAbsenceType);
        break;
    }

    const downloadUrl = `${path}?${params.toString()}`;
    try {
      const res = await fetch(downloadUrl, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Pobieranie nie powiodło się');
      
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = path.includes('absence-periods') ? 'Raport_okresow_nieobecnosci.xlsx' :
                 path.includes('by-order') ? 'Raport_zlecen.xlsx' :
                 path.includes('by-employee') ? 'Raport_miesieczny_pracownicy.xlsx' :
                 path.includes('by-account') ? 'Raport_kont_ksiegowych.xlsx' : 'Raport_szczegolowy.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      alert('Błąd pobierania pliku Excel.');
    }
  };

  // Client-side CSV generation with Polish character support & report metadata
  const handleExportCSV = () => {
    let headers: string[] = [];
    let rows: any[][] = [];
    let filename = '';
    let reportTitle = '';
    let filterItems: { label: string; value: string }[] = [];
    const safeReportData = Array.isArray(reportData) ? reportData : [];

    const escapeCsvValue = (val: any) => {
      if (val === null || val === undefined) return '';
      const strVal = val.toString();
      if (strVal.includes(';') || strVal.includes('"') || strVal.includes('\n')) {
        return `"${strVal.replace(/"/g, '""')}"`;
      }
      return strVal;
    };

    const formatDateISO = (dateStr?: string) => {
      if (!dateStr) return '';
      const parts = dateStr.split('-');
      if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
      return dateStr;
    };

    const dateRangeText = dateFrom && dateTo
      ? `${formatDateISO(dateFrom)}–${formatDateISO(dateTo)}`
      : dateFrom
      ? `od ${formatDateISO(dateFrom)}`
      : dateTo
      ? `do ${formatDateISO(dateTo)}`
      : 'Wszystkie';

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const generatedAtText = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}, ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    switch (activeReportTab) {
      case 'by-order':
        filename = 'Raport_godzin_wg_zlecen.csv';
        reportTitle = 'Raport godzin według zleceń';
        filterItems = [
          { label: 'Status zlecenia', value: filterClosureReport ? 'Nie dotyczy (raport zamknięcia)' : filterStatus === 'OPEN' ? 'Otwarte' : filterStatus === 'SUSPENDED' ? 'Wstrzymane' : filterStatus === 'CLOSED' ? 'Zamknięte' : 'Wszystkie' },
          { label: 'Szukany numer zlecenia', value: filterOrderNum.trim() ? filterOrderNum.trim() : 'Wszystkie' },
          { label: 'Tylko z wypracowanymi godzinami', value: filterClosureReport ? 'Nie dotyczy (raport zamknięcia)' : filterOnlyWithHours ? 'Tak' : 'Nie' },
          { label: 'Raport zamknięcia', value: filterClosureReport ? 'Tak' : 'Nie' },
        ];
        headers = ['Numer zlecenia', 'Nazwa produktu', 'Kod produktu', 'Ilość', 'Plan (h)', 'Rzeczywiste (h)', 'Odchylenie (h)', 'Wykorzystanie (%)', 'Status', 'Rzeczywista data zakończenia'];
        rows = safeReportData.map(o => [
          o.orderNumber,
          o.productName,
          o.productCode,
          o.quantity !== null && o.quantity !== undefined ? `${o.quantity} ${o.quantityUnit || 'szt.'}` : '-',
          o.plannedHours,
          o.actualHours,
          o.deviation,
          o.percent,
          o.status === 'OPEN' ? 'Otwarte' : o.status === 'SUSPENDED' ? 'Wstrzymane' : 'Zamknięte',
          o.completionDate || '-'
        ]);
        break;
      case 'by-employee':
        filename = 'Raport_miesieczny_pracownicy.csv';
        reportTitle = 'Miesięczny raport czasu pracy pracowników';
        const empName = filterEmployeeId
          ? (employees.find(e => e.id === filterEmployeeId)?.fullName || filterEmployeeId)
          : 'Wszyscy pracownicy';
        filterItems = [
          { label: 'Pracownik', value: empName },
        ];
        headers = ['Pracownik', 'Suma godzin z nadgodzinami', 'Suma godzin bez nadgodzin', ...workTimeTypes.map(type => `${type.code} (${type.name})`)];
        rows = safeReportData.map(r => [
          r.employeeName,
          r.suma,
          r.sumaBezNadgodzin,
          ...workTimeTypes.map(type => Number(r[type.code]) || 0),
        ]);
        break;
      case 'by-account':
        filename = 'Raport_kont_ksiegowych.csv';
        reportTitle = 'Raport kont księgowych';
        filterItems = [
          { label: 'Konto księgowe', value: filterAccount.trim() ? filterAccount.trim() : 'Wszystkie konta' },
        ];
        headers = ['Data', 'Konto księgowe', 'Pracownik', 'Zlecenie', 'Produkt', 'Godziny', 'Kod czasu'];
        rows = safeReportData.map(r => [r.date, r.accountingAccount, r.employeeName, r.orderNumber, r.productName, r.hours, r.workTimeTypeCode]);
        break;
      case 'detailed':
        filename = 'Raport_szczegolowy_czasu_pracy.csv';
        reportTitle = 'Szczegółowy raport czasu pracy';
        const empNameDetailed = filterEmployeeId
          ? (employees.find(e => e.id === filterEmployeeId)?.fullName || filterEmployeeId)
          : 'Wszyscy pracownicy';
        const orderNumDetailed = filterOrderId
          ? (orders.find((o: any) => o.id === filterOrderId)?.orderNumber || filterOrderId)
          : 'Wszystkie zlecenia';
        filterItems = [
          { label: 'Pracownik', value: empNameDetailed },
          { label: 'Zlecenie', value: orderNumDetailed },
        ];
        headers = ['Data', 'Pracownik', 'Zlecenie', 'Kod produktu', 'Nazwa produktu', 'Konto księgowe', 'Godziny', 'Typ czasu', 'Wprowadził', 'Data wpisu'];
        rows = safeReportData.map(r => [r.date, r.employeeName, r.orderNumber, r.productCode, r.productName, r.accountingAccount, r.hours, r.workTimeTypeCode, r.creatorName, r.createdAt]);
        break;
      case 'absence-periods':
        filename = 'Raport_okresow_nieobecnosci.csv';
        reportTitle = 'Raport okresów nieobecności';
        const absenceEmployeeName = filterEmployeeId
          ? (employees.find(e => e.id === filterEmployeeId)?.fullName || filterEmployeeId)
          : 'Wszyscy pracownicy';
        const absenceTypeName = filterAbsenceType
          ? (() => {
              const type = workTimeTypes.find(t => t.code === filterAbsenceType);
              return type ? `${type.code} (${type.name})` : filterAbsenceType;
            })()
          : 'Wszystkie rodzaje nieobecności';
        filterItems = [
          { label: 'Pracownik', value: absenceEmployeeName },
          { label: 'Rodzaj nieobecności', value: absenceTypeName },
        ];
        headers = ['Imię i nazwisko', 'Rodzaj nieobecności', 'Od', 'Do', 'Liczba dni nieobecności'];
        rows = safeReportData.map(r => [r.employeeName, r.absenceType, r.dateFrom, r.dateTo, r.workingDays]);
        break;
    }

    const metadataLines = [
      `Raport;${escapeCsvValue(reportTitle)}`,
      `Zakres dat;${escapeCsvValue(dateRangeText)}`,
      ...filterItems.map(f => `${escapeCsvValue(f.label)};${escapeCsvValue(f.value)}`),
      `Wygenerowano;${escapeCsvValue(generatedAtText)}`,
      '',
    ];

    const tableLines = [
      headers.map(escapeCsvValue).join(';'),
      ...rows.map(row => row.map(escapeCsvValue).join(';'))
    ];

    if (activeReportTab === 'by-order' && filterClosureReport && controlSummary) {
      tableLines.push('');
      tableLines.push(escapeCsvValue('Kontrola rozliczenia czasu'));
      tableLines.push(`${escapeCsvValue('Godziny wg zleceń')};${escapeCsvValue(controlSummary.ordersHours.toFixed(2))}`);
      controlSummary.absences.forEach((abs) => {
        tableLines.push(`${escapeCsvValue(`${abs.code} (${abs.name})`)};${escapeCsvValue(abs.hours.toFixed(2))}`);
      });
      tableLines.push(`${escapeCsvValue('Łącznie rozliczono')};${escapeCsvValue(controlSummary.totalSettledHours.toFixed(2))}`);
      tableLines.push('');
      tableLines.push(`${escapeCsvValue('Suma godzin pracowników')};${escapeCsvValue(controlSummary.totalEmployeeHours.toFixed(2))}`);
      tableLines.push(`${escapeCsvValue('Różnica')};${escapeCsvValue(controlSummary.difference.toFixed(2))}`);
      tableLines.push(`${escapeCsvValue('Status')};${escapeCsvValue(controlSummary.statusLabel)}`);
    }

    const csvContent = "\uFEFF" + [...metadataLines, ...tableLines].join('\n');

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
    activeFilters.resetFilters();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
      {/* Tytuł */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', flexShrink: 0 }}>
        <FileDown size={28} />
        <h2 style={{ fontFamily: 'var(--font-header)', fontSize: '1.8rem', margin: 0 }}>
          Centrum Raportów
        </h2>
      </div>

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
          onClick={() => setActiveReportTab('by-order')}
          className={`nav-item ${activeReportTab === 'by-order' ? 'active' : ''}`}
          style={{ padding: '0.6rem 1.2rem', borderRadius: 'var(--radius-md) var(--radius-md) 0 0', border: '1px solid var(--border-color)', borderBottom: 'none' }}
        >
          <FolderOpen size={16} />
          Godziny wg Zleceń
        </button>
        <button 
          onClick={() => setActiveReportTab('by-employee')}
          className={`nav-item ${activeReportTab === 'by-employee' ? 'active' : ''}`}
          style={{ padding: '0.6rem 1.2rem', borderRadius: 'var(--radius-md) var(--radius-md) 0 0', border: '1px solid var(--border-color)', borderBottom: 'none' }}
        >
          <User size={16} />
          Wg Pracowników (Miesięczny)
        </button>
        <button 
          onClick={() => setActiveReportTab('by-account')}
          className={`nav-item ${activeReportTab === 'by-account' ? 'active' : ''}`}
          style={{ padding: '0.6rem 1.2rem', borderRadius: 'var(--radius-md) var(--radius-md) 0 0', border: '1px solid var(--border-color)', borderBottom: 'none' }}
        >
          <DollarSign size={16} />
          Wg Kont Księgowych
        </button>
        <button 
          onClick={() => setActiveReportTab('detailed')}
          className={`nav-item ${activeReportTab === 'detailed' ? 'active' : ''}`}
          style={{ padding: '0.6rem 1.2rem', borderRadius: 'var(--radius-md) var(--radius-md) 0 0', border: '1px solid var(--border-color)', borderBottom: 'none' }}
        >
          <Search size={16} />
          Raport Szczegółowy
        </button>
        <button
          onClick={() => setActiveReportTab('absence-periods')}
          className={`nav-item ${activeReportTab === 'absence-periods' ? 'active' : ''}`}
          style={{ padding: '0.6rem 1.2rem', borderRadius: 'var(--radius-md) var(--radius-md) 0 0', border: '1px solid var(--border-color)', borderBottom: 'none' }}
        >
          <CalendarOff size={16} />
          Okresy Nieobecności
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
            <label className="form-label" htmlFor="report-date-from">Data od</label>
            <input id="report-date-from" type="date" className="form-control" value={dateFrom} onChange={e => updateFilters({ dateFrom: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="report-date-to">Data do</label>
            <input id="report-date-to" type="date" className="form-control" value={dateTo} onChange={e => updateFilters({ dateTo: e.target.value })} />
          </div>

          {/* Conditional Filters depending on tab */}
          {activeReportTab === 'by-order' && (
            <>
              <div className="form-group">
                <label className="form-label" htmlFor="report-order-number">Numer zlecenia</label>
                <input 
                  id="report-order-number"
                  type="text" 
                  className="form-control" 
                  placeholder="np. ZL-2026" 
                  value={filterOrderNum} 
                  onChange={e => updateFilters({ orderNumber: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="report-order-status">Status zlecenia</label>
                <select id="report-order-status" className="form-control" value={filterStatus} disabled={filterClosureReport} onChange={e => updateFilters({ status: e.target.value })}>
                  <option value="">Wszystkie statusy</option>
                  <option value="OPEN">Otwarte</option>
                  <option value="SUSPENDED">Wstrzymane</option>
                  <option value="CLOSED">Zamknięte</option>
                </select>
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', marginTop: '1.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>
                  <input 
                    type="checkbox" 
                    checked={filterOnlyWithHours} 
                    disabled={filterClosureReport}
                    onChange={e => updateFilters({ onlyWithHours: e.target.checked })}
                  />
                  Pokaż tylko zlecenia z zaraportowanymi godzinami
                </label>
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${filterClosureReport ? 'btn-primary' : 'btn-secondary'}`}
                  aria-pressed={filterClosureReport}
                  onClick={() => updateFilters({ closureReport: !filterClosureReport })}
                  title="Pokaż otwarte zlecenia z godzinami oraz zlecenia zamknięte w wybranym okresie"
                >
                  {filterClosureReport && <CheckCircle size={14} />}
                  Raport zamknięcia
                </button>
              </div>
            </>
          )}

          {(activeReportTab === 'by-employee' || activeReportTab === 'detailed' || activeReportTab === 'absence-periods') && (
            <div className="form-group">
              <label className="form-label" htmlFor="report-employee">Pracownik</label>
              <select id="report-employee" className="form-control" value={filterEmployeeId} onChange={e => updateFilters({ employeeId: e.target.value })}>
                <option value="">Wszyscy pracownicy</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
              </select>
            </div>
          )}

          {activeReportTab === 'by-account' && (
            <div className="form-group">
              <label className="form-label" htmlFor="report-account">Konto księgowe</label>
              <input 
                id="report-account"
                type="text" 
                className="form-control" 
                placeholder="np. KK-902" 
                value={filterAccount} 
                onChange={e => updateFilters({ accountingAccount: e.target.value })}
              />
            </div>
          )}

          {activeReportTab === 'detailed' && (
            <div className="form-group">
              <label className="form-label" htmlFor="report-order">Zlecenie</label>
              <select id="report-order" className="form-control" value={filterOrderId} onChange={e => updateFilters({ orderId: e.target.value })}>
                <option value="">Wszystkie zlecenia</option>
                {orders.map(o => <option key={o.id} value={o.id}>{o.orderNumber} - {o.productName}</option>)}
              </select>
            </div>
          )}

          {activeReportTab === 'absence-periods' && (
            <div className="form-group">
              <label className="form-label" htmlFor="absence-type-filter">Rodzaj nieobecności</label>
              <select id="absence-type-filter" className="form-control" value={filterAbsenceType} onChange={e => updateFilters({ absenceType: e.target.value })}>
                <option value="">Wszystkie rodzaje nieobecności</option>
                {workTimeTypes
                  .filter(type => type.isAbsence)
                  .map(type => <option key={type.code} value={type.code}>{type.code} — {type.name}</option>)}
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
        <div className="card" style={{ padding: 0, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, maxWidth: '100%' }}>
          {activeReportTab === 'by-order' && (
            <ScrollableTable ariaLabel="Raport według zleceń" containerStyle={{ margin: 0, border: 'none' }}>
                <thead>
                  <tr>
                    <th>Numer zlecenia</th>
                    <th>Produkt</th>
                    <th>Kod produktu</th>
                    <th style={{ textAlign: 'right' }}>Ilość</th>
                    <th style={{ textAlign: 'right' }}>Godziny planowane</th>
                    <th style={{ textAlign: 'right' }}>Godziny rzeczywiste</th>
                    <th style={{ textAlign: 'right' }}>Odchylenie</th>
                    <th style={{ textAlign: 'right' }}>Wykorzystanie</th>
                    <th>Status</th>
                    <th>Rzeczywista data zakończenia</th>
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
                        <td style={{ textAlign: 'right' }}>
                          {row.quantity !== null && row.quantity !== undefined ? `${row.quantity} ${row.quantityUnit || 'szt.'}` : '-'}
                        </td>
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
                        <td style={{ whiteSpace: 'nowrap' }}>{row.completionDate || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
            </ScrollableTable>
          )}

          {activeReportTab === 'by-employee' && (
            <ScrollableTable ariaLabel="Raport według pracowników" containerStyle={{ margin: 0, border: 'none' }}>
                <thead>
                  <tr>
                    <th>Pracownik</th>
                    <th style={{ textAlign: 'right', fontWeight: 'bold' }}>Suma godzin z nadgodzinami</th>
                    <th style={{ textAlign: 'right', fontWeight: 'bold' }}>Suma godzin bez nadgodzin</th>
                    {workTimeTypes.map((type) => (
                      <th key={type.code} style={{ textAlign: 'right' }}>
                        {type.code} ({type.name})
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(reportData) && reportData.map((row, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 'bold' }}>{row.employeeName}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '0.95rem', color: 'var(--primary-color)' }}>
                        {(Number(row.suma) || 0).toFixed(1)} h
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '0.95rem', color: 'var(--success-color)' }}>
                        {(Number(row.sumaBezNadgodzin) || 0).toFixed(1)} h
                      </td>
                      {workTimeTypes.map((type) => (
                        <td key={type.code} style={{ textAlign: 'right' }}>
                          {(Number(row[type.code]) || 0).toFixed(1)} h
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
            </ScrollableTable>
          )}

          {activeReportTab === 'by-account' && (
            <ScrollableTable ariaLabel="Raport kont księgowych" containerStyle={{ margin: 0, border: 'none' }}>
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
            </ScrollableTable>
          )}

          {activeReportTab === 'detailed' && (
            <ScrollableTable ariaLabel="Raport szczegółowy" containerStyle={{ margin: 0, border: 'none' }}>
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
            </ScrollableTable>
          )}

          {activeReportTab === 'absence-periods' && (
            <ScrollableTable ariaLabel="Raport okresów nieobecności" containerStyle={{ margin: 0, border: 'none' }}>
              <thead>
                <tr>
                  <th>Imię i nazwisko</th>
                  <th>Rodzaj nieobecności</th>
                  <th>Od</th>
                  <th>Do</th>
                  <th style={{ textAlign: 'right' }}>Liczba dni nieobecności</th>
                </tr>
              </thead>
              <tbody>
                {Array.isArray(reportData) && reportData.map((row, idx) => (
                  <tr key={`${row.employeeId}-${row.workTimeTypeCode}-${row.dateFrom}-${idx}`}>
                    <td style={{ fontWeight: 600 }}>{row.employeeName}</td>
                    <td>{row.absenceType}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{row.dateFrom}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{row.dateTo}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{row.workingDays}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollableTable>
          )}
        </div>
      )}

      {/* Sekcja kontroli rozliczenia czasu (widoczna wyłącznie w trybie Raport zamknięcia) */}
      {activeReportTab === 'by-order' && filterClosureReport && (
        <div
          className="card"
          data-testid="closure-control-summary"
          style={{ marginTop: '1.25rem', padding: '1.25rem', flexShrink: 0 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle size={20} style={{ color: 'var(--primary-color)' }} />
              Kontrola rozliczenia czasu
            </h3>
            {controlSummary && (
              <span
                data-testid="control-summary-status-badge"
                className={`badge ${controlSummary.status === 'MATCHED' ? 'badge-open' : 'badge-danger'}`}
                style={{
                  fontSize: '0.95rem',
                  padding: '0.35rem 0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                Status: {controlSummary.statusLabel}
              </span>
            )}
          </div>

          {loadingControlSummary ? (
            <div style={{ color: 'var(--text-muted)', padding: '1rem 0', textAlign: 'center' }}>
              Obliczanie sum kontrolnych...
            </div>
          ) : !dateFrom || !dateTo ? (
            <div style={{ color: 'var(--text-muted)', padding: '1rem 0' }}>
              Wybierz prawidłowy zakres dat (od i do), aby obliczyć sumy kontrolne.
            </div>
          ) : !controlSummary ? (
            <div style={{ color: 'var(--text-muted)', padding: '1rem 0' }}>
              Brak danych kontrolnych dla wybranego okresu.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginTop: '0.5rem' }}>
              {/* Kolumna 1: Rozliczenie czasu (Zlecenia + Nieobecności) */}
              <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Składniki rozliczonego czasu
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.25rem' }}>
                    <span>Godziny wg zleceń:</span>
                    <strong data-testid="control-orders-hours">{(Number(controlSummary.ordersHours) || 0).toFixed(2)} h</strong>
                  </div>
                  {Array.isArray(controlSummary.absences) && controlSummary.absences.length > 0 && (
                    <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem', fontWeight: 600 }}>
                        Nieobecności:
                      </div>
                      {controlSummary.absences.map((abs) => (
                        <div key={abs.code} style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '0.5rem', marginBottom: '0.25rem' }}>
                          <span>{abs.code} <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>({abs.name})</span>:</span>
                          <span>{(Number(abs.hours) || 0).toFixed(2)} h</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', marginTop: '0.5rem', fontSize: '1rem' }}>
                    <strong>Łącznie rozliczono:</strong>
                    <strong data-testid="control-total-settled">{(Number(controlSummary.totalSettledHours) || 0).toFixed(2)} h</strong>
                  </div>
                </div>
              </div>

              {/* Kolumna 2: Porównanie i weryfikacja */}
              <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Zgodność z raportem miesięcznym
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.25rem' }}>
                    <span>Suma godzin pracowników:</span>
                    <strong data-testid="control-employee-hours">{(Number(controlSummary.totalEmployeeHours) || 0).toFixed(2)} h</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.25rem' }}>
                    <span>Łącznie rozliczono:</span>
                    <span>{(Number(controlSummary.totalSettledHours) || 0).toFixed(2)} h</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', marginTop: '0.5rem', fontSize: '1rem' }}>
                    <strong>Różnica:</strong>
                    <strong
                      data-testid="control-difference"
                      style={{
                        color: (Number(controlSummary.difference) || 0) === 0 ? 'var(--success-color)' : 'var(--danger-color)',
                      }}
                    >
                      {(Number(controlSummary.difference) || 0) > 0 ? `+${(Number(controlSummary.difference) || 0).toFixed(2)}` : (Number(controlSummary.difference) || 0).toFixed(2)} h
                    </strong>
                  </div>
                  <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', backgroundColor: controlSummary.status === 'MATCHED' ? 'rgba(46, 125, 50, 0.08)' : 'rgba(198, 40, 40, 0.08)', border: `1px solid ${controlSummary.status === 'MATCHED' ? 'var(--success-border)' : 'var(--danger-border)'}` }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: controlSummary.status === 'MATCHED' ? 'var(--success-color)' : 'var(--danger-color)' }}>
                      {controlSummary.status === 'MATCHED'
                        ? '✓ Całkowity czas pracowników został w 100% rozliczony na zlecenia i usprawiedliwione nieobecności.'
                        : `⚠ Wykryto niezgodność rozliczenia czasu (${(Number(controlSummary.difference) || 0).toFixed(2)} h). Sprawdź nieprzypisane wpisy lub brakujące zlecenia.`}
                    </span>
                  </div>
                </div>
              </div>
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
