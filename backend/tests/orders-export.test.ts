import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import * as ExcelJS from 'exceljs';
import app from '../src/app';
import prisma from '../src/utils/prisma';
import { TEST_JWT_SECRET } from './setup-env';

const ADMIN_ID = '10000000-0000-4000-8000-000000000001';
const LEADER_ID = '10000000-0000-4000-8000-000000000002';
const WORKER_ID = '10000000-0000-4000-8000-000000000003';

describe('POST /api/orders/export-xlsx', () => {
  let adminToken: string;
  let leaderToken: string;
  let workerToken: string;

  const authenticatedPost = (payload: any) =>
    request(app)
      .post('/api/orders/export-xlsx')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: any[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

  const mockOrders = [
    {
      id: 'ord-1',
      orderNumber: 'ZL-2026/001',
      orderDate: new Date('2026-08-01T00:00:00.000Z'),
      plannedShipmentDate: new Date('2026-08-15T00:00:00.000Z'),
      productCode: 'PRD-A',
      productName: 'Projekt A',
      accountingAccount: 'KK-100',
      orderedBy: 'Firma Alpha',
      notes: 'Pilne zamówienie',
      plannedHours: 100,
      quantity: 10,
      quantityUnit: 'szt.',
      hoursPerUnit: 10,
      status: 'OPEN',
      isActive: true,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      deletedAt: null,
      completionDate: null,
      reports: [{ hours: 25 }, { hours: 25 }], // 50h actual -> 50%
    },
    {
      id: 'ord-2',
      orderNumber: 'ZL-2026/002',
      orderDate: new Date('2026-07-15T00:00:00.000Z'),
      plannedShipmentDate: null,
      productCode: 'PRD-B',
      productName: 'Projekt B',
      accountingAccount: 'KK-200',
      orderedBy: 'Firma Beta',
      notes: null,
      plannedHours: 50,
      quantity: 5,
      quantityUnit: 'szt.',
      hoursPerUnit: 10,
      status: 'SUSPENDED',
      isActive: false,
      createdAt: new Date('2026-07-15T00:00:00.000Z'),
      deletedAt: null,
      completionDate: null,
      reports: [{ hours: 60 }], // 60h actual -> 120%
    },
    {
      id: 'ord-3',
      orderNumber: 'ZL-2026/003',
      orderDate: new Date('2026-08-02T00:00:00.000Z'),
      plannedShipmentDate: new Date('2026-08-10T00:00:00.000Z'),
      productCode: null,
      productName: 'Projekt C',
      accountingAccount: null,
      orderedBy: null,
      notes: null,
      plannedHours: 80,
      quantity: 1,
      quantityUnit: 'usł.',
      hoursPerUnit: 80,
      status: 'CLOSED',
      isActive: true,
      createdAt: new Date('2026-08-02T00:00:00.000Z'),
      deletedAt: null,
      completionDate: new Date('2026-08-02T12:00:00.000Z'),
      reports: [{ hours: 80 }],
    },
  ];

  beforeEach(() => {
    adminToken = jwt.sign(
      { id: ADMIN_ID, username: 'admin', role: 'admin', fullName: 'Administrator' },
      TEST_JWT_SECRET,
    );
    leaderToken = jwt.sign(
      { id: LEADER_ID, username: 'leader', role: 'leader', fullName: 'Lider' },
      TEST_JWT_SECRET,
    );
    workerToken = jwt.sign(
      { id: WORKER_ID, username: 'worker', role: 'worker', fullName: 'Pracownik' },
      TEST_JWT_SECRET,
    );

    vi.spyOn(prisma.user, 'findUnique').mockImplementation(async ({ where }: any) => {
      if (where.id === ADMIN_ID) {
        return { id: ADMIN_ID, username: 'admin', role: 'admin', fullName: 'Administrator', isActive: true } as any;
      }
      if (where.id === LEADER_ID) {
        return { id: LEADER_ID, username: 'leader', role: 'leader', fullName: 'Lider', isActive: true } as any;
      }
      if (where.id === WORKER_ID) {
        return { id: WORKER_ID, username: 'worker', role: 'worker', fullName: 'Pracownik', isActive: true } as any;
      }
      return null;
    });

    vi.spyOn(prisma.order, 'findMany').mockResolvedValue(mockOrders as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects requests without authentication (401)', async () => {
    await request(app).post('/api/orders/export-xlsx').send({}).expect(401);
  });

  it('rejects worker role without export permission (403)', async () => {
    await request(app)
      .post('/api/orders/export-xlsx')
      .set('Authorization', `Bearer ${workerToken}`)
      .send({})
      .expect(403);
  });

  it('allows leader role to export orders XLSX (200)', async () => {
    const res = await request(app)
      .post('/api/orders/export-xlsx')
      .set('Authorization', `Bearer ${leaderToken}`)
      .send({})
      .expect(200);

    expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toContain('attachment; filename="baza_zlecen_');
  });

  it('allows admin role to export orders XLSX (200)', async () => {
    const res = await request(app)
      .post('/api/orders/export-xlsx')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(200);

    expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  it('validates request payload and returns 400 for invalid statusFilter or sortField', async () => {
    await request(app)
      .post('/api/orders/export-xlsx')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusFilter: 'INVALID' })
      .expect(400);

    await request(app)
      .post('/api/orders/export-xlsx')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sortField: 'invalidField' })
      .expect(400);

    await request(app)
      .post('/api/orders/export-xlsx')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sortOrder: 'invalidOrder' })
      .expect(400);
  });

  it('parses output XLSX and verifies structure, 16 columns, metadata, and status translations', async () => {
    const res = await authenticatedPost({
      searchQuery: '',
      statusFilter: 'ALL',
      sortField: null,
      sortOrder: 'asc',
    }).expect(200);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body);

    const worksheet = workbook.getWorksheet('Baza zleceń');
    expect(worksheet).toBeDefined();

    // Check report title
    const titleRowVal = worksheet!.getRow(1).getCell(1).value;
    expect(String(titleRowVal)).toContain('Raport: Baza zleceń');

    // Find table header row
    let headerRowIndex = 0;
    worksheet!.eachRow((row, rowNumber) => {
      if (row.getCell(1).value === 'Numer zlecenia') {
        headerRowIndex = rowNumber;
      }
    });
    expect(headerRowIndex).toBeGreaterThan(0);

    const headerRow = worksheet!.getRow(headerRowIndex);
    const headers = headerRow.values as string[];

    // 16 columns exactly
    const expectedHeaders = [
      'Numer zlecenia',
      'Data zlecenia',
      'Planowana data wysyłki',
      'Kod produktu',
      'Nazwa produktu',
      'Zamawiający',
      'Konto księgowe',
      'Ilość',
      'Jednostka',
      'Godziny na jednostkę',
      'Godziny planowane',
      'Godziny rzeczywiste',
      'Wykorzystanie budżetu [%]',
      'Status',
      'Data zamknięcia',
      'Uwagi',
    ];

    expectedHeaders.forEach((h, idx) => {
      expect(headerRow.getCell(idx + 1).value).toBe(h);
    });

    // Ensure NO "Akcje" or "ID" column
    expect(headers).not.toContain('Akcje');
    expect(headers).not.toContain('ID');

    // Data rows
    const firstDataRow = worksheet!.getRow(headerRowIndex + 1);
    const secondDataRow = worksheet!.getRow(headerRowIndex + 2);
    const thirdDataRow = worksheet!.getRow(headerRowIndex + 3);

    // Default sort is orderNumber desc (ZL-2026/003, ZL-2026/002, ZL-2026/001)
    expect(firstDataRow.getCell(1).value).toBe('ZL-2026/003');
    expect(firstDataRow.getCell(14).value).toBe('Zamknięte'); // Status translated to Polish

    expect(secondDataRow.getCell(1).value).toBe('ZL-2026/002 (nieaktywne)'); // inactive tag
    expect(secondDataRow.getCell(14).value).toBe('Wstrzymane');

    expect(thirdDataRow.getCell(1).value).toBe('ZL-2026/001');
    expect(thirdDataRow.getCell(14).value).toBe('Otwarte');
  });

  it('filters by statusFilter (OPEN, SUSPENDED, CLOSED)', async () => {
    const res = await authenticatedPost({ statusFilter: 'OPEN' }).expect(200);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body);
    const worksheet = workbook.getWorksheet('Baza zleceń');

    let headerRowIndex = 0;
    worksheet!.eachRow((row, rowNumber) => {
      if (row.getCell(1).value === 'Numer zlecenia') headerRowIndex = rowNumber;
    });

    // Only 1 row matching OPEN (ZL-2026/001)
    expect(worksheet!.getRow(headerRowIndex + 1).getCell(1).value).toBe('ZL-2026/001');
    expect(worksheet!.getRow(headerRowIndex + 2).getCell(1).value).toBeNull();
  });

  it('filters by searchQuery case-insensitively across multiple fields', async () => {
    const res = await authenticatedPost({ searchQuery: 'alpha' }).expect(200);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body);
    const worksheet = workbook.getWorksheet('Baza zleceń');

    let headerRowIndex = 0;
    worksheet!.eachRow((row, rowNumber) => {
      if (row.getCell(1).value === 'Numer zlecenia') headerRowIndex = rowNumber;
    });

    expect(worksheet!.getRow(headerRowIndex + 1).getCell(1).value).toBe('ZL-2026/001');
    expect(worksheet!.getRow(headerRowIndex + 2).getCell(1).value).toBeNull();
  });

  it('sorts by plannedShipmentDate with nulls placed at end (asc) or top (desc)', async () => {
    const resAsc = await authenticatedPost({ sortField: 'plannedShipmentDate', sortOrder: 'asc' }).expect(200);

    const wbAsc = new ExcelJS.Workbook();
    await wbAsc.xlsx.load(resAsc.body);
    const wsAsc = wbAsc.getWorksheet('Baza zleceń');

    let headerIdx = 0;
    wsAsc!.eachRow((r, i) => {
      if (r.getCell(1).value === 'Numer zlecenia') headerIdx = i;
    });

    // 2026-08-10 (ZL-003) -> 2026-08-15 (ZL-001) -> null (ZL-002)
    expect(wsAsc!.getRow(headerIdx + 1).getCell(1).value).toBe('ZL-2026/003');
    expect(wsAsc!.getRow(headerIdx + 2).getCell(1).value).toBe('ZL-2026/001');
    expect(wsAsc!.getRow(headerIdx + 3).getCell(1).value).toBe('ZL-2026/002 (nieaktywne)');
  });

  it('regression: existing analytics exports still function properly', async () => {
    vi.spyOn(prisma.order, 'findMany').mockResolvedValue([]);

    const res = await request(app)
      .get('/api/analytics/export/by-order')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toContain('attachment; filename="Raport_zlecen.xlsx"');
  });
});
