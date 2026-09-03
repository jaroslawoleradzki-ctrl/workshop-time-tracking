import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticateJWT, requireRole } from '../middlewares/auth';
import { logChange } from '../utils/audit';
import logger from '../utils/logger';
import {
  CopyLastDayError,
  copyLastDayForEmployee,
  copyLastDayRequestSchema,
  getReportDayLockKey,
} from '../services/copy-last-day';
import {
  AbsenceRangeError,
  absenceRangeRequestSchema,
  createAbsenceRange,
  getAbsenceRangePreview,
} from '../services/absence-range';
import {
  getWorkingDayDecision,
  isWorkTimeReportAllowedOnCalendarDay,
} from '../services/company-calendar';

const router = Router();

// Auth required for all
router.use(authenticateJWT);

// GET /by-employee-date - fetch reports for employee on date
router.get('/by-employee-date', async (req: AuthRequest, res: Response) => {
  const { employeeId, date } = req.query;

  if (!employeeId || !date) {
    return res.status(400).json({ message: 'employeeId i date są wymagane' });
  }

  try {
    const reports = await prisma.workTimeReport.findMany({
      where: {
        employeeId: employeeId as string,
        date: new Date(date as string),
        deletedAt: null,
      },
      include: {
        order: {
          select: {
            orderNumber: true,
            productCode: true,
            productName: true,
            accountingAccount: true,
          },
        },
        workTimeType: {
          select: {
            code: true,
            name: true,
            requiresOrder: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const formatted = reports.map((r) => ({
      id: r.id,
      date: r.date.toISOString().split('T')[0],
      employeeId: r.employeeId,
      orderId: r.orderId,
      hours: Number(r.hours),
      workTimeTypeCode: r.workTimeTypeCode,
      missingCard: r.missingCard,
      createdByUserId: r.createdByUserId,
      createdAt: r.createdAt,
      order: r.order,
      workTimeType: r.workTimeType,
    }));

    return res.json(formatted);
  } catch (error) {
    logger.error(error, 'Błąd podczas pobierania wpisów');
    return res.status(500).json({ message: 'Błąd podczas pobierania wpisów' });
  }
});

// Helper to calculate warnings
async function checkLimits(params: {
  employeeId: string;
  dateStr: string;
  hours: number;
  code: string;
  excludeReportId?: string;
}) {
  const targetDate = new Date(params.dateStr);

  const existing = await prisma.workTimeReport.findMany({
    where: {
      employeeId: params.employeeId,
      date: targetDate,
      deletedAt: null,
      ...(params.excludeReportId ? { id: { not: params.excludeReportId } } : {}),
    },
    select: {
      hours: true,
      workTimeTypeCode: true,
    },
  });

  let existingStandard = 0;
  let existingTotal = 0;

  for (const r of existing) {
    const hrs = Number(r.hours);
    existingTotal += hrs;
    if (r.workTimeTypeCode === 'G') {
      existingStandard += hrs;
    }
  }

  const newHrs = Number(params.hours);
  const totalStandard = existingStandard + (params.code === 'G' ? newHrs : 0);
  const totalHours = existingTotal + newHrs;

  return {
    warnStandard: totalStandard > 8,
    warnTotal12: totalHours > 12,
    warnTotal24: totalHours > 24,
    totalStandard,
    totalHours,
  };
}

// POST /check-warnings - endpoint to check warnings before saving
router.post('/check-warnings', async (req: AuthRequest, res: Response) => {
  const { employeeId, date, hours, workTimeTypeCode, excludeReportId } = req.body;

  if (!employeeId || !date || hours === undefined || !workTimeTypeCode) {
    return res.status(400).json({ message: 'Wszystkie dane są wymagane do analizy' });
  }

  try {
    const warnings = await checkLimits({
      employeeId,
      dateStr: date,
      hours: Number(hours),
      code: workTimeTypeCode,
      excludeReportId,
    });

    return res.json(warnings);
  } catch (error) {
    logger.error(error, 'Błąd podczas sprawdzania limitów');
    return res.status(500).json({ message: 'Błąd podczas sprawdzania limitów' });
  }
});

// POST /absence-range/preview - Preview absence range entries without modifying DB
router.post(
  '/absence-range/preview',
  requireRole(['admin', 'leader']),
  async (req: AuthRequest, res: Response) => {
    const parsedRequest = absenceRangeRequestSchema.safeParse(req.body);
    if (!parsedRequest.success) {
      return res.status(400).json({
        message: 'Nieprawidłowe dane żądania podglądu nieobecności.',
        code: 'INVALID_ABSENCE_RANGE_REQUEST',
        errors: parsedRequest.error.flatten().fieldErrors,
      });
    }

    try {
      const result = await getAbsenceRangePreview(parsedRequest.data);
      return res.json(result);
    } catch (error) {
      if (error instanceof AbsenceRangeError) {
        return res.status(error.statusCode).json({
          message: error.message,
          code: error.code,
        });
      }
      logger.error(error, 'Błąd podczas generowania podglądu nieobecności');
      return res.status(500).json({ message: 'Błąd podczas generowania podglądu nieobecności' });
    }
  },
);

// POST /absence-range - Save absence range entries
router.post(
  '/absence-range',
  requireRole(['admin', 'leader']),
  async (req: AuthRequest, res: Response) => {
    const requestId = randomUUID();
    const parsedRequest = absenceRangeRequestSchema.safeParse(req.body);
    if (!parsedRequest.success) {
      return res.status(400).json({
        message: 'Nieprawidłowe dane żądania zapisu nieobecności.',
        code: 'INVALID_ABSENCE_RANGE_REQUEST',
        errors: parsedRequest.error.flatten().fieldErrors,
        requestId,
      });
    }

    try {
      const result = await createAbsenceRange({
        ...parsedRequest.data,
        userId: req.user!.id,
        requestId,
      });

      const statusCode = result.created > 0 ? 201 : 200;
      return res.status(statusCode).json(result);
    } catch (error) {
      if (error instanceof AbsenceRangeError) {
        return res.status(error.statusCode).json({
          message: error.message,
          code: error.code,
          requestId,
        });
      }
      logger.error(error, 'Błąd podczas zapisywania zakresu nieobecności');
      return res.status(500).json({
        message: 'Błąd podczas zapisywania zakresu nieobecności',
        code: 'ABSENCE_RANGE_SAVE_FAILED',
        requestId,
      });
    }
  },
);

// POST / - create a report
router.post('/', async (req: AuthRequest, res: Response) => {
  const { date, employeeId, orderId, hours, workTimeTypeCode, missingCard } = req.body;

  if (!date || !employeeId || hours === undefined || !workTimeTypeCode) {
    return res.status(400).json({ message: 'Wymagane pola: date, employeeId, hours, workTimeTypeCode' });
  }

  const hoursNum = Number(hours);
  if (isNaN(hoursNum) || hoursNum <= 0) {
    return res.status(400).json({ message: 'Liczba godzin musi być większa od zera' });
  }

  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) {
    return res.status(400).json({ message: 'Nieprawidłowa data wpisu' });
  }
  const workDate = parsedDate.toISOString().slice(0, 10);
  const reportDate = new Date(`${workDate}T00:00:00.000Z`);

  const missingCardBool = missingCard === true;

  try {
    // 1. Validate employee
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId, deletedAt: null },
    });
    if (!employee || !employee.isActive) {
      return res.status(400).json({ message: 'Pracownik nie istnieje lub jest nieaktywny' });
    }

    // 2. Validate work time type
    const type = await prisma.workTimeType.findUnique({
      where: { code: workTimeTypeCode },
    });
    if (!type) {
      return res.status(400).json({ message: 'Kod czasu pracy nie istnieje' });
    }

    // 2b. Validate entries against the company calendar.
    const calendarDay = await getWorkingDayDecision(workDate);
    if (!isWorkTimeReportAllowedOnCalendarDay(calendarDay, type, orderId)) {
      return res.status(400).json({
        message: 'W dni wolne (sobota, niedziela) dozwolona jest wyłącznie rejestracja pracy nad zleceniem; typ G i nieobecności są niedozwolone.',
        code: 'NON_WORKING_DAY_ENTRY_NOT_ALLOWED',
      });
    }

    // 3. Enforce order requirement
    if (type.requiresOrder) {
      if (!orderId) {
        return res.status(400).json({ message: `Dla typu '${workTimeTypeCode}' wymagane jest podanie zlecenia` });
      }
      const order = await prisma.order.findUnique({
        where: { id: orderId, deletedAt: null },
      });
      if (!order) {
        return res.status(400).json({ message: 'Wybrane zlecenie nie istnieje' });
      }
    }

    // Calculate warnings
    const warnings = await checkLimits({
      employeeId,
      dateStr: workDate,
      hours: hoursNum,
      code: workTimeTypeCode,
    });

    // 4. Serialize the insert with copy-last-day for this employee and date.
    // The lock is held by PostgreSQL until the insert transaction commits.
    const report = await prisma.$transaction(
      async (tx) => {
        const lockKey = getReportDayLockKey(employeeId, workDate);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

        return tx.workTimeReport.create({
          data: {
            date: reportDate,
            employeeId,
            orderId: type.requiresOrder ? orderId : null,
            hours: hoursNum,
            workTimeTypeCode,
            missingCard: missingCardBool,
            createdByUserId: req.user!.id,
          },
          include: {
            order: true,
            workTimeType: true,
          },
        });
      },
      {
        maxWait: 10_000,
        timeout: 30_000,
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      },
    );

    // 5. Log audit
    await logChange({
      tableName: 'work_time_reports',
      recordId: report.id,
      action: 'CREATE',
      newValues: report,
      userId: req.user!.id,
    });

    return res.status(201).json({
      report: {
        ...report,
        hours: Number(report.hours),
      },
      warnings,
    });
  } catch (error) {
    logger.error(error, 'Błąd podczas dodawania wpisu czasu pracy');
    return res.status(500).json({ message: 'Błąd podczas dodawania wpisu czasu pracy' });
  }
});

// PUT /:id - update report
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { date, employeeId, orderId, hours, workTimeTypeCode, missingCard } = req.body;

  if (!date || !employeeId || hours === undefined || !workTimeTypeCode) {
    return res.status(400).json({ message: 'Wszystkie pola są wymagane' });
  }

  const hoursNum = Number(hours);
  if (isNaN(hoursNum) || hoursNum <= 0) {
    return res.status(400).json({ message: 'Liczba godzin musi być większa od zera' });
  }

  const missingCardBool = missingCard === true;

  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) {
    return res.status(400).json({ message: 'Nieprawidłowa data wpisu' });
  }
  const workDate = parsedDate.toISOString().slice(0, 10);
  const reportDate = new Date(`${workDate}T00:00:00.000Z`);

  try {
    const oldReport = await prisma.workTimeReport.findUnique({
      where: { id, deletedAt: null },
    });

    if (!oldReport) {
      return res.status(404).json({ message: 'Wpis nie istnieje' });
    }

    // Validate type and order requirement
    const type = await prisma.workTimeType.findUnique({
      where: { code: workTimeTypeCode },
    });
    if (!type) {
      return res.status(400).json({ message: 'Kod czasu pracy nie istnieje' });
    }

    const calendarDay = await getWorkingDayDecision(workDate);
    if (!isWorkTimeReportAllowedOnCalendarDay(calendarDay, type, orderId)) {
      return res.status(400).json({
        message: 'W dni wolne (sobota, niedziela) dozwolona jest wyłącznie rejestracja pracy nad zleceniem; typ G i nieobecności są niedozwolone.',
        code: 'NON_WORKING_DAY_ENTRY_NOT_ALLOWED',
      });
    }

    if (type.requiresOrder) {
      if (!orderId) {
        return res.status(400).json({ message: `Dla typu '${workTimeTypeCode}' wymagane jest podanie zlecenia` });
      }
      const order = await prisma.order.findUnique({
        where: { id: orderId, deletedAt: null },
      });
      if (!order) {
        return res.status(400).json({ message: 'Wybrane zlecenie nie istnieje' });
      }
    }

    const updated = await prisma.workTimeReport.update({
      where: { id },
      data: {
        date: reportDate,
        employeeId,
        orderId: type.requiresOrder ? orderId : null,
        hours: hoursNum,
        workTimeTypeCode,
        missingCard: missingCardBool,
        modifiedByUserId: req.user!.id,
      },
      include: {
        order: true,
        workTimeType: true,
      },
    });

    // Log audit
    await logChange({
      tableName: 'work_time_reports',
      recordId: id,
      action: 'UPDATE',
      oldValues: oldReport,
      newValues: updated,
      userId: req.user!.id,
    });

    return res.json({
      report: {
        ...updated,
        hours: Number(updated.hours),
      },
    });
  } catch (error) {
    logger.error(error, 'Błąd podczas edycji wpisu');
    return res.status(500).json({ message: 'Błąd podczas edycji wpisu' });
  }
});

