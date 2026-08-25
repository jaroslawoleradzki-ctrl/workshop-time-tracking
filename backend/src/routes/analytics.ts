import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticateJWT } from '../middlewares/auth';
import * as ExcelJS from 'exceljs';
import { OrderStatus } from '@prisma/client';
import logger from '../utils/logger';

const router = Router();

// Auth required
router.use(authenticateJWT);

type EmployeeReportFilters = {
  dateFrom?: string;
  dateTo?: string;
  employeeId?: string;
};

type EmployeeReportRow = {
  employeeId: string;
  employeeName: string;
  suma: number;
  [workTimeTypeCode: string]: string | number;
};

type EmployeeReportType = {
  code: string;
  name: string;
};

type AbsencePeriodFilters = {
  dateFrom?: string;
  dateTo?: string;
  employeeId?: string;
  workTimeTypeCode?: string;
};

type OrderReportFilters = {
  dateFrom?: string;
  dateTo?: string;
  status?: unknown;
  orderNumber?: string;
  onlyWithHours: boolean;
  closureReport: boolean;
};

export type OrderReportRow = {
  orderNumber: string;
  productName: string;
  productCode: string | null;
  accountingAccount: string | null;
  quantity: number | null;
  quantityUnit: string;
  plannedHours: number;
  actualHours: number;
  deviation: number;
  percent: number;
  status: OrderStatus;
  completionDate: string | null;
};

export type AbsencePeriodRow = {
  employeeId: string;
  employeeName: string;
  workTimeTypeCode: string;
  absenceType: string;
  dateFrom: string;
  dateTo: string;
  workingDays: number;
};

export const OVERTIME_CODES = ['NDR', 'NS'];

type InternalPivotRow = {
  employeeId: string;
  employeeName: string;
  sortKey: string;
  suma: number;
  sumaBezNadgodzin: number;
  counts: Record<string, number>;
};

