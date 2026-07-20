import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { logChange } from '../utils/audit';

export const MAX_COPY_SOURCE_REPORTS = 100;

export function getReportDayLockKey(employeeId: string, workDate: string) {
  // Keep this prefix stable so copy and regular report writes coordinate on
  // the same PostgreSQL advisory lock, including during a rolling update.
  return `copy-last-day:${employeeId}:${workDate}`;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string) {
  if (!ISO_DATE_PATTERN.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export const copyLastDayRequestSchema = z
  .object({
    employeeId: z.string().uuid('employeeId musi być prawidłowym UUID'),
    date: z.string().refine(isValidIsoDate, 'date musi mieć format YYYY-MM-DD i być prawidłową datą'),
  })
  .strict();

export class CopyLastDayError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly context: {
      sourceDate?: string;
      sourceCount?: number;
    } = {},
  ) {
    super(message);
    this.name = 'CopyLastDayError';
  }
}

export interface CopyLastDayResult {
  operationId: string;
  employeeId: string;
  sourceDate: string;
  targetDate: string;
  sourceCount: number;
  createdCount: number;
}

interface CopyLastDayParams {
  employeeId: string;
  targetDate: string;
  userId: string;
  requestId: string;
  client?: PrismaClient;
}

const eligibleOrderFilter = {
  OR: [{ orderId: null }, { order: { deletedAt: null } }],
};

export async function copyLastDayForEmployee({
  employeeId,
  targetDate,
  userId,
  requestId,
  client = prisma,
}: CopyLastDayParams): Promise<CopyLastDayResult> {
  const targetDateValue = new Date(`${targetDate}T00:00:00.000Z`);
  const lockKey = getReportDayLockKey(employeeId, targetDate);
  const operationId = randomUUID();

  // Version 0.2.9 intentionally preserves the existing policy that allows
  // reporting for future dates. A future-date policy requires a separate
  // confirmed business rule and is covered by a regression test.
  return client.$transaction(
    async (tx) => {
      // PostgreSQL transaction-level advisory lock. The deterministic hash
      // serializes every copy operation for the same employee and target date,
      // including requests handled by different Node.js instances.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

      const employee = await tx.employee.findFirst({
        where: {
          id: employeeId,
          isActive: true,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!employee) {
        throw new CopyLastDayError(
          404,
          'EMPLOYEE_NOT_AVAILABLE',
          'Pracownik nie istnieje, jest nieaktywny lub został usunięty.',
        );
      }

      // This check must run after the advisory lock has been acquired. A
      // waiting concurrent request will therefore see the rows committed by
      // the first request and return 409 instead of creating another set.
      const targetEntriesCount = await tx.workTimeReport.count({
        where: {
          employeeId,
          date: targetDateValue,
          deletedAt: null,
        },
      });

      if (targetEntriesCount > 0) {
        throw new CopyLastDayError(
          409,
          'TARGET_DAY_NOT_EMPTY',
          'Dzień docelowy zawiera już aktywne wpisy tego pracownika.',
        );
      }

      const lastReport = await tx.workTimeReport.findFirst({
        where: {
          employeeId,
          deletedAt: null,
          date: { lt: targetDateValue },
        },
        orderBy: { date: 'desc' },
        select: { date: true },
      });

      if (!lastReport) {
        throw new CopyLastDayError(
          404,
          'SOURCE_DAY_NOT_FOUND',
          'Brak wcześniejszego dnia z aktywnymi wpisami tego pracownika.',
        );
      }

      const sourceReports = await tx.workTimeReport.findMany({
        where: {
          employeeId,
          date: lastReport.date,
          deletedAt: null,
          ...eligibleOrderFilter,
        },
        select: {
          employeeId: true,
          orderId: true,
          hours: true,
          workTimeTypeCode: true,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: MAX_COPY_SOURCE_REPORTS + 1,
      });

      if (sourceReports.length === 0) {
        throw new CopyLastDayError(
          404,
          'SOURCE_DAY_NOT_FOUND',
          'Brak wcześniejszego dnia z aktywnymi wpisami tego pracownika.',
        );
      }

      const sourceDate = lastReport.date.toISOString().slice(0, 10);

      if (sourceReports.length > MAX_COPY_SOURCE_REPORTS) {
        throw new CopyLastDayError(
          422,
          'SOURCE_LIMIT_EXCEEDED',
          `Dzień źródłowy zawiera więcej niż ${MAX_COPY_SOURCE_REPORTS} aktywnych wpisów. Kopiowanie zostało zatrzymane.`,
          { sourceDate, sourceCount: sourceReports.length },
        );
      }

      const created = await tx.workTimeReport.createMany({
        data: sourceReports.map((report) => ({
          date: targetDateValue,
          employeeId: report.employeeId,
          orderId: report.orderId,
          hours: report.hours,
          workTimeTypeCode: report.workTimeTypeCode,
          createdByUserId: userId,
        })),
      });

      // One atomic audit event describes the whole copy operation. Audit
      // failure is rethrown so the transaction cannot commit copied rows
      // without the corresponding operation-level audit record.
      await logChange(
        {
          tableName: 'work_time_reports',
          recordId: operationId,
          action: 'CREATE',
          newValues: {
            eventType: 'COPY_LAST_DAY',
            operationId,
            requestId,
            employeeId,
            userId,
            sourceDate,
            targetDate,
            sourceCount: sourceReports.length,
            createdCount: created.count,
          },
          userId,
        },
        { client: tx, rethrow: true },
      );

      return {
        operationId,
        employeeId,
        sourceDate,
        targetDate,
        sourceCount: sourceReports.length,
        createdCount: created.count,
      };
    },
    {
      maxWait: 10_000,
      timeout: 30_000,
      // Read Committed creates a fresh PostgreSQL snapshot for the target-day
      // re-check after a waiting advisory lock has been granted.
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    },
  );
}
