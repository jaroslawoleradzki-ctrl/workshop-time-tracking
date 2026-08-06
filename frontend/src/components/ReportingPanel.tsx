import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, 
  ArrowRight, 
  Save, 
  Trash2, 
  Copy, 
  AlertTriangle,
  HelpCircle,
  Plus,
  Search,
  Clock,
  Calendar
} from 'lucide-react';
import type { UserSession } from '../App';
import AbsenceRangeModal from './AbsenceRangeModal';

interface Employee {
  id: string;
  fullName: string;
  firstName?: string | null;
  lastName?: string | null;
  isActive: boolean;
}

interface Order {
  id: string;
  orderNumber: string;
  productCode: string;
  productName: string;
  accountingAccount: string;
}

interface WorkTimeType {
  code: string;
  name: string;
  requiresOrder: boolean;
  isAbsence: boolean;
}

interface ReportEntry {
  id: string;
  date: string;
  employeeId: string;
  orderId: string | null;
  hours: number;
  workTimeTypeCode: string;
  missingCard?: boolean;
  order?: {
    orderNumber: string;
    productCode: string;
    productName: string;
    accountingAccount: string;
  } | null;
  workTimeType: {
    code: string;
    name: string;
    requiresOrder: boolean;
  };
}

interface WarningResponse {
  warnStandard: boolean;
  warnTotal12: boolean;
  warnTotal24: boolean;
  totalStandard: number;
  totalHours: number;
}

interface ReportingPanelProps {
  token: string;
  user: UserSession;
}

