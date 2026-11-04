import { mkdtempSync, cpSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('backend/package.json'));
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const temp = mkdtempSync(path.join(tmpdir(), 'wtt-qa-migrations-'));
try {
  const tables = await db.$queryRaw`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`;
  if (tables[0].n !== 0) throw new Error('QA requires a fresh isolated database; refusing to modify an existing database');
  cpSync('backend/prisma/schema.prisma', path.join(temp, 'schema.prisma'));
  const migrations = readdirSync('backend/prisma/migrations').filter(n => /^\d/.test(n)).sort();
  const correction = migrations.indexOf('20261104090056_add_work_time_accounting_category');
  if (correction < 0) throw new Error('Accounting migration missing');
  for (const name of migrations.slice(0, correction)) cpSync(path.join('backend/prisma/migrations', name), path.join(temp, 'migrations', name), { recursive: true });
  execFileSync(path.resolve('backend/node_modules/.bin/prisma'), ['migrate', 'deploy', '--schema', path.join(temp, 'schema.prisma')], { stdio: 'inherit' });
  await db.$executeRaw`INSERT INTO work_time_types (code,name,requires_order,is_absence,is_system,updated_at) VALUES ('OK','Oddanie krwi',false,false,false,now()),('SZK','Szkolenie',false,false,false,now())`;
  execFileSync(path.resolve('backend/node_modules/.bin/prisma'), ['migrate', 'deploy', '--schema', path.resolve('backend/prisma/schema.prisma')], { stdio: 'inherit' });
  console.log('PASS: upgrade from pre-accounting schema; OK corrected, other types retained for integration assertions');
} finally { await db.$disconnect(); rmSync(temp, { recursive: true, force: true }); }
