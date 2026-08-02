import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { logChange } from '../utils/audit';
import { getDatesInRange, isWeekend, parseDateString } from '../utils/date';

export const absenceRangeRequestSchema = z
  .object({
    employeeId: z.string().uuid('employeeId musi być prawidłowym UUID'),
    workTimeTypeCode: z.string().min(1, 'workTimeTypeCode jest wymagane'),
    dateFrom: z
      .string()
      .refine(
        (val) => parseDateString(val) !== null,
        'dateFrom musi mieć format YYYY-MM-DD i być prawidłową datą',
      ),
    dateTo: z
      .string()
      .refine(
        (val) => parseDateString(val) !== null,
        'dateTo musi mieć format YYYY-MM-DD i być prawidłową datą',
      ),
    hoursPerDay: z.number().gt(0, 'hoursPerDay musi być większe od 0'),
  })
  .strict();

export class AbsenceRangeError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AbsenceRangeError';
  }
}

export interface ConflictItem {
  date: string;
  reason: 'EXISTING_ENTRY';
}

export interface AbsenceRangePreviewResult {
  calendarDays: number;
  workingDays: number;
  weekends: number;
  availableDays: number;
  skipped: number;
  totalHours: number;
  conflicts: ConflictItem[];
}

export interface AbsenceRangeSaveResult {
  created: number;
  skipped: number;
  weekends: number;
  totalHoursCreated: number;
  conflicts: ConflictItem[];
}

export interface AbsenceRangeParams {
  employeeId: string;
  workTimeTypeCode: string;
  dateFrom: string;
  dateTo: string;
  hoursPerDay: number;
  userId: string;
  requestId: string;
  client?: PrismaClient;
}

/**
 * Validates request input, calculates calendar days, working days, weekends, and conflicts.
 */
export async function validateAndAnalyzeRange(
  params: Omit<AbsenceRangeParams, 'userId' | 'requestId'>,
  client = prisma,
) {
  const { employeeId, workTimeTypeCode, dateFrom, dateTo, hoursPerDay } = params;

  const startDate = parseDateString(dateFrom);
  const endDate = parseDateString(dateTo);

  if (!startDate || !endDate) {
    throw new AbsenceRangeError(400, 'INVALID_DATE', 'Nieprawidłowy format daty');
  }

  if (startDate > endDate) {
    throw new AbsenceRangeError(
      400,
      'INVALID_DATE_RANGE',
      'Data początkowa nie może być późniejsza niż data końcowa',
    );
  }

  const allDates = getDatesInRange(dateFrom, dateTo);
  if (allDates.length > 365) {
    throw new AbsenceRangeError(
      400,
      'RANGE_EXCEEDS_MAX_DAYS',
      'Zakres dat nie może przekraczać 365 dni kalendarzowych',
    );
  }

  // 1. Validate employee
  const employee = await client.employee.findUnique({
    where: { id: employeeId, deletedAt: null },
  });

  if (!employee || !employee.isActive) {
    throw new AbsenceRangeError(
      400,
      'EMPLOYEE_NOT_AVAILABLE',
      'Pracownik nie istnieje lub jest nieaktywny',
    );
  }

  // 2. Validate work time type
  const type = await client.workTimeType.findUnique({
    where: { code: workTimeTypeCode },
  });

  if (!type) {
    throw new AbsenceRangeError(400, 'INVALID_WORK_TIME_TYPE', 'Kod czasu pracy nie istnieje');
  }

  if (type.requiresOrder) {
    throw new AbsenceRangeError(
      400,
      'ORDER_REQUIRED_NOT_ALLOWED',
      `Typ czasu pracy '${workTimeTypeCode}' wymaga zlecenia i nie może być użyty do rejestracji nieobecności w zakresie`,
    );
  }

  const weekendsCount = allDates.filter((d) => isWeekend(d)).length;
  const workingDates = allDates.filter((d) => !isWeekend(d));

  // Find existing reports for working days
  const workingDateObjects = workingDates.map((d) => new Date(`${d}T00:00:00.000Z`));

  const existingReports = await client.workTimeReport.findMany({
    where: {
      employeeId,
      deletedAt: null,
      date: { in: workingDateObjects },
    },
    select: { date: true },
  });

  const existingDatesSet = new Set(
    existingReports.map((r) => r.date.toISOString().slice(0, 10)),
  );

  const conflicts: ConflictItem[] = [];
  const availableDates: string[] = [];

  for (const dateStr of workingDates) {
    if (existingDatesSet.has(dateStr)) {
      conflicts.push({ date: dateStr, reason: 'EXISTING_ENTRY' });
    } else {
      availableDates.push(dateStr);
    }
  }

  conflicts.sort((a, b) => a.date.localeCompare(b.date));

  return {
    employee,
    type,
    allDates,
    calendarDays: allDates.length,
    workingDays: workingDates.length,
    weekends: weekendsCount,
    availableDates,
    availableDays: availableDates.length,
    skipped: conflicts.length,
    totalHours: availableDates.length * hoursPerDay,
    conflicts,
  };
}

