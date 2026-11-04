import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import * as ExcelJS from 'exceljs';
import app from '../src/app';
import prisma from '../src/utils/prisma';
import { TEST_JWT_SECRET } from './setup-env';
import { describe, it, expect, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { getClosureControlSummary, getEmployeeReportRows, getOrderReportRows, getAbsencePeriodRows } from '../src/routes/analytics';

const url = process.env.WTT_ACCOUNTING_TEST_URL;
// Opt-in integration test: only the isolated database created for this task.
const enabled = Boolean(url && new URL(url).hostname === '127.0.0.1' && new URL(url).pathname === '/wtt_accounting_test');
describe.skipIf(!enabled)('PostgreSQL accounting regression (fictional data, transaction rolled back)', () => {
  it('counts OK across two days, linked absence and off-order work exactly once; retains legacy and soft delete behavior', async () => {
    const client = new PrismaClient({ datasources: { db: { url } } });
    const rollback = new Error('rollback fictional fixtures');
    try {
      await client.$transaction(async tx => {
        // OK was inserted with false/false before applying the new migration.
        const ok = await tx.workTimeType.findUniqueOrThrow({ where: { code: 'OK' } });
        expect(ok).toMatchObject({ accountingCategory: 'ABSENCE', isAbsence: true, requiresOrder: false });
        const legacy = await tx.workTimeType.findUniqueOrThrow({ where: { code: 'SZK' } });
        expect(legacy).toMatchObject({ accountingCategory: null, isAbsence: false, requiresOrder: false });
        const user = await tx.user.create({ data: { username: 'regression-transaction', fullName: 'Fixture', passwordHash: 'unused', role: 'admin' } });
        const employee = await tx.employee.create({ data: { fullName: 'Fikcyjny Pracownik', firstName: 'Fikcyjny', lastName: 'Pracownik' } });
        const order = await tx.order.create({ data: { orderNumber: 'REGRESSION-TRANSACTION', productName: 'Fixture', orderDate: new Date('2026-10-01'), plannedHours: 40, hoursPerUnit: 40, quantity: 1 } });
        await tx.workTimeType.createMany({ data: [
          { code: 'RG_WORK', name: 'Praca', requiresOrder: true, isAbsence: false, accountingCategory: 'ORDER_WORK' },
          { code: 'RG_ABS', name: 'Nieobecność', requiresOrder: false, isAbsence: true, accountingCategory: 'ABSENCE' },
          { code: 'RG_OFF', name: 'Poza zleceniem', requiresOrder: false, isAbsence: false, accountingCategory: 'OFF_ORDER_WORK' },
          { code: 'NN', name: 'NN', requiresOrder: false, isAbsence: false },
        ], skipDuplicates: true });
        const base = { employeeId: employee.id, createdByUserId: user.id };
        await tx.workTimeReport.createMany({ data: [
          { ...base, date: new Date('2026-10-29'), hours: 8, workTimeTypeCode: 'OK' },
        ] });
        const filters = { dateFrom: '2026-10-01', dateTo: '2026-10-31' };
        expect(await getClosureControlSummary(filters, tx)).toMatchObject({ ordersHours: 0, totalAbsenceHours: 8, totalEmployeeHours: 8, difference: 0 });
        await tx.workTimeReport.createMany({ data: [
          { ...base, date: new Date('2026-10-30'), hours: 8, workTimeTypeCode: 'OK' },
          { ...base, date: new Date('2026-10-20'), hours: 8, workTimeTypeCode: 'RG_WORK', orderId: order.id },
          // Deliberately historical anomaly: must never inflate order totals.
          { ...base, date: new Date('2026-10-21'), hours: 8, workTimeTypeCode: 'RG_ABS', orderId: order.id },
          { ...base, date: new Date('2026-10-22'), hours: 4, workTimeTypeCode: 'RG_OFF' },
          { ...base, date: new Date('2026-10-23'), hours: 3, workTimeTypeCode: 'SZK' },
          { ...base, date: new Date('2026-10-24'), hours: 5, workTimeTypeCode: 'NN', orderId: order.id },
          { ...base, date: new Date('2026-10-25'), hours: 8, workTimeTypeCode: 'OK', deletedAt: new Date() },
        ] });
        const summary = await getClosureControlSummary(filters, tx);
        expect(summary).toMatchObject({ ordersHours: 8, offOrderHours: 4, totalAbsenceHours: 24, totalSettledHours: 36, totalEmployeeHours: 39, difference: -3 });
        expect(summary.diagnostics?.map(d => [d.workTimeTypeCode, d.contribution])).toEqual([['SZK', -3]]);
        const rows = await getEmployeeReportRows(filters, tx);
        expect(rows[0]).toMatchObject({ suma: 15, sumaBezNadgodzin: 39, OK: 16, RG_ABS: 8, RG_OFF: 4, NN: 5 });
        expect(await getOrderReportRows({ ...filters, closureReport: true, onlyWithHours: false }, tx)).toEqual([expect.objectContaining({ actualHours: 8, percent: 20, deviation: 32 })]);
        expect((await getAbsencePeriodRows(filters, tx)).some(r => r.workTimeTypeCode === 'OK')).toBe(true);
        await tx.workTimeReport.updateMany({ where: { employeeId: employee.id, workTimeTypeCode: 'SZK' }, data: { deletedAt: new Date() } });
        expect(await getClosureControlSummary(filters, tx)).toMatchObject({ totalSettledHours: 36, totalEmployeeHours: 36, difference: 0, status: 'MATCHED' });
        vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(user);
        vi.spyOn(prisma.order, 'findMany').mockImplementation((args: any) => tx.order.findMany(args));
        vi.spyOn(prisma.workTimeType, 'findMany').mockImplementation((args: any) => tx.workTimeType.findMany(args));
        vi.spyOn(prisma.workTimeReport, 'findMany').mockImplementation((args: any) => tx.workTimeReport.findMany(args));
        vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => callback(tx));
        const token = jwt.sign({ id: user.id, username: user.username, role: 'admin' }, TEST_JWT_SECRET);
        const query = 'dateFrom=2026-10-01&dateTo=2026-10-31';
        const monthly = await request(app).get('/api/analytics/report-by-employee?' + query).set('Authorization', 'Bearer ' + token).expect(200);
        expect(monthly.body[0]).toMatchObject({ suma: 12, sumaBezNadgodzin: 36, OK: 16 });
        const orderJson = await request(app).get('/api/analytics/report-by-order?' + query).set('Authorization', 'Bearer ' + token).expect(200);
        expect(orderJson.body[0].actualHours).toBe(8);
        const orderList = await request(app).get('/api/orders').set('Authorization', 'Bearer ' + token).expect(200);
        expect(orderList.body[0].actualHours).toBe(8);
        const exported = await request(app).get('/api/analytics/export/by-order?' + query + '&closureReport=true').set('Authorization', 'Bearer ' + token)
          .buffer(true).parse((res: any, callback: any) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('end', () => callback(null, Buffer.concat(chunks)));
          }).expect(200);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(exported.body);
        const sheet = workbook.getWorksheet('Zlecenia')!;
        const values = sheet.getSheetValues() as any[];
        expect(values.find(row => Array.isArray(row) && row[1] === 'Praca poza zleceniem')[2]).toBe(4);
        expect(values.find(row => Array.isArray(row) && row[1] === 'Łącznie rozliczono')[2]).toBe(36);
        expect(values.find(row => Array.isArray(row) && row[1] === 'REGRESSION-TRANSACTION')[7]).toBe(8);
        vi.spyOn(prisma.order, 'count').mockImplementation((args: any) => tx.order.count(args));
        vi.spyOn(prisma.workTimeReport, 'aggregate').mockImplementation((args: any) => tx.workTimeReport.aggregate(args));
        await tx.order.update({ where: { id: order.id }, data: { plannedHours: 8 } });
        const dashboard = await request(app).get('/api/analytics/dashboard').set('Authorization', 'Bearer ' + token).expect(200);
        expect(dashboard.body.ordersApproaching[0]).toMatchObject({ actualHours: 8, percent: 100 });
        // Database constraint prevents bypassing API validation.
        throw rollback;
      }, { timeout: 20000 });
    } catch (error) { if (error !== rollback) throw error; }
    finally { vi.restoreAllMocks(); await client.$disconnect(); }
  });
});
