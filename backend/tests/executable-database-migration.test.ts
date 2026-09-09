import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/app';
import prisma from '../src/utils/prisma';
import { TEST_JWT_SECRET } from './setup-env';

const CONTAINER_NAME = 'wtt-disposable-migration-test-pg';
const DB_PORT = '5438';
const DB_USER = 'postgres';
const DB_PASS = 'postgres';

const UPGRADE_DB = 'test_upgrade_db';
const FRESH_DB = 'test_fresh_db';

const UPGRADE_URL = `postgresql://${DB_USER}:${DB_PASS}@localhost:${DB_PORT}/${UPGRADE_DB}?schema=public`;
const FRESH_URL = `postgresql://${DB_USER}:${DB_PASS}@localhost:${DB_PORT}/${FRESH_DB}?schema=public`;

let hasDocker = false;

const ALL_COLLIDING_CODES = ['WKU', 'OP', 'NN', 'NU', 'NUN', 'NUP', 'UB', 'UO', 'UPP'] as const;

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

    // Build backend to ensure production artifacts (dist/prisma/seed.js) are up to date
    execSync('npm run build', {
      cwd: resolve(__dirname, '..'),
      stdio: 'ignore',
    });
  }, 60000);

  afterAll(async () => {
    if (hasDocker) {
      try {
        execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'ignore' });
      } catch {}
    }
  });

  describe('Scenario A: Upgrading an existing database (v0.5.3 -> v0.5.4) with all 9 colliding custom types', () => {
    let prismaUpgrade: PrismaClient;
    let beforeTypesMap: Map<string, { name: string; requiresOrder: boolean; isAbsence: boolean; isSystem: boolean; updatedAt: Date }>;

    beforeAll(async () => {
      if (!hasDocker) return;

      const backendRoot = resolve(__dirname, '..');
      const realPrismaDir = resolve(backendRoot, 'prisma');

      // 1. Prepare temporary directory containing migrations 1 through 9 (pre-v0.5.4)
      const tempDir = join(tmpdir(), `prisma-pre-v054-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      const tempPrismaDir = join(tempDir, 'prisma');
      const tempMigrationsDir = join(tempPrismaDir, 'migrations');
      mkdirSync(tempMigrationsDir, { recursive: true });

      // Copy schema.prisma
      cpSync(join(realPrismaDir, 'schema.prisma'), join(tempPrismaDir, 'schema.prisma'));

      // Copy pre-v0.5.4 migrations (exclude 20260908120000)
      const migrationDirs = readdirSync(join(realPrismaDir, 'migrations'), { withFileTypes: true })
        .filter((d) => d.isDirectory() && d.name.startsWith('20') && !d.name.includes('20260908120000'))
        .map((d) => d.name);

      for (const m of migrationDirs) {
        cpSync(join(realPrismaDir, 'migrations', m), join(tempMigrationsDir, m), { recursive: true });
      }

      // Execute prisma migrate deploy with pre-v0.5.4 migrations to populate _prisma_migrations authentic history
      execSync(`npx prisma migrate deploy --schema="${join(tempPrismaDir, 'schema.prisma')}"`, {
        cwd: backendRoot,
        env: { ...process.env, DATABASE_URL: UPGRADE_URL },
        stdio: 'ignore',
      });

      // Clean up temporary pre-v0.5.4 migrations folder
      rmSync(tempDir, { recursive: true, force: true });

      prismaUpgrade = new PrismaClient({
        datasources: { db: { url: UPGRADE_URL } },
      });

      // 2. Seed standard system types (G, NDR, NS, UW, UOK, UŻ, L4) as they existed in v0.5.3
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

      // 3. Insert all 9 colliding types as custom pre-upgrade records (is_system=false):
      // WKU, OP, NN, NU, NUN, NUP, UB, UO, UPP
      for (const code of ALL_COLLIDING_CODES) {
        await prismaUpgrade.workTimeType.create({
          data: {
            code,
            name: `Custom ${code}`,
            requiresOrder: false,
            isAbsence: false,
            isSystem: false,
          },
        });
      }

      // 4. Insert an unrelated custom type (XYZ)
      await prismaUpgrade.workTimeType.create({
        data: {
          code: 'XYZ',
          name: 'Projekt specjalny XYZ',
          requiresOrder: true,
          isAbsence: false,
          isSystem: false,
        },
      });

      // 5. Insert historical user, employee, order, and reports referencing custom types
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

      // Create reports referencing all 9 colliding codes + XYZ + G
      const reportRows = [
        ...ALL_COLLIDING_CODES.map((code, idx) => ({
          id: `10000000-0000-4000-8000-${String(idx + 1).padStart(12, '0')}`,
          employeeId: emp.id,
          workTimeTypeCode: code,
          date: new Date(`2026-08-${String(idx + 1).padStart(2, '0')}T00:00:00.000Z`),
          hours: 8,
          orderId: null,
          createdByUserId: user.id,
        })),
        {
          id: '20000000-0000-4000-8000-000000000001',
          employeeId: emp.id,
          workTimeTypeCode: 'XYZ',
          date: new Date('2026-08-20T00:00:00.000Z'),
          hours: 8,
          orderId: order.id,
          createdByUserId: user.id,
        },
        {
          id: '20000000-0000-4000-8000-000000000002',
          employeeId: emp.id,
          workTimeTypeCode: 'G',
          date: new Date('2026-08-21T00:00:00.000Z'),
          hours: 8,
          orderId: order.id,
          createdByUserId: user.id,
        },
      ];
      await prismaUpgrade.workTimeReport.createMany({ data: reportRows });

      // Capture BEFORE state for comparison
      const beforeTypes = await prismaUpgrade.workTimeType.findMany();
      beforeTypesMap = new Map(
        beforeTypes.map((t) => [
          t.code,
          {
            name: t.name,
            requiresOrder: t.requiresOrder,
            isAbsence: t.isAbsence,
            isSystem: t.isSystem,
            updatedAt: t.updatedAt,
          },
        ]),
      );
    }, 60000);

    afterAll(async () => {
      if (prismaUpgrade) {
        await prismaUpgrade.$disconnect();
      }
    });

    it('upgrades via exact production path: prisma migrate deploy then node dist/prisma/seed.js', async () => {
      if (!hasDocker) return;

      const backendRoot = resolve(__dirname, '..');

      // Verify _prisma_migrations before v0.5.4 has exactly 9 migrations
      const preMigrationsCount: [{ count: bigint }] = await prismaUpgrade.$queryRaw`
        SELECT COUNT(*) as count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;
      `;
      expect(Number(preMigrationsCount[0].count)).toBe(9);

      // STEP 1: Production migration command
      execSync('npx prisma migrate deploy', {
        cwd: backendRoot,
        env: { ...process.env, DATABASE_URL: UPGRADE_URL },
        stdio: 'ignore',
      });

      // Verify _prisma_migrations now has 10 migrations and v0.5.4 migration is applied
      const postMigrations: Array<{ migration_name: string; rolled_back_at: Date | null }> =
        await prismaUpgrade.$queryRaw`
          SELECT migration_name, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at ASC;
        `;
      expect(postMigrations).toHaveLength(10);
      const lastMigration = postMigrations[9];
      expect(lastMigration.migration_name).toContain('20260908120000_canonical_work_time_types_hardening');
      expect(lastMigration.rolled_back_at).toBeNull();

      // STEP 2: Production seed command using compiled JavaScript artifact
      execSync('node dist/prisma/seed.js', {
        cwd: backendRoot,
        env: { ...process.env, DATABASE_URL: UPGRADE_URL },
        stdio: 'ignore',
      });

      // 3. Verify BEFORE vs AFTER for all 9 colliding codes
      const afterTypes = await prismaUpgrade.workTimeType.findMany();
      const afterTypesMap = new Map(afterTypes.map((t) => [t.code, t]));

      // 3a. WKU: requiresOrder -> false, isAbsence -> true, name PRESERVED, isSystem PRESERVED (false)
      const beforeWku = beforeTypesMap.get('WKU')!;
      const afterWku = afterTypesMap.get('WKU')!;
      expect(afterWku).toBeDefined();
      expect(afterWku.name).toBe(beforeWku.name); // 'Custom WKU' preserved!
      expect(afterWku.isSystem).toBe(false); // isSystem remains false!
      expect(afterWku.requiresOrder).toBe(false);
      expect(afterWku.isAbsence).toBe(true); // Updated to true!

      // 3b. The other 8 colliding codes (OP, NN, NU, NUN, NUP, UB, UO, UPP): completely UNMODIFIED
      const remainingCodes = ['OP', 'NN', 'NU', 'NUN', 'NUP', 'UB', 'UO', 'UPP'] as const;
      for (const code of remainingCodes) {
        const before = beforeTypesMap.get(code)!;
        const after = afterTypesMap.get(code)!;
        expect(after).toBeDefined();
        expect(after.name).toBe(before.name);
        expect(after.isSystem).toBe(false);
        expect(after.requiresOrder).toBe(before.requiresOrder);
        expect(after.isAbsence).toBe(before.isAbsence);
        // Timestamp must NOT have been bumped because neither migration nor seed modified it
        expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
      }

      // 3c. Unrelated custom type XYZ: completely UNMODIFIED
      const beforeXyz = beforeTypesMap.get('XYZ')!;
      const afterXyz = afterTypesMap.get('XYZ')!;
      expect(afterXyz.name).toBe(beforeXyz.name);
      expect(afterXyz.isSystem).toBe(false);
      expect(afterXyz.requiresOrder).toBe(beforeXyz.requiresOrder);
      expect(afterXyz.isAbsence).toBe(beforeXyz.isAbsence);
      expect(afterXyz.updatedAt.getTime()).toBe(beforeXyz.updatedAt.getTime());

      // 3d. Established canonical system types: remain is_system = true
      const canonicalCodes = ['G', 'NDR', 'NS', 'UW', 'UOK', 'UŻ', 'L4'];
      for (const code of canonicalCodes) {
        const afterCanonical = afterTypesMap.get(code)!;
        expect(afterCanonical.isSystem).toBe(true);
      }

      // 4. Assert historical work_time_reports retain correct foreign keys and data
      const reports = await prismaUpgrade.workTimeReport.findMany({
        orderBy: { date: 'asc' },
      });
      expect(reports).toHaveLength(11);
      for (let i = 0; i < ALL_COLLIDING_CODES.length; i++) {
        expect(reports[i].workTimeTypeCode).toBe(ALL_COLLIDING_CODES[i]);
        expect(Number(reports[i].hours)).toBe(8);
      }
      expect(reports[9].workTimeTypeCode).toBe('XYZ');
      expect(reports[10].workTimeTypeCode).toBe('G');
    });

    it('verifies API behavior and permissions after upgrade: custom types (isSystem=false) are not locked like system types', async () => {
      if (!hasDocker) return;

      // Mock prisma calls in app to use prismaUpgrade
      vi.spyOn(prisma.user, 'findUnique').mockImplementation((args: any) => prismaUpgrade.user.findUnique(args));
      vi.spyOn(prisma.workTimeType, 'findUnique').mockImplementation((args: any) => prismaUpgrade.workTimeType.findUnique(args));
      vi.spyOn(prisma.workTimeType, 'findMany').mockImplementation((args: any) => prismaUpgrade.workTimeType.findMany(args));
      vi.spyOn(prisma.workTimeType, 'create').mockImplementation((args: any) => prismaUpgrade.workTimeType.create(args));
      vi.spyOn(prisma.workTimeType, 'update').mockImplementation((args: any) => prismaUpgrade.workTimeType.update(args));
      vi.spyOn(prisma.workTimeType, 'delete').mockImplementation((args: any) => prismaUpgrade.workTimeType.delete(args));
      vi.spyOn(prisma.workTimeReport, 'count').mockImplementation((args: any) => prismaUpgrade.workTimeReport.count(args));

      const adminUser = await prismaUpgrade.user.findFirst({ where: { username: 'admin' } });
      const authToken = jwt.sign(
        { id: adminUser!.id, username: adminUser!.username, role: adminUser!.role, fullName: adminUser!.fullName },
        TEST_JWT_SECRET,
      );

      // 1. Custom WKU: admin CAN update requiresOrder because isSystem=false
      const updateWkuRes = await request(app)
        .put('/api/work-time-types/WKU')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Custom WKU Updated', requiresOrder: true, isAbsence: true });
      expect(updateWkuRes.status).toBe(200);
      expect(updateWkuRes.body.requiresOrder).toBe(true);
      expect(updateWkuRes.body.name).toBe('Custom WKU Updated');

      // Revert WKU back to requiresOrder=false
      await request(app)
        .put('/api/work-time-types/WKU')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Custom WKU', requiresOrder: false, isAbsence: true });

      // 2. System type G: admin CANNOT change requiresOrder because isSystem=true
      const updateGRes = await request(app)
        .put('/api/work-time-types/G')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Standardowe godziny pracy', requiresOrder: false });
      expect(updateGRes.status).toBe(200);
      expect(updateGRes.body.requiresOrder).toBe(true); // Locked, cannot change

      // 3. System type deletion: blocked with system dictionary error
      const deleteGRes = await request(app)
        .delete('/api/work-time-types/G')
        .set('Authorization', `Bearer ${authToken}`);
      expect(deleteGRes.status).toBe(400);
      expect(deleteGRes.body.message).toContain('systemowego');

      // 4. Custom type with reports (WKU): deletion blocked because of existing reports, NOT because it's system
      const deleteWkuRes = await request(app)
        .delete('/api/work-time-types/WKU')
        .set('Authorization', `Bearer ${authToken}`);
      expect(deleteWkuRes.status).toBe(400);
      expect(deleteWkuRes.body.message).toContain('istnieją zaraportowane godziny');

      // 5. Custom type without reports: can be created and deleted via API
      const createTempRes = await request(app)
        .post('/api/work-time-types')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: 'TMPDEL', name: 'Temporary Custom Type', requiresOrder: false, isAbsence: false });
      expect(createTempRes.status).toBe(201);
      expect(createTempRes.body.isSystem).toBe(false);

      const deleteTempRes = await request(app)
        .delete('/api/work-time-types/TMPDEL')
        .set('Authorization', `Bearer ${authToken}`);
      expect(deleteTempRes.status).toBe(200);

      vi.restoreAllMocks();
    });

    it('is safe, idempotent, and deterministic upon repeated production startup (migrate deploy + seed.js)', async () => {
      if (!hasDocker) return;

      const backendRoot = resolve(__dirname, '..');
      const beforeRepeatWku = await prismaUpgrade.workTimeType.findUnique({ where: { code: 'WKU' } });
      const beforeTypes = await prismaUpgrade.workTimeType.findMany();

      // Repeated execution of production deployment sequence
      execSync('npx prisma migrate deploy', {
        cwd: backendRoot,
        env: { ...process.env, DATABASE_URL: UPGRADE_URL },
        stdio: 'ignore',
      });

      execSync('node dist/prisma/seed.js', {
        cwd: backendRoot,
        env: { ...process.env, DATABASE_URL: UPGRADE_URL },
        stdio: 'ignore',
      });

      const afterRepeatWku = await prismaUpgrade.workTimeType.findUnique({ where: { code: 'WKU' } });
      expect(afterRepeatWku!.name).toBe(beforeRepeatWku!.name);
      expect(afterRepeatWku!.isSystem).toBe(beforeRepeatWku!.isSystem);
      expect(afterRepeatWku!.requiresOrder).toBe(beforeRepeatWku!.requiresOrder);
      expect(afterRepeatWku!.isAbsence).toBe(beforeRepeatWku!.isAbsence);
      expect(afterRepeatWku!.updatedAt.getTime()).toBe(beforeRepeatWku!.updatedAt.getTime());

      const afterTypes = await prismaUpgrade.workTimeType.findMany();
      expect(afterTypes).toHaveLength(beforeTypes.length);

      const reportsCount = await prismaUpgrade.workTimeReport.count();
      expect(reportsCount).toBe(11);
    });
  });

  describe('Scenario B: Fresh installation via exact production path (prisma migrate deploy + node dist/prisma/seed.js)', () => {
    let prismaFresh: PrismaClient;

    beforeAll(async () => {
      if (!hasDocker) return;

      const backendRoot = resolve(__dirname, '..');

      // 1. Run prisma migrate deploy on clean FRESH_DB
      execSync('npx prisma migrate deploy', {
        cwd: backendRoot,
        env: { ...process.env, DATABASE_URL: FRESH_URL },
        stdio: 'ignore',
      });

      // 2. Run production seed via compiled artifact
      execSync('node dist/prisma/seed.js', {
        cwd: backendRoot,
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

      const backendRoot = resolve(__dirname, '..');

      // Run migrate deploy again
      execSync('npx prisma migrate deploy', {
        cwd: backendRoot,
        env: { ...process.env, DATABASE_URL: FRESH_URL },
        stdio: 'ignore',
      });

      // Run production seed again via compiled artifact
      execSync('node dist/prisma/seed.js', {
        cwd: backendRoot,
        env: { ...process.env, DATABASE_URL: FRESH_URL },
        stdio: 'ignore',
      });

      const types = await prismaFresh.workTimeType.findMany();
      // Exactly 7 established system types + 1 WKU = 8 types
      expect(types).toHaveLength(8);
    });
  });
});
