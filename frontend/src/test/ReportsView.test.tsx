import fs from 'fs';
import path from 'path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  { code: 'L4', name: 'Zwolnienie chorobowe', createdAt: '2026-01-07T00:00:00.000Z', requiresOrder: false, isAbsence: true },
  { code: 'G', name: 'Standardowe godziny pracy', createdAt: '2026-01-01T00:00:00.000Z', requiresOrder: true, isAbsence: false },
  { code: 'NOC', name: 'Zmiana nocna', createdAt: '2026-01-08T00:00:00.000Z', requiresOrder: false, isAbsence: false },
  { code: 'UOK', name: 'Urlop okolicznościowy', createdAt: '2026-01-05T00:00:00.000Z', requiresOrder: false, isAbsence: true },
  { code: 'NS', name: 'Nadgodziny sobota/niedziela', createdAt: '2026-01-03T00:00:00.000Z', requiresOrder: true, isAbsence: false },
  { code: 'UW', name: 'Urlop wypoczynkowy', createdAt: '2026-01-04T00:00:00.000Z', requiresOrder: false, isAbsence: true },
  { code: 'NDR', name: 'Nadgodziny', createdAt: '2026-01-02T00:00:00.000Z', requiresOrder: true, isAbsence: false },
  { code: 'UŻ', name: 'Urlop na żądanie', createdAt: '2026-01-06T00:00:00.000Z', requiresOrder: false, isAbsence: true },
];

const employees = [
  { id: 'employee-1', fullName: 'Kowalski Jan' },
  { id: 'employee-2', fullName: 'Nowak Anna' },
];

const orders = [
  { id: 'order-1', orderNumber: 'ZL-001', productName: 'Produkt testowy' },
];

const storedFilters = (filters: Record<string, string | boolean>) => JSON.stringify({
  version: 2,
  filters: {
    dateFrom: '',
    dateTo: '',
    employeeId: '',
    orderId: '',
    orderNumber: '',
    status: '',
    accountingAccount: '',
    absenceType: '',
    onlyWithHours: false,
    closureReport: false,
    ...filters,
  },
});

const renderReports = () => render(
  <ReportsView
    token="test-token"
    user={{ id: '1', username: 'leader', role: 'leader', fullName: 'Lider Testowy' }}
  />,
);