export default function ReportingPanel({ token }: ReportingPanelProps) {
  // Global Dictionaries
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [workTypes, setWorkTypes] = useState<WorkTimeType[]>([]);

  // Selection states
  const [currentDate, setCurrentDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  const handleSetToday = () => {
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const localToday = new Date(today.getTime() - (offset * 60 * 1000));
    setCurrentDate(localToday.toISOString().split('T')[0]);
  };

  const handlePrevDay = () => {
    const parts = currentDate.split('-');
    if (parts.length !== 3) return;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    d.setDate(d.getDate() - 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setCurrentDate(`${yyyy}-${mm}-${dd}`);
  };

  const handleNextDay = () => {
    const parts = currentDate.split('-');
    if (parts.length !== 3) return;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    d.setDate(d.getDate() + 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setCurrentDate(`${yyyy}-${mm}-${dd}`);
  };
  const [currentEmployeeIdx, setCurrentEmployeeIdx] = useState<number>(0);

  const currentEmployee = employees[currentEmployeeIdx];
  const [showAbsenceModal, setShowAbsenceModal] = useState(false);
  
  // Form input states
  const [searchOrderQuery, setSearchOrderQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [hoursInput, setHoursInput] = useState('8.00');
  const [selectedWorkType, setSelectedWorkType] = useState('G');
  const [missingCard, setMissingCard] = useState(false);
  
  // Autocomplete UI states
  const [showOrderAutocomplete, setShowOrderAutocomplete] = useState(false);
  const [autocompleteHighlightIdx, setAutocompleteHighlightIdx] = useState(-1);
  const safeActiveOrders = Array.isArray(activeOrders) ? activeOrders : [];
  const filteredOrders = safeActiveOrders.filter(
    o => 
      (o?.orderNumber?.toLowerCase() || '').includes(searchOrderQuery.toLowerCase()) ||
      (o?.productCode?.toLowerCase() || '').includes(searchOrderQuery.toLowerCase()) ||
      (o?.productName?.toLowerCase() || '').includes(searchOrderQuery.toLowerCase())
  );

  // Employee autocomplete states
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState('');
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [employeeHighlightIdx, setEmployeeHighlightIdx] = useState(-1);

  const displayEmployeeName = currentEmployee ? (currentEmployee.firstName && currentEmployee.lastName ? `${currentEmployee.firstName} ${currentEmployee.lastName}` : currentEmployee.fullName) : '';

  const filteredEmployees = employees.filter(e => {
    const query = employeeSearchQuery.toLowerCase().trim();
    if (!query) return true;
    const firstMatch = e.firstName && e.firstName.toLowerCase().includes(query);
    const lastMatch = e.lastName && e.lastName.toLowerCase().includes(query);
    const fullMatch = e.fullName.toLowerCase().includes(query);
    return firstMatch || lastMatch || fullMatch;
  });

  // Edit Mode state
  const [editingReportId, setEditingReportId] = useState<string | null>(null);

  // Current reported entries list
  const [dayEntries, setDayEntries] = useState<ReportEntry[]>([]);
  
  // Notifications & Alerts
  const [successNotification, setSuccessNotification] = useState('');
  const [warningData, setWarningData] = useState<WarningResponse | null>(null);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [isCopyingPreviousDay, setIsCopyingPreviousDay] = useState(false);

  // Refs for Keyboard Navigation Focus
  const orderInputRef = useRef<HTMLInputElement>(null);
  const hoursInputRef = useRef<HTMLInputElement>(null);
  const saveBtnRef = useRef<HTMLButtonElement>(null);
  const autocompleteContainerRef = useRef<HTMLDivElement>(null);
  const employeeDropdownRef = useRef<HTMLDivElement>(null);
  const copyPreviousDayInFlightRef = useRef(false);
  const currentSelectionRef = useRef<{ employeeId: string | null; date: string }>({
    employeeId: null,
    date: currentDate,
  });

  currentSelectionRef.current = {
    employeeId: currentEmployee?.id || null,
    date: currentDate,
  };

  // 1. Initial Load: Dictionaries
  useEffect(() => {
    const fetchDictionaries = async () => {
      try {
        const headers = { 'Authorization': `Bearer ${token}` };

        // Fetch active employees
        const empRes = await fetch('/api/employees?activeOnly=true', { headers });
        if (empRes.ok) {
          const empData = await empRes.json();
          setEmployees(Array.isArray(empData) ? empData : []);
        } else {
          setEmployees([]);
        }

        // Fetch active orders (only open orders)
        const orderRes = await fetch('/api/orders/active', { headers });
        if (orderRes.ok) {
          const orderData = await orderRes.json();
          if (Array.isArray(orderData)) {
            setActiveOrders(orderData);
          } else {
            setActiveOrders([]);
            setValidationError('Błąd: Nieprawidłowy format listy zleceń.');
          }
        } else {
          setActiveOrders([]);
          if (orderRes.status === 401 || orderRes.status === 403) {
            setValidationError('Błąd autoryzacji. Sesja mogła wygasnąć. Zaloguj się ponownie.');
            window.dispatchEvent(new CustomEvent('auth-error', { detail: { status: orderRes.status } }));
          } else {
            setValidationError(`Błąd pobierania zleceń: Status ${orderRes.status}`);
          }
        }

        // Fetch work time types
        const typeRes = await fetch('/api/work-time-types', { headers });
        if (typeRes.ok) {
          const typeData = await typeRes.json();
          setWorkTypes(Array.isArray(typeData) ? typeData : []);
        } else {
          setWorkTypes([]);
        }
      } catch (err: any) {
        console.error('Błąd podczas ładowania słowników:', err);
        setValidationError('Wystąpił problem z połączeniem lub pobieraniem słowników.');
        setActiveOrders([]);
      }
    };

    fetchDictionaries();
  }, [token]);

  // 2. Load Day Entries when date or employee changes
  useEffect(() => {
    if (currentEmployee) {
      fetchDayEntries(currentEmployee.id, currentDate);
      resetForm();
    }
  }, [currentEmployeeIdx, currentDate, employees]);

  const fetchDayEntries = async (employeeId: string, date: string) => {
    try {
      const res = await fetch(`/api/reports/by-employee-date?employeeId=${employeeId}&date=${date}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDayEntries(data);
    } catch (err) {
      console.error('Błąd pobierania wpisów pracownika:', err);
    }
  };

  // Close autocompletes on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        autocompleteContainerRef.current && 
        !autocompleteContainerRef.current.contains(e.target as Node)
      ) {
        setShowOrderAutocomplete(false);
      }
      if (
        employeeDropdownRef.current &&
        !employeeDropdownRef.current.contains(e.target as Node)
      ) {
        setShowEmployeeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Show a disappearing success notification
  const notifySuccess = (msg: string) => {
    setSuccessNotification(msg);
    setTimeout(() => {
      setSuccessNotification('');
    }, 4000);
  };

  // Reset Form
  const resetForm = () => {
    setSearchOrderQuery('');
    setSelectedOrder(null);
    setHoursInput('8.00');
    setSelectedWorkType('G');
    setMissingCard(false);
    setValidationError('');
    setEditingReportId(null);
    setAutocompleteHighlightIdx(-1);
    setShowOrderAutocomplete(false);
  };

  // Navigation handlers
  const handlePrevEmployee = () => {
    if (employees.length === 0) return;
    setCurrentEmployeeIdx(prev => (prev === 0 ? employees.length - 1 : prev - 1));
  };

  const handleNextEmployee = () => {
    if (employees.length === 0) return;
    setCurrentEmployeeIdx(prev => (prev === employees.length - 1 ? 0 : prev + 1));
  };

  const getFormattedEmployeeName = (emp: Employee) => {
    return emp.firstName && emp.lastName ? `${emp.firstName} ${emp.lastName}` : emp.fullName;
  };

  const selectEmployee = (emp: Employee) => {
    const idx = employees.findIndex(e => e.id === emp.id);
    if (idx >= 0) {
      setCurrentEmployeeIdx(idx);
    }
    setShowEmployeeDropdown(false);
  };

  const handleEmployeeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showEmployeeDropdown) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setShowEmployeeDropdown(true);
        setEmployeeSearchQuery('');
        setEmployeeHighlightIdx(-1);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setEmployeeHighlightIdx(prev => 
        prev < filteredEmployees.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setEmployeeHighlightIdx(prev => 
        prev > 0 ? prev - 1 : filteredEmployees.length - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (employeeHighlightIdx >= 0 && employeeHighlightIdx < filteredEmployees.length) {
        selectEmployee(filteredEmployees[employeeHighlightIdx]);
      } else if (filteredEmployees.length > 0) {
        selectEmployee(filteredEmployees[0]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowEmployeeDropdown(false);
    }
  };

  // Order Autocomplete click selection
  const handleSelectOrder = (order: Order) => {
    setSelectedOrder(order);
    setSearchOrderQuery(order.orderNumber);
    setShowOrderAutocomplete(false);
    setValidationError('');
    // Automatically focus the Hours field after order selection
    setTimeout(() => {
      hoursInputRef.current?.focus();
      hoursInputRef.current?.select();
    }, 50);
  };

  // Keyboard navigation for Order Autocomplete & Input hopping
  const handleOrderInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showOrderAutocomplete) {
      if (e.key === 'ArrowDown') {
        setShowOrderAutocomplete(true);
        setAutocompleteHighlightIdx(0);
        e.preventDefault();
      }
      if (e.key === 'Enter') {
        // If order already selected, move to hours
        if (selectedOrder) {
          hoursInputRef.current?.focus();
          hoursInputRef.current?.select();
        } else if (filteredOrders.length > 0) {
          // Select first
          handleSelectOrder(filteredOrders[0]);
        }
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        setAutocompleteHighlightIdx(prev => 
          prev < filteredOrders.length - 1 ? prev + 1 : 0
        );
        e.preventDefault();
        break;
      case 'ArrowUp':
        setAutocompleteHighlightIdx(prev => 
          prev > 0 ? prev - 1 : filteredOrders.length - 1
        );
        e.preventDefault();
        break;
      case 'Enter':
        if (autocompleteHighlightIdx >= 0 && autocompleteHighlightIdx < filteredOrders.length) {
          handleSelectOrder(filteredOrders[autocompleteHighlightIdx]);
        } else if (filteredOrders.length > 0) {
          handleSelectOrder(filteredOrders[0]);
        }
        e.preventDefault();
        break;
      case 'Escape':
        setShowOrderAutocomplete(false);
        setAutocompleteHighlightIdx(-1);
        e.preventDefault();
        break;
    }
  };

  // Save/Submit Form logic
  const handleFormSubmit = async (e?: React.FormEvent, bypassWarningsCheck = false) => {
    if (e) e.preventDefault();
    setValidationError('');

    if (employees.length === 0 || !currentEmployee) {
      setValidationError('Brak załadowanych pracowników.');
      return;
    }

    const currentType = workTypes.find(t => t.code === selectedWorkType);
    if (!currentType) {
      setValidationError('Nieprawidłowy kod rodzaju czasu pracy.');
      return;
    }

    if (currentType.requiresOrder && !selectedOrder) {
      setValidationError(`Dla rodzaju '${selectedWorkType}' numer zlecenia jest wymagany.`);
      orderInputRef.current?.focus();
      return;
    }

    const hours = parseFloat(hoursInput);
    if (isNaN(hours) || hours <= 0) {
      setValidationError('Wprowadź prawidłową liczbę godzin większą od zera.');
      hoursInputRef.current?.focus();
      hoursInputRef.current?.select();
      return;
    }

    // Pre-flight warning check
    if (!bypassWarningsCheck) {
      try {
        const checkRes = await fetch('/api/reports/check-warnings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            employeeId: currentEmployee.id,
            date: currentDate,
            hours,
            workTimeTypeCode: selectedWorkType,
            excludeReportId: editingReportId || undefined
          })
        });

        if (checkRes.ok) {
          const warnings: WarningResponse = await checkRes.json();
          if (warnings.warnStandard || warnings.warnTotal12 || warnings.warnTotal24) {
            setWarningData(warnings);
            setShowWarningModal(true);
            return; // Halt and show warning modal
          }
        }
      } catch (err) {
        console.error('Pre-flight warning calculation failed:', err);
      }
    }

    // Save
    saveReport(hours);
  };

  const saveReport = async (hours: number) => {
    try {
      const url = editingReportId ? `/api/reports/${editingReportId}` : '/api/reports';
      const method = editingReportId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          date: currentDate,
          employeeId: currentEmployee.id,
          orderId: selectedOrder?.id || null,
          hours,
          workTimeTypeCode: selectedWorkType,
          missingCard
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Błąd zapisu');
      }

      notifySuccess(editingReportId ? 'Wpis został zmodyfikowany.' : 'Wpis został dodany.');
      resetForm();
      fetchDayEntries(currentEmployee.id, currentDate);
      setShowWarningModal(false);
      setWarningData(null);

      // Return focus to order search input for mouse-free logging!
      setTimeout(() => {
        orderInputRef.current?.focus();
      }, 50);
    } catch (err: any) {
      setValidationError(err.message || 'Wystąpił błąd podczas zapisu.');
    }
  };

  // Edit current report handler
  const handleEditEntry = (entry: ReportEntry) => {
    setEditingReportId(entry.id);
    setSelectedWorkType(entry.workTimeTypeCode);
    setHoursInput(entry.hours.toString());
    
    if (entry.order) {
      const matchedOrder = Array.isArray(activeOrders) ? activeOrders.find(o => o?.orderNumber === entry.order?.orderNumber) : undefined;
      if (matchedOrder) {
        setSelectedOrder(matchedOrder);
        setSearchOrderQuery(matchedOrder.orderNumber);
      } else {
        // Fallback for orders that might be closed but are in report
        const fallbackOrder: Order = {
          id: entry.orderId || '',
          orderNumber: entry.order.orderNumber,
          productCode: entry.order.productCode,
          productName: entry.order.productName,
          accountingAccount: entry.order.accountingAccount
        };
        setSelectedOrder(fallbackOrder);
        setSearchOrderQuery(fallbackOrder.orderNumber);
      }
    } else {
      setSelectedOrder(null);
      setSearchOrderQuery('');
    }

    setMissingCard(!!entry.missingCard);
    setValidationError('');
    // Focus hours
    setTimeout(() => {
      hoursInputRef.current?.focus();
      hoursInputRef.current?.select();
    }, 50);
  };

  // Soft Delete report handler
  const handleDeleteEntry = async (id: string) => {
    if (!confirm('Czy na pewno chcesz usunąć ten wpis?')) return;
    try {
      const res = await fetch(`/api/reports/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      notifySuccess('Wpis został usunięty.');
      fetchDayEntries(currentEmployee.id, currentDate);
    } catch (err) {
      alert('Nie udało się usunąć wpisu.');
    }
  };

  // Copy Previous Day handler
  const handleCopyPreviousDay = async () => {
    if (copyPreviousDayInFlightRef.current) return;

    if (!currentEmployee) {
      setValidationError('Wybierz pracownika przed skopiowaniem ostatniego dnia.');
      return;
    }

    copyPreviousDayInFlightRef.current = true;
    setIsCopyingPreviousDay(true);
    setValidationError('');

    const employeeId = currentEmployee.id;
    const targetDate = currentDate;

    try {
      const res = await fetch('/api/reports/copy-last-day', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          employeeId,
          date: targetDate,
        })
      });

      const data = await res.json();

      if (res.status === 409) {
        setValidationError('Dzień docelowy zawiera już wpisy tego pracownika. Kopiowanie nie zostało wykonane.');
        return;
      }

      if (!res.ok) {
        throw new Error(data.message || 'Błąd kopiowania');
      }

      notifySuccess(`Skopiowano ${data.createdCount} wpisów z dnia ${data.sourceDate}.`);

      const currentSelection = currentSelectionRef.current;
      if (currentSelection.employeeId) {
        await fetchDayEntries(currentSelection.employeeId, currentSelection.date);
      }
    } catch (err: any) {
      setValidationError(err.message || 'Wystąpił błąd podczas kopiowania poprzedniego dnia.');
    } finally {
      copyPreviousDayInFlightRef.current = false;
      setIsCopyingPreviousDay(false);
    }
  };

  // Sum hours reported today
  const totalHoursToday = dayEntries.reduce((sum, entry) => sum + entry.hours, 0);

  return (
    <div>
      {/* Top Banner Success Notification */}
      {successNotification && (
        <div className="alert alert-success" style={{ 
          position: 'fixed', 
          top: '20px', 
          right: '20px', 
          zIndex: 9999,
          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
        }}>
          {successNotification}
        </div>
      )}

      {/* Warning dialog modal */}
      {showWarningModal && warningData && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ borderColor: 'var(--warning-color)' }}>
            <h3 className="modal-header" style={{ color: 'var(--warning-color)' }}>
              <AlertTriangle size={24} />
              Ostrzeżenie o wymiarze czasu pracy!
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <p>Wprowadzany czas pracy powoduje przekroczenie norm dobowych dla pracownika:</p>
              <p style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{currentEmployee?.fullName}</p>
              
              <ul style={{ paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {warningData.warnStandard && (
                  <li style={{ color: 'var(--warning-color)', fontWeight: 600 }}>
                    Przekroczenie 8 standardowych godzin pracy (Suma: {warningData.totalStandard}h).
                  </li>
                )}
                {warningData.warnTotal12 && !warningData.warnTotal24 && (
                  <li style={{ color: 'var(--warning-color)', fontWeight: 600 }}>
                    Łączny czas pracy przekracza 12 godzin w dobie (Suma: {warningData.totalHours}h).
                  </li>
                )}
                {warningData.warnTotal24 && (
                  <li style={{ color: 'var(--danger-color)', fontWeight: 700 }}>
                    KRYTYCZNE OSTRZEŻENIE: Łączny czas pracy przekracza 24 godziny (Suma: {warningData.totalHours}h).
                  </li>
                )}
              </ul>
              <p style={{ marginTop: '0.5rem', fontStyle: 'italic', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                System umożliwia rejestrację w celach historycznych lub korekt.
              </p>
            </div>

            <div className="modal-actions">
              <button 
                className="btn btn-secondary" 
                onClick={() => {
                  setShowWarningModal(false);
                  setWarningData(null);
                }}
              >
                Anuluj
              </button>
              <button 
                className="btn btn-primary" 
                style={{ backgroundColor: 'var(--warning-color)' }}
                onClick={() => handleFormSubmit(undefined, true)} // Save directly bypassing check
              >
                Ignoruj i zapisz
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tytuł */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', flexShrink: 0 }}>
        <Clock size={28} />
        <h2 style={{ fontFamily: 'var(--font-header)', fontSize: '1.8rem', margin: 0 }}>
          Raportowanie Godzin Pracy
        </h2>
      </div>

      {/* Główna akcja (Wybór daty) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', flexShrink: 0 }}>
        <label htmlFor="dateInput" className="form-label" style={{ margin: 0 }}>Data raportu:</label>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handlePrevDay}
          style={{ padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title="Poprzedni dzień"
        >
          ◀
        </button>
        <input 
          id="dateInput"
          type="date" 
          className="form-control" 
          style={{ width: '170px', padding: '0.5rem 0.75rem' }}
          value={currentDate}
          onChange={e => setCurrentDate(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleNextDay}
          style={{ padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title="Następny dzień"
        >
          ▶
        </button>
        <button
          className="btn btn-primary"
          onClick={handleSetToday}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.75rem' }}
        >
          <Calendar size={16} />
          <span>Dzisiaj</span>
        </button>
      </div>

      {/* Employee Navigation Bar */}
      {employees.length > 0 && currentEmployee && (
        <div className="employee-nav-header">
          <button className="btn btn-secondary" onClick={handlePrevEmployee}>
            <ArrowLeft size={16} />
            <span className="hide-mobile">Poprzedni pracownik</span>
          </button>

          <div style={{ position: 'relative', width: '320px', textAlign: 'left' }} ref={employeeDropdownRef}>
            <div className="employee-label" style={{ marginBottom: '0.25rem', textAlign: 'center' }}>
              Wyszukaj pracownika ({currentEmployeeIdx + 1} z {employees.length})
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="form-control"
                style={{ paddingLeft: '38px', fontWeight: 'bold' }}
                value={showEmployeeDropdown ? employeeSearchQuery : displayEmployeeName}
                onChange={e => {
                  setEmployeeSearchQuery(e.target.value);
                  setEmployeeHighlightIdx(-1);
                }}
                onFocus={() => {
                  setShowEmployeeDropdown(true);
                  setEmployeeSearchQuery('');
                  setEmployeeHighlightIdx(-1);
                }}
                onKeyDown={handleEmployeeKeyDown}
                placeholder="Wyszukaj pracownika..."
                autoComplete="off"
              />
            </div>
            
            {showEmployeeDropdown && (
              <div className="autocomplete-dropdown" style={{ width: '100%' }}>
                {filteredEmployees.length === 0 ? (
                  <div style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    Brak wyników
                  </div>
                ) : (
                  filteredEmployees.map((emp, idx) => (
                    <div
                      key={emp.id}
                      className={`autocomplete-item ${idx === employeeHighlightIdx ? 'selected' : ''}`}
                      onClick={() => selectEmployee(emp)}
                      style={{ fontWeight: 'bold' }}
                    >
                      {getFormattedEmployeeName(emp)}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <button className="btn btn-secondary" onClick={handleNextEmployee}>
            <span className="hide-mobile">Następny pracownik</span>
            <ArrowRight size={16} />
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* Left Column: Form */}
        <div className="card">
          <h3 className="card-title">
            <Plus size={18} />
            {editingReportId ? 'Edytuj wpis czasu pracy' : 'Nowy wpis czasu pracy'}
          </h3>

          <form onSubmit={e => handleFormSubmit(e)}>
            {validationError && (
              <div className="alert alert-danger" style={{ padding: '0.75rem', fontSize: '0.85rem' }}>
                {validationError}
              </div>
            )}

            {/* Type selector */}
            <div className="form-group">
              <label className="form-label">Rodzaj czasu pracy</label>
              <select
                className="form-control"
                value={selectedWorkType}
                onChange={e => {
                  setSelectedWorkType(e.target.value);
                  setValidationError('');
                }}
              >
                {Array.isArray(workTypes) && workTypes.map(t => (
                  <option key={t.code} value={t.code}>
                    {t.code} - {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Order Autocomplete search */}
            {workTypes.find(t => t.code === selectedWorkType)?.requiresOrder && (
              <div className="form-group" ref={autocompleteContainerRef}>
                <label className="form-label">Numer zlecenia</label>
                <div className="autocomplete-container">
                  <input
                    type="text"
                    ref={orderInputRef}
                    className="form-control"
                    placeholder="Wpisz numer zlecenia lub produktu..."
                    value={searchOrderQuery}
                    onChange={e => {
                      setSearchOrderQuery(e.target.value);
                      setSelectedOrder(null); // Clear selected order if text changed
                      setShowOrderAutocomplete(true);
                      setAutocompleteHighlightIdx(-1);
                    }}
                    onFocus={() => setShowOrderAutocomplete(true)}
                    onKeyDown={handleOrderInputKeyDown}
                    autoComplete="off"
                  />
                  {showOrderAutocomplete && filteredOrders.length > 0 && (
                    <div className="autocomplete-dropdown">
                      {filteredOrders.map((order, idx) => (
                        <div
                          key={order.id}
                          className={`autocomplete-item ${idx === autocompleteHighlightIdx ? 'selected' : ''}`}
                          onClick={() => handleSelectOrder(order)}
                        >
                          <div className="order-title">Zlecenie: {order.orderNumber}</div>
                          <div className="order-sub">
                            Produkt: {order.productCode} - {order.productName} | Konto: {order.accountingAccount}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Display auto-filled info */}
                {selectedOrder && (
                  <div style={{ 
                    marginTop: '0.75rem', 
                    padding: '0.75rem', 
                    backgroundColor: 'var(--bg-tertiary)', 
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                    fontSize: '0.85rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem'
                  }}>
                    <div><span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Produkt:</span> {selectedOrder.productCode} - {selectedOrder.productName}</div>
                    <div><span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Konto księgowe:</span> {selectedOrder.accountingAccount}</div>
                  </div>
                )}
              </div>
            )}

            {/* Hours and Action Row */}
            <div className="form-row" style={{ marginTop: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Liczba godzin</label>
                <input
                  type="text"
                  ref={hoursInputRef}
                  className="form-control"
                  value={hoursInput}
                  onChange={e => setHoursInput(e.target.value)}
                  placeholder="np. 8.00"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleFormSubmit();
                    }
                  }}
                />
              </div>
            </div>

            {/* Checkbox Brak karty */}
            <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
              <input
                type="checkbox"
                id="missingCard"
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                checked={missingCard}
                onChange={e => setMissingCard(e.target.checked)}
              />
              <label htmlFor="missingCard" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>
                Brak karty
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button 
                type="submit" 
                ref={saveBtnRef}
                className="btn btn-primary" 
                style={{ flex: 1 }}
              >
                <Save size={18} />
                {editingReportId ? 'Zapisz zmiany' : 'Zapisz wpis (Enter)'}
              </button>
              {editingReportId && (
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={resetForm}
                >
                  Anuluj
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Right Column: Day List */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontFamily: 'var(--font-header)' }}>
              Wpisy z dnia ({totalHoursToday.toFixed(1)} h)
            </h3>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {currentEmployee && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowAbsenceModal(true)}
                  title="Dodaj nieobecność w zakresie dat dla wybranego pracownika"
                >
                  <Calendar size={14} />
                  Dodaj nieobecność
                </button>
              )}
              <button 
                type="button"
                className="btn btn-secondary btn-sm" 
                onClick={handleCopyPreviousDay}
                disabled={isCopyingPreviousDay}
                aria-busy={isCopyingPreviousDay}
                title={isCopyingPreviousDay ? 'Kopiowanie wpisów w toku' : 'Kopiuj z ostatniego dnia, w którym są zaraportowane godziny'}
              >
                <Copy size={14} />
                {isCopyingPreviousDay ? 'Kopiowanie...' : 'Kopiuj ostatni dzień'}
              </button>
            </div>
          </div>

          {dayEntries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
              <HelpCircle size={36} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
              <p>Brak wpisów dla tego pracownika w wybranym dniu.</p>
              <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>Wprowadź dane po lewej lub skopiuj ostatni dzień.</p>
            </div>
          ) : (
            <div className="table-container" style={{ border: 'none', marginTop: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Typ</th>
                    <th>Zlecenie / Produkt</th>
                    <th style={{ textAlign: 'right' }}>Godziny</th>
                    <th style={{ textAlign: 'center' }}>Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(dayEntries) && dayEntries.map(entry => (
                    <tr key={entry.id} style={{ 
                      backgroundColor: editingReportId === entry.id ? 'var(--primary-glow)' : 'transparent' 
                    }}>
                      <td>
                        <span style={{ 
                          fontWeight: 700, 
                          color: entry.workTimeTypeCode === 'G' ? 'var(--success-color)' : 'var(--warning-color)',
                          fontSize: '0.95rem'
                        }}>
                          {entry.workTimeTypeCode}
                        </span>
                        {entry.missingCard && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--danger-color)', marginTop: '0.15rem', fontWeight: 'bold' }}>
                            Brak karty
                          </div>
                        )}
                      </td>
                      <td>
                        {entry.order ? (
                          <div>
                            <div style={{ fontWeight: 'bold' }}>{entry.order.orderNumber}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {entry.order.productName}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            Brak zlecenia ({entry.workTimeType.name})
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '0.95rem' }}>
                        {entry.hours.toFixed(1)}h
                      </td>
                      <td>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                          <button 
                            className="btn btn-secondary btn-sm" 
                            style={{ padding: '0.25rem 0.5rem' }}
                            onClick={() => handleEditEntry(entry)}
                            title="Edytuj wpis"
                          >
                            Edytuj
                          </button>
                          <button 
                            className="btn btn-danger btn-sm" 
                            style={{ padding: '0.25rem 0.5rem', backgroundColor: 'transparent', color: 'var(--danger-color)', borderColor: 'var(--danger-border)' }}
                            onClick={() => handleDeleteEntry(entry.id)}
                            title="Usuń wpis"
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
      </div>

      {currentEmployee && (
        <AbsenceRangeModal
          isOpen={showAbsenceModal}
          onClose={() => setShowAbsenceModal(false)}
          token={token}
          employeeId={currentEmployee.id}
          employeeName={getFormattedEmployeeName(currentEmployee)}
          initialDate={currentDate}
          workTimeTypes={workTypes}
          onSuccess={(msg) => {
            notifySuccess(msg);
            if (currentEmployee) {
              fetchDayEntries(currentEmployee.id, currentDate);
            }
          }}
        />
      )}
    </div>
  );
}
