import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AbsenceRangeModal from '../components/AbsenceRangeModal';
import ReportingPanel from '../components/ReportingPanel';

const EMPLOYEE_ID = '20000000-0000-4000-8000-000000000001';

type JsonResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

const response = (body: unknown, status = 200): JsonResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe('AbsenceRangeModal & ReportingPanel integration', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  const workTimeTypes = [
    { code: 'G', name: 'Godziny standardowe', requiresOrder: true, isAbsence: false },
    { code: 'L4', name: 'Chorobowe L4', requiresOrder: false, isAbsence: true },
    { code: 'UW', name: 'Urlop wypoczynkowy', requiresOrder: false, isAbsence: true },
  ];

  beforeEach(() => {
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/employees?activeOnly=true') {
        return response([
          {
            id: EMPLOYEE_ID,
            fullName: 'Jan Kowalski',
            firstName: 'Jan',
            lastName: 'Kowalski',
            isActive: true,
          },
        ]);
      }
      if (url === '/api/orders/active') return response([]);
      if (url === '/api/work-time-types') return response(workTimeTypes);
      if (url.startsWith('/api/reports/by-employee-date')) return response([]);
      if (url === '/api/reports/absence-range/preview') {
        return response({
          calendarDays: 12,
          workingDays: 10,
          weekends: 2,
          availableDays: 8,
          skipped: 2,
          totalHours: 64,
          conflicts: [{ date: '2026-08-07', reason: 'EXISTING_ENTRY' }],
        });
      }
      if (url === '/api/reports/absence-range') {
        return response(
          {
            created: 8,
            skipped: 2,
            weekends: 2,
            totalHoursCreated: 64,
            conflicts: [{ date: '2026-08-07', reason: 'EXISTING_ENTRY' }],
          },
          201,
        );
      }

      throw new Error(`Nieobsłużone żądanie: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders "Dodaj nieobecność" button in ReportingPanel when employee is selected', async () => {
    render(
      <ReportingPanel
        token="test-token"
        user={{ id: '1', username: 'leader', role: 'leader', fullName: 'Lider Testowy' }}
      />,
    );

    await screen.findByDisplayValue('Jan Kowalski');

    const button = screen.getByRole('button', { name: /Dodaj nieobecność/i });
    expect(button).toBeDefined();
  });

  it('opens modal, shows read-only employee name, filters absence types (requiresOrder=false only)', async () => {
    render(
      <AbsenceRangeModal
        isOpen={true}
        onClose={() => {}}
        token="test-token"
        employeeId={EMPLOYEE_ID}
        employeeName="Jan Kowalski"
        initialDate="2026-08-03"
        workTimeTypes={workTimeTypes}
        onSuccess={() => {}}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Dodaj nieobecność' })).toBeDefined();

    const employeeInput = screen.getByDisplayValue('Jan Kowalski') as HTMLInputElement;
    expect(employeeInput.readOnly).toBe(true);

    // Verify select options contain ONLY L4 and UW, NOT G
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);

    expect(options).toContain('L4');
    expect(options).toContain('UW');
    expect(options).not.toContain('G');
  });

  it('fetches preview and renders summary stats and conflicts list', async () => {
    render(
      <AbsenceRangeModal
        isOpen={true}
        onClose={() => {}}
        token="test-token"
        employeeId={EMPLOYEE_ID}
        employeeName="Jan Kowalski"
        initialDate="2026-08-03"
        workTimeTypes={workTimeTypes}
        onSuccess={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Podsumowanie zakresu:')).toBeDefined();
    });

    expect(screen.getByText(/Dni kalendarzowe:/i)).toBeDefined();
    expect(screen.getByText(/Dni robocze:/i)).toBeDefined();
    expect(screen.getByText(/Pominięte weekendy:/i)).toBeDefined();
    expect(screen.getByText(/2026-08-07 - istnieje już wpis/i)).toBeDefined();
  });

  it('submits absence range request and calls onSuccess with summary message', async () => {
    const onSuccessMock = vi.fn();
    const onCloseMock = vi.fn();

    render(
      <AbsenceRangeModal
        isOpen={true}
        onClose={onCloseMock}
        token="test-token"
        employeeId={EMPLOYEE_ID}
        employeeName="Jan Kowalski"
        initialDate="2026-08-03"
        workTimeTypes={workTimeTypes}
        onSuccess={onSuccessMock}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Dodaj 8 wpisów/i })).toBeDefined();
    });

    const submitBtn = screen.getByRole('button', { name: /Dodaj 8 wpisów/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSuccessMock).toHaveBeenCalledWith(
        'Utworzono: 8 wpisów. Pominięto: 2 dni z istniejącymi wpisami.',
      );
      expect(onCloseMock).toHaveBeenCalled();
    });
  });
});
