import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReportsView from '../components/ReportsView';

type JsonResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

const response = (body: unknown): JsonResponse => ({
  ok: true,
  json: async () => body,
});

const workTimeTypes = [
  { code: 'L4', name: 'Zwolnienie chorobowe', createdAt: '2026-01-07T00:00:00.000Z' },
  { code: 'G', name: 'Standardowe godziny pracy', createdAt: '2026-01-01T00:00:00.000Z' },
  { code: 'NOC', name: 'Zmiana nocna', createdAt: '2026-01-08T00:00:00.000Z' },
  { code: 'UOK', name: 'Urlop okolicznościowy', createdAt: '2026-01-05T00:00:00.000Z' },
  { code: 'NS', name: 'Nadgodziny sobota/niedziela', createdAt: '2026-01-03T00:00:00.000Z' },
  { code: 'UW', name: 'Urlop wypoczynkowy', createdAt: '2026-01-04T00:00:00.000Z' },
  { code: 'NDR', name: 'Nadgodziny', createdAt: '2026-01-02T00:00:00.000Z' },
  { code: 'UŻ', name: 'Urlop na żądanie', createdAt: '2026-01-06T00:00:00.000Z' },
];

describe('ReportsView — miesięczny raport pracowników', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/employees') return response([]);
      if (url === '/api/orders') return response([]);
      if (url === '/api/work-time-types') return response(workTimeTypes);
      if (url.startsWith('/api/analytics/report-by-order')) return response([]);
      if (url.startsWith('/api/analytics/report-by-employee')) {
        return response([{
          employeeId: '20000000-0000-4000-8000-000000000001',
          employeeName: 'Jan Kowalski',
          G: 8,
          NOC: 2.5,
          LEGACY: 3,
          suma: 13.5,
        }]);
      }

      throw new Error(`Nieobsłużone żądanie testowe: ${url}`);
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('generates ordered columns exclusively from the current dictionary', async () => {
    render(
      <ReportsView
        token="test-token"
        user={{ id: '1', username: 'leader', role: 'leader', fullName: 'Lider Testowy' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Wg Pracowników (Miesięczny)' }));

    await screen.findByRole('columnheader', { name: 'NOC (Zmiana nocna)' });

    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Pracownik',
      'G (Standardowe godziny pracy)',
      'NDR (Nadgodziny)',
      'NS (Nadgodziny sobota/niedziela)',
      'UW (Urlop wypoczynkowy)',
      'UOK (Urlop okolicznościowy)',
      'UŻ (Urlop na żądanie)',
      'L4 (Zwolnienie chorobowe)',
      'NOC (Zmiana nocna)',
      'Suma godzin',
    ]);
    expect(screen.queryByRole('columnheader', { name: /LEGACY/ })).not.toBeInTheDocument();
    expect(screen.getByText('2.5 h')).toBeInTheDocument();
  });
});
