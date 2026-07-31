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

export const OVERTIME_CODES = ['NDR', 'NS'];

type InternalPivotRow = {
  employeeId: string;
  employeeName: string;
  sortKey: string;
  suma: number;
  sumaBezNadgodzin: number;
  counts: Record<string, number>;
};

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
      const lastName = (emp.lastName || emp.fullName.trim().split(' ').slice(-1)[0] || '').trim();
      const firstName = (emp.firstName || emp.fullName.trim().split(' ').slice(0, -1).join(' ') || '').trim();
      const sortKey = `${lastName} ${firstName}`.trim().toLowerCase();
      const employeeName = emp.firstName && emp.lastName ? `${emp.firstName} ${emp.lastName}` : emp.fullName;

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

export interface ReportFilterItem {
  label: string;
  value: string;
}

export interface ExcelReportMetadata {
  reportTitle: string;
  dateFrom?: string;
  dateTo?: string;
  filters?: ReportFilterItem[];
}

export function formatDateISO(dateStr?: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return dateStr;
}

export function buildDateRangeText(dateFrom?: string, dateTo?: string): string {
  if (dateFrom && dateTo) {
    return `${formatDateISO(dateFrom)}–${formatDateISO(dateTo)}`;
  }
  if (dateFrom) {
    return `od ${formatDateISO(dateFrom)}`;
  }
  if (dateTo) {
    return `do ${formatDateISO(dateTo)}`;
  }
  return 'Wszystkie';
}

