import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../src/app';
import prisma from '../src/utils/prisma';
import { TEST_JWT_SECRET } from './setup-env';
import { getClosureControlSummary, getReconciliationDiagnostics, getAbsencePeriodRows } from '../src/routes/analytics';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const EMPLOYEE_ID = '20000000-0000-4000-8000-000000000001';

const token = jwt.sign(
  { id: USER_ID, username: 'admin', role: 'admin', fullName: 'Administrator' },
  TEST_JWT_SECRET,
);

describe('Canonical WorkTimeTypes and Hardening (v0.5.4)', () => {
  beforeEach(() => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: USER_ID,
      username: 'admin',
      passwordHash: 'unused',
      fullName: 'Administrator',
      role: 'admin',
      isActive: true,
    } as any);
    if ((prisma as any).companyCalendarDay) {
      vi.spyOn((prisma as any).companyCalendarDay, 'findUnique').mockResolvedValue(null);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Prisma Migration 20260908120000_canonical_work_time_types_hardening', () => {
    const sql = readFileSync(
      resolve(__dirname, '../prisma/migrations/20260908120000_canonical_work_time_types_hardening/migration.sql'),
      'utf8',
    );

    it('contains all 16 canonical types with exact required flags', () => {
      const canonicalCodes = [
        'G', 'NDR', 'NS', 'UW', 'UOK', 'UŻ', 'L4', 'WKU',
        'NN', 'NU', 'NUN', 'NUP', 'UB', 'UO', 'UPP', 'OP',
      ];

      canonicalCodes.forEach((code) => {
        expect(sql).toContain(`'${code}'`);
      });

      // Assert WKU is specifically configured as requires_order=false, is_absence=true, is_system=true
      expect(sql).toMatch(/'WKU',\s*'Wojsko',\s*false,\s*true,\s*true/);

      // Assert G, NDR, NS require orders and are not absences
      expect(sql).toMatch(/'G',\s*'Standardowe godziny pracy',\s*true,\s*false,\s*true/);
      expect(sql).toMatch(/'NDR',\s*'Nadgodziny',\s*true,\s*false,\s*true/);
      expect(sql).toMatch(/'NS',\s*'Nadgodziny sobota\/niedziela',\s*true,\s*false,\s*true/);

      // Assert ON CONFLICT DO UPDATE ensures idempotency
      expect(sql).toContain('ON CONFLICT ("code") DO UPDATE SET');
      expect(sql).toContain('"requires_order" = EXCLUDED."requires_order"');
      expect(sql).toContain('"is_absence" = EXCLUDED."is_absence"');
      expect(sql).toContain('"is_system" = EXCLUDED."is_system"');

      // Assert safety: no destructive SQL commands
      expect(sql).not.toMatch(/\bDELETE\b|\bDROP\b|\bTRUNCATE\b/i);
    });
  });

  describe('Reconciliation diagnostics reason semantics', () => {
    const employee = { id: EMPLOYEE_ID, fullName: 'Bogusz Sławomir', firstName: 'Sławomir', lastName: 'Bogusz' };

    it('CASE 1: requires_order=false + is_absence=true (e.g. WKU) -> settled in absences, NO discrepancy', async () => {
      const mockReports = [
        {
          id: 'rep-wku-1',
          employeeId: EMPLOYEE_ID,
          employee,
          date: new Date('2026-09-03T00:00:00.000Z'),
          hours: 8,
          workTimeTypeCode: 'WKU',
          workTimeType: { code: 'WKU', name: 'Wojsko', isAbsence: true, requiresOrder: false },
          orderId: null,
          order: null,
          deletedAt: null,
        },
      ];

      const mockDb: any = {
        order: { findMany: vi.fn().mockResolvedValue([]) },
        workTimeType: {
          findMany: vi.fn().mockResolvedValue([
            { code: 'WKU', name: 'Wojsko', isAbsence: true, requiresOrder: false },
          ]),
        },
        workTimeReport: {
          findMany: vi.fn().mockImplementation(async (args: any) => {
            if (args?.where?.workTimeType?.isAbsence) {
              return [{ workTimeTypeCode: 'WKU', hours: 8 }];
            }
            return mockReports;
          }),
        },
      };

      const summary = await getClosureControlSummary({ dateFrom: '2026-09-01', dateTo: '2026-09-30' }, mockDb);

      expect(summary.status).toBe('MATCHED');
      expect(summary.totalAbsenceHours).toBe(8);
      expect(summary.totalSettledHours).toBe(8);
      expect(summary.totalEmployeeHours).toBe(8);
      expect(summary.difference).toBe(0);
      expect(summary.diagnostics).toBeUndefined();
    });

    it('CASE 2: requires_order=false + is_absence=false (unsettled custom non-absence) -> reports semantic reason, NOT "Brak zlecenia"', async () => {
      const mockReports = [
        {
          id: 'rep-szk-1',
          employeeId: EMPLOYEE_ID,
          employee,
          date: new Date('2026-09-04T00:00:00.000Z'),
          hours: 8,
          workTimeTypeCode: 'SZK',
          workTimeType: { code: 'SZK', name: 'Szkolenie', isAbsence: false, requiresOrder: false },
          orderId: null,
          order: null,
          deletedAt: null,
        },
      ];

      const mockDb: any = {
        order: { findMany: vi.fn().mockResolvedValue([]) },
        workTimeType: {
          findMany: vi.fn().mockResolvedValue([
            { code: 'SZK', name: 'Szkolenie', isAbsence: false, requiresOrder: false },
          ]),
        },
        workTimeReport: {
          findMany: vi.fn().mockImplementation(async (args: any) => {
            if (args?.where?.workTimeType?.isAbsence) return [];
            return mockReports;
          }),
        },
      };

      const summary = await getClosureControlSummary({ dateFrom: '2026-09-01', dateTo: '2026-09-30' }, mockDb);

      expect(summary.status).toBe('MISMATCHED');
      expect(summary.totalSettledHours).toBe(0);
      expect(summary.totalEmployeeHours).toBe(8);
      expect(summary.difference).toBe(-8);

      expect(summary.diagnostics).toHaveLength(1);
      expect(summary.diagnostics![0]).toMatchObject({
        employeeName: 'Bogusz Sławomir',
        workTimeTypeCode: 'SZK',
        hours: 8,
        reason: 'Typ nie jest nieobecnością i nie wymaga zlecenia',
        contribution: -8,
      });

      // Invariant check
      const sumContrib = summary.diagnostics!.reduce((s, d) => s + d.contribution, 0);
      expect(sumContrib).toBe(summary.difference);
    });

    it('CASE 3: requires_order=true + order missing -> reports "Brak zlecenia"', async () => {
      const mockReports = [
        {
          id: 'rep-g-missing-order',
          employeeId: EMPLOYEE_ID,
          employee,
          date: new Date('2026-09-05T00:00:00.000Z'),
          hours: 8,
          workTimeTypeCode: 'G',
          workTimeType: { code: 'G', name: 'Standardowe godziny pracy', isAbsence: false, requiresOrder: true },
          orderId: null,
          order: null,
          deletedAt: null,
        },
      ];

      const mockDb: any = {
        order: { findMany: vi.fn().mockResolvedValue([]) },
        workTimeType: {
          findMany: vi.fn().mockResolvedValue([
            { code: 'G', name: 'Standardowe godziny pracy', isAbsence: false, requiresOrder: true },
          ]),
        },
        workTimeReport: {
          findMany: vi.fn().mockImplementation(async (args: any) => {
            if (args?.where?.workTimeType?.isAbsence) return [];
            return mockReports;
          }),
        },
      };

      const summary = await getClosureControlSummary({ dateFrom: '2026-09-01', dateTo: '2026-09-30' }, mockDb);

      expect(summary.status).toBe('MISMATCHED');
      expect(summary.diagnostics).toHaveLength(1);
      expect(summary.diagnostics![0]).toMatchObject({
        employeeName: 'Bogusz Sławomir',
        workTimeTypeCode: 'G',
        hours: 8,
        reason: 'Brak zlecenia',
        contribution: -8,
      });
      expect(summary.diagnostics![0].contribution).toBe(summary.difference);
    });

    it('CASE 4: requires_order=true + order present in closure -> settled, NO discrepancy', async () => {
      const order = { id: 'ord-100', orderNumber: 'ZL-2026-100', status: 'OPEN', completionDate: null, deletedAt: null };
      const mockReports = [
        {
          id: 'rep-g-with-order',
          employeeId: EMPLOYEE_ID,
          employee,
          date: new Date('2026-09-01T00:00:00.000Z'),
          hours: 8,
          workTimeTypeCode: 'G',
          workTimeType: { code: 'G', name: 'Standardowe godziny pracy', isAbsence: false, requiresOrder: true },
          orderId: 'ord-100',
          order,
          deletedAt: null,
        },
      ];

      const mockDb: any = {
        order: {
          findMany: vi.fn().mockImplementation(async (args: any) => {
            if (args?.select?.id) return [{ id: 'ord-100' }];
            return [
              {
                ...order,
                productName: 'Produkt Test',
                productCode: 'PR-1',
                accountingAccount: 'KK-1',
                plannedHours: 8,
                quantity: 1,
                quantityUnit: 'szt.',
                reports: [{ hours: 8, date: new Date('2026-09-01T00:00:00.000Z'), deletedAt: null }],
              },
            ];
          }),
        },
        workTimeType: {
          findMany: vi.fn().mockResolvedValue([
            { code: 'G', name: 'Standardowe godziny pracy', isAbsence: false, requiresOrder: true },
          ]),
        },
        workTimeReport: {
          findMany: vi.fn().mockImplementation(async (args: any) => {
            if (args?.where?.workTimeType?.isAbsence) return [];
            return mockReports;
          }),
        },
      };

      const summary = await getClosureControlSummary({ dateFrom: '2026-09-01', dateTo: '2026-09-30' }, mockDb);

      expect(summary.status).toBe('MATCHED');
      expect(summary.ordersHours).toBe(8);
      expect(summary.totalSettledHours).toBe(8);
      expect(summary.totalEmployeeHours).toBe(8);
      expect(summary.difference).toBe(0);
      expect(summary.diagnostics).toBeUndefined();
    });

    it('CASE 5: requires_order=true + order CLOSED outside range -> reports "Zlecenie nieobjęte raportem zamknięcia"', async () => {
      const order = { id: 'ord-out', orderNumber: 'ZL-OUTSIDE', status: 'CLOSED', completionDate: new Date('2026-10-15T00:00:00.000Z'), deletedAt: null };
      const mockReports = [
        {
          id: 'rep-g-closed-outside',
          employeeId: EMPLOYEE_ID,
          employee,
          date: new Date('2026-09-01T00:00:00.000Z'),
          hours: 8,
          workTimeTypeCode: 'G',
          workTimeType: { code: 'G', name: 'Standardowe godziny pracy', isAbsence: false, requiresOrder: true },
          orderId: 'ord-out',
          order,
          deletedAt: null,
        },
      ];

      const mockDb: any = {
        order: { findMany: vi.fn().mockResolvedValue([]) },
        workTimeType: {
          findMany: vi.fn().mockResolvedValue([
            { code: 'G', name: 'Standardowe godziny pracy', isAbsence: false, requiresOrder: true },
          ]),
        },
        workTimeReport: {
          findMany: vi.fn().mockImplementation(async (args: any) => {
            if (args?.where?.workTimeType?.isAbsence) return [];
            return mockReports;
          }),
        },
      };

      const summary = await getClosureControlSummary({ dateFrom: '2026-09-01', dateTo: '2026-09-30' }, mockDb);

      expect(summary.status).toBe('MISMATCHED');
      expect(summary.diagnostics).toHaveLength(1);
      expect(summary.diagnostics![0]).toMatchObject({
        orderNumber: 'ZL-OUTSIDE',
        reason: 'Zlecenie nieobjęte raportem zamknięcia',
        contribution: -8,
      });
      expect(summary.diagnostics![0].contribution).toBe(summary.difference);
    });
  });

  describe('Absence Periods reporting with WKU and standard absences', () => {
    it('aggregates WKU absence records into absence periods', async () => {
      const employee = { id: EMPLOYEE_ID, fullName: 'Bogusz Sławomir', firstName: 'Sławomir', lastName: 'Bogusz' };
      const mockDb: any = {
        workTimeReport: {
          findMany: vi.fn().mockResolvedValue([
            {
              employeeId: EMPLOYEE_ID,
              employee,
              workTimeTypeCode: 'WKU',
              workTimeType: { code: 'WKU', name: 'Wojsko', isAbsence: true },
              date: new Date('2026-09-01T00:00:00.000Z'), // Tuesday
              hours: 8,
            },
            {
              employeeId: EMPLOYEE_ID,
              employee,
              workTimeTypeCode: 'WKU',
              workTimeType: { code: 'WKU', name: 'Wojsko', isAbsence: true },
              date: new Date('2026-09-02T00:00:00.000Z'), // Wednesday
              hours: 8,
            },
            {
              employeeId: EMPLOYEE_ID,
              employee,
              workTimeTypeCode: 'WKU',
              workTimeType: { code: 'WKU', name: 'Wojsko', isAbsence: true },
              date: new Date('2026-09-03T00:00:00.000Z'), // Thursday
              hours: 8,
            },
          ]),
        },
      };

      const rows = await getAbsencePeriodRows({ dateFrom: '2026-09-01', dateTo: '2026-09-30' }, mockDb);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({
        employeeId: EMPLOYEE_ID,
        employeeName: 'Bogusz Sławomir',
        workTimeTypeCode: 'WKU',
        absenceType: 'WKU (Wojsko)',
        dateFrom: '2026-09-01',
        dateTo: '2026-09-03',
        workingDays: 3,
      });
    });
  });

  describe('WorkTimeType API Dictionary CRUD safety', () => {
    it('prevents deleting system codes', async () => {
      vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue({
        code: 'WKU',
        name: 'Wojsko',
        requiresOrder: false,
        isAbsence: true,
        isSystem: true,
      } as any);

      const res = await request(app)
        .delete('/api/work-time-types/WKU')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('systemowego');
    });

    it('prevents modifying requiresOrder on system codes but allows modifying name and isAbsence', async () => {
      vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue({
        code: 'WKU',
        name: 'Wojsko',
        requiresOrder: false,
        isAbsence: true,
        isSystem: true,
      } as any);

      const updateSpy = vi.spyOn(prisma.workTimeType, 'update').mockResolvedValue({} as any);

      await request(app)
        .put('/api/work-time-types/WKU')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Wojsko / Ćwiczenia WCR',
          requiresOrder: true, // Should be ignored because isSystem: true
          isAbsence: true,
        })
        .expect(200);

      expect(updateSpy).toHaveBeenCalledWith({
        where: { code: 'WKU' },
        data: {
          name: 'Wojsko / Ćwiczenia WCR',
          isAbsence: true,
        },
      });
    });
  });
});
