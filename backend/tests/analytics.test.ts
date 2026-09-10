import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as jwt from 'jsonwebtoken';
import * as ExcelJS from 'exceljs';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import {
  formatEmployeeName,
  getClosureControlSummary,
  ReconciliationConsistencyError,
} from '../src/routes/analytics';
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

const authenticatedGet = (path: string) =>
  request(app).get(path).set('Authorization', `Bearer ${token}`);

const binaryParser = (
  response: NodeJS.ReadableStream,
  callback: (error: Error | null, body?: Buffer) => void,
) => {
  const chunks: Buffer[] = [];
  response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
  response.on('error', callback);
};

const closureRange = 'dateFrom=2026-08-01&dateTo=2026-08-31&closureReport=true';

const closureOrders = [
  { id: 'open-hours', orderNumber: 'ZL-001', status: 'OPEN', completionDate: null, deletedAt: null, reports: [{ hours: 5, date: new Date('2026-08-10T00:00:00.000Z'), deletedAt: null }] },
  { id: 'open-zero', orderNumber: 'ZL-002', status: 'OPEN', completionDate: null, deletedAt: null, reports: [] },
  { id: 'closed-hours', orderNumber: 'ZL-003', status: 'CLOSED', completionDate: new Date('2026-08-15T00:00:00.000Z'), deletedAt: null, reports: [{ hours: 4, date: new Date('2026-08-12T00:00:00.000Z'), deletedAt: null }] },
  { id: 'closed-zero', orderNumber: 'ZL-004', status: 'CLOSED', completionDate: new Date('2026-08-16T00:00:00.000Z'), deletedAt: null, reports: [] },
  { id: 'closed-before', orderNumber: 'ZL-005', status: 'CLOSED', completionDate: new Date('2026-07-31T00:00:00.000Z'), deletedAt: null, reports: [] },
  { id: 'closed-after', orderNumber: 'ZL-006', status: 'CLOSED', completionDate: new Date('2026-09-01T00:00:00.000Z'), deletedAt: null, reports: [] },
  { id: 'closed-outside-hours', orderNumber: 'ZL-007', status: 'CLOSED', completionDate: new Date('2026-08-17T00:00:00.000Z'), deletedAt: null, reports: [{ hours: 7, date: new Date('2026-07-20T00:00:00.000Z'), deletedAt: null }] },
  { id: 'closed-deleted-report', orderNumber: 'ZL-008', status: 'CLOSED', completionDate: new Date('2026-08-18T00:00:00.000Z'), deletedAt: null, reports: [{ hours: 8, date: new Date('2026-08-18T00:00:00.000Z'), deletedAt: new Date('2026-08-19T00:00:00.000Z') }] },
  { id: 'deleted-order', orderNumber: 'ZL-009', status: 'CLOSED', completionDate: new Date('2026-08-19T00:00:00.000Z'), deletedAt: new Date('2026-08-20T00:00:00.000Z'), reports: [] },
  { id: 'suspended', orderNumber: 'ZL-010', status: 'SUSPENDED', completionDate: null, deletedAt: null, reports: [{ hours: 3, date: new Date('2026-08-20T00:00:00.000Z'), deletedAt: null }] },
  { id: 'boundary-from', orderNumber: 'ZL-011', status: 'CLOSED', completionDate: new Date('2026-08-01T00:00:00.000Z'), deletedAt: null, reports: [] },
  { id: 'boundary-to', orderNumber: 'ZL-012', status: 'CLOSED', completionDate: new Date('2026-08-31T00:00:00.000Z'), deletedAt: null, reports: [] },
].map(order => ({
  productName: `Produkt ${order.orderNumber}`,
  productCode: `P-${order.orderNumber}`,
  accountingAccount: 'K-001',
  plannedHours: 10,
  quantity: 1,
  quantityUnit: 'szt.',
  ...order,
}));

const mockOrderReportQuery = () => vi.spyOn(prisma.order, 'findMany').mockImplementation(async (args: any) => {
  // Diagnostic query for closure control summary - only selects id, no include
  if (args?.select?.id && !args?.include?.reports) {
    return closureOrders
      .filter(order => order.deletedAt === null)
      .filter(order => order.status === 'OPEN' || (
        order.status === 'CLOSED' &&
        order.completionDate &&
        order.completionDate >= new Date('2026-08-01T00:00:00.000Z') &&
        order.completionDate <= new Date('2026-08-31T23:59:59.999Z')
      ))
      .map(order => ({ id: order.id })) as any;
  }

  const reportRange = args.include.reports.where.date;
  const closureBranches = args.where.OR as any[] | undefined;
  const completionRange = closureBranches?.[1]?.completionDate;

  return closureOrders
    .filter(order => order.deletedAt === null)
    .filter(order => {
      if (!closureBranches) return !args.where.status || order.status === args.where.status;
      return order.status === 'OPEN' || (
        order.status === 'CLOSED' &&
        order.completionDate &&
        order.completionDate >= completionRange.gte &&
        order.completionDate <= completionRange.lte
      );
    })
    .map(order => ({
      ...order,
      reports: order.reports.filter(report =>
        report.deletedAt === null &&
        (!reportRange.gte || report.date >= reportRange.gte) &&
        (!reportRange.lte || report.date <= reportRange.lte),
      ),
    })) as any;
});

