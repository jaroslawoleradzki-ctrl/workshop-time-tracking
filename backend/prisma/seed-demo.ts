import { PrismaClient } from '@prisma/client';
import { buildDemoData, DEMO_DATE_RANGE } from './seed-demo-data';
import { validateDemoDatabaseUrl } from './seed-demo-utils';

function getSafeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Nieznany błąd walidacji DATABASE_URL.';
}

async function runDemoSeed(): Promise<void> {
  let databaseName: string;

  try {
    databaseName = validateDemoDatabaseUrl(process.env.DATABASE_URL);
  } catch (error) {
    console.error(`BŁĄD: ${getSafeErrorMessage(error)}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Baza demo: "${databaseName}"`);

  const data = buildDemoData();
  const prisma = new PrismaClient();

  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.auditLog.deleteMany();
        await tx.workTimeReport.deleteMany();
        await tx.importHistory.deleteMany();
        await tx.order.deleteMany();
        await tx.employee.deleteMany();
        await tx.workTimeType.deleteMany();
        await tx.user.deleteMany();

        await tx.user.createMany({ data: data.users });
        await tx.workTimeType.createMany({ data: data.workTimeTypes });
        await tx.employee.createMany({ data: data.employees });
        await tx.order.createMany({ data: data.orders });
        await tx.workTimeReport.createMany({ data: data.reports });
      },
      {
        maxWait: 10_000,
        timeout: 120_000,
      },
    );

    console.log('Seed demo zakończony pomyślnie.');
    console.log(`Użytkownicy: ${data.users.length}`);
    console.log(`Pracownicy: ${data.employees.length}`);
    console.log(`Typy czasu pracy: ${data.workTimeTypes.length}`);
    console.log(`Zlecenia: ${data.orders.length}`);
    console.log(`Raporty czasu pracy: ${data.reports.length}`);
    console.log(`Zakres dat: ${DEMO_DATE_RANGE.start} – ${DEMO_DATE_RANGE.end}`);
  } catch {
    console.error('BŁĄD: Seed demo nie został zapisany. Transakcja została wycofana.');
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void runDemoSeed();
