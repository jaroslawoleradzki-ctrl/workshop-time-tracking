import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import app from '../src/app';
import prisma from '../src/utils/prisma';
import { TEST_JWT_SECRET } from './setup-env';
import { validateAndAnalyzeRange } from '../src/services/absence-range';
import { getWorkingDayDecision } from '../src/services/company-calendar';

function client(overrides: Array<{ date: string; isWorkingDay: boolean; reason?: string | null }> = []) {
  return {
    companyCalendarDay: {
      findUnique: vi.fn(async ({ where }: any) => overrides.find((item) => item.date === where.date.toISOString().slice(0, 10)) || null),
    },
  } as any;
}

describe('company calendar', () => {
  afterEach(() => vi.restoreAllMocks());
  it('treats Monday as working and Saturday/Sunday as non-working by default', async () => {
    const db = client();
    expect((await getWorkingDayDecision('2026-08-10', db)).isWorkingDay).toBe(true);
    expect((await getWorkingDayDecision('2026-08-15', db)).isWorkingDay).toBe(false);
    expect((await getWorkingDayDecision('2026-08-16', db)).isWorkingDay).toBe(false);
  });

  it('gives a company override precedence over the base calendar', async () => {
    const db = client([{ date: '2026-08-14', isWorkingDay: false, reason: 'Dzień wolny za święto' }, { date: '2026-08-15', isWorkingDay: true }]);
    const freeFriday = await getWorkingDayDecision('2026-08-14', db);
    const workingSaturday = await getWorkingDayDecision('2026-08-15', db);
    expect(freeFriday).toMatchObject({ isWorkingDay: false, source: 'company override', reason: 'Dzień wolny za święto' });
    expect(workingSaturday).toMatchObject({ isWorkingDay: true, source: 'company override' });
  });

  it('requires authentication and restricts mutations to administrators', async () => {
    await request(app).put('/api/company-calendar/2026-08-14').send({ isWorkingDay: false }).expect(401);
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: '10000000-0000-4000-8000-000000000002', username: 'leader', passwordHash: '', fullName: 'Leader', role: 'leader', isActive: true,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const token = jwt.sign({ id: '10000000-0000-4000-8000-000000000002', username: 'leader', role: 'leader', fullName: 'Leader' }, TEST_JWT_SECRET);
    await request(app).put('/api/company-calendar/2026-08-14').set('Authorization', `Bearer ${token}`).send({ isWorkingDay: false }).expect(403);
  });

  it('allows an administrator to upsert and remove an override', async () => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: '10000000-0000-4000-8000-000000000001', username: 'admin', passwordHash: '', fullName: 'Admin', role: 'admin', isActive: true,
      createdAt: new Date(), updatedAt: new Date(),
    });
    vi.spyOn(prisma.companyCalendarDay, 'upsert').mockResolvedValue({
      id: 'override-1', date: new Date('2026-08-14T00:00:00.000Z'), isWorkingDay: false, reason: 'Za święto', createdAt: new Date(), updatedAt: new Date(),
    });
    vi.spyOn(prisma.companyCalendarDay, 'delete').mockResolvedValue({} as any);
    const token = jwt.sign({ id: '10000000-0000-4000-8000-000000000001', username: 'admin', role: 'admin', fullName: 'Admin' }, TEST_JWT_SECRET);
    await request(app).put('/api/company-calendar/2026-08-14').set('Authorization', `Bearer ${token}`).send({ isWorkingDay: false, reason: 'Za święto' }).expect(200);
    await request(app).delete('/api/company-calendar/2026-08-14').set('Authorization', `Bearer ${token}`).expect(204);
  });

  it('keeps calendar dates at UTC midnight without changing the business date', async () => {
    const db = client();
    const decision = await getWorkingDayDecision(new Date('2026-08-14T00:00:00.000Z'), db);
    expect(decision.date).toBe('2026-08-14');
  });

  it('skips weekends and a company-free Friday in an L4 range', async () => {
    const db = {
      ...client([{ date: '2026-08-14', isWorkingDay: false, reason: 'Za święto' }]),
      employee: { findUnique: vi.fn(async () => ({ id: 'employee', isActive: true, deletedAt: null })) },
      workTimeType: { findUnique: vi.fn(async () => ({ code: 'L4', isAbsence: true, requiresOrder: false })) },
      workTimeReport: { findMany: vi.fn(async () => []) },
    } as any;
    const result = await validateAndAnalyzeRange({
      employeeId: 'employee', workTimeTypeCode: 'L4', dateFrom: '2026-08-13', dateTo: '2026-08-17', hoursPerDay: 8,
    }, db);
    expect(result.workingDays).toBe(2);
    expect(result.weekends).toBe(3);
    expect(result.availableDates).toEqual(['2026-08-13', '2026-08-17']);
  });
});
