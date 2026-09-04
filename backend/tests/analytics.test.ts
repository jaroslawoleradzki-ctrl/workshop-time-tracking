import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as jwt from 'jsonwebtoken';
import * as ExcelJS from 'exceljs';
import request from 'supertest';
import { formatEmployeeName } from '../src/routes/analytics';
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

    it('returns MISMATCHED status when settled hours differ from employee total hours', async () => {
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

    it('includes control summary section in XLSX export when in closureReport mode', async () => {
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
    });
  });
});
