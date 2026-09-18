import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReportingPanel from '../components/ReportingPanel';

// Import the pure functions for direct testing
import { getDayOfWeekAbbreviation, isWeekend, getDefaultWorkType } from '../components/ReportingPanel';

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

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('ReportingPanel — pure function tests', () => {
  const baseWorkTypes = [
    { code: 'G', name: 'Godziny standardowe', requiresOrder: false, isAbsence: false },
    { code: 'NS', name: 'Nadgodziny sobota/niedziela', requiresOrder: true, isAbsence: false },
    { code: 'UW', name: 'Urlop wypoczynkowy', requiresOrder: false, isAbsence: true },
  ];

  it('getDayOfWeekAbbreviation returns correct Polish abbreviations', () => {
    expect(getDayOfWeekAbbreviation('2026-07-13')).toBe('pn'); // Monday
    expect(getDayOfWeekAbbreviation('2026-07-14')).toBe('wt'); // Tuesday
    expect(getDayOfWeekAbbreviation('2026-07-15')).toBe('śr'); // Wednesday
    expect(getDayOfWeekAbbreviation('2026-07-16')).toBe('czw'); // Thursday
    expect(getDayOfWeekAbbreviation('2026-07-17')).toBe('pt'); // Friday
    expect(getDayOfWeekAbbreviation('2026-07-18')).toBe('sob'); // Saturday
    expect(getDayOfWeekAbbreviation('2026-07-19')).toBe('nd'); // Sunday
  });

  it('isWeekend returns true for Saturday and Sunday', () => {
    expect(isWeekend('2026-07-18')).toBe(true); // Saturday
    expect(isWeekend('2026-07-19')).toBe(true); // Sunday
    expect(isWeekend('2026-07-13')).toBe(false); // Monday
    expect(isWeekend('2026-07-17')).toBe(false); // Friday
  });

  it('getDefaultWorkType returns G for weekdays', () => {
    expect(getDefaultWorkType('2026-07-13', baseWorkTypes)).toBe('G'); // Monday
    expect(getDefaultWorkType('2026-07-14', baseWorkTypes)).toBe('G'); // Tuesday
    expect(getDefaultWorkType('2026-07-15', baseWorkTypes)).toBe('G'); // Wednesday
    expect(getDefaultWorkType('2026-07-16', baseWorkTypes)).toBe('G'); // Thursday
    expect(getDefaultWorkType('2026-07-17', baseWorkTypes)).toBe('G'); // Friday

    expect(getDefaultWorkType({ date: '2026-09-14', isWorkingDay: true, source: 'standard weekday' }, baseWorkTypes)).toBe('G');
  });

  it('getDefaultWorkType returns NS for weekends when NS exists', () => {
    expect(getDefaultWorkType('2026-07-18', baseWorkTypes)).toBe('NS'); // Saturday
    expect(getDefaultWorkType('2026-07-19', baseWorkTypes)).toBe('NS'); // Sunday

    expect(getDefaultWorkType({ date: '2026-09-13', isWorkingDay: false, source: 'weekend' }, baseWorkTypes)).toBe('NS');
  });

  it('getDefaultWorkType returns empty string for non-working weekends when NS does not exist', () => {
    const workTypesWithoutNS = [
      { code: 'G', name: 'Godziny standardowe', requiresOrder: false, isAbsence: false },
      { code: 'UW', name: 'Urlop wypoczynkowy', requiresOrder: false, isAbsence: true },
    ];
    expect(getDefaultWorkType('2026-07-18', workTypesWithoutNS)).toBe('');
    expect(getDefaultWorkType('2026-07-19', workTypesWithoutNS)).toBe('');
    expect(getDefaultWorkType({ date: '2026-07-18', isWorkingDay: false, source: 'weekend' }, workTypesWithoutNS)).toBe('');
  });

  it('getDefaultWorkType returns empty string (not G) for statutory public holiday on weekdays', () => {
    expect(getDefaultWorkType({
      date: '2026-11-11',
      isWorkingDay: false,
      source: 'public holiday',
      reason: 'Narodowe Święto Niepodległości',
    }, baseWorkTypes)).toBe('');
  });

  it('getDefaultWorkType returns empty string (not G) for company day off on weekdays', () => {
    expect(getDefaultWorkType({
      date: '2026-08-14',
      isWorkingDay: false,
      source: 'company override',
      reason: 'Dzień wolny za 15.08',
    }, baseWorkTypes)).toBe('');
  });

  it('getDefaultWorkType returns G (not NS) for company working-day override on Saturday/Sunday', () => {
    expect(getDefaultWorkType({
      date: '2026-11-14',
      isWorkingDay: true,
      source: 'company override',
      reason: 'Sobota pracująca',
    }, baseWorkTypes)).toBe('G');
  });

  it('getDefaultWorkType handles null/undefined with safe fallback', () => {
    expect(getDefaultWorkType(null, baseWorkTypes, '2026-07-13')).toBe('G');
    expect(getDefaultWorkType(null, baseWorkTypes, '2026-07-19')).toBe('NS');
    expect(getDefaultWorkType(undefined, baseWorkTypes, '2026-07-13')).toBe('G');
  });
});

