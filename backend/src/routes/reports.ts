import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticateJWT } from '../middlewares/auth';
import { logChange } from '../utils/audit';
import logger from '../utils/logger';

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

// POST / - create a report
router.post('/', async (req: AuthRequest, res: Response) => {
  const { date, employeeId, orderId, hours, workTimeTypeCode } = req.body;

  if (!date || !employeeId || hours === undefined || !workTimeTypeCode) {
    return res.status(400).json({ message: 'Wymagane pola: date, employeeId, hours, workTimeTypeCode' });
  }

  const hoursNum = Number(hours);
  if (isNaN(hoursNum) || hoursNum <= 0) {
    return res.status(400).json({ message: 'Liczba godzin musi być większa od zera' });
  }

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
      dateStr: date,
      hours: hoursNum,
      code: workTimeTypeCode,
    });

    // 4. Create the report
    const report = await prisma.workTimeReport.create({
      data: {
        date: new Date(date),
        employeeId,
        orderId: type.requiresOrder ? orderId : null,
        hours: hoursNum,
        workTimeTypeCode,
        createdByUserId: req.user!.id,
      },
      include: {
        order: true,
        workTimeType: true,
      },
    });

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
  const { date, employeeId, orderId, hours, workTimeTypeCode } = req.body;

  if (!date || !employeeId || hours === undefined || !workTimeTypeCode) {
    return res.status(400).json({ message: 'Wszystkie pola są wymagane' });
  }

  const hoursNum = Number(hours);
  if (isNaN(hoursNum) || hoursNum <= 0) {
    return res.status(400).json({ message: 'Liczba godzin musi być większa od zera' });
  }

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
        date: new Date(date),
        employeeId,
        orderId: type.requiresOrder ? orderId : null,
        hours: hoursNum,
        workTimeTypeCode,
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

// POST /copy-last-day - copy entries from the last day that has entries
router.post('/copy-last-day', async (req: AuthRequest, res: Response) => {
  const { date } = req.body; // Target date (YYYY-MM-DD)

  if (!date) {
    return res.status(400).json({ message: 'Bieżąca data (date) jest wymagana' });
  }

  try {
    const targetDate = new Date(date);

    // 1. Find the last day containing reports before targetDate
    const lastReport = await prisma.workTimeReport.findFirst({
      where: {
        deletedAt: null,
        date: {
          lt: targetDate,
        },
      },
      orderBy: { date: 'desc' },
      select: { date: true },
    });

    if (!lastReport) {
      return res.status(400).json({ message: 'Brak wpisów w bazie danych z dni poprzedzających do skopiowania.' });
    }

    // 2. Fetch all reports from that day
    const reportsToCopy = await prisma.workTimeReport.findMany({
      where: {
        date: lastReport.date,
        deletedAt: null,
      },
      include: {
        employee: true,
        order: true,
      },
    });

    if (reportsToCopy.length === 0) {
      return res.status(400).json({ message: 'Brak aktywnego czasu pracy do skopiowania.' });
    }

    // 3. Filter out employees or orders that are currently soft-deleted
    const validReports = reportsToCopy.filter((r) => {
      // Check if employee is active and not deleted
      if (r.employee.deletedAt || !r.employee.isActive) return false;
      // Check if order is not deleted (if order is required)
      if (r.orderId && r.order?.deletedAt) return false;
      return true;
    });

    // 4. Create new reports for targetDate
    const createdReports = [];
    for (const report of validReports) {
      const newReport = await prisma.workTimeReport.create({
        data: {
          date: targetDate,
          employeeId: report.employeeId,
          orderId: report.orderId,
          hours: report.hours,
          workTimeTypeCode: report.workTimeTypeCode,
          createdByUserId: req.user!.id,
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
            },
          },
        },
      });

      // Log audit
      await logChange({
        tableName: 'work_time_reports',
        recordId: newReport.id,
        action: 'CREATE',
        newValues: newReport,
        userId: req.user!.id,
      });

      createdReports.push({
        ...newReport,
        hours: Number(newReport.hours),
      });
    }

    const formattedLastDate = lastReport.date.toISOString().split('T')[0];

    return res.status(201).json({
      message: `Skopiowano wpisy z dnia ${formattedLastDate}`,
      copiedFromDate: formattedLastDate,
      reports: createdReports,
    });
  } catch (error) {
    logger.error(error, 'Błąd podczas kopiowania wpisów');
    return res.status(500).json({ message: 'Błąd podczas kopiowania wpisów' });
  }
});

export default router;
