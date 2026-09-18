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

const authenticatedGet = (path: string) =>
  request(app)
    .get(path)
    .set('Authorization', `Bearer ${token}`);

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
    vi.spyOn(prisma.workTimeReport, 'findMany').mockResolvedValue([]);
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
      workShift: 'FIRST',
    }).expect(201);

    expect(res.body.report).toBeDefined();
    expect(res.body.report.hours).toBe(8);
  });

  it('rejects G on a non-working day even when an order is provided', async () => {
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue({
      code: 'G', name: 'Godziny pracy', requiresOrder: true, isAbsence: false,
    } as any);
    const res = await authenticatedPost('/api/reports', {
      date: '2026-08-01', employeeId: EMPLOYEE_ID, orderId: ORDER_ID, hours: 8, workTimeTypeCode: 'G', workShift: 'FIRST',
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

  it('allows NS entry on Sunday with valid order and confirms persistence via GET by-employee-date', async () => {
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue({
      code: 'NS',
      name: 'Nadgodziny sobota/niedziela',
      requiresOrder: true,
      isAbsence: false,
    } as any);

    let savedDbRecord: any = null;

    vi.spyOn(prisma.workTimeReport, 'findMany').mockImplementation(async (args: any) => {
      // If querying by employeeId and date after save, return saved record
      if (args?.where?.employeeId === EMPLOYEE_ID && savedDbRecord) {
        return [savedDbRecord] as any;
      }
      return [];
    });

    vi.spyOn(prisma.workTimeReport, 'create').mockImplementation(async (args: any) => {
      savedDbRecord = {
        id: 'r-ns-sunday-1',
        date: new Date('2026-09-06T00:00:00.000Z'),
        employeeId: EMPLOYEE_ID,
        orderId: ORDER_ID,
        hours: 8,
        workTimeTypeCode: 'NS',
        workShift: 'FIRST',
        missingCard: false,
        createdByUserId: USER_ID,
        createdAt: new Date('2026-09-06T10:00:00.000Z'),
        order: {
          orderNumber: 'ZL-100',
          productCode: 'P-1',
          productName: 'Produkt',
          accountingAccount: 'K-1',
        },
        workTimeType: {
          code: 'NS',
          name: 'Nadgodziny sobota/niedziela',
          requiresOrder: true,
          isAbsence: false,
        },
      };
      return savedDbRecord;
    });

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      const tx = {
        $executeRaw: vi.fn(),
        workTimeReport: {
          create: vi.fn().mockImplementation(async (args: any) => {
            savedDbRecord = {
              id: 'r-ns-sunday-1',
              date: new Date('2026-09-06T00:00:00.000Z'),
              employeeId: EMPLOYEE_ID,
              orderId: ORDER_ID,
              hours: 8,
              workTimeTypeCode: 'NS',
              workShift: 'FIRST',
              missingCard: false,
              createdByUserId: USER_ID,
              createdAt: new Date('2026-09-06T10:00:00.000Z'),
              order: {
                orderNumber: 'ZL-100',
                productCode: 'P-1',
                productName: 'Produkt',
                accountingAccount: 'K-1',
              },
              workTimeType: {
                code: 'NS',
                name: 'Nadgodziny sobota/niedziela',
                requiresOrder: true,
                isAbsence: false,
              },
            };
            return savedDbRecord;
          }),
        },
      };
      return callback(tx);
    });

    // 1. Perform actual POST request to create NS on Sunday (2026-09-06)
    const postRes = await authenticatedPost('/api/reports', {
      date: '2026-09-06',
      employeeId: EMPLOYEE_ID,
      orderId: ORDER_ID,
      hours: 8,
      workTimeTypeCode: 'NS',
      workShift: 'FIRST',
    }).expect(201);

    expect(postRes.body.report).toBeDefined();
    expect(postRes.body.report.hours).toBe(8);
    expect(postRes.body.report.workTimeTypeCode).toBe('NS');
    expect(postRes.body.report.workShift).toBe('FIRST');
    expect(postRes.body.report.orderId).toBe(ORDER_ID);

    // 2. Fetch reports via GET /api/reports/by-employee-date and verify persisted state
    const getRes = await authenticatedGet(`/api/reports/by-employee-date?employeeId=${EMPLOYEE_ID}&date=2026-09-06`).expect(200);
    expect(Array.isArray(getRes.body)).toBe(true);
    expect(getRes.body.length).toBe(1);
    expect(getRes.body[0]).toMatchObject({
      id: 'r-ns-sunday-1',
      date: '2026-09-06',
      employeeId: EMPLOYEE_ID,
      orderId: ORDER_ID,
      hours: 8,
      workTimeTypeCode: 'NS',
      workShift: 'FIRST',
      missingCard: false,
      order: {
        orderNumber: 'ZL-100',
      },
      workTimeType: {
        code: 'NS',
        name: 'Nadgodziny sobota/niedziela',
      },
    });
  });

  it('rejects NS entry on Sunday when orderId is missing with 400 NON_WORKING_DAY_ENTRY_NOT_ALLOWED', async () => {
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue({
      code: 'NS',
      name: 'Nadgodziny sobota/niedziela',
      requiresOrder: true,
      isAbsence: false,
    } as any);

    // 2026-09-06 is Sunday, orderId is omitted
    const res = await authenticatedPost('/api/reports', {
      date: '2026-09-06',
      employeeId: EMPLOYEE_ID,
      hours: 8,
      workTimeTypeCode: 'NS',
      workShift: 'FIRST',
    }).expect(400);

    expect(res.body.code).toBe('NON_WORKING_DAY_ENTRY_NOT_ALLOWED');
    expect(res.body.message).toMatch(/W dni wolne \(sobota, niedziela\) dozwolona jest wyłącznie rejestracja pracy nad zleceniem/i);
  });

  it('rejects G entry on Sunday even when orderId is provided with 400 NON_WORKING_DAY_ENTRY_NOT_ALLOWED', async () => {
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue({
      code: 'G',
      name: 'Godziny standardowe',
      requiresOrder: false,
      isAbsence: false,
    } as any);

    // 2026-09-06 is Sunday, G is standard weekday work type
    const res = await authenticatedPost('/api/reports', {
      date: '2026-09-06',
      employeeId: EMPLOYEE_ID,
      orderId: ORDER_ID,
      hours: 8,
      workTimeTypeCode: 'G',
      workShift: 'FIRST',
    }).expect(400);

    expect(res.body.code).toBe('NON_WORKING_DAY_ENTRY_NOT_ALLOWED');
    expect(res.body.message).toMatch(/W dni wolne \(sobota, niedziela\) dozwolona jest wyłącznie rejestracja pracy nad zleceniem/i);
  });
});

