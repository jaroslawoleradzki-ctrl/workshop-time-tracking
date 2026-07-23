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
];

describe('OrdersView — wyszukiwarka zleceń', () => {
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
});
