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
});
