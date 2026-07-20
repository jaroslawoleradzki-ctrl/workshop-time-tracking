import { randomUUID } from 'crypto';
import type { Express } from 'express';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const JWT_SECRET = 'a_very_secure_and_long_jwt_secret_key_for_workshop_time_reporting';
const ADMIN_ID = '10000000-0000-4000-8000-000000000001';
const LEADER_ID = '10000000-0000-4000-8000-000000000002';
const VIEWER_ID = '10000000-0000-4000-8000-000000000003';
const EMPLOYEE_A_ID = '20000000-0000-4000-8000-000000000001';
const EMPLOYEE_B_ID = '20000000-0000-4000-8000-000000000002';

interface FakeUser {
  id: string;
  username: string;
  fullName: string;
  role: string;
  isActive: boolean;
}

interface FakeEmployee {
  id: string;
  isActive: boolean;
  deletedAt: Date | null;
}

interface FakeReport {
  id: string;
  date: Date;
  employeeId: string;
  orderId: string | null;
  hours: number;
  workTimeTypeCode: string;
  createdByUserId: string;
  createdAt: Date;
  deletedAt: Date | null;
}

interface FakeAuditLog {
  id: string;
  data: Record<string, unknown>;
}

function sameDate(left: Date, right: Date) {
  return left.getTime() === right.getTime();
}

function matchesReportWhere(report: FakeReport, where: any) {
  if (where.employeeId && report.employeeId !== where.employeeId) return false;
  if (where.deletedAt === null && report.deletedAt !== null) return false;
  if (where.date instanceof Date && !sameDate(report.date, where.date)) return false;
  if (where.date?.lt && report.date.getTime() >= where.date.lt.getTime()) return false;
  return true;
}

class FakeTransaction {
  private releaseLock: (() => void) | null = null;
  private reports: FakeReport[] | null = null;
  private auditLogs: FakeAuditLog[] | null = null;

  constructor(private readonly owner: FakePrismaClient) {}

  private ensureSnapshot() {
    if (!this.reports) {
      this.reports = this.owner.reports.map((report) => ({ ...report }));
      this.auditLogs = this.owner.auditLogs.map((entry) => ({ ...entry }));
    }
  }

  async $executeRaw(_template: TemplateStringsArray, lockKey: string) {
    this.releaseLock = await this.owner.acquireLock(lockKey);
    this.ensureSnapshot();
    return 1;
  }

  employee: { findFirst: (args: any) => Promise<any> } = {
    findFirst: async () => null,
  };

  workTimeReport: {
    count: (args: any) => Promise<number>;
    findFirst: (args: any) => Promise<any>;
    findMany: (args: any) => Promise<any[]>;
    createMany: (args: any) => Promise<{ count: number }>;
  } = {
    count: async () => 0,
    findFirst: async () => null,
    findMany: async () => [],
    createMany: async () => ({ count: 0 }),
  };

  auditLog: { create: (args: any) => Promise<any> } = {
    create: async () => null,
  };

