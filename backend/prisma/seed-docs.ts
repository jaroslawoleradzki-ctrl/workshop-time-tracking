import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { assertDocsDatabaseUrl } from './docs-db-guard';

assertDocsDatabaseUrl(process.env.DATABASE_URL);
const prisma = new PrismaClient();
const fixedTimestamp = new Date('2026-07-01T08:00:00.000Z');

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash('documentation-only-password', '$2a$10$N9qo8uLOickgx2ZMRZoMye');
  const admin = await prisma.user.upsert({ where: { username: 'docs-admin' }, update: { fullName: 'Administrator dokumentacji', role: 'admin', isActive: true }, create: { username: 'docs-admin', passwordHash, fullName: 'Administrator dokumentacji', role: 'admin', isActive: true } });
  await prisma.user.upsert({ where: { username: 'docs-leader' }, update: { fullName: 'Lider dokumentacji', role: 'leader', isActive: true }, create: { username: 'docs-leader', passwordHash, fullName: 'Lider dokumentacji', role: 'leader', isActive: true } });
  await prisma.workTimeType.upsert({ where: { code: 'G' }, update: {}, create: { code: 'G', name: 'Godziny standardowe', requiresOrder: true, isAbsence: false, isSystem: true } });
  await prisma.employee.upsert({ where: { id: '00000000-0000-4000-8000-000000000001' }, update: { fullName: 'Alicja Przykładowa', employeeNumber: 'DOC-001' }, create: { id: '00000000-0000-4000-8000-000000000001', fullName: 'Alicja Przykładowa', employeeNumber: 'DOC-001' } });
  await prisma.order.upsert({ where: { orderNumber: 'DOC-2026-001' }, update: {}, create: { orderNumber: 'DOC-2026-001', orderDate: fixedTimestamp, productCode: 'DOC-01', productName: 'Przykładowy wyrób', plannedHours: 8, quantity: 1, quantityUnit: 'szt.', hoursPerUnit: 8, status: 'OPEN' } });
  console.log(`Documentation fixture prepared for ${admin.username}.`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
