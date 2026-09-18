import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DictionariesView from '../components/DictionariesView';

const response = (body: unknown) => ({ ok: true, json: async () => body });

describe('DictionariesView', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const mockTypes = [
    { code: 'G', name: 'Standardowe godziny pracy', requiresOrder: true, isAbsence: false, isSystem: true },
    { code: 'UW', name: 'Urlop wypoczynkowy', requiresOrder: false, isAbsence: true, isSystem: true },
    { code: 'WKU', name: 'Wojsko', requiresOrder: false, isAbsence: true, isSystem: true },
    { code: 'SZK', name: 'Szkolenie BHP', requiresOrder: false, isAbsence: false, isSystem: false },
    { code: 'PROD_SPEC', name: 'Specjalna produkcja', requiresOrder: true, isAbsence: false, isSystem: false },
  ];

  it('renders table headers and verifies exact header-to-column cell mapping', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(mockTypes)));

    render(<DictionariesView token="test-token" />);
    await screen.findByText('Słownik Rodzajów Czasu Pracy');

    const headers = screen.getAllByRole('columnheader');
    expect(headers.map(h => h.textContent?.trim())).toEqual([
      'Kod',
      'Pełna nazwa',
      'Wymaga zlecenia',
      'Nieobecność',
      'Status słownika',
      'Akcje',
    ]);

    const rows = screen.getAllByRole('row').slice(1); // skip header row
    expect(rows).toHaveLength(5);

    // Row 0: G
    const cellsG = within(rows[0]).getAllByRole('cell');
    expect(cellsG[0].textContent).toContain('G');
    expect(cellsG[1].textContent).toBe('Standardowe godziny pracy');
    expect(cellsG[2].textContent).toBe('Wymagane');
    expect(cellsG[3].textContent).toBe('Nie');
    expect(cellsG[4].textContent).toBe('Systemowy');

    // Row 1: UW
    const cellsUW = within(rows[1]).getAllByRole('cell');
    expect(cellsUW[0].textContent).toContain('UW');
    expect(cellsUW[1].textContent).toBe('Urlop wypoczynkowy');
    expect(cellsUW[2].textContent).toBe('Niewymagane');
    expect(cellsUW[3].textContent).toBe('Tak');
    expect(cellsUW[4].textContent).toBe('Systemowy');

    // Row 2: WKU
    const cellsWKU = within(rows[2]).getAllByRole('cell');
    expect(cellsWKU[0].textContent).toContain('WKU');
    expect(cellsWKU[1].textContent).toBe('Wojsko');
    expect(cellsWKU[2].textContent).toBe('Niewymagane');
    expect(cellsWKU[3].textContent).toBe('Tak');
    expect(cellsWKU[4].textContent).toBe('Systemowy');

    // Row 3: SZK (custom non-absence, no order)
    const cellsSZK = within(rows[3]).getAllByRole('cell');
    expect(cellsSZK[0].textContent).toContain('SZK');
    expect(cellsSZK[1].textContent).toBe('Szkolenie BHP');
    expect(cellsSZK[2].textContent).toBe('Niewymagane');
    expect(cellsSZK[3].textContent).toBe('Nie');
    expect(cellsSZK[4].textContent).toBe('Własny');

    // Row 4: PROD_SPEC (custom requires order, non-absence)
    const cellsSPEC = within(rows[4]).getAllByRole('cell');
    expect(cellsSPEC[0].textContent).toContain('PROD_SPEC');
    expect(cellsSPEC[1].textContent).toBe('Specjalna produkcja');
    expect(cellsSPEC[2].textContent).toBe('Wymagane');
    expect(cellsSPEC[3].textContent).toBe('Nie');
    expect(cellsSPEC[4].textContent).toBe('Własny');
  });

  it('creates a type with independent requiresOrder and isAbsence flags', async () => {
    let requestBody: any;
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method) return response([]);
      requestBody = JSON.parse(String(init.body));
      return response({ code: 'NIEST', ...requestBody, isSystem: false });
    }));

    render(<DictionariesView token="test-token" />);
    await screen.findByRole('button', { name: 'Dodaj nowy kod' });
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj nowy kod' }));
    fireEvent.change(screen.getByLabelText('Kod rodzaju czasu pracy'), { target: { value: 'niest' } });
    fireEvent.change(screen.getByLabelText('Pełna nazwa'), { target: { value: 'Niestandardowa nieobecność' } });
    fireEvent.click(screen.getByLabelText('Nieobecność pracownika'));
    fireEvent.click(screen.getByLabelText('Wymaga podania zlecenia produkcyjnego'));
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz pozycję' }));

    await waitFor(() => expect(requestBody).toEqual({
      code: 'NIEST',
      name: 'Niestandardowa nieobecność',
      requiresOrder: true,
      isAbsence: true,
    }));
  });

  it('locks requiresOrder for system types in edit modal and allows updating isAbsence', async () => {
    let putBody: any;
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method) return response(mockTypes);
      if (init.method === 'PUT') {
        putBody = JSON.parse(String(init.body));
        return response({ ...mockTypes[0], ...putBody });
      }
      return response({});
    }));

    render(<DictionariesView token="test-token" />);
    await screen.findByText('Standardowe godziny pracy');

    const editButtons = screen.getAllByRole('button', { name: /Edytuj/i });
    fireEvent.click(editButtons[0]); // Edit 'G' (isSystem: true)

    expect(screen.getByText('Dla kodów systemowych parametry wymagalności zlecenia są zablokowane.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Wymaga podania zlecenia produkcyjnego')).not.toBeInTheDocument();

    // Code input is disabled
    expect(screen.getByLabelText('Kod rodzaju czasu pracy')).toBeDisabled();

    // Change name and submit
    fireEvent.change(screen.getByLabelText('Pełna nazwa'), { target: { value: 'Standardowe godziny pracy (zmodyfikowane)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz pozycję' }));

    await waitFor(() => expect(putBody).toEqual({
      code: 'G',
      name: 'Standardowe godziny pracy (zmodyfikowane)',
      requiresOrder: true,
      isAbsence: false,
    }));
  });
});
