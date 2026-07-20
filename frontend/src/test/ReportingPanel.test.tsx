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