export function formatEmployeeName(emp: {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
}): string {
  const lastName = emp.lastName ? emp.lastName.trim() : '';
  const firstName = emp.firstName ? emp.firstName.trim() : '';

  if (lastName && firstName) {
    return `${lastName} ${firstName}`;
  }
  if (lastName) {
    return lastName;
  }
  if (firstName) {
    return firstName;
  }
  const fullName = emp.fullName ? emp.fullName.trim() : '';
  if (fullName) {
    return fullName;
  }
  return 'Brak danych';
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function nextWorkingDate(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  do {
    date.setUTCDate(date.getUTCDate() + 1);
  } while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
  return formatDateKey(date);
}

export async function getAbsencePeriodRows(
  filters: AbsencePeriodFilters,
): Promise<AbsencePeriodRow[]> {
  const reports = await prisma.workTimeReport.findMany({
    where: {
      deletedAt: null,
      employeeId: filters.employeeId || undefined,
      workTimeTypeCode: filters.workTimeTypeCode || undefined,
      date: {
        gte: filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00.000Z`) : undefined,
        lte: filters.dateTo ? new Date(`${filters.dateTo}T00:00:00.000Z`) : undefined,
      },
      workTimeType: {
        isAbsence: true,
      },
    },
    include: {
      employee: true,
      workTimeType: true,
    },
    orderBy: [
      { employeeId: 'asc' },
      { workTimeTypeCode: 'asc' },
      { date: 'asc' },
    ],
  });

  const groupedDays = new Map<string, {
    employeeId: string;
    employeeName: string;
    employeeSortKey: string;
    workTimeTypeCode: string;
    absenceType: string;
    dates: Set<string>;
  }>();

  for (const report of reports) {
    if (!report.workTimeType.isAbsence) continue;
    if (report.date.getUTCDay() === 0 || report.date.getUTCDay() === 6) continue;
    const employeeName = formatEmployeeName(report.employee);
    const employeeSortKey = `${report.employee.lastName || ''} ${report.employee.firstName || ''} ${employeeName}`.trim();
    const key = `${report.employeeId}\u0000${report.workTimeTypeCode}`;
    const group = groupedDays.get(key) || {
      employeeId: report.employeeId,
      employeeName,
      employeeSortKey,
      workTimeTypeCode: report.workTimeTypeCode,
      absenceType: `${report.workTimeType.code} (${report.workTimeType.name})`,
      dates: new Set<string>(),
    };
    group.dates.add(formatDateKey(report.date));
    groupedDays.set(key, group);
  }

  const periods: Array<AbsencePeriodRow & { employeeSortKey: string }> = [];
  for (const group of groupedDays.values()) {
    const dates = [...group.dates].sort();
    let periodStart = '';
    let periodEnd = '';
    let workingDays = 0;

    const flush = () => {
      if (!periodStart) return;
      periods.push({
        employeeId: group.employeeId,
        employeeName: group.employeeName,
        employeeSortKey: group.employeeSortKey,
        workTimeTypeCode: group.workTimeTypeCode,
        absenceType: group.absenceType,
        dateFrom: periodStart,
        dateTo: periodEnd,
        workingDays,
      });
    };

    for (const date of dates) {
      if (!periodStart) {
        periodStart = date;
        periodEnd = date;
        workingDays = 1;
      } else if (date === nextWorkingDate(periodEnd)) {
        periodEnd = date;
        workingDays += 1;
      } else {
        flush();
        periodStart = date;
        periodEnd = date;
        workingDays = 1;
      }
    }
    flush();
  }

  return periods
    .sort((a, b) =>
      a.employeeSortKey.localeCompare(b.employeeSortKey, 'pl') ||
      a.absenceType.localeCompare(b.absenceType, 'pl') ||
      a.dateFrom.localeCompare(b.dateFrom),
    )
    .map(({ employeeSortKey: _employeeSortKey, ...row }) => row);
}

async function getEmployeeReportRows(filters: EmployeeReportFilters): Promise<EmployeeReportRow[]> {
  const reports = await prisma.workTimeReport.findMany({
    where: {
      deletedAt: null,
      employeeId: filters.employeeId || undefined,
      date: {
        gte: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
        lte: filters.dateTo ? new Date(filters.dateTo) : undefined,
      },
    },
    include: {
      employee: true,
      workTimeType: true,
    },
  });

  const pivot: Record<string, InternalPivotRow> = {};

  reports.forEach((report) => {
    const employeeId = report.employeeId;
    if (!pivot[employeeId]) {
      const emp = report.employee;
      const lastNameForSort = (emp.lastName || (emp.fullName ? emp.fullName.trim().split(' ').slice(-1)[0] : '') || '').trim();
      const firstNameForSort = (emp.firstName || (emp.fullName ? emp.fullName.trim().split(' ').slice(0, -1).join(' ') : '') || '').trim();
      const sortKey = `${lastNameForSort} ${firstNameForSort}`.trim().toLowerCase();
      const employeeName = formatEmployeeName(emp);

      pivot[employeeId] = {
        employeeId,
        employeeName,
        sortKey,
        suma: 0,
        sumaBezNadgodzin: 0,
        counts: {},
      };
    }

    const hours = Number(report.hours);
    const code = report.workTimeTypeCode;
    const isOvertime =
      OVERTIME_CODES.includes(code) ||
      code.startsWith('ND') ||
      code.startsWith('NS') ||
      (report.workTimeType?.name?.toLowerCase().includes('nadgodzin') ?? false);

    pivot[employeeId].counts[code] = (pivot[employeeId].counts[code] || 0) + hours;
    pivot[employeeId].suma += hours;
    if (!isOvertime) {
      pivot[employeeId].sumaBezNadgodzin += hours;
    }
  });

  return Object.values(pivot)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'pl'))
    .map((item) => {
      const { sortKey, counts, ...rest } = item;
      return {
        ...rest,
        ...counts,
      };
    });
}

async function getEmployeeReportTypes(): Promise<EmployeeReportType[]> {
  return prisma.workTimeType.findMany({
    select: {
      code: true,
      name: true,
    },
    orderBy: [{ createdAt: 'asc' }, { code: 'asc' }],
  });
}

import {
  generateExcelResponse,
  ExcelReportMetadata,
  ReportFilterItem,
  formatDateISO,
  buildDateRangeText,
  formatGeneratedAt,
} from '../utils/excel-report';

export {
  ReportFilterItem,
  ExcelReportMetadata,
  formatDateISO,
  buildDateRangeText,
  formatGeneratedAt,
};

// ================= ROUTES =================

// 1. Dashboard Synthetics
router.get('/dashboard', async (_req: AuthRequest, res: Response) => {
  try {
    const openOrdersCount = await prisma.order.count({
      where: { deletedAt: null, status: OrderStatus.OPEN, isActive: true },
    });

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const closedThisMonthCount = await prisma.order.count({
      where: {
        deletedAt: null,
        status: OrderStatus.CLOSED,
        completionDate: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    });

    const reportsToday = await prisma.workTimeReport.aggregate({
      where: {
        deletedAt: null,
        date: { gte: startOfToday, lte: endOfToday },
      },
      _sum: { hours: true },
    });

    const reportsMonth = await prisma.workTimeReport.aggregate({
      where: {
        deletedAt: null,
        date: { gte: startOfMonth, lte: endOfMonth },
      },
      _sum: { hours: true },
    });

    // Fetch ALL open active orders with their reports
    const openOrders = await prisma.order.findMany({
      where: { deletedAt: null, status: OrderStatus.OPEN, isActive: true },
      include: {
        reports: {
          where: { deletedAt: null },
          select: { hours: true },
        },
      },
    });

    const analyzedOrders = openOrders.map((o) => {
      const plannedHours = Number(o.plannedHours || 0);
      const actualHours = o.reports.reduce((sum: number, r: any) => sum + Number(r.hours), 0);
      const rawPercent = plannedHours > 0 ? (actualHours / plannedHours) * 100 : 0;
      const percent = Math.round(rawPercent * 100) / 100;
      const roundedActual = Math.round(actualHours * 100) / 100;
      const roundedPlanned = Math.round(plannedHours * 100) / 100;

      return {
        id: o.id,
        orderNumber: o.orderNumber,
        productName: o.productName,
        plannedHours: roundedPlanned,
        actualHours: roundedActual,
        percent,
      };
    });

    const sortOrders = (a: typeof analyzedOrders[0], b: typeof analyzedOrders[0]) => {
      if (b.percent !== a.percent) {
        return b.percent - a.percent;
      }
      return a.orderNumber.localeCompare(b.orderNumber);
    };

    const ordersExceeding = analyzedOrders
      .filter((o) => o.percent > 100)
      .sort(sortOrders);

    const ordersApproaching = analyzedOrders
      .filter((o) => o.percent >= 80 && o.percent <= 100)
      .sort(sortOrders);

    return res.json({
      openOrdersCount,
      closedThisMonthCount,
      hoursToday: Number(reportsToday._sum.hours || 0),
      hoursMonth: Number(reportsMonth._sum.hours || 0),
      ordersExceeding,
      ordersApproaching,
    });
  } catch (error) {
    logger.error(error, 'Błąd podczas pobierania danych pulpitu');
    return res.status(500).json({ message: 'Błąd podczas pobierania danych pulpitu' });
  }
});

const VALID_ORDER_STATUSES: OrderStatus[] = ['OPEN', 'SUSPENDED', 'CLOSED'];
const parseOrderStatus = (statusParam: unknown): OrderStatus | undefined => {
  if (typeof statusParam !== 'string' || !statusParam.trim()) return undefined;
  const upper = statusParam.trim().toUpperCase() as OrderStatus;
  return VALID_ORDER_STATUSES.includes(upper) ? upper : undefined;
};

const parseBooleanQuery = (value: unknown): boolean | null => {
  if (value === undefined) return false;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return null;
};

const isValidDateKey = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && formatDateKey(parsed) === value;
};

const validateClosureDateRange = (closureReport: boolean, dateFrom: unknown, dateTo: unknown) => {
  if (!closureReport) return null;
  if (!isValidDateKey(dateFrom) || !isValidDateKey(dateTo) || dateFrom > dateTo) {
    return {
      code: 'INVALID_CLOSURE_REPORT_PARAMS',
      message: 'Raport zamknięcia wymaga prawidłowego zakresu dat YYYY-MM-DD.',
    };
  }
  return null;
};

export async function getOrderReportRows(filters: OrderReportFilters): Promise<OrderReportRow[]> {
  const reportDateRange = {
    gte: filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00.000Z`) : undefined,
    lte: filters.dateTo ? new Date(`${filters.dateTo}T00:00:00.000Z`) : undefined,
  };
  const completionDateRange = filters.closureReport ? {
    gte: new Date(`${filters.dateFrom}T00:00:00.000Z`),
    lte: new Date(`${filters.dateTo}T23:59:59.999Z`),
  } : undefined;

  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      orderNumber: filters.orderNumber
        ? { contains: filters.orderNumber, mode: 'insensitive' }
        : undefined,
      status: filters.closureReport ? undefined : parseOrderStatus(filters.status),
      OR: filters.closureReport
        ? [
            { status: OrderStatus.OPEN },
            { status: OrderStatus.CLOSED, completionDate: completionDateRange },
          ]
        : undefined,
    },
    include: {
      reports: {
        where: {
          deletedAt: null,
          date: reportDateRange,
        },
        select: { hours: true },
      },
    },
    orderBy: { orderNumber: 'asc' },
  });

  let rows = orders.map((order): OrderReportRow => {
    const plannedHours = Number(order.plannedHours);
    const actualHours = order.reports.reduce((sum, report) => sum + Number(report.hours), 0);
    const deviation = plannedHours - actualHours;
    const percent = plannedHours > 0 ? (actualHours / plannedHours) * 100 : 0;

    return {
      orderNumber: order.orderNumber,
      productName: order.productName,
      productCode: order.productCode,
      accountingAccount: order.accountingAccount,
      quantity: order.quantity !== null ? Number(order.quantity) : null,
      quantityUnit: order.quantityUnit || 'szt.',
      plannedHours,
      actualHours: Math.round(actualHours * 100) / 100,
      deviation: Math.round(deviation * 100) / 100,
      percent: Math.round(percent * 100) / 100,
      status: order.status,
      completionDate: order.completionDate ? formatDateKey(order.completionDate) : null,
    };
  });

  if (filters.closureReport) {
    rows = rows.filter(row => row.status === OrderStatus.CLOSED || row.actualHours > 0);
  } else if (filters.onlyWithHours) {
    rows = rows.filter(row => row.actualHours > 0);
  }

  return rows;
}

