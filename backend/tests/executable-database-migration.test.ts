import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const CONTAINER_NAME = 'wtt-disposable-migration-test-pg';
const DB_PORT = '5438';
const DB_USER = 'postgres';
const DB_PASS = 'postgres';

const UPGRADE_DB = 'test_upgrade_db';
const FRESH_DB = 'test_fresh_db';

const UPGRADE_URL = `postgresql://${DB_USER}:${DB_PASS}@localhost:${DB_PORT}/${UPGRADE_DB}?schema=public`;
const FRESH_URL = `postgresql://${DB_USER}:${DB_PASS}@localhost:${DB_PORT}/${FRESH_DB}?schema=public`;

let hasDocker = false;

describe('Executable Database Migration and Production Seed Tests (v0.5.4)', () => {
  beforeAll(async () => {
    try {
      execSync('docker --version', { stdio: 'ignore' });
      hasDocker = true;
    } catch {
      console.warn('Docker not available; skipping executable database migration tests.');
      return;
    }

    // Ensure any leftover container is removed
    try {
      execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'ignore' });
    } catch {}

    // Spin up a disposable postgres container
    execSync(
      `docker run --name ${CONTAINER_NAME} -e POSTGRES_PASSWORD=${DB_PASS} -p ${DB_PORT}:5432 -d postgres:16-alpine`,
      { stdio: 'ignore' },
    );

    // Wait for PostgreSQL to be ready
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        execSync(`docker exec ${CONTAINER_NAME} pg_isready -U ${DB_USER}`, { stdio: 'ignore' });
        ready = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    if (!ready) {
      throw new Error('Disposable postgres container failed to become ready.');
    }

    // Create databases for upgrade and fresh scenarios
    execSync(`docker exec ${CONTAINER_NAME} psql -U ${DB_USER} -c "CREATE DATABASE ${UPGRADE_DB};"`, { stdio: 'ignore' });
    execSync(`docker exec ${CONTAINER_NAME} psql -U ${DB_USER} -c "CREATE DATABASE ${FRESH_DB};"`, { stdio: 'ignore' });
  }, 60000);

  afterAll(async () => {
    if (hasDocker) {
      try {
        execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'ignore' });
      } catch {}
    }
  });

  describe('Scenario A: Upgrading an existing database with custom WKU, custom OP, and colliding types', () => {
    let prismaUpgrade: PrismaClient;

    beforeAll(async () => {
      if (!hasDocker) return;

      const migrationsDir = resolve(__dirname, '../prisma/migrations');
      const allMigrations = readdirSync(migrationsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && d.name.startsWith('20'))
        .map((d) => d.name)
        .sort();

      // Apply migrations 1 through 9 (pre-v0.5.4)
      const preFeatureMigrations = allMigrations.filter(
        (name) => !name.includes('20260908120000_canonical_work_time_types_hardening'),
      );

      for (const m of preFeatureMigrations) {
        const sqlFile = resolve(migrationsDir, m, 'migration.sql');
        const sql = readFileSync(sqlFile, 'utf8');
        execSync(`docker exec -i ${CONTAINER_NAME} psql -U ${DB_USER} -d ${UPGRADE_DB}`, {
          input: sql,
          stdio: ['pipe', 'ignore', 'pipe'],
        });
      }

      prismaUpgrade = new PrismaClient({
        datasources: { db: { url: UPGRADE_URL } },
      });

      // 1. Seed standard system types (G, NDR, NS, UW, UOK, UŻ, L4) as they existed in v0.5.3
      const standardTypes = [
        { code: 'G', name: 'Standardowe godziny pracy', requiresOrder: true, isAbsence: false, isSystem: true },
        { code: 'NDR', name: 'Nadgodziny', requiresOrder: true, isAbsence: false, isSystem: true },
        { code: 'NS', name: 'Nadgodziny sobota/niedziela', requiresOrder: true, isAbsence: false, isSystem: true },
        { code: 'UW', name: 'Urlop wypoczynkowy', requiresOrder: false, isAbsence: true, isSystem: true },
        { code: 'UOK', name: 'Urlop okolicznościowy', requiresOrder: false, isAbsence: true, isSystem: true },
        { code: 'UŻ', name: 'Urlop na żądanie', requiresOrder: false, isAbsence: true, isSystem: true },
        { code: 'L4', name: 'Zwolnienie chorobowe', requiresOrder: false, isAbsence: true, isSystem: true },
      ];
      for (const st of standardTypes) {
        await prismaUpgrade.workTimeType.create({ data: st });
      }

      // 2. Insert custom/client types that existed in production before v0.5.4:
      // - Custom WKU: client-created (is_system=false, custom name, requires_order=false, is_absence=false)
      await prismaUpgrade.workTimeType.create({
        data: {
          code: 'WKU',
          name: 'Wojsko / WCR Klienta',
          requiresOrder: false,
          isAbsence: false,
          isSystem: false,
        },
      });

      // - Custom OP: client-created (is_system=false, custom name, requires_order=false, is_absence=false)
      await prismaUpgrade.workTimeType.create({
        data: {
          code: 'OP',
          name: 'Opieka nad dzieckiem (Klient)',
          requiresOrder: false,
          isAbsence: false,
          isSystem: false,
        },
      });

      // - Custom NN: client-created (is_system=false, custom name, requires_order=false, is_absence=false)
      await prismaUpgrade.workTimeType.create({
        data: {
          code: 'NN',
          name: 'Nieobecność nieusprawiedliwiona (Custom)',
          requiresOrder: false,
          isAbsence: false,
          isSystem: false,
        },
      });

      // - Unrelated custom type: XYZ
      await prismaUpgrade.workTimeType.create({
        data: {
          code: 'XYZ',
          name: 'Projekt specjalny XYZ',
          requiresOrder: true,
          isAbsence: false,
          isSystem: false,
        },
      });

      // 3. Insert historical employee, user, order, and reports referencing these types
      const user = await prismaUpgrade.user.create({
        data: {
          username: 'admin',
          passwordHash: 'dummy',
          fullName: 'Administrator',
          role: 'admin',
          isActive: true,
        },
      });

      const emp = await prismaUpgrade.employee.create({
        data: {
          firstName: 'Jan',
          lastName: 'Kowalski',
          fullName: 'Jan Kowalski',
          employeeNumber: 'EMP-001',
          isActive: true,
        },
      });

      const order = await prismaUpgrade.order.create({
        data: {
          orderNumber: 'ZL-HIST-001',
          productCode: 'PR-HIST',
          productName: 'Produkt Historyczny',
          plannedHours: 40,
          quantity: 1,
          quantityUnit: 'szt.',
          hoursPerUnit: 40,
          status: 'OPEN',
          orderDate: new Date('2026-08-01T00:00:00.000Z'),
        },
      });

      // Historical reports referencing WKU, OP, NN, XYZ, and G
      await prismaUpgrade.workTimeReport.createMany({
        data: [
          {
            id: '11111111-1111-4000-8000-000000000001',
            employeeId: emp.id,
            workTimeTypeCode: 'WKU',
            date: new Date('2026-08-10T00:00:00.000Z'),
            hours: 8,
            orderId: null,
            createdByUserId: user.id,
          },
          {
            id: '22222222-2222-4000-8000-000000000002',
            employeeId: emp.id,
            workTimeTypeCode: 'OP',
            date: new Date('2026-08-11T00:00:00.000Z'),
            hours: 8,
            orderId: null,
            createdByUserId: user.id,
          },
          {
            id: '33333333-3333-4000-8000-000000000003',
            employeeId: emp.id,
            workTimeTypeCode: 'NN',
            date: new Date('2026-08-12T00:00:00.000Z'),
            hours: 8,
            orderId: null,
            createdByUserId: user.id,
          },
          {
            id: '44444444-4444-4000-8000-000000000004',
            employeeId: emp.id,
            workTimeTypeCode: 'XYZ',
            date: new Date('2026-08-13T00:00:00.000Z'),
            hours: 8,
            orderId: order.id,
            createdByUserId: user.id,
          },
          {
            id: '55555555-5555-4000-8000-000000000005',
            employeeId: emp.id,
            workTimeTypeCode: 'G',
            date: new Date('2026-08-14T00:00:00.000Z'),
            hours: 8,
            orderId: order.id,
            createdByUserId: user.id,
          },
        ],
      });
    }, 60000);

    afterAll(async () => {
      if (prismaUpgrade) {
        await prismaUpgrade.$disconnect();
      }
    });

    it('applies migration 20260908120000 and runs seed.ts safely preserving custom records', async () => {
      if (!hasDocker) return;

      // 1. Execute migration 10 SQL
      const migrationFile = resolve(
        __dirname,
        '../prisma/migrations/20260908120000_canonical_work_time_types_hardening/migration.sql',
      );
      const migrationSql = readFileSync(migrationFile, 'utf8');
      execSync(`docker exec -i ${CONTAINER_NAME} psql -U ${DB_USER} -d ${UPGRADE_DB}`, {
        input: migrationSql,
        stdio: ['pipe', 'ignore', 'pipe'],
      });

      // 2. Execute production seed (equivalent to backend startup)
      execSync(`npx ts-node prisma/seed.ts`, {
        cwd: resolve(__dirname, '..'),
        env: { ...process.env, DATABASE_URL: UPGRADE_URL },
        stdio: 'ignore',
      });

      // 3. Assert WKU row: requires_order=false, is_absence=true, NAME UNCHANGED, IS_SYSTEM UNCHANGED
      const wku = await prismaUpgrade.workTimeType.findUnique({ where: { code: 'WKU' } });
      expect(wku).not.toBeNull();
      expect(wku!.requiresOrder).toBe(false);
      expect(wku!.isAbsence).toBe(true);
      expect(wku!.name).toBe('Wojsko / WCR Klienta'); // Preserved client name!
      expect(wku!.isSystem).toBe(false); // Preserved client ownership!

      // 4. Assert OP row: completely unchanged
      const op = await prismaUpgrade.workTimeType.findUnique({ where: { code: 'OP' } });
      expect(op).not.toBeNull();
      expect(op!.requiresOrder).toBe(false);
      expect(op!.isAbsence).toBe(false);
      expect(op!.name).toBe('Opieka nad dzieckiem (Klient)');
      expect(op!.isSystem).toBe(false); // Remained custom!

      // 5. Assert NN row: completely unchanged
      const nn = await prismaUpgrade.workTimeType.findUnique({ where: { code: 'NN' } });
      expect(nn).not.toBeNull();
      expect(nn!.requiresOrder).toBe(false);
      expect(nn!.isAbsence).toBe(false);
      expect(nn!.name).toBe('Nieobecność nieusprawiedliwiona (Custom)');
      expect(nn!.isSystem).toBe(false); // Remained custom, no takeover!

      // 6. Assert unrelated custom type XYZ: completely unchanged
      const xyz = await prismaUpgrade.workTimeType.findUnique({ where: { code: 'XYZ' } });
      expect(xyz).not.toBeNull();
      expect(xyz!.requiresOrder).toBe(true);
      expect(xyz!.isAbsence).toBe(false);
      expect(xyz!.name).toBe('Projekt specjalny XYZ');
      expect(xyz!.isSystem).toBe(false);

      // 7. Assert established canonical system types: remain system types
      const g = await prismaUpgrade.workTimeType.findUnique({ where: { code: 'G' } });
      expect(g!.isSystem).toBe(true);
      const l4 = await prismaUpgrade.workTimeType.findUnique({ where: { code: 'L4' } });
      expect(l4!.isSystem).toBe(true);
      expect(l4!.isAbsence).toBe(true);

      // 8. Assert historical work_time_reports are intact
      const reports = await prismaUpgrade.workTimeReport.findMany({
        orderBy: { date: 'asc' },
      });
      expect(reports).toHaveLength(5);
      expect(reports[0].workTimeTypeCode).toBe('WKU');
      expect(Number(reports[0].hours)).toBe(8);
      expect(reports[1].workTimeTypeCode).toBe('OP');
      expect(Number(reports[1].hours)).toBe(8);
      expect(reports[2].workTimeTypeCode).toBe('NN');
      expect(Number(reports[2].hours)).toBe(8);
      expect(reports[3].workTimeTypeCode).toBe('XYZ');
      expect(Number(reports[3].hours)).toBe(8);
      expect(reports[4].workTimeTypeCode).toBe('G');
      expect(Number(reports[4].hours)).toBe(8);
    });

    it('is safe, idempotent, and deterministic upon repeated migration and seed execution', async () => {
      if (!hasDocker) return;

      const beforeWku = await prismaUpgrade.workTimeType.findUnique({ where: { code: 'WKU' } });

      // Run migration 10 again
      const migrationFile = resolve(
        __dirname,
        '../prisma/migrations/20260908120000_canonical_work_time_types_hardening/migration.sql',
      );
      const migrationSql = readFileSync(migrationFile, 'utf8');
      execSync(`docker exec -i ${CONTAINER_NAME} psql -U ${DB_USER} -d ${UPGRADE_DB}`, {
        input: migrationSql,
        stdio: ['pipe', 'ignore', 'pipe'],
      });

      // Run seed again
      execSync(`npx ts-node prisma/seed.ts`, {
        cwd: resolve(__dirname, '..'),
        env: { ...process.env, DATABASE_URL: UPGRADE_URL },
        stdio: 'ignore',
      });

      const afterWku = await prismaUpgrade.workTimeType.findUnique({ where: { code: 'WKU' } });
      expect(afterWku!.name).toBe(beforeWku!.name);
      expect(afterWku!.isSystem).toBe(beforeWku!.isSystem);
      expect(afterWku!.requiresOrder).toBe(beforeWku!.requiresOrder);
      expect(afterWku!.isAbsence).toBe(beforeWku!.isAbsence);
      // updatedAt was NOT touched because flags were already correct
      expect(afterWku!.updatedAt.getTime()).toBe(beforeWku!.updatedAt.getTime());

      // Historical reports remain untouched
      const count = await prismaUpgrade.workTimeReport.count();
      expect(count).toBe(5);
    });
  });

  describe('Scenario B: Fresh installation (prisma migrate deploy + seed.ts)', () => {
    let prismaFresh: PrismaClient;

    beforeAll(async () => {
      if (!hasDocker) return;

      // Run prisma migrate deploy on clean FRESH_DB
      execSync(`npx prisma migrate deploy`, {
        cwd: resolve(__dirname, '..'),
        env: { ...process.env, DATABASE_URL: FRESH_URL },
        stdio: 'ignore',
      });

      // Run production seed
      execSync(`npx ts-node prisma/seed.ts`, {
        cwd: resolve(__dirname, '..'),
        env: { ...process.env, DATABASE_URL: FRESH_URL },
        stdio: 'ignore',
      });

      prismaFresh = new PrismaClient({
        datasources: { db: { url: FRESH_URL } },
      });
    }, 60000);

    afterAll(async () => {
      if (prismaFresh) {
        await prismaFresh.$disconnect();
      }
    });

    it('creates established canonical system types and WKU correctly, without creating ambiguous codes', async () => {
      if (!hasDocker) return;

      // Established canonical system types exist and have is_system = true
      const canonicalCodes = ['G', 'NDR', 'NS', 'UW', 'UOK', 'UŻ', 'L4'];
      for (const code of canonicalCodes) {
        const type = await prismaFresh.workTimeType.findUnique({ where: { code } });
        expect(type).not.toBeNull();
        expect(type!.isSystem).toBe(true);
      }

      // WKU was created by migration: requires_order=false, is_absence=true, is_system=false
      const wku = await prismaFresh.workTimeType.findUnique({ where: { code: 'WKU' } });
      expect(wku).not.toBeNull();
      expect(wku!.requiresOrder).toBe(false);
      expect(wku!.isAbsence).toBe(true);
      expect(wku!.isSystem).toBe(false);

      // Ambiguous unapproved codes must NOT exist in the database
      const unapprovedCodes = ['NN', 'NU', 'NUN', 'NUP', 'UB', 'UO', 'UPP', 'OP'];
      for (const code of unapprovedCodes) {
        const type = await prismaFresh.workTimeType.findUnique({ where: { code } });
        expect(type).toBeNull();
      }
    });

    it('repeated migrate deploy and seed on fresh database is completely idempotent', async () => {
      if (!hasDocker) return;

      // Run migrate deploy again
      execSync(`npx prisma migrate deploy`, {
        cwd: resolve(__dirname, '..'),
        env: { ...process.env, DATABASE_URL: FRESH_URL },
        stdio: 'ignore',
      });

      // Run seed again
      execSync(`npx ts-node prisma/seed.ts`, {
        cwd: resolve(__dirname, '..'),
        env: { ...process.env, DATABASE_URL: FRESH_URL },
        stdio: 'ignore',
      });

      const types = await prismaFresh.workTimeType.findMany();
      // Exactly 7 established system types + 1 WKU = 8 types
      expect(types).toHaveLength(8);
    });
  });
});
