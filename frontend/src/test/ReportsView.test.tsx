import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
        if (String(input).startsWith('/api/analytics/report-by-order')) return response([{
          orderNumber: 'ZL-ZERO', productName: 'Zamknięte', productCode: 'P-0', quantity: 1,
          quantityUnit: 'szt.', plannedHours: 10, actualHours: 0, deviation: 10, percent: 0,
          status: 'CLOSED', completionDate: '2026-08-10',
        }]) as any;
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
  });
});