// 2. Report by Order
router.get('/report-by-order', async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo, status, orderNumber, onlyWithHours } = req.query;
  const closureReport = parseBooleanQuery(req.query.closureReport);
  if (closureReport === null) {
    return res.status(400).json({ code: 'INVALID_CLOSURE_REPORT_PARAMS', message: 'Nieprawidłowa wartość closureReport.' });
  }
  const dateError = validateClosureDateRange(closureReport, dateFrom, dateTo);
  if (dateError) return res.status(400).json(dateError);

  try {
    return res.json(await getOrderReportRows({
      dateFrom: dateFrom as string | undefined,
      dateTo: dateTo as string | undefined,
      status,
      orderNumber: orderNumber as string | undefined,
      onlyWithHours: onlyWithHours === 'true' || onlyWithHours === '1',
      closureReport,
    }));
  } catch (error) {
    logger.error(error, 'Błąd podczas pobierania raportu wg zleceń');
    return res.status(500).json({ message: 'Błąd podczas pobierania raportu wg zleceń' });
  }
});

// 3. Report by Employee (Monthly Pivot)
router.get('/report-by-employee', async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo, employeeId } = req.query;

  try {
    const result = await getEmployeeReportRows({
      dateFrom: dateFrom as string | undefined,
      dateTo: dateTo as string | undefined,
      employeeId: employeeId as string | undefined,
    });
    return res.json(result);
  } catch (error) {
    logger.error(error, 'Błąd podczas pobierania raportu wg pracowników');
    return res.status(500).json({ message: 'Błąd podczas pobierania raportu wg pracowników' });
  }
});

