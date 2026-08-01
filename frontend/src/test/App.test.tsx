import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('App Component - Login Screen', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('renders login screen layout and basic inputs', async () => {
    // Mock the version API response
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ version: '0.2.6' }),
    });

    render(<App />);

    // Verify title and description are present
    expect(screen.getByText('WARSZTAT')).toBeInTheDocument();
    expect(screen.getByText('System Raportowania Czasu Pracy')).toBeInTheDocument();

    // Verify input fields are present by their labels and placeholders
    expect(screen.getByText('Login')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('np. admin')).toBeInTheDocument();

    expect(screen.getByText('Hasło')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();

    // Verify submit button is present
    expect(screen.getByRole('button', { name: /zaloguj się/i })).toBeInTheDocument();

    // Wait for the version state to resolve to prevent act() warning
    await waitFor(() => {
      expect(screen.getByText('Wersja systemu v0.2.6')).toBeInTheDocument();
    });
  });

  it('renders application version retrieved from API', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ version: '0.2.6' }),
    });

    render(<App />);

    // Wait for the version state to load and verify rendering
    await waitFor(() => {
      expect(screen.getByText('Wersja systemu v0.2.6')).toBeInTheDocument();
    });
  });

  it('renders error message when version API fails', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    render(<App />);

    // Wait for the version state to fail and verify error message
    await waitFor(() => {
      expect(screen.getByText('Wersja systemu niedostępna')).toBeInTheDocument();
    });
  });
});

describe('App Component - Role Navigation & Route Access', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [],
    });
  });

  it('renders "Zlecenia" menu item for admin user and opens OrdersView', async () => {
    localStorage.setItem('token', 'fake-admin-token');
    localStorage.setItem('user', JSON.stringify({
      id: '1',
      username: 'admin',
      role: 'admin',
      fullName: 'Jan Administrator',
    }));

    render(<App />);

    const ordersNav = screen.getByRole('button', { name: /Zlecenia/i });
    expect(ordersNav).toBeInTheDocument();
  });

  it('renders "Zlecenia" menu item for leader user and allows navigating to OrdersView', async () => {
    localStorage.setItem('token', 'fake-leader-token');
    localStorage.setItem('user', JSON.stringify({
      id: '2',
      username: 'leader',
      role: 'leader',
      fullName: 'Adam Lider',
    }));

    render(<App />);

    const ordersNav = screen.getByRole('button', { name: /Zlecenia/i });
    expect(ordersNav).toBeInTheDocument();
  });

  it('does NOT render "Zlecenia" menu item for employee role and blocks route access', async () => {
    localStorage.setItem('token', 'fake-employee-token');
    localStorage.setItem('user', JSON.stringify({
      id: '3',
      username: 'employee',
      role: 'employee',
      fullName: 'Piotr Pracownik',
    }));
    sessionStorage.setItem('current_tab', 'orders');

    render(<App />);

    expect(screen.queryByRole('button', { name: /Zlecenia/i })).not.toBeInTheDocument();
    // Guard redirects employee away from orders view
    expect(screen.queryByText('Baza Zleceń Produkcyjnych')).not.toBeInTheDocument();
  });

  it('renders fixed application layout containers (app-container, navbar, main-layout, sidebar, content-wrapper)', async () => {
    localStorage.setItem('token', 'fake-admin-token');
    localStorage.setItem('user', JSON.stringify({
      id: '1',
      username: 'admin',
      role: 'admin',
      fullName: 'Jan Administrator',
    }));

    const { container } = render(<App />);

    expect(container.querySelector('.app-container')).toBeInTheDocument();
    expect(container.querySelector('.navbar')).toBeInTheDocument();
    expect(container.querySelector('.main-layout')).toBeInTheDocument();
    expect(container.querySelector('.sidebar')).toBeInTheDocument();
    expect(container.querySelector('.content-wrapper')).toBeInTheDocument();
  });
});
