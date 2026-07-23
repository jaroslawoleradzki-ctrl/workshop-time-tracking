import { OrderStatus, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

export const DEMO_DATE_RANGE = {
  start: '2026-05-01',
  end: '2026-07-22',
} as const;

const DEMO_PASSWORD = 'LaserCAD2026!';
const DEMO_BCRYPT_SALT = '$2a$10$1234567890123456789012';
const FIXED_TIMESTAMP = new Date('2026-07-23T06:00:00.000Z');

const ADMIN_USER_ID = '00000000-0000-4000-8000-000000000001';
export const LEADER_USER_ID = '00000000-0000-4000-8000-000000000002';

const employeeNames = [
  'Adam Nowak',
  'Bartosz Mazur',
  'Cezary Wójcik',
  'Damian Król',
  'Emil Kaczmarek',
  'Filip Zając',
  'Grzegorz Pawlak',
  'Hubert Dudek',
  'Ireneusz Michalski',
  'Jakub Walczak',
  'Kamil Baran',
  'Łukasz Piotrowski',
  'Marcin Sokołowski',
  'Paweł Górski',
  'Rafał Lis',
] as const;

const productNames = [
  'Obudowa sterownika CNC',
  'Wspornik montażowy typ A',
  'Rama urządzenia transportowego',
  'Panel boczny maszyny',
  'Osłona napędu',
  'Płyta montażowa szafy elektrycznej',
  'Element konstrukcyjny hali',
  'Korpus filtra przemysłowego',
  'Uchwyt przewodu hydraulicznego',
  'Podstawa agregatu',
  'Drzwi rewizyjne',
  'Stelaż technologiczny',
  'Kołnierz stalowy DN100',
  'Pokrywa zbiornika ciśnieniowego',
  'Konsola ścienna stalowa',
  'Prowadnica liniowa osłonięta',
  'Rama montażowa lasera',
  'Uchwyt czujnika indukcyjnego',
  'Skrzynka rozdzielcza IP65',
  'Profil dystansowy L=2000',
  'Płyta fundamentowa agregatu',
  'Wspornik rurociągu DN50',
  'Łącznik kratownicy dachowej',
  'Wzmocnienie narożne ramy',
  'Pokrywa inspekcyjna silnika',
  'Kanał wentylacyjny prostokątny',
  'Osłona BHP tarczy',
  'Stojak na narzędzia warsztatowe',
  'Uchwyt montażowy paneli',
  'Płyta traserska 400x400',
] as const;

const orderedByCompanies = [
  'NordSteel Systems',
  'ProMetal Automation',
  'Fabryka Maszyn Delta',
  'Technika Przemysłowa Nova',
  'Inżynieria Procesowa Alfa',
] as const;

const accountingAccounts = ['501-10', '501-20', '502-10', '503-30'] as const;
const quantities = [8, 10, 12, 16, 20, 24, 30, 36, 40, 48] as const;
const hoursPerUnitValues = [1.25, 1.5, 2, 2.5, 3.25, 4, 4.5] as const;

const absencePeriods = [
  { employeeIndex: 0, code: 'UW', dates: ['2026-05-18', '2026-05-19', '2026-05-20'] },
  { employeeIndex: 5, code: 'UW', dates: ['2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12'] },
  { employeeIndex: 8, code: 'UW', dates: ['2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02', '2026-07-03'] },
  { employeeIndex: 9, code: 'UW', dates: ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10'] },
  { employeeIndex: 13, code: 'UW', dates: ['2026-05-25', '2026-05-26'] },
  { employeeIndex: 1, code: 'L4', dates: ['2026-05-11', '2026-05-12', '2026-05-13'] },
  { employeeIndex: 7, code: 'L4', dates: ['2026-06-22', '2026-06-23', '2026-06-24'] },
  { employeeIndex: 12, code: 'L4', dates: ['2026-07-13', '2026-07-14'] },
  { employeeIndex: 2, code: 'UŻ', dates: ['2026-06-05'] },
  { employeeIndex: 10, code: 'UŻ', dates: ['2026-07-20'] },
  { employeeIndex: 3, code: 'UOK', dates: ['2026-06-19'] },
] as const;

const saturdayAssignments: Record<string, readonly number[]> = {
  '2026-05-09': [0, 3, 6],
  '2026-05-23': [1, 7, 11],
  '2026-06-13': [2, 5, 9],
  '2026-06-27': [4, 8, 12],
  '2026-07-11': [6, 10, 14],
};

class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (Math.imul(this.state, 1_664_525) + 1_013_904_223) >>> 0;
    return this.state / 0x1_0000_0000;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  choose<T>(values: readonly T[]): T {
    return values[this.nextInt(0, values.length - 1)];
  }
}

function parseDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function getDatesInRange(startIso: string, endIso: string): Date[] {
  const dates: Date[] = [];
  const end = parseDate(endIso);

  for (let current = parseDate(startIso); current <= end; current = addUtcDays(current, 1)) {
    dates.push(current);
  }

  return dates;
}

function deterministicUuid(namespace: number, sequence: number): string {
  return `${namespace}0000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}`;
}

function getAbsenceMap(employeeIndex: number): Map<string, string> {
  const entries = absencePeriods
    .filter((period) => period.employeeIndex === employeeIndex)
    .flatMap((period) => period.dates.map((date) => [date, period.code] as const));

  return new Map(entries);
}

function pickDistinct<T>(rng: SeededRandom, values: readonly T[], count: number): T[] {
  const available = [...values];
  const result: T[] = [];

  while (result.length < count && available.length > 0) {
    const index = rng.nextInt(0, available.length - 1);
    result.push(available.splice(index, 1)[0]);
  }

  return result;
}

function splitRegularHours(rng: SeededRandom, count: number): number[] {
  if (count === 1) return [8];
  if (count === 2) return rng.choose([[4, 4], [5, 3], [6, 2]] as const).slice();
  return rng.choose([[3, 3, 2], [4, 2, 2], [2.5, 3, 2.5]] as const).slice();
}

function buildUsers(): Prisma.UserCreateManyInput[] {
  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, DEMO_BCRYPT_SALT);

  return [
    {
      id: ADMIN_USER_ID,
      username: 'demo',
      passwordHash,
      fullName: 'Administrator Demo',
      role: 'admin',
      isActive: true,
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,
    },
    {
      id: LEADER_USER_ID,
      username: 'leader',
      passwordHash,
      fullName: 'Tomasz Maj',
      role: 'leader',
      isActive: true,
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,
    },
  ];
}

