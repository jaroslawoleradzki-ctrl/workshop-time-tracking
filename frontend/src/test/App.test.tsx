import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';
import { branding } from '../config/branding';

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
    expect(screen.getByText(branding.appName)).toBeInTheDocument();
    expect(screen.getByText(branding.appDescription)).toBeInTheDocument();

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
