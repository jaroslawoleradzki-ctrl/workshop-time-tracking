import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as jwt from 'jsonwebtoken';
import * as ExcelJS from 'exceljs';
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
        employee: { fullName: 'Jan Kowalski' },
        hours: 8,
        workTimeTypeCode: 'G',
      },
      {
        employeeId: EMPLOYEE_ID,
        employee: { fullName: 'Jan Kowalski' },
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

    expect(worksheet?.getRow(1).values).toEqual([
      undefined,
      'Pracownik',
      'Suma godzin z nadgodzinami',
      'Suma godzin bez nadgodzin',
      'G (Standardowe godziny pracy)',
      'NOC (Zmiana nocna)',
    ]);
    expect(worksheet?.getRow(2).values).toEqual([
      undefined,
      jsonResponse.body[0].employeeName,
      jsonResponse.body[0].suma,
      jsonResponse.body[0].sumaBezNadgodzin,
      jsonResponse.body[0].G,
      jsonResponse.body[0].NOC,
    ]);
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
    expect(res.body[0].employeeName).toBe('Adam Adamowski');
    expect(res.body[0].suma).toBe(10);
    expect(res.body[0].sumaBezNadgodzin).toBe(8);

    expect(res.body[1].employeeName).toBe('Jan Kowalski');
    expect(res.body[1].suma).toBe(8);
    expect(res.body[1].sumaBezNadgodzin).toBe(8);
  });
});
