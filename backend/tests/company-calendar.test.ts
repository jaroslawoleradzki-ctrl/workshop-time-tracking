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
  it('treats regular weekday as working and Saturday/Sunday as non-working by default', async () => {
    const db = client();
    // 2026-08-10 is regular Monday (no holiday)
    const monday = await getWorkingDayDecision('2026-08-10', db);
    expect(monday).toMatchObject({ isWorkingDay: true, source: 'standard weekday' });

    // 2026-08-16 is Sunday (no holiday)
    const sunday = await getWorkingDayDecision('2026-08-16', db);
    expect(sunday).toMatchObject({ isWorkingDay: false, source: 'weekend' });

    // 2026-08-22 is Saturday (no holiday)
    const saturday = await getWorkingDayDecision('2026-08-22', db);
    expect(saturday).toMatchObject({ isWorkingDay: false, source: 'weekend' });
  });

  it('automatically identifies statutory Polish public holidays in 2026 as non-working days', async () => {
    const db = client();

    // 2026-01-01: Nowy Rok (Thursday)
    expect(await getWorkingDayDecision('2026-01-01', db)).toMatchObject({
      isWorkingDay: false,
      source: 'public holiday',
      reason: 'Nowy Rok',
    });

    // 2026-01-06: Święto Trzech Króli (Tuesday)
    expect(await getWorkingDayDecision('2026-01-06', db)).toMatchObject({
      isWorkingDay: false,
      source: 'public holiday',
      reason: 'Święto Trzech Króli',
    });

    // Wielkanoc 2026-04-05 (Sunday)
    expect(await getWorkingDayDecision('2026-04-05', db)).toMatchObject({
      isWorkingDay: false,
      source: 'public holiday',
      reason: 'Niedziela Wielkanocna',
    });

    // Poniedziałek Wielkanocny 2026-04-06 (Monday)
    expect(await getWorkingDayDecision('2026-04-06', db)).toMatchObject({
      isWorkingDay: false,
      source: 'public holiday',
      reason: 'Poniedziałek Wielkanocny',
    });

    // 2026-05-01: Święto Pracy (Friday)
    expect(await getWorkingDayDecision('2026-05-01', db)).toMatchObject({
      isWorkingDay: false,
      source: 'public holiday',
      reason: 'Święto Pracy',
    });

    // 2026-05-03: Święto Narodowe Trzeciego Maja (Sunday)
    expect(await getWorkingDayDecision('2026-05-03', db)).toMatchObject({
      isWorkingDay: false,
      source: 'public holiday',
      reason: 'Święto Narodowe Trzeciego Maja',
    });

    // Boże Ciało 2026-06-04 (Thursday)
    expect(await getWorkingDayDecision('2026-06-04', db)).toMatchObject({
      isWorkingDay: false,
      source: 'public holiday',
      reason: 'Boże Ciało',
    });

    // 2026-08-15: Wniebowzięcie NMP (Saturday)
    expect(await getWorkingDayDecision('2026-08-15', db)).toMatchObject({
      isWorkingDay: false,
      source: 'public holiday',
      reason: 'Wniebowzięcie Najświętszej Maryi Panny',
    });

    // 2026-11-01: Wszystkich Świętych (Sunday)
    expect(await getWorkingDayDecision('2026-11-01', db)).toMatchObject({
      isWorkingDay: false,
      source: 'public holiday',
      reason: 'Wszystkich Świętych',
    });

    // 2026-11-11: Narodowe Święto Niepodległości (Wednesday)
    expect(await getWorkingDayDecision('2026-11-11', db)).toMatchObject({
      isWorkingDay: false,
      source: 'public holiday',
      reason: 'Narodowe Święto Niepodległości',
    });

    // 2026-12-24: Wigilia Bożego Narodzenia (Thursday)
    expect(await getWorkingDayDecision('2026-12-24', db)).toMatchObject({
      isWorkingDay: false,
      source: 'public holiday',
      reason: 'Wigilia Bożego Narodzenia',
    });

    // 2026-12-25: Pierwszy dzień Bożego Narodzenia (Friday)
    expect(await getWorkingDayDecision('2026-12-25', db)).toMatchObject({
      isWorkingDay: false,
      source: 'public holiday',
      reason: 'Pierwszy dzień Bożego Narodzenia',
    });

    // 2026-12-26: Drugi dzień Bożego Narodzenia (Saturday)
    expect(await getWorkingDayDecision('2026-12-26', db)).toMatchObject({
      isWorkingDay: false,
      source: 'public holiday',
      reason: 'Drugi dzień Bożego Narodzenia',
    });
  });

  it('handles 24 December correctly across year boundary (pre-2025 regular weekday vs 2025+ public holiday with override precedence)', async () => {
    // 2024-12-24 (Tuesday): regular weekday in 2024
    const db2024 = client();
    const dec24_2024 = await getWorkingDayDecision('2024-12-24', db2024);
    expect(dec24_2024).toMatchObject({
      isWorkingDay: true,
      source: 'standard weekday',
    });

    // 2025-12-24 (Wednesday): statutory public holiday without override
    const db2025 = client();
    const dec24_2025 = await getWorkingDayDecision('2025-12-24', db2025);
    expect(dec24_2025).toMatchObject({
      isWorkingDay: false,
      source: 'public holiday',
      reason: 'Wigilia Bożego Narodzenia',
    });

    // 2025-12-24 with explicit company override to working day
    const db2025Override = client([
      { date: '2025-12-24', isWorkingDay: true, reason: 'Praca w Wigilię' },
    ]);
    const dec24_2025Override = await getWorkingDayDecision('2025-12-24', db2025Override);
    expect(dec24_2025Override).toMatchObject({
      isWorkingDay: true,
      source: 'company override',
      reason: 'Praca w Wigilię',
    });

    // 2026-12-24 with explicit company override to working day
    const db2026Override = client([
      { date: '2026-12-24', isWorkingDay: true, reason: 'Dyżur produkcyjny' },
    ]);
    const dec24_2026Override = await getWorkingDayDecision('2026-12-24', db2026Override);
    expect(dec24_2026Override).toMatchObject({
      isWorkingDay: true,
      source: 'company override',
      reason: 'Dyżur produkcyjny',
    });
  });

  it('gives a company override highest precedence over public holidays, weekdays and weekends', async () => {
    const db = client([
      // Holiday (2026-11-11) overridden as working
      { date: '2026-11-11', isWorkingDay: true, reason: 'Pilna produkcja' },
      // Regular weekday (2026-11-12) overridden as non-working
      { date: '2026-11-12', isWorkingDay: false, reason: 'Dzień wolny za święto' },
      // Regular weekend Saturday (2026-11-14) overridden as working
      { date: '2026-11-14', isWorkingDay: true, reason: 'Sobota pracująca' },
    ]);

    const workingHoliday = await getWorkingDayDecision('2026-11-11', db);
    expect(workingHoliday).toMatchObject({
      isWorkingDay: true,
      source: 'company override',
      reason: 'Pilna produkcja',
    });

    const freeWeekday = await getWorkingDayDecision('2026-11-12', db);
    expect(freeWeekday).toMatchObject({
      isWorkingDay: false,
      source: 'company override',
      reason: 'Dzień wolny za święto',
    });

    const workingWeekend = await getWorkingDayDecision('2026-11-14', db);
    expect(workingWeekend).toMatchObject({
      isWorkingDay: true,
      source: 'company override',
      reason: 'Sobota pracująca',
    });
  });

  it('returns public holidays and overrides via GET /api/company-calendar endpoint', async () => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: '10000000-0000-4000-8000-000000000001', username: 'admin', passwordHash: '', fullName: 'Admin', role: 'admin', isActive: true,
      createdAt: new Date(), updatedAt: new Date(),
    });
    vi.spyOn(prisma.companyCalendarDay, 'findMany').mockResolvedValue([
      {
        id: 'override-nov-12',
        date: new Date('2026-11-12T00:00:00.000Z'),
        isWorkingDay: false,
        reason: 'Dodatkowy dzień wolny',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const token = jwt.sign({ id: '10000000-0000-4000-8000-000000000001', username: 'admin', role: 'admin', fullName: 'Admin' }, TEST_JWT_SECRET);
    const res = await request(app)
      .get('/api/company-calendar?dateFrom=2026-11-10&dateTo=2026-11-13')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual([
      {
        date: '2026-11-10',
        isWorkingDay: true,
        source: 'standard weekday',
        reason: null,
        overrideId: null,
      },
      {
        date: '2026-11-11',
        isWorkingDay: false,
        source: 'public holiday',
        reason: 'Narodowe Święto Niepodległości',
        overrideId: null,
      },
      {
        date: '2026-11-12',
        isWorkingDay: false,
        source: 'company override',
        reason: 'Dodatkowy dzień wolny',
        overrideId: 'override-nov-12',
      },
      {
        date: '2026-11-13',
        isWorkingDay: true,
        source: 'standard weekday',
        reason: null,
        overrideId: null,
      },
    ]);
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

  it('provides single day decision via GET /api/company-calendar/day/:date endpoint', async () => {
    // 401 without auth
    await request(app).get('/api/company-calendar/day/2026-09-14').expect(401);

    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: '10000000-0000-4000-8000-000000000002', username: 'leader', passwordHash: '', fullName: 'Leader', role: 'leader', isActive: true,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const token = jwt.sign({ id: '10000000-0000-4000-8000-000000000002', username: 'leader', role: 'leader', fullName: 'Leader' }, TEST_JWT_SECRET);

    // 400 for invalid date
    await request(app)
      .get('/api/company-calendar/day/invalid-date')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    // 200 for standard weekday
    vi.spyOn(prisma.companyCalendarDay, 'findUnique').mockResolvedValue(null);
    const weekdayRes = await request(app)
      .get('/api/company-calendar/day/2026-09-14')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(weekdayRes.body).toEqual({
      date: '2026-09-14',
      isWorkingDay: true,
      source: 'standard weekday',
    });

    // 200 for standard weekend
    const weekendRes = await request(app)
      .get('/api/company-calendar/day/2026-09-13')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(weekendRes.body).toEqual({
      date: '2026-09-13',
      isWorkingDay: false,
      source: 'weekend',
    });

    // 200 for public holiday
    const holidayRes = await request(app)
      .get('/api/company-calendar/day/2026-11-11')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(holidayRes.body).toEqual({
      date: '2026-11-11',
      isWorkingDay: false,
      source: 'public holiday',
      reason: 'Narodowe Święto Niepodległości',
    });

    // 200 for company override
    vi.spyOn(prisma.companyCalendarDay, 'findUnique').mockResolvedValue({
      id: 'override-1',
      date: new Date('2026-11-14T00:00:00.000Z'),
      isWorkingDay: true,
      reason: 'Sobota pracująca',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const overrideRes = await request(app)
      .get('/api/company-calendar/day/2026-11-14')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(overrideRes.body).toEqual({
      date: '2026-11-14',
      isWorkingDay: true,
      source: 'company override',
      reason: 'Sobota pracująca',
    });
  });
});
