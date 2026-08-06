import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../src/app';
import prisma from '../src/utils/prisma';
import { TEST_JWT_SECRET } from './setup-env';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const EMPLOYEE_ID = '20000000-0000-4000-8000-000000000001';

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

describe('Absence Range API (/api/reports/absence-range)', () => {
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

    vi.spyOn(prisma.workTimeType, 'findUnique').mockImplementation(async ({ where }: any) => {
      if (where.code === 'L4') {
        return { code: 'L4', name: 'Chorobowe L4', requiresOrder: false, isAbsence: true } as any;
      }
      if (where.code === 'UW') {
        return { code: 'UW', name: 'Urlop wypoczynkowy', requiresOrder: false, isAbsence: true } as any;
      }
      if (where.code === 'ORDABS') {
        return { code: 'ORDABS', name: 'Nieobecność ze zleceniem', requiresOrder: true, isAbsence: true } as any;
      }
      if (where.code === 'G') {
        return { code: 'G', name: 'Godziny standardowe', requiresOrder: true, isAbsence: false } as any;
      }
      return null;
    });

    vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('PREVIEW: POST /api/reports/absence-range/preview', () => {
    it('calculates preview for valid date range without conflicts (Monday 2026-08-03 to Friday 2026-08-07)', async () => {
      vi.spyOn(prisma.workTimeReport, 'findMany').mockResolvedValue([]);

      const res = await authenticatedPost('/api/reports/absence-range/preview', {
        employeeId: EMPLOYEE_ID,
        workTimeTypeCode: 'L4',
        dateFrom: '2026-08-03',
        dateTo: '2026-08-07',
        hoursPerDay: 8,
      }).expect(200);

      expect(res.body).toEqual({
        calendarDays: 5,
        workingDays: 5,
        weekends: 0,
        availableDays: 5,
        skipped: 0,
        totalHours: 40,
        conflicts: [],
      });
    });

    it('correctly skips Saturday and Sunday in 12-day range (2026-08-03 to 2026-08-14)', async () => {
      vi.spyOn(prisma.workTimeReport, 'findMany').mockResolvedValue([]);

      const res = await authenticatedPost('/api/reports/absence-range/preview', {
        employeeId: EMPLOYEE_ID,
        workTimeTypeCode: 'UW',
        dateFrom: '2026-08-03',
        dateTo: '2026-08-14',
        hoursPerDay: 8,
      }).expect(200);

      expect(res.body).toEqual({
        calendarDays: 12,
        workingDays: 10,
        weekends: 2,
        availableDays: 10,
        skipped: 0,
        totalHours: 80,
        conflicts: [],
      });
    });

    it('detects single conflict and multiple conflicts', async () => {
      // 2026-08-07 (Fri) and 2026-08-10 (Mon) already have active reports
      vi.spyOn(prisma.workTimeReport, 'findMany').mockResolvedValue([
        { date: new Date('2026-08-07T00:00:00.000Z') },
        { date: new Date('2026-08-10T00:00:00.000Z') },
      ] as any);

      const res = await authenticatedPost('/api/reports/absence-range/preview', {
        employeeId: EMPLOYEE_ID,
        workTimeTypeCode: 'L4',
        dateFrom: '2026-08-03',
        dateTo: '2026-08-14',
        hoursPerDay: 8,
      }).expect(200);

      expect(res.body.calendarDays).toBe(12);
      expect(res.body.workingDays).toBe(10);
      expect(res.body.weekends).toBe(2);
      expect(res.body.availableDays).toBe(8);
      expect(res.body.skipped).toBe(2);
      expect(res.body.totalHours).toBe(64);
      expect(res.body.conflicts).toEqual([
        { date: '2026-08-07', reason: 'EXISTING_ENTRY' },
        { date: '2026-08-10', reason: 'EXISTING_ENTRY' },
      ]);
    });

    it('does NOT modify database when preview endpoint is called', async () => {
      const createSpy = vi.spyOn(prisma.workTimeReport, 'createMany');
      vi.spyOn(prisma.workTimeReport, 'findMany').mockResolvedValue([]);

      await authenticatedPost('/api/reports/absence-range/preview', {
        employeeId: EMPLOYEE_ID,
        workTimeTypeCode: 'L4',
        dateFrom: '2026-08-03',
        dateTo: '2026-08-07',
        hoursPerDay: 8,
      }).expect(200);

      expect(createSpy).not.toHaveBeenCalled();
    });
  });

  describe('VALIDATIONS', () => {
    it('returns 400 when employee does not exist', async () => {
      vi.spyOn(prisma.employee, 'findUnique').mockResolvedValue(null);

      const res = await authenticatedPost('/api/reports/absence-range/preview', {
        employeeId: EMPLOYEE_ID,
        workTimeTypeCode: 'L4',
        dateFrom: '2026-08-03',
        dateTo: '2026-08-07',
        hoursPerDay: 8,
      }).expect(400);

      expect(res.body.code).toBe('EMPLOYEE_NOT_AVAILABLE');
    });

    it('returns 400 when employee is inactive', async () => {
      vi.spyOn(prisma.employee, 'findUnique').mockResolvedValue({
        id: EMPLOYEE_ID,
        fullName: 'Jan Kowalski',
        isActive: false,
        deletedAt: null,
      } as any);

      const res = await authenticatedPost('/api/reports/absence-range/preview', {
        employeeId: EMPLOYEE_ID,
        workTimeTypeCode: 'L4',
        dateFrom: '2026-08-03',
        dateTo: '2026-08-07',
        hoursPerDay: 8,
      }).expect(400);

      expect(res.body.code).toBe('EMPLOYEE_NOT_AVAILABLE');
    });

    it('returns 400 when workTimeTypeCode does not exist', async () => {
      const res = await authenticatedPost('/api/reports/absence-range/preview', {
        employeeId: EMPLOYEE_ID,
        workTimeTypeCode: 'NONEXISTENT',
        dateFrom: '2026-08-03',
        dateTo: '2026-08-07',
        hoursPerDay: 8,
      }).expect(400);

      expect(res.body.code).toBe('INVALID_WORK_TIME_TYPE');
    });

    it('returns 400 when workTimeTypeCode requires an order (requiresOrder = true)', async () => {
      const res = await authenticatedPost('/api/reports/absence-range/preview', {
        employeeId: EMPLOYEE_ID,
        workTimeTypeCode: 'ORDABS',
        dateFrom: '2026-08-03',
        dateTo: '2026-08-07',
        hoursPerDay: 8,
      }).expect(400);

      expect(res.body.code).toBe('ORDER_REQUIRED_NOT_ALLOWED');
    });

    it('returns 400 when the type is not classified as an absence', async () => {
      const res = await authenticatedPost('/api/reports/absence-range/preview', {
        employeeId: EMPLOYEE_ID,
        workTimeTypeCode: 'G',
        dateFrom: '2026-08-03',
        dateTo: '2026-08-07',
        hoursPerDay: 8,
      }).expect(400);

      expect(res.body.code).toBe('WORK_TIME_TYPE_IS_NOT_ABSENCE');
    });

    it('returns 400 when dateFrom > dateTo', async () => {
      const res = await authenticatedPost('/api/reports/absence-range/preview', {
        employeeId: EMPLOYEE_ID,
        workTimeTypeCode: 'L4',
        dateFrom: '2026-08-10',
        dateTo: '2026-08-03',
        hoursPerDay: 8,
      }).expect(400);

      expect(res.body.code).toBe('INVALID_DATE_RANGE');
    });

    it('returns 400 when date format is invalid', async () => {
      await authenticatedPost('/api/reports/absence-range/preview', {
        employeeId: EMPLOYEE_ID,
        workTimeTypeCode: 'L4',
        dateFrom: '03.08.2026',
        dateTo: '2026-08-07',
        hoursPerDay: 8,
      }).expect(400);
    });

    it('allows 365 calendar days range and rejects 366 days range', async () => {
      vi.spyOn(prisma.workTimeReport, 'findMany').mockResolvedValue([]);

      // 365 days range: 2026-01-01 to 2026-12-31
      await authenticatedPost('/api/reports/absence-range/preview', {
        employeeId: EMPLOYEE_ID,
        workTimeTypeCode: 'L4',
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
        hoursPerDay: 8,
      }).expect(200);

      // 366 days range: 2026-01-01 to 2027-01-01
      const res = await authenticatedPost('/api/reports/absence-range/preview', {
        employeeId: EMPLOYEE_ID,
        workTimeTypeCode: 'L4',
        dateFrom: '2026-01-01',
        dateTo: '2027-01-01',
        hoursPerDay: 8,
      }).expect(400);

      expect(res.body.code).toBe('RANGE_EXCEEDS_MAX_DAYS');
    });

    it('rejects hoursPerDay <= 0', async () => {
      await authenticatedPost('/api/reports/absence-range/preview', {
        employeeId: EMPLOYEE_ID,
        workTimeTypeCode: 'L4',
        dateFrom: '2026-08-03',
        dateTo: '2026-08-07',
        hoursPerDay: 0,
      }).expect(400);

      await authenticatedPost('/api/reports/absence-range/preview', {
        employeeId: EMPLOYEE_ID,
        workTimeTypeCode: 'L4',
        dateFrom: '2026-08-03',
        dateTo: '2026-08-07',
        hoursPerDay: -5,
      }).expect(400);
    });
  });

  describe('SAVE: POST /api/reports/absence-range', () => {
    it('creates reports for all available working days in transaction and logs CREATE_ABSENCE_RANGE event', async () => {
      let createdData: any[] = [];

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          $executeRaw: vi.fn(),
          employee: {
            findUnique: vi.fn().mockResolvedValue({
              id: EMPLOYEE_ID,
              fullName: 'Jan Kowalski',
              isActive: true,
              deletedAt: null,
            }),
          },
          workTimeType: {
            findUnique: vi.fn().mockResolvedValue({
              code: 'L4',
              name: 'Chorobowe L4',
              requiresOrder: false,
              isAbsence: true,
            }),
          },
          workTimeReport: {
            findMany: vi.fn().mockResolvedValue([
              { date: new Date('2026-08-07T00:00:00.000Z') }, // 1 conflict
            ]),
            createMany: vi.fn().mockImplementation(async ({ data }: any) => {
              createdData = data;
              return { count: data.length };
            }),
          },
          auditLog: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      const res = await authenticatedPost('/api/reports/absence-range', {
        employeeId: EMPLOYEE_ID,
        workTimeTypeCode: 'L4',
        dateFrom: '2026-08-03',
        dateTo: '2026-08-14', // 12 calendar days (10 working days, 2 weekend days)
        hoursPerDay: 8,
      }).expect(201);

      expect(res.body).toEqual({
        created: 9, // 10 working days - 1 conflict = 9 created
        skipped: 1,
        weekends: 2,
        totalHoursCreated: 72,
        conflicts: [{ date: '2026-08-07', reason: 'EXISTING_ENTRY' }],
      });

      expect(createdData).toHaveLength(9);
      expect(createdData[0]).toMatchObject({
        employeeId: EMPLOYEE_ID,
        hours: 8,
        workTimeTypeCode: 'L4',
        orderId: null,
        missingCard: false,
        createdByUserId: USER_ID,
      });
    });

    it('returns HTTP 200 without creating reports when all working days are conflicts', async () => {
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          $executeRaw: vi.fn(),
          employee: {
            findUnique: vi.fn().mockResolvedValue({
              id: EMPLOYEE_ID,
              fullName: 'Jan Kowalski',
              isActive: true,
              deletedAt: null,
            }),
          },
          workTimeType: {
            findUnique: vi.fn().mockResolvedValue({
              code: 'UW',
              name: 'Urlop',
              requiresOrder: false,
              isAbsence: true,
            }),
          },
          workTimeReport: {
            findMany: vi.fn().mockResolvedValue([
              { date: new Date('2026-08-03T00:00:00.000Z') },
              { date: new Date('2026-08-04T00:00:00.000Z') },
            ]),
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          auditLog: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      const res = await authenticatedPost('/api/reports/absence-range', {
        employeeId: EMPLOYEE_ID,
        workTimeTypeCode: 'UW',
        dateFrom: '2026-08-03',
        dateTo: '2026-08-04',
        hoursPerDay: 8,
      }).expect(200);

      expect(res.body.created).toBe(0);
      expect(res.body.skipped).toBe(2);
      expect(res.body.totalHoursCreated).toBe(0);
      expect(res.body.conflicts).toHaveLength(2);
    });

    it('rolls back all created entries when audit log creation fails', async () => {
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          $executeRaw: vi.fn(),
          employee: {
            findUnique: vi.fn().mockResolvedValue({
              id: EMPLOYEE_ID,
              fullName: 'Jan Kowalski',
              isActive: true,
              deletedAt: null,
            }),
          },
          workTimeType: {
            findUnique: vi.fn().mockResolvedValue({
              code: 'L4',
              name: 'Chorobowe L4',
              requiresOrder: false,
              isAbsence: true,
            }),
          },
          workTimeReport: {
            findMany: vi.fn().mockResolvedValue([]),
            createMany: vi.fn().mockResolvedValue({ count: 5 }),
          },
          auditLog: {
            create: vi.fn().mockRejectedValue(new Error('Audit DB failure')),
          },
        };
        return callback(tx);
      });

      await authenticatedPost('/api/reports/absence-range', {
        employeeId: EMPLOYEE_ID,
        workTimeTypeCode: 'L4',
        dateFrom: '2026-08-03',
        dateTo: '2026-08-07',
        hoursPerDay: 8,
      }).expect(500);
    });

    it('serializes parallel absence-range requests for the same employee so no duplicate reports are created', async () => {
      const reportsInMemory: any[] = [];

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          $executeRaw: vi.fn(),
          employee: {
            findUnique: vi.fn().mockResolvedValue({
              id: EMPLOYEE_ID,
              fullName: 'Jan Kowalski',
              isActive: true,
              deletedAt: null,
            }),
          },
          workTimeType: {
            findUnique: vi.fn().mockResolvedValue({
              code: 'L4',
              name: 'Chorobowe L4',
              requiresOrder: false,
              isAbsence: true,
            }),
          },
          workTimeReport: {
            findMany: vi.fn().mockImplementation(async ({ where }: any) => {
              return reportsInMemory.filter(
                (r) =>
                  r.employeeId === where.employeeId &&
                  r.deletedAt === null &&
                  where.date.in.some((d: Date) => d.getTime() === r.date.getTime()),
              );
            }),
            createMany: vi.fn().mockImplementation(async ({ data }: any) => {
              for (const item of data) {
                reportsInMemory.push({ ...item, deletedAt: null });
              }
              return { count: data.length };
            }),
          },
          auditLog: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      // Send two concurrent requests for overlapping range (2026-08-03 to 2026-08-07, 5 working days)
      const req1 = authenticatedPost('/api/reports/absence-range', {
        employeeId: EMPLOYEE_ID,
        workTimeTypeCode: 'L4',
        dateFrom: '2026-08-03',
        dateTo: '2026-08-07',
        hoursPerDay: 8,
      });

      const req2 = authenticatedPost('/api/reports/absence-range', {
        employeeId: EMPLOYEE_ID,
        workTimeTypeCode: 'L4',
        dateFrom: '2026-08-03',
        dateTo: '2026-08-07',
        hoursPerDay: 8,
      });

      const [res1, res2] = await Promise.all([req1, req2]);

      const createdCounts = [res1.body.created, res2.body.created].sort();
      const skippedCounts = [res1.body.skipped, res2.body.skipped].sort();

      expect(createdCounts).toEqual([0, 5]);
      expect(skippedCounts).toEqual([0, 5]);
      expect(reportsInMemory).toHaveLength(5);
    });
  });
});
