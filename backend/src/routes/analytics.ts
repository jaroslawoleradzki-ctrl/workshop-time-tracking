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
    },
  });

  const pivot: Record<string, EmployeeReportRow> = {};

  reports.forEach((report) => {
    const employeeId = report.employeeId;
    if (!pivot[employeeId]) {
      pivot[employeeId] = {
        employeeId,
        employeeName: report.employee.fullName,
        suma: 0,
      };
    }

    const hours = Number(report.hours);
    const code = report.workTimeTypeCode;

    pivot[employeeId][code] = (Number(pivot[employeeId][code]) || 0) + hours;
    pivot[employeeId].suma += hours;
  });

  return Object.values(pivot).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
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

// Helper for ExcelJS exports
async function generateExcelResponse(params: {
  res: Response;
  filename: string;
  sheetName: string;
  headers: string[];
  data: any[][];
  numberColumns?: number[]; // indices of columns (1-based) to format as numbers
  dateColumns?: number[]; // indices of columns to format as dates
}) {
  const { res, filename, sheetName, headers, data, numberColumns = [], dateColumns = [] } = params;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  // Add header row
  const headerRow = worksheet.addRow(headers);
  headerRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF34495E' }, // Sleek dark slate blue
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 26;

  // Add borders to header
  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF2C3E50' } },
      left: { style: 'thin', color: { argb: 'FF2C3E50' } },
      bottom: { style: 'medium', color: { argb: 'FF2C3E50' } },
      right: { style: 'thin', color: { argb: 'FF2C3E50' } },
    };
  });

  // Add data rows
  data.forEach((rowData) => {
    const row = worksheet.addRow(rowData);
    row.height = 20;

    // Apply borders and custom alignments/formats
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      };

      // Format as number (e.g. 0.00 for hours)
      if (numberColumns.includes(colNumber) && typeof cell.value === 'number') {
        cell.numFmt = '#,##0.00';
        cell.alignment = { horizontal: 'right' };
      }

      // Format as date
      if (dateColumns.includes(colNumber)) {
        cell.alignment = { horizontal: 'center' };
      }
    });
  });

  // Freeze top row
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  // Enable Autofilter
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };

  // Adjust column widths automatically
  worksheet.columns.forEach((column) => {
    let maxLength = 0;
    column.eachCell!({ includeEmpty: true }, (cell) => {
      const valStr = cell.value ? cell.value.toString() : '';
      if (valStr.length > maxLength) {
        maxLength = valStr.length;
      }
    });
    column.width = Math.max(maxLength + 4, 12);
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

  await workbook.xlsx.write(res);
  res.end();
}

// 1. Dashboard summary numbers
router.get('/dashboard', async (req: AuthRequest, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

    // Otwarte zlecenia
    const openOrdersCount = await prisma.order.count({
      where: { status: 'OPEN', deletedAt: null },
    });

    // Zamknięte zlecenia
    const closedOrdersCount = await prisma.order.count({
      where: { status: 'CLOSED', deletedAt: null },
    });

    // Godziny dzisiaj
    const reportsToday = await prisma.workTimeReport.aggregate({
      where: {
        date: today,
        deletedAt: null,
      },
      _sum: { hours: true },
    });
    const hoursToday = reportsToday._sum.hours ? Number(reportsToday._sum.hours) : 0;

    // Godziny w tym miesiącu
    const reportsMonth = await prisma.workTimeReport.aggregate({
      where: {
        date: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
        deletedAt: null,
      },
      _sum: { hours: true },
    });
    const hoursMonth = reportsMonth._sum.hours ? Number(reportsMonth._sum.hours) : 0;

    // Pobierz zlecenia z policzonym czasem pracy, aby wykryć przekroczenia planu
    const orders = await prisma.order.findMany({
      where: { deletedAt: null },
      include: {
        reports: {
          where: { deletedAt: null },
          select: { hours: true },
        },
      },
    });

    const ordersExceeding: any[] = [];
    const ordersApproaching: any[] = [];

    orders.forEach((o) => {
      const est = Number(o.plannedHours);
      const actual = o.reports.reduce((sum: number, r: any) => sum + Number(r.hours), 0);
      const percent = est > 0 ? (actual / est) * 100 : 0;

      const orderData = {
        id: o.id,
        orderNumber: o.orderNumber,
        productName: o.productName,
        plannedHours: est,
        actualHours: actual,
        percent: Math.round(percent * 100) / 100,
      };

      if (percent > 100) {
        ordersExceeding.push(orderData);
      } else if (percent >= 80 && percent <= 100) {
        ordersApproaching.push(orderData);
      }
    });

    return res.json({
      openOrdersCount,
      closedOrdersCount,
      hoursToday,
      hoursMonth,
      ordersExceeding: ordersExceeding.slice(0, 10), // cap top 10
      ordersApproaching: ordersApproaching.slice(0, 10),
    });
  } catch (error) {
    logger.error(error, 'Błąd podczas generowania statystyk dashboardu');
    return res.status(500).json({ message: 'Błąd podczas generowania statystyk dashboardu' });
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
  const { dateFrom, dateTo, status, orderNumber } = req.query;

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

    const reportData = orders.map((o) => {
      const est = Number(o.plannedHours);
      const actual = o.reports.reduce((sum: number, r: any) => sum + Number(r.hours), 0);
      const deviation = est - actual;
      const percent = est > 0 ? (actual / est) * 100 : 0;

      return {
        orderNumber: o.orderNumber,
        productName: o.productName,
        productCode: o.productCode,
        plannedHours: est,
        actualHours: Math.round(actual * 100) / 100,
        deviation: Math.round(deviation * 100) / 100,
        percent: Math.round(percent * 100) / 100,
        status: o.status,
      };
    });

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

// 5. Detailed report (Full list)
router.get('/report-detailed', async (req: AuthRequest, res: Response) => {
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

    const formatted = reports.map((r) => ({
      id: r.id,
      date: r.date.toISOString().split('T')[0],
      employeeName: r.employee.fullName,
      orderNumber: r.order?.orderNumber || '-',
      productCode: r.order?.productCode || '-',
      productName: r.order?.productName || '-',
      accountingAccount: r.order?.accountingAccount || '-',
      hours: Number(r.hours),
      workTimeTypeCode: r.workTimeTypeCode,
      creatorName: r.createdByUser.fullName,
      createdAt: r.createdAt,
    }));

    return res.json(formatted);
  } catch (error) {
    logger.error(error, 'Błąd podczas pobierania szczegółowych wpisów');
    return res.status(500).json({ message: 'Błąd podczas pobierania szczegółowych wpisów' });
  }
});

// ================= EXPORTS =================

// Export: Order Report
router.get('/export/by-order', async (req: AuthRequest, res: Response) => {
  const { dateFrom, dateTo, status, orderNumber } = req.query;

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

    const headers = [
      'Numer zlecenia',
      'Numer produktu',
      'Nazwa produktu',
      'Konto księgowe',
      'Godziny planowane (estymata)',
      'Godziny rzeczywiste',
      'Odchylenie (plan - rzecz.)',
      'Procent realizacji (%)',
      'Status zlecenia',
    ];

    const data = orders.map((o) => {
      const est = Number(o.plannedHours);
      const actual = o.reports.reduce((sum: number, r: any) => sum + Number(r.hours), 0);
      const deviation = est - actual;
      const percent = est > 0 ? (actual / est) * 100 : 0;
      const statusPolish = o.status === 'OPEN' ? 'Otwarte' : o.status === 'SUSPENDED' ? 'Wstrzymane' : 'Zamknięte';

      return [
        o.orderNumber,
        o.productCode,
        o.productName,
        o.accountingAccount,
        est,
        Math.round(actual * 100) / 100,
        Math.round(deviation * 100) / 100,
        Math.round(percent * 100) / 100,
        statusPolish,
      ];
    });

    await generateExcelResponse({
      res,
      filename: 'Raport_godzin_wg_zlecen.xlsx',
      sheetName: 'Zlecenia',
      headers,
      data,
      numberColumns: [5, 6, 7, 8],
    });
  } catch (error) {
    logger.error(error, 'Błąd eksportu XLSX (by-order)');
    return res.status(500).json({ message: 'Błąd eksportu XLSX' });
  }
});

// Export: Employee (Monthly) Report
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
      ...workTimeTypes.map((type) => `${type.code} (${type.name})`),
      'Suma godzin',
    ];

    const data = rows.map((row) => [
      row.employeeName,
      ...workTimeTypes.map((type) => Number(row[type.code]) || 0),
      row.suma,
    ]);
    const numberColumns = Array.from(
      { length: workTimeTypes.length + 1 },
      (_, index) => index + 2,
    );

    await generateExcelResponse({
      res,
      filename: 'Raport_miesieczny_pracownicy.xlsx',
      sheetName: 'Czas pracy',
      headers,
      data,
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

    await generateExcelResponse({
      res,
      filename: 'Raport_kont_ksiegowych.xlsx',
      sheetName: 'Konta księgowe',
      headers,
      data,
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

    await generateExcelResponse({
      res,
      filename: 'Raport_szczegolowy_czasu_pracy.xlsx',
      sheetName: 'Szczegóły',
      headers,
      data,
      numberColumns: [7],
      dateColumns: [1, 10],
    });
  } catch (error) {
    logger.error(error, 'Błąd eksportu XLSX (detailed)');
    return res.status(500).json({ message: 'Błąd eksportu XLSX' });
  }
});

export default router;