describe('ReportingPanel — kopiowanie ostatniego dnia', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let copyHandler: () => Promise<JsonResponse>;

  beforeEach(() => {
    copyHandler = async () => response({
      employeeId: EMPLOYEE_ID,
      sourceDate: '2026-07-15',
      targetDate: '2026-07-20',
      createdCount: 2,
    }, 201);

    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/employees?activeOnly=true') {
        return response([{
          id: EMPLOYEE_ID,
          fullName: 'Jan Kowalski',
          firstName: 'Jan',
          lastName: 'Kowalski',
          isActive: true,
        }]);
      }
      if (url === '/api/orders/active') return response([]);
      if (url === '/api/work-time-types') {
        return response([{ code: 'G', name: 'Godziny standardowe', requiresOrder: false }]);
      }
      if (url.startsWith('/api/reports/by-employee-date')) return response([]);
      if (url === '/api/reports/copy-last-day') return copyHandler();
      if (url.startsWith('/api/company-calendar/day/')) {
        const date = url.slice('/api/company-calendar/day/'.length);
        const weekend = isWeekend(date);
        return response({
          date,
          isWorkingDay: !weekend,
          source: weekend ? 'weekend' : 'standard weekday',
          reason: null,
        });
      }

      throw new Error(`Nieobsłużone żądanie testowe: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllTimers();
  });

  const renderPanel = async () => {
    render(
      <ReportingPanel
        token="test-token"
        user={{ id: '1', username: 'leader', role: 'leader', fullName: 'Lider Testowy' }}
      />,
    );

    await screen.findByDisplayValue('Jan Kowalski');
    return screen.getByRole('button', { name: 'Kopiuj ostatni dzień' });
  };

  it('wysyła identyfikator wybranego pracownika i datę oraz pokazuje wynik', async () => {
    const button = await renderPanel();
    fireEvent.click(button);

    await screen.findByText('Skopiowano 2 wpisów z dnia 2026-07-15.');

    const copyCall = fetchMock.mock.calls.find(([url]) => url === '/api/reports/copy-last-day');
    expect(copyCall).toBeDefined();
    expect(JSON.parse(copyCall?.[1]?.body as string)).toEqual({
      employeeId: EMPLOYEE_ID,
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it('blokuje przycisk i ignoruje serię natychmiastowych kliknięć', async () => {
    const pending = deferred<JsonResponse>();
    copyHandler = () => pending.promise;
    const button = await renderPanel();

    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(screen.getByRole('button', { name: 'Kopiowanie...' })).toBeDisabled();
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/reports/copy-last-day')).toHaveLength(1);

    pending.resolve(response({ createdCount: 1, sourceDate: '2026-07-15' }, 201));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Kopiuj ostatni dzień' })).toBeEnabled());
  });

  it('nie uruchamia kolejnego żądania po Enter ani Space w trakcie operacji', async () => {
    const pending = deferred<JsonResponse>();
    copyHandler = () => pending.promise;
    const button = await renderPanel();
    const user = userEvent.setup();

    button.focus();
    fireEvent.click(button);
    await user.keyboard('{Enter}{Space}');

    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/reports/copy-last-day')).toHaveLength(1);

    pending.resolve(response({ createdCount: 1, sourceDate: '2026-07-15' }, 201));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Kopiuj ostatni dzień' })).toBeEnabled());
  });

  it('odblokowuje przycisk po błędzie połączenia', async () => {
    copyHandler = async () => {
      throw new Error('Brak połączenia');
    };
    const button = await renderPanel();
    fireEvent.click(button);

    await screen.findByText('Brak połączenia');
    expect(screen.getByRole('button', { name: 'Kopiuj ostatni dzień' })).toBeEnabled();
  });

  it('pokazuje jednoznaczny komunikat 409 i nie ponawia kopiowania', async () => {
    copyHandler = async () => response({
      code: 'TARGET_DAY_NOT_EMPTY',
      message: 'Target day is not empty',
    }, 409);
    const button = await renderPanel();
    fireEvent.click(button);

    await screen.findByText('Dzień docelowy zawiera już wpisy tego pracownika. Kopiowanie nie zostało wykonane.');
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/reports/copy-last-day')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Kopiuj ostatni dzień' })).toBeEnabled();
  });
});

describe('ReportingPanel — Brak karty (missingCard) form interaction', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let savedRequestBody: any = null;

  beforeEach(() => {
    savedRequestBody = null;
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/employees?activeOnly=true') {
        return response([{
          id: EMPLOYEE_ID,
          fullName: 'Jan Kowalski',
          firstName: 'Jan',
          lastName: 'Kowalski',
          isActive: true,
        }]);
      }
      if (url === '/api/orders/active') return response([]);
      if (url === '/api/work-time-types') {
        return response([{ code: 'G', name: 'Godziny standardowe', requiresOrder: false }]);
      }
      if (url.startsWith('/api/reports/by-employee-date')) {
        return response([
          {
            id: 'report-1',
            date: '2026-07-20',
            employeeId: EMPLOYEE_ID,
            orderId: null,
            hours: 8,
            workTimeTypeCode: 'G',
            workShift: 'FIRST',
            missingCard: true,
            workTimeType: { code: 'G', name: 'Godziny standardowe', requiresOrder: false },
          }
        ]);
      }
      if (url === '/api/reports/check-warnings') {
        return response({
          warnStandard: false,
          warnTotal12: false,
          warnTotal24: false,
          totalStandard: 8,
          totalHours: 8,
        });
      }
      if (url === '/api/reports' || url.startsWith('/api/reports/')) {
        savedRequestBody = JSON.parse(init?.body as string);
        return response({
          report: {
            id: 'report-1',
            date: '2026-07-20',
            employeeId: EMPLOYEE_ID,
            orderId: null,
            hours: 8,
            workTimeTypeCode: 'G',
            workShift: savedRequestBody.workShift,
            missingCard: savedRequestBody.missingCard,
          },
          warnings: {},
        }, url.includes('report-1') ? 200 : 201);
      }

      throw new Error(`Nieobsłużone żądanie testowe: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('checkbox jest domyślnie odznaczony dla nowego wpisu i zaznaczenie wysyła true', async () => {
    render(
      <ReportingPanel
        token="test-token"
        user={{ id: '1', username: 'leader', role: 'leader', fullName: 'Lider Testowy' }}
      />,
    );

    await screen.findByDisplayValue('Jan Kowalski');

    const checkbox = screen.getByLabelText('Brak karty') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    // Wybierz zmianę
    const shiftSelect = screen.getByLabelText('Zmiana') as HTMLSelectElement;
    fireEvent.change(shiftSelect, { target: { value: 'FIRST' } });

    // Zaznacz checkbox
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);

    // Wyślij formularz
    const saveButton = screen.getByRole('button', { name: /Zapisz wpis/ });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(savedRequestBody).not.toBeNull();
      expect(savedRequestBody.missingCard).toBe(true);
      expect(savedRequestBody.workShift).toBe('FIRST');
    });
  });

  it('edycja wpisu z missingCard: true pokazuje zaznaczony checkbox, a odznaczenie wysyła false', async () => {
    render(
      <ReportingPanel
        token="test-token"
        user={{ id: '1', username: 'leader', role: 'leader', fullName: 'Lider Testowy' }}
      />,
    );

    await screen.findByDisplayValue('Jan Kowalski');

    // Kliknij przycisk Edytuj w tabeli
    const editButton = await screen.findByRole('button', { name: 'Edytuj' });
    fireEvent.click(editButton);

    const checkbox = screen.getByLabelText('Brak karty') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    // Odznacz checkbox
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);

    // Zapisz zmiany
    const saveButton = screen.getByRole('button', { name: /Zapisz zmiany/ });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(savedRequestBody).not.toBeNull();
      expect(savedRequestBody.missingCard).toBe(false);
      expect(savedRequestBody.workShift).toBe('FIRST');
    });
  });
});

