import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../src/app';
import prisma from '../src/utils/prisma';
import { TEST_JWT_SECRET } from './setup-env';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const EMPLOYEE_ID = '20000000-0000-4000-8000-000000000001';
const ORDER_ID = '30000000-0000-4000-8000-000000000001';

const token = jwt.sign(
  {
    id: USER_ID,
    username: 'test-admin',
    role: 'admin',
    fullName: 'Test Administrator',
  },
  TEST_JWT_SECRET,
);

const authenticatedPost = (path: string, body: any) =>
  request(app)
    .post(path)
    .set('Authorization', `Bearer ${token}`)
    .send(body);

describe('Weekend report entry validations', () => {
  beforeEach(() => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: USER_ID,
      username: 'test-admin',
      passwordHash: 'unused',
      fullName: 'Test Administrator',
      role: 'admin',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    vi.spyOn(prisma.employee, 'findUnique').mockResolvedValue({
      id: EMPLOYEE_ID,
      fullName: 'Jan Kowalski',
      isActive: true,
      deletedAt: null,
    } as any);

    vi.spyOn(prisma.order, 'findUnique').mockResolvedValue({
      id: ORDER_ID,
      orderNumber: 'ZL-100',
      productName: 'Produkt',
      deletedAt: null,
    } as any);

    vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);
    vi.spyOn(prisma.companyCalendarDay, 'findUnique').mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects L4 entry on Saturday with 400', async () => {
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue({
      code: 'L4',
      name: 'Chorobowe L4',
      requiresOrder: false,
    } as any);

    // 2026-08-01 is Saturday
    const res = await authenticatedPost('/api/reports', {
      date: '2026-08-01',
      employeeId: EMPLOYEE_ID,
      hours: 8,
      workTimeTypeCode: 'L4',
    }).expect(400);

    expect(res.body.message).toMatch(/W dni wolne \(sobota, niedziela\) dozwolona jest wyłącznie rejestracja pracy nad zleceniem/i);
  });

  it('rejects UW (urlop) entry on Sunday with 400', async () => {
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue({
      code: 'UW',
      name: 'Urlop wypoczynkowy',
      requiresOrder: false,
    } as any);

    // 2026-08-02 is Sunday
    const res = await authenticatedPost('/api/reports', {
      date: '2026-08-02',
      employeeId: EMPLOYEE_ID,
      hours: 8,
      workTimeTypeCode: 'UW',
    }).expect(400);

    expect(res.body.message).toMatch(/W dni wolne \(sobota, niedziela\) dozwolona jest wyłącznie rejestracja pracy nad zleceniem/i);
  });

  it('rejects any entry on weekend when requiresOrder is false with 400', async () => {
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue({
      code: 'SZK',
      name: 'Szkolenie',
      requiresOrder: false,
    } as any);

    // 2026-08-01 is Saturday
    const res = await authenticatedPost('/api/reports', {
      date: '2026-08-01',
      employeeId: EMPLOYEE_ID,
      hours: 8,
      workTimeTypeCode: 'SZK',
    }).expect(400);

    expect(res.body.message).toMatch(/W dni wolne \(sobota, niedziela\) dozwolona jest wyłącznie rejestracja pracy nad zleceniem/i);
  });

  it('allows overtime work entry on Saturday when requiresOrder=true AND orderId is provided', async () => {
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue({
      code: 'NS',
      name: 'Godziny pracy',
      requiresOrder: true,
    } as any);

    vi.spyOn(prisma.workTimeReport, 'findMany').mockResolvedValue([]);
    vi.spyOn(prisma.workTimeReport, 'create').mockResolvedValue({
      id: 'r1',
      date: new Date('2026-08-01T00:00:00.000Z'),
      employeeId: EMPLOYEE_ID,
      orderId: ORDER_ID,
      hours: 8,
      workTimeTypeCode: 'NS',
      missingCard: false,
      createdByUserId: USER_ID,
    } as any);

    // Mock $transaction execution
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      const tx = {
        $executeRaw: vi.fn(),
        workTimeReport: {
          create: vi.fn().mockResolvedValue({
            id: 'r1',
            date: new Date('2026-08-01T00:00:00.000Z'),
            employeeId: EMPLOYEE_ID,
            orderId: ORDER_ID,
            hours: 8,
            workTimeTypeCode: 'G',
            missingCard: false,
            createdByUserId: USER_ID,
          }),
        },
      };
      return callback(tx);
    });

    // 2026-08-01 is Saturday
    const res = await authenticatedPost('/api/reports', {
      date: '2026-08-01',
      employeeId: EMPLOYEE_ID,
      orderId: ORDER_ID,
      hours: 8,
      workTimeTypeCode: 'NS',
    }).expect(201);

    expect(res.body.report).toBeDefined();
    expect(res.body.report.hours).toBe(8);
  });

  it('rejects G on a non-working day even when an order is provided', async () => {
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue({
      code: 'G', name: 'Godziny pracy', requiresOrder: true, isAbsence: false,
    } as any);
    const res = await authenticatedPost('/api/reports', {
      date: '2026-08-01', employeeId: EMPLOYEE_ID, orderId: ORDER_ID, hours: 8, workTimeTypeCode: 'G',
    }).expect(400);
    expect(res.body.code).toBe('NON_WORKING_DAY_ENTRY_NOT_ALLOWED');
  });

  it('rejects an absence type on a non-working day even when it requires an order', async () => {
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue({
      code: 'ABS', name: 'Nieobecność', requiresOrder: true, isAbsence: true,
    } as any);
    const res = await authenticatedPost('/api/reports', {
      date: '2026-08-01', employeeId: EMPLOYEE_ID, orderId: ORDER_ID, hours: 8, workTimeTypeCode: 'ABS',
    }).expect(400);
    expect(res.body.code).toBe('NON_WORKING_DAY_ENTRY_NOT_ALLOWED');
  });
});