// 4. Report by Accounting Account
router.get('/report-by-account', async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo, accountingAccount } = req.query;

  try {
    const reports = await prisma.workTimeReport.findMany({
      where: {
        deletedAt: null,
        date: {
          gte: dateFrom ? new Date(dateFrom as string) : undefined,
          lte: dateTo ? new Date(dateTo as string) : undefined,
        },
        order: {
          accountingAccount: accountingAccount
            ? { contains: accountingAccount as string, mode: 'insensitive' }
            : undefined,
        },
      },
      include: {
        employee: true,
        order: true,
      },
      orderBy: [{ date: 'asc' }],
    });

    const formatted = reports.map((r) => ({
      id: r.id,
      date: r.date.toISOString().split('T')[0],
      employeeName: r.employee.fullName,
      accountingAccount: r.order?.accountingAccount || 'brak',
      orderNumber: r.order?.orderNumber || '-',
      productName: r.order?.productName || '-',
      hours: Number(r.hours),
      workTimeTypeCode: r.workTimeTypeCode,
    }));

    return res.json(formatted);
  } catch (error) {
    logger.error(error, 'Błąd podczas pobierania raportu wg kont');
    return res.status(500).json({ message: 'Błąd podczas pobierania raportu wg kont' });
  }
});

// 5. Detailed Report
router.get('/report-detailed', async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo, employeeId, orderId, orderNumber } = req.query;

  try {
    const reports = await prisma.workTimeReport.findMany({
      where: {
        deletedAt: null,
        employeeId: employeeId ? (employeeId as string) : undefined,
        orderId: orderId ? (orderId as string) : undefined,
        date: {
          gte: dateFrom ? new Date(dateFrom as string) : undefined,
          lte: dateTo ? new Date(dateTo as string) : undefined,
        },
        order: !orderId && orderNumber
          ? { orderNumber: { contains: orderNumber as string, mode: 'insensitive' } }
          : undefined,
      },
      include: {
        employee: true,
        order: true,
        createdByUser: true,
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    const formatted = reports.map((r) => ({
      id: r.id,
      date: r.date.toISOString().split('T')[0],
      employeeName: r.employee.fullName,
      orderNumber: r.order?.orderNumber || '-',
      productCode: r.order?.productCode || '-',
      productName: r.order?.productName || '-',
      accountingAccount: r.order?.accountingAccount || 'brak',
      hours: Number(r.hours),
      workTimeTypeCode: r.workTimeTypeCode,
      creatorName: r.createdByUser.fullName,
      createdAt: r.createdAt.toISOString(),
      missingCard: r.missingCard,
    }));

    return res.json(formatted);
  } catch (error) {
    logger.error(error, 'Błąd podczas pobierania raportu szczegółowego');
    return res.status(500).json({ message: 'Błąd podczas pobierania raportu szczegółowego' });
  }
});

// 6. Absence Period Report
router.get('/report-absence-periods', async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo, employeeId, workTimeTypeCode } = req.query;

  try {
    const result = await getAbsencePeriodRows({
      dateFrom: dateFrom as string | undefined,
      dateTo: dateTo as string | undefined,
      employeeId: employeeId as string | undefined,
      workTimeTypeCode: workTimeTypeCode as string | undefined,
    });
    return res.json(result);
  } catch (error) {
    logger.error(error, 'Błąd podczas pobierania raportu okresów nieobecności');
    return res.status(500).json({ message: 'Błąd podczas pobierania raportu okresów nieobecności' });
  }
});

