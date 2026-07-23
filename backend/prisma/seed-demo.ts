import { PrismaClient, OrderStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { getDatabaseName, validateDatabaseName } from './seed-demo-utils';

const prisma = new PrismaClient();

class SeededRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  next(): number {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  choose<T>(arr: T[]): T {
    return arr[this.nextInt(0, arr.length - 1)];
  }
}

function getDatesInRange(startDateStr: string, endDateStr: string): Date[] {
  const dates: Date[] = [];
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const current = new Date(start);
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function generateAbsencesForEmployee(rng: SeededRandom, dates: Date[]): Map<string, string> {
  const absenceMap = new Map<string, string>();
  const numAbsences = rng.nextInt(0, 3);

  for (let i = 0; i < numAbsences; i++) {
    let startIndex = rng.nextInt(5, dates.length - 10);
    while (dates[startIndex].getDay() === 0 || dates[startIndex].getDay() === 6) {
      startIndex++;
    }

    const randType = rng.next();
    let code = 'UW';
    let duration = 1;

    if (randType < 0.5) {
      code = 'UW';
      duration = rng.nextInt(2, 5);
    } else if (randType < 0.8) {
      code = 'L4';
      duration = rng.nextInt(3, 7);
    } else if (randType < 0.9) {
      code = 'UŻ';
      duration = 1;
    } else {
      code = 'UOK';
      duration = 1;
    }

    let daysMarked = 0;
    let idx = startIndex;
    while (daysMarked < duration && idx < dates.length) {
      const d = dates[idx];
      const dayOfWeek = d.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        const dateKey = d.toISOString().split('T')[0];
        if (!absenceMap.has(dateKey)) {
          absenceMap.set(dateKey, code);
          daysMarked++;
        }
      }
      idx++;
    }
  }

  return absenceMap;
}

async function main() {
  console.log('Validating database environment...');

  const dbUrl = process.env.DATABASE_URL;
  const dbName = getDatabaseName(dbUrl);

  console.log(`Extracted database name: "${dbName}"`);

  if (!validateDatabaseName(dbName)) {
    console.error('ERROR: DATABASE_URL does not point to a _demo database!');
    console.error(`Attempted target: "${dbName}"`);
    console.error('Seeding aborted for security reasons.');
    process.exit(1);
  }

  console.log(`Starting seed-demo against target database: "${dbName}"`);

  // 1. Clear existing data
  console.log('Cleaning existing data in database...');
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.workTimeReport.deleteMany(),
    prisma.importHistory.deleteMany(),
    prisma.order.deleteMany(),
    prisma.employee.deleteMany(),
    prisma.workTimeType.deleteMany(),
    prisma.user.deleteMany(),
  ]);
  console.log('Database cleaned.');

  // 2. Seed Users
  console.log('Seeding demo users...');
  const salt = bcrypt.genSaltSync(10);
  const demoPasswordHash = bcrypt.hashSync('LaserCAD2026!', salt);

  const adminUser = await prisma.user.create({
    data: {
      username: 'demo',
      passwordHash: demoPasswordHash,
      fullName: 'Administrator Demo',
      role: 'admin',
      isActive: true,
    },
  });

  const leaderUser = await prisma.user.create({
    data: {
      username: 'leader',
      passwordHash: demoPasswordHash,
      fullName: 'Tomasz Maj',
      role: 'leader',
      isActive: true,
    },
  });
  console.log('Users seeded.');

  // 3. Seed Work Time Types
  console.log('Seeding work time types...');
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
  console.log('Work time types seeded.');

  // 4. Seed Employees
  console.log('Seeding employees...');
  const employeeNames = [
    'Adam Nowak', 'Bartosz Mazur', 'Cezary Wójcik', 'Damian Król', 'Emil Kaczmarek',
    'Filip Zając', 'Grzegorz Pawlak', 'Hubert Dudek', 'Ireneusz Michalski', 'Jakub Walczak',
    'Kamil Baran', 'Łukasz Piotrowski', 'Marcin Sokołowski', 'Paweł Górski', 'Rafał Lis'
  ];

  const employees: any[] = [];
  for (let i = 0; i < employeeNames.length; i++) {
    const name = employeeNames[i];
    const parts = name.split(' ');
    const emp = await prisma.employee.create({
      data: {
        fullName: name,
        firstName: parts[0],
        lastName: parts[1],
        employeeNumber: `EMP-${String(i + 1).padStart(3, '0')}`,
        isActive: true,
      },
    });
    employees.push(emp);
  }
  console.log(`${employees.length} employees seeded.`);

  // 5. Seed Orders
  console.log('Seeding orders...');
  const productTemplates = [
    'Obudowa sterownika CNC', 'Wspornik montażowy typ A', 'Rama urządzenia transportowego',
    'Panel boczny maszyny', 'Osłona napędu', 'Płyta montażowa szafy elektrycznej',
    'Element konstrukcyjny hali', 'Korpus filtra przemysłowego', 'Uchwyt przewodu hydraulicznego',
    'Podstawa agregatu', 'Drzwi rewizyjne', 'Stelaż technologiczny', 'Kołnierz stalowy DN100',
    'Pokrywa zbiornika ciśnieniowego', 'Konsola ścienna stalowa', 'Prowadnica liniowa osłonięta',
    'Rama montażowa lasera', 'Uchwyt czujnika indukcyjnego', 'Skrzynka rozdzielcza IP65',
    'Profil dystansowy L=2000', 'Płyta fundamentowa agregatu', 'Wspornik rurociągu DN50',
    'Łącznik kratownicy dachowej', 'Wzmocnienie narożne ramy', 'Pokrywa inspekcyjna silnika',
    'Kanał wentylacyjny prostokątny', 'Osłona BHP tarczy', 'Stojak na narzędzia warsztatowe',
    'Uchwyt montażowy paneli', 'Płyta traserska 400x400'
  ];

  const orderedByCompanies = ['LaserCut Sp. z o.o.', 'MetalBuilder S.A.', 'StalTech', 'CNC-Solutions', 'Bud-Stal'];
  const accounts = ['KK-901', 'KK-902', 'KK-801', 'KK-802'];

  const orders: any[] = [];
  const orderSeedRng = new SeededRandom(777);

  for (let i = 1; i <= 30; i++) {
    const orderNumber = `LC-2026-${String(i).padStart(3, '0')}`;
    const product = productTemplates[i - 1];

    // Deterministic dates in 2026
    const startDay = orderSeedRng.nextInt(1, 28);
    const startMonth = orderSeedRng.nextInt(4, 5); // April or May
    const orderDate = new Date(`2026-0${startMonth}-${String(startDay).padStart(2, '0')}T08:00:00Z`);

    const shipmentDays = orderSeedRng.nextInt(15, 45);
    const plannedShipmentDate = new Date(orderDate.getTime() + shipmentDays * 24 * 60 * 60 * 1000);

    const plannedHours = orderSeedRng.nextInt(20, 150);
    const quantity = orderSeedRng.nextInt(5, 50);
    const hoursPerUnit = Number((plannedHours / quantity).toFixed(2));

    const status = i <= 20 ? (orderSeedRng.next() < 0.1 ? OrderStatus.SUSPENDED : OrderStatus.OPEN) : OrderStatus.CLOSED;
    let completionDate: Date | null = null;
    if (status === OrderStatus.CLOSED) {
      completionDate = new Date(orderDate.getTime() + orderSeedRng.nextInt(10, shipmentDays) * 24 * 60 * 60 * 1000);
    }

    const ord = await prisma.order.create({
      data: {
        orderNumber,
        orderDate,
        plannedShipmentDate,
        productCode: `PR-${orderSeedRng.nextInt(10000, 99999)}`,
        productName: product,
        accountingAccount: orderSeedRng.choose(accounts),
        orderedBy: orderSeedRng.choose(orderedByCompanies),
        plannedHours: plannedHours,
        quantity: quantity,
        quantityUnit: 'szt.',
        hoursPerUnit: hoursPerUnit,
        status,
        isActive: true,
        completionDate,
      },
    });
    orders.push(ord);
  }
  console.log(`${orders.length} orders seeded.`);

  // 6. Seed Work Time Reports
  console.log('Seeding work time reports...');
  const dates = getDatesInRange('2026-05-01', '2026-07-22');
  let reportsCreated = 0;

  for (let empIdx = 0; empIdx < employees.length; empIdx++) {
    const employee = employees[empIdx];
    const rng = new SeededRandom(empIdx * 1000 + 42);

    const absenceMap = generateAbsencesForEmployee(rng, dates);

    for (const d of dates) {
      const dateKey = d.toISOString().split('T')[0];
      const dayOfWeek = d.getDay(); // 0 is Sunday, 6 is Saturday

      // 1. Check if absent
      if (absenceMap.has(dateKey)) {
        const code = absenceMap.get(dateKey)!;
        await prisma.workTimeReport.create({
          data: {
            date: d,
            employeeId: employee.id,
            orderId: null,
            hours: 8.00,
            workTimeTypeCode: code,
            createdByUserId: leaderUser.id,
            missingCard: false,
          },
        });
        reportsCreated++;
        continue;
      }

      // 2. Weekends
      if (dayOfWeek === 0) {
        // Sunday: No work
        continue;
      }

      if (dayOfWeek === 6) {
        // Saturday: 10% chance to work NS
        if (rng.next() < 0.1) {
          // Find active orders at this date
          const activeOrders = orders.filter(o => o.orderDate <= d && o.status !== OrderStatus.CLOSED);
          const order = activeOrders.length > 0 ? rng.choose(activeOrders) : rng.choose(orders);
          const hours = rng.choose([4, 6, 8]);
          await prisma.workTimeReport.create({
            data: {
              date: d,
              employeeId: employee.id,
              orderId: order.id,
              hours: hours,
              workTimeTypeCode: 'NS',
              createdByUserId: leaderUser.id,
              missingCard: rng.next() < 0.05,
            },
          });
          reportsCreated++;
        }
        continue;
      }

      // 3. Regular working days (Mon-Fri)
      // Find active orders at this date
      const activeOrders = orders.filter(o => o.orderDate <= d && o.status !== OrderStatus.CLOSED);
      const availableOrders = activeOrders.length > 0 ? activeOrders : orders;

      // Distribute 8 hours across 1-3 orders
      const numDistribution = rng.nextInt(1, 3);
      if (numDistribution === 1) {
        const order = rng.choose(availableOrders);
        await prisma.workTimeReport.create({
          data: {
            date: d,
            employeeId: employee.id,
            orderId: order.id,
            hours: 8.00,
            workTimeTypeCode: 'G',
            createdByUserId: leaderUser.id,
            missingCard: rng.next() < 0.05, // 5% chance of missing card
          },
        });
        reportsCreated++;
      } else if (numDistribution === 2) {
        const order1 = rng.choose(availableOrders);
        let order2 = rng.choose(availableOrders);
        if (order1.id === order2.id && availableOrders.length > 1) {
          order2 = availableOrders.find(o => o.id !== order1.id)!;
        }
        const hours1 = rng.choose([4.00, 5.00, 6.00]);
        const hours2 = 8.00 - hours1;

        await prisma.workTimeReport.create({
          data: {
            date: d,
            employeeId: employee.id,
            orderId: order1.id,
            hours: hours1,
            workTimeTypeCode: 'G',
            createdByUserId: leaderUser.id,
            missingCard: rng.next() < 0.03,
          },
        });
        await prisma.workTimeReport.create({
          data: {
            date: d,
            employeeId: employee.id,
            orderId: order2.id,
            hours: hours2,
            workTimeTypeCode: 'G',
            createdByUserId: leaderUser.id,
            missingCard: rng.next() < 0.03,
          },
        });
        reportsCreated += 2;
      } else {
        // 3 orders
        const order1 = rng.choose(availableOrders);
        let order2 = rng.choose(availableOrders);
        let order3 = rng.choose(availableOrders);
        if (availableOrders.length >= 3) {
          while (order2.id === order1.id) {
            order2 = rng.choose(availableOrders);
          }
          while (order3.id === order1.id || order3.id === order2.id) {
            order3 = rng.choose(availableOrders);
          }
        }
        const hours1 = 3.00;
        const hours2 = 3.00;
        const hours3 = 2.00;

        await prisma.workTimeReport.create({
          data: {
            date: d,
            employeeId: employee.id,
            orderId: order1.id,
            hours: hours1,
            workTimeTypeCode: 'G',
            createdByUserId: leaderUser.id,
          },
        });
        await prisma.workTimeReport.create({
          data: {
            date: d,
            employeeId: employee.id,
            orderId: order2.id,
            hours: hours2,
            workTimeTypeCode: 'G',
            createdByUserId: leaderUser.id,
          },
        });
        await prisma.workTimeReport.create({
          data: {
            date: d,
            employeeId: employee.id,
            orderId: order3.id,
            hours: hours3,
            workTimeTypeCode: 'G',
            createdByUserId: leaderUser.id,
          },
        });
        reportsCreated += 3;
      }

      // Occasional Overtime (NDR)
      if (rng.next() < 0.15) {
        const order = rng.choose(availableOrders);
        const hours = rng.choose([1, 2]);
        await prisma.workTimeReport.create({
          data: {
            date: d,
            employeeId: employee.id,
            orderId: order.id,
            hours: hours,
            workTimeTypeCode: 'NDR',
            createdByUserId: leaderUser.id,
          },
        });
        reportsCreated++;
      }
    }
  }

  console.log(`Demo seed completed successfully! Generated ${reportsCreated} work time reports.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