describe('ReportingPanel — nawigacja dat strzałkami ◀ i ▶', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/employees?activeOnly=true') {
        return response([{
          id: EMPLOYEE_ID,
          fullName: 'Jan Kowalski',
          firstName: 'Jan',
          lastName: 'Kowalski',
          isActive: true,
        }]);
      }
      if (url === '/api/orders/active') return response([]);
      if (url === '/api/work-time-types') {
        return response([{ code: 'G', name: 'Godziny standardowe', requiresOrder: false }]);
      }
      if (url.startsWith('/api/reports/by-employee-date')) {
        return response([]);
      }

      throw new Error(`Nieobsłużone żądanie testowe: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('kliknięcie ◀ i ▶ zmienia datę o jeden dzień', async () => {
    render(
      <ReportingPanel
        token="test-token"
        user={{ id: '1', username: 'leader', role: 'leader', fullName: 'Lider Testowy' }}
      />,
    );

    await screen.findByDisplayValue('Jan Kowalski');

    const dateInput = screen.getByLabelText(/Data raportu:/) as HTMLInputElement;
    const initialDate = dateInput.value;

    // Kliknij ◀ (poprzedni dzień)
    const prevButton = screen.getByRole('button', { name: '◀' });
    fireEvent.click(prevButton);

    const expectedPrev = new Date(initialDate);
    expectedPrev.setDate(expectedPrev.getDate() - 1);
    const expectedPrevStr = expectedPrev.toISOString().split('T')[0];
    expect(dateInput.value).toBe(expectedPrevStr);

    // Kliknij ▶ (następny dzień, powrót do początkowej)
    const nextButton = screen.getByRole('button', { name: '▶' });
    fireEvent.click(nextButton);
    expect(dateInput.value).toBe(initialDate);
  });

  it('zmiana działa na przejściu między miesiącami i latami', async () => {
    render(
      <ReportingPanel
        token="test-token"
        user={{ id: '1', username: 'leader', role: 'leader', fullName: 'Lider Testowy' }}
      />,
    );

    await screen.findByDisplayValue('Jan Kowalski');

    const dateInput = screen.getByLabelText(/Data raportu:/) as HTMLInputElement;

    // Ustaw datę na 2026-03-01
    fireEvent.change(dateInput, { target: { value: '2026-03-01' } });
    expect(dateInput.value).toBe('2026-03-01');

    const prevButton = screen.getByRole('button', { name: '◀' });
    const nextButton = screen.getByRole('button', { name: '▶' });

    // 1. przejście do poprzedniego miesiąca (luty w roku zwykłym -> 28 dni)
    fireEvent.click(prevButton);
    expect(dateInput.value).toBe('2026-02-28');

    // 2. ustaw rok przestępny (2024-03-01) i kliknij w tył -> 2024-02-29
    fireEvent.change(dateInput, { target: { value: '2024-03-01' } });
    fireEvent.click(prevButton);
    expect(dateInput.value).toBe('2024-02-29');

    // 3. przejście roku (2025-12-31 -> 2026-01-01)
    fireEvent.change(dateInput, { target: { value: '2025-12-31' } });
    fireEvent.click(nextButton);
    expect(dateInput.value).toBe('2026-01-01');

    // 4. przejście roku w tył (2026-01-01 -> 2025-12-31)
    fireEvent.click(prevButton);
    expect(dateInput.value).toBe('2025-12-31');
  });

  it('jeżeli trwa edycja wpisu, kliknięcie strzałki kończy edycję', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/employees?activeOnly=true') {
        return response([{
          id: EMPLOYEE_ID,
          fullName: 'Jan Kowalski',
          isActive: true,
        }]);
      }
      if (url === '/api/orders/active') return response([]);
      if (url === '/api/work-time-types') {
        return response([{ code: 'G', name: 'Godziny standardowe', requiresOrder: false }]);
      }
      if (url.startsWith('/api/reports/by-employee-date')) {
        return response([
          {
            id: 'report-1',
            date: '2026-07-20',
            employeeId: EMPLOYEE_ID,
            orderId: null,
            hours: 8,
            workTimeTypeCode: 'G',
            workTimeType: { code: 'G', name: 'Godziny standardowe', requiresOrder: false },
          }
        ]);
      }
      throw new Error(`Nieobsłużone: ${url}`);
    }));

    render(
      <ReportingPanel
        token="test-token"
        user={{ id: '1', username: 'leader', role: 'leader', fullName: 'Lider Testowy' }}
      />,
    );

    await screen.findByDisplayValue('Jan Kowalski');

    const editButton = await screen.findByRole('button', { name: 'Edytuj' });
    fireEvent.click(editButton);

    expect(screen.queryByRole('button', { name: /Zapisz zmiany/ })).not.toBeNull();

    const prevButton = screen.getByRole('button', { name: '◀' });
    fireEvent.click(prevButton);

    expect(screen.queryByRole('button', { name: /Zapisz zmiany/ })).toBeNull();
  });
});

describe('ReportingPanel — default work type and NS/G save & load interaction', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let workTypesDeferred: ReturnType<typeof deferred>;

  const baseWorkTypes = [
    { code: 'G', name: 'Godziny standardowe', requiresOrder: false, isAbsence: false },
    { code: 'NS', name: 'Nadgodziny sobota/niedziela', requiresOrder: true, isAbsence: false },
    { code: 'UW', name: 'Urlop wypoczynkowy', requiresOrder: false, isAbsence: true },
  ];

  const baseEmployee = {
    id: EMPLOYEE_ID,
    fullName: 'Jan Kowalski',
    firstName: 'Jan',
    lastName: 'Kowalski',
    isActive: true,
  };

  const baseOrders = [
    { id: 'order-1', orderNumber: 'ZL-001', productCode: 'P1', productName: 'Produkt 1', accountingAccount: '123' },
  ];

  beforeEach(() => {
    workTypesDeferred = deferred();
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/employees?activeOnly=true') {
        return response([baseEmployee]);
      }
      if (url === '/api/orders/active') {
        return response(baseOrders);
      }
      if (url === '/api/work-time-types') {
        return workTypesDeferred.promise;
      }
      if (url.startsWith('/api/reports/by-employee-date')) {
        return response([]);
      }
      if (url.startsWith('/api/company-calendar/day/')) {
        const date = url.slice('/api/company-calendar/day/'.length);
        const weekend = isWeekend(date);
        return response({
          date,
          isWorkingDay: !weekend,
          source: weekend ? 'weekend' : 'standard weekday',
          reason: null,
        });
      }
      if (url === '/api/reports/check-warnings') {
        return response({
          warnStandard: false,
          warnTotal12: false,
          warnTotal24: false,
          totalStandard: 0,
          totalHours: 0,
        });
      }
      if (url === '/api/reports') {
        return response({
          report: {
            id: 'new-report',
            date: '2026-07-20',
            employeeId: EMPLOYEE_ID,
            orderId: 'order-1',
            hours: 8,
            workTimeTypeCode: 'NS',
            missingCard: false,
          },
          warnings: {},
        }, 201);
      }

      throw new Error(`Nieobsłużone żądanie testowe: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('applies default work type G on weekday and NS on weekend once dictionaries load', async () => {
    render(
      <ReportingPanel
        token="test-token"
        user={{ id: '1', username: 'leader', role: 'leader', fullName: 'Lider Testowy' }}
      />,
    );

    await screen.findByDisplayValue('Jan Kowalski');
    const dateInput = screen.getByLabelText(/Data raportu:/) as HTMLInputElement;

    // Set date to a known Monday (2026-07-13) before dictionaries resolve
    fireEvent.change(dateInput, { target: { value: '2026-07-13' } });

    // Resolve work types dictionary
    workTypesDeferred.resolve(response(baseWorkTypes));

    // Verify default work type on Monday is 'G'
    const workTypeSelect = screen.getByLabelText('Rodzaj czasu pracy') as HTMLSelectElement;
    await waitFor(() => {
      expect(workTypeSelect.value).toBe('G');
    });

    // Change date to a known Sunday (2026-07-19)
    fireEvent.change(dateInput, { target: { value: '2026-07-19' } });
    await waitFor(() => {
      expect(workTypeSelect.value).toBe('NS');
    });

    // Change date back to Tuesday (2026-07-14)
    fireEvent.change(dateInput, { target: { value: '2026-07-14' } });
    await waitFor(() => {
      expect(workTypeSelect.value).toBe('G');
    });
  });

  it('loads and preserves work type G and NS when editing existing entries', async () => {
    const existingReports = [
      {
        id: 'rep-g-1',
        date: '2026-07-13',
        employeeId: EMPLOYEE_ID,
        orderId: null,
        hours: 8,
        workTimeTypeCode: 'G',
        workShift: 'FIRST',
        missingCard: false,
        workTimeType: { code: 'G', name: 'Godziny standardowe', requiresOrder: false },
      },
      {
        id: 'rep-ns-2',
        date: '2026-07-19',
        employeeId: EMPLOYEE_ID,
        orderId: 'order-1',
        hours: 8,
        workTimeTypeCode: 'NS',
        workShift: 'SECOND',
        missingCard: false,
        order: { orderNumber: 'ZL-001', productCode: 'P1', productName: 'Produkt 1', accountingAccount: '123' },
        workTimeType: { code: 'NS', name: 'Nadgodziny sobota/niedziela', requiresOrder: true },
      },
    ];

    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/employees?activeOnly=true') return response([baseEmployee]);
      if (url === '/api/orders/active') return response(baseOrders);
      if (url === '/api/work-time-types') return response(baseWorkTypes);
      if (url.startsWith('/api/reports/by-employee-date')) {
        return response(existingReports);
      }
      throw new Error(`Unhandled: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ReportingPanel
        token="test-token"
        user={{ id: '1', username: 'leader', role: 'leader', fullName: 'Lider Testowy' }}
      />,
    );

    await screen.findByDisplayValue('Jan Kowalski');
    const workTypeSelect = screen.getByLabelText('Rodzaj czasu pracy') as HTMLSelectElement;

    // Find edit buttons in table
    const editButtons = await screen.findAllByRole('button', { name: 'Edytuj' });
    expect(editButtons).toHaveLength(2);

    // Edit the first entry (G)
    fireEvent.click(editButtons[0]);
    await waitFor(() => {
      expect(workTypeSelect.value).toBe('G');
    });

    // Cancel editing
    fireEvent.click(screen.getByRole('button', { name: 'Anuluj' }));

    // Edit the second entry (NS)
    fireEvent.click(editButtons[1]);
    await waitFor(() => {
      expect(workTypeSelect.value).toBe('NS');
    });
  });

  it('executes real NS save path on Sunday with valid order, asserts POST payload and updates list', async () => {
    let capturedRequestBody: any = null;
    let savedReports: any[] = [];

    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/employees?activeOnly=true') return response([baseEmployee]);
      if (url === '/api/orders/active') return response(baseOrders);
      if (url === '/api/work-time-types') return response(baseWorkTypes);
      if (url.startsWith('/api/reports/by-employee-date')) {
        return response(savedReports);
      }
      if (url === '/api/reports/check-warnings') {
        return response({
          warnStandard: false,
          warnTotal12: false,
          warnTotal24: false,
          totalStandard: 0,
          totalHours: 0,
        });
      }
      if (url === '/api/reports' && init?.method === 'POST') {
        capturedRequestBody = JSON.parse(init?.body as string);
        const newReport = {
          id: 'report-ns-sunday',
          date: capturedRequestBody.date,
          employeeId: capturedRequestBody.employeeId,
          orderId: capturedRequestBody.orderId,
          hours: capturedRequestBody.hours,
          workTimeTypeCode: capturedRequestBody.workTimeTypeCode,
          workShift: capturedRequestBody.workShift,
          missingCard: capturedRequestBody.missingCard,
          order: {
            orderNumber: 'ZL-001',
            productCode: 'P1',
            productName: 'Produkt 1',
            accountingAccount: '123',
          },
          workTimeType: {
            code: 'NS',
            name: 'Nadgodziny sobota/niedziela',
            requiresOrder: true,
          },
        };
        savedReports = [newReport];
        return response({ report: newReport, warnings: {} }, 201);
      }

      throw new Error(`Unhandled: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ReportingPanel
        token="test-token"
        user={{ id: '1', username: 'leader', role: 'leader', fullName: 'Lider Testowy' }}
      />,
    );

    await screen.findByDisplayValue('Jan Kowalski');

    // 1. Set Sunday date: 2026-09-06
    const dateInput = screen.getByLabelText(/Data raportu:/) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-09-06' } });

    // Verify workTypeSelect defaulted to NS
    const workTypeSelect = screen.getByLabelText('Rodzaj czasu pracy') as HTMLSelectElement;
    await waitFor(() => {
      expect(workTypeSelect.value).toBe('NS');
    });

    // 2. Select order from autocomplete
    const orderInput = screen.getByPlaceholderText('Wpisz numer zlecenia lub produktu...');
    fireEvent.focus(orderInput);
    fireEvent.change(orderInput, { target: { value: 'ZL-001' } });

    const orderOption = await screen.findByText('Zlecenie: ZL-001');
    fireEvent.click(orderOption);

    // 3. Enter hours and shift
    const hoursInput = screen.getByPlaceholderText('np. 8.00');
    fireEvent.change(hoursInput, { target: { value: '8.00' } });

    const shiftSelect = screen.getByLabelText('Zmiana') as HTMLSelectElement;
    fireEvent.change(shiftSelect, { target: { value: 'FIRST' } });

    // 4. Click save
    const saveButton = screen.getByRole('button', { name: /Zapisz wpis/ });
    fireEvent.click(saveButton);

    // 5. Assert POST payload
    await waitFor(() => {
      expect(capturedRequestBody).not.toBeNull();
      expect(capturedRequestBody).toEqual({
        date: '2026-09-06',
        employeeId: EMPLOYEE_ID,
        orderId: 'order-1',
        hours: 8,
        workTimeTypeCode: 'NS',
        workShift: 'FIRST',
        missingCard: false,
      });
    });

    // 6. Assert saved entry appears in the table
    await screen.findByText('ZL-001');
    expect(screen.getByText('8.0h')).toBeInTheDocument();
    expect(screen.getByText('Wpis został dodany.')).toBeInTheDocument();
  });

  it('renders visible backend error alert when backend rejects save', async () => {
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/employees?activeOnly=true') return response([baseEmployee]);
      if (url === '/api/orders/active') return response(baseOrders);
      if (url === '/api/work-time-types') return response(baseWorkTypes);
      if (url.startsWith('/api/reports/by-employee-date')) return response([]);
      if (url.startsWith('/api/company-calendar/day/')) {
        const date = url.slice('/api/company-calendar/day/'.length);
        const weekend = isWeekend(date);
        return response({
          date,
          isWorkingDay: !weekend,
          source: weekend ? 'weekend' : 'standard weekday',
          reason: null,
        });
      }
      if (url === '/api/reports/check-warnings') {
        return response({
          warnStandard: false,
          warnTotal12: false,
          warnTotal24: false,
          totalStandard: 0,
          totalHours: 0,
        });
      }
      if (url === '/api/reports' && init?.method === 'POST') {
        return response({
          code: 'NON_WORKING_DAY_ENTRY_NOT_ALLOWED',
          message: 'W dni wolne (sobota, niedziela) dozwolona jest wyłącznie rejestracja pracy nad zleceniem.',
        }, 400);
      }
      throw new Error(`Unhandled: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ReportingPanel
        token="test-token"
        user={{ id: '1', username: 'leader', role: 'leader', fullName: 'Lider Testowy' }}
      />,
    );

    await screen.findByDisplayValue('Jan Kowalski');

    const dateInput = screen.getByLabelText(/Data raportu:/) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-09-06' } });

    // Wait for workTypeSelect to become NS
    const workTypeSelect = screen.getByLabelText('Rodzaj czasu pracy') as HTMLSelectElement;
    await waitFor(() => {
      expect(workTypeSelect.value).toBe('NS');
    });

    // Select order
    const orderInput = screen.getByPlaceholderText('Wpisz numer zlecenia lub produktu...');
    fireEvent.focus(orderInput);
    fireEvent.change(orderInput, { target: { value: 'ZL-001' } });
    const orderOption = await screen.findByText('Zlecenie: ZL-001');
    fireEvent.click(orderOption);

    // Enter hours and shift
    const hoursInput = screen.getByPlaceholderText('np. 8.00');
    fireEvent.change(hoursInput, { target: { value: '8.00' } });

    const shiftSelect = screen.getByLabelText('Zmiana') as HTMLSelectElement;
    fireEvent.change(shiftSelect, { target: { value: 'FIRST' } });

    // Save
    const saveButton = screen.getByRole('button', { name: /Zapisz wpis/ });
    fireEvent.click(saveButton);

    // Assert visible error alert with message from backend
    await waitFor(() => {
      expect(screen.getByText('W dni wolne (sobota, niedziela) dozwolona jest wyłącznie rejestracja pracy nad zleceniem.')).toBeInTheDocument();
    });
  });

  it('displays client-side validation error when NS is submitted without order', async () => {
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/employees?activeOnly=true') return response([baseEmployee]);
      if (url === '/api/orders/active') return response(baseOrders);
      if (url === '/api/work-time-types') return response(baseWorkTypes);
      if (url.startsWith('/api/reports/by-employee-date')) return response([]);
      if (url.startsWith('/api/company-calendar/day/')) {
        const date = url.slice('/api/company-calendar/day/'.length);
        const weekend = isWeekend(date);
        return response({
          date,
          isWorkingDay: !weekend,
          source: weekend ? 'weekend' : 'standard weekday',
          reason: null,
        });
      }
      throw new Error(`Unhandled: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ReportingPanel
        token="test-token"
        user={{ id: '1', username: 'leader', role: 'leader', fullName: 'Lider Testowy' }}
      />,
    );

    await screen.findByDisplayValue('Jan Kowalski');

    // Manually change to NS
    const workTypeSelect = screen.getByLabelText('Rodzaj czasu pracy');
    fireEvent.change(workTypeSelect, { target: { value: 'NS' } });
    expect(workTypeSelect).toHaveValue('NS');

    // Select shift
    const shiftSelect = screen.getByLabelText('Zmiana') as HTMLSelectElement;
    fireEvent.change(shiftSelect, { target: { value: 'FIRST' } });

    // Enter hours but no order
    const hoursInput = screen.getByPlaceholderText('np. 8.00');
    fireEvent.change(hoursInput, { target: { value: '8.00' } });

    // Submit
    const saveButton = screen.getByRole('button', { name: /Zapisz wpis/ });
    fireEvent.click(saveButton);

    // Assert client-side validation message
    await waitFor(() => {
      expect(screen.getByText("Dla rodzaju 'NS' numer zlecenia jest wymagany.")).toBeInTheDocument();
    });
  });
});

