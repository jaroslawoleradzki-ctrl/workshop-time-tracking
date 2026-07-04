import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding demo data...');

  // 1. Seed sample employees
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

  // 2. Seed sample orders
  const sampleOrders = [
    {
      orderNumber: 'ZL-2026-001',
      orderDate: new Date('2026-06-01T08:00:00Z'),
      productCode: 'PR-99823',
      productName: 'Silnik Elektryczny 15kW',
      accountingAccount: 'KK-90210',
      orderedBy: 'MetalWorks Sp. z o.o.',
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
      orderedBy: 'Pol-Stal S.A.',
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
      orderedBy: null,
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
      orderedBy: 'Odbiorca Indywidualny',
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
  console.log('Demo seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