describe('Analytics reports', () => {
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
    vi.spyOn(prisma.workTimeReport, 'findMany').mockResolvedValue([]);
    vi.spyOn(prisma.workTimeType, 'findMany').mockResolvedValue([]);
    vi.spyOn(prisma.companyCalendarDay, 'findUnique').mockResolvedValue(null);
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      if (typeof callback === 'function') {
        return callback(prisma);
      }
      return callback;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('aggregates every work time type without a hardcoded code list', async () => {
    vi.spyOn(prisma.workTimeReport, 'findMany').mockResolvedValue([
      {
        employeeId: EMPLOYEE_ID,
        employee: { fullName: 'Jan Kowalski' },
        hours: 2.5,
        workTimeTypeCode: 'NOC',
      },
      {
        employeeId: EMPLOYEE_ID,
        employee: { fullName: 'Jan Kowalski' },
        hours: 1.5,
        workTimeTypeCode: 'NOC',
      },
    ] as any);

    const response = await authenticatedGet('/api/analytics/report-by-employee')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body).toEqual([
      {
        employeeId: EMPLOYEE_ID,
        employeeName: 'Jan Kowalski',
        NOC: 4,
        suma: 4,
        sumaBezNadgodzin: 4,
      },
    ]);
  });

  it('returns the same employee rows and dynamic work time types in JSON and XLSX', async () => {
    const reports = [
      {
        employeeId: EMPLOYEE_ID,
        employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' },
        hours: 8,
        workTimeTypeCode: 'G',
      },
      {
        employeeId: EMPLOYEE_ID,
        employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' },
        hours: 2.5,
        workTimeTypeCode: 'NOC',
      },
    ];
    const reportSpy = vi.spyOn(prisma.workTimeReport, 'findMany').mockResolvedValue(reports as any);
    vi.spyOn(prisma.workTimeType, 'findMany').mockResolvedValue([
      { code: 'G', name: 'Standardowe godziny pracy' },
      { code: 'NOC', name: 'Zmiana nocna' },
    ] as any);

    const filters = `dateFrom=2026-07-01&dateTo=2026-07-31&employeeId=${EMPLOYEE_ID}`;
    const jsonResponse = await authenticatedGet(`/api/analytics/report-by-employee?${filters}`)
      .expect(200);
    const xlsxResponse = await authenticatedGet(`/api/analytics/export/by-employee?${filters}`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200)
      .expect('Content-Type', /spreadsheetml/);

    expect(reportSpy).toHaveBeenCalledTimes(2);
    expect(reportSpy.mock.calls[0][0]).toEqual(reportSpy.mock.calls[1][0]);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsxResponse.body);
    const worksheet = workbook.getWorksheet('Czas pracy');

    // Metadane nagłówka raportu
    expect(worksheet?.getRow(1).getCell(1).value).toBe('Raport: Miesięczny raport czasu pracy pracowników');
    expect(worksheet?.getRow(2).getCell(1).value).toBe('Zakres dat: 01.07.2026–31.07.2026');
    expect(worksheet?.getRow(3).getCell(1).value).toBe('Pracownik: Kowalski Jan');
    expect(worksheet?.getRow(4).getCell(1).value).toMatch(/^Wygenerowano: \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}$/);
    expect(worksheet?.getRow(5).values).toEqual([]);

    // Wiersz 6: Nagłówek tabeli
    expect(worksheet?.getRow(6).values).toEqual([
      undefined,
      'Pracownik',
      'Suma godzin z nadgodzinami',
      'Suma godzin bez nadgodzin',
      'G (Standardowe godziny pracy)',
      'NOC (Zmiana nocna)',
    ]);

    // Wiersz 7: Dane
    expect(worksheet?.getRow(7).values).toEqual([
      undefined,
      jsonResponse.body[0].employeeName,
      jsonResponse.body[0].suma,
      jsonResponse.body[0].sumaBezNadgodzin,
      jsonResponse.body[0].G,
      jsonResponse.body[0].NOC,
    ]);

    // Weryfikacja zamrożenia widoku (ySplit) i filtra tabeli
    expect(worksheet?.views[0]).toEqual(expect.objectContaining({ state: 'frozen', ySplit: 6 }));
    expect(worksheet?.autoFilter).toBe('A6:E7');
  });

  it('presents a missing accounting account as brak', async () => {
    vi.spyOn(prisma.workTimeReport, 'findMany').mockResolvedValue([
      {
        id: '30000000-0000-4000-8000-000000000001',
        date: new Date('2026-07-23T00:00:00.000Z'),
        employee: { fullName: 'Jan Kowalski' },
        order: null,
        hours: 8,
        workTimeTypeCode: 'L4',
      },
    ] as any);

    const response = await authenticatedGet('/api/analytics/report-by-account')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body[0].accountingAccount).toBe('brak');
  });

  it('builds absence periods from configured types, bridges weekends, splits on missing workdays and deduplicates dates', async () => {
    const employee = {
      fullName: 'Jan Kowalski',
      firstName: 'Jan',
      lastName: 'Kowalski',
    };
    const workTimeType = {
      code: 'NIEST',
      name: 'Niestandardowa nieobecność',
      isAbsence: true,
      requiresOrder: true,
    };
    const reportSpy = vi.spyOn(prisma.workTimeReport, 'findMany').mockResolvedValue([
      { employeeId: EMPLOYEE_ID, employee, workTimeTypeCode: 'NIEST', workTimeType, date: new Date('2026-07-03T00:00:00.000Z') },
      { employeeId: EMPLOYEE_ID, employee, workTimeTypeCode: 'NIEST', workTimeType, date: new Date('2026-07-03T00:00:00.000Z') },
      { employeeId: EMPLOYEE_ID, employee, workTimeTypeCode: 'NIEST', workTimeType, date: new Date('2026-07-06T00:00:00.000Z') },
      { employeeId: EMPLOYEE_ID, employee, workTimeTypeCode: 'NIEST', workTimeType, date: new Date('2026-07-08T00:00:00.000Z') },
      {
        employeeId: EMPLOYEE_ID,
        employee,
        workTimeTypeCode: 'SZK',
        workTimeType: { code: 'SZK', name: 'Szkolenie', isAbsence: false, requiresOrder: false },
        date: new Date('2026-07-07T00:00:00.000Z'),
      },
    ] as any);

    const response = await authenticatedGet(
      `/api/analytics/report-absence-periods?dateFrom=2026-07-03&dateTo=2026-07-08&employeeId=${EMPLOYEE_ID}&workTimeTypeCode=NIEST`,
    ).expect(200);

    expect(reportSpy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        deletedAt: null,
        employeeId: EMPLOYEE_ID,
        workTimeTypeCode: 'NIEST',
        workTimeType: { isAbsence: true },
        date: {
          gte: new Date('2026-07-03T00:00:00.000Z'),
          lte: new Date('2026-07-08T00:00:00.000Z'),
        },
      }),
    }));
    expect(response.body).toEqual([
      {
        employeeId: EMPLOYEE_ID,
        employeeName: 'Kowalski Jan',
        workTimeTypeCode: 'NIEST',
        absenceType: 'NIEST (Niestandardowa nieobecność)',
        dateFrom: '2026-07-03',
        dateTo: '2026-07-06',
        workingDays: 2,
      },
      {
        employeeId: EMPLOYEE_ID,
        employeeName: 'Kowalski Jan',
        workTimeTypeCode: 'NIEST',
        absenceType: 'NIEST (Niestandardowa nieobecność)',
        dateFrom: '2026-07-08',
        dateTo: '2026-07-08',
        workingDays: 1,
      },
    ]);
  });

  it('regression: includes custom absence types like ART188 when isAbsence=true, and still includes standard UW/UŻ/L4', async () => {
    const employee = {
      fullName: 'Yurii Rudenko',
      firstName: 'Yurii',
      lastName: 'Rudenko',
    };

    const art188Type = {
      code: 'ART188',
      name: 'Art. 188 Kodeksu pracy',
      isAbsence: true,
      requiresOrder: false,
    };

    const uwType = {
      code: 'UW',
      name: 'Urlop wypoczynkowy',
      isAbsence: true,
      requiresOrder: false,
    };

    const uzType = {
      code: 'UŻ',
      name: 'Urlop na żądanie',
      isAbsence: true,
      requiresOrder: false,
    };

    const l4Type = {
      code: 'L4',
      name: 'Zwolnienie chorobowe',
      isAbsence: true,
      requiresOrder: false,
    };

    const reportSpy = vi.spyOn(prisma.workTimeReport, 'findMany').mockResolvedValue([
      // ART188 on 2026-08-06 (Thursday) and 2026-08-07 (Friday) = 2 consecutive working days = 16h total (8h/day)
      { employeeId: EMPLOYEE_ID, employee, workTimeTypeCode: 'ART188', workTimeType: art188Type, hours: 8, date: new Date('2026-08-06T00:00:00.000Z') },
      { employeeId: EMPLOYEE_ID, employee, workTimeTypeCode: 'ART188', workTimeType: art188Type, hours: 8, date: new Date('2026-08-07T00:00:00.000Z') },
      // UW spanning weekend (bridged)
      { employeeId: EMPLOYEE_ID, employee, workTimeTypeCode: 'UW', workTimeType: uwType, hours: 8, date: new Date('2026-08-10T00:00:00.000Z') },
      { employeeId: EMPLOYEE_ID, employee, workTimeTypeCode: 'UW', workTimeType: uwType, hours: 8, date: new Date('2026-08-11T00:00:00.000Z') },
      // UŻ single day
      { employeeId: EMPLOYEE_ID, employee, workTimeTypeCode: 'UŻ', workTimeType: uzType, hours: 8, date: new Date('2026-08-12T00:00:00.000Z') },
      // L4 split by missing workday
      { employeeId: EMPLOYEE_ID, employee, workTimeTypeCode: 'L4', workTimeType: l4Type, hours: 8, date: new Date('2026-08-14T00:00:00.000Z') },
      { employeeId: EMPLOYEE_ID, employee, workTimeTypeCode: 'L4', workTimeType: l4Type, hours: 8, date: new Date('2026-08-18T00:00:00.000Z') },
      // Non-absence type should be excluded
      { employeeId: EMPLOYEE_ID, employee, workTimeTypeCode: 'G', workTimeType: { code: 'G', name: 'Standardowe', isAbsence: false, requiresOrder: true }, hours: 8, date: new Date('2026-08-06T00:00:00.000Z') },
    ] as any);

    // Test without workTimeTypeCode filter to get all absence types
    const response = await authenticatedGet(
      `/api/analytics/report-absence-periods?dateFrom=2026-08-01&dateTo=2026-08-31&employeeId=${EMPLOYEE_ID}`,
    ).expect(200);

    expect(reportSpy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        deletedAt: null,
        employeeId: EMPLOYEE_ID,
        workTimeType: { isAbsence: true },
        date: {
          gte: new Date('2026-08-01T00:00:00.000Z'),
          lte: new Date('2026-08-31T00:00:00.000Z'),
        },
      }),
    }));

    // Verify all absence types appear in results
    const typesInResponse = [...new Set(response.body.map((r: any) => r.workTimeTypeCode))];
    expect(typesInResponse).toContain('ART188');
    expect(typesInResponse).toContain('UW');
    expect(typesInResponse).toContain('UŻ');
    expect(typesInResponse).toContain('L4');
    expect(typesInResponse).not.toContain('G');

    // Verify ART188 period: 2026-08-06 to 2026-08-07 (consecutive working days, weekend bridges)
    const art188Period = response.body.find((r: any) => r.workTimeTypeCode === 'ART188');
    expect(art188Period).toBeDefined();
    expect(art188Period.dateFrom).toBe('2026-08-06');
    expect(art188Period.dateTo).toBe('2026-08-07');
    expect(art188Period.workingDays).toBe(2);
    expect(art188Period.absenceType).toBe('ART188 (Art. 188 Kodeksu pracy)');

    // Verify UW bridges weekend (Fri 10th + Mon 11th = consecutive working days)
    const uwPeriod = response.body.find((r: any) => r.workTimeTypeCode === 'UW');
    expect(uwPeriod).toBeDefined();
    expect(uwPeriod.dateFrom).toBe('2026-08-10');
    expect(uwPeriod.dateTo).toBe('2026-08-11');
    expect(uwPeriod.workingDays).toBe(2);

    // Verify UŻ single day
    const uzPeriod = response.body.find((r: any) => r.workTimeTypeCode === 'UŻ');
    expect(uzPeriod).toBeDefined();
    expect(uzPeriod.dateFrom).toBe('2026-08-12');
    expect(uzPeriod.dateTo).toBe('2026-08-12');
    expect(uzPeriod.workingDays).toBe(1);

    // Verify L4 split by missing workday (14th and 18th are not consecutive working days - 15th,16th weekend, 17th missing)
    const l4Periods = response.body.filter((r: any) => r.workTimeTypeCode === 'L4');
    expect(l4Periods.length).toBe(2);
    expect(l4Periods[0].dateFrom).toBe('2026-08-14');
    expect(l4Periods[0].dateTo).toBe('2026-08-14');
    expect(l4Periods[0].workingDays).toBe(1);
    expect(l4Periods[1].dateFrom).toBe('2026-08-18');
    expect(l4Periods[1].dateTo).toBe('2026-08-18');
    expect(l4Periods[1].workingDays).toBe(1);
  });

  it('uses the company calendar when grouping absence periods', async () => {
    const employee = { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' };
    const absenceType = { code: 'L4', name: 'Zwolnienie chorobowe', isAbsence: true, requiresOrder: false };
    const report = (date: string) => ({
      employeeId: EMPLOYEE_ID,
      employee,
      workTimeTypeCode: 'L4',
      workTimeType: absenceType,
      date: new Date(`${date}T00:00:00.000Z`),
    });
    const calendarSpy = vi.spyOn(prisma.companyCalendarDay, 'findUnique');
    const reportSpy = vi.spyOn(prisma.workTimeReport, 'findMany');

    const run = async (reports: object[]) => {
      reportSpy.mockResolvedValue(reports as any);
      return authenticatedGet(
        `/api/analytics/report-absence-periods?dateFrom=2026-08-13&dateTo=2026-08-17&employeeId=${EMPLOYEE_ID}&workTimeTypeCode=L4`,
      ).expect(200);
    };

    // Base Saturday is free, so Friday and Monday remain one period.
    calendarSpy.mockResolvedValue(null);
    const weekendResponse = await run([report('2026-08-14'), report('2026-08-17')]);
    expect(weekendResponse.body).toHaveLength(1);
    expect(weekendResponse.body[0]).toMatchObject({ dateFrom: '2026-08-14', dateTo: '2026-08-17', workingDays: 2 });

    // A working Saturday is a missing working day and therefore splits the period.
    calendarSpy.mockImplementation(async ({ where }: any) =>
      where.date.toISOString().startsWith('2026-08-15')
        ? { date: where.date, isWorkingDay: true, reason: null }
        : null,
    );
    const workingSaturdayResponse = await run([report('2026-08-14'), report('2026-08-17')]);
    expect(workingSaturdayResponse.body).toHaveLength(2);

    // A weekday explicitly marked free is skipped just like a weekend.
    calendarSpy.mockImplementation(async ({ where }: any) =>
      where.date.toISOString().startsWith('2026-08-14')
        ? { date: where.date, isWorkingDay: false, reason: 'dzień wolny' }
        : null,
    );
    const freeWeekdayResponse = await run([report('2026-08-13'), report('2026-08-17')]);
    expect(freeWeekdayResponse.body).toHaveLength(1);
    expect(freeWeekdayResponse.body[0]).toMatchObject({ dateFrom: '2026-08-13', dateTo: '2026-08-17', workingDays: 2 });

    // A statutory Polish public holiday (e.g. Boże Ciało on 2026-06-04) bridges absence without an override
    calendarSpy.mockResolvedValue(null);
    reportSpy.mockResolvedValue([report('2026-06-03'), report('2026-06-05')] as any);
    const holidayResponse = await authenticatedGet(
      `/api/analytics/report-absence-periods?dateFrom=2026-06-01&dateTo=2026-06-10&employeeId=${EMPLOYEE_ID}&workTimeTypeCode=L4`,
    ).expect(200);
    expect(holidayResponse.body).toHaveLength(1);
    expect(holidayResponse.body[0]).toMatchObject({ dateFrom: '2026-06-03', dateTo: '2026-06-05', workingDays: 2 });
  });

  it('correctly handles absence periods with multiple employees, multiple absence types, and Easter Monday / Nov 11 holiday bridging', async () => {
    const employee1 = { id: 'emp-1', fullName: 'Adam Nowak', firstName: 'Adam', lastName: 'Nowak' };
    const employee2 = { id: 'emp-2', fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' };
    const l4Type = { code: 'L4', name: 'Zwolnienie chorobowe', isAbsence: true, requiresOrder: false };
    const uwType = { code: 'UW', name: 'Urlop wypoczynkowy', isAbsence: true, requiresOrder: false };

    // Employee 1:
    // - UW on 2026-04-03 (Friday before Easter) and 2026-04-07 (Tuesday after Easter Monday 2026-04-06)
    //   -> Easter Sunday (04-05) + Easter Monday (04-06) should bridge into 1 period: 2026-04-03 to 2026-04-07, 2 working days.
    // - L4 on 2026-04-08 (Wednesday) -> different type, must NOT merge with UW! 1 period: 2026-04-08 to 2026-04-08, 1 working day.
    //
    // Employee 2:
    // - L4 on 2026-11-10 (Tuesday) and 2026-11-12 (Thursday) spanning 2026-11-11 (Święto Niepodległości - Wednesday)
    //   -> 1 period: 2026-11-10 to 2026-11-12, 2 working days.
    vi.spyOn(prisma.companyCalendarDay, 'findUnique').mockResolvedValue(null);
    vi.spyOn(prisma.workTimeReport, 'findMany').mockResolvedValue([
      { employeeId: 'emp-1', employee: employee1, workTimeTypeCode: 'UW', workTimeType: uwType, hours: 8, date: new Date('2026-04-03T00:00:00.000Z') },
      { employeeId: 'emp-1', employee: employee1, workTimeTypeCode: 'UW', workTimeType: uwType, hours: 8, date: new Date('2026-04-07T00:00:00.000Z') },
      { employeeId: 'emp-1', employee: employee1, workTimeTypeCode: 'L4', workTimeType: l4Type, hours: 8, date: new Date('2026-04-08T00:00:00.000Z') },
      { employeeId: 'emp-2', employee: employee2, workTimeTypeCode: 'L4', workTimeType: l4Type, hours: 8, date: new Date('2026-11-10T00:00:00.000Z') },
      { employeeId: 'emp-2', employee: employee2, workTimeTypeCode: 'L4', workTimeType: l4Type, hours: 8, date: new Date('2026-11-12T00:00:00.000Z') },
    ] as any);

    const res = await authenticatedGet('/api/analytics/report-absence-periods').expect(200);

    // Should have 3 separate periods in total
    expect(res.body).toHaveLength(3);

    // 1. Kowalski Jan - L4
    const kowalskiL4 = res.body.find((r: any) => r.employeeName === 'Kowalski Jan' && r.workTimeTypeCode === 'L4');
    expect(kowalskiL4).toMatchObject({
      employeeId: 'emp-2',
      employeeName: 'Kowalski Jan',
      workTimeTypeCode: 'L4',
      dateFrom: '2026-11-10',
      dateTo: '2026-11-12',
      workingDays: 2,
    });

    // 2. Nowak Adam - L4
    const nowakL4 = res.body.find((r: any) => r.employeeName === 'Nowak Adam' && r.workTimeTypeCode === 'L4');
    expect(nowakL4).toMatchObject({
      employeeId: 'emp-1',
      employeeName: 'Nowak Adam',
      workTimeTypeCode: 'L4',
      dateFrom: '2026-04-08',
      dateTo: '2026-04-08',
      workingDays: 1,
    });

    // 3. Nowak Adam - UW
    const nowakUW = res.body.find((r: any) => r.employeeName === 'Nowak Adam' && r.workTimeTypeCode === 'UW');
    expect(nowakUW).toMatchObject({
      employeeId: 'emp-1',
      employeeName: 'Nowak Adam',
      workTimeTypeCode: 'UW',
      dateFrom: '2026-04-03',
      dateTo: '2026-04-07',
      workingDays: 2,
    });

    // Sum of workingDays = 2 + 1 + 2 = 5
    const totalWorkingDays = res.body.reduce((sum: number, r: any) => sum + r.workingDays, 0);
    expect(totalWorkingDays).toBe(5);
  });

  it('correctly bridges absence period across Wigilia (2025-12-24) and Christmas holidays without inventing hours, and splits in 2024', async () => {
    const employee = { id: 'emp-wigilia', fullName: 'Wigilia Test', firstName: 'Wigilia', lastName: 'Test' };
    const l4Type = { code: 'L4', name: 'Zwolnienie chorobowe', isAbsence: true, requiresOrder: false };

    vi.spyOn(prisma.companyCalendarDay, 'findUnique').mockResolvedValue(null);

    // 2025: 23 Dec (Tue, work), 24 Dec (Wed, Wigilia - holiday), 25 Dec (Thu, holiday), 26 Dec (Fri, holiday), 27-28 Dec (Sat-Sun, weekend), 29 Dec (Mon, work)
    // Both 23 Dec and 29 Dec have L4 reports. Because 24-28 Dec are all free (Wigilia + Christmas + Weekend), they form a single bridged period!
    vi.spyOn(prisma.workTimeReport, 'findMany').mockResolvedValue([
      { employeeId: 'emp-wigilia', employee, workTimeTypeCode: 'L4', workTimeType: l4Type, hours: 8, date: new Date('2025-12-23T00:00:00.000Z') },
      { employeeId: 'emp-wigilia', employee, workTimeTypeCode: 'L4', workTimeType: l4Type, hours: 8, date: new Date('2025-12-29T00:00:00.000Z') },
    ] as any);

    const res2025 = await authenticatedGet(
      '/api/analytics/report-absence-periods?dateFrom=2025-12-01&dateTo=2025-12-31&employeeId=emp-wigilia',
    ).expect(200);

    expect(res2025.body).toHaveLength(1);
    expect(res2025.body[0]).toMatchObject({
      employeeId: 'emp-wigilia',
      workTimeTypeCode: 'L4',
      dateFrom: '2025-12-23',
      dateTo: '2025-12-29',
      workingDays: 2, // exactly 2 working days (23rd and 29th) - 24th is bridged and does NOT invent hours
    });

    // 2024 (pre-2025): 23 Dec (Mon, work) and 27 Dec (Fri, work).
    // In 2024, 24 Dec was a normal working Tuesday. Since there was no L4 on 24 Dec, the period is SPLIT into 2 periods.
    vi.spyOn(prisma.workTimeReport, 'findMany').mockResolvedValue([
      { employeeId: 'emp-wigilia', employee, workTimeTypeCode: 'L4', workTimeType: l4Type, hours: 8, date: new Date('2024-12-23T00:00:00.000Z') },
      { employeeId: 'emp-wigilia', employee, workTimeTypeCode: 'L4', workTimeType: l4Type, hours: 8, date: new Date('2024-12-27T00:00:00.000Z') },
    ] as any);

    const res2024 = await authenticatedGet(
      '/api/analytics/report-absence-periods?dateFrom=2024-12-01&dateTo=2024-12-31&employeeId=emp-wigilia',
    ).expect(200);

    expect(res2024.body).toHaveLength(2);
    expect(res2024.body[0]).toMatchObject({
      dateFrom: '2024-12-23',
      dateTo: '2024-12-23',
      workingDays: 1,
    });
    expect(res2024.body[1]).toMatchObject({
      dateFrom: '2024-12-27',
      dateTo: '2024-12-27',
      workingDays: 1,
    });
  });

  it('v0.5.3 + v0.5.4 integration: correctly handles WKU across holidays, weekends, Wigilia 2025+, company overrides, and exports XLSX', async () => {
    const employee = { id: 'emp-wku-v053', fullName: 'WKU Integracja', firstName: 'WKU', lastName: 'Integracja' };
    const wkuType = { code: 'WKU', name: 'Służba wojskowa', isAbsence: true, requiresOrder: false };

    const calendarSpy = vi.spyOn(prisma.companyCalendarDay, 'findUnique');
    const reportSpy = vi.spyOn(prisma.workTimeReport, 'findMany');

    // 1. WKU across weekend: Friday 2026-09-04 and Monday 2026-09-07
    // Saturday and Sunday are free, so they bridge into 1 period with exactly 2 workingDays.
    calendarSpy.mockResolvedValue(null);
    reportSpy.mockResolvedValue([
      { employeeId: 'emp-wku-v053', employee, workTimeTypeCode: 'WKU', workTimeType: wkuType, hours: 8, date: new Date('2026-09-04T00:00:00.000Z') },
      { employeeId: 'emp-wku-v053', employee, workTimeTypeCode: 'WKU', workTimeType: wkuType, hours: 8, date: new Date('2026-09-07T00:00:00.000Z') },
    ] as any);

    const weekendRes = await authenticatedGet(
      '/api/analytics/report-absence-periods?dateFrom=2026-09-01&dateTo=2026-09-30&employeeId=emp-wku-v053&workTimeTypeCode=WKU',
    ).expect(200);

    expect(weekendRes.body).toHaveLength(1);
    expect(weekendRes.body[0]).toMatchObject({
      employeeId: 'emp-wku-v053',
      workTimeTypeCode: 'WKU',
      absenceType: 'WKU (Służba wojskowa)',
      dateFrom: '2026-09-04',
      dateTo: '2026-09-07',
      workingDays: 2,
    });

    // 2. WKU across statutory Polish holiday: Boże Ciało (Thursday 2026-06-04)
    // Wednesday 2026-06-03 and Friday 2026-06-05. 2026-06-04 is a statutory holiday without override.
    // Must bridge into 1 period: 2026-06-03 to 2026-06-05, workingDays = 2, no invented hours on 2026-06-04.
    reportSpy.mockResolvedValue([
      { employeeId: 'emp-wku-v053', employee, workTimeTypeCode: 'WKU', workTimeType: wkuType, hours: 8, date: new Date('2026-06-03T00:00:00.000Z') },
      { employeeId: 'emp-wku-v053', employee, workTimeTypeCode: 'WKU', workTimeType: wkuType, hours: 8, date: new Date('2026-06-05T00:00:00.000Z') },
    ] as any);

    const holidayRes = await authenticatedGet(
      '/api/analytics/report-absence-periods?dateFrom=2026-06-01&dateTo=2026-06-30&employeeId=emp-wku-v053&workTimeTypeCode=WKU',
    ).expect(200);

    expect(holidayRes.body).toHaveLength(1);
    expect(holidayRes.body[0]).toMatchObject({
      employeeId: 'emp-wku-v053',
      workTimeTypeCode: 'WKU',
      dateFrom: '2026-06-03',
      dateTo: '2026-06-05',
      workingDays: 2,
    });

    // 3. WKU across 24 December from 2025+ (Wigilia)
    // 2025: 23 Dec (Tue) and 29 Dec (Mon). 24 Dec (Wigilia) + 25-26 Dec (Christmas) + 27-28 Dec (Weekend) are free.
    // Forms 1 bridged period: 2025-12-23 to 2025-12-29, workingDays = 2.
    reportSpy.mockResolvedValue([
      { employeeId: 'emp-wku-v053', employee, workTimeTypeCode: 'WKU', workTimeType: wkuType, hours: 8, date: new Date('2025-12-23T00:00:00.000Z') },
      { employeeId: 'emp-wku-v053', employee, workTimeTypeCode: 'WKU', workTimeType: wkuType, hours: 8, date: new Date('2025-12-29T00:00:00.000Z') },
    ] as any);

    const wigiliaRes = await authenticatedGet(
      '/api/analytics/report-absence-periods?dateFrom=2025-12-01&dateTo=2025-12-31&employeeId=emp-wku-v053&workTimeTypeCode=WKU',
    ).expect(200);

    expect(wigiliaRes.body).toHaveLength(1);
    expect(wigiliaRes.body[0]).toMatchObject({
      employeeId: 'emp-wku-v053',
      workTimeTypeCode: 'WKU',
      dateFrom: '2025-12-23',
      dateTo: '2025-12-29',
      workingDays: 2,
    });

    // 4. Company calendar override precedence:
    // A. Administrator marks Boże Ciało (2026-06-04) as an explicit working day.
    // Because employee did NOT report WKU on 2026-06-04, the missing working day splits the period into 2!
    calendarSpy.mockImplementation(async ({ where }: any) =>
      where.date.toISOString().startsWith('2026-06-04')
        ? { date: where.date, isWorkingDay: true, reason: 'Praca w Boże Ciało' }
        : null,
    );
    reportSpy.mockResolvedValue([
      { employeeId: 'emp-wku-v053', employee, workTimeTypeCode: 'WKU', workTimeType: wkuType, hours: 8, date: new Date('2026-06-03T00:00:00.000Z') },
      { employeeId: 'emp-wku-v053', employee, workTimeTypeCode: 'WKU', workTimeType: wkuType, hours: 8, date: new Date('2026-06-05T00:00:00.000Z') },
    ] as any);

    const overrideWorkRes = await authenticatedGet(
      '/api/analytics/report-absence-periods?dateFrom=2026-06-01&dateTo=2026-06-30&employeeId=emp-wku-v053&workTimeTypeCode=WKU',
    ).expect(200);

    expect(overrideWorkRes.body).toHaveLength(2);
    expect(overrideWorkRes.body[0]).toMatchObject({ dateFrom: '2026-06-03', dateTo: '2026-06-03', workingDays: 1 });
    expect(overrideWorkRes.body[1]).toMatchObject({ dateFrom: '2026-06-05', dateTo: '2026-06-05', workingDays: 1 });

    // B. Administrator marks a Tuesday (2026-09-08) as a free day (e.g. company holiday).
    // WKU on Monday (2026-09-07) and Wednesday (2026-09-09) must bridge into 1 period.
    calendarSpy.mockImplementation(async ({ where }: any) =>
      where.date.toISOString().startsWith('2026-09-08')
        ? { date: where.date, isWorkingDay: false, reason: 'Dzień wolny zakładowy' }
        : null,
    );
    reportSpy.mockResolvedValue([
      { employeeId: 'emp-wku-v053', employee, workTimeTypeCode: 'WKU', workTimeType: wkuType, hours: 8, date: new Date('2026-09-07T00:00:00.000Z') },
      { employeeId: 'emp-wku-v053', employee, workTimeTypeCode: 'WKU', workTimeType: wkuType, hours: 8, date: new Date('2026-09-09T00:00:00.000Z') },
    ] as any);

    const overrideFreeRes = await authenticatedGet(
      '/api/analytics/report-absence-periods?dateFrom=2026-09-01&dateTo=2026-09-30&employeeId=emp-wku-v053&workTimeTypeCode=WKU',
    ).expect(200);

    expect(overrideFreeRes.body).toHaveLength(1);
    expect(overrideFreeRes.body[0]).toMatchObject({
      dateFrom: '2026-09-07',
      dateTo: '2026-09-09',
      workingDays: 2,
    });

    // 5. XLSX export for WKU absence periods
    vi.spyOn(prisma.employee, 'findUnique').mockResolvedValue(employee as any);
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue(wkuType as any);

    const xlsxRes = await authenticatedGet(
      '/api/analytics/export/absence-periods?dateFrom=2026-09-01&dateTo=2026-09-30&employeeId=emp-wku-v053&workTimeTypeCode=WKU',
    )
      .buffer(true)
      .parse(binaryParser)
      .expect(200)
      .expect('Content-Type', /spreadsheetml/);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsxRes.body);
    const worksheet = workbook.getWorksheet('Okresy nieobecności');
    expect(worksheet?.getRow(1).getCell(1).value).toBe('Raport: Raport okresów nieobecności');
    expect(worksheet?.getRow(8).getCell(2).value).toBe('WKU (Służba wojskowa)');
    expect(worksheet?.getRow(8).getCell(5).value).toBe(2);
  });

  it('exports the same clipped absence periods to XLSX with report metadata', async () => {
    vi.spyOn(prisma.workTimeReport, 'findMany').mockResolvedValue([{
      employeeId: EMPLOYEE_ID,
      employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' },
      workTimeTypeCode: 'L4',
      workTimeType: { code: 'L4', name: 'Zwolnienie chorobowe', isAbsence: true },
      date: new Date('2026-07-06T00:00:00.000Z'),
    }] as any);
    vi.spyOn(prisma.employee, 'findUnique').mockResolvedValue({
      id: EMPLOYEE_ID,
      fullName: 'Jan Kowalski',
      firstName: 'Jan',
      lastName: 'Kowalski',
    } as any);
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue({
      code: 'L4', name: 'Zwolnienie chorobowe', isAbsence: true,
    } as any);

    const filters = `dateFrom=2026-07-06&dateTo=2026-07-06&employeeId=${EMPLOYEE_ID}&workTimeTypeCode=L4`;
    const response = await authenticatedGet(`/api/analytics/export/absence-periods?${filters}`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200)
      .expect('Content-Type', /spreadsheetml/);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.body);
    const worksheet = workbook.getWorksheet('Okresy nieobecności');
    expect(worksheet?.getRow(1).getCell(1).value).toBe('Raport: Raport okresów nieobecności');
    expect(worksheet?.getRow(7).values).toEqual([
      undefined,
      'Imię i nazwisko',
      'Rodzaj nieobecności',
      'Od',
      'Do',
      'Liczba dni nieobecności',
    ]);
    expect(worksheet?.getRow(8).getCell(5).value).toBe(1);
  });

  it('filters report-by-order by status case-insensitively', async () => {
    const orderSpy = vi.spyOn(prisma.order, 'findMany').mockResolvedValue([]);

    await authenticatedGet('/api/analytics/report-by-order?status=open').expect(200);
    expect(orderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'OPEN',
        }),
      }),
    );

    await authenticatedGet('/api/analytics/report-by-order?status=SUSPENDED').expect(200);
    expect(orderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'SUSPENDED',
        }),
      }),
    );

    await authenticatedGet('/api/analytics/report-by-order?status=').expect(200);
    expect(orderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: undefined,
        }),
      }),
    );
  });

  it('includes quantity and filters orders by onlyWithHours=true', async () => {
    vi.spyOn(prisma.order, 'findMany').mockResolvedValue([
      {
        orderNumber: 'ZL-001',
        productName: 'Produkt 1',
        productCode: 'P-001',
        plannedHours: 10,
        quantity: 50,
        quantityUnit: 'szt.',
        status: 'OPEN',
        reports: [{ hours: 8 }],
      },
      {
        orderNumber: 'ZL-002',
        productName: 'Produkt 2',
        productCode: 'P-002',
        plannedHours: 10,
        quantity: 100,
        quantityUnit: 'szt.',
        status: 'OPEN',
        reports: [],
      },
    ] as any);

    const allRes = await authenticatedGet('/api/analytics/report-by-order').expect(200);
    expect(allRes.body.length).toBe(2);
    expect(allRes.body[0].quantity).toBe(50);
    expect(allRes.body[0].quantityUnit).toBe('szt.');

    const filteredRes = await authenticatedGet('/api/analytics/report-by-order?onlyWithHours=true').expect(200);
    expect(filteredRes.body.length).toBe(1);
    expect(filteredRes.body[0].orderNumber).toBe('ZL-001');
  });

  it('keeps period hours while calculating order progress cumulatively through the report end', async () => {
    const july = new Date('2026-07-01T00:00:00.000Z');
    const august = new Date('2026-08-01T00:00:00.000Z');
    const orders = [
      {
        orderNumber: 'ZL-CUMULATIVE-OPEN', productName: 'Wielomiesięczne', productCode: null,
        accountingAccount: null, quantity: null, quantityUnit: 'szt.', plannedHours: 100,
        orderDate: july, status: 'OPEN', completionDate: null,
        reports: [
          { hours: 30, date: new Date('2026-07-15T00:00:00.000Z') },
          { hours: 20, date: new Date('2026-08-15T00:00:00.000Z') },
          { hours: 10, date: new Date('2026-09-15T00:00:00.000Z') },
          { hours: 8, date: new Date('2026-08-20T00:00:00.000Z'), deletedAt: new Date('2026-08-21T00:00:00.000Z') },
        ],
      },
      {
        orderNumber: 'ZL-CURRENT-CLOSED', productName: 'Tylko sierpień', productCode: null,
        accountingAccount: null, quantity: null, quantityUnit: 'szt.', plannedHours: 10,
        orderDate: august, status: 'CLOSED', completionDate: new Date('2026-08-31T00:00:00.000Z'),
        reports: [{ hours: 10, date: new Date('2026-08-10T00:00:00.000Z') }],
      },
      {
        orderNumber: 'ZL-CUMULATIVE-SUSPENDED', productName: 'Wstrzymane', productCode: null,
        accountingAccount: null, quantity: null, quantityUnit: 'szt.', plannedHours: 50,
        orderDate: july, status: 'SUSPENDED', completionDate: null,
        reports: [{ hours: 15, date: new Date('2026-07-15T00:00:00.000Z') }, { hours: 3, date: new Date('2026-08-15T00:00:00.000Z') }],
      },
      {
        orderNumber: 'ZL-HISTORICAL-ONLY', productName: 'Bez godzin w sierpniu', productCode: null,
        accountingAccount: null, quantity: null, quantityUnit: 'szt.', plannedHours: 10,
        orderDate: july, status: 'OPEN', completionDate: null,
        reports: [{ hours: 6, date: new Date('2026-07-15T00:00:00.000Z') }],
      },
      {
        orderNumber: 'ZL-ZERO-PLAN', productName: 'Plan zerowy', productCode: null,
        accountingAccount: null, quantity: null, quantityUnit: 'szt.', plannedHours: 0,
        orderDate: july, status: 'OPEN', completionDate: null,
        reports: [{ hours: 10, date: new Date('2026-07-15T00:00:00.000Z') }, { hours: 5, date: new Date('2026-08-15T00:00:00.000Z') }],
      },
    ];
    const orderQuery = vi.spyOn(prisma.order, 'findMany').mockImplementation(async (args: any) => {
      const reportEnd = args.include.reports.where.date.lte;
      return orders.map(order => ({
        ...order,
        reports: order.reports.filter(report =>
          !report.deletedAt && (!reportEnd || report.date <= reportEnd),
        ),
      })) as any;
    });

    const range = 'dateFrom=2026-08-01&dateTo=2026-08-31';
    const response = await authenticatedGet(`/api/analytics/report-by-order?${range}`).expect(200);
    const cumulative = response.body.find((row: any) => row.orderNumber === 'ZL-CUMULATIVE-OPEN');
    expect(cumulative).toMatchObject({ actualHours: 20, deviation: 50, percent: 50, status: 'OPEN' });
    expect(orderQuery).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        reports: expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null, date: { lte: new Date('2026-08-31T00:00:00.000Z') } }),
        }),
      }),
    }));
    expect(response.body.find((row: any) => row.orderNumber === 'ZL-CURRENT-CLOSED'))
      .toMatchObject({ actualHours: 10, deviation: 0, percent: 100, status: 'CLOSED' });
    expect(response.body.find((row: any) => row.orderNumber === 'ZL-CUMULATIVE-SUSPENDED'))
      .toMatchObject({ actualHours: 3, deviation: 32, percent: 36, status: 'SUSPENDED' });
    expect(response.body.find((row: any) => row.orderNumber === 'ZL-ZERO-PLAN'))
      .toMatchObject({ actualHours: 5, deviation: -15, percent: 0 });

    const xlsxResponse = await authenticatedGet(`/api/analytics/export/by-order?${range}`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsxResponse.body);
    const worksheet = workbook.getWorksheet('Zlecenia')!;
    const headerRowNumber = worksheet.getColumn(1).values.findIndex(value => value === 'Numer zlecenia');
    const xlsxCumulativeRow = (worksheet.getRows(headerRowNumber + 1, orders.length) || [])
      .find(row => row.getCell(1).value === 'ZL-CUMULATIVE-OPEN')!;
    expect([xlsxCumulativeRow.getCell(7).value, xlsxCumulativeRow.getCell(8).value, xlsxCumulativeRow.getCell(9).value])
      .toEqual([20, 50, 50]);

    const onlyWithHours = await authenticatedGet(`/api/analytics/report-by-order?${range}&onlyWithHours=true`).expect(200);
    expect(onlyWithHours.body.some((row: any) => row.orderNumber === 'ZL-HISTORICAL-ONLY')).toBe(false);

    const closure = await authenticatedGet(`/api/analytics/report-by-order?${range}&closureReport=true`).expect(200);
    expect(closure.body.find((row: any) => row.orderNumber === 'ZL-CUMULATIVE-OPEN'))
      .toMatchObject({ actualHours: 20, deviation: 50, percent: 50 });
  });

  describe('closure report by order', () => {
    it.each([
      ['OPEN with hours in range is visible', 'ZL-001', true, 5],
      ['OPEN without hours in range is hidden', 'ZL-002', false, undefined],
      ['CLOSED completed in range with hours is visible', 'ZL-003', true, 4],
      ['CLOSED completed in range without hours is visible with zero', 'ZL-004', true, 0],
      ['CLOSED completed before range is hidden', 'ZL-005', false, undefined],
      ['CLOSED completed after range is hidden', 'ZL-006', false, undefined],
      ['CLOSED with hours only outside range is visible with zero', 'ZL-007', true, 0],
      ['deleted work-time entries do not increase the total', 'ZL-008', true, 0],
      ['deleted order is hidden', 'ZL-009', false, undefined],
      ['SUSPENDED order is hidden', 'ZL-010', false, undefined],
      ['completionDate equal to dateFrom is included', 'ZL-011', true, 0],
      ['completionDate equal to dateTo is included', 'ZL-012', true, 0],
    ])('%s', async (_name, orderNumber, visible, expectedHours) => {
      mockOrderReportQuery();

      const response = await authenticatedGet(`/api/analytics/report-by-order?${closureRange}`).expect(200);
      const row = response.body.find((item: any) => item.orderNumber === orderNumber);

      expect(Boolean(row)).toBe(visible);
      if (visible) expect(row.actualHours).toBe(expectedHours);
    });

    it('keeps the standard report behavior when closureReport is absent', async () => {
      const querySpy = mockOrderReportQuery();

      const response = await authenticatedGet('/api/analytics/report-by-order?dateFrom=2026-08-01&dateTo=2026-08-31').expect(200);

      expect(response.body.some((row: any) => row.orderNumber === 'ZL-002')).toBe(true);
      expect(response.body.some((row: any) => row.orderNumber === 'ZL-010')).toBe(true);
      expect(querySpy).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ OR: undefined }),
      }));
    });

    it('exports exactly the JSON rows, including zero-hour closed orders', async () => {
      mockOrderReportQuery();
      vi.spyOn(prisma.workTimeReport, 'findMany').mockImplementation(async (args: any) => {
        if (args?.where?.workTimeType?.isAbsence) {
          return [];
        }
        return [
          {
            employeeId: EMPLOYEE_ID,
            employee: { fullName: 'Jan Kowalski' },
            hours: 5,
            workTimeTypeCode: 'G',
            workTimeType: { code: 'G', name: 'Standardowe', isAbsence: false, requiresOrder: true },
            orderId: 'open-hours',
            date: new Date('2026-08-10T00:00:00.000Z'),
          },
          {
            employeeId: EMPLOYEE_ID,
            employee: { fullName: 'Jan Kowalski' },
            hours: 4,
            workTimeTypeCode: 'G',
            workTimeType: { code: 'G', name: 'Standardowe', isAbsence: false, requiresOrder: true },
            orderId: 'closed-hours',
            date: new Date('2026-08-12T00:00:00.000Z'),
          },
        ] as any;
      });

      const jsonResponse = await authenticatedGet(`/api/analytics/report-by-order?${closureRange}`).expect(200);
      const xlsxResponse = await authenticatedGet(`/api/analytics/export/by-order?${closureRange}`)
        .buffer(true)
        .parse(binaryParser)
        .expect(200)
        .expect('Content-Type', /spreadsheetml/);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(xlsxResponse.body);
      const worksheet = workbook.getWorksheet('Zlecenia')!;
      const headerRowNumber = worksheet.getColumn(1).values.findIndex(value => value === 'Numer zlecenia');
      const exportedRows = worksheet.getRows(headerRowNumber + 1, jsonResponse.body.length) || [];

      expect(exportedRows.map(row => ({
        orderNumber: row.getCell(1).value,
        actualHours: row.getCell(7).value,
        completionDate: row.getCell(11).value,
      }))).toEqual(jsonResponse.body.map((row: any) => ({
        orderNumber: row.orderNumber,
        actualHours: row.actualHours,
        completionDate: row.completionDate || '-',
      })));
      expect(jsonResponse.body.find((row: any) => row.orderNumber === 'ZL-004').actualHours).toBe(0);
    });

    it('rejects an invalid closureReport value', async () => {
      await authenticatedGet('/api/analytics/report-by-order?closureReport=yes&dateFrom=2026-08-01&dateTo=2026-08-31')
        .expect(400)
        .expect(({ body }) => expect(body.code).toBe('INVALID_CLOSURE_REPORT_PARAMS'));
    });

    it('requires a valid inclusive date range in closure mode', async () => {
      await authenticatedGet('/api/analytics/report-by-order?closureReport=true&dateFrom=2026-08-31&dateTo=2026-08-01')
        .expect(400)
        .expect(({ body }) => expect(body.code).toBe('INVALID_CLOSURE_REPORT_PARAMS'));
    });
  });

  it('calculates sumaBezNadgodzin and sorts employees by last name', async () => {
    vi.spyOn(prisma.workTimeReport, 'findMany').mockResolvedValue([
      {
        employeeId: '1',
        employee: { fullName: 'Adam Adamowski', firstName: 'Adam', lastName: 'Adamowski' },
        hours: 8,
        workTimeTypeCode: 'G',
        workTimeType: { name: 'Standardowe' },
      },
      {
        employeeId: '1',
        employee: { fullName: 'Adam Adamowski', firstName: 'Adam', lastName: 'Adamowski' },
        hours: 2,
        workTimeTypeCode: 'NDR',
        workTimeType: { name: 'Nadgodziny' },
      },
      {
        employeeId: '2',
        employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' },
        hours: 8,
        workTimeTypeCode: 'G',
        workTimeType: { name: 'Standardowe' },
      },
    ] as any);

    const res = await authenticatedGet('/api/analytics/report-by-employee').expect(200);
    expect(res.body.length).toBe(2);
    expect(res.body[0].employeeName).toBe('Adamowski Adam');
    expect(res.body[0].suma).toBe(10);
    expect(res.body[0].sumaBezNadgodzin).toBe(8);

    expect(res.body[1].employeeName).toBe('Kowalski Jan');
    expect(res.body[1].suma).toBe(8);
    expect(res.body[1].sumaBezNadgodzin).toBe(8);
  });

  it('correctly formats employee name as Nazwisko Imię and handles fallbacks without null, undefined, or double spaces', () => {
    expect(formatEmployeeName({ firstName: 'Jan', lastName: 'Kowalski' })).toBe('Kowalski Jan');
    expect(formatEmployeeName({ firstName: 'Jan', lastName: null })).toBe('Jan');
    expect(formatEmployeeName({ firstName: null, lastName: 'Kowalski' })).toBe('Kowalski');
    expect(formatEmployeeName({ firstName: '  Jan  ', lastName: '  Kowalski  ' })).toBe('Kowalski Jan');
    expect(formatEmployeeName({ firstName: null, lastName: null, fullName: 'Jan Kowalski' })).toBe('Jan Kowalski');
    expect(formatEmployeeName({ firstName: null, lastName: null, fullName: null })).toBe('Brak danych');

    const formatted = formatEmployeeName({ firstName: 'Jan', lastName: 'Kowalski' });
    expect(formatted).not.toContain('undefined');
    expect(formatted).not.toContain('null');
    expect(formatted).not.toContain('  ');
  });

  describe('GET /api/analytics/dashboard', () => {
    it('returns openOrdersCount, closedThisMonthCount, and excludes legacy fields', async () => {
      const now = new Date();
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);

      vi.spyOn(prisma.order, 'count').mockImplementation((args: any) => {
        if (args?.where?.status === 'OPEN') {
          return Promise.resolve(3) as any;
        }
        if (args?.where?.status === 'CLOSED') {
          return Promise.resolve(2) as any;
        }
        return Promise.resolve(0) as any;
      });

      vi.spyOn(prisma.workTimeReport, 'aggregate').mockResolvedValue({
        _sum: { hours: 16 },
      } as any);

      vi.spyOn(prisma.order, 'findMany').mockResolvedValue([]);

      const response = await authenticatedGet('/api/analytics/dashboard').expect(200);

      expect(response.body).toHaveProperty('openOrdersCount', 3);
      expect(response.body).toHaveProperty('closedThisMonthCount', 2);
      expect(response.body).toHaveProperty('hoursToday', 16);
      expect(response.body).toHaveProperty('hoursMonth', 16);
      expect(response.body).toHaveProperty('ordersExceeding');
      expect(response.body).toHaveProperty('ordersApproaching');

      expect(response.body).not.toHaveProperty('activeOrdersCount');
      expect(response.body).not.toHaveProperty('suspendedOrdersCount');
      expect(response.body).not.toHaveProperty('closedOrdersCount');
      expect(response.body).not.toHaveProperty('recentOrders');
    });

    it('correctly categorizes >100%, 80-100%, ignores <=80%, suspended/closed orders, deleted reports, plannedHours=0, and analyzes >5 orders with sorting', async () => {
      // Mock count call
      vi.spyOn(prisma.order, 'count').mockResolvedValue(0 as any);
      vi.spyOn(prisma.workTimeReport, 'aggregate').mockResolvedValue({ _sum: { hours: 0 } } as any);

      // Create 7 test orders to verify analyze >5 orders logic
      const mockOrders = [
        {
          id: 'o1',
          orderNumber: 'ZL-101',
          productName: 'Prod 1',
          plannedHours: 10,
          status: 'OPEN',
          isActive: true,
          deletedAt: null,
          reports: [{ hours: 12 }], // 120% -> ordersExceeding
        },
        {
          id: 'o2',
          orderNumber: 'ZL-102',
          productName: 'Prod 2',
          plannedHours: 10,
          status: 'OPEN',
          isActive: true,
          deletedAt: null,
          reports: [{ hours: 8 }], // 80% -> ordersApproaching
        },
        {
          id: 'o3',
          orderNumber: 'ZL-103',
          productName: 'Prod 3',
          plannedHours: 10,
          status: 'OPEN',
          isActive: true,
          deletedAt: null,
          reports: [{ hours: 10 }], // 100% -> ordersApproaching
        },
        {
          id: 'o4',
          orderNumber: 'ZL-104',
          productName: 'Prod 4',
          plannedHours: 0, // plannedHours = 0 -> 0% percent
          status: 'OPEN',
          isActive: true,
          deletedAt: null,
          reports: [{ hours: 5 }],
        },
        {
          id: 'o5',
          orderNumber: 'ZL-105',
          productName: 'Prod 5',
          plannedHours: 10,
          status: 'OPEN',
          isActive: true,
          deletedAt: null,
          reports: [{ hours: 15 }], // 150% -> ordersExceeding
        },
        {
          id: 'o6',
          orderNumber: 'ZL-106',
          productName: 'Prod 6',
          plannedHours: 10,
          status: 'OPEN',
          isActive: true,
          deletedAt: null,
          reports: [{ hours: 12 }], // 120% -> ordersExceeding (tied percent with ZL-101)
        },
        {
          id: 'o7',
          orderNumber: 'ZL-107',
          productName: 'Prod 7',
          plannedHours: 10,
          status: 'OPEN',
          isActive: true,
          deletedAt: null,
          reports: [{ hours: 5 }], // 50% -> neither
        },
      ];

      vi.spyOn(prisma.order, 'findMany').mockResolvedValue(mockOrders as any);

      const response = await authenticatedGet('/api/analytics/dashboard').expect(200);

      const { ordersExceeding, ordersApproaching } = response.body;

      // Exceeding should have o5 (150%), o1 (120%), o6 (120%)
      expect(ordersExceeding.length).toBe(3);
      expect(ordersExceeding[0].orderNumber).toBe('ZL-105');
      expect(ordersExceeding[0].percent).toBe(150);
      // Tie breaker for 120%: ZL-101 comes before ZL-106 ascending
      expect(ordersExceeding[1].orderNumber).toBe('ZL-101');
      expect(ordersExceeding[2].orderNumber).toBe('ZL-106');

      // Approaching should have o3 (100%), o2 (80%)
      expect(ordersApproaching.length).toBe(2);
      expect(ordersApproaching[0].orderNumber).toBe('ZL-103');
      expect(ordersApproaching[0].percent).toBe(100);
      expect(ordersApproaching[1].orderNumber).toBe('ZL-102');
      expect(ordersApproaching[1].percent).toBe(80);

      // Verify >100% order (ZL-105, ZL-101, ZL-106) is NOT in ordersApproaching
      const approachingNumbers = ordersApproaching.map((o: any) => o.orderNumber);
      expect(approachingNumbers).not.toContain('ZL-105');
      expect(approachingNumbers).not.toContain('ZL-101');
    });

    it('calculates hoursToday and hoursMonth summing ALL active work time entries (order work, L4, urlop, entries without orderId) without filtering by orderId or requiresOrder', async () => {
      vi.spyOn(prisma.order, 'count').mockResolvedValue(0 as any);
      vi.spyOn(prisma.order, 'findMany').mockResolvedValue([]);

      const aggregateSpy = vi.spyOn(prisma.workTimeReport, 'aggregate').mockResolvedValue({
        _sum: { hours: 24 },
      } as any);

      const response = await authenticatedGet('/api/analytics/dashboard').expect(200);

      expect(response.body.hoursToday).toBe(24);
      expect(response.body.hoursMonth).toBe(24);

      // Verify aggregate where clause requires deletedAt: null and date range, but NO orderId or requiresOrder filters
      const aggregateCalls = aggregateSpy.mock.calls;
      expect(aggregateCalls.length).toBeGreaterThanOrEqual(2);

      const todayWhere = aggregateCalls[0][0].where;
      expect(todayWhere).toHaveProperty('deletedAt', null);
      expect(todayWhere).toHaveProperty('date');
      expect(todayWhere).not.toHaveProperty('orderId');
      expect(todayWhere).not.toHaveProperty('workTimeType');

      const monthWhere = aggregateCalls[1][0].where;
      expect(monthWhere).toHaveProperty('deletedAt', null);
      expect(monthWhere).toHaveProperty('date');
      expect(monthWhere).not.toHaveProperty('orderId');
      expect(monthWhere).not.toHaveProperty('workTimeType');
    });
  });

  describe('Detailed report (/report-detailed and /export/detailed)', () => {
    const mockDetailedReports = [
      {
        id: 'rep-1',
        date: new Date('2026-08-10T00:00:00.000Z'),
        employeeId: EMPLOYEE_ID,
        orderId: 'order-111',
        hours: 8,
        workTimeTypeCode: 'G',
        missingCard: false,
        createdAt: new Date('2026-08-10T08:00:00.000Z'),
        deletedAt: null,
        employee: { fullName: 'Jan Kowalski' },
        order: { id: 'order-111', orderNumber: '530-8-49', productName: 'Forma zewnętrzna', productCode: 'P-530', accountingAccount: 'KK-1' },
        createdByUser: { fullName: 'Admin' },
      },
      {
        id: 'rep-2',
        date: new Date('2026-08-11T00:00:00.000Z'),
        employeeId: 'employee-2',
        orderId: 'order-222',
        hours: 6,
        workTimeTypeCode: 'G',
        missingCard: false,
        createdAt: new Date('2026-08-11T08:00:00.000Z'),
        deletedAt: null,
        employee: { fullName: 'Anna Nowak' },
        order: { id: 'order-222', orderNumber: '530-8-04', productName: 'Inny produkt', productCode: 'P-531', accountingAccount: 'KK-2' },
        createdByUser: { fullName: 'Admin' },
      },
      {
        id: 'rep-3',
        date: new Date('2026-08-12T00:00:00.000Z'),
        employeeId: EMPLOYEE_ID,
        orderId: null,
        hours: 8,
        workTimeTypeCode: 'UW',
        missingCard: false,
        createdAt: new Date('2026-08-12T08:00:00.000Z'),
        deletedAt: null,
        employee: { fullName: 'Jan Kowalski' },
        order: null,
        createdByUser: { fullName: 'Admin' },
      },
    ];

    const mockDetailedSpy = () => vi.spyOn(prisma.workTimeReport, 'findMany').mockImplementation(async (args: any) => {
      const { employeeId, orderId, order, date, deletedAt } = args?.where || {};
      return mockDetailedReports.filter((r) => {
        if (deletedAt !== undefined && r.deletedAt !== deletedAt) return false;
        if (employeeId && r.employeeId !== employeeId) return false;
        if (orderId && r.orderId !== orderId) return false;
        if (order?.orderNumber?.contains) {
          if (!r.order?.orderNumber.toLowerCase().includes(order.orderNumber.contains.toLowerCase())) return false;
        }
        if (date?.gte && r.date < date.gte) return false;
        if (date?.lte && r.date > date.lte) return false;
        return true;
      }) as any;
    });

    it('returns all reports including without order when no order filter is provided', async () => {
      mockDetailedSpy();

      const res = await authenticatedGet('/api/analytics/report-detailed').expect(200);
      expect(res.body.length).toBe(3);
      expect(res.body.some((r: any) => r.orderNumber === '530-8-49')).toBe(true);
      expect(res.body.some((r: any) => r.orderNumber === '530-8-04')).toBe(true);
      expect(res.body.some((r: any) => r.orderNumber === '-')).toBe(true);
    });

    it('filters strictly by orderId and excludes other orders and entries without order (Brak zlecenia)', async () => {
      const findSpy = mockDetailedSpy();

      const res = await authenticatedGet('/api/analytics/report-detailed?orderId=order-111').expect(200);
      expect(findSpy).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          orderId: 'order-111',
        }),
      }));

      expect(res.body.length).toBe(1);
      expect(res.body[0].orderNumber).toBe('530-8-49');
      expect(res.body[0].productCode).toBe('P-530');
      expect(res.body.some((r: any) => r.orderNumber === '530-8-04')).toBe(false);
      expect(res.body.some((r: any) => r.orderNumber === '-')).toBe(false);
    });

    it('filters simultaneously by orderId and employeeId', async () => {
      mockDetailedSpy();

      // Jan Kowalski on order-111 -> 1 result
      const resMatch = await authenticatedGet(`/api/analytics/report-detailed?orderId=order-111&employeeId=${EMPLOYEE_ID}`).expect(200);
      expect(resMatch.body.length).toBe(1);
      expect(resMatch.body[0].employeeName).toBe('Jan Kowalski');
      expect(resMatch.body[0].orderNumber).toBe('530-8-49');

      // Anna Nowak on order-111 -> 0 results
      const resNoMatch = await authenticatedGet('/api/analytics/report-detailed?orderId=order-111&employeeId=employee-2').expect(200);
      expect(resNoMatch.body.length).toBe(0);
    });

    it('filters simultaneously by orderId, employeeId and date range', async () => {
      mockDetailedSpy();

      // Range covers 2026-08-10 -> 1 result
      const resInRange = await authenticatedGet(
        `/api/analytics/report-detailed?orderId=order-111&employeeId=${EMPLOYEE_ID}&dateFrom=2026-08-01&dateTo=2026-08-10`,
      ).expect(200);
      expect(resInRange.body.length).toBe(1);

      // Range does not cover 2026-08-10 -> 0 results
      const resOutOfRange = await authenticatedGet(
        `/api/analytics/report-detailed?orderId=order-111&employeeId=${EMPLOYEE_ID}&dateFrom=2026-08-11&dateTo=2026-08-20`,
      ).expect(200);
      expect(resOutOfRange.body.length).toBe(0);
    });

    it('exports detailed report to XLSX with order filter and metadata', async () => {
      mockDetailedSpy();
      vi.spyOn(prisma.order, 'findUnique').mockResolvedValue({
        id: 'order-111',
        orderNumber: '530-8-49',
        productName: 'Forma zewnętrzna',
      } as any);

      const xlsxResponse = await authenticatedGet('/api/analytics/export/detailed?orderId=order-111')
        .buffer(true)
        .parse(binaryParser)
        .expect(200)
        .expect('Content-Type', /spreadsheetml/);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(xlsxResponse.body);
      const worksheet = workbook.getWorksheet('Szczegóły');
      expect(worksheet).toBeDefined();

      expect(worksheet?.getRow(1).getCell(1).value).toBe('Raport: Szczegółowy raport czasu pracy');
      expect(worksheet?.getRow(4).getCell(1).value).toBe('Zlecenie: 530-8-49');

      // Header row
      expect(worksheet?.getRow(7).values).toEqual([
        undefined,
        'Data',
        'Pracownik',
        'Numer zlecenia',
        'Numer produktu',
        'Nazwa produktu',
        'Konto księgowe',
        'Liczba godzin',
        'Typ czasu pracy',
        'Wprowadził użytkownik',
        'Data wpisu w bazie',
      ]);

      // Only 1 row for order-111
      expect(worksheet?.getRow(8).getCell(3).value).toBe('530-8-49');
      expect(worksheet?.getRow(8).getCell(4).value).toBe('P-530');
      expect(worksheet?.getRow(9).getCell(3).value).toBeNull();
    });
  });

  describe('Closure control summary', () => {
    it('calculates matched control sums for client August 2026 dataset (3168 orders + 232 L4 + 832 UW + 8 UZ + 16 custom OP = 4256)', async () => {
      // 1. Mock orders with 3168 total hours in range
      vi.spyOn(prisma.order, 'findMany').mockResolvedValue([
        {
          id: 'ord-1',
          orderNumber: 'ZL-MAIN',
          productName: 'Główny produkt',
          productCode: 'P-01',
          accountingAccount: 'K-100',
          plannedHours: 4000,
          quantity: 100,
          quantityUnit: 'szt.',
          status: 'OPEN',
          completionDate: null,
          deletedAt: null,
          reports: [
            { hours: 3168, date: new Date('2026-08-15T00:00:00.000Z'), deletedAt: null },
          ],
        },
      ] as any);

      // 2. Mock workTimeTypes with isAbsence=true (including standard and custom OP type)
      vi.spyOn(prisma.workTimeType, 'findMany').mockResolvedValue([
        { code: 'L4', name: 'Zwolnienie lekarskie', isAbsence: true, requiresOrder: false },
        { code: 'UW', name: 'Urlop wypoczynkowy', isAbsence: true, requiresOrder: false },
        { code: 'UŻ', name: 'Urlop na żądanie', isAbsence: true, requiresOrder: false },
        { code: 'OP', name: 'Opieka nad dzieckiem art. 188', isAbsence: true, requiresOrder: false },
        { code: 'G', name: 'Standardowe', isAbsence: false, requiresOrder: true },
      ] as any);

      // 3. Mock workTimeReport entries: 232 L4 + 832 UW + 8 UŻ + 16 OP, plus orders and employee pivot
      vi.spyOn(prisma.workTimeReport, 'findMany').mockImplementation(async (args: any) => {
        // Query for absence reports
        if (args?.where?.workTimeType?.isAbsence) {
          return [
            { workTimeTypeCode: 'L4', hours: 232 },
            { workTimeTypeCode: 'UW', hours: 832 },
            { workTimeTypeCode: 'UŻ', hours: 8 },
            { workTimeTypeCode: 'OP', hours: 16 },
          ] as any;
        }

        // Query for employee report rows (total employee hours)
        return [
          {
            employeeId: 'emp-1',
            employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' },
            hours: 3168,
            workTimeTypeCode: 'G',
            workTimeType: { name: 'Standardowe' },
          },
          {
            employeeId: 'emp-2',
            employee: { fullName: 'Adam Nowak', firstName: 'Adam', lastName: 'Nowak' },
            hours: 232,
            workTimeTypeCode: 'L4',
            workTimeType: { name: 'Zwolnienie lekarskie' },
          },
          {
            employeeId: 'emp-3',
            employee: { fullName: 'Ewa Wiśniewska', firstName: 'Ewa', lastName: 'Wiśniewska' },
            hours: 832,
            workTimeTypeCode: 'UW',
            workTimeType: { name: 'Urlop wypoczynkowy' },
          },
          {
            employeeId: 'emp-4',
            employee: { fullName: 'Piotr Zieliński', firstName: 'Piotr', lastName: 'Zieliński' },
            hours: 8,
            workTimeTypeCode: 'UŻ',
            workTimeType: { name: 'Urlop na żądanie' },
          },
          {
            employeeId: 'emp-5',
            employee: { fullName: 'Marek Kozłowski', firstName: 'Marek', lastName: 'Kozłowski' },
            hours: 16,
            workTimeTypeCode: 'OP',
            workTimeType: { name: 'Opieka nad dzieckiem art. 188' },
          },
        ] as any;
      });

      const response = await authenticatedGet('/api/analytics/closure-control-summary?dateFrom=2026-08-01&dateTo=2026-08-31').expect(200);

      expect(response.body).toEqual({
        ordersHours: 3168,
        absences: [
          { code: 'L4', name: 'Zwolnienie lekarskie', hours: 232 },
          { code: 'UW', name: 'Urlop wypoczynkowy', hours: 832 },
          { code: 'UŻ', name: 'Urlop na żądanie', hours: 8 },
          { code: 'OP', name: 'Opieka nad dzieckiem art. 188', hours: 16 },
        ],
        totalAbsenceHours: 1088,
        totalSettledHours: 4256,
        totalEmployeeHours: 4256,
        difference: 0,
        status: 'MATCHED',
        statusLabel: 'Zgodne',
      });
    });

    it('returns MISMATCHED status and negative diagnostics for Direction A (employee > settled, difference < 0)', async () => {
      // Orders: 100h
      vi.spyOn(prisma.order, 'findMany').mockResolvedValue([
        {
          id: 'ord-1',
          orderNumber: 'ZL-100',
          productName: 'Produkt',
          productCode: 'P-1',
          accountingAccount: 'K-1',
          plannedHours: 100,
          quantity: 1,
          quantityUnit: 'szt.',
          status: 'OPEN',
          completionDate: null,
          deletedAt: null,
          reports: [{ hours: 100, date: new Date('2026-08-10T00:00:00.000Z'), deletedAt: null }],
        },
      ] as any);

      // WorkTimeTypes: L4 (absence), SZK (non-absence, no order)
      vi.spyOn(prisma.workTimeType, 'findMany').mockResolvedValue([
        { code: 'L4', name: 'Zwolnienie', isAbsence: true, requiresOrder: false },
        { code: 'SZK', name: 'Szkolenie', isAbsence: false, requiresOrder: false },
      ] as any);

      // Reports: 16h L4, but employee also has 8h SZK (unsettled non-absence without order)
      vi.spyOn(prisma.workTimeReport, 'findMany').mockImplementation(async (args: any) => {
        if (args?.where?.workTimeType?.isAbsence) {
          return [{ workTimeTypeCode: 'L4', hours: 16 }] as any;
        }

        // Diagnostic query - has include with employee, order, workTimeType
        if (args?.include?.employee && args?.include?.order && args?.include?.workTimeType) {
          return [
            {
              employeeId: 'emp-1',
              employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' },
              hours: 8,
              workTimeTypeCode: 'SZK',
              workTimeType: { code: 'SZK', name: 'Szkolenie', isAbsence: false, requiresOrder: false },
              orderId: null,
              order: null,
              date: new Date('2026-08-15T00:00:00.000Z'),
            },
          ] as any;
        }

        return [
          {
            employeeId: 'emp-1',
            employee: { fullName: 'Jan Kowalski' },
            hours: 100,
            workTimeTypeCode: 'G',
            workTimeType: { name: 'Standardowe' },
          },
          {
            employeeId: 'emp-1',
            employee: { fullName: 'Jan Kowalski' },
            hours: 16,
            workTimeTypeCode: 'L4',
            workTimeType: { name: 'Zwolnienie' },
          },
          {
            employeeId: 'emp-1',
            employee: { fullName: 'Jan Kowalski' },
            hours: 8,
            workTimeTypeCode: 'SZK',
            workTimeType: { name: 'Szkolenie' },
          },
        ] as any;
      });

      const response = await authenticatedGet('/api/analytics/closure-control-summary?dateFrom=2026-08-01&dateTo=2026-08-31').expect(200);

      // Settled: 100 orders + 16 L4 = 116
      // Employee total: 100 + 16 + 8 = 124
      // Difference: 116 - 124 = -8
      expect(response.body.ordersHours).toBe(100);
      expect(response.body.totalAbsenceHours).toBe(16);
      expect(response.body.totalSettledHours).toBe(116);
      expect(response.body.totalEmployeeHours).toBe(124);
      expect(response.body.difference).toBe(-8);
      expect(response.body.status).toBe('MISMATCHED');
      expect(response.body.statusLabel).toBe('Niezgodne');

      // Assert diagnostics array is returned and explains difference
      expect(response.body.diagnostics).toBeDefined();
      expect(response.body.diagnostics.length).toBe(1);
      expect(response.body.diagnostics[0]).toMatchObject({
        employeeName: 'Kowalski Jan',
        date: '2026-08-15',
        workTimeTypeCode: 'SZK',
        hours: 8,
        orderNumber: null,
        reason: 'Typ nie jest nieobecnością i nie wymaga zlecenia',
        contribution: -8,
      });

      const sumContributions = response.body.diagnostics.reduce((sum: number, d: any) => sum + d.contribution, 0);
      expect(sumContributions).toBe(response.body.difference);
    });

    it('returns MISMATCHED status and positive diagnostics for Direction B (settled > employee, difference > 0)', async () => {
      // Order in closure: 100h
      vi.spyOn(prisma.order, 'findMany').mockImplementation(async (args: any) => {
        if (args?.where?.OR || !args?.where?.orderNumber) {
          return [
            {
              id: 'ord-1',
              orderNumber: 'ZL-100',
              productName: 'Produkt',
              productCode: 'P-1',
              accountingAccount: 'K-1',
              plannedHours: 100,
              quantity: 1,
              quantityUnit: 'szt.',
              status: 'OPEN',
              completionDate: null,
              deletedAt: null,
              reports: [{ hours: 100, date: new Date('2026-08-10T00:00:00.000Z'), deletedAt: null }],
            },
          ] as any;
        }
        return [] as any;
      });

      // WorkTimeTypes: UW (absence)
      vi.spyOn(prisma.workTimeType, 'findMany').mockResolvedValue([
        { code: 'UW', name: 'Urlop wypoczynkowy', isAbsence: true, requiresOrder: false },
      ] as any);

      // Reports: 16h UW tied to ord-1 (counted in orders AND in absence -> double counted)
      vi.spyOn(prisma.workTimeReport, 'findMany').mockImplementation(async (args: any) => {
        if (args?.where?.workTimeType?.isAbsence) {
          return [{ workTimeTypeCode: 'UW', hours: 16 }] as any;
        }

        // Diagnostic query
        if (args?.include?.employee && args?.include?.order && args?.include?.workTimeType) {
          return [
            {
              employeeId: 'emp-1',
              employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' },
              hours: 16,
              workTimeTypeCode: 'UW',
              workTimeType: { code: 'UW', name: 'Urlop wypoczynkowy', isAbsence: true, requiresOrder: false },
              orderId: 'ord-1',
              order: { orderNumber: 'ZL-100' },
              date: new Date('2026-08-18T00:00:00.000Z'),
            },
          ] as any;
        }

        return [
          {
            employeeId: 'emp-1',
            employee: { fullName: 'Jan Kowalski' },
            hours: 100,
            workTimeTypeCode: 'G',
            workTimeType: { name: 'Standardowe' },
          },
        ] as any;
      });

      const response = await authenticatedGet('/api/analytics/closure-control-summary?dateFrom=2026-08-01&dateTo=2026-08-31').expect(200);

      // Settled: 100 orders + 16 UW = 116
      // Employee total: 100
      // Difference: 116 - 100 = +16
      expect(response.body.ordersHours).toBe(100);
      expect(response.body.totalAbsenceHours).toBe(16);
      expect(response.body.totalSettledHours).toBe(116);
      expect(response.body.totalEmployeeHours).toBe(100);
      expect(response.body.difference).toBe(16);
      expect(response.body.status).toBe('MISMATCHED');
      expect(response.body.statusLabel).toBe('Niezgodne');

      expect(response.body.diagnostics).toBeDefined();
      expect(response.body.diagnostics.length).toBe(1);
      expect(response.body.diagnostics[0]).toMatchObject({
        employeeName: 'Kowalski Jan',
        date: '2026-08-18',
        workTimeTypeCode: 'UW',
        hours: 16,
        orderNumber: 'ZL-100',
        reason: 'Nieobecność z zleceniem w rozliczeniu (podwójne naliczenie)',
        contribution: 16,
      });

      const sumContributions = response.body.diagnostics.reduce((sum: number, d: any) => sum + d.contribution, 0);
      expect(sumContributions).toBe(response.body.difference);
    });

    it('returns MISMATCHED status with both positive and negative contributions for Mixed Direction', async () => {
      vi.spyOn(prisma.order, 'findMany').mockImplementation(async (args: any) => {
        if (args?.where?.OR || !args?.where?.orderNumber) {
          return [
            {
              id: 'ord-1',
              orderNumber: 'ZL-100',
              status: 'OPEN',
              completionDate: null,
              deletedAt: null,
              reports: [{ hours: 100, date: new Date('2026-08-10T00:00:00.000Z'), deletedAt: null }],
            },
          ] as any;
        }
        return [] as any;
      });

      vi.spyOn(prisma.workTimeType, 'findMany').mockResolvedValue([
        { code: 'UW', name: 'Urlop wypoczynkowy', isAbsence: true, requiresOrder: false },
        { code: 'SZK', name: 'Szkolenie', isAbsence: false, requiresOrder: false },
      ] as any);

      vi.spyOn(prisma.workTimeReport, 'findMany').mockImplementation(async (args: any) => {
        if (args?.where?.workTimeType?.isAbsence) {
          return [{ workTimeTypeCode: 'UW', hours: 16 }] as any;
        }

        if (args?.include?.employee && args?.include?.order && args?.include?.workTimeType) {
          return [
            {
              employeeId: 'emp-1',
              employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' },
              hours: 16,
              workTimeTypeCode: 'UW',
              workTimeType: { code: 'UW', name: 'Urlop wypoczynkowy', isAbsence: true, requiresOrder: false },
              orderId: 'ord-1',
              order: { orderNumber: 'ZL-100' },
              date: new Date('2026-08-18T00:00:00.000Z'),
            },
            {
              employeeId: 'emp-1',
              employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' },
              hours: 8,
              workTimeTypeCode: 'SZK',
              workTimeType: { code: 'SZK', name: 'Szkolenie', isAbsence: false, requiresOrder: false },
              orderId: null,
              order: null,
              date: new Date('2026-08-20T00:00:00.000Z'),
            },
          ] as any;
        }

        return [
          {
            employeeId: 'emp-1',
            employee: { fullName: 'Jan Kowalski' },
            hours: 100,
            workTimeTypeCode: 'G',
            workTimeType: { name: 'Standardowe' },
          },
          {
            employeeId: 'emp-1',
            employee: { fullName: 'Jan Kowalski' },
            hours: 8,
            workTimeTypeCode: 'SZK',
            workTimeType: { name: 'Szkolenie' },
          },
        ] as any;
      });

      const response = await authenticatedGet('/api/analytics/closure-control-summary?dateFrom=2026-08-01&dateTo=2026-08-31').expect(200);

      // Settled: 100 orders + 16 UW = 116
      // Employee total: 100 G + 8 SZK = 108
      // Difference: 116 - 108 = +8
      expect(response.body.ordersHours).toBe(100);
      expect(response.body.totalAbsenceHours).toBe(16);
      expect(response.body.totalSettledHours).toBe(116);
      expect(response.body.totalEmployeeHours).toBe(108);
      expect(response.body.difference).toBe(8);
      expect(response.body.status).toBe('MISMATCHED');

      expect(response.body.diagnostics).toHaveLength(2);
      expect(response.body.diagnostics[0].contribution).toBe(16);
      expect(response.body.diagnostics[1].contribution).toBe(-8);

      const sumContributions = response.body.diagnostics.reduce((sum: number, d: any) => sum + d.contribution, 0);
      expect(sumContributions).toBe(response.body.difference);
    });

    it('dynamically includes custom absence type with isAbsence=true and excludes isAbsence=false', async () => {
      vi.spyOn(prisma.order, 'findMany').mockResolvedValue([]);

      vi.spyOn(prisma.workTimeType, 'findMany').mockResolvedValue([
        { code: 'DELEGACJA_URLOP', name: 'Urlop delegacyjny', isAbsence: true, requiresOrder: false },
        { code: 'PRZESTOJ', name: 'Przestój płatny', isAbsence: false, requiresOrder: false },
      ] as any);

      vi.spyOn(prisma.workTimeReport, 'findMany').mockImplementation(async (args: any) => {
        if (args?.where?.workTimeType?.isAbsence) {
          return [{ workTimeTypeCode: 'DELEGACJA_URLOP', hours: 24 }] as any;
        }

        // Diagnostic query - has include with employee, order, workTimeType
        if (args?.include?.employee && args?.include?.order && args?.include?.workTimeType) {
          return [] as any;
        }

        return [
          {
            employeeId: 'emp-1',
            employee: { fullName: 'Jan Kowalski' },
            hours: 24,
            workTimeTypeCode: 'DELEGACJA_URLOP',
            workTimeType: { name: 'Urlop delegacyjny' },
          },
        ] as any;
      });

      const response = await authenticatedGet('/api/analytics/closure-control-summary?dateFrom=2026-08-01&dateTo=2026-08-31').expect(200);

      expect(response.body.absences).toEqual([
        { code: 'DELEGACJA_URLOP', name: 'Urlop delegacyjny', hours: 24 },
      ]);
      expect(response.body.absences.some((a: any) => a.code === 'PRZESTOJ')).toBe(false);
      expect(response.body.status).toBe('MATCHED');
      expect(response.body.diagnostics).toBeUndefined();
    });

    it('rejects invalid date parameters with HTTP 400', async () => {
      await authenticatedGet('/api/analytics/closure-control-summary?dateFrom=2026-08-31&dateTo=2026-08-01')
        .expect(400)
        .expect(({ body }) => expect(body.code).toBe('INVALID_CLOSURE_REPORT_PARAMS'));

      await authenticatedGet('/api/analytics/closure-control-summary?dateFrom=invalid-date&dateTo=2026-08-31')
        .expect(400)
        .expect(({ body }) => expect(body.code).toBe('INVALID_CLOSURE_REPORT_PARAMS'));

      await authenticatedGet('/api/analytics/closure-control-summary')
        .expect(400)
        .expect(({ body }) => expect(body.code).toBe('INVALID_CLOSURE_REPORT_PARAMS'));
    });

    it('includes control summary section in XLSX export when in closureReport mode and omits diagnostics for MATCHED', async () => {
      vi.spyOn(prisma.order, 'findMany').mockResolvedValue([
        {
          id: 'ord-1',
          orderNumber: 'ZL-XLSX',
          productName: 'Forma',
          productCode: 'P-XLSX',
          accountingAccount: 'K-900',
          plannedHours: 50,
          quantity: 2,
          quantityUnit: 'szt.',
          status: 'CLOSED',
          completionDate: new Date('2026-08-20T00:00:00.000Z'),
          deletedAt: null,
          reports: [{ hours: 40, date: new Date('2026-08-15T00:00:00.000Z'), deletedAt: null }],
        },
      ] as any);

      vi.spyOn(prisma.workTimeType, 'findMany').mockResolvedValue([
        { code: 'UW', name: 'Urlop wypoczynkowy', isAbsence: true, requiresOrder: false },
      ] as any);

      vi.spyOn(prisma.workTimeReport, 'findMany').mockImplementation(async (args: any) => {
        if (args?.where?.workTimeType?.isAbsence) {
          return [{ workTimeTypeCode: 'UW', hours: 16 }] as any;
        }
        return [
          {
            employeeId: 'emp-1',
            employee: { fullName: 'Jan Kowalski' },
            hours: 40,
            workTimeTypeCode: 'G',
            workTimeType: { name: 'Standardowe' },
          },
          {
            employeeId: 'emp-1',
            employee: { fullName: 'Jan Kowalski' },
            hours: 16,
            workTimeTypeCode: 'UW',
            workTimeType: { name: 'Urlop wypoczynkowy' },
          },
        ] as any;
      });

      const xlsxResponse = await authenticatedGet('/api/analytics/export/by-order?closureReport=true&dateFrom=2026-08-01&dateTo=2026-08-31')
        .buffer(true)
        .parse(binaryParser)
        .expect(200)
        .expect('Content-Type', /spreadsheetml/);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(xlsxResponse.body);
      const worksheet = workbook.getWorksheet('Zlecenia')!;

      // Find control summary header in sheet
      const allValues = worksheet.getSheetValues();
      const hasControlHeader = allValues.some((row: any) => Array.isArray(row) && row.includes('Kontrola rozliczenia czasu'));
      expect(hasControlHeader).toBe(true);

      const hasOrdersRow = allValues.some((row: any) => Array.isArray(row) && row.includes('Godziny wg zleceń') && row.includes(40));
      expect(hasOrdersRow).toBe(true);

      const hasAbsenceRow = allValues.some((row: any) => Array.isArray(row) && row.includes('UW (Urlop wypoczynkowy)') && row.includes(16));
      expect(hasAbsenceRow).toBe(true);

      const hasSettledRow = allValues.some((row: any) => Array.isArray(row) && row.includes('Łącznie rozliczono') && row.includes(56));
      expect(hasSettledRow).toBe(true);

      const hasEmployeeRow = allValues.some((row: any) => Array.isArray(row) && row.includes('Suma godzin pracowników') && row.includes(56));
      expect(hasEmployeeRow).toBe(true);

      const hasDifferenceRow = allValues.some((row: any) => Array.isArray(row) && row.includes('Różnica') && row.includes(0));
      expect(hasDifferenceRow).toBe(true);

      const hasStatusRow = allValues.some((row: any) => Array.isArray(row) && row.includes('Status') && row.includes('Zgodne'));
      expect(hasStatusRow).toBe(true);

      // MATCHED should NOT include diagnostics section
      const hasDiagnosticsSection = allValues.some((row: any) => Array.isArray(row) && row.includes('Diagnostyka niezgodności'));
      expect(hasDiagnosticsSection).toBe(false);
    });

    it('includes full 7-column diagnostics section with signed numbers in XLSX export for MISMATCHED status', async () => {
      vi.spyOn(prisma.order, 'findMany').mockImplementation(async (args: any) => {
        if (args?.where?.OR || !args?.where?.orderNumber) {
          return [
            {
              id: 'ord-1',
              orderNumber: 'ZL-XLSX',
              productName: 'Forma',
              productCode: 'P-XLSX',
              accountingAccount: 'K-900',
              plannedHours: 50,
              quantity: 2,
              quantityUnit: 'szt.',
              status: 'CLOSED',
              completionDate: new Date('2026-08-20T00:00:00.000Z'),
              deletedAt: null,
              reports: [{ hours: 40, date: new Date('2026-08-15T00:00:00.000Z'), deletedAt: null }],
            },
          ] as any;
        }
        return [] as any;
      });

      vi.spyOn(prisma.workTimeType, 'findMany').mockResolvedValue([
        { code: 'UW', name: 'Urlop wypoczynkowy', isAbsence: true, requiresOrder: false },
        { code: 'SZK', name: 'Szkolenie', isAbsence: false, requiresOrder: false },
      ] as any);

      vi.spyOn(prisma.workTimeReport, 'findMany').mockImplementation(async (args: any) => {
        if (args?.where?.workTimeType?.isAbsence) {
          return [{ workTimeTypeCode: 'UW', hours: 16 }] as any;
        }

        if (args?.include?.employee && args?.include?.order && args?.include?.workTimeType) {
          return [
            {
              employeeId: 'emp-1',
              employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' },
              hours: 8,
              workTimeTypeCode: 'SZK',
              workTimeType: { code: 'SZK', name: 'Szkolenie', isAbsence: false, requiresOrder: false },
              orderId: null,
              order: null,
              date: new Date('2026-08-15T00:00:00.000Z'),
            },
            {
              employeeId: 'emp-1',
              employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' },
              hours: 16,
              workTimeTypeCode: 'UW',
              workTimeType: { code: 'UW', name: 'Urlop wypoczynkowy', isAbsence: true, requiresOrder: false },
              orderId: 'ord-1',
              order: { orderNumber: 'ZL-XLSX' },
              date: new Date('2026-08-18T00:00:00.000Z'),
            },
          ] as any;
        }

        return [
          {
            employeeId: 'emp-1',
            employee: { fullName: 'Jan Kowalski' },
            hours: 40,
            workTimeTypeCode: 'G',
            workTimeType: { name: 'Standardowe' },
          },
          {
            employeeId: 'emp-1',
            employee: { fullName: 'Jan Kowalski' },
            hours: 8,
            workTimeTypeCode: 'SZK',
            workTimeType: { name: 'Szkolenie' },
          },
        ] as any;
      });

      const xlsxResponse = await authenticatedGet('/api/analytics/export/by-order?closureReport=true&dateFrom=2026-08-01&dateTo=2026-08-31')
        .buffer(true)
        .parse(binaryParser)
        .expect(200)
        .expect('Content-Type', /spreadsheetml/);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(xlsxResponse.body);
      const worksheet = workbook.getWorksheet('Zlecenia')!;

      const allValues = worksheet.getSheetValues();

      // 1. Verify diagnostics header section title exists
      const hasDiagnosticsHeader = allValues.some((row: any) => Array.isArray(row) && row.includes('Diagnostyka niezgodności'));
      expect(hasDiagnosticsHeader).toBe(true);

      // Find the header row index
      let diagHeaderRowIdx = -1;
      worksheet.eachRow((row, rowNumber) => {
        const vals = Array.isArray(row.values) ? (row.values as any[]).slice(1) : [];
        if (vals.includes('Diagnostyka niezgodności')) {
          diagHeaderRowIdx = rowNumber + 1;
        }
      });
      expect(diagHeaderRowIdx).toBeGreaterThan(0);

      // 2. Verify exact 7 columns in exact order
      const expectedColHeaders = ['Pracownik', 'Data', 'Typ', 'Godziny', 'Zlecenie', 'Przyczyna', 'Wkład w różnicę'];
      const headerRow = worksheet.getRow(diagHeaderRowIdx);
      const actualHeaders = (headerRow.values as any[]).slice(1);
      expect(actualHeaders).toHaveLength(7);
      expect(actualHeaders).toEqual(expectedColHeaders);

      // 3. Find and verify diagnostic rows (including numeric types and numFmt)
      let szkRowExcel: ExcelJS.Row | undefined;
      let uwRowExcel: ExcelJS.Row | undefined;

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > diagHeaderRowIdx) {
          const vals = Array.isArray(row.values) ? (row.values as any[]).slice(1) : [];
          if (vals.includes('SZK (Szkolenie)')) {
            szkRowExcel = row;
          }
          if (vals.includes('Nieobecność z zleceniem w rozliczeniu (podwójne naliczenie)')) {
            uwRowExcel = row;
          }
        }
      });

      expect(szkRowExcel).toBeDefined();
      const szkValues = (szkRowExcel!.values as any[]).slice(1);
      expect(szkValues[0]).toBe('Kowalski Jan');
      expect(szkValues[1]).toBe('2026-08-15');
      expect(szkValues[2]).toBe('SZK (Szkolenie)');
      expect(szkValues[3]).toBe(8);
      expect(typeof szkValues[3]).toBe('number');
      expect(szkValues[4]).toBe('—');
      expect(szkValues[5]).toBe('Typ nie jest nieobecnością i nie wymaga zlecenia');
      expect(szkValues[6]).toBe(-8);
      expect(typeof szkValues[6]).toBe('number');
      expect(szkRowExcel!.getCell(4).numFmt).toBe('#,##0.00');
      expect(szkRowExcel!.getCell(7).numFmt).toBe('+#,##0.00;-#,##0.00;0.00');

      expect(uwRowExcel).toBeDefined();
      const uwValues = (uwRowExcel!.values as any[]).slice(1);
      expect(uwValues[0]).toBe('Kowalski Jan');
      expect(uwValues[1]).toBe('2026-08-18');
      expect(uwValues[2]).toBe('UW (Urlop wypoczynkowy)');
      expect(uwValues[3]).toBe(16);
      expect(typeof uwValues[3]).toBe('number');
      expect(uwValues[4]).toBe('ZL-XLSX');
      expect(uwValues[5]).toBe('Nieobecność z zleceniem w rozliczeniu (podwójne naliczenie)');
      expect(uwValues[6]).toBe(16);
      expect(typeof uwValues[6]).toBe('number');
      expect(uwRowExcel!.getCell(4).numFmt).toBe('#,##0.00');
      expect(uwRowExcel!.getCell(7).numFmt).toBe('+#,##0.00;-#,##0.00;0.00');
    });
  });
});