  initializeDelegates() {
    this.employee.findFirst = async ({ where }: any) => {
      this.ensureSnapshot();
      return (
        this.owner.employees.find(
          (employee) =>
            employee.id === where.id &&
            (!where.isActive || employee.isActive) &&
            (where.deletedAt !== null || employee.deletedAt === null),
        ) || null
      );
    };

    this.workTimeReport.count = async ({ where }: any) => {
      this.ensureSnapshot();
      return this.reports!.filter((report) => matchesReportWhere(report, where)).length;
    };

    this.workTimeReport.findFirst = async ({ where }: any) => {
      this.ensureSnapshot();
      const reports = this.reports!
        .filter((report) => matchesReportWhere(report, where))
        .sort((left, right) => right.date.getTime() - left.date.getTime());
      return reports[0] ? { date: reports[0].date } : null;
    };

    this.workTimeReport.findMany = async ({ where }: any) => {
      this.ensureSnapshot();
      return this.reports!
        .filter((report) => matchesReportWhere(report, where))
        .sort((left, right) => {
          const createdDifference = left.createdAt.getTime() - right.createdAt.getTime();
          return createdDifference || left.id.localeCompare(right.id);
        })
        .map((report) => ({
          employeeId: report.employeeId,
          orderId: report.orderId,
          hours: report.hours,
          workTimeTypeCode: report.workTimeTypeCode,
        }));
    };

    this.workTimeReport.createMany = async ({ data }: any) => {
      this.ensureSnapshot();
      data.forEach((entry: any) => {
        this.reports!.push({
          id: randomUUID(),
          ...entry,
          createdAt: new Date(),
          deletedAt: null,
        });
      });
      return { count: data.length };
    };

    this.auditLog.create = async ({ data }: any) => {
      this.ensureSnapshot();
      if (this.owner.failAudit) {
        throw new Error('Simulated audit failure');
      }
      const entry = { id: randomUUID(), data };
      this.auditLogs!.push(entry);
      return entry;
    };
  }

  commit() {
    if (this.reports && this.auditLogs) {
      this.owner.reports = this.reports;
      this.owner.auditLogs = this.auditLogs;
    }
  }

  close() {
    this.releaseLock?.();
  }
}

class FakePrismaClient {
  users: FakeUser[] = [];
  employees: FakeEmployee[] = [];
  reports: FakeReport[] = [];
  auditLogs: FakeAuditLog[] = [];
  failAudit = false;
  private lockTails = new Map<string, Promise<void>>();

  user = {
    findUnique: async ({ where }: any) => this.users.find((user) => user.id === where.id) || null,
  };

  reset() {
    this.users = [
      { id: ADMIN_ID, username: 'admin', fullName: 'Admin', role: 'admin', isActive: true },
      { id: LEADER_ID, username: 'leader', fullName: 'Leader', role: 'leader', isActive: true },
      { id: VIEWER_ID, username: 'viewer', fullName: 'Viewer', role: 'viewer', isActive: true },
    ];
    this.employees = [
      { id: EMPLOYEE_A_ID, isActive: true, deletedAt: null },
      { id: EMPLOYEE_B_ID, isActive: true, deletedAt: null },
    ];
    this.reports = [];
    this.auditLogs = [];
    this.failAudit = false;
    this.lockTails.clear();
  }

  seedReport(params: {
    employeeId: string;
    date: string;
    hours?: number;
    deletedAt?: Date | null;
    orderId?: string | null;
  }) {
    this.reports.push({
      id: randomUUID(),
      date: new Date(`${params.date}T00:00:00.000Z`),
      employeeId: params.employeeId,
      orderId: params.orderId || null,
      hours: params.hours ?? 8,
      workTimeTypeCode: 'G',
      createdByUserId: ADMIN_ID,
      createdAt: new Date(),
      deletedAt: params.deletedAt ?? null,
    });
  }

  activeReports(employeeId: string, date: string) {
    const targetDate = new Date(`${date}T00:00:00.000Z`);
    return this.reports.filter(
      (report) =>
        report.employeeId === employeeId &&
        sameDate(report.date, targetDate) &&
        report.deletedAt === null,
    );
  }

  async acquireLock(key: string) {
    let releaseCurrent!: () => void;
    const current = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    const previous = this.lockTails.get(key) || Promise.resolve();
    this.lockTails.set(key, previous.then(() => current));
    await previous;
    return releaseCurrent;
  }

  async $transaction(callback: (tx: FakeTransaction) => Promise<unknown>) {
    const tx = new FakeTransaction(this);
    tx.initializeDelegates();
    try {
      const result = await callback(tx);
      tx.commit();
      return result;
    } finally {
      tx.close();
    }
  }
}

const fakePrisma = new FakePrismaClient();
let app: Express;

