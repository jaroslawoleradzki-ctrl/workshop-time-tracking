import { useEffect, useState } from 'react';
import { CalendarDays, Edit2, Trash2 } from 'lucide-react';

type CalendarDay = {
  date: string;
  isWorkingDay: boolean;
  source: string;
  reason: string | null;
  overrideId: string | null;
};

const weekdayNames = ['nd', 'pn', 'wt', 'śr', 'czw', 'pt', 'sob'];

function formatDay(date: string) {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return `${date} (${weekdayNames[day]})`;
}

export default function CompanyCalendarView({ token }: { token: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(today.slice(0, 8) + '01');
  const [dateTo, setDateTo] = useState(today);
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [selectedDate, setSelectedDate] = useState(today);
  const [isWorkingDay, setIsWorkingDay] = useState(true);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadDays = async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/company-calendar?dateFrom=${dateFrom}&dateTo=${dateTo}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Nie udało się pobrać kalendarza');
      setDays(data);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  useEffect(() => { void loadDays(); }, [token]);

  const selectDay = (day: CalendarDay) => {
    setSelectedDate(day.date); setIsWorkingDay(day.isWorkingDay); setReason(day.reason || '');
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    try {
      const response = await fetch(`/api/company-calendar/${selectedDate}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isWorkingDay, reason: reason.trim() || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Nie udało się zapisać wyjątku');
      await loadDays();
    } catch (err: any) { setError(err.message); }
  };

  const remove = async () => {
    setError('');
    try {
      const response = await fetch(`/api/company-calendar/${selectedDate}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) { const data = await response.json(); throw new Error(data.message || 'Nie udało się usunąć wyjątku'); }
      await loadDays();
      const day = days.find((item) => item.date === selectedDate);
      if (day) { setIsWorkingDay(new Date(`${selectedDate}T00:00:00.000Z`).getUTCDay() > 0 && new Date(`${selectedDate}T00:00:00.000Z`).getUTCDay() < 6); setReason(''); }
    } catch (err: any) { setError(err.message); }
  };

  return <div style={{ height: '100%', overflow: 'auto' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}><CalendarDays size={28} /><h2 style={{ margin: 0 }}>Kalendarz zakładowy</h2></div>
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'end' }}>
        <div className="form-group"><label className="form-label" htmlFor="calendar-from">Od</label><input id="calendar-from" className="form-control" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
        <div className="form-group"><label className="form-label" htmlFor="calendar-to">Do</label><input id="calendar-to" className="form-control" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
        <button className="btn btn-secondary" onClick={() => void loadDays()}>Pokaż zakres</button>
      </div>
    </div>
    {error && <div className="alert alert-danger">{error}</div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(280px, 1fr)', gap: '1rem' }}>
      <div className="card"><h3 style={{ marginBottom: '1rem' }}>Dni w zakresie</h3>{loading ? <p>Ładowanie...</p> : days.map((day) => <button key={day.date} onClick={() => selectDay(day)} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '0.65rem', marginBottom: '0.35rem', textAlign: 'left', border: day.date === selectedDate ? '1px solid var(--primary-color)' : '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', cursor: 'pointer' }}><span>{formatDay(day.date)}</span><span style={{ color: day.isWorkingDay ? 'var(--success-color)' : 'var(--danger-color)' }}>{day.isWorkingDay ? 'roboczy' : 'wolny'}</span></button>)}</div>
      <form className="card" onSubmit={save}><h3 style={{ marginBottom: '1rem' }}>Wyjątek dla daty</h3><div className="form-group"><label className="form-label" htmlFor="calendar-date">Data</label><input id="calendar-date" className="form-control" type="date" value={selectedDate} onChange={(e) => { setSelectedDate(e.target.value); const day = days.find((item) => item.date === e.target.value); if (day) selectDay(day); }} required /></div><div className="form-group"><label className="form-label" htmlFor="calendar-kind">Status</label><select id="calendar-kind" className="form-control" value={isWorkingDay ? 'working' : 'free'} onChange={(e) => setIsWorkingDay(e.target.value === 'working')}><option value="working">Dzień roboczy</option><option value="free">Dzień wolny</option></select></div><div className="form-group"><label className="form-label" htmlFor="calendar-reason">Opis (opcjonalnie)</label><input id="calendar-reason" className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} /></div><div style={{ display: 'flex', gap: '0.5rem' }}><button className="btn btn-primary" type="submit"><Edit2 size={16} /> Zapisz wyjątek</button>{days.find((day) => day.date === selectedDate)?.overrideId && <button className="btn btn-danger" type="button" onClick={() => void remove()}><Trash2 size={16} /> Usuń wyjątek</button>}</div></form>
    </div>
  </div>;
}
