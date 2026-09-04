import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

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

    // Zaznacz checkbox
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);

    // Wyślij formularz
    const saveButton = screen.getByRole('button', { name: /Zapisz wpis/ });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(savedRequestBody).not.toBeNull();
      expect(savedRequestBody.missingCard).toBe(true);
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