function tokenFor(userId: string) {
  const user = fakePrisma.users.find((candidate) => candidate.id === userId)!;
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

function copyRequest(userId = LEADER_ID, employeeId = EMPLOYEE_A_ID, date = '2026-07-16') {
  return request(app)
    .post('/api/reports/copy-last-day')
    .set('Authorization', `Bearer ${tokenFor(userId)}`)
    .send({ employeeId, date });
}

beforeAll(async () => {
  vi.doMock('../src/utils/prisma', () => ({ default: fakePrisma }));
  app = (await import('../src/app')).default;
});

beforeEach(() => {
  fakePrisma.reset();
});

describe('POST /api/reports/copy-last-day', () => {
  it('copies only the selected employee and returns the new contract', async () => {
    fakePrisma.seedReport({ employeeId: EMPLOYEE_A_ID, date: '2026-07-15', hours: 4 });
    fakePrisma.seedReport({ employeeId: EMPLOYEE_B_ID, date: '2026-07-15', hours: 7 });

    const response = await copyRequest().expect(201);

    expect(response.body).toMatchObject({
      employeeId: EMPLOYEE_A_ID,
      sourceDate: '2026-07-15',
      targetDate: '2026-07-16',
      createdCount: 1,
    });
    expect(fakePrisma.activeReports(EMPLOYEE_A_ID, '2026-07-16')).toHaveLength(1);
    expect(fakePrisma.activeReports(EMPLOYEE_B_ID, '2026-07-16')).toHaveLength(0);
    expect(fakePrisma.auditLogs).toHaveLength(1);
    expect(fakePrisma.auditLogs[0].data).toMatchObject({
      action: 'CREATE',
      newValues: expect.objectContaining({ eventType: 'COPY_LAST_DAY', createdCount: 1 }),
    });
  });

  it('selects the latest earlier active day of the selected employee', async () => {
    fakePrisma.seedReport({ employeeId: EMPLOYEE_A_ID, date: '2026-07-10', hours: 2 });
    fakePrisma.seedReport({ employeeId: EMPLOYEE_A_ID, date: '2026-07-14', hours: 6 });
    fakePrisma.seedReport({ employeeId: EMPLOYEE_B_ID, date: '2026-07-15', hours: 9 });

    const response = await copyRequest().expect(201);

    expect(response.body.sourceDate).toBe('2026-07-14');
    expect(fakePrisma.activeReports(EMPLOYEE_A_ID, '2026-07-16')[0].hours).toBe(6);
  });

  it('ignores soft-deleted source reports', async () => {
    fakePrisma.seedReport({ employeeId: EMPLOYEE_A_ID, date: '2026-07-15', hours: 4 });
    fakePrisma.seedReport({
      employeeId: EMPLOYEE_A_ID,
      date: '2026-07-15',
      hours: 9,
      deletedAt: new Date(),
    });

    const response = await copyRequest().expect(201);

    expect(response.body.createdCount).toBe(1);
    expect(fakePrisma.activeReports(EMPLOYEE_A_ID, '2026-07-16')[0].hours).toBe(4);
  });

  it('returns 404 when no source day exists', async () => {
    const response = await copyRequest().expect(404);

    expect(response.body.code).toBe('SOURCE_DAY_NOT_FOUND');
    expect(fakePrisma.activeReports(EMPLOYEE_A_ID, '2026-07-16')).toHaveLength(0);
  });

  it.each([
    ['missing', '29999999-0000-4000-8000-000000000099'],
    ['inactive', EMPLOYEE_A_ID],
  ])('returns 404 for a %s employee', async (caseName, employeeId) => {
    if (caseName === 'inactive') {
      fakePrisma.employees[0].isActive = false;
    }

    const response = await copyRequest(LEADER_ID, employeeId).expect(404);

    expect(response.body.code).toBe('EMPLOYEE_NOT_AVAILABLE');
  });

  it('rejects an invalid employeeId', async () => {
    const response = await copyRequest(LEADER_ID, 'not-a-uuid').expect(400);

    expect(response.body.code).toBe('INVALID_COPY_REQUEST');
  });

  it.each(['16.07.2026', '2026-02-30', ''])('rejects invalid date %s', async (date) => {
    const response = await copyRequest(LEADER_ID, EMPLOYEE_A_ID, date).expect(400);

    expect(response.body.code).toBe('INVALID_COPY_REQUEST');
  });

  it('returns 409 without appending when the target day is not empty', async () => {
    fakePrisma.seedReport({ employeeId: EMPLOYEE_A_ID, date: '2026-07-15' });
    fakePrisma.seedReport({ employeeId: EMPLOYEE_A_ID, date: '2026-07-16' });

    const response = await copyRequest().expect(409);

    expect(response.body.code).toBe('TARGET_DAY_NOT_EMPTY');
    expect(fakePrisma.activeReports(EMPLOYEE_A_ID, '2026-07-16')).toHaveLength(1);
  });

  it('serializes two parallel requests so one succeeds and one receives 409', async () => {
    fakePrisma.seedReport({ employeeId: EMPLOYEE_A_ID, date: '2026-07-15', hours: 4 });
    fakePrisma.seedReport({ employeeId: EMPLOYEE_A_ID, date: '2026-07-15', hours: 4 });

    const responses = await Promise.all([copyRequest(), copyRequest()]);
    const statuses = responses.map((response) => response.status).sort();

    expect(statuses).toEqual([201, 409]);
    expect(fakePrisma.activeReports(EMPLOYEE_A_ID, '2026-07-16')).toHaveLength(2);
    expect(fakePrisma.auditLogs).toHaveLength(1);
  });

  it('allows only one of 20 parallel requests to create data', async () => {
    fakePrisma.seedReport({ employeeId: EMPLOYEE_A_ID, date: '2026-07-15', hours: 3 });
    fakePrisma.seedReport({ employeeId: EMPLOYEE_A_ID, date: '2026-07-15', hours: 5 });

    const responses = await Promise.all(Array.from({ length: 20 }, () => copyRequest()));

    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(19);
    expect(fakePrisma.activeReports(EMPLOYEE_A_ID, '2026-07-16')).toHaveLength(2);
    expect(fakePrisma.auditLogs).toHaveLength(1);
  });

  it('rolls back all copied reports when the atomic audit write fails', async () => {
    fakePrisma.seedReport({ employeeId: EMPLOYEE_A_ID, date: '2026-07-15', hours: 8 });
    fakePrisma.failAudit = true;

    await copyRequest().expect(500);

    expect(fakePrisma.activeReports(EMPLOYEE_A_ID, '2026-07-16')).toHaveLength(0);
    expect(fakePrisma.auditLogs).toHaveLength(0);
  });

  it('does not create data when the source safety limit is exceeded', async () => {
    for (let index = 0; index < 101; index += 1) {
      fakePrisma.seedReport({ employeeId: EMPLOYEE_A_ID, date: '2026-07-15', hours: 1 });
    }

    const response = await copyRequest().expect(422);

    expect(response.body.code).toBe('SOURCE_LIMIT_EXCEEDED');
    expect(fakePrisma.activeReports(EMPLOYEE_A_ID, '2026-07-16')).toHaveLength(0);
  });

  it('rejects a role that is not allowed to use reporting copy', async () => {
    fakePrisma.seedReport({ employeeId: EMPLOYEE_A_ID, date: '2026-07-15' });

    await copyRequest(VIEWER_ID).expect(430);

    expect(fakePrisma.activeReports(EMPLOYEE_A_ID, '2026-07-16')).toHaveLength(0);
  });

  it('documents the current policy by allowing a valid future target date', async () => {
    fakePrisma.seedReport({ employeeId: EMPLOYEE_A_ID, date: '2026-07-15' });

    const response = await copyRequest(
      LEADER_ID,
      EMPLOYEE_A_ID,
      '2030-01-02',
    ).expect(201);

    expect(response.body.targetDate).toBe('2030-01-02');
    expect(fakePrisma.activeReports(EMPLOYEE_A_ID, '2030-01-02')).toHaveLength(1);
  });
});