// ================= EXPORTS =================

// Export: Order Report
router.get('/export/by-order', async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo, status, orderNumber, onlyWithHours } = req.query;
  const closureReport = parseBooleanQuery(req.query.closureReport);
  if (closureReport === null) {
    return res.status(400).json({ code: 'INVALID_CLOSURE_REPORT_PARAMS', message: 'Nieprawidłowa wartość closureReport.' });
  }
  const dateError = validateClosureDateRange(closureReport, dateFrom, dateTo);
  if (dateError) return res.status(400).json(dateError);

  try {
    const filteredOrders = await getOrderReportRows({
      dateFrom: dateFrom as string | undefined,
      dateTo: dateTo as string | undefined,
      status,
      orderNumber: orderNumber as string | undefined,
      onlyWithHours: onlyWithHours === 'true' || onlyWithHours === '1',
      closureReport,
    });

    const headers = [
      'Numer zlecenia',
      'Numer produktu',
      'Nazwa produktu',
      'Konto księgowe',
      'Ilość',
      'Godziny planowane (estymata)',
      'Godziny rzeczywiste',
      'Odchylenie (plan - rzecz.)',
      'Procent realizacji (%)',
      'Status zlecenia',
      'Rzeczywista data zakończenia',
    ];

    const data = filteredOrders.map((o) => [
      o.orderNumber,
      o.productCode || '-',
      o.productName,
      o.accountingAccount || '-',
      o.quantity !== null ? `${o.quantity} ${o.quantityUnit}` : '-',
      o.plannedHours,
      o.actualHours,
      o.deviation,
      o.percent,
      o.status === 'OPEN' ? 'Otwarte' : o.status === 'SUSPENDED' ? 'Wstrzymane' : 'Zamknięte',
      o.completionDate || '-',
    ]);

    const statusVal = closureReport ? 'Nie dotyczy (raport zamknięcia)' : status === 'OPEN' ? 'Otwarte' : status === 'SUSPENDED' ? 'Wstrzymane' : status === 'CLOSED' ? 'Zamknięte' : 'Wszystkie';
    const orderNumVal = orderNumber && (orderNumber as string).trim() ? (orderNumber as string).trim() : 'Wszystkie';
    const onlyHoursVal = closureReport ? 'Nie dotyczy (raport zamknięcia)' : onlyWithHours === 'true' || onlyWithHours === '1' ? 'Tak' : 'Nie';

    await generateExcelResponse({
      res,
      filename: 'Raport_zlecen.xlsx',
      sheetName: 'Zlecenia',
      headers,
      data,
      metadata: {
        reportTitle: 'Raport godzin według zleceń',
        dateFrom: dateFrom as string | undefined,
        dateTo: dateTo as string | undefined,
        filters: [
          { label: 'Status zlecenia', value: statusVal },
          { label: 'Szukany numer zlecenia', value: orderNumVal },
          { label: 'Tylko z wypracowanymi godzinami', value: onlyHoursVal },
          { label: 'Raport zamknięcia', value: closureReport ? 'Tak' : 'Nie' },
        ],
      },
      numberColumns: [6, 7, 8, 9],
    });
  } catch (error) {
    logger.error(error, 'Błąd eksportu XLSX (by-order)');
    return res.status(500).json({ message: 'Błąd eksportu XLSX' });
  }
});

