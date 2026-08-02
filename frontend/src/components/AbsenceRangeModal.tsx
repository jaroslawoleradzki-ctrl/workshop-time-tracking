import React, { useState, useEffect, useRef } from 'react';
import { Calendar, X, AlertTriangle, RefreshCw } from 'lucide-react';

export interface WorkTimeType {
  code: string;
  name: string;
  requiresOrder: boolean;
}

export interface AbsenceRangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  employeeId: string;
  employeeName: string;
  initialDate?: string;
  workTimeTypes: WorkTimeType[];
  onSuccess: (message: string) => void;
}

export interface ConflictItem {
  date: string;
  reason: string;
}

export interface PreviewResult {
  calendarDays: number;
  workingDays: number;
  weekends: number;
  availableDays: number;
  skipped: number;
  totalHours: number;
  conflicts: ConflictItem[];
}

export default function AbsenceRangeModal({
  isOpen,
  onClose,
  token,
  employeeId,
  employeeName,
  initialDate,
  workTimeTypes,
  onSuccess,
}: AbsenceRangeModalProps) {
  const absenceTypes = workTimeTypes.filter((t) => !t.requiresOrder);

  const defaultDate = initialDate || new Date().toISOString().split('T')[0];

  const [workTimeTypeCode, setWorkTimeTypeCode] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>(defaultDate);
  const [dateTo, setDateTo] = useState<string>(defaultDate);
  const [hoursPerDay, setHoursPerDay] = useState<number>(8);

  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string>('');
  const [submitError, setSubmitError] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Initialize selected type when modal opens or types load
  useEffect(() => {
    if (isOpen) {
      const defaultType = absenceTypes.length > 0 ? absenceTypes[0].code : '';
      setWorkTimeTypeCode(defaultType);
      const startingDate = initialDate || new Date().toISOString().split('T')[0];
      setDateFrom(startingDate);
      setDateTo(startingDate);
      setHoursPerDay(8);
      setPreviewResult(null);
      setPreviewError('');
      setSubmitError('');
    }
  }, [isOpen, initialDate, workTimeTypes]);

  // Debounced preview calculation
  useEffect(() => {
    if (!isOpen || !employeeId || !workTimeTypeCode || !dateFrom || !dateTo || hoursPerDay <= 0) {
      setPreviewResult(null);
      setPreviewError('');
      return;
    }

    if (dateFrom > dateTo) {
      setPreviewResult(null);
      setPreviewError('Data początkowa nie może być późniejsza niż data końcowa.');
      return;
    }

    // Cancel any ongoing preview fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setPreviewLoading(true);
    setPreviewError('');

    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/reports/absence-range/preview', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            employeeId,
            workTimeTypeCode,
            dateFrom,
            dateTo,
            hoursPerDay: Number(hoursPerDay),
          }),
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || 'Błąd generowania podglądu');
        }

        setPreviewResult(data);
        setPreviewError('');
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        setPreviewResult(null);
        setPreviewError(err.message || 'Wystąpił błąd podczas sprawdzania zakresu.');
      } finally {
        if (!controller.signal.aborted) {
          setPreviewLoading(false);
        }
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [isOpen, token, employeeId, workTimeTypeCode, dateFrom, dateTo, hoursPerDay]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!previewResult || previewResult.availableDays === 0 || submitting) return;

    setSubmitting(true);
    setSubmitError('');

    try {
      const res = await fetch('/api/reports/absence-range', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          employeeId,
          workTimeTypeCode,
          dateFrom,
          dateTo,
          hoursPerDay: Number(hoursPerDay),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Błąd podczas zapisywania nieobecności');
      }

      const created = data.created ?? 0;
      const skipped = data.skipped ?? 0;

      let msg = '';
      if (created > 0 && skipped > 0) {
        msg = `Utworzono: ${created} wpisów. Pominięto: ${skipped} dni z istniejącymi wpisami.`;
      } else if (created > 0) {
        msg = `Utworzono: ${created} wpisów nieobecności.`;
      } else {
        msg = `Pominięto wszystkie dni (${skipped}) z powodu istniejących wpisów.`;
      }

      onSuccess(msg);
      onClose();
    } catch (err: any) {
      setSubmitError(err.message || 'Wystąpił błąd zapisu.');
    } finally {
      setSubmitting(false);
    }
  };

  const isSaveDisabled =
    !previewResult ||
    previewResult.availableDays === 0 ||
    previewLoading ||
    submitting ||
    Boolean(previewError);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{
          maxWidth: '560px',
          maxHeight: '90vh',
          overflowY: 'auto',
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          borderColor: 'var(--border-color)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="modal-header"
          style={{
            justifyContent: 'space-between',
            marginBottom: '1rem',
            paddingBottom: '0.75rem',
            borderBottom: '1px solid var(--border-color)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexGrow: 1 }}>
            <Calendar size={22} style={{ color: 'var(--primary-color)' }} />
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontFamily: 'var(--font-header)', color: 'var(--text-primary)' }}>
              Dodaj nieobecność
            </h3>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={onClose}
            aria-label="Zamknij"
            style={{ padding: '0.25rem 0.5rem' }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Pracownik - read only */}
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label">Pracownik:</label>
            <input
              type="text"
              className="form-control"
              value={employeeName}
              readOnly
              disabled
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
                cursor: 'not-allowed',
                borderColor: 'var(--border-color)',
              }}
            />
          </div>

          {/* Typ nieobecności */}
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label">Typ nieobecności:</label>
            <select
              className="form-control"
              value={workTimeTypeCode}
              onChange={(e) => setWorkTimeTypeCode(e.target.value)}
              required
            >
              {absenceTypes.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.code} - {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Daty */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Data od:</label>
              <input
                type="date"
                className="form-control"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Data do:</label>
              <input
                type="date"
                className="form-control"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Godzin dziennie */}
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label">Godzin dziennie:</label>
            <input
              type="number"
              step="0.5"
              min="0.5"
              max="24"
              className="form-control"
              value={hoursPerDay}
              onChange={(e) => setHoursPerDay(parseFloat(e.target.value) || 0)}
              required
            />
          </div>

          {/* Błędy walidacji / preview */}
          {previewError && (
            <div className="alert alert-danger" style={{ marginBottom: '1rem', padding: '0.75rem' }}>
              <AlertTriangle size={16} style={{ marginRight: '0.5rem', display: 'inline' }} />
              {previewError}
            </div>
          )}

          {submitError && (
            <div className="alert alert-danger" style={{ marginBottom: '1rem', padding: '0.75rem' }}>
              <AlertTriangle size={16} style={{ marginRight: '0.5rem', display: 'inline' }} />
              {submitError}
            </div>
          )}

          {/* Wynik podglądu z backendu */}
          {previewLoading ? (
            <div
              style={{
                padding: '1rem',
                textAlign: 'center',
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '1rem',
                border: '1px solid var(--border-color)',
              }}
            >
              <RefreshCw size={18} className="spin" style={{ marginRight: '0.5rem' }} />
              Obliczanie zakresu i konfliktów...
            </div>
          ) : previewResult ? (
            <div
              className="card"
              style={{
                padding: '1rem',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '1rem',
              }}
            >
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                Podsumowanie zakresu:
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                <div>Dni kalendarzowe: <strong style={{ color: 'var(--text-primary)' }}>{previewResult.calendarDays}</strong></div>
                <div>Dni robocze: <strong style={{ color: 'var(--text-primary)' }}>{previewResult.workingDays}</strong></div>
                <div>Pominięte weekendy: <strong style={{ color: 'var(--text-primary)' }}>{previewResult.weekends}</strong></div>
                <div>Konflikty: <strong style={{ color: 'var(--text-primary)' }}>{previewResult.skipped}</strong></div>
                <div style={{ gridColumn: 'span 2', marginTop: '0.25rem' }}>
                  Do utworzenia: <strong style={{ color: 'var(--primary-color)' }}>{previewResult.availableDays} wpisów</strong> ({previewResult.totalHours} h)
                </div>
              </div>

              {/* Lista konfliktów */}
              {previewResult.conflicts.length > 0 && (
                <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--border-color)' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--danger-color)', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                    Wykryte konflikty ({previewResult.conflicts.length}):
                  </div>
                  <div style={{ maxHeight: '100px', overflowY: 'auto', fontSize: '0.8rem' }}>
                    {previewResult.conflicts.map((c) => (
                      <div key={c.date} style={{ color: 'var(--danger-color)' }}>
                        • {c.date} - istnieje już wpis
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* Przyciski Akcji */}
          <div className="modal-actions" style={{ marginTop: '1.25rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Anuluj
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSaveDisabled}>
              {submitting
                ? 'Zapisywanie...'
                : previewResult
                ? `Dodaj ${previewResult.availableDays} wpisów`
                : 'Zapisz nieobecność'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
