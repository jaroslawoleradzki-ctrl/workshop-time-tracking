import { Prisma, type PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { assertDocsDatabaseUrl } from './docs-db-guard';

const fixedTimestamp = new Date('2026-07-01T08:00:00.000Z');
const fixedPasswordSalt = '$2a$10$N9qo8uLOickgx2ZMRZoMye';

export async function seedDocs(prisma: PrismaClient, databaseUrl: string | undefined): Promise<void> {
  assertDocsDatabaseUrl(databaseUrl);
  const passwordHash = await bcrypt.hash('documentation-only-password', fixedPasswordSalt);
  const users = [
    { id: '00000000-0000-4000-8000-000000000101', username: 'docs-admin', fullName: 'Administrator dokumentacji', role: 'admin' },
    { id: '00000000-0000-4000-8000-000000000102', username: 'docs-leader', fullName: 'Lider dokumentacji', role: 'leader' },
  ];
  for (const user of users) {
    const data = { ...user, passwordHash, isActive: true, createdAt: fixedTimestamp, updatedAt: fixedTimestamp };
    await prisma.user.upsert({ where: { username: user.username }, update: data, create: data });
  }

  const workTimeType = { code: 'G', name: 'Godziny standardowe', requiresOrder: true, isAbsence: false, isSystem: true, createdAt: fixedTimestamp, updatedAt: fixedTimestamp };
  await prisma.workTimeType.upsert({ where: { code: workTimeType.code }, update: workTimeType, create: workTimeType });
  const absenceType = { code: 'WKU', name: 'WKU', requiresOrder: false, isAbsence: true, isSystem: false, createdAt: fixedTimestamp, updatedAt: fixedTimestamp };
  await prisma.workTimeType.upsert({ where: { code: absenceType.code }, update: absenceType, create: absenceType });

  const employee = { id: '00000000-0000-4000-8000-000000000001', fullName: 'Alicja Przykładowa', firstName: 'Alicja', lastName: 'Przykładowa', employeeNumber: 'DOC-001', isActive: true, createdAt: fixedTimestamp, updatedAt: fixedTimestamp, deletedAt: null };
  await prisma.employee.upsert({ where: { id: employee.id }, update: employee, create: employee });

  const order = { id: '00000000-0000-4000-8000-000000000201', orderNumber: 'DOC-2026-001', orderDate: fixedTimestamp, plannedShipmentDate: null, productCode: 'DOC-01', productName: 'Przykładowy wyrób', accountingAccount: null, orderedBy: null, notes: null, plannedHours: 8, quantity: 1, quantityUnit: 'szt.', hoursPerUnit: 8, status: 'OPEN' as const, isActive: true, createdAt: fixedTimestamp, completionDate: null, updatedAt: fixedTimestamp, deletedAt: null };
  await prisma.order.upsert({ where: { orderNumber: order.orderNumber }, update: order, create: order });

  const reports = [
    { id: '00000000-0000-4000-8000-000000000301', date: new Date('2026-07-07T00:00:00.000Z'), hours: 2, workTimeTypeCode: 'G', workShift: 'FIRST' as const, orderId: order.id },
    { id: '00000000-0000-4000-8000-000000000302', date: new Date('2026-07-07T00:00:00.000Z'), hours: 2, workTimeTypeCode: 'G', workShift: 'SECOND' as const, orderId: order.id },
    { id: '00000000-0000-4000-8000-000000000303', date: new Date('2026-07-07T00:00:00.000Z'), hours: 2, workTimeTypeCode: 'G', workShift: 'THIRD' as const, orderId: order.id },
    { id: '00000000-0000-4000-8000-000000000304', date: new Date('2026-07-09T00:00:00.000Z'), hours: 8, workTimeTypeCode: 'WKU', workShift: null, orderId: null },
    { id: '00000000-0000-4000-8000-000000000305', date: new Date('2026-07-10T00:00:00.000Z'), hours: 8, workTimeTypeCode: 'WKU', workShift: null, orderId: null },
  ];
  for (const report of reports) {
    const data = { ...report, employeeId: employee.id, createdByUserId: users[1].id, modifiedByUserId: null, missingCard: false, deletedAt: null, createdAt: fixedTimestamp, updatedAt: fixedTimestamp };
    await prisma.workTimeReport.upsert({ where: { id: report.id }, update: data, create: data });
  }

  const exception = { id: '00000000-0000-4000-8000-000000000401', date: new Date('2026-07-11T00:00:00.000Z'), isWorkingDay: true, reason: 'Przykładowa sobota robocza', createdAt: fixedTimestamp, updatedAt: fixedTimestamp };
  await prisma.companyCalendarDay.upsert({ where: { date: exception.date }, update: exception, create: exception });
  const importRow = { id: '00000000-0000-4000-8000-000000000501', filename: 'przyklad-pracownicy.xlsx', importType: 'employees', importedById: users[0].id, status: 'success', totalRows: 1, successRows: 1, errorRows: 0, errorsLog: Prisma.DbNull, createdAt: fixedTimestamp };
  await prisma.importHistory.upsert({ where: { id: importRow.id }, update: importRow, create: importRow });
}
