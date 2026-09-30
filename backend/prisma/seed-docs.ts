import { PrismaClient } from '@prisma/client';
import { assertDocsDatabaseUrl } from './docs-db-guard';
import { seedDocs } from './docs-seed-data';

assertDocsDatabaseUrl(process.env.DATABASE_URL);
const prisma = new PrismaClient();
seedDocs(prisma, process.env.DATABASE_URL)
  .then(() => console.log('Documentation fixture prepared.'))
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(async () => prisma.$disconnect());