// Export: Employee Monthly Report
router.get('/export/by-employee', async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo, employeeId } = req.query;

  try {
    const filters = {
      dateFrom: dateFrom as string | undefined,
      dateTo: dateTo as string | undefined,
      employeeId: employeeId as string | undefined,
    };
    const [rows, workTimeTypes] = await Promise.all([
      getEmployeeReportRows(filters),
      getEmployeeReportTypes(),
    ]);

    const headers = [
      'Pracownik',
      'Suma godzin z nadgodzinami',
      'Suma godzin bez nadgodzin',
      ...workTimeTypes.map((type) => `${type.code} (${type.name})`),
    ];

    const data = rows.map((row) => [
      row.employeeName,
      row.suma,
      row.sumaBezNadgodzin,
      ...workTimeTypes.map((type) => Number(row[type.code]) || 0),
    ]);
    const numberColumns = Array.from(
      { length: workTimeTypes.length + 2 },
      (_, index) => index + 2,
    );

    let empNameVal = 'Wszyscy pracownicy';
    if (employeeId) {
      if (rows.length > 0 && rows[0].employeeName) {
        empNameVal = rows[0].employeeName;
      } else {
        const emp = await prisma.employee.findUnique({ where: { id: employeeId as string } });
        if (emp) empNameVal = formatEmployeeName(emp);
        else empNameVal = employeeId as string;
      }
    }

    await generateExcelResponse({
      res,
      filename: 'Raport_miesieczny_pracownicy.xlsx',
      sheetName: 'Czas pracy',
      headers,
      data,
      metadata: {
        reportTitle: 'Miesięczny raport czasu pracy pracowników',
        dateFrom: dateFrom as string | undefined,
        dateTo: dateTo as string | undefined,
        filters: [
          { label: 'Pracownik', value: empNameVal },
        ],
      },
      numberColumns,
    });
  } catch (error) {
    logger.error(error, 'Błąd eksportu XLSX (by-employee)');
    return res.status(500).json({ message: 'Błąd eksportu XLSX' });
  }
});