export function formatGeneratedAt(d = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${day}.${month}.${year}, ${hours}:${minutes}`;
}

// Helper for ExcelJS exports
async function generateExcelResponse(params: {
  res: Response;
  filename: string;
  sheetName: string;
  headers: string[];
  data: any[][];
  metadata: ExcelReportMetadata;
  numberColumns?: number[]; // indices of columns (1-based) to format as numbers
  dateColumns?: number[]; // indices of columns to format as dates
}) {
  const { res, filename, sheetName, headers, data, metadata, numberColumns = [], dateColumns = [] } = params;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  // 1. Tytuł raportu (Wiersz 1)
  const titleRow = worksheet.addRow([`Raport: ${metadata.reportTitle}`]);
  titleRow.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF1E293B' } };
  titleRow.height = 28;
  titleRow.alignment = { vertical: 'middle', horizontal: 'left' };

  const totalCols = Math.max(headers.length, 2);
  worksheet.mergeCells(1, 1, 1, totalCols);

  // 2. Zakres dat (Wiersz 2)
  const dateRangeVal = metadata.dateFrom || metadata.dateTo
    ? buildDateRangeText(metadata.dateFrom, metadata.dateTo)
    : 'Wszystkie';
  const dateRow = worksheet.addRow([`Zakres dat: ${dateRangeVal}`]);
  dateRow.font = { name: 'Arial', size: 10, color: { argb: 'FF475569' } };

  // 3. Zastosowane filtry (Wiersze 3..N)
  if (metadata.filters && metadata.filters.length > 0) {
    metadata.filters.forEach(filter => {
      const fRow = worksheet.addRow([`${filter.label}: ${filter.value}`]);
      fRow.font = { name: 'Arial', size: 10, color: { argb: 'FF475569' } };
    });
  }

  // 4. Data i godzina wygenerowania (Wiersz N+1)
  const genRow = worksheet.addRow([`Wygenerowano: ${formatGeneratedAt()}`]);
  genRow.font = { name: 'Arial', size: 10, color: { argb: 'FF64748B' } };

  // 5. Pusty wiersz (Wiersz N+2)
  worksheet.addRow([]);

  // 6. Nagłówek tabeli (Wiersz N+3)
  const headerRow = worksheet.addRow(headers);
  const headerRowIndex = headerRow.number;

  headerRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF34495E' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 26;

  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF2C3E50' } },
      left: { style: 'thin', color: { argb: 'FF2C3E50' } },
      bottom: { style: 'medium', color: { argb: 'FF2C3E50' } },
      right: { style: 'thin', color: { argb: 'FF2C3E50' } },
    };
  });

  // 7. Data rows
  data.forEach((rowData) => {
    worksheet.addRow(rowData);
  });

  // AutoFilter & View split (Freeze pane right below table header row)
  const dataEndRowIndex = headerRowIndex + data.length;
  worksheet.autoFilter = {
    from: { row: headerRowIndex, column: 1 },
    to: { row: Math.max(dataEndRowIndex, headerRowIndex), column: headers.length },
  };

  worksheet.views = [{ state: 'frozen', ySplit: headerRowIndex }];

  // Auto-fit column widths
  worksheet.columns.forEach((column) => {
    let maxLen = 10;
    if (column.values) {
      column.values.forEach((val) => {
        if (val) {
          const len = val.toString().length;
          if (len > maxLen) maxLen = len;
        }
      });
    }
    column.width = Math.min(maxLen + 4, 40);
  });

  // Apply number & date formatting
  numberColumns.forEach((colIdx) => {
    worksheet.getColumn(colIdx).numFmt = '#,##0.00';
  });

  dateColumns.forEach((colIdx) => {
    worksheet.getColumn(colIdx).numFmt = 'YYYY-MM-DD';
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  await workbook.xlsx.write(res);
  res.end();
}

// ================= ROUTES =================

// 1. Dashboard Synthetics
router.get('/dashboard', async (_req: AuthRequest, res: Response) => {
  try {
    const activeOrdersCount = await prisma.order.count({
      where: { deletedAt: null, status: 'OPEN', isActive: true },
    });
    const suspendedOrdersCount = await prisma.order.count({
      where: { deletedAt: null, status: 'SUSPENDED', isActive: true },
    });
    const closedOrdersCount = await prisma.order.count({
      where: { deletedAt: null, status: 'CLOSED' },
    });

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

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

    // Recent 5 active orders with their hours
    const recentOrders = await prisma.order.findMany({
      where: { deletedAt: null, status: 'OPEN', isActive: true },
      take: 5,
      orderBy: { updatedAt: 'desc' },
      include: {
        reports: {
          where: { deletedAt: null },
          select: { hours: true },
        },
      },
    });

    const formattedRecentOrders = recentOrders.map((o) => {
      const est = Number(o.plannedHours);
      const actual = o.reports.reduce((sum: number, r: any) => sum + Number(r.hours), 0);
      const percent = est > 0 ? (actual / est) * 100 : 0;

      return {
        id: o.id,
        orderNumber: o.orderNumber,
        productName: o.productName,
        plannedHours: est,
        actualHours: actual,
        percent: Math.round(percent * 100) / 100,
        status: o.status,
      };
    });

    return res.json({
      activeOrdersCount,
      suspendedOrdersCount,
      closedOrdersCount,
      hoursToday: Number(reportsToday._sum.hours || 0),
      hoursMonth: Number(reportsMonth._sum.hours || 0),
      recentOrders: formattedRecentOrders,
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

// 2. Report by Order
router.get('/report-by-order', async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo, status, orderNumber, onlyWithHours } = req.query;

  try {
    const orders = await prisma.order.findMany({
      where: {
        deletedAt: null,
        status: parseOrderStatus(status),
        orderNumber: orderNumber ? { contains: orderNumber as string, mode: 'insensitive' } : undefined,
      },
      include: {
        reports: {
          where: {
            deletedAt: null,
            date: {
              gte: dateFrom ? new Date(dateFrom as string) : undefined,
              lte: dateTo ? new Date(dateTo as string) : undefined,
            },
          },
          select: { hours: true },
        },
      },
      orderBy: { orderNumber: 'asc' },
    });

    let reportData = orders.map((o) => {
      const est = Number(o.plannedHours);
      const actual = o.reports.reduce((sum: number, r: any) => sum + Number(r.hours), 0);
      const deviation = est - actual;
      const percent = est > 0 ? (actual / est) * 100 : 0;

      return {
        orderNumber: o.orderNumber,
        productName: o.productName,
        productCode: o.productCode,
        quantity: o.quantity !== null ? Number(o.quantity) : null,
        quantityUnit: o.quantityUnit || 'szt.',
        plannedHours: est,
        actualHours: Math.round(actual * 100) / 100,
        deviation: Math.round(deviation * 100) / 100,
        percent: Math.round(percent * 100) / 100,
        status: o.status,
      };
    });

    if (onlyWithHours === 'true' || onlyWithHours === '1') {
      reportData = reportData.filter((r) => r.actualHours > 0);
    }

    return res.json(reportData);
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
  const { dateFrom, dateTo, employeeId, orderNumber } = req.query;

  try {
    const reports = await prisma.workTimeReport.findMany({
      where: {
        deletedAt: null,
        employeeId: employeeId ? (employeeId as string) : undefined,
        date: {
          gte: dateFrom ? new Date(dateFrom as string) : undefined,
          lte: dateTo ? new Date(dateTo as string) : undefined,
        },
        order: orderNumber
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

// ================= EXPORTS =================

// Export: Order Report
router.get('/export/by-order', async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo, status, orderNumber, onlyWithHours } = req.query;

  try {
    const orders = await prisma.order.findMany({
      where: {
        deletedAt: null,
        status: parseOrderStatus(status),
        orderNumber: orderNumber ? { contains: orderNumber as string, mode: 'insensitive' } : undefined,
      },
      include: {
        reports: {
          where: {
            deletedAt: null,
            date: {
              gte: dateFrom ? new Date(dateFrom as string) : undefined,
              lte: dateTo ? new Date(dateTo as string) : undefined,
            },
          },
          select: { hours: true },
        },
      },
      orderBy: { orderNumber: 'asc' },
    });

    let filteredOrders = orders.map((o) => {
      const est = Number(o.plannedHours);
      const actual = o.reports.reduce((sum: number, r: any) => sum + Number(r.hours), 0);
      const deviation = est - actual;
      const percent = est > 0 ? (actual / est) * 100 : 0;
      const statusPolish = o.status === 'OPEN' ? 'Otwarte' : o.status === 'SUSPENDED' ? 'Wstrzymane' : 'Zamknięte';
      const quantityDisplay = o.quantity !== null ? `${Number(o.quantity)} ${o.quantityUnit || 'szt.'}` : '-';

      return {
        orderNumber: o.orderNumber,
        productCode: o.productCode || '-',
        productName: o.productName,
        accountingAccount: o.accountingAccount || '-',
        quantityDisplay,
        est,
        actual: Math.round(actual * 100) / 100,
        deviation: Math.round(deviation * 100) / 100,
        percent: Math.round(percent * 100) / 100,
        statusPolish,
      };
    });

    if (onlyWithHours === 'true' || onlyWithHours === '1') {
      filteredOrders = filteredOrders.filter((o) => o.actual > 0);
    }

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
    ];

    const data = filteredOrders.map((o) => [
      o.orderNumber,
      o.productCode,
      o.productName,
      o.accountingAccount,
      o.quantityDisplay,
      o.est,
      o.actual,
      o.deviation,
      o.percent,
      o.statusPolish,
    ]);

    const statusVal = status === 'OPEN' ? 'Otwarte' : status === 'SUSPENDED' ? 'Wstrzymane' : status === 'CLOSED' ? 'Zamknięte' : 'Wszystkie';
    const orderNumVal = orderNumber && (orderNumber as string).trim() ? (orderNumber as string).trim() : 'Wszystkie';
    const onlyHoursVal = onlyWithHours === 'true' || onlyWithHours === '1' ? 'Tak' : 'Nie';

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
        if (emp) empNameVal = emp.fullName;
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
  const { dateFrom, dateTo, employeeId, orderId } = req.query;

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
      },
      include: {
        employee: true,
        order: true,
        createdByUser: true,
      },
      orderBy: { date: 'desc' },
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

export default router;