describe('Work shift tracking validations and endpoints (v0.5.9)', () => {
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
    vi.spyOn(prisma.workTimeReport, 'findMany').mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows creating work entry (G) with FIRST shift', async () => {
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue({
      code: 'G',
      name: 'Godziny standardowe',
      requiresOrder: false,
      isAbsence: false,
    } as any);

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      const tx = {
        $executeRaw: vi.fn(),
        workTimeReport: {
          create: vi.fn().mockResolvedValue({
            id: 'r-shift-1',
            date: new Date('2026-08-03T00:00:00.000Z'), // Monday
            employeeId: EMPLOYEE_ID,
            orderId: null,
            hours: 8,
            workTimeTypeCode: 'G',
            workShift: 'FIRST',
            missingCard: false,
            createdByUserId: USER_ID,
          }),
        },
      };
      return callback(tx);
    });

    const res = await authenticatedPost('/api/reports', {
      date: '2026-08-03',
      employeeId: EMPLOYEE_ID,
      hours: 8,
      workTimeTypeCode: 'G',
      workShift: 'FIRST',
    }).expect(201);

    expect(res.body.report).toBeDefined();
    expect(res.body.report.workShift).toBe('FIRST');
  });

  it('allows creating work entry (G) with SECOND shift', async () => {
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue({
      code: 'G',
      name: 'Godziny standardowe',
      requiresOrder: false,
      isAbsence: false,
    } as any);

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      const tx = {
        $executeRaw: vi.fn(),
        workTimeReport: {
          create: vi.fn().mockResolvedValue({
            id: 'r-shift-2',
            date: new Date('2026-08-03T00:00:00.000Z'),
            employeeId: EMPLOYEE_ID,
            orderId: null,
            hours: 8,
            workTimeTypeCode: 'G',
            workShift: 'SECOND',
            missingCard: false,
            createdByUserId: USER_ID,
          }),
        },
      };
      return callback(tx);
    });

    const res = await authenticatedPost('/api/reports', {
      date: '2026-08-03',
      employeeId: EMPLOYEE_ID,
      hours: 8,
      workTimeTypeCode: 'G',
      workShift: 'SECOND',
    }).expect(201);

    expect(res.body.report).toBeDefined();
    expect(res.body.report.workShift).toBe('SECOND');
  });

  it('creates worked-time entry with THIRD shift on a working day', async () => {
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue({
      code: 'G',
      name: 'Godziny standardowe',
      requiresOrder: false,
      isAbsence: false,
    } as any);

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      const tx = {
        $executeRaw: vi.fn(),
        workTimeReport: {
          create: vi.fn().mockResolvedValue({
            id: 'r-shift-3',
            date: new Date('2026-08-03T00:00:00.000Z'),
            employeeId: EMPLOYEE_ID,
            orderId: null,
            hours: 8,
            workTimeTypeCode: 'G',
            workShift: 'THIRD',
            missingCard: false,
            createdByUserId: USER_ID,
          }),
        },
      };
      return callback(tx);
    });

    const res = await authenticatedPost('/api/reports', {
      date: '2026-08-03',
      employeeId: EMPLOYEE_ID,
      hours: 8,
      workTimeTypeCode: 'G',
      workShift: 'THIRD',
    }).expect(201);

    expect(res.body.report).toBeDefined();
    expect(res.body.report.workShift).toBe('THIRD');
  });

  it('rejects worked-time entry without shift with 400 WORK_SHIFT_REQUIRED', async () => {
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue({
      code: 'G',
      name: 'Godziny standardowe',
      requiresOrder: false,
      isAbsence: false,
    } as any);

    const res = await authenticatedPost('/api/reports', {
      date: '2026-08-03',
      employeeId: EMPLOYEE_ID,
      hours: 8,
      workTimeTypeCode: 'G',
    }).expect(400);

    expect(res.body.code).toBe('WORK_SHIFT_REQUIRED');
    expect(res.body.message).toMatch(/Wybór zmiany/i);
  });

  it('rejects worked-time entry with invalid shift with 400 WORK_SHIFT_REQUIRED', async () => {
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue({
      code: 'G',
      name: 'Godziny standardowe',
      requiresOrder: false,
      isAbsence: false,
    } as any);

    const res = await authenticatedPost('/api/reports', {
      date: '2026-08-03',
      employeeId: EMPLOYEE_ID,
      hours: 8,
      workTimeTypeCode: 'G',
      workShift: 'FOURTH',
    }).expect(400);

    expect(res.body.code).toBe('WORK_SHIFT_REQUIRED');
  });

  it('allows absence entry with NULL shift on a working day', async () => {
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue({
      code: 'UW',
      name: 'Urlop wypoczynkowy',
      requiresOrder: false,
      isAbsence: true,
    } as any);

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      const tx = {
        $executeRaw: vi.fn(),
        workTimeReport: {
          create: vi.fn().mockResolvedValue({
            id: 'r-uw-1',
            date: new Date('2026-08-03T00:00:00.000Z'),
            employeeId: EMPLOYEE_ID,
            orderId: null,
            hours: 8,
            workTimeTypeCode: 'UW',
            workShift: null,
            missingCard: false,
            createdByUserId: USER_ID,
          }),
        },
      };
      return callback(tx);
    });

    const res = await authenticatedPost('/api/reports', {
      date: '2026-08-03',
      employeeId: EMPLOYEE_ID,
      hours: 8,
      workTimeTypeCode: 'UW',
      workShift: null,
    }).expect(201);

    expect(res.body.report.workShift).toBeNull();
  });

  it('rejects absence entry when FIRST or SECOND shift is provided with 400 SHIFT_NOT_ALLOWED_FOR_ABSENCE', async () => {
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue({
      code: 'UW',
      name: 'Urlop wypoczynkowy',
      requiresOrder: false,
      isAbsence: true,
    } as any);

    const res = await authenticatedPost('/api/reports', {
      date: '2026-08-03',
      employeeId: EMPLOYEE_ID,
      hours: 8,
      workTimeTypeCode: 'UW',
      workShift: 'FIRST',
    }).expect(400);

    expect(res.body.code).toBe('SHIFT_NOT_ALLOWED_FOR_ABSENCE');
    expect(res.body.message).toMatch(/Wybór zmiany jest niedozwolony dla nieobecności/i);
  });

  it('allows editing report and preserves FIRST and SECOND shift', async () => {
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue({
      code: 'G',
      name: 'Godziny standardowe',
      requiresOrder: false,
      isAbsence: false,
    } as any);

    vi.spyOn(prisma.workTimeReport, 'findUnique').mockResolvedValue({
      id: 'r-edit-1',
      date: new Date('2026-08-03T00:00:00.000Z'),
      employeeId: EMPLOYEE_ID,
      orderId: null,
      hours: 8,
      workTimeTypeCode: 'G',
      workShift: 'FIRST',
      deletedAt: null,
    } as any);

    vi.spyOn(prisma.workTimeReport, 'update').mockResolvedValue({
      id: 'r-edit-1',
      date: new Date('2026-08-03T00:00:00.000Z'),
      employeeId: EMPLOYEE_ID,
      orderId: null,
      hours: 6,
      workTimeTypeCode: 'G',
      workShift: 'SECOND',
      missingCard: false,
      modifiedByUserId: USER_ID,
    } as any);

    const res = await request(app)
      .put('/api/reports/r-edit-1')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: '2026-08-03',
        employeeId: EMPLOYEE_ID,
        hours: 6,
        workTimeTypeCode: 'G',
        workShift: 'SECOND',
      })
      .expect(200);

    expect(res.body.report.workShift).toBe('SECOND');
    expect(res.body.report.hours).toBe(6);
  });

  it('allows editing report to THIRD shift', async () => {
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue({
      code: 'G',
      name: 'Godziny standardowe',
      requiresOrder: false,
      isAbsence: false,
    } as any);

    vi.spyOn(prisma.workTimeReport, 'findUnique').mockResolvedValue({
      id: 'r-edit-3',
      date: new Date('2026-08-03T00:00:00.000Z'),
      employeeId: EMPLOYEE_ID,
      orderId: null,
      hours: 8,
      workTimeTypeCode: 'G',
      workShift: 'FIRST',
      deletedAt: null,
    } as any);

    vi.spyOn(prisma.workTimeReport, 'update').mockResolvedValue({
      id: 'r-edit-3',
      date: new Date('2026-08-03T00:00:00.000Z'),
      employeeId: EMPLOYEE_ID,
      orderId: null,
      hours: 8,
      workTimeTypeCode: 'G',
      workShift: 'THIRD',
      missingCard: false,
      modifiedByUserId: USER_ID,
    } as any);

    const res = await request(app)
      .put('/api/reports/r-edit-3')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: '2026-08-03',
        employeeId: EMPLOYEE_ID,
        hours: 8,
        workTimeTypeCode: 'G',
        workShift: 'THIRD',
      })
      .expect(200);

    expect(res.body.report.workShift).toBe('THIRD');
  });

  it('clears shift when updating from THIRD shift to an absence type with workShift = null', async () => {
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue({
      code: 'UW',
      name: 'Urlop wypoczynkowy',
      requiresOrder: false,
      isAbsence: true,
    } as any);

    vi.spyOn(prisma.workTimeReport, 'findUnique').mockResolvedValue({
      id: 'r-edit-abs',
      date: new Date('2026-08-03T00:00:00.000Z'),
      employeeId: EMPLOYEE_ID,
      orderId: null,
      hours: 8,
      workTimeTypeCode: 'G',
      workShift: 'THIRD',
      deletedAt: null,
    } as any);

    vi.spyOn(prisma.workTimeReport, 'update').mockResolvedValue({
      id: 'r-edit-abs',
      date: new Date('2026-08-03T00:00:00.000Z'),
      employeeId: EMPLOYEE_ID,
      orderId: null,
      hours: 8,
      workTimeTypeCode: 'UW',
      workShift: null,
      missingCard: false,
      modifiedByUserId: USER_ID,
    } as any);

    const res = await request(app)
      .put('/api/reports/r-edit-abs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: '2026-08-03',
        employeeId: EMPLOYEE_ID,
        hours: 8,
        workTimeTypeCode: 'UW',
        workShift: null,
      })
      .expect(200);

    expect(res.body.report.workShift).toBeNull();
    expect(res.body.report.workTimeTypeCode).toBe('UW');
  });

  it('allows reading historical attendance record with workShift = null via GET /by-employee-date', async () => {
    vi.spyOn(prisma.workTimeReport, 'findMany').mockResolvedValue([
      {
        id: 'r-hist-1',
        date: new Date('2026-08-03T00:00:00.000Z'),
        employeeId: EMPLOYEE_ID,
        orderId: null,
        hours: 8,
        workTimeTypeCode: 'G',
        workShift: null,
        missingCard: false,
        createdByUserId: USER_ID,
        createdAt: new Date('2026-08-03T10:00:00.000Z'),
        order: null,
        workTimeType: {
          code: 'G',
          name: 'Godziny standardowe',
          requiresOrder: false,
          isAbsence: false,
        },
      },
    ] as any);

    const res = await authenticatedGet(`/api/reports/by-employee-date?employeeId=${EMPLOYEE_ID}&date=2026-08-03`).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].workShift).toBeNull();
    expect(res.body[0].workTimeTypeCode).toBe('G');
  });

  it('requires selecting a shift when modifying a historical record without shift', async () => {
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue({
      code: 'G',
      name: 'Godziny standardowe',
      requiresOrder: false,
      isAbsence: false,
    } as any);

    vi.spyOn(prisma.workTimeReport, 'findUnique').mockResolvedValue({
      id: 'r-hist-1',
      date: new Date('2026-08-03T00:00:00.000Z'),
      employeeId: EMPLOYEE_ID,
      orderId: null,
      hours: 8,
      workTimeTypeCode: 'G',
      workShift: null,
      deletedAt: null,
    } as any);

    const res = await request(app)
      .put('/api/reports/r-hist-1')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: '2026-08-03',
        employeeId: EMPLOYEE_ID,
        hours: 8,
        workTimeTypeCode: 'G',
        // workShift omitted
      })
      .expect(400);

    expect(res.body.code).toBe('WORK_SHIFT_REQUIRED');
  });
});
