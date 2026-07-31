import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OrdersView from '../components/OrdersView';

type JsonResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

const response = (body: unknown): JsonResponse => ({
  ok: true,
  json: async () => body,
});

const orders = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    orderNumber: 'ZL-ALPHA-001',
    orderDate: '2026-07-01T00:00:00.000Z',
    plannedShipmentDate: null,
    productCode: 'PROD-AX-99',
    productName: 'Pompa próżniowa',
    accountingAccount: 'ACC-400',
    orderedBy: 'MetalWorks Sp. z o.o.',
    notes: 'Pilna realizacja',
    plannedHours: 12,
    quantity: 2,
    quantityUnit: 'szt.',
    hoursPerUnit: 6,
    actualHours: 4,
    utilizationPercent: 33.33,
    status: 'OPEN',
    isActive: true,
    createdAt: '2026-07-01T00:00:00.000Z',
    completionDate: null,
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    orderNumber: 'ZL-BETA-002',
    orderDate: '2026-07-02T00:00:00.000Z',
    plannedShipmentDate: null,
    productCode: 'PROD-BX-88',
    productName: 'Wentylator przemysłowy',
    accountingAccount: 'ACC-500',
    orderedBy: 'Pol-Stal S.A.',
    notes: null,
    plannedHours: 20,
    quantity: 4,
    quantityUnit: 'szt.',
    hoursPerUnit: 5,
    actualHours: 10,
    utilizationPercent: 50,
    status: 'OPEN',
    isActive: true,
    createdAt: '2026-07-02T00:00:00.000Z',
    completionDate: null,
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    orderNumber: 'ZL-GAMMA-003',
    orderDate: '2026-07-03T00:00:00.000Z',
    plannedShipmentDate: null,
    productCode: 'PROD-CX-77',
    productName: 'Zasilacz buforowy',
    accountingAccount: 'ACC-600',
    orderedBy: 'ElektroTech Sp. z o.o.',
    notes: 'Wstrzymane przez klienta',
    plannedHours: 10,
    quantity: 1,
    quantityUnit: 'szt.',
    hoursPerUnit: 10,
    actualHours: 2,
    utilizationPercent: 20,
    status: 'SUSPENDED',
    isActive: true,
    createdAt: '2026-07-03T00:00:00.000Z',
    completionDate: null,
  },
  {
    id: '10000000-0000-4000-8000-000000000004',
    orderNumber: 'ZL-DELTA-004',
    orderDate: '2026-07-04T00:00:00.000Z',
    plannedShipmentDate: null,
    productCode: 'PROD-DX-66',
    productName: 'Moduł sterowania',
    accountingAccount: 'ACC-700',
    orderedBy: 'Automatyka S.A.',
    notes: 'Zlecenie zakończone',
    plannedHours: 8,
    quantity: 1,
    quantityUnit: 'szt.',
    hoursPerUnit: 8,
    actualHours: 8,
    utilizationPercent: 100,
    status: 'CLOSED',
    isActive: false,
    createdAt: '2026-07-04T00:00:00.000Z',
    completionDate: '2026-07-10T00:00:00.000Z',
  },
];

