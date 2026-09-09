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

  describe('Obowiązkowa data zakończenia zlecenia (v0.4.6)', () => {
    it('renderuje stale pole daty, zablokowane dla statusu Otwarte i odblokowane z gwiazdką dla statusu Zamknięte', async () => {
      render(
        <OrdersView
          token="test-token"
          user={{ id: '1', username: 'admin', role: 'admin', fullName: 'Administrator Testowy' }}
        />,
      );

      await screen.findByText('ZL-ALPHA-001');
      fireEvent.click(screen.getByRole('button', { name: /Dodaj/ }));

      // Pole jest od początku w DOM, zablokowane i niewymagane dla statusu OPEN
      const dateInput = screen.getByLabelText(/Rzeczywista data zakończenia/);
      expect(dateInput).toBeInTheDocument();
      expect(dateInput).toBeDisabled();
      expect(dateInput).not.toBeRequired();

      // Po zmianie statusu na CLOSED pole zostaje odblokowane i staje się wymagane
      const statusSelect = screen.getByLabelText('Status zlecenia');
      fireEvent.change(statusSelect, { target: { value: 'CLOSED' } });

      expect(dateInput).not.toBeDisabled();
      expect(dateInput).toBeRequired();
    });

    it('pokazuje komunikat walidacyjny i blokuje wysyłkę przy braku daty dla statusu Zamknięte', async () => {
      const fetchMock = vi.mocked(fetch);

      render(
        <OrdersView
          token="test-token"
          user={{ id: '1', username: 'admin', role: 'admin', fullName: 'Administrator Testowy' }}
        />,
      );

      await screen.findByText('ZL-ALPHA-001');
      fireEvent.click(screen.getByRole('button', { name: /Dodaj/ }));

      fireEvent.change(screen.getByPlaceholderText('np. ZL-2026-001'), { target: { value: 'ZL-NEW-999' } });
      fireEvent.change(screen.getByPlaceholderText('np. Silnik Elektryczny 15kW'), { target: { value: 'Nowy produkt' } });
      fireEvent.change(screen.getByLabelText('Status zlecenia'), { target: { value: 'CLOSED' } });

      const dateInput = screen.getByLabelText(/Rzeczywista data zakończenia/);
      fireEvent.change(dateInput, { target: { value: '' } });

      fetchMock.mockClear();
      const form = dateInput.closest('form')!;
      fireEvent.submit(form);

      expect(screen.getByText('Podaj rzeczywistą datę zakończenia zlecenia.')).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalledWith('/api/orders', expect.objectContaining({ method: 'POST' }));
    });

    it('pozwala zapisać zlecenie po podaniu prawidłowej daty zakończenia', async () => {
      const fetchMock = vi.mocked(fetch);

      render(
        <OrdersView
          token="test-token"
          user={{ id: '1', username: 'admin', role: 'admin', fullName: 'Administrator Testowy' }}
        />,
      );

      await screen.findByText('ZL-ALPHA-001');
      fireEvent.click(screen.getByRole('button', { name: /Dodaj/ }));

      fireEvent.change(screen.getByPlaceholderText('np. ZL-2026-001'), { target: { value: 'ZL-NEW-999' } });
      fireEvent.change(screen.getByPlaceholderText('np. Silnik Elektryczny 15kW'), { target: { value: 'Nowy produkt' } });
      fireEvent.change(screen.getByLabelText('Status zlecenia'), { target: { value: 'CLOSED' } });

      const dateInput = screen.getByLabelText(/Rzeczywista data zakończenia/);
      fireEvent.change(dateInput, { target: { value: '2026-08-05' } });

      fireEvent.click(screen.getByRole('button', { name: 'Zapisz zlecenie' }));

      await vi.waitFor(() => {
        const postCall = fetchMock.mock.calls.find(([url, opts]) => url === '/api/orders' && opts?.method === 'POST');
        expect(postCall).toBeDefined();
      });

      const postCall = fetchMock.mock.calls.find(([url, opts]) => url === '/api/orders' && opts?.method === 'POST');
      const body = JSON.parse(String(postCall?.[1]?.body));
      expect(body.status).toBe('CLOSED');
      expect(body.completionDate).toBe('2026-08-05');
    });

    it('edycja zamkniętego zlecenia prezentuje zapisaną datę zakończenia', async () => {
      render(
        <OrdersView
          token="test-token"
          user={{ id: '1', username: 'admin', role: 'admin', fullName: 'Administrator Testowy' }}
        />,
      );

      await screen.findByText(/ZL-DELTA-004/);
      const editButtons = screen.getAllByTitle('Edytuj');
      // ZL-DELTA-004 to ostatnie zlecenie na liście
      fireEvent.click(editButtons[3]);

      const dateInput = screen.getByLabelText(/Rzeczywista data zakończenia/);
      expect(dateInput).toHaveValue('2026-07-10');
    });

    it('ponowne otwarcie zlecenia przesyła zachowaną datę zakończenia bez jej automatycznego czyszczenia', async () => {
      const fetchMock = vi.mocked(fetch);

      render(
        <OrdersView
          token="test-token"
          user={{ id: '1', username: 'admin', role: 'admin', fullName: 'Administrator Testowy' }}
        />,
      );

      await screen.findByText(/ZL-DELTA-004/);
      const editButtons = screen.getAllByTitle('Edytuj');
      fireEvent.click(editButtons[3]);

      // Zmiana statusu na Otwarte
      fireEvent.change(screen.getByLabelText('Status zlecenia'), { target: { value: 'OPEN' } });
      fireEvent.click(screen.getByRole('button', { name: 'Zapisz zlecenie' }));

      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/orders/10000000-0000-4000-8000-000000000004',
          expect.objectContaining({ method: 'PUT' }),
        );
      });

      const putCall = fetchMock.mock.calls.find(([url]) =>
        url === '/api/orders/10000000-0000-4000-8000-000000000004'
      );
      const body = JSON.parse(String(putCall?.[1]?.body));
      expect(body.status).toBe('OPEN');
      expect(body.completionDate).toBe('2026-07-10');
    });
  });
});