// Soft DELETE report
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const oldReport = await prisma.workTimeReport.findUnique({
      where: { id, deletedAt: null },
    });

    if (!oldReport) {
      return res.status(404).json({ message: 'Wpis nie istnieje' });
    }

    const updated = await prisma.workTimeReport.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        modifiedByUserId: req.user!.id,
      },
    });

    // Log audit
    await logChange({
      tableName: 'work_time_reports',
      recordId: id,
      action: 'DELETE',
      oldValues: oldReport,
      newValues: updated,
      userId: req.user!.id,
    });

    return res.json({ message: 'Wpis został pomyślnie usunięty' });
  } catch (error) {
    logger.error(error, 'Błąd podczas usuwania wpisu');
    return res.status(500).json({ message: 'Błąd podczas usuwania wpisu' });
  }
});

// POST /copy-last-day - atomically copy the selected employee's last active day
router.post(
  '/copy-last-day',
  requireRole(['admin', 'leader']),
  async (req: AuthRequest, res: Response) => {
    const requestIdHeader = req.headers['x-request-id'];
    const requestId =
      (Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader) || randomUUID();
    const startedAt = Date.now();
    const parsedRequest = copyLastDayRequestSchema.safeParse(req.body);

    res.setHeader('X-Request-Id', requestId);

    if (!parsedRequest.success) {
      logger.warn(
        {
          requestId,
          userId: req.user!.id,
          employeeId: typeof req.body?.employeeId === 'string' ? req.body.employeeId : null,
          sourceDate: null,
          targetDate: typeof req.body?.date === 'string' ? req.body.date : null,
          sourceCount: 0,
          createdCount: 0,
          status: 'validation_error',
          durationMs: Date.now() - startedAt,
          issues: parsedRequest.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
        'Copy last day rejected',
      );

      return res.status(400).json({
        message: 'Nieprawidłowe dane żądania kopiowania.',
        code: 'INVALID_COPY_REQUEST',
        errors: parsedRequest.error.flatten().fieldErrors,
        requestId,
      });
    }

    const { employeeId, date } = parsedRequest.data;

    try {
      const result = await copyLastDayForEmployee({
        employeeId,
        targetDate: date,
        userId: req.user!.id,
        requestId,
      });

      logger.info(
        {
          requestId,
          operationId: result.operationId,
          userId: req.user!.id,
          employeeId: result.employeeId,
          sourceDate: result.sourceDate,
          targetDate: result.targetDate,
          sourceCount: result.sourceCount,
          createdCount: result.createdCount,
          status: 'success',
          durationMs: Date.now() - startedAt,
        },
        'Copy last day completed',
      );

      return res.status(201).json({
        message: `Skopiowano ${result.createdCount} wpisów z dnia ${result.sourceDate}.`,
        requestId,
        employeeId: result.employeeId,
        sourceDate: result.sourceDate,
        targetDate: result.targetDate,
        createdCount: result.createdCount,
      });
    } catch (error) {
      if (error instanceof CopyLastDayError) {
        logger.warn(
          {
            requestId,
            userId: req.user!.id,
            employeeId,
            sourceDate: error.context.sourceDate || null,
            targetDate: date,
            sourceCount: error.context.sourceCount || 0,
            createdCount: 0,
            status: error.code,
            durationMs: Date.now() - startedAt,
          },
          'Copy last day rejected',
        );

        return res.status(error.statusCode).json({
          message: error.message,
          code: error.code,
          requestId,
          employeeId,
          targetDate: date,
        });
      }

      logger.error(
        {
          err: error,
          requestId,
          userId: req.user!.id,
          employeeId,
          sourceDate: null,
          targetDate: date,
          sourceCount: 0,
          createdCount: 0,
          status: 'error',
          durationMs: Date.now() - startedAt,
        },
        'Copy last day failed',
      );
      return res.status(500).json({
        message: 'Błąd podczas kopiowania wpisów.',
        code: 'COPY_LAST_DAY_FAILED',
        requestId,
      });
    }
  },
);

export default router;
