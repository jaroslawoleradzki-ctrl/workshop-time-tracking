import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CompanyCalendarView from '../components/CompanyCalendarView';

const day = { date: '2026-08-14', isWorkingDay: true, source: 'standard weekday', reason: null, overrideId: null };

describe('CompanyCalendarView', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('loads days and saves a selected day override', async () => {
    let request: any;
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') request = JSON.parse(String(init.body));
      return { ok: true, json: async () => init?.method === 'PUT' ? { ...day, ...request, overrideId: 'override-1' } : [day] };
    }));
    render(<CompanyCalendarView token="test-token" />);
    await screen.findByText('2026-08-14 (pt)');
    fireEvent.click(screen.getByText('2026-08-14 (pt)'));
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'free' } });
    fireEvent.change(screen.getByLabelText('Opis (opcjonalnie)'), { target: { value: 'Za święto' } });
    fireEvent.click(screen.getByRole('button', { name: /Zapisz wyjątek/i }));
    await waitFor(() => expect(request).toEqual({ isWorkingDay: false, reason: 'Za święto' }));
  });
});