function buildWorkTimeTypes(): Prisma.WorkTimeTypeCreateManyInput[] {
  return [
    { code: 'G', name: 'Standardowe godziny pracy', requiresOrder: true, isSystem: true },
    { code: 'NDR', name: 'Nadgodziny', requiresOrder: true, isSystem: true },
    { code: 'NS', name: 'Nadgodziny sobota/niedziela', requiresOrder: true, isSystem: true },
    { code: 'UW', name: 'Urlop wypoczynkowy', requiresOrder: false, isSystem: true },
    { code: 'UOK', name: 'Urlop okolicznościowy', requiresOrder: false, isSystem: true },
    { code: 'UŻ', name: 'Urlop na żądanie', requiresOrder: false, isSystem: true },
    { code: 'L4', name: 'Zwolnienie chorobowe', requiresOrder: false, isSystem: true },
  ].map((type) => ({
    ...type,
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
  }));
}

function buildEmployees(): Prisma.EmployeeCreateManyInput[] {
  return employeeNames.map((fullName, index) => {
    const [firstName, lastName] = fullName.split(' ');

    return {
      id: deterministicUuid(1, index + 1),
      fullName,
      firstName,
      lastName,
      employeeNumber: `EMP-${String(index + 1).padStart(3, '0')}`,
      isActive: true,
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,
      deletedAt: null,
    };
  });
}

function buildOrders(): Prisma.OrderCreateManyInput[] {
  return productNames.map((productName, index) => {
    const sequence = index + 1;
    const orderDate = new Date(Date.UTC(2026, 3 + (index % 2), 1 + ((index * 3) % 25), 8));
    const plannedShipmentDate = addUtcDays(orderDate, 21 + (index % 5) * 7);
    const quantity = quantities[index % quantities.length];
    const hoursPerUnit = hoursPerUnitValues[index % hoursPerUnitValues.length];
    const plannedHours = Number((quantity * hoursPerUnit).toFixed(2));
    const status =
      index < 18
        ? OrderStatus.OPEN
        : index < 20
          ? OrderStatus.SUSPENDED
          : OrderStatus.CLOSED;
    const completionDate =
      status === OrderStatus.CLOSED ? addUtcDays(orderDate, 12 + (index % 8)) : null;

    return {
      id: deterministicUuid(2, sequence),
      orderNumber: `LC-2026-${String(sequence).padStart(3, '0')}`,
      orderDate,
      plannedShipmentDate,
      productCode: `LC-P-${String(1_000 + sequence)}`,
      productName,
      accountingAccount: accountingAccounts[index % accountingAccounts.length],
      orderedBy: orderedByCompanies[index % orderedByCompanies.length],
      plannedHours,
      quantity,
      quantityUnit: 'szt.',
      hoursPerUnit,
      status,
      isActive: index < 20,
      createdAt: orderDate,
      completionDate,
      updatedAt: FIXED_TIMESTAMP,
      deletedAt: null,
    };
  });
}

