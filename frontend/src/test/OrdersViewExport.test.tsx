import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OrdersView from '../components/OrdersView';

type JsonResponse = {
  ok: boolean;
  status: number;
  headers: Headers;
  json: () => Promise<unknown>;
  blob: () => Promise<Blob>;
};

const response = (body: unknown, status = 200, headersObj: Record<string, string> = {}): JsonResponse => {
  const headers = new Headers(headersObj);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    json: async () => body,
    blob: async () => new Blob(['mock-excel-content'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  };
};

describe('OrdersView — Eksport do Excel (XLSX)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  const mockOrders = [
    {
      id: 'ord-1',
      orderNumber: 'ZL-2026/001',
      orderDate: '2026-08-01',
      plannedShipmentDate: '2026-08-15',
      productCode: 'PRD-A',
      productName: 'Silnik 15kW',
      accountingAccount: 'KK-100',
      orderedBy: 'Klient Alpha',
      notes: 'Brak uwag',
      plannedHours: 100,
      quantity: 10,
      quantityUnit: 'szt.',
      hoursPerUnit: 10,
      actualHours: 50,
      utilizationPercent: 50,
      status: 'OPEN',
      isActive: true,
      createdAt: '2026-08-01T00:00:00.000Z',
      completionDate: null,
    },
  ];

  beforeEach(() => {
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/orders') {
        return response(mockOrders);
      }
      if (url === '/api/orders/export-xlsx') {
        return response(
          {},
          200,
          { 'Content-Disposition': 'attachment; filename="baza_zlecen_2026-08-02_2115.xlsx"' },
        );
      }
      throw new Error(`Nieobsłużony URL: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    // Mock URL.createObjectURL and revokeObjectURL
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:http://localhost/mock-uuid'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders "Eksportuj do Excel" button for Admin role', async () => {
    render(
      <OrdersView
        token="test-token"
        user={{ id: '1', username: 'admin', role: 'admin', fullName: 'Administrator' }}
      />,
    );

    await screen.findByText('Baza Zleceń Produkcyjnych');

    const exportBtn = screen.getByRole('button', { name: /Eksportuj do Excel/i });
    expect(exportBtn).toBeDefined();
  });

  it('renders "Eksportuj do Excel" button for Leader role (read-only view without create button)', async () => {
    render(
      <OrdersView
        token="test-token"
        user={{ id: '2', username: 'leader', role: 'leader', fullName: 'Lider' }}
      />,
    );

    await screen.findByText('Baza Zleceń Produkcyjnych');

    const exportBtn = screen.getByRole('button', { name: /Eksportuj do Excel/i });
    expect(exportBtn).toBeDefined();

    // Verify "Dodaj zlecenie" button is NOT rendered for Leader
    expect(screen.queryByRole('button', { name: /Dodaj zlecenie/i })).toBeNull();
  });

  it('does NOT render "Eksportuj do Excel" button for Worker role', async () => {
    render(
      <OrdersView
        token="test-token"
        user={{ id: '3', username: 'worker', role: 'employee', fullName: 'Pracownik' }}
      />,
    );

    await screen.findByText('Baza Zleceń Produkcyjnych');

    expect(screen.queryByRole('button', { name: /Eksportuj do Excel/i })).toBeNull();
  });

  it('sends current searchQuery, statusFilter, sortField, sortOrder and triggers blob download', async () => {
    render(
      <OrdersView
        token="test-token"
        user={{ id: '1', username: 'admin', role: 'admin', fullName: 'Administrator' }}
      />,
    );

    await screen.findByText('Baza Zleceń Produkcyjnych');

    // Type search query
    const searchInput = screen.getByPlaceholderText(/Szukaj zlecenia po numerze/i);
    fireEvent.change(searchInput, { target: { value: 'Alpha' } });

    // Select status filter
    const statusSelect = screen.getByLabelText(/Filtr statusu/i);
    fireEvent.change(statusSelect, { target: { value: 'OPEN' } });

    // Click export button
    const exportBtn = screen.getByRole('button', { name: /Eksportuj do Excel/i });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/orders/export-xlsx',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token',
          }),
          body: JSON.stringify({
            searchQuery: 'Alpha',
            statusFilter: 'OPEN',
            sortField: null,
            sortOrder: 'asc',
          }),
        }),
      );
    });
  });

  it('handles export error gracefully and restores button state', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/orders') return response(mockOrders);
      if (url === '/api/orders/export-xlsx') {
        return response({ message: 'Błąd serwera podczas eksportu' }, 500);
      }
      throw new Error(`Unhandled: ${url}`);
    });

    const alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);

    render(
      <OrdersView
        token="test-token"
        user={{ id: '1', username: 'admin', role: 'admin', fullName: 'Administrator' }}
      />,
    );

    await screen.findByText('Baza Zleceń Produkcyjnych');

    const exportBtn = screen.getByRole('button', { name: /Eksportuj do Excel/i });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Błąd serwera podczas eksportu');
    });

    // Button should be active again
    expect(screen.getByRole('button', { name: /Eksportuj do Excel/i })).not.toBeDisabled();
  });
});