describe('getReconciliationDiagnostics — math verification', () => {
  const EMPLOYEE_ID = '20000000-0000-4000-8000-000000000001';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sum of contributions equals totalSettledHours - totalEmployeeHours for MISMATCHED case', async () => {
    // Test case setup:
    // Orders in closure: ord-1, ord-2
    // Reports in date range:
    //   emp-1: 40h G on ord-1 (in closure) → contribution = 0
    //   emp-1: 16h UW on ord-1 (in closure) → contribution = +16 (double counted)
    //   emp-1: 10h G on ord-2 (in closure) → contribution = 0
    //   emp-1: 8h G no order → contribution = -8
    //   emp-1: 4h UW no order → contribution = 0
    //
    // ordersHours = 40 + 16 + 10 = 66 (ALL reports on orders in closure)
    // absenceHours = 16 + 4 = 20 (ALL absences)
    // totalSettledHours = 66 + 20 = 86
    // totalEmployeeHours = 40 + 16 + 10 + 8 + 4 = 78
    // difference = 86 - 78 = 8
    //
    // Diagnostics sum = 0 + 16 + 0 + (-8) + 0 = 8 = difference ✓

    const { getReconciliationDiagnostics } = await import('../src/routes/analytics');

    // Mock orders in closure
    vi.spyOn(prisma.order, 'findMany').mockImplementation(async (args: any) => {
      if (args?.where?.OR) {
        // ordersInClosure query
        return [{ id: 'ord-1' }, { id: 'ord-2' }] as any;
      }
      return [] as any;
    });

    // Mock absence types
    vi.spyOn(prisma.workTimeType, 'findMany').mockResolvedValue([
      { code: 'G', name: 'Godziny standardowe', isAbsence: false, requiresOrder: false },
      { code: 'UW', name: 'Urlop wypoczynkowy', isAbsence: true, requiresOrder: false },
    ] as any);

    // Mock workTimeReports
    const allReports = [
      { employeeId: 'emp-1', employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' }, date: new Date('2026-08-15T00:00:00.000Z'), hours: 40, workTimeTypeCode: 'G', workTimeType: { code: 'G', name: 'Godziny standardowe', isAbsence: false, requiresOrder: false }, orderId: 'ord-1', order: { orderNumber: 'ZL-1' } },
      { employeeId: 'emp-1', employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' }, date: new Date('2026-08-15T00:00:00.000Z'), hours: 16, workTimeTypeCode: 'UW', workTimeType: { code: 'UW', name: 'Urlop wypoczynkowy', isAbsence: true, requiresOrder: false }, orderId: 'ord-1', order: { orderNumber: 'ZL-1' } },
      { employeeId: 'emp-1', employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' }, date: new Date('2026-08-20T00:00:00.000Z'), hours: 10, workTimeTypeCode: 'G', workTimeType: { code: 'G', name: 'Godziny standardowe', isAbsence: false, requiresOrder: false }, orderId: 'ord-2', order: { orderNumber: 'ZL-2' } },
      { employeeId: 'emp-1', employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' }, date: new Date('2026-08-22T00:00:00.000Z'), hours: 8, workTimeTypeCode: 'G', workTimeType: { code: 'G', name: 'Godziny standardowe', isAbsence: false, requiresOrder: false }, orderId: null, order: null },
      { employeeId: 'emp-1', employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' }, date: new Date('2026-08-22T00:00:00.000Z'), hours: 4, workTimeTypeCode: 'UW', workTimeType: { code: 'UW', name: 'Urlop wypoczynkowy', isAbsence: true, requiresOrder: false }, orderId: null, order: null },
    ];

    vi.spyOn(prisma.workTimeReport, 'findMany').mockImplementation(async (args: any) => {
      if (args?.where?.workTimeType?.isAbsence) {
        // absenceReports for absenceHours calculation
        return [
          { workTimeTypeCode: 'UW', hours: 16 },
          { workTimeTypeCode: 'UW', hours: 4 },
        ] as any;
      }
      if (args?.where?.date?.gte && args?.where?.date?.lte) {
        // allReports for diagnostics
        return allReports as any;
      }
      return [] as any;
    });

    const diagnostics = await getReconciliationDiagnostics({ dateFrom: '2026-08-01', dateTo: '2026-08-31' });

    expect(diagnostics).toBeDefined();
    expect(diagnostics.length).toBeGreaterThan(0);

    const sumContributions = diagnostics.reduce((sum, d) => sum + d.contribution, 0);

    // Verify against the expected difference
    // totalSettledHours = 86, totalEmployeeHours = 78, difference = 8
    const expectedDifference = 8;
    expect(Math.round(sumContributions * 100) / 100).toBe(expectedDifference);
  });

  it('returns empty diagnostics for MATCHED case when no double-counted absences', async () => {
    const { getReconciliationDiagnostics } = await import('../src/routes/analytics');

    // Mock orders in closure
    vi.spyOn(prisma.order, 'findMany').mockImplementation(async (args: any) => {
      if (args?.where?.OR) {
        return [{ id: 'ord-1' }] as any;
      }
      return [] as any;
    });

    // Mock absence types
    vi.spyOn(prisma.workTimeType, 'findMany').mockResolvedValue([
      { code: 'G', name: 'Godziny standardowe', isAbsence: false, requiresOrder: false },
      { code: 'UW', name: 'Urlop wypoczynkowy', isAbsence: true, requiresOrder: false },
    ] as any);

    // Mock workTimeReports - all matched (no double-counted absences)
    vi.spyOn(prisma.workTimeReport, 'findMany').mockImplementation(async (args: any) => {
      if (args?.where?.workTimeType?.isAbsence) {
        return [{ workTimeTypeCode: 'UW', hours: 10 }] as any;
      }
      if (args?.where?.date?.gte && args?.where?.date?.lte) {
        // All reports are on orders in closure, no double-counted absences
        return [
          { employeeId: 'emp-1', employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' }, date: new Date('2026-08-15T00:00:00.000Z'), hours: 40, workTimeTypeCode: 'G', workTimeType: { code: 'G', name: 'Godziny standardowe', isAbsence: false, requiresOrder: false }, orderId: 'ord-1', order: { orderNumber: 'ZL-1' } },
          { employeeId: 'emp-1', employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' }, date: new Date('2026-08-15T00:00:00.000Z'), hours: 10, workTimeTypeCode: 'UW', workTimeType: { code: 'UW', name: 'Urlop wypoczynkowy', isAbsence: true, requiresOrder: false }, orderId: null, order: null }, // absence without order in closure
        ] as any;
      }
      return [] as any;
    });

    const diagnostics = await getReconciliationDiagnostics({ dateFrom: '2026-08-01', dateTo: '2026-08-31' });

    // Should be empty because:
    // - 40h G on ord-1 (in closure): contribution = 0
    // - 10h UW no order (not in closure): contribution = 0 (absence without order in closure)
    expect(diagnostics.length).toBe(0);
  });

  it('diagnostics include double-counted absences (Direction B)', async () => {
    const { getReconciliationDiagnostics } = await import('../src/routes/analytics');

    // Mock orders in closure
    vi.spyOn(prisma.order, 'findMany').mockImplementation(async (args: any) => {
      if (args?.where?.OR) {
        return [{ id: 'ord-1' }] as any;
      }
      return [] as any;
    });

    // Mock absence types
    vi.spyOn(prisma.workTimeType, 'findMany').mockResolvedValue([
      { code: 'G', name: 'Godziny standardowe', isAbsence: false, requiresOrder: false },
      { code: 'UW', name: 'Urlop wypoczynkowy', isAbsence: true, requiresOrder: false },
    ] as any);

    // Mock workTimeReports - absence WITH order in closure (Direction B: double counted)
    vi.spyOn(prisma.workTimeReport, 'findMany').mockImplementation(async (args: any) => {
      if (args?.where?.workTimeType?.isAbsence) {
        return [{ workTimeTypeCode: 'UW', hours: 10 }] as any;
      }
      if (args?.where?.date?.gte && args?.where?.date?.lte) {
        return [
          { employeeId: 'emp-1', employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' }, date: new Date('2026-08-15T00:00:00.000Z'), hours: 40, workTimeTypeCode: 'G', workTimeType: { code: 'G', name: 'Godziny standardowe', isAbsence: false, requiresOrder: false }, orderId: 'ord-1', order: { orderNumber: 'ZL-1' } },
          { employeeId: 'emp-1', employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' }, date: new Date('2026-08-15T00:00:00.000Z'), hours: 10, workTimeTypeCode: 'UW', workTimeType: { code: 'UW', name: 'Urlop wypoczynkowy', isAbsence: true, requiresOrder: false }, orderId: 'ord-1', order: { orderNumber: 'ZL-1' } }, // absence WITH order in closure → double counted
        ] as any;
      }
      return [] as any;
    });

    const diagnostics = await getReconciliationDiagnostics({ dateFrom: '2026-08-01', dateTo: '2026-08-31' });

    // Should include the double-counted absence
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0].workTimeTypeCode).toBe('UW');
    expect(diagnostics[0].contribution).toBe(10);
    expect(diagnostics[0].reason).toContain('podwójne naliczenie');
  });
});

describe('BLOCKER-2 — Consistent Snapshot & Server-Side Invariant Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('executes closure control summary inside RepeatableRead transaction and passes tx client to all reads', async () => {
    const txMock = {
      order: {
        findMany: vi.fn().mockImplementation(async (args: any) => {
          if (args?.select?.id) {
            return [{ id: 'ord-1' }];
          }
          return [
            {
              id: 'ord-1',
              orderNumber: 'ZL-SNAP',
              productName: 'P1',
              productCode: 'C1',
              accountingAccount: 'A1',
              plannedHours: 40,
              quantity: 1,
              quantityUnit: 'szt.',
              status: 'CLOSED',
              completionDate: new Date('2026-08-20T00:00:00.000Z'),
              deletedAt: null,
              reports: [{ hours: 40, date: new Date('2026-08-10T00:00:00.000Z'), deletedAt: null }],
            },
          ];
        }),
      },
      workTimeType: {
        findMany: vi.fn().mockResolvedValue([
          { code: 'G', name: 'Standardowe', isAbsence: false, requiresOrder: false },
          { code: 'UW', name: 'Urlop', isAbsence: true, requiresOrder: false },
        ]),
      },
      workTimeReport: {
        findMany: vi.fn().mockImplementation(async (args: any) => {
          if (args?.where?.workTimeType?.isAbsence) {
            return [];
          }
          if (args?.include?.employee && args?.include?.order) {
            return [];
          }
          return [
            {
              employeeId: 'emp-1',
              employee: { fullName: 'Jan Kowalski' },
              hours: 40,
              workTimeTypeCode: 'G',
              workTimeType: { name: 'Standardowe' },
            },
          ];
        }),
      },
    };

    const transactionSpy = vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any, options?: any) => {
      expect(options).toMatchObject({
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      });
      return callback(txMock);
    });

    const summary = await getClosureControlSummary({ dateFrom: '2026-08-01', dateTo: '2026-08-31' });

    expect(transactionSpy).toHaveBeenCalledTimes(1);
    expect(txMock.order.findMany).toHaveBeenCalled();
    expect(txMock.workTimeType.findMany).toHaveBeenCalled();
    expect(txMock.workTimeReport.findMany).toHaveBeenCalled();
    expect(summary.status).toBe('MATCHED');
  });

  it('enforces server-side invariant guard and throws ReconciliationConsistencyError when invariant is violated', async () => {
    // Simulate inconsistent reads where totals show difference = -8, but diagnostics returns empty (0)
    const txMock = {
      order: {
        findMany: vi.fn().mockResolvedValue([]), // 0 order hours
      },
      workTimeType: {
        findMany: vi.fn().mockResolvedValue([
          { code: 'G', name: 'Standardowe', isAbsence: false, requiresOrder: false },
        ]),
      },
      workTimeReport: {
        findMany: vi.fn().mockImplementation(async (args: any) => {
          if (args?.where?.workTimeType?.isAbsence) {
            return []; // 0 absence hours
          }
          if (args?.include?.employee && args?.include?.order) {
            // Diagnostics query returns empty (0 contribution)
            return [];
          }
          // Employee query returns 8h (totalEmployeeHours = 8)
          // Difference = 0 - 8 = -8, but diagnostics sum = 0 -> INVARIANT VIOLATION!
          return [
            {
              employeeId: 'emp-1',
              employee: { fullName: 'Jan Kowalski' },
              hours: 8,
              workTimeTypeCode: 'G',
              workTimeType: { name: 'Standardowe' },
            },
          ];
        }),
      },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => callback(txMock));

    // Direct helper call must throw ReconciliationConsistencyError
    await expect(
      getClosureControlSummary({ dateFrom: '2026-08-01', dateTo: '2026-08-31' }),
    ).rejects.toThrow(ReconciliationConsistencyError);

    // Endpoint call must return 500 RECONCILIATION_CONSISTENCY_ERROR
    const response = await authenticatedGet(
      '/api/analytics/closure-control-summary?dateFrom=2026-08-01&dateTo=2026-08-31',
    ).expect(500);

    expect(response.body).toEqual({
      code: 'RECONCILIATION_CONSISTENCY_ERROR',
      message: 'Błąd spójności danych raportu rozliczenia. Spróbuj ponownie wygenerować raport.',
    });
  });

  it('CASE 1 — INSERT: concurrent report inserted during calculation does not leak into snapshot reads', async () => {
    // Snapshot State A:
    // Order ord-1 is OPEN (in closure, 40h reports on ord-1)
    // 2 reports:
    //   emp-1: 40h G on ord-1
    //   emp-1: 8h SZK without order (non-absence, no order) -> generates legitimate mismatch
    // State A Totals: orders = 40, absences = 0, settled = 40, employee = 48, difference = -8 (MISMATCHED)
    // State A Diagnostics: 1 record (emp-1, 8h SZK, contribution = -8)
    //
    // State B (Concurrent/Global Prisma):
    // A concurrent transaction commits an unassigned 8h report (emp-2, 8h G no order on 2026-08-15)
    // In State B: employee = 56, difference = -16 (MISMATCHED if leaked)

    const stateAReports = [
      {
        employeeId: 'emp-1',
        employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' },
        hours: 40,
        workTimeTypeCode: 'G',
        workTimeType: { code: 'G', name: 'Standardowe', isAbsence: false, requiresOrder: true },
        orderId: 'ord-1',
        order: { orderNumber: 'ZL-1' },
        date: new Date('2026-08-10T00:00:00.000Z'),
        deletedAt: null,
      },
      {
        employeeId: 'emp-1',
        employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' },
        hours: 8,
        workTimeTypeCode: 'SZK',
        workTimeType: { code: 'SZK', name: 'Szkolenie', isAbsence: false, requiresOrder: false },
        orderId: null,
        order: null,
        date: new Date('2026-08-12T00:00:00.000Z'),
        deletedAt: null,
      },
    ];

    const stateBReports = [
      ...stateAReports,
      {
        employeeId: 'emp-2',
        employee: { fullName: 'Adam Nowak', firstName: 'Adam', lastName: 'Nowak' },
        hours: 8,
        workTimeTypeCode: 'G',
        workTimeType: { code: 'G', name: 'Standardowe', isAbsence: false, requiresOrder: false },
        orderId: null,
        order: null,
        date: new Date('2026-08-15T00:00:00.000Z'),
        deletedAt: null,
      },
    ];

    // Global prisma represents State B (mutated concurrently during calculation)
    vi.spyOn(prisma.workTimeReport, 'findMany').mockImplementation(async () => stateBReports as any);

    // Transaction client txMock represents stable Snapshot State A
    const txMock = {
      order: {
        findMany: vi.fn().mockImplementation(async (args: any) => {
          if (args?.select?.id) return [{ id: 'ord-1' }];
          return [
            {
              id: 'ord-1',
              orderNumber: 'ZL-1',
              productName: 'P',
              productCode: 'C',
              accountingAccount: 'A',
              plannedHours: 40,
              quantity: 1,
              quantityUnit: 'szt.',
              status: 'OPEN',
              completionDate: null,
              deletedAt: null,
              reports: [{ hours: 40, date: new Date('2026-08-10T00:00:00.000Z'), deletedAt: null }],
            },
          ];
        }),
      },
      workTimeType: {
        findMany: vi.fn().mockResolvedValue([
          { code: 'G', name: 'Standardowe', isAbsence: false, requiresOrder: true },
          { code: 'SZK', name: 'Szkolenie', isAbsence: false, requiresOrder: false },
        ]),
      },
      workTimeReport: {
        findMany: vi.fn().mockImplementation(async (args: any) => {
          if (args?.where?.workTimeType?.isAbsence) return [];
          if (args?.include?.employee && args?.include?.order) return stateAReports;
          return stateAReports;
        }),
      },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => callback(txMock));

    const response = await authenticatedGet(
      '/api/analytics/closure-control-summary?dateFrom=2026-08-01&dateTo=2026-08-31',
    ).expect(200);

    // Assert that the calculation used Snapshot State A (MISMATCHED, 40h settled vs 48h employee) and was isolated from State B INSERT
    expect(response.body.status).toBe('MISMATCHED');
    expect(response.body.ordersHours).toBe(40);
    expect(response.body.totalSettledHours).toBe(40);
    expect(response.body.totalEmployeeHours).toBe(48);
    expect(response.body.difference).toBe(-8);

    expect(response.body.diagnostics).toHaveLength(1);
    expect(response.body.diagnostics[0].hours).toBe(8);
    expect(response.body.diagnostics[0].contribution).toBe(-8);
    expect(response.body.diagnostics[0].reason).toBe('Typ nie jest nieobecnością i nie wymaga zlecenia');

    // Invariant holds
    const sumContributions = Math.round(response.body.diagnostics.reduce((sum: number, d: any) => sum + d.contribution, 0) * 100) / 100;
    expect(sumContributions).toBe(Math.round(response.body.difference * 100) / 100);

    // Verify all reads were executed against the transaction client
    expect(txMock.order.findMany).toHaveBeenCalled();
    expect(txMock.workTimeReport.findMany).toHaveBeenCalled();
  });

  it('CASE 2 — UPDATE: concurrent report hours modification during calculation does not produce mixed totals and diagnostics', async () => {
    // Snapshot State A:
    // 1 unassigned report: emp-1, 8h SZK (Szkolenie, non-absence, no order)
    // State A Totals: orders = 0, absences = 0, settled = 0, employee = 8, difference = -8 (MISMATCHED)
    // State A Diagnostics: 1 record, contribution = -8h
    //
    // State B (Concurrent/Global Prisma):
    // Report is updated concurrently to 16h SZK (employee = 16, difference = -16)

    const stateAReports = [
      {
        employeeId: 'emp-1',
        employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' },
        hours: 8,
        workTimeTypeCode: 'SZK',
        workTimeType: { code: 'SZK', name: 'Szkolenie', isAbsence: false, requiresOrder: false },
        orderId: null,
        order: null,
        date: new Date('2026-08-15T00:00:00.000Z'),
        deletedAt: null,
      },
    ];

    const stateBReports = [
      {
        ...stateAReports[0],
        hours: 16,
      },
    ];

    // Global prisma represents updated State B
    vi.spyOn(prisma.workTimeReport, 'findMany').mockImplementation(async () => stateBReports as any);

    // Transaction client txMock represents stable Snapshot State A
    const txMock = {
      order: {
        findMany: vi.fn().mockImplementation(async (args: any) => {
          if (args?.select?.id) return [];
          return [];
        }),
      },
      workTimeType: {
        findMany: vi.fn().mockResolvedValue([
          { code: 'SZK', name: 'Szkolenie', isAbsence: false, requiresOrder: false },
        ]),
      },
      workTimeReport: {
        findMany: vi.fn().mockImplementation(async (args: any) => {
          if (args?.where?.workTimeType?.isAbsence) return [];
          if (args?.include?.employee && args?.include?.order) return stateAReports;
          return stateAReports;
        }),
      },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => callback(txMock));

    const response = await authenticatedGet(
      '/api/analytics/closure-control-summary?dateFrom=2026-08-01&dateTo=2026-08-31',
    ).expect(200);

    // Assert that the calculation used Snapshot State A (8h) and did not mix with State B (16h)
    expect(response.body.status).toBe('MISMATCHED');
    expect(response.body.ordersHours).toBe(0);
    expect(response.body.totalSettledHours).toBe(0);
    expect(response.body.totalEmployeeHours).toBe(8);
    expect(response.body.difference).toBe(-8);

    expect(response.body.diagnostics).toHaveLength(1);
    expect(response.body.diagnostics[0].hours).toBe(8);
    expect(response.body.diagnostics[0].contribution).toBe(-8);
    expect(response.body.diagnostics[0].reason).toBe('Typ nie jest nieobecnością i nie wymaga zlecenia');

    // Invariant holds
    const sumContributions = response.body.diagnostics.reduce((sum: number, d: any) => sum + d.contribution, 0);
    expect(sumContributions).toBe(response.body.difference);
  });

  it('CASE 3 — SOFT DELETE: concurrent report deletion during calculation does not cause partial record inclusion', async () => {
    // Snapshot State A:
    // Order ord-1 (OPEN, 40h on 2026-08-10)
    // 2 reports:
    //   emp-1: 40h G on ord-1
    //   emp-1: 8h G without order (deletedAt: null in State A)
    // State A: settled = 40, employee = 48, difference = -8 (MISMATCHED with 1 diagnostic row)
    //
    // State B (Concurrent/Global Prisma):
    // The unassigned 8h report is soft-deleted (deletedAt = new Date())
    // In State B: employee = 40, difference = 0 (MATCHED)

    const stateAReports = [
      {
        employeeId: 'emp-1',
        employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' },
        hours: 40,
        workTimeTypeCode: 'G',
        workTimeType: { code: 'G', name: 'Standardowe', isAbsence: false, requiresOrder: true },
        orderId: 'ord-1',
        order: { orderNumber: 'ZL-1' },
        date: new Date('2026-08-10T00:00:00.000Z'),
        deletedAt: null,
      },
      {
        employeeId: 'emp-1',
        employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' },
        hours: 8,
        workTimeTypeCode: 'G',
        workTimeType: { code: 'G', name: 'Standardowe', isAbsence: false, requiresOrder: false },
        orderId: null,
        order: null,
        date: new Date('2026-08-15T00:00:00.000Z'),
        deletedAt: null,
      },
    ];

    const stateBReports = [
      stateAReports[0], // 8h report soft-deleted/omitted in State B
    ];

    // Global prisma represents State B where the 8h report is deleted
    vi.spyOn(prisma.workTimeReport, 'findMany').mockImplementation(async () => stateBReports as any);

    // Transaction client txMock represents Snapshot State A where 8h report is active
    const txMock = {
      order: {
        findMany: vi.fn().mockImplementation(async (args: any) => {
          if (args?.select?.id) return [{ id: 'ord-1' }];
          return [
            {
              id: 'ord-1',
              orderNumber: 'ZL-1',
              productName: 'P',
              productCode: 'C',
              accountingAccount: 'A',
              plannedHours: 40,
              quantity: 1,
              quantityUnit: 'szt.',
              status: 'OPEN',
              completionDate: null,
              deletedAt: null,
              reports: [{ hours: 40, date: new Date('2026-08-10T00:00:00.000Z'), deletedAt: null }],
            },
          ];
        }),
      },
      workTimeType: {
        findMany: vi.fn().mockResolvedValue([
          { code: 'G', name: 'Standardowe', isAbsence: false, requiresOrder: true },
        ]),
      },
      workTimeReport: {
        findMany: vi.fn().mockImplementation(async (args: any) => {
          if (args?.where?.workTimeType?.isAbsence) return [];
          if (args?.include?.employee && args?.include?.order) return stateAReports;
          return stateAReports;
        }),
      },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => callback(txMock));

    const response = await authenticatedGet(
      '/api/analytics/closure-control-summary?dateFrom=2026-08-01&dateTo=2026-08-31',
    ).expect(200);

    // Assert that the calculation used Snapshot State A (settled=40, employee=48, diff=-8)
    expect(response.body.status).toBe('MISMATCHED');
    expect(response.body.ordersHours).toBe(40);
    expect(response.body.totalSettledHours).toBe(40);
    expect(response.body.totalEmployeeHours).toBe(48);
    expect(response.body.difference).toBe(-8);

    expect(response.body.diagnostics).toHaveLength(1);
    expect(response.body.diagnostics[0].hours).toBe(8);
    expect(response.body.diagnostics[0].contribution).toBe(-8);
    expect(response.body.diagnostics[0].reason).toBe('Typ nie jest nieobecnością i nie wymaga zlecenia');

    // Invariant holds
    const sumContributions = response.body.diagnostics.reduce((sum: number, d: any) => sum + d.contribution, 0);
    expect(sumContributions).toBe(response.body.difference);
  });

  it('CASE 4 — ORDER ENTERS CLOSURE: concurrent order status/completion transition into closure does not alter snapshot membership', async () => {
    // Snapshot State A:
    // Order ord-1 is CLOSED on 2026-09-15 (outside August 2026 closure range) -> NOT IN CLOSURE
    // Report: emp-1, 40h G on ord-1 in August
    // State A Totals: orders = 0, absences = 0, settled = 0, employee = 40, difference = -40 (MISMATCHED)
    // State A Diagnostics: 1 record on ord-1, reason: 'Zlecenie nieobjęte raportem zamknięcia', contribution: -40
    //
    // State B (Concurrent/Global Prisma):
    // Order ord-1 is transitioned to OPEN (or completionDate set to 2026-08-20), entering closure.
    // In State B: orders = 40, employee = 40, difference = 0 (MATCHED)

    const stateAReports = [
      {
        employeeId: 'emp-1',
        employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' },
        hours: 40,
        workTimeTypeCode: 'G',
        workTimeType: { code: 'G', name: 'Standardowe', isAbsence: false, requiresOrder: true },
        orderId: 'ord-1',
        order: { orderNumber: 'ZL-OUTSIDE' },
        date: new Date('2026-08-10T00:00:00.000Z'),
        deletedAt: null,
      },
    ];

    // Global prisma represents State B where ord-1 entered closure
    vi.spyOn(prisma.order, 'findMany').mockImplementation(async (args: any) => {
      if (args?.select?.id) return [{ id: 'ord-1' }];
      return [
        {
          id: 'ord-1',
          orderNumber: 'ZL-OUTSIDE',
          status: 'OPEN', // OPEN in State B
          completionDate: null,
          deletedAt: null,
          reports: [{ hours: 40, date: new Date('2026-08-10T00:00:00.000Z'), deletedAt: null }],
        },
      ] as any;
    });

    // Transaction client txMock represents Snapshot State A where ord-1 is CLOSED outside closure
    const txMock = {
      order: {
        findMany: vi.fn().mockImplementation(async (args: any) => {
          if (args?.select?.id) {
            // ord-1 completionDate 2026-09-15 is outside August range -> empty closure order ids in State A
            return [];
          }
          // getOrderReportRows in closureReport mode for State A excludes ord-1
          return [];
        }),
      },
      workTimeType: {
        findMany: vi.fn().mockResolvedValue([
          { code: 'G', name: 'Standardowe', isAbsence: false, requiresOrder: true },
        ]),
      },
      workTimeReport: {
        findMany: vi.fn().mockImplementation(async (args: any) => {
          if (args?.where?.workTimeType?.isAbsence) return [];
          if (args?.include?.employee && args?.include?.order) return stateAReports;
          return stateAReports;
        }),
      },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => callback(txMock));

    const response = await authenticatedGet(
      '/api/analytics/closure-control-summary?dateFrom=2026-08-01&dateTo=2026-08-31',
    ).expect(200);

    // Assert that the calculation used Snapshot State A (orders=0, employee=40, diff=-40)
    expect(response.body.status).toBe('MISMATCHED');
    expect(response.body.ordersHours).toBe(0);
    expect(response.body.totalSettledHours).toBe(0);
    expect(response.body.totalEmployeeHours).toBe(40);
    expect(response.body.difference).toBe(-40);

    expect(response.body.diagnostics).toHaveLength(1);
    expect(response.body.diagnostics[0].hours).toBe(40);
    expect(response.body.diagnostics[0].orderNumber).toBe('ZL-OUTSIDE');
    expect(response.body.diagnostics[0].reason).toBe('Zlecenie nieobjęte raportem zamknięcia');
    expect(response.body.diagnostics[0].contribution).toBe(-40);

    // Invariant holds
    const sumContributions = response.body.diagnostics.reduce((sum: number, d: any) => sum + d.contribution, 0);
    expect(sumContributions).toBe(response.body.difference);
  });

  it('CASE 5 — ORDER LEAVES CLOSURE: concurrent order status change out of closure does not cause conflicting order classification', async () => {
    // Snapshot State A:
    // Order ord-1 is OPEN (IN CLOSURE, 40h on ord-1)
    // 2 reports:
    //   emp-1: 40h G on ord-1
    //   emp-1: 8h SZK without order (non-absence, no order) -> generates legitimate mismatch
    // State A Totals: orders = 40, absences = 0, settled = 40, employee = 48, difference = -8 (MISMATCHED)
    // State A Diagnostics: 1 record (emp-1, 8h SZK, contribution = -8)
    //
    // State B (Concurrent/Global Prisma):
    // Order ord-1 status changed to SUSPENDED (or soft-deleted), leaving closure.
    // In State B: orders = 0, employee = 48, difference = -48 (if leaked)

    const stateAReports = [
      {
        employeeId: 'emp-1',
        employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' },
        hours: 40,
        workTimeTypeCode: 'G',
        workTimeType: { code: 'G', name: 'Standardowe', isAbsence: false, requiresOrder: true },
        orderId: 'ord-1',
        order: { orderNumber: 'ZL-OPEN' },
        date: new Date('2026-08-10T00:00:00.000Z'),
        deletedAt: null,
      },
      {
        employeeId: 'emp-1',
        employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' },
        hours: 8,
        workTimeTypeCode: 'SZK',
        workTimeType: { code: 'SZK', name: 'Szkolenie', isAbsence: false, requiresOrder: false },
        orderId: null,
        order: null,
        date: new Date('2026-08-12T00:00:00.000Z'),
        deletedAt: null,
      },
    ];

    // Global prisma represents State B where ord-1 left closure (SUSPENDED)
    vi.spyOn(prisma.order, 'findMany').mockImplementation(async (args: any) => {
      if (args?.select?.id) return []; // ord-1 suspended in State B
      return [];
    });

    // Transaction client txMock represents Snapshot State A where ord-1 is OPEN in closure
    const txMock = {
      order: {
        findMany: vi.fn().mockImplementation(async (args: any) => {
          if (args?.select?.id) return [{ id: 'ord-1' }];
          return [
            {
              id: 'ord-1',
              orderNumber: 'ZL-OPEN',
              productName: 'P',
              productCode: 'C',
              accountingAccount: 'A',
              plannedHours: 40,
              quantity: 1,
              quantityUnit: 'szt.',
              status: 'OPEN',
              completionDate: null,
              deletedAt: null,
              reports: [{ hours: 40, date: new Date('2026-08-10T00:00:00.000Z'), deletedAt: null }],
            },
          ];
        }),
      },
      workTimeType: {
        findMany: vi.fn().mockResolvedValue([
          { code: 'G', name: 'Standardowe', isAbsence: false, requiresOrder: true },
          { code: 'SZK', name: 'Szkolenie', isAbsence: false, requiresOrder: false },
        ]),
      },
      workTimeReport: {
        findMany: vi.fn().mockImplementation(async (args: any) => {
          if (args?.where?.workTimeType?.isAbsence) return [];
          if (args?.include?.employee && args?.include?.order) return stateAReports;
          return stateAReports;
        }),
      },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => callback(txMock));

    const response = await authenticatedGet(
      '/api/analytics/closure-control-summary?dateFrom=2026-08-01&dateTo=2026-08-31',
    ).expect(200);

    // Assert that the calculation used Snapshot State A (MISMATCHED, 40h settled vs 48h employee) and ord-1 remained in closure
    expect(response.body.status).toBe('MISMATCHED');
    expect(response.body.ordersHours).toBe(40);
    expect(response.body.totalSettledHours).toBe(40);
    expect(response.body.totalEmployeeHours).toBe(48);
    expect(response.body.difference).toBe(-8);

    expect(response.body.diagnostics).toHaveLength(1);
    expect(response.body.diagnostics[0].hours).toBe(8);
    expect(response.body.diagnostics[0].contribution).toBe(-8);
    expect(response.body.diagnostics[0].reason).toBe('Typ nie jest nieobecnością i nie wymaga zlecenia');

    // Invariant holds
    const sumContributions = Math.round(response.body.diagnostics.reduce((sum: number, d: any) => sum + d.contribution, 0) * 100) / 100;
    expect(sumContributions).toBe(Math.round(response.body.difference * 100) / 100);
  });

  it('endpoint returns consistent MISMATCHED response where sum(diagnostics.contribution) === difference', async () => {
    // Consistent snapshot with both Direction A and Direction B records:
    // ord-1 in closure
    // emp-1: 40h G on ord-1 -> 0
    // emp-1: 16h UW on ord-1 -> +16 (in closure orders & absence)
    // emp-1: 8h G without order -> -8
    // Settled: 40 + 16 (orders) + 16 (absence) = 72h
    // Employee total: 40 + 16 + 8 = 64h
    // Difference: 72 - 64 = +8h
    // Diagnostics: +16 (UW on ord-1) and -8 (G no order) -> sum = +8h

    const txMock = {
      order: {
        findMany: vi.fn().mockImplementation(async (args: any) => {
          if (args?.select?.id) return [{ id: 'ord-1' }];
          return [
            {
              id: 'ord-1',
              orderNumber: 'ZL-SNAP-1',
              productName: 'Produkt 1',
              productCode: 'P-1',
              accountingAccount: 'K-1',
              plannedHours: 100,
              quantity: 1,
              quantityUnit: 'szt.',
              status: 'OPEN',
              completionDate: null,
              deletedAt: null,
              reports: [
                { hours: 40, date: new Date('2026-08-10T00:00:00.000Z'), deletedAt: null },
                { hours: 16, date: new Date('2026-08-11T00:00:00.000Z'), deletedAt: null },
              ],
            },
          ];
        }),
      },
      workTimeType: {
        findMany: vi.fn().mockResolvedValue([
          { code: 'G', name: 'Standardowe', isAbsence: false, requiresOrder: false },
          { code: 'UW', name: 'Urlop wypoczynkowy', isAbsence: true, requiresOrder: false },
        ]),
      },
      workTimeReport: {
        findMany: vi.fn().mockImplementation(async (args: any) => {
          if (args?.where?.workTimeType?.isAbsence) {
            return [{ workTimeTypeCode: 'UW', hours: 16 }];
          }
          if (args?.include?.employee && args?.include?.order) {
            return [
              {
                employeeId: 'emp-1',
                employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' },
                hours: 40,
                workTimeTypeCode: 'G',
                workTimeType: { code: 'G', name: 'Standardowe', isAbsence: false, requiresOrder: false },
                orderId: 'ord-1',
                order: { orderNumber: 'ZL-SNAP-1' },
                date: new Date('2026-08-10T00:00:00.000Z'),
              },
              {
                employeeId: 'emp-1',
                employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' },
                hours: 16,
                workTimeTypeCode: 'UW',
                workTimeType: { code: 'UW', name: 'Urlop wypoczynkowy', isAbsence: true, requiresOrder: false },
                orderId: 'ord-1',
                order: { orderNumber: 'ZL-SNAP-1' },
                date: new Date('2026-08-11T00:00:00.000Z'),
              },
              {
                employeeId: 'emp-1',
                employee: { fullName: 'Jan Kowalski', firstName: 'Jan', lastName: 'Kowalski' },
                hours: 8,
                workTimeTypeCode: 'G',
                workTimeType: { code: 'G', name: 'Standardowe', isAbsence: false, requiresOrder: false },
                orderId: null,
                order: null,
                date: new Date('2026-08-12T00:00:00.000Z'),
              },
            ];
          }
          return [
            {
              employeeId: 'emp-1',
              employee: { fullName: 'Jan Kowalski' },
              hours: 40,
              workTimeTypeCode: 'G',
              workTimeType: { name: 'Standardowe' },
            },
            {
              employeeId: 'emp-1',
              employee: { fullName: 'Jan Kowalski' },
              hours: 16,
              workTimeTypeCode: 'UW',
              workTimeType: { name: 'Urlop wypoczynkowy' },
            },
            {
              employeeId: 'emp-1',
              employee: { fullName: 'Jan Kowalski' },
              hours: 8,
              workTimeTypeCode: 'G',
              workTimeType: { name: 'Standardowe' },
            },
          ];
        }),
      },
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => callback(txMock));

    const response = await authenticatedGet(
      '/api/analytics/closure-control-summary?dateFrom=2026-08-01&dateTo=2026-08-31',
    ).expect(200);

    expect(response.body.status).toBe('MISMATCHED');
    expect(response.body.ordersHours).toBe(56);
    expect(response.body.totalAbsenceHours).toBe(16);
    expect(response.body.totalSettledHours).toBe(72);
    expect(response.body.totalEmployeeHours).toBe(64);
    expect(response.body.difference).toBe(8);

    expect(response.body.diagnostics).toHaveLength(2);
    expect(response.body.diagnostics[0].contribution).toBe(16);
    expect(response.body.diagnostics[1].contribution).toBe(-8);

    const sumContributions = Math.round(
      response.body.diagnostics.reduce((sum: number, d: any) => sum + d.contribution, 0) * 100,
    ) / 100;
    expect(sumContributions).toBe(response.body.difference);
  });
});
