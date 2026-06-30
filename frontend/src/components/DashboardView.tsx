import { useState, useEffect } from 'react';
import { 
  FileCheck, 
  FileSpreadsheet, 
  Hourglass, 
  Calendar,
  AlertTriangle,
  Flame,
  CheckCircle2
} from 'lucide-react';

interface DashboardStats {
  openOrdersCount: number;
  closedOrdersCount: number;
  hoursToday: number;
  hoursMonth: number;
  ordersExceeding: Array<{
    id: string;
    orderNumber: string;
    productName: string;
    plannedHours: number;
    actualHours: number;
    percent: number;
  }>;
  ordersApproaching: Array<{
    id: string;
    orderNumber: string;
    productName: string;
    plannedHours: number;
    actualHours: number;
    percent: number;
  }>;
}

interface DashboardViewProps {
  token: string;
}

export default function DashboardView({ token }: DashboardViewProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/analytics/dashboard', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Błąd pobierania statystyk');
        const data = await res.json();
        setStats(data);
      } catch (err: any) {
        setError(err.message || 'Wystąpił błąd');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [token]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
        <div className="loader">Ładowanie statystyk...</div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="alert alert-danger">
        {error || 'Nie udało się wczytać statystyk'}
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem', fontFamily: 'var(--font-header)', fontSize: '1.8rem' }}>
        Pulpit Menedżerski
      </h2>

      {/* Stats Cards Row */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-info">
            <span className="stat-label">Otwarte zlecenia</span>
            <span className="stat-value">{stats.openOrdersCount}</span>
          </div>
          <div className="stat-icon" style={{ color: 'var(--primary-color)', backgroundColor: 'var(--primary-glow)' }}>
            <FileSpreadsheet size={24} />
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-info">
            <span className="stat-label">Zamknięte zlecenia</span>
            <span className="stat-value">{stats.closedOrdersCount}</span>
          </div>
          <div className="stat-icon" style={{ color: 'var(--success-color)', backgroundColor: 'var(--success-bg)' }}>
            <FileCheck size={24} />
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-info">
            <span className="stat-label">Godziny dzisiaj</span>
            <span className="stat-value">{stats.hoursToday.toFixed(1)} h</span>
          </div>
          <div className="stat-icon" style={{ color: 'var(--info-color)', backgroundColor: 'var(--info-bg)' }}>
            <Hourglass size={24} />
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-info">
            <span className="stat-label">Godziny w tym miesiącu</span>
            <span className="stat-value">{stats.hoursMonth.toFixed(1)} h</span>
          </div>
          <div className="stat-icon" style={{ color: 'var(--warning-color)', backgroundColor: 'var(--warning-bg)' }}>
            <Calendar size={24} />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
        {/* Column 1: Exceeding orders */}
        <div className="card">
          <h3 className="card-title" style={{ color: 'var(--danger-color)' }}>
            <Flame size={20} />
            Zlecenia przekraczające budżet (&gt;100%)
          </h3>
          {(Array.isArray(stats?.ordersExceeding) ? stats.ordersExceeding : []).length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', padding: '1rem 0' }}>
              Brak zleceń przekraczających budżet. Wszystko w normie.
            </p>
          ) : (
            <div className="table-container" style={{ border: 'none', marginTop: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Zlecenie</th>
                    <th>Produkt</th>
                    <th style={{ textAlign: 'right' }}>Plan</th>
                    <th style={{ textAlign: 'right' }}>Rzecz.</th>
                    <th style={{ textAlign: 'right' }}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(stats?.ordersExceeding) && stats.ordersExceeding.map(order => (
                    <tr key={order.id}>
                      <td style={{ fontWeight: 'bold' }}>{order.orderNumber}</td>
                      <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {order.productName}
                      </td>
                      <td style={{ textAlign: 'right' }}>{order.plannedHours.toFixed(1)}h</td>
                      <td style={{ textAlign: 'right', color: 'var(--danger-color)', fontWeight: 'bold' }}>
                        {order.actualHours.toFixed(1)}h
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="badge badge-danger">{Math.round(order.percent)}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Column 2: Approaching orders */}
        <div className="card">
          <h3 className="card-title" style={{ color: 'var(--warning-color)' }}>
            <AlertTriangle size={20} />
            Zlecenia blisko przekroczenia (80% - 100%)
          </h3>
          {(Array.isArray(stats?.ordersApproaching) ? stats.ordersApproaching : []).length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', padding: '1rem 0' }}>
              Brak zleceń w strefie ostrzegawczej.
            </p>
          ) : (
            <div className="table-container" style={{ border: 'none', marginTop: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Zlecenie</th>
                    <th>Produkt</th>
                    <th style={{ textAlign: 'right' }}>Plan</th>
                    <th style={{ textAlign: 'right' }}>Rzecz.</th>
                    <th style={{ textAlign: 'right' }}>Wizualizacja</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(stats?.ordersApproaching) && stats.ordersApproaching.map(order => (
                    <tr key={order.id}>
                      <td style={{ fontWeight: 'bold' }}>{order.orderNumber}</td>
                      <td style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {order.productName}
                      </td>
                      <td style={{ textAlign: 'right' }}>{order.plannedHours.toFixed(1)}h</td>
                      <td style={{ textAlign: 'right' }}>{order.actualHours.toFixed(1)}h</td>
                      <td style={{ minWidth: '120px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          <span style={{ fontSize: '0.75rem', textAlign: 'right', fontWeight: 600, color: 'var(--warning-color)' }}>
                            {Math.round(order.percent)}%
                          </span>
                          <div className="progress-bar-container" style={{ marginTop: 0 }}>
                            <div 
                              className="progress-bar yellow" 
                              style={{ width: `${Math.min(order.percent, 100)}%` }}
                            ></div>
                          </div>
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

      {/* Detailed orders list showing progress bars */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3 className="card-title">
          <CheckCircle2 size={20} style={{ color: 'var(--success-color)' }} />
          Monitorowanie realizacji otwartych budżetów zleceń
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Legenda kolorystyczna postępu: <span style={{ color: 'var(--success-color)', fontWeight: 600 }}>Zielony (0-80%)</span> | <span style={{ color: 'var(--warning-color)', fontWeight: 600 }}>Żółty (80-100%)</span> | <span style={{ color: 'var(--danger-color)', fontWeight: 600 }}>Czerwony (powyżej 100%)</span>.
        </p>

        {((Array.isArray(stats?.ordersExceeding) ? stats.ordersExceeding : []).length === 0 && (Array.isArray(stats?.ordersApproaching) ? stats.ordersApproaching : []).length === 0) ? (
          <p style={{ color: 'var(--text-secondary)' }}>
            Wszystkie zlecenia są w bezpiecznych zakresach budżetowych.
          </p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Numer zlecenia</th>
                  <th>Produkt</th>
                  <th style={{ textAlign: 'right' }}>Godziny planowane</th>
                  <th style={{ textAlign: 'right' }}>Godziny rzeczywiste</th>
                  <th>Procent wykorzystania i pasek realizacji</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ...(Array.isArray(stats?.ordersExceeding) ? stats.ordersExceeding : []),
                  ...(Array.isArray(stats?.ordersApproaching) ? stats.ordersApproaching : [])
                ].map(order => {
                  const percentVal = order.percent;
                  const colorClass = percentVal > 100 ? 'red' : percentVal >= 80 ? 'yellow' : 'green';
                  return (
                    <tr key={order.id}>
                      <td style={{ fontWeight: 'bold' }}>{order.orderNumber}</td>
                      <td>{order.productName}</td>
                      <td style={{ textAlign: 'right' }}>{order.plannedHours.toFixed(1)} h</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{order.actualHours.toFixed(1)} h</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <div className="progress-bar-container" style={{ flex: 1, marginTop: 0 }}>
                            <div 
                              className={`progress-bar ${colorClass}`} 
                              style={{ width: `${Math.min(percentVal, 100)}%` }}
                            ></div>
                          </div>
                          <span style={{ 
                            fontWeight: 700, 
                            fontSize: '0.85rem', 
                            color: `var(--${colorClass === 'green' ? 'success' : colorClass === 'yellow' ? 'warning' : 'danger'}-color)`,
                            minWidth: '45px',
                            textAlign: 'right'
                          }}>
                            {Math.round(percentVal)}%
                          </span>
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
    </div>
  );
}
