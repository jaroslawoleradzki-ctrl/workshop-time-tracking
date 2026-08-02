import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import DashboardView from '../components/DashboardView';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('DashboardView Component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders stats cards and budget tables using the new API contract', async () => {
    const mockDashboardData = {
      openOrdersCount: 15,
      closedThisMonthCount: 8,
      hoursToday: 42.5,
      hoursMonth: 320.0,
      ordersExceeding: [
        {
          id: '1',
          orderNumber: 'ZL-EX-001',
          productName: 'Produkt Przekroczony',
          plannedHours: 10,
          actualHours: 12.5,
          percent: 125,
        },
      ],
      ordersApproaching: [
        {
          id: '2',
          orderNumber: 'ZL-AP-002',
          productName: 'Produkt Ostrzegawczy',
          plannedHours: 10,
          actualHours: 8.5,
          percent: 85,
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockDashboardData,
    });

    render(<DashboardView token="test-token" />);

    expect(screen.getByText(/Ładowanie statystyk/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Pulpit Menedżerski')).toBeInTheDocument();
    });

    // Check card values and labels
    expect(screen.getByText('Otwarte zlecenia')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();

    expect(screen.getByText('Zamknięte w tym miesiącu')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();

    expect(screen.getByText('42.5 h')).toBeInTheDocument();
    expect(screen.getByText('320.0 h')).toBeInTheDocument();

    // Check exceeding section
    expect(screen.getAllByText('ZL-EX-001')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Produkt Przekroczony')[0]).toBeInTheDocument();
    expect(screen.getAllByText('125%')[0]).toBeInTheDocument();

    // Check approaching section
    expect(screen.getAllByText('ZL-AP-002')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Produkt Ostrzegawczy')[0]).toBeInTheDocument();
    expect(screen.getAllByText('85%')[0]).toBeInTheDocument();
  });

  it('renders empty array state correctly without errors', async () => {
    const mockEmptyData = {
      openOrdersCount: 0,
      closedThisMonthCount: 0,
      hoursToday: 0,
      hoursMonth: 0,
      ordersExceeding: [],
      ordersApproaching: [],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockEmptyData,
    });

    render(<DashboardView token="test-token" />);

    await waitFor(() => {
      expect(screen.getByText('Pulpit Menedżerski')).toBeInTheDocument();
    });

    expect(screen.getByText('Brak zleceń przekraczających budżet. Wszystko w normie.')).toBeInTheDocument();
    expect(screen.getByText('Brak zleceń w strefie ostrzegawczej.')).toBeInTheDocument();
    expect(screen.getByText('Wszystkie zlecenia są w bezpiecznych zakresach budżetowych.')).toBeInTheDocument();
  });
});