// Export: Accounting Account Report
router.get('/export/by-account', async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo, accountingAccount } = req.query;

  try {
    const reports = await prisma.workTimeReport.findMany({
      where: {
        deletedAt: null,
        date: {
          gte: dateFrom ? new Date(dateFrom as string) : undefined,
          lte: dateTo ? new Date(dateTo as string) : undefined,
        },
        order: {
          accountingAccount: accountingAccount
            ? { contains: accountingAccount as string, mode: 'insensitive' }
            : undefined,
        },
      },
      include: {
        employee: true,
        order: true,
      },
      orderBy: [{ date: 'asc' }],
    });

    const headers = [
      'Data',
      'Konto księgowe',
      'Pracownik',
      'Zlecenie',
      'Produkt',
      'Liczba godzin',
      'Rodzaj czasu pracy',
    ];

    const data = reports.map((r) => [
      r.date.toISOString().split('T')[0],
      r.order?.accountingAccount || 'Brak',
      r.employee.fullName,
      r.order?.orderNumber || '-',
      r.order?.productName || '-',
      Number(r.hours),
      r.workTimeTypeCode,
    ]);

    const accountVal = accountingAccount && (accountingAccount as string).trim() ? (accountingAccount as string).trim() : 'Wszystkie konta';

    await generateExcelResponse({
      res,
      filename: 'Raport_kont_ksiegowych.xlsx',
      sheetName: 'Konta księgowe',
      headers,
      data,
      metadata: {
        reportTitle: 'Raport kont księgowych',
        dateFrom: dateFrom as string | undefined,
        dateTo: dateTo as string | undefined,
        filters: [
          { label: 'Konto księgowe', value: accountVal },
        ],
      },
      numberColumns: [6],
      dateColumns: [1],
    });
  } catch (error) {
    logger.error(error, 'Błąd eksportu XLSX (by-account)');
    return res.status(500).json({ message: 'Błąd eksportu XLSX' });
  }
});

