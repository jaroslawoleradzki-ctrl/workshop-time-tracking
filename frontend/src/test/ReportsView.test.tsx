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
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/employees') return response([]);
      if (url === '/api/orders') return response([]);
      if (url === '/api/work-time-types') return response(workTimeTypes);
      if (url.startsWith('/api/analytics/report-by-order')) {
        return response([{
          orderNumber: 'ZL-001',
          productName: 'Produkt testowy',
          productCode: 'P-001',
          plannedHours: 10,
          actualHours: 8,
          deviation: 2,
          percent: 80,
          status: 'OPEN',
        }]);
      }
      if (url.startsWith('/api/analytics/report-by-employee')) {
        return response([{
          employeeId: '20000000-0000-4000-8000-000000000001',
          employeeName: 'Jan Kowalski',
          G: 8,
          NOC: 2.5,
          LEGACY: 3,
          suma: 13.5,
          sumaBezNadgodzin: 13.5,
        }]);
      }
      if (url.startsWith('/api/analytics/report-by-account')) {
        return response([{
          date: '2026-07-01',
          accountingAccount: 'K-001',
          employeeName: 'Jan Kowalski',
          orderNumber: 'ZL-001',
          productName: 'Produkt testowy',
          hours: 8,
          workTimeTypeCode: 'G',
        }]);
      }
      if (url.startsWith('/api/analytics/report-detailed')) {
        return response([{
          id: '30000000-0000-4000-8000-000000000001',
          date: '2026-07-01',
          employeeName: 'Jan Kowalski',
          orderNumber: 'ZL-001',
          productName: 'Produkt testowy',
          accountingAccount: 'K-001',
          hours: 8,
          workTimeTypeCode: 'G',
          creatorName: 'Administrator',
          createdAt: '2026-07-01T08:00:00.000Z',
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
      'Suma godzin z nadgodzinami',
      'Suma godzin bez nadgodzin',
      'G (Standardowe godziny pracy)',
      'NDR (Nadgodziny)',
      'NS (Nadgodziny sobota/niedziela)',
      'UW (Urlop wypoczynkowy)',
      'UOK (Urlop okolicznościowy)',
      'UŻ (Urlop na żądanie)',
      'L4 (Zwolnienie chorobowe)',
      'NOC (Zmiana nocna)',
    ]);
    expect(screen.queryByRole('columnheader', { name: /LEGACY/ })).not.toBeInTheDocument();
    expect(screen.getByText('2.5 h')).toBeInTheDocument();
  });

  it('exports the same employee rows and dictionary columns to CSV as the table', async () => {
    let exportedBlob: Blob | undefined;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      if (blob instanceof Blob) exportedBlob = blob;
      return 'blob:test-report';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    render(
      <ReportsView
        token="test-token"
        user={{ id: '1', username: 'leader', role: 'leader', fullName: 'Lider Testowy' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Wg Pracowników (Miesięczny)' }));
    await screen.findByRole('columnheader', { name: 'NOC (Zmiana nocna)' });
    fireEvent.click(screen.getByRole('button', { name: 'Pobierz plik CSV' }));

    expect(exportedBlob).toBeDefined();
    const csvWithBom = await exportedBlob!.text();
    expect(csvWithBom.startsWith('\uFEFF')).toBe(true);

    const csv = csvWithBom.replace(/^\uFEFF/, '');
    const lines = csv.split('\n');

    expect(lines[0]).toBe('Raport;Miesięczny raport czasu pracy pracowników');
    expect(lines[1]).toBe('Zakres dat;Wszystkie');
    expect(lines[2]).toBe('Pracownik;Wszyscy pracownicy');
    expect(lines[3]).toMatch(/^Wygenerowano;\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}$/);
    expect(lines[4]).toBe('');

    expect(lines[5]).toBe([
      'Pracownik',
      'Suma godzin z nadgodzinami',
      'Suma godzin bez nadgodzin',
      ...workTimeTypes
        .slice()
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
        .map((type) => `${type.code} (${type.name})`),
    ].join(';'));
    expect(lines[6]).toBe('Jan Kowalski;13.5;13.5;8;0;0;0;0;0;0;2.5');
    expect(lines.join('\n')).not.toContain('LEGACY');
  });

  it('correctly escapes semicolons, quotes, newlines, and preserves Polish characters in CSV export', async () => {
    let exportedBlob: Blob | undefined;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      if (blob instanceof Blob) exportedBlob = blob;
      return 'blob:test-report-escaping';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('/api/analytics/report-by-order')) {
        return response([
          {
            orderNumber: 'ZL-PL-001',
            productName: 'Obudowa "Zażółć"; typ B\nlinia 2',
            productCode: 'PROD-PL',
            quantity: 10,
            quantityUnit: 'szt.',
            plannedHours: 5,
            actualHours: 4,
            deviation: 1,
            percent: 80,
            status: 'OPEN',
          },
        ]) as any;
      }
      return response([]) as any;
    });

    render(
      <ReportsView
        token="test-token"
        user={{ id: '1', username: 'admin', role: 'admin', fullName: 'Administrator Testowy' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Godziny wg Zleceń' }));
    await screen.findByText('ZL-PL-001');

    fireEvent.click(screen.getByRole('button', { name: 'Pobierz plik CSV' }));

    expect(exportedBlob).toBeDefined();
    const csvContent = await exportedBlob!.text();
    expect(csvContent.startsWith('\uFEFF')).toBe(true);

    expect(csvContent).toContain('Raport;Raport godzin według zleceń');
    expect(csvContent).toContain('ZL-PL-001;"Obudowa ""Zażółć""; typ B\nlinia 2";PROD-PL;10 szt.;5;4;1;80;Otwarte');
  });

  it.each([
    ['Godziny wg Zleceń', 'Raport według zleceń'],
    ['Wg Pracowników (Miesięczny)', 'Raport według pracowników'],
    ['Wg Kont Księgowych', 'Raport kont księgowych'],
    ['Raport Szczegółowy', 'Raport szczegółowy'],
  ])('uses the shared synchronized horizontal scrollbars for %s', async (tabName, tableLabel) => {
    render(
      <ReportsView
        token="test-token"
        user={{ id: '1', username: 'admin', role: 'admin', fullName: 'Administrator Testowy' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: tabName }));
    await screen.findByRole('table', { name: tableLabel });

    expect(screen.getByTestId(`${tableLabel}-top-scrollbar`)).toHaveClass(
      'top-scrollbar-custom',
      'scrollable-table-top',
    );
    expect(screen.getByTestId(`${tableLabel}-table-scrollbar`)).toHaveClass(
      'table-container-fixed',
      'top-scrollbar-custom',
    );
    expect(screen.getByRole('table', { name: tableLabel })).toHaveClass(
      'table-fixed',
      'table-scroll-wide',
    );
  });

  it('sends uppercase status parameter when filtering order report by status', async () => {
    let lastUrl = '';
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      lastUrl = url;
      if (url === '/api/employees' || url === '/api/orders') return response([]);
      if (url === '/api/work-time-types') return response(workTimeTypes);
      if (url.startsWith('/api/analytics/report-by-order')) {
        return response([]);
      }
      return response([]);
    }));

    render(
      <ReportsView
        token="test-token"
        user={{ id: '1', username: 'admin', role: 'admin', fullName: 'Administrator Testowy' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Godziny wg Zleceń' }));

    const statusSelect = screen.getByRole('combobox');
    fireEvent.change(statusSelect, { target: { value: 'OPEN' } });

    expect(lastUrl).toContain('status=OPEN');
  });
});
