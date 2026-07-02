import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Seed default user (Administrator)
  const adminUsername = 'admin';
  const adminPassword = 'admin123';
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(adminPassword, salt);

  const admin = await prisma.user.upsert({
    where: { username: adminUsername },
    update: {},
    create: {
      username: adminUsername,
      passwordHash: passwordHash,
      fullName: 'Administrator',
      role: 'admin',
      isActive: true,
    },
  });
  console.log(`Admin user created/verified: ${admin.username} (password: ${adminPassword})`);

  // Seed a sample leader for testing
  const leaderUsername = 'leader';
  const leaderPassword = 'leader123';
  const leaderHash = await bcrypt.hash(leaderPassword, salt);
  const leader = await prisma.user.upsert({
    where: { username: leaderUsername },
    update: {},
    create: {
      username: leaderUsername,
      passwordHash: leaderHash,
      fullName: 'Jan Kowalski (Leader)',
      role: 'leader',
      isActive: true,
    },
  });
  console.log(`Leader user created/verified: ${leader.username} (password: ${leaderPassword})`);

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
    await prisma.workTimeType.upsert({
      where: { code: type.code },
      update: {
        name: type.name,
        requiresOrder: type.requiresOrder,
        isSystem: type.isSystem,
      },
      create: type,
    });
  }
  console.log('Work time types seeded.');

  // 3. Seed sample employees
  const sampleEmployees = [
    { fullName: 'Nowak Piotr', isActive: true },
    { fullName: 'Kowalski Jan', isActive: true },
    { fullName: 'Wiśniewski Adam', isActive: true },
    { fullName: 'Wójcik Mariusz', isActive: true },
    { fullName: 'Kowalczyk Robert', isActive: false }, // Inactive employee
  ];

  for (const emp of sampleEmployees) {
    const existing = await prisma.employee.findFirst({
      where: { fullName: emp.fullName, deletedAt: null },
    });
    if (!existing) {
      await prisma.employee.create({ data: emp });
    }
  }
  console.log('Sample employees seeded.');

  // 4. Seed sample orders
  const sampleOrders = [
    {
      orderNumber: 'ZL-2026-001',
      orderDate: new Date('2026-06-01T08:00:00Z'),
      productCode: 'PR-99823',
      productName: 'Silnik Elektryczny 15kW',
      accountingAccount: 'KK-90210',
      plannedHours: 50.0,
      quantity: 1.0,
      quantityUnit: 'szt.',
      hoursPerUnit: 50.0,
      status: 'OPEN' as const,
    },
    {
      orderNumber: 'ZL-2026-002',
      orderDate: new Date('2026-06-02T08:00:00Z'),
      productCode: 'PR-99824',
      productName: 'Wał Napędowy silnika',
      accountingAccount: 'KK-90210',
      plannedHours: 20.0,
      quantity: 1.0,
      quantityUnit: 'szt.',
      hoursPerUnit: 20.0,
      status: 'OPEN' as const,
    },
    {
      orderNumber: 'ZL-2026-003',
      orderDate: new Date('2026-06-03T08:00:00Z'),
      productCode: 'PR-99825',
      productName: 'Obudowa pompy hydraulicznej',
      accountingAccount: 'KK-80100',
      plannedHours: 40.0,
      quantity: 1.0,
      quantityUnit: 'szt.',
      hoursPerUnit: 40.0,
      status: 'SUSPENDED' as const,
    },
    {
      orderNumber: 'ZL-2026-004',
      orderDate: new Date('2026-06-04T08:00:00Z'),
      productCode: 'PR-99826',
      productName: 'Koło zębate m=4 z=30',
      accountingAccount: 'KK-80100',
      plannedHours: 10.0,
      quantity: 1.0,
      quantityUnit: 'szt.',
      hoursPerUnit: 10.0,
      status: 'CLOSED' as const,
      completionDate: new Date('2026-06-05T16:00:00Z'),
    },
  ];

  for (const order of sampleOrders) {
    const existing = await prisma.order.findUnique({
      where: { orderNumber: order.orderNumber },
    });
    if (!existing) {
      await prisma.order.create({
        data: order,
      });
    }
  }
  console.log('Sample orders seeded.');
  console.log('Database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