// Export: Detailed report
router.get('/export/detailed', async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo, employeeId, orderId, orderNumber } = req.query;

  try {
    const reports = await prisma.workTimeReport.findMany({
      where: {
        deletedAt: null,
        employeeId: employeeId ? (employeeId as string) : undefined,
        orderId: orderId ? (orderId as string) : undefined,
        date: {
          gte: dateFrom ? new Date(dateFrom as string) : undefined,
          lte: dateTo ? new Date(dateTo as string) : undefined,
        },
        order: !orderId && orderNumber
          ? { orderNumber: { contains: orderNumber as string, mode: 'insensitive' } }
          : undefined,
      },
      include: {
        employee: true,
        order: true,
        createdByUser: true,
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    const headers = [
      'Data',
      'Pracownik',
      'Numer zlecenia',
      'Numer produktu',
      'Nazwa produktu',
      'Konto księgowe',
      'Liczba godzin',
      'Typ czasu pracy',
      'Wprowadził użytkownik',
      'Data wpisu w bazie',
    ];

    const data = reports.map((r) => [
      r.date.toISOString().split('T')[0],
      r.employee.fullName,
      r.order?.orderNumber || '-',
      r.order?.productCode || '-',
      r.order?.productName || '-',
      r.order?.accountingAccount || '-',
      Number(r.hours),
      r.workTimeTypeCode,
      r.createdByUser.fullName,
      r.createdAt.toISOString().replace('T', ' ').substring(0, 19),
    ]);

    let empNameVal = 'Wszyscy pracownicy';
    if (employeeId) {
      const emp = await prisma.employee.findUnique({ where: { id: employeeId as string } });
      if (emp) empNameVal = emp.fullName;
      else empNameVal = employeeId as string;
    }

    let orderNumVal = 'Wszystkie zlecenia';
    if (orderId) {
      const ord = await prisma.order.findUnique({ where: { id: orderId as string } });
      if (ord) orderNumVal = ord.orderNumber;
      else orderNumVal = orderId as string;
    } else if (orderNumber) {
      orderNumVal = orderNumber as string;
    }

    await generateExcelResponse({
      res,
      filename: 'Raport_szczegolowy_czasu_pracy.xlsx',
      sheetName: 'Szczegóły',
      headers,
      data,
      metadata: {
        reportTitle: 'Szczegółowy raport czasu pracy',
        dateFrom: dateFrom as string | undefined,
        dateTo: dateTo as string | undefined,
        filters: [
          { label: 'Pracownik', value: empNameVal },
          { label: 'Zlecenie', value: orderNumVal },
        ],
      },
      numberColumns: [7],
      dateColumns: [1, 10],
    });
  } catch (error) {
    logger.error(error, 'Błąd eksportu XLSX (detailed)');
    return res.status(500).json({ message: 'Błąd eksportu XLSX' });
  }
});

// Export: Absence Period Report
router.get('/export/absence-periods', async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo, employeeId, workTimeTypeCode } = req.query;

  try {
    const filters: AbsencePeriodFilters = {
      dateFrom: dateFrom as string | undefined,
      dateTo: dateTo as string | undefined,
      employeeId: employeeId as string | undefined,
      workTimeTypeCode: workTimeTypeCode as string | undefined,
    };
    const rows = await getAbsencePeriodRows(filters);

    let employeeValue = 'Wszyscy pracownicy';
    if (employeeId) {
      const employee = await prisma.employee.findUnique({ where: { id: employeeId as string } });
      employeeValue = employee ? formatEmployeeName(employee) : employeeId as string;
    }

    let absenceTypeValue = 'Wszystkie rodzaje nieobecności';
    if (workTimeTypeCode) {
      const type = await prisma.workTimeType.findUnique({
        where: { code: workTimeTypeCode as string },
      });
      absenceTypeValue = type ? `${type.code} (${type.name})` : workTimeTypeCode as string;
    }

    await generateExcelResponse({
      res,
      filename: 'Raport_okresow_nieobecnosci.xlsx',
      sheetName: 'Okresy nieobecności',
      headers: [
        'Imię i nazwisko',
        'Rodzaj nieobecności',
        'Od',
        'Do',
        'Liczba dni nieobecności',
      ],
      data: rows.map((row) => [
        row.employeeName,
        row.absenceType,
        row.dateFrom,
        row.dateTo,
        row.workingDays,
      ]),
      metadata: {
        reportTitle: 'Raport okresów nieobecności',
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        filters: [
          { label: 'Pracownik', value: employeeValue },
          { label: 'Rodzaj nieobecności', value: absenceTypeValue },
        ],
      },
      numberColumns: [5],
      dateColumns: [3, 4],
    });
  } catch (error) {
    logger.error(error, 'Błąd eksportu XLSX raportu okresów nieobecności');
    return res.status(500).json({ message: 'Błąd eksportu XLSX' });
  }
});

export default router;