describe('ReportingPanel — calendar-aware default work type (v0.5.8)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  const baseWorkTypes = [
    { code: 'G', name: 'Godziny standardowe', requiresOrder: false, isAbsence: false },
    { code: 'NS', name: 'Nadgodziny sobota/niedziela', requiresOrder: true, isAbsence: false },
    { code: 'UW', name: 'Urlop wypoczynkowy', requiresOrder: false, isAbsence: true },
  ];

  const baseEmployee = {
    id: EMPLOYEE_ID,
    fullName: 'Jan Kowalski',
    firstName: 'Jan',
    lastName: 'Kowalski',
    isActive: true,
  };

  const baseOrders = [
    { id: 'order-1', orderNumber: 'ZL-001', productCode: 'P1', productName: 'Produkt 1', accountingAccount: '123' },
  ];

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const setupPanel = (
    calendarHandler?: (date: string) => Promise<JsonResponse> | JsonResponse,
    customWorkTypes = baseWorkTypes,
    reportsForDate: (date: string) => unknown[] = () => [],
  ) => {
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/employees?activeOnly=true') return response([baseEmployee]);
      if (url === '/api/orders/active') return response(baseOrders);
      if (url === '/api/work-time-types') return response(customWorkTypes);
      if (url.startsWith('/api/reports/by-employee-date')) {
        const date = new URLSearchParams(url.split('?')[1]).get('date') || '';
        return response(reportsForDate(date));
      }
      if (url.startsWith('/api/company-calendar/day/')) {
        const date = url.slice('/api/company-calendar/day/'.length);
        if (calendarHandler) return calendarHandler(date);
        const weekend = isWeekend(date);
        return response({
          date,
          isWorkingDay: !weekend,
          source: weekend ? 'weekend' : 'standard weekday',
          reason: null,
        });
      }
      throw new Error(`Unhandled: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ReportingPanel
        token="test-token"
        user={{ id: '1', username: 'leader', role: 'leader', fullName: 'Lider Testowy' }}
      />,
    );
  };

  // 1. zwykły poniedziałek -> G
  it('1. sets default work type G on a regular Monday', async () => {
    setupPanel((date) => {
      if (date === '2026-09-14') {
        return response({ date, isWorkingDay: true, source: 'standard weekday' });
      }
      return response({ date, isWorkingDay: !isWeekend(date), source: isWeekend(date) ? 'weekend' : 'standard weekday' });
    });

    await screen.findByDisplayValue('Jan Kowalski');
    const dateInput = screen.getByLabelText(/Data raportu:/) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-09-14' } });

    const workTypeSelect = screen.getByLabelText('Rodzaj czasu pracy') as HTMLSelectElement;
    await waitFor(() => {
      expect(workTypeSelect.value).toBe('G');
    });
  });

  // 2. zwykła niedziela -> NS
  it('2. sets default work type NS on a regular Sunday', async () => {
    setupPanel((date) => {
      if (date === '2026-09-13') {
        return response({ date, isWorkingDay: false, source: 'weekend' });
      }
      return response({ date, isWorkingDay: !isWeekend(date), source: isWeekend(date) ? 'weekend' : 'standard weekday' });
    });

    await screen.findByDisplayValue('Jan Kowalski');
    const dateInput = screen.getByLabelText(/Data raportu:/) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-09-13' } });

    const workTypeSelect = screen.getByLabelText('Rodzaj czasu pracy') as HTMLSelectElement;
    await waitFor(() => {
      expect(workTypeSelect.value).toBe('NS');
    });
  });

  // 3. zmiana: niedziela -> wtorek => NS -> G
  it('3. updates default work type from NS to G when date changes from Sunday to Tuesday', async () => {
    setupPanel();

    await screen.findByDisplayValue('Jan Kowalski');
    const dateInput = screen.getByLabelText(/Data raportu:/) as HTMLInputElement;
    const workTypeSelect = screen.getByLabelText('Rodzaj czasu pracy') as HTMLSelectElement;

    fireEvent.change(dateInput, { target: { value: '2026-09-13' } });
    await waitFor(() => {
      expect(workTypeSelect.value).toBe('NS');
    });

    fireEvent.change(dateInput, { target: { value: '2026-09-15' } });
    await waitFor(() => {
      expect(workTypeSelect.value).toBe('G');
    });
  });

  // 4. święto ustawowe pn–pt => nie ustawia G
  it('4. does not default to G on a statutory public holiday occurring on a weekday', async () => {
    setupPanel((date) => {
      if (date === '2026-11-11') {
        return response({
          date,
          isWorkingDay: false,
          source: 'public holiday',
          reason: 'Narodowe Święto Niepodległości',
        });
      }
      return response({ date, isWorkingDay: !isWeekend(date), source: isWeekend(date) ? 'weekend' : 'standard weekday' });
    });

    await screen.findByDisplayValue('Jan Kowalski');
    const dateInput = screen.getByLabelText(/Data raportu:/) as HTMLInputElement;
    const workTypeSelect = screen.getByLabelText('Rodzaj czasu pracy') as HTMLSelectElement;

    fireEvent.change(dateInput, { target: { value: '2026-11-11' } });
    await waitFor(() => {
      expect(workTypeSelect.value).toBe('');
    });
  });

  // 5. firmowy dzień wolny pn–pt => nie ustawia G
  it('5. does not default to G on a company day off occurring on a weekday', async () => {
    setupPanel((date) => {
      if (date === '2026-08-14') {
        return response({
          date,
          isWorkingDay: false,
          source: 'company override',
          reason: 'Dzień wolny za 15.08',
        });
      }
      return response({ date, isWorkingDay: !isWeekend(date), source: isWeekend(date) ? 'weekend' : 'standard weekday' });
    });

    await screen.findByDisplayValue('Jan Kowalski');
    const dateInput = screen.getByLabelText(/Data raportu:/) as HTMLInputElement;
    const workTypeSelect = screen.getByLabelText('Rodzaj czasu pracy') as HTMLSelectElement;

    fireEvent.change(dateInput, { target: { value: '2026-08-14' } });
    await waitFor(() => {
      expect(workTypeSelect.value).toBe('');
    });
  });

  // 6. firmowy working-day override w sobotę => G, nie NS
  it('6. defaults to G and not NS when Saturday has a company working-day override', async () => {
    setupPanel((date) => {
      if (date === '2026-11-14') {
        return response({
          date,
          isWorkingDay: true,
          source: 'company override',
          reason: 'Sobota pracująca',
        });
      }
      return response({ date, isWorkingDay: !isWeekend(date), source: isWeekend(date) ? 'weekend' : 'standard weekday' });
    });

    await screen.findByDisplayValue('Jan Kowalski');
    const dateInput = screen.getByLabelText(/Data raportu:/) as HTMLInputElement;
    const workTypeSelect = screen.getByLabelText('Rodzaj czasu pracy') as HTMLSelectElement;

    fireEvent.change(dateInput, { target: { value: '2026-11-14' } });
    await waitFor(() => {
      expect(workTypeSelect.value).toBe('G');
    });
  });

  // 7. zmiana daty: zwykły dzień -> firmowy wolny -> zwykły dzień => poprawne przełączenie wartości
  it('7. correctly switches default value across standard weekday -> company day off -> standard weekday', async () => {
    setupPanel((date) => {
      if (date === '2026-08-14') {
        return response({
          date,
          isWorkingDay: false,
          source: 'company override',
          reason: 'Dzień wolny za 15.08',
        });
      }
      return response({ date, isWorkingDay: !isWeekend(date), source: isWeekend(date) ? 'weekend' : 'standard weekday' });
    });

    await screen.findByDisplayValue('Jan Kowalski');
    const dateInput = screen.getByLabelText(/Data raportu:/) as HTMLInputElement;
    const workTypeSelect = screen.getByLabelText('Rodzaj czasu pracy') as HTMLSelectElement;

    // Thursday: standard weekday -> G
    fireEvent.change(dateInput, { target: { value: '2026-08-13' } });
    await waitFor(() => {
      expect(workTypeSelect.value).toBe('G');
    });

    // Friday: company day off -> empty (not G)
    fireEvent.change(dateInput, { target: { value: '2026-08-14' } });
    await waitFor(() => {
      expect(workTypeSelect.value).toBe('');
    });

    // Monday: standard weekday -> G
    fireEvent.change(dateInput, { target: { value: '2026-08-17' } });
    await waitFor(() => {
      expect(workTypeSelect.value).toBe('G');
    });
  });

  // 8. szybka zmiana dwóch dat => odpowiedź API dla starej daty nie może nadpisać nowszego wyboru
  it('8. prevents race conditions: slow response for earlier date cannot overwrite newer selection', async () => {
    const slowDateDeferred = deferred<JsonResponse>();

    setupPanel((date) => {
      if (date === '2026-08-14') {
        return slowDateDeferred.promise;
      }
      if (date === '2026-09-14') {
        return response({
          date: '2026-09-14',
          isWorkingDay: true,
          source: 'standard weekday',
        });
      }
      return response({ date, isWorkingDay: !isWeekend(date), source: isWeekend(date) ? 'weekend' : 'standard weekday' });
    });

    await screen.findByDisplayValue('Jan Kowalski');
    const dateInput = screen.getByLabelText(/Data raportu:/) as HTMLInputElement;
    const workTypeSelect = screen.getByLabelText('Rodzaj czasu pracy') as HTMLSelectElement;

    // Fast switch: 2026-08-14 (slow) -> immediately 2026-09-14 (fast)
    fireEvent.change(dateInput, { target: { value: '2026-08-14' } });
    fireEvent.change(dateInput, { target: { value: '2026-09-14' } });

    // 2026-09-14 resolves and sets 'G'
    await waitFor(() => {
      expect(workTypeSelect.value).toBe('G');
    });

    // Late resolution of 2026-08-14 with non-working day
    slowDateDeferred.resolve(response({
      date: '2026-08-14',
      isWorkingDay: false,
      source: 'company override',
    }));

    // Must NOT overwrite 2026-09-14's 'G' selection
    await new Promise((r) => setTimeout(r, 50));
    expect(workTypeSelect.value).toBe('G');
  });

  it('preserves a manual selection when the current-date calendar response arrives late', async () => {
    const currentDateDeferred = deferred<JsonResponse>();

    setupPanel((date) => {
      if (date === '2026-09-15') return currentDateDeferred.promise;
      return response({ date, isWorkingDay: !isWeekend(date), source: isWeekend(date) ? 'weekend' : 'standard weekday' });
    });

    await screen.findByDisplayValue('Jan Kowalski');
    const dateInput = screen.getByLabelText(/Data raportu:/) as HTMLInputElement;
    const workTypeSelect = screen.getByLabelText('Rodzaj czasu pracy') as HTMLSelectElement;

    fireEvent.change(dateInput, { target: { value: '2026-09-15' } });
    await waitFor(() => expect(workTypeSelect.value).toBe(''));

    fireEvent.change(workTypeSelect, { target: { value: 'UW' } });
    expect(workTypeSelect.value).toBe('UW');

    await act(async () => {
      currentDateDeferred.resolve(response({ date: '2026-09-15', isWorkingDay: true, source: 'standard weekday' }));
    });

    expect(workTypeSelect.value).toBe('UW');
  });

  it('preserves an edit form when the current-date calendar response arrives late', async () => {
    const currentDateDeferred = deferred<JsonResponse>();
    const existingEntry = {
      id: 'report-ns-1',
      date: '2026-09-15',
      employeeId: EMPLOYEE_ID,
      orderId: 'order-1',
      hours: 6.5,
      workTimeTypeCode: 'NS',
      workShift: 'SECOND',
      missingCard: true,
      order: { orderNumber: 'ZL-001', productCode: 'P1', productName: 'Produkt 1', accountingAccount: '123' },
      workTimeType: { code: 'NS', name: 'Nadgodziny sobota/niedziela', requiresOrder: true },
    };

    setupPanel(
      (date) => date === '2026-09-15'
        ? currentDateDeferred.promise
        : response({ date, isWorkingDay: !isWeekend(date), source: isWeekend(date) ? 'weekend' : 'standard weekday' }),
      baseWorkTypes,
      (date) => date === '2026-09-15' ? [existingEntry] : [],
    );

    await screen.findByDisplayValue('Jan Kowalski');
    const dateInput = screen.getByLabelText(/Data raportu:/) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-09-15' } });

    fireEvent.click(await screen.findByRole('button', { name: 'Edytuj' }));

    const workTypeSelect = screen.getByLabelText('Rodzaj czasu pracy') as HTMLSelectElement;
    const hoursInput = screen.getByPlaceholderText('np. 8.00') as HTMLInputElement;
    await waitFor(() => {
      expect(screen.getByText('Edytuj wpis czasu pracy')).toBeInTheDocument();
      expect(workTypeSelect.value).toBe('NS');
      expect(hoursInput.value).toBe('6.5');
      expect(screen.getByDisplayValue('ZL-001')).toBeInTheDocument();
      expect(screen.getByRole('checkbox')).toBeChecked();
    });

    await act(async () => {
      currentDateDeferred.resolve(response({ date: '2026-09-15', isWorkingDay: true, source: 'standard weekday' }));
    });

    expect(screen.getByText('Edytuj wpis czasu pracy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zapisz zmiany' })).toBeInTheDocument();
    expect(workTypeSelect.value).toBe('NS');
    expect(hoursInput.value).toBe('6.5');
    expect(screen.getByDisplayValue('ZL-001')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('does not use a cached decision from the previous date while a new date is unresolved', async () => {
    const nextDateDeferred = deferred<JsonResponse>();

    setupPanel((date) => {
      if (date === '2026-09-13') {
        return response({ date, isWorkingDay: false, source: 'weekend' });
      }
      if (date === '2026-09-15') return nextDateDeferred.promise;
      return response({ date, isWorkingDay: !isWeekend(date), source: isWeekend(date) ? 'weekend' : 'standard weekday' });
    });

    await screen.findByDisplayValue('Jan Kowalski');
    const dateInput = screen.getByLabelText(/Data raportu:/) as HTMLInputElement;
    const workTypeSelect = screen.getByLabelText('Rodzaj czasu pracy') as HTMLSelectElement;

    fireEvent.change(dateInput, { target: { value: '2026-09-13' } });
    await waitFor(() => expect(workTypeSelect.value).toBe('NS'));

    fireEvent.change(dateInput, { target: { value: '2026-09-15' } });
    await waitFor(() => expect(workTypeSelect.value).toBe(''));

    await act(async () => {
      nextDateDeferred.resolve(response({ date: '2026-09-15', isWorkingDay: true, source: 'standard weekday' }));
    });

    expect(workTypeSelect.value).toBe('G');
  });

  it('applies an asynchronous default to a pristine new form', async () => {
    const currentDateDeferred = deferred<JsonResponse>();

    setupPanel((date) => {
      if (date === '2026-09-13') return currentDateDeferred.promise;
      return response({ date, isWorkingDay: !isWeekend(date), source: isWeekend(date) ? 'weekend' : 'standard weekday' });
    });

    await screen.findByDisplayValue('Jan Kowalski');
    const dateInput = screen.getByLabelText(/Data raportu:/) as HTMLInputElement;
    const workTypeSelect = screen.getByLabelText('Rodzaj czasu pracy') as HTMLSelectElement;

    fireEvent.change(dateInput, { target: { value: '2026-09-13' } });
    await waitFor(() => expect(workTypeSelect.value).toBe(''));

    await act(async () => {
      currentDateDeferred.resolve(response({ date: '2026-09-13', isWorkingDay: false, source: 'weekend' }));
    });

    expect(workTypeSelect.value).toBe('NS');
  });

  // 9. brak kodu NS => zachowanie zgodne z dotychczasową aplikacją, bez błędu
  it('9. handles missing NS work time type code on weekend safely without errors', async () => {
    const workTypesWithoutNS = [
      { code: 'G', name: 'Godziny standardowe', requiresOrder: false, isAbsence: false },
      { code: 'UW', name: 'Urlop wypoczynkowy', requiresOrder: false, isAbsence: true },
    ];

    setupPanel((date) => {
      return response({ date, isWorkingDay: false, source: 'weekend' });
    }, workTypesWithoutNS);

    await screen.findByDisplayValue('Jan Kowalski');
    const dateInput = screen.getByLabelText(/Data raportu:/) as HTMLInputElement;
    const workTypeSelect = screen.getByLabelText('Rodzaj czasu pracy') as HTMLSelectElement;

    fireEvent.change(dateInput, { target: { value: '2026-09-13' } });
    await waitFor(() => {
      expect(workTypeSelect.value).toBe('');
    });
  });

  // 10. błąd endpointu company-calendar => formularz nie crashuje; zastosuj bezpieczny fallback i opisz decyzję
  it('10. applies safe fallback on company-calendar API error without crashing', async () => {
    setupPanel((date) => {
      if (date === '2026-09-14') {
        return response({ message: 'Internal server error' }, 500);
      }
      return response({ date, isWorkingDay: !isWeekend(date), source: isWeekend(date) ? 'weekend' : 'standard weekday' });
    });

    await screen.findByDisplayValue('Jan Kowalski');
    const dateInput = screen.getByLabelText(/Data raportu:/) as HTMLInputElement;
    const workTypeSelect = screen.getByLabelText('Rodzaj czasu pracy') as HTMLSelectElement;

    fireEvent.change(dateInput, { target: { value: '2026-09-14' } });

    // Fallback: standard Monday resolves to G safely
    await waitFor(() => {
      expect(workTypeSelect.value).toBe('G');
    });
  });
});

describe('ReportingPanel — Work Shift Tracking UI (v0.5.9)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let capturedRequestBody: any = null;

  const baseWorkTypes = [
    { code: 'G', name: 'Godziny standardowe', requiresOrder: false, isAbsence: false },
    { code: 'UW', name: 'Urlop wypoczynkowy', requiresOrder: false, isAbsence: true },
    { code: 'L4', name: 'Zwolnienie lekarskie', requiresOrder: false, isAbsence: true },
  ];

  const baseEmployee = {
    id: EMPLOYEE_ID,
    fullName: 'Jan Kowalski',
    firstName: 'Jan',
    lastName: 'Kowalski',
    isActive: true,
  };

  const initialReports = [
    {
      id: 'rep-first-1',
      date: '2026-09-14',
      employeeId: EMPLOYEE_ID,
      orderId: null,
      hours: 8,
      workTimeTypeCode: 'G',
      workShift: 'FIRST',
      missingCard: false,
      workTimeType: { code: 'G', name: 'Godziny standardowe', requiresOrder: false, isAbsence: false },
    },
    {
      id: 'rep-second-2',
      date: '2026-09-14',
      employeeId: EMPLOYEE_ID,
      orderId: null,
      hours: 4,
      workTimeTypeCode: 'G',
      workShift: 'SECOND',
      missingCard: false,
      workTimeType: { code: 'G', name: 'Godziny standardowe', requiresOrder: false, isAbsence: false },
    },
    {
      id: 'rep-hist-3',
      date: '2026-09-14',
      employeeId: EMPLOYEE_ID,
      orderId: null,
      hours: 8,
      workTimeTypeCode: 'G',
      workShift: null, // Historical entry without shift
      missingCard: false,
      workTimeType: { code: 'G', name: 'Godziny standardowe', requiresOrder: false, isAbsence: false },
    },
  ];

  beforeEach(() => {
    capturedRequestBody = null;
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/employees?activeOnly=true') return response([baseEmployee]);
      if (url === '/api/orders/active') return response([]);
      if (url === '/api/work-time-types') return response(baseWorkTypes);
      if (url.startsWith('/api/reports/by-employee-date')) {
        return response(initialReports);
      }
      if (url.startsWith('/api/company-calendar/day/')) {
        const date = url.slice('/api/company-calendar/day/'.length);
        return response({ date, isWorkingDay: true, source: 'standard weekday', reason: null });
      }
      if (url === '/api/reports/check-warnings') {
        return response({ warnStandard: false, warnTotal12: false, warnTotal24: false, totalStandard: 0, totalHours: 0 });
      }
      if (url === '/api/reports' || url.startsWith('/api/reports/')) {
        capturedRequestBody = JSON.parse(init?.body as string);
        return response({
          report: {
            id: 'saved-rep-1',
            date: capturedRequestBody.date || '2026-09-14',
            employeeId: capturedRequestBody.employeeId || EMPLOYEE_ID,
            orderId: capturedRequestBody.orderId || null,
            hours: capturedRequestBody.hours,
            workTimeTypeCode: capturedRequestBody.workTimeTypeCode,
            workShift: capturedRequestBody.workShift,
            missingCard: capturedRequestBody.missingCard || false,
          },
          warnings: {},
        }, 200);
      }

      throw new Error(`Unhandled: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders shift select with I, II and III options for worked time, and renders shift badges in table', async () => {
    render(
      <ReportingPanel
        token="test-token"
        user={{ id: '1', username: 'leader', role: 'leader', fullName: 'Lider Testowy' }}
      />,
    );

    await screen.findByDisplayValue('Jan Kowalski');

    const shiftSelect = screen.getByLabelText('Zmiana') as HTMLSelectElement;
    expect(shiftSelect).toBeEnabled();
    expect(screen.getByRole('option', { name: '-- Wybierz zmianę --' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'I' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'II' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'III' })).toBeInTheDocument();

    // Verify shift labels in daily reports table
    expect(screen.getByText('I zmiana')).toBeInTheDocument();
    expect(screen.getByText('II zmiana')).toBeInTheDocument();
    expect(screen.getByText('Brak danych o zmianie')).toBeInTheDocument();
  });

  it('disables shift select and displays "Nie dotyczy (nieobecność)" when an absence type is selected', async () => {
    render(
      <ReportingPanel
        token="test-token"
        user={{ id: '1', username: 'leader', role: 'leader', fullName: 'Lider Testowy' }}
      />,
    );

    await screen.findByDisplayValue('Jan Kowalski');

    const workTypeSelect = screen.getByLabelText('Rodzaj czasu pracy') as HTMLSelectElement;
    const shiftSelect = screen.getByLabelText('Zmiana') as HTMLSelectElement;

    // Initially worked time 'G' is selected -> shift select enabled
    expect(shiftSelect).toBeEnabled();

    // Select absence 'UW'
    fireEvent.change(workTypeSelect, { target: { value: 'UW' } });

    // Shift select should become disabled with "Nie dotyczy (nieobecność)"
    expect(shiftSelect).toBeDisabled();
    expect(shiftSelect.value).toBe('');
    expect(screen.getByRole('option', { name: 'Nie dotyczy (nieobecność)' })).toBeInTheDocument();

    // Switch back to 'G' -> shift select re-enabled
    fireEvent.change(workTypeSelect, { target: { value: 'G' } });
    expect(shiftSelect).toBeEnabled();
    expect(shiftSelect.value).toBe('');
  });

  it('displays client-side validation error if shift is not selected for worked time', async () => {
    render(
      <ReportingPanel
        token="test-token"
        user={{ id: '1', username: 'leader', role: 'leader', fullName: 'Lider Testowy' }}
      />,
    );

    await screen.findByDisplayValue('Jan Kowalski');

    const hoursInput = screen.getByPlaceholderText('np. 8.00');
    fireEvent.change(hoursInput, { target: { value: '8.00' } });

    // Submit without selecting shift
    const saveButton = screen.getByRole('button', { name: /Zapisz wpis/ });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Wybór zmiany (I, II lub III zmiana) jest wymagany dla czasu pracy.')).toBeInTheDocument();
    });
    expect(capturedRequestBody).toBeNull();
  });

  it('allows saving worked time when THIRD shift is chosen, sending workShift in POST payload', async () => {
    render(
      <ReportingPanel
        token="test-token"
        user={{ id: '1', username: 'leader', role: 'leader', fullName: 'Lider Testowy' }}
      />,
    );

    await screen.findByDisplayValue('Jan Kowalski');

    const hoursInput = screen.getByPlaceholderText('np. 8.00');
    fireEvent.change(hoursInput, { target: { value: '8.00' } });

    const shiftSelect = screen.getByLabelText('Zmiana') as HTMLSelectElement;
    fireEvent.change(shiftSelect, { target: { value: 'THIRD' } });

    const saveButton = screen.getByRole('button', { name: /Zapisz wpis/ });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(capturedRequestBody).not.toBeNull();
      expect(capturedRequestBody.workShift).toBe('THIRD');
      expect(capturedRequestBody.hours).toBe(8);
    });
  });

  it('editing historical record without shift requires explicit shift selection before saving', async () => {
    render(
      <ReportingPanel
        token="test-token"
        user={{ id: '1', username: 'leader', role: 'leader', fullName: 'Lider Testowy' }}
      />,
    );

    await screen.findByDisplayValue('Jan Kowalski');

    // Click Edit on the 3rd entry (historical without shift)
    const editButtons = await screen.findAllByRole('button', { name: 'Edytuj' });
    fireEvent.click(editButtons[2]);

    const shiftSelect = screen.getByLabelText('Zmiana') as HTMLSelectElement;
    expect(shiftSelect.value).toBe('');

    // Attempt to save without choosing shift
    const saveButton = screen.getByRole('button', { name: /Zapisz zmiany/ });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Wybór zmiany (I, II lub III zmiana) jest wymagany dla czasu pracy.')).toBeInTheDocument();
    });

    // Now select 'THIRD' and save
    fireEvent.change(shiftSelect, { target: { value: 'THIRD' } });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(capturedRequestBody).not.toBeNull();
      expect(capturedRequestBody.workShift).toBe('THIRD');
    });
  });
});
