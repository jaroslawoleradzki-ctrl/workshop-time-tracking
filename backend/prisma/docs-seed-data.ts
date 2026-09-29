import type { PrismaClient } from '@prisma/client';
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
}
