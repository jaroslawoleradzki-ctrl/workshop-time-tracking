import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const isDocsMode = process.env.DOCS_MODE === 'true';
  const dbUrl = process.env.DATABASE_URL || '';
  const dbNameMatch = dbUrl.match(/\/([^?\/]+)(\?|$)/);
  const dbName = dbNameMatch ? dbNameMatch[1] : '';

  if (!isDocsMode || !dbName.endsWith('_docs')) {
    console.error('❌ BŁĄD BEZPIECZEŃSTWA: Seed dokumentacyjny wymaga DOCS_MODE=true oraz bazy danych z sufiksem _docs.');
    console.error(`Aktualne wartości: DOCS_MODE=${process.env.DOCS_MODE}, DATABASE_URL dbName=${dbName}`);
    process.exit(1);
  }

  console.log(`🌱 Uruchamianie SEED DOKUMENTACYJNEGO w bazie '${dbName}'...`);

  // Clear existing records in proper dependency order
  await prisma.workTimeReport.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.importHistory.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.employee.deleteMany({});
  await prisma.workTimeType.deleteMany({});
  await prisma.user.deleteMany({});

  // 1. Seed users
  const salt = await bcrypt.genSalt(10);
  const adminPasswordHash = await bcrypt.hash('admin123', salt);
  const leaderPasswordHash = await bcrypt.hash('leader123', salt);

  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      passwordHash: adminPasswordHash,
      fullName: 'Administrator Systemu',
      role: 'admin',
      isActive: true,
    },
  });

  const leader = await prisma.user.create({
    data: {
      username: 'leader',
      passwordHash: leaderPasswordHash,
      fullName: 'Jan Kowalski (Lider)',
      role: 'leader',
      isActive: true,
    },
  });

  console.log('✓ Utworzono konta demonstracyjne: admin, leader');

  // 2. Seed work time types
  const workTimeTypes = [
    { code: 'G', name: 'Standardowe godziny pracy', requiresOrder: true, isSystem: true },
    { code: 'NDR', name: 'Nadgodziny', requiresOrder: true, isSystem: true },
    { code: 'NS', name: 'Nadgodziny sobota/niedziela', requiresOrder: true, isSystem: true },
    { code: 'UW', name: 'Urlop wypoczynkowy', requiresOrder: false, isSystem: true },
    { code: 'UOK', name: 'Urlop okolicznościowy', requiresOrder: false, isSystem: true },
    { code: 'UŻ', name: 'Urlop na żądanie', requiresOrder: false, isSystem: true },
    { code: 'L4', name: 'Zwolnienie chorobowe', requiresOrder: false, isSystem: true },
  ];

  for (const type of workTimeTypes) {
    await prisma.workTimeType.create({ data: type });
  }
  console.log('✓ Utworzono słownik rodzajów czasu pracy');

  // 3. Seed employees
  const empNowak = await prisma.employee.create({
    data: { fullName: 'Nowak Piotr', firstName: 'Piotr', lastName: 'Nowak', employeeNumber: 'EMP-001', isActive: true },
  });
  const empKowalski = await prisma.employee.create({
    data: { fullName: 'Kowalski Jan', firstName: 'Jan', lastName: 'Kowalski', employeeNumber: 'EMP-002', isActive: true },
  });
  const empWisniewski = await prisma.employee.create({
    data: { fullName: 'Wiśniewski Adam', firstName: 'Adam', lastName: 'Wiśniewski', employeeNumber: 'EMP-003', isActive: true },
  });
  const empWojcik = await prisma.employee.create({
    data: { fullName: 'Wójcik Mariusz', firstName: 'Mariusz', lastName: 'Wójcik', employeeNumber: 'EMP-004', isActive: true },
  });
  console.log('✓ Utworzono pracowników demonstracyjnych');

  // 4. Seed orders
  const order1 = await prisma.order.create({
    data: {
      orderNumber: 'ZL-2026-001',
      orderDate: new Date('2026-06-01T08:00:00Z'),
      plannedShipmentDate: new Date('2026-06-30T16:00:00Z'),
      productCode: 'PR-99823',
      productName: 'Silnik Elektryczny 15kW',
      accountingAccount: 'KK-90210',
      orderedBy: 'MetalWorks Sp. z o.o.',
      notes: 'Wymagana wysoka precyzja wyważenia wirnika',
      plannedHours: 50.0,
      quantity: 1.0,
      quantityUnit: 'szt.',
      hoursPerUnit: 50.0,
      status: 'OPEN',
      isActive: true,
    },
  });

  const order2 = await prisma.order.create({
    data: {
      orderNumber: 'ZL-2026-002',
      orderDate: new Date('2026-06-02T08:00:00Z'),
      plannedShipmentDate: new Date('2026-06-25T16:00:00Z'),
      productCode: 'PR-99824',
      productName: 'Wał Napędowy silnika',
      accountingAccount: 'KK-90210',
      orderedBy: 'Pol-Stal S.A.',
      notes: 'Hartowanie powierzchniowe czopów',
      plannedHours: 20.0,
      quantity: 2.0,
      quantityUnit: 'szt.',
      hoursPerUnit: 10.0,
      status: 'OPEN',
      isActive: true,
    },
  });

  const order3 = await prisma.order.create({
    data: {
      orderNumber: 'ZL-2026-003',
      orderDate: new Date('2026-06-03T08:00:00Z'),
      plannedShipmentDate: new Date('2026-07-15T16:00:00Z'),
      productCode: 'PR-99825',
      productName: 'Obudowa pompy hydraulicznej',
      accountingAccount: 'KK-80100',
      orderedBy: 'HydraTech Sp. k.',
      notes: 'Oczekiwanie na dostawę odlewu aluminium',
      plannedHours: 40.0,
      quantity: 1.0,
      quantityUnit: 'szt.',
      hoursPerUnit: 40.0,
      status: 'SUSPENDED',
      isActive: true,
    },
  });

  const order4 = await prisma.order.create({
    data: {
      orderNumber: 'ZL-2026-004',
      orderDate: new Date('2026-05-10T08:00:00Z'),
      completionDate: new Date('2026-06-05T16:00:00Z'),
      productCode: 'PR-99826',
      productName: 'Koło zębate m=4 z=30',
      accountingAccount: 'KK-80100',
      orderedBy: 'Odbiorca Indywidualny',
      notes: 'Zlecenie zrealizowane i odebrane',
      plannedHours: 10.0,
      quantity: 4.0,
      quantityUnit: 'szt.',
      hoursPerUnit: 2.5,
      status: 'CLOSED',
      isActive: true,
    },
  });

  console.log('✓ Utworzono zlecenia demonstracyjne ZL-2026-001..004');

  // 5. Seed sample work time reports
  const fixedDate = new Date('2026-06-08T00:00:00Z');

  await prisma.workTimeReport.create({
    data: {
      date: fixedDate,
      employeeId: empNowak.id,
      orderId: order1.id,
      hours: 8.0,
      workTimeTypeCode: 'G',
      createdByUserId: admin.id,
      missingCard: false,
    },
  });

  await prisma.workTimeReport.create({
    data: {
      date: fixedDate,
      employeeId: empKowalski.id,
      orderId: order2.id,
      hours: 8.0,
      workTimeTypeCode: 'G',
      createdByUserId: leader.id,
      missingCard: true, // Sample missing card entry for documentation
    },
  });

  await prisma.workTimeReport.create({
    data: {
      date: fixedDate,
      employeeId: empWisniewski.id,
      orderId: null,
      hours: 8.0,
      workTimeTypeCode: 'UW',
      createdByUserId: admin.id,
      missingCard: false,
    },
  });

  console.log('✓ Utworzono raporty czasu pracy i braków kart');
  console.log('✅ SEED DOKUMENTACYJNY ZAKOŃCZONY POMYŚLNIE!');
}

main()
  .catch((e) => {
    console.error('❌ Błąd podczas wykonywania seeda dokumentacyjnego:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