describe('ReportsView — miesięczny raport pracowników', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/employees') return response(employees);
      if (url === '/api/orders') return response(orders);
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
          employeeName: 'Kowalski Jan',
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
      if (url.startsWith('/api/analytics/report-absence-periods')) {
        return response([{
          employeeId: '20000000-0000-4000-8000-000000000001',
          employeeName: 'Kowalski Jan',
          workTimeTypeCode: 'L4',
          absenceType: 'L4 (Zwolnienie chorobowe)',
          dateFrom: '2026-07-03',
          dateTo: '2026-07-06',
          workingDays: 2,
        }]);
      }
      if (url.startsWith('/api/analytics/closure-control-summary')) {
        return response({
          ordersHours: 3168,
          absences: [
            { code: 'L4', name: 'Zwolnienie lekarskie', hours: 232 },
            { code: 'UW', name: 'Urlop wypoczynkowy', hours: 832 },
            { code: 'UŻ', name: 'Urlop na żądanie', hours: 8 },
            { code: 'OP', name: 'Art. 188', hours: 16 },
          ],
          totalAbsenceHours: 1088,
          totalSettledHours: 4256,
          totalEmployeeHours: 4256,
          difference: 0,
          status: 'MATCHED',
          statusLabel: 'Zgodne',
        });
      }

      throw new Error(`Nieobsłużone żądanie testowe: ${url}`);
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('uses current defaults on the first opening when sessionStorage has no entry', () => {
    renderReports();

    expect(screen.getByLabelText('Data od')).toHaveValue('');
    expect(screen.getByLabelText('Data do')).toHaveValue('');
    expect(window.sessionStorage.getItem('report.by-order')).toBeNull();
  });

  it('restores saved filters during the first render', () => {
    window.sessionStorage.setItem('report.by-order', storedFilters({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
      orderNumber: 'ZL-2026',
      status: 'OPEN',
      onlyWithHours: true,
    }));

    renderReports();

    expect(screen.getByLabelText('Data od')).toHaveValue('2026-07-01');
    expect(screen.getByLabelText('Data do')).toHaveValue('2026-07-31');
    expect(screen.getByLabelText('Numer zlecenia')).toHaveValue('ZL-2026');
    expect(screen.getByLabelText('Status zlecenia')).toHaveValue('OPEN');
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('rejects data saved with an unsupported storage version', () => {
    window.sessionStorage.setItem('report.by-order', JSON.stringify({
      version: 999,
      filters: { dateFrom: '2020-01-01' },
    }));

    renderReports();

    expect(screen.getByLabelText('Data od')).toHaveValue('');
    expect(window.sessionStorage.getItem('report.by-order')).toBeNull();
  });

  it('immediately stores date changes using the versioned structure', () => {
    renderReports();

    fireEvent.change(screen.getByLabelText('Data od'), { target: { value: '2026-08-01' } });
    fireEvent.change(screen.getByLabelText('Data do'), { target: { value: '2026-08-31' } });

    expect(JSON.parse(window.sessionStorage.getItem('report.by-order')!)).toMatchObject({
      version: 2,
      filters: { dateFrom: '2026-08-01', dateTo: '2026-08-31' },
    });
  });

  it('stores employee and report-specific type filters', async () => {
    renderReports();

    fireEvent.click(screen.getByRole('button', { name: 'Wg Pracowników (Miesięczny)' }));
    await screen.findByRole('option', { name: 'Nowak Anna' });
    fireEvent.change(screen.getByLabelText('Pracownik'), { target: { value: 'employee-2' } });
    expect(JSON.parse(window.sessionStorage.getItem('report.by-employee')!).filters.employeeId).toBe('employee-2');

    fireEvent.click(screen.getByRole('button', { name: 'Okresy Nieobecności' }));
    await screen.findByRole('option', { name: 'L4 — Zwolnienie chorobowe' });
    fireEvent.change(screen.getByLabelText('Rodzaj nieobecności'), { target: { value: 'L4' } });
    expect(JSON.parse(window.sessionStorage.getItem('report.absence')!).filters.absenceType).toBe('L4');
  });

  it('keeps independent filter sets when switching reports and returning', () => {
    renderReports();

    fireEvent.change(screen.getByLabelText('Data od'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('Numer zlecenia'), { target: { value: 'ZL-A' } });

    fireEvent.click(screen.getByRole('button', { name: 'Wg Kont Księgowych' }));
    expect(screen.getByLabelText('Data od')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Data od'), { target: { value: '2026-02-01' } });
    fireEvent.change(screen.getByLabelText('Konto księgowe'), { target: { value: 'K-200' } });

    fireEvent.click(screen.getByRole('button', { name: 'Godziny wg Zleceń' }));
    expect(screen.getByLabelText('Data od')).toHaveValue('2026-01-01');
    expect(screen.getByLabelText('Numer zlecenia')).toHaveValue('ZL-A');
    expect(JSON.parse(window.sessionStorage.getItem('report.by-account')!).filters).toMatchObject({
      dateFrom: '2026-02-01',
      accountingAccount: 'K-200',
    });
  });

  it('removes only the active report entry and restores defaults on reset', () => {
    window.sessionStorage.setItem('report.by-order', storedFilters({ dateFrom: '2026-03-01' }));
    window.sessionStorage.setItem('report.by-employee', storedFilters({ employeeId: 'employee-1' }));
    renderReports();

    fireEvent.click(screen.getByRole('button', { name: 'Wyczyść filtry' }));

    expect(screen.getByLabelText('Data od')).toHaveValue('');
    expect(window.sessionStorage.getItem('report.by-order')).toBeNull();
    expect(window.sessionStorage.getItem('report.by-employee')).not.toBeNull();
  });

  it('restores persisted filters after the view is mounted again', () => {
    const firstRender = renderReports();
    fireEvent.change(screen.getByLabelText('Data od'), { target: { value: '2026-04-01' } });
    firstRender.unmount();

    renderReports();

    expect(screen.getByLabelText('Data od')).toHaveValue('2026-04-01');
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
    expect(lines[6]).toBe('Kowalski Jan;13.5;13.5;8;0;0;0;0;0;0;2.5');
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
    ['Okresy Nieobecności', 'Raport okresów nieobecności'],
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

  it('shows only isAbsence types in the absence filter and renders period columns', async () => {
    render(
      <ReportsView
        token="test-token"
        user={{ id: '1', username: 'leader', role: 'leader', fullName: 'Lider Testowy' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Okresy Nieobecności' }));
    await screen.findByRole('table', { name: 'Raport okresów nieobecności' });

    const absenceSelect = screen.getByLabelText('Rodzaj nieobecności');
    expect(Array.from((absenceSelect as HTMLSelectElement).options).map(option => option.value)).toEqual([
      '', 'UW', 'UOK', 'UŻ', 'L4',
    ]);
    expect(screen.getByRole('columnheader', { name: 'Liczba dni nieobecności' })).toBeInTheDocument();
    expect(screen.getByText('L4 (Zwolnienie chorobowe)')).toBeInTheDocument();
    expect(screen.getByText('Łącznie dni nieobecności:')).toBeInTheDocument();
  });

  it('calculates total absence days correctly in table footer with multiple period rows', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/employees') {
        return { ok: true, json: async () => [{ id: '1', fullName: 'Kowalski Jan' }] };
      }
      if (url === '/api/work-time-types') {
        return { ok: true, json: async () => [{ code: 'L4', name: 'Zwolnienie chorobowe', isAbsence: true, requiresOrder: false }] };
      }
      if (url.startsWith('/api/analytics/report-absence-periods')) {
        return {
          ok: true,
          json: async () => [
            { employeeId: '1', employeeName: 'Kowalski Jan', workTimeTypeCode: 'L4', absenceType: 'L4 (Zwolnienie chorobowe)', dateFrom: '2026-07-01', dateTo: '2026-07-03', workingDays: 3 },
            { employeeId: '1', employeeName: 'Kowalski Jan', workTimeTypeCode: 'L4', absenceType: 'L4 (Zwolnienie chorobowe)', dateFrom: '2026-07-06', dateTo: '2026-07-07', workingDays: 2 },
          ],
        };
      }
      return { ok: true, json: async () => [] };
    }));

    render(
      <ReportsView
        token="test-token"
        user={{ id: '1', username: 'leader', role: 'leader', fullName: 'Lider Testowy' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Okresy Nieobecności' }));
    await screen.findByRole('table', { name: 'Raport okresów nieobecności' });

    expect(screen.getByText('Łącznie dni nieobecności:')).toBeInTheDocument();
    // 3 + 2 = 5 total days in tfoot
    const table = screen.getByRole('table', { name: 'Raport okresów nieobecności' });
    const tfoot = table.querySelector('tfoot');
    expect(tfoot).not.toBeNull();
    expect(tfoot?.textContent).toContain('5');
  });

  it('renders WKU absence periods in the table and exports them to CSV', async () => {
    let exportedBlob: Blob | null = null;
    const createSpy = vi.spyOn(window.URL, 'createObjectURL').mockImplementation((blob: any) => {
      exportedBlob = blob;
      return 'blob:test-report-wku-csv';
    });

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/employees') {
        return { ok: true, json: async () => [{ id: '1', fullName: 'Kowalski Jan' }] };
      }
      if (url === '/api/work-time-types') {
        return { ok: true, json: async () => [{ code: 'WKU', name: 'Służba wojskowa', isAbsence: true, requiresOrder: false }] };
      }
      if (url.startsWith('/api/analytics/report-absence-periods')) {
        return {
          ok: true,
          json: async () => [
            {
              employeeId: '1',
              employeeName: 'Kowalski Jan',
              workTimeTypeCode: 'WKU',
              absenceType: 'WKU (Służba wojskowa)',
              dateFrom: '2026-09-01',
              dateTo: '2026-09-04',
              workingDays: 4,
            },
          ],
        };
      }
      return { ok: true, json: async () => [] };
    }));

    render(
      <ReportsView
        token="test-token"
        user={{ id: '1', username: 'leader', role: 'leader', fullName: 'Lider Testowy' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Okresy Nieobecności' }));
    await screen.findByRole('table', { name: 'Raport okresów nieobecności' });

    expect(screen.getByText('WKU (Służba wojskowa)')).toBeInTheDocument();
    expect(screen.getByText('Łącznie dni nieobecności:')).toBeInTheDocument();

    const table = screen.getByRole('table', { name: 'Raport okresów nieobecności' });
    const tfoot = table.querySelector('tfoot');
    expect(tfoot?.textContent).toContain('4');

    // Test CSV export for WKU
    const csvButton = screen.getByRole('button', { name: 'Pobierz plik CSV' });
    fireEvent.click(csvButton);

    expect(exportedBlob).not.toBeNull();
    const csvContent = (await exportedBlob!.text()).replace(/^\uFEFF/, '');
    expect(csvContent).toContain('Raport;Raport okresów nieobecności');
    expect(csvContent).toContain('Kowalski Jan;WKU (Służba wojskowa);2026-09-01;2026-09-04;4');
    createSpy.mockRestore();
  });

  describe('Raport zamknięcia', () => {
    it('shows the toggle in the existing order report', () => {
      renderReports();

      expect(screen.getByRole('button', { name: 'Raport zamknięcia' })).toBeInTheDocument();
    });

    it('activates and deactivates the mode with a visually distinct state', () => {
      renderReports();
      const toggle = screen.getByRole('button', { name: 'Raport zamknięcia' });

      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-pressed', 'true');
      expect(toggle).toHaveClass('btn-primary');
      expect(screen.getByLabelText('Status zlecenia')).toBeDisabled();
      expect(screen.getByRole('checkbox')).toBeDisabled();

      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
      expect(toggle).toHaveClass('btn-secondary');
    });

    it('passes active mode to the JSON endpoint and ignores conflicting filters', async () => {
      const requestedUrls: string[] = [];
      const originalFetch = global.fetch;
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requestedUrls.push(String(input));
        return originalFetch(input, init);
      }));
      renderReports();

      fireEvent.change(screen.getByLabelText('Status zlecenia'), { target: { value: 'SUSPENDED' } });
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: 'Raport zamknięcia' }));

      await waitFor(() => expect(requestedUrls.some(url =>
        url.includes('/api/analytics/report-by-order') &&
        url.includes('closureReport=true') &&
        !url.includes('status=') &&
        !url.includes('onlyWithHours='),
      )).toBe(true));
    });

    it('passes active mode to XLSX export', async () => {
      const requestedUrls: string[] = [];
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url === '/api/employees') return response(employees);
        if (url === '/api/orders') return response(orders);
        if (url === '/api/work-time-types') return response(workTimeTypes);
        if (url.startsWith('/api/analytics/report-by-order')) return response([{
          orderNumber: 'ZL-ZERO', productName: 'Zamknięte', productCode: 'P-0', quantity: 1,
          quantityUnit: 'szt.', plannedHours: 10, actualHours: 0, deviation: 10, percent: 0,
          status: 'CLOSED', completionDate: '2026-08-10',
        }]);
        if (url.startsWith('/api/analytics/export/by-order')) {
          return { ok: true, blob: async () => new Blob(['xlsx']) } as Response;
        }
        if (url.startsWith('/api/analytics/closure-control-summary')) {
          return response({
            ordersHours: 0,
            absences: [],
            totalAbsenceHours: 0,
            totalSettledHours: 0,
            totalEmployeeHours: 0,
            difference: 0,
            status: 'MATCHED',
            statusLabel: 'Zgodne',
          });
        }
        return response([]);
      }));
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:closure-report');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
      renderReports();

      fireEvent.change(screen.getByLabelText('Data od'), { target: { value: '2026-08-01' } });
      fireEvent.change(screen.getByLabelText('Data do'), { target: { value: '2026-08-31' } });
      fireEvent.click(screen.getByRole('button', { name: 'Raport zamknięcia' }));
      await screen.findByText('ZL-ZERO');
      fireEvent.click(screen.getByRole('button', { name: 'Pobierz Excel (XLSX)' }));

      await waitFor(() => expect(requestedUrls).toContain(
        '/api/analytics/export/by-order?dateFrom=2026-08-01&dateTo=2026-08-31&closureReport=true',
      ));
    });

    it('renders a closed order with zero hours and its completion date', async () => {
      vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url.startsWith('/api/analytics/report-by-order')) return response([{
          orderNumber: 'ZL-ZERO', productName: 'Zamknięte', productCode: 'P-0', quantity: 1,
          quantityUnit: 'szt.', plannedHours: 10, actualHours: 0, deviation: 10, percent: 0,
          status: 'CLOSED', completionDate: '2026-08-10',
        }]) as any;
        if (url.startsWith('/api/analytics/closure-control-summary')) {
          return response({
            ordersHours: 0,
            absences: [],
            totalAbsenceHours: 0,
            totalSettledHours: 0,
            totalEmployeeHours: 0,
            difference: 0,
            status: 'MATCHED',
            statusLabel: 'Zgodne',
          }) as any;
        }
        return response([]) as any;
      });
      renderReports();

      await screen.findByText('ZL-ZERO');
      expect(screen.getByText('0.0 h')).toBeInTheDocument();
      expect(screen.getByText('2026-08-10')).toBeInTheDocument();
    });

    it('restores active mode from the shared session filter mechanism', () => {
      window.sessionStorage.setItem('report.by-order', storedFilters({ closureReport: true }));
      renderReports();

      expect(screen.getByRole('button', { name: 'Raport zamknięcia' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('reset disables the mode and removes its session entry', () => {
      window.sessionStorage.setItem('report.by-order', storedFilters({ closureReport: true }));
      renderReports();

      fireEvent.click(screen.getByRole('button', { name: 'Wyczyść filtry' }));

      expect(screen.getByRole('button', { name: 'Raport zamknięcia' })).toHaveAttribute('aria-pressed', 'false');
      expect(window.sessionStorage.getItem('report.by-order')).toBeNull();
    });

    it('keeps active mode after switching to another report and back', () => {
      renderReports();
      fireEvent.click(screen.getByRole('button', { name: 'Raport zamknięcia' }));

      fireEvent.click(screen.getByRole('button', { name: 'Wg Kont Księgowych' }));
      fireEvent.click(screen.getByRole('button', { name: 'Godziny wg Zleceń' }));

      expect(screen.getByRole('button', { name: 'Raport zamknięcia' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('keeps the standard JSON request unchanged while mode is inactive', async () => {
      const requestedUrls: string[] = [];
      const originalFetch = global.fetch;
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requestedUrls.push(String(input));
        return originalFetch(input, init);
      }));
      renderReports();

      await waitFor(() => expect(requestedUrls.some(url =>
        url.startsWith('/api/analytics/report-by-order?') && !url.includes('closureReport='),
      )).toBe(true));
    });

    it('does not display control summary section when closureReport mode is inactive', () => {
      renderReports();
      expect(screen.queryByTestId('closure-control-summary')).not.toBeInTheDocument();
    });

    it('renders control summary with orders, absences, total settled, total employee hours, difference, and MATCHED status', async () => {
      renderReports();

      fireEvent.change(screen.getByLabelText('Data od'), { target: { value: '2026-08-01' } });
      fireEvent.change(screen.getByLabelText('Data do'), { target: { value: '2026-08-31' } });
      fireEvent.click(screen.getByRole('button', { name: 'Raport zamknięcia' }));

      const summaryCard = await screen.findByTestId('closure-control-summary');

      expect(within(summaryCard).getByText('Kontrola rozliczenia czasu')).toBeInTheDocument();
      expect(within(summaryCard).getByTestId('control-summary-status-badge')).toHaveTextContent('Status: Zgodne');
      expect(within(summaryCard).getByTestId('control-orders-hours')).toHaveTextContent('3168.00 h');
      expect(within(summaryCard).getByText('232.00 h')).toBeInTheDocument();
      expect(within(summaryCard).getByText('832.00 h')).toBeInTheDocument();
      expect(within(summaryCard).getByText('8.00 h')).toBeInTheDocument();
      expect(within(summaryCard).getByText('16.00 h')).toBeInTheDocument();
      expect(within(summaryCard).getByTestId('control-total-settled')).toHaveTextContent('4256.00 h');
      expect(within(summaryCard).getByTestId('control-employee-hours')).toHaveTextContent('4256.00 h');
      expect(within(summaryCard).getByTestId('control-difference')).toHaveTextContent('0.00 h');
    });

    it('renders MISMATCHED status, difference, and full diagnostics table with signed contributions', async () => {
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/employees') return response(employees);
        if (url === '/api/orders') return response(orders);
        if (url === '/api/work-time-types') return response(workTimeTypes);
        if (url.startsWith('/api/analytics/report-by-order')) return response([{
          orderNumber: 'ZL-001', productName: 'P1', plannedHours: 100, actualHours: 100,
          deviation: 0, percent: 100, status: 'OPEN',
        }]);
        if (url.startsWith('/api/analytics/closure-control-summary')) {
          return response({
            ordersHours: 100,
            absences: [{ code: 'UW', name: 'Urlop wypoczynkowy', hours: 16 }],
            totalAbsenceHours: 16,
            totalSettledHours: 116,
            totalEmployeeHours: 108,
            difference: 8,
            status: 'MISMATCHED',
            statusLabel: 'Niezgodne',
            diagnostics: [
              {
                employeeId: 'emp-1',
                employeeName: 'Kowalski Jan',
                date: '2026-08-18',
                workTimeTypeCode: 'UW',
                workTimeTypeName: 'Urlop wypoczynkowy',
                hours: 16,
                orderId: 'order-1',
                orderNumber: 'ZL-001',
                reason: 'Nieobecność z zleceniem w rozliczeniu (podwójne naliczenie)',
                contribution: 16,
              },
              {
                employeeId: 'emp-1',
                employeeName: 'Kowalski Jan',
                date: '2026-08-15',
                workTimeTypeCode: 'SZK',
                workTimeTypeName: 'Szkolenie',
                hours: 8,
                orderId: null,
                orderNumber: null,
                reason: 'Brak zlecenia',
                contribution: -8,
              },
            ],
          });
        }
        return response([]);
      }));

      renderReports();
      fireEvent.change(screen.getByLabelText('Data od'), { target: { value: '2026-08-01' } });
      fireEvent.change(screen.getByLabelText('Data do'), { target: { value: '2026-08-31' } });
      fireEvent.click(screen.getByRole('button', { name: 'Raport zamknięcia' }));

      const summaryCard = await screen.findByTestId('closure-control-summary');
      expect(within(summaryCard).getByTestId('control-summary-status-badge')).toHaveTextContent('Status: Niezgodne');
      expect(within(summaryCard).getByTestId('control-difference')).toHaveTextContent('+8.00 h');

      // Diagnostics header
      expect(within(summaryCard).getByText(/Diagnostyka niezgodności \(2 rekordów\)/)).toBeInTheDocument();

      // Diagnostic table headers (all 7 headers in order)
      expect(within(summaryCard).getByRole('columnheader', { name: 'Pracownik' })).toBeInTheDocument();
      expect(within(summaryCard).getByRole('columnheader', { name: 'Data' })).toBeInTheDocument();
      expect(within(summaryCard).getByRole('columnheader', { name: 'Typ' })).toBeInTheDocument();
      expect(within(summaryCard).getByRole('columnheader', { name: 'Godziny' })).toBeInTheDocument();
      expect(within(summaryCard).getByRole('columnheader', { name: 'Zlecenie' })).toBeInTheDocument();
      expect(within(summaryCard).getByRole('columnheader', { name: 'Przyczyna' })).toBeInTheDocument();
      expect(within(summaryCard).getByRole('columnheader', { name: 'Wkład' })).toBeInTheDocument();

      const diagTable = summaryCard.querySelector('table')!;
      expect(diagTable).toBeInTheDocument();
      const rows = diagTable.querySelectorAll('tbody tr');
      expect(rows).toHaveLength(3); // 2 data rows + 1 sum row

      // Row 1 concrete assertions: Kowalski Jan, 2026-08-18, UW (Urlop wypoczynkowy), 16.00 h, ZL-001, reason, +16.00 h
      const row1 = within(rows[0] as HTMLElement);
      expect(row1.getByText('Kowalski Jan')).toBeInTheDocument();
      expect(row1.getByText('2026-08-18')).toBeInTheDocument();
      expect(row1.getByText(/UW/)).toBeInTheDocument();
      expect(row1.getByText(/\(Urlop wypoczynkowy\)/)).toBeInTheDocument();
      expect(row1.getByText('16.00 h')).toBeInTheDocument();
      expect(row1.getByText('ZL-001')).toBeInTheDocument();
      expect(row1.getByText('Nieobecność z zleceniem w rozliczeniu (podwójne naliczenie)')).toBeInTheDocument();
      expect(row1.getByText('+16.00 h')).toBeInTheDocument();

      // Row 2 concrete assertions: Kowalski Jan, 2026-08-15, SZK (Szkolenie), 8.00 h, —, Brak zlecenia, -8.00 h
      const row2 = within(rows[1] as HTMLElement);
      expect(row2.getByText('Kowalski Jan')).toBeInTheDocument();
      expect(row2.getByText('2026-08-15')).toBeInTheDocument();
      expect(row2.getByText(/SZK/)).toBeInTheDocument();
      expect(row2.getByText(/\(Szkolenie\)/)).toBeInTheDocument();
      expect(row2.getByText('8.00 h')).toBeInTheDocument();
      expect(row2.getByText('—')).toBeInTheDocument();
      expect(row2.getByText('Brak zlecenia')).toBeInTheDocument();
      expect(row2.getByText('-8.00 h')).toBeInTheDocument();

      // Row 3: Diagnostics sum row and explanatory difference text
      const row3 = within(rows[2] as HTMLElement);
      expect(row3.getByText('Suma wkładów:')).toBeInTheDocument();
      expect(row3.getByText('+8.00 h')).toBeInTheDocument();
      expect(within(summaryCard).getByText(/Suma wkładów powinna równać się różnicy:/)).toBeInTheDocument();
    });
  });

  describe('Raport Szczegółowy', () => {
    it('populates orders in the select dropdown and passes orderId to the detailed report endpoint', async () => {
      const requestedUrls: string[] = [];
      const originalFetch = global.fetch;
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requestedUrls.push(String(input));
        return originalFetch(input, init);
      }));

      renderReports();

      fireEvent.click(screen.getByRole('button', { name: 'Raport Szczegółowy' }));
      await screen.findByRole('table', { name: 'Raport szczegółowy' });

      const orderSelect = screen.getByLabelText('Zlecenie');
      expect(orderSelect).toBeInTheDocument();

      fireEvent.change(orderSelect, { target: { value: 'order-1' } });

      await waitFor(() => expect(requestedUrls.some(url =>
        url.includes('/api/analytics/report-detailed') &&
        url.includes('orderId=order-1'),
      )).toBe(true));
    });

    it('passes orderId along with employeeId and date range to the detailed report endpoint', async () => {
      const requestedUrls: string[] = [];
      const originalFetch = global.fetch;
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requestedUrls.push(String(input));
        return originalFetch(input, init);
      }));

      renderReports();

      fireEvent.click(screen.getByRole('button', { name: 'Raport Szczegółowy' }));
      await screen.findByRole('table', { name: 'Raport szczegółowy' });

      fireEvent.change(screen.getByLabelText('Data od'), { target: { value: '2026-08-01' } });
      fireEvent.change(screen.getByLabelText('Data do'), { target: { value: '2026-08-31' } });
      fireEvent.change(screen.getByLabelText('Pracownik'), { target: { value: 'employee-1' } });
      fireEvent.change(screen.getByLabelText('Zlecenie'), { target: { value: 'order-1' } });

      await waitFor(() => expect(requestedUrls.some(url =>
        url.includes('/api/analytics/report-detailed') &&
        url.includes('dateFrom=2026-08-01') &&
        url.includes('dateTo=2026-08-31') &&
        url.includes('employeeId=employee-1') &&
        url.includes('orderId=order-1'),
      )).toBe(true));
    });

    it('passes orderId to XLSX export for detailed report', async () => {
      const requestedUrls: string[] = [];
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url === '/api/employees') return response(employees);
        if (url === '/api/orders') return response(orders);
        if (url === '/api/work-time-types') return response(workTimeTypes);
        if (url.startsWith('/api/analytics/report-detailed')) {
          return response([{
            id: 'rep-1',
            date: '2026-08-10',
            employeeName: 'Jan Kowalski',
            orderNumber: 'ZL-001',
            productCode: 'P-001',
            productName: 'Produkt testowy',
            accountingAccount: 'K-001',
            hours: 8,
            workTimeTypeCode: 'G',
            creatorName: 'Admin',
            createdAt: '2026-08-10T08:00:00.000Z',
          }]);
        }
        if (url.startsWith('/api/analytics/export/detailed')) {
          return { ok: true, blob: async () => new Blob(['xlsx']) } as Response;
        }
        return response([]);
      }));
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:detailed-report');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

      renderReports();

      fireEvent.click(screen.getByRole('button', { name: 'Raport Szczegółowy' }));
      await screen.findByRole('table', { name: 'Raport szczegółowy' });

      fireEvent.change(screen.getByLabelText('Zlecenie'), { target: { value: 'order-1' } });
      await screen.findByText('Jan Kowalski');
      fireEvent.click(screen.getByRole('button', { name: 'Pobierz Excel (XLSX)' }));

      await waitFor(() => expect(requestedUrls.some(url =>
        url.startsWith('/api/analytics/export/detailed') &&
        url.includes('orderId=order-1'),
      )).toBe(true));
    });

    it('exports CSV with correct detailed report metadata, order number and product code', async () => {
      let exportedBlob: Blob | undefined;
      vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
        if (blob instanceof Blob) exportedBlob = blob;
        return 'blob:test-report-detailed-csv';
      });
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/employees') return response(employees);
        if (url === '/api/orders') return response(orders);
        if (url === '/api/work-time-types') return response(workTimeTypes);
        if (url.startsWith('/api/analytics/report-detailed')) {
          return response([{
            id: 'rep-1',
            date: '2026-08-10',
            employeeName: 'Jan Kowalski',
            orderNumber: 'ZL-001',
            productCode: 'P-001',
            productName: 'Produkt testowy',
            accountingAccount: 'K-001',
            hours: 8,
            workTimeTypeCode: 'G',
            creatorName: 'Admin',
            createdAt: '2026-08-10T08:00:00.000Z',
          }]);
        }
        return response([]);
      }));

      renderReports();

      fireEvent.click(screen.getByRole('button', { name: 'Raport Szczegółowy' }));
      await screen.findByRole('table', { name: 'Raport szczegółowy' });

      fireEvent.change(screen.getByLabelText('Zlecenie'), { target: { value: 'order-1' } });
      await screen.findByText('Jan Kowalski');
      fireEvent.click(screen.getByRole('button', { name: 'Pobierz plik CSV' }));

      expect(exportedBlob).toBeDefined();
      const csv = (await exportedBlob!.text()).replace(/^\uFEFF/, '');
      expect(csv).toContain('Raport;Szczegółowy raport czasu pracy');
      expect(csv).toContain('Zlecenie;ZL-001');
      expect(csv).toContain('2026-08-10;Jan Kowalski;ZL-001;P-001;Produkt testowy;K-001;8;G;Admin');
    });
  });

  describe('v0.5.5 — ochrona widoczności zakładek raportów i izolacja CSS (root cause regression protection)', () => {
    /**
     * OGRANICZENIE ŚRODOWISKA JSDOM:
     * JSDOM nie implementuje silnika renderowania geometrii CSS (layout engine),
     * nie oblicza rzeczywistych wymiarów pudełek (bounding box / getBoundingClientRect),
     * nie ewaluuje zapytań mediów CSS (@media) w powiązaniu z DOM i nie symuluje
     * zawijania tekstu ani kompresji flexbox w zależności od szerokości viewportu.
     *
     * Z tego względu poniższy zestaw testów weryfikuje:
     * 1. Strukturę DOM, atrybuty (type="button") i dedykowane klasy (report-tab).
     * 2. Integralność reguł w pliku index.css (kontrakt CSS i eliminację globalnego .nav-item w media queries).
     * 3. Pełny przepływ interakcji użytkownika i przełączania zakładek dla ról leader i admin.
     *
     * Rzeczywisty rendering responsywny przy szerokościach desktop, <=900px i <=600px
     * musi być weryfikowany w prawdziwej przeglądarce zgodnie ze scenariuszem
     * manualnym opisanym w V0.5.5_REPORT_TABS_REGRESSION_REPORT.md.
     */

    const tabNames = [
      'Godziny wg Zleceń',
      'Wg Pracowników (Miesięczny)',
      'Wg Kont Księgowych',
      'Raport Szczegółowy',
      'Okresy Nieobecności',
    ] as const;

    const roles = ['leader', 'admin'] as const;

    roles.forEach((userRole) => {
      it(`[rola: ${userRole}] przechodzi pełny scenariusz 7 kroków z dedykowaną klasą report-tab i ochroną widoczności`, async () => {
        // Krok 1: Renderuje widok Raportów
        render(
          <ReportsView
            token="test-token"
            user={{
              id: userRole === 'admin' ? 'admin-1' : 'leader-1',
              username: userRole,
              role: userRole,
              fullName: userRole === 'admin' ? 'Admin Testowy' : 'Lider Testowy',
            }}
          />,
        );

        await screen.findByText('Centrum Raportów');
        await screen.findByRole('table', { name: 'Raport według zleceń' });

        const getTabButtons = () => tabNames.map((name) => screen.getByRole('button', { name }));

        // Krok 2: Weryfikuje widoczność wszystkich 5 zakładek oraz strukturę flex i dedykowane klasy
        let tabButtons = getTabButtons();
        expect(tabButtons).toHaveLength(5);

        // Kontener zakładek musi wspierać poziome przewijanie bez ucinania i kompresji pionowej
        const container = tabButtons[0].parentElement;
        expect(container).not.toBeNull();
        expect(container?.style.display).toBe('flex');
        expect(container?.style.overflowX).toBe('auto');
        expect(container?.style.flexShrink).toBe('0');

        tabButtons.forEach((btn) => {
          expect(btn).toBeVisible();
          expect(btn).toHaveAttribute('type', 'button');
          // Potwierdzenie dedykowanej klasy report-tab
          expect(btn).toHaveClass('report-tab');
          // Potwierdzenie, że zakładki nie polegają wyłącznie na globalnym .nav-item
          expect(btn).toHaveClass('nav-item');
          expect(btn.classList.contains('report-tab')).toBe(true);
          expect(btn.classList.contains('nav-item')).toBe(true);
        });

        // Weryfikacja początkowego stanu aktywności (Godziny wg Zleceń aktywne, pozostałe nieaktywne)
        expect(tabButtons[0]).toHaveClass('active');
        for (let i = 1; i < tabButtons.length; i++) {
          expect(tabButtons[i]).not.toHaveClass('active');
        }

        // Krok 3: Wybiera opcję "Raport zamknięcia"
        const closureButton = screen.getByRole('button', { name: /Raport zamknięcia/i });
        expect(closureButton).toBeVisible();
        expect(closureButton).toHaveAttribute('aria-pressed', 'false');

        fireEvent.click(closureButton);
        expect(closureButton).toHaveAttribute('aria-pressed', 'true');

        // Krok 4: Weryfikuje, że wszystkie dozwolone etykiety zakładek są NADAL widoczne i zachowują dedykowaną klasę
        tabButtons = getTabButtons();
        expect(tabButtons).toHaveLength(5);
        tabButtons.forEach((btn) => {
          expect(btn).toBeVisible();
          expect(btn).toHaveClass('report-tab');
          expect(btn).toHaveClass('nav-item');
          expect(btn).toHaveAttribute('type', 'button');
        });
        expect(tabButtons[0]).toHaveClass('active');

        // Krok 5: Przełącza na inną zakładkę raportową (np. by-employee)
        fireEvent.click(tabButtons[1]);

        // Krok 6: Weryfikuje wyrenderowanie docelowego raportu
        await screen.findByRole('table', { name: 'Raport według pracowników' });

        // Krok 7: Weryfikuje poprawną zmianę stanu aktywnej/nieaktywnej zakładki
        tabButtons = getTabButtons();
        expect(tabButtons[1]).toHaveClass('active');
        expect(tabButtons[0]).not.toHaveClass('active');
        for (let i = 0; i < tabButtons.length; i++) {
          expect(tabButtons[i]).toBeVisible();
          expect(tabButtons[i]).toHaveClass('report-tab');
          if (i === 1) {
            expect(tabButtons[i]).toHaveClass('active');
          } else {
            expect(tabButtons[i]).not.toHaveClass('active');
          }
        }
      });
    });

    it('przełącza się na Raport Szczegółowy po włączeniu raportu zamknięcia i zachowuje wszystkie etykiety zakładek', async () => {
      renderReports();
      await screen.findByRole('table', { name: 'Raport według zleceń' });

      const closureBtn = screen.getByRole('button', { name: /Raport zamknięcia/i });
      fireEvent.click(closureBtn);
      expect(closureBtn).toHaveAttribute('aria-pressed', 'true');

      // Przełączenie na Raport Szczegółowy
      const detailedTab = screen.getByRole('button', { name: 'Raport Szczegółowy' });
      fireEvent.click(detailedTab);

      // Docelowy raport szczegółowy wyrenderowany
      await screen.findByRole('table', { name: 'Raport szczegółowy' });
      expect(detailedTab).toHaveClass('active');
      expect(screen.getByRole('button', { name: 'Godziny wg Zleceń' })).not.toHaveClass('active');

      // Wszystkie zakładki nadal widoczne, posiadają klasę report-tab i type="button"
      tabNames.forEach((name) => {
        const btn = screen.getByRole('button', { name });
        expect(btn).toBeVisible();
        expect(btn).toHaveClass('report-tab');
        expect(btn).toHaveClass('nav-item');
        expect(btn).toHaveAttribute('type', 'button');
      });
    });

    it('chroni przed root cause w index.css: dedykowane reguły .report-tab oraz brak globalnego .nav-item w media queries', () => {
      const cssPath = path.resolve(__dirname, '../index.css');
      const cssContent = fs.readFileSync(cssPath, 'utf-8');

      // 1. Dedykowana klasa .report-tab definiuje flex-shrink: 0, white-space: nowrap, flex: 0 0 auto
      expect(cssContent).toMatch(/\.report-tab[^{]*\{[^}]*white-space:\s*nowrap/s);
      expect(cssContent).toMatch(/\.report-tab[^{]*\{[^}]*flex-shrink:\s*0/s);
      expect(cssContent).toMatch(/\.report-tab[^{]*\{[^}]*flex:\s*0\s+0\s+auto/s);

      // Pomocnik do wyodrębniania pełnego bloku @media z uwzględnieniem zagnieżdżonych nawiasów klamrowych
      const extractMediaBlock = (query: string): string => {
        const startIdx = cssContent.indexOf(query);
        if (startIdx === -1) return '';
        const braceStart = cssContent.indexOf('{', startIdx);
        if (braceStart === -1) return '';
        let depth = 1;
        let idx = braceStart + 1;
        while (idx < cssContent.length && depth > 0) {
          if (cssContent[idx] === '{') depth++;
          else if (cssContent[idx] === '}') depth--;
          idx++;
        }
        return cssContent.slice(braceStart + 1, idx - 1);
      };

      // 2. Media queries @media (max-width: 900px) oraz @media (max-width: 600px)
      // NIE mogą zawierać nieskopowanego globalnego selektora ".nav-item {"
      // który kompresowałby zakładki poza sidebarem
      const media900Body = extractMediaBlock('@media (max-width: 900px)');
      expect(media900Body).not.toBe('');
      expect(media900Body).not.toMatch(/(^|[\n,;])\s*\.nav-item\s*\{/);
      expect(media900Body).toMatch(/\.sidebar\s+\.nav-item\s*\{/);

      const media600Body = extractMediaBlock('@media (max-width: 600px)');
      expect(media600Body).not.toBe('');
      expect(media600Body).not.toMatch(/(^|[\n,;])\s*\.nav-item\s*\{/);
      expect(media600Body).toMatch(/\.sidebar\s+\.nav-item\s*\{/);
    });
  });
});
