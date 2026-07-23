import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EmployeesView from '../components/EmployeesView';

type JsonResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

const response = (body: unknown): JsonResponse => ({
  ok: true,
  json: async () => body,
});

const mockEmployees = [
  {
    id: 'emp-3',
    fullName: 'Kowalski Adam',
    firstName: 'Adam',
    lastName: 'Kowalski',
    employeeNumber: '103',
    isActive: true,
    createdAt: '2026-07-01T00:00:00.000Z',
  },
  {
    id: 'emp-1',
    fullName: 'Nowak Anna',
    firstName: 'Anna',
    lastName: 'Nowak',
    employeeNumber: '101',
    isActive: true,
    createdAt: '2026-07-01T00:00:00.000Z',
  },
  {
    id: 'emp-2',
    fullName: 'Kowalski Jan',
    firstName: 'Jan',
    lastName: 'Kowalski',
    employeeNumber: '102',
    isActive: true,
    createdAt: '2026-07-01T00:00:00.000Z',
  },
  {
    id: 'emp-4',
    fullName: 'Wiśniewski Piotr',
    firstName: 'Piotr',
    lastName: 'Wiśniewski',
    employeeNumber: '104',
    isActive: true,
    createdAt: '2026-07-01T00:00:00.000Z',
  },
  {
    id: 'emp-5',
    fullName: 'Tomasz Zieliński',
    firstName: null,
    lastName: null,
    employeeNumber: '105',
    isActive: true,
    createdAt: '2026-07-01T00:00:00.000Z',
  },
];

describe('EmployeesView — sortowanie i numeracja', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    vi.stubGlobal('fetch', vi.fn(async () => response(mockEmployees)));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('sortuje pracowników alfabetycznie według nazwiska, a potem imienia, oraz poprawnie ich numeruje', async () => {
    render(<EmployeesView token="test-token" />);

    // Wait for the rows to render
    await screen.findByText('101');

    // Retrieve all table rows in the tbody
    const rows = document.querySelectorAll('tbody tr');
    expect(rows.length).toBe(5);

    // Expected order:
    // 1. Kowalski Adam (Lp. 1)
    // 2. Kowalski Jan (Lp. 2)
    // 3. Nowak Anna (Lp. 3)
    // 4. Wiśniewski Piotr (Lp. 4)
    // 5. Zieliński Tomasz (Lp. 5)

    const expectedData = [
      { lp: '1', firstName: 'Adam', lastName: 'Kowalski', empNum: '103' },
      { lp: '2', firstName: 'Jan', lastName: 'Kowalski', empNum: '102' },
      { lp: '3', firstName: 'Anna', lastName: 'Nowak', empNum: '101' },
      { lp: '4', firstName: 'Piotr', lastName: 'Wiśniewski', empNum: '104' },
      { lp: '5', firstName: 'Tomasz', lastName: 'Zieliński', empNum: '105' },
    ];

    expectedData.forEach((expected, index) => {
      const cells = rows[index].querySelectorAll('td');

      // Lp.
      expect(cells[0].textContent).toBe(expected.lp);
      // Status
      expect(cells[1].textContent).toContain('Aktywny');
      // ID
      expect(cells[2].textContent).toBe(expected.empNum);
      // Imię
      expect(cells[3].textContent).toBe(expected.firstName);
      // Nazwisko
      expect(cells[4].textContent).toBe(expected.lastName);
    });
  });
});