function buildReports(
  employees: Prisma.EmployeeCreateManyInput[],
  orders: Prisma.OrderCreateManyInput[],
): Prisma.WorkTimeReportCreateManyInput[] {
  const reports: Prisma.WorkTimeReportCreateManyInput[] = [];
  const dates = getDatesInRange(DEMO_DATE_RANGE.start, DEMO_DATE_RANGE.end);
  const openOrders = orders.filter((order) => order.status === OrderStatus.OPEN && order.isActive);

  const addReport = (
    data: Omit<
      Prisma.WorkTimeReportCreateManyInput,
      'id' | 'createdByUserId' | 'createdAt' | 'updatedAt' | 'deletedAt'
    >,
  ) => {
    const sequence = reports.length + 1;
    const timestamp = new Date(FIXED_TIMESTAMP.getTime() + sequence * 1_000);

    reports.push({
      id: deterministicUuid(3, sequence),
      ...data,
      createdByUserId: LEADER_USER_ID,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    });
  };

  employees.forEach((employee, employeeIndex) => {
    const rng = new SeededRandom(20_260_501 + employeeIndex * 997);
    const absenceMap = getAbsenceMap(employeeIndex);

    for (const date of dates) {
      const isoDate = toIsoDate(date);
      const dayOfWeek = date.getUTCDay();
      const absenceCode = absenceMap.get(isoDate);

      if (absenceCode) {
        addReport({
          date,
          employeeId: employee.id!,
          orderId: null,
          hours: 8,
          workTimeTypeCode: absenceCode,
          modifiedByUserId: null,
          missingCard: false,
        });
        continue;
      }

      if (dayOfWeek === 0) continue;

      if (dayOfWeek === 6) {
        if (saturdayAssignments[isoDate]?.includes(employeeIndex)) {
          const availableOrders = openOrders.filter((order) => order.orderDate <= date);
          const order = rng.choose(availableOrders);

          addReport({
            date,
            employeeId: employee.id!,
            orderId: order.id,
            hours: rng.choose([4, 6, 8] as const),
            workTimeTypeCode: 'NS',
            modifiedByUserId: null,
            missingCard: rng.next() < 0.04,
          });
        }
        continue;
      }

      const availableOrders = openOrders.filter((order) => order.orderDate <= date);
      const distributionCount = rng.nextInt(1, Math.min(3, availableOrders.length));
      const selectedOrders = pickDistinct(rng, availableOrders, distributionCount);
      const hoursParts = splitRegularHours(rng, distributionCount);

      selectedOrders.forEach((order, index) => {
        addReport({
          date,
          employeeId: employee.id!,
          orderId: order.id,
          hours: hoursParts[index],
          workTimeTypeCode: 'G',
          modifiedByUserId: null,
          missingCard: rng.next() < 0.04,
        });
      });

      if (rng.next() < 0.12) {
        addReport({
          date,
          employeeId: employee.id!,
          orderId: rng.choose(availableOrders).id,
          hours: rng.choose([1, 2] as const),
          workTimeTypeCode: 'NDR',
          modifiedByUserId: null,
          missingCard: false,
        });
      }
    }
  });

  return reports;
}

export interface DemoData {
  users: Prisma.UserCreateManyInput[];
  workTimeTypes: Prisma.WorkTimeTypeCreateManyInput[];
  employees: Prisma.EmployeeCreateManyInput[];
  orders: Prisma.OrderCreateManyInput[];
  reports: Prisma.WorkTimeReportCreateManyInput[];
}

export function buildDemoData(): DemoData {
  const users = buildUsers();
  const workTimeTypes = buildWorkTimeTypes();
  const employees = buildEmployees();
  const orders = buildOrders();
  const reports = buildReports(employees, orders);

  return { users, workTimeTypes, employees, orders, reports };
}