/**
 * Returns preview calculations without modifying DB.
 */
export async function getAbsenceRangePreview(
  params: Omit<AbsenceRangeParams, 'userId' | 'requestId'>,
  client = prisma,
): Promise<AbsenceRangePreviewResult> {
  const analysis = await validateAndAnalyzeRange(params, client);

  return {
    calendarDays: analysis.calendarDays,
    workingDays: analysis.workingDays,
    weekends: analysis.weekends,
    availableDays: analysis.availableDays,
    skipped: analysis.skipped,
    totalHours: analysis.totalHours,
    conflicts: analysis.conflicts,
  };
}

/**
 * Saves absence entries for available working days in a single transaction with advisory locking.
 */
export async function createAbsenceRange({
  employeeId,
  workTimeTypeCode,
  dateFrom,
  dateTo,
  hoursPerDay,
  userId,
  requestId,
  client = prisma,
}: AbsenceRangeParams): Promise<AbsenceRangeSaveResult> {
  const lockKey = `absence-range:${employeeId}`;
  const operationId = randomUUID();

  return client.$transaction(async (tx) => {
    // Transactional advisory lock per employee
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

    // Re-analyze range inside transaction to guarantee consistency
    const analysis = await validateAndAnalyzeRange(
      { employeeId, workTimeTypeCode, dateFrom, dateTo, hoursPerDay },
      tx as any,
    );

    const reportsToCreate = analysis.availableDates.map((dateStr) => ({
      id: randomUUID(),
      employeeId,
      date: new Date(`${dateStr}T00:00:00.000Z`),
      hours: hoursPerDay,
      workTimeTypeCode,
      orderId: null,
      missingCard: false,
      createdByUserId: userId,
    }));

    if (reportsToCreate.length > 0) {
      await tx.workTimeReport.createMany({
        data: reportsToCreate,
      });
    }

    const createdCount = reportsToCreate.length;
    const totalHoursCreated = createdCount * hoursPerDay;

    // Single aggregate audit log entry
    await logChange(
      {
        tableName: 'work_time_reports',
        recordId: operationId,
        action: 'CREATE',
        newValues: {
          eventType: 'CREATE_ABSENCE_RANGE',
          operationId,
          requestId,
          employeeId,
          workTimeTypeCode,
          dateFrom,
          dateTo,
          hoursPerDay,
          calendarDays: analysis.calendarDays,
          workingDays: analysis.workingDays,
          weekends: analysis.weekends,
          createdCount,
          skippedCount: analysis.skipped,
          totalHoursCreated,
          conflicts: analysis.conflicts,
        },
        userId,
      },
      { client: tx as any, rethrow: true },
    );

    return {
      created: createdCount,
      skipped: analysis.skipped,
      weekends: analysis.weekends,
      totalHoursCreated,
      conflicts: analysis.conflicts,
    };
  });
}