describe('OrdersView — wyszukiwarka i filtry zleceń', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    vi.stubGlobal('fetch', vi.fn(async () => response(orders)));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each([
    ['Zamawiającym', 'metalworks', 'ZL-ALPHA-001', 'ZL-BETA-002'],
    ['Numerze księgowym', 'c-40', 'ZL-ALPHA-001', 'ZL-BETA-002'],
    ['Numerze produktu', 'ax-9', 'ZL-ALPHA-001', 'ZL-BETA-002'],
    ['dotychczasowym numerze zlecenia', 'beta-00', 'ZL-BETA-002', 'ZL-ALPHA-001'],
  ])(
    'wyszukuje częściowo i bez uwzględniania wielkości liter po %s',
    async (_field, query, expectedOrder, hiddenOrder) => {
      render(
        <OrdersView
          token="test-token"
          user={{ id: '1', username: 'admin', role: 'admin', fullName: 'Administrator Testowy' }}
        />,
      );

      await screen.findByText('ZL-ALPHA-001');

      fireEvent.change(
        screen.getByPlaceholderText('Szukaj zlecenia po numerze, produkcie, koncie księgowym...'),
        { target: { value: query } },
      );

      expect(screen.getByText(expectedOrder)).toBeInTheDocument();
      expect(screen.queryByText(hiddenOrder)).not.toBeInTheDocument();
    },
  );

  it('poprawnie filtruje po statusach: Wszystkie, Otwarte, Wstrzymane, Zamknięte (w tym zlecenia z isActive: false)', async () => {
    render(
      <OrdersView
        token="test-token"
        user={{ id: '1', username: 'admin', role: 'admin', fullName: 'Administrator Testowy' }}
      />,
    );

    // Domyślnie "Wszystkie statusy" (pokazuje aktywne i nieaktywne ze wszystkich statusów)
    expect(await screen.findByText('ZL-ALPHA-001')).toBeInTheDocument();
    expect(screen.getByText('ZL-BETA-002')).toBeInTheDocument();
    expect(screen.getByText('ZL-GAMMA-003')).toBeInTheDocument();
    expect(screen.getByText(/ZL-DELTA-004/)).toBeInTheDocument();

    const statusSelect = screen.getByLabelText('Filtr statusu');

    // Otwarte (OPEN)
    fireEvent.change(statusSelect, { target: { value: 'OPEN' } });
    expect(screen.getByText('ZL-ALPHA-001')).toBeInTheDocument();
    expect(screen.getByText('ZL-BETA-002')).toBeInTheDocument();
    expect(screen.queryByText('ZL-GAMMA-003')).not.toBeInTheDocument();
    expect(screen.queryByText(/ZL-DELTA-004/)).not.toBeInTheDocument();

    // Wstrzymane (SUSPENDED)
    fireEvent.change(statusSelect, { target: { value: 'SUSPENDED' } });
    expect(screen.queryByText('ZL-ALPHA-001')).not.toBeInTheDocument();
    expect(screen.queryByText('ZL-BETA-002')).not.toBeInTheDocument();
    expect(screen.getByText('ZL-GAMMA-003')).toBeInTheDocument();
    expect(screen.queryByText(/ZL-DELTA-004/)).not.toBeInTheDocument();

    // Zamknięte (CLOSED - w tym zlecenie z isActive: false)
    fireEvent.change(statusSelect, { target: { value: 'CLOSED' } });
    expect(screen.queryByText('ZL-ALPHA-001')).not.toBeInTheDocument();
    expect(screen.queryByText('ZL-BETA-002')).not.toBeInTheDocument();
    expect(screen.queryByText('ZL-GAMMA-003')).not.toBeInTheDocument();
    expect(screen.getByText(/ZL-DELTA-004/)).toBeInTheDocument();
  });

  it('łączy filtr statusu z wyszukiwaniem tekstowym', async () => {
    render(
      <OrdersView
        token="test-token"
        user={{ id: '1', username: 'admin', role: 'admin', fullName: 'Administrator Testowy' }}
      />,
    );

    await screen.findByText('ZL-ALPHA-001');

    fireEvent.change(screen.getByLabelText('Filtr statusu'), { target: { value: 'OPEN' } });
    fireEvent.change(
      screen.getByPlaceholderText('Szukaj zlecenia po numerze, produkcie, koncie księgowym...'),
      { target: { value: 'ALPHA' } },
    );

    expect(screen.getByText('ZL-ALPHA-001')).toBeInTheDocument();
    expect(screen.queryByText('ZL-BETA-002')).not.toBeInTheDocument();
    expect(screen.queryByText('ZL-GAMMA-003')).not.toBeInTheDocument();
  });

  it('wyświetla uwagi na liście i przesyła je podczas edycji zlecenia', async () => {
    const fetchMock = vi.mocked(fetch);

    render(
      <OrdersView
        token="test-token"
        user={{ id: '1', username: 'admin', role: 'admin', fullName: 'Administrator Testowy' }}
      />,
    );

    expect(await screen.findByText('Pilna realizacja')).toBeInTheDocument();
    fireEvent.click(screen.getAllByTitle('Edytuj')[0]);

    const notesInput = screen.getByLabelText('Uwagi (opcjonalnie)');
    expect(notesInput).toHaveValue('Pilna realizacja');
    fireEvent.change(notesInput, { target: { value: '  Uzgodnić termin wysyłki  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz zlecenie' }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/orders/10000000-0000-4000-8000-000000000001',
        expect.objectContaining({ method: 'PUT' }),
      );
    });

    const updateCall = fetchMock.mock.calls.find(([url]) =>
      url === '/api/orders/10000000-0000-4000-8000-000000000001'
    );
    const requestBody = JSON.parse(String(updateCall?.[1]?.body));
    expect(requestBody.notes).toBe('Uzgodnić termin wysyłki');
  });

  it('renders in read-only mode for leader role, shows identical filter results, and remains read-only after filtering', async () => {
    render(
      <OrdersView
        token="test-token"
        user={{ id: '2', username: 'leader', role: 'leader', fullName: 'Lider Testowy' }}
      />,
    );

    expect(await screen.findByText('ZL-ALPHA-001')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Dodaj/ })).not.toBeInTheDocument();
    expect(screen.queryByTitle('Edytuj')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Usuń')).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Akcje' })).not.toBeInTheDocument();

    // Zmiana filtra statusu przez Lidera
    const statusSelect = screen.getByLabelText('Filtr statusu');
    fireEvent.change(statusSelect, { target: { value: 'SUSPENDED' } });

    expect(screen.getByText('ZL-GAMMA-003')).toBeInTheDocument();
    expect(screen.queryByText('ZL-ALPHA-001')).not.toBeInTheDocument();

    // Potwierdzenie, że po przefiltrowaniu Lider nadal nie widzi przycisków zapisu/edycji/usuwania/dodawania
    expect(screen.queryByRole('button', { name: /Dodaj/ })).not.toBeInTheDocument();
    expect(screen.queryByTitle('Edytuj')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Usuń')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Zapisz/ })).not.toBeInTheDocument();
  });
});
