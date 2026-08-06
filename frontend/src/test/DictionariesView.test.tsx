import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DictionariesView from '../components/DictionariesView';

const response = (body: unknown) => ({ ok: true, json: async () => body });

describe('DictionariesView isAbsence', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
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
    fireEvent.click(screen.getByLabelText('Wymaga podania zlecenia produkcyjnego'));
    fireEvent.click(screen.getByLabelText('Nieobecność'));
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz pozycję' }));

    await waitFor(() => expect(requestBody).toEqual({
      code: 'NIEST',
      name: 'Niestandardowa nieobecność',
      requiresOrder: true,
      isAbsence: true,
    }));
  });
});
