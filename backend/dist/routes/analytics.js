"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../utils/prisma"));
const auth_1 = require("../middlewares/auth");
const ExcelJS = __importStar(require("exceljs"));
const router = (0, express_1.Router)();
// Auth required
router.use(auth_1.authenticateJWT);
// Helper for ExcelJS exports
async function generateExcelResponse(params) {
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
        column.eachCell({ includeEmpty: true }, (cell) => {
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
router.get('/dashboard', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
        // Otwarte zlecenia
        const openOrdersCount = await prisma_1.default.order.count({
            where: { status: 'open', deletedAt: null },
        });
        // Zamknięte zlecenia
        const closedOrdersCount = await prisma_1.default.order.count({
            where: { status: 'closed', deletedAt: null },
        });
        // Godziny dzisiaj
        const reportsToday = await prisma_1.default.workTimeReport.aggregate({
            where: {
                date: today,
                deletedAt: null,
            },
            _sum: { hours: true },
        });
        const hoursToday = reportsToday._sum.hours ? Number(reportsToday._sum.hours) : 0;
        // Godziny w tym miesiącu
        const reportsMonth = await prisma_1.default.workTimeReport.aggregate({
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
        const orders = await prisma_1.default.order.findMany({
            where: { deletedAt: null },
            include: {
                reports: {
                    where: { deletedAt: null },
                    select: { hours: true },
                },
            },
        });
        const ordersExceeding = [];
        const ordersApproaching = [];
        orders.forEach((o) => {
            const est = Number(o.estimatedHours);
            const actual = o.reports.reduce((sum, r) => sum + Number(r.hours), 0);
            const percent = est > 0 ? (actual / est) * 100 : 0;
            const orderData = {
                id: o.id,
                orderNumber: o.orderNumber,
                productName: o.productName,
                estimatedHours: est,
                actualHours: actual,
                percent: Math.round(percent * 100) / 100,
            };
            if (percent > 100) {
                ordersExceeding.push(orderData);
            }
            else if (percent >= 80 && percent <= 100) {
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
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd podczas generowania statystyk dashboardu' });
    }
});
// 2. Report by Order
router.get('/report-by-order', async (req, res) => {
    const { dateFrom, dateTo, status, orderNumber } = req.query;
    try {
        const orders = await prisma_1.default.order.findMany({
            where: {
                deletedAt: null,
                status: status ? status : undefined,
                orderNumber: orderNumber ? { contains: orderNumber, mode: 'insensitive' } : undefined,
            },
            include: {
                reports: {
                    where: {
                        deletedAt: null,
                        date: {
                            gte: dateFrom ? new Date(dateFrom) : undefined,
                            lte: dateTo ? new Date(dateTo) : undefined,
                        },
                    },
                    select: { hours: true },
                },
            },
            orderBy: { orderNumber: 'asc' },
        });
        const reportData = orders.map((o) => {
            const est = Number(o.estimatedHours);
            const actual = o.reports.reduce((sum, r) => sum + Number(r.hours), 0);
            const deviation = est - actual;
            const percent = est > 0 ? (actual / est) * 100 : 0;
            return {
                orderNumber: o.orderNumber,
                productName: o.productName,
                productNumber: o.productNumber,
                estimatedHours: est,
                actualHours: Math.round(actual * 100) / 100,
                deviation: Math.round(deviation * 100) / 100,
                percent: Math.round(percent * 100) / 100,
                status: o.status,
            };
        });
        return res.json(reportData);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd podczas pobierania raportu wg zleceń' });
    }
});
// 3. Report by Employee (Monthly Pivot)
router.get('/report-by-employee', async (req, res) => {
    const { dateFrom, dateTo, employeeId } = req.query;
    try {
        // Fetch reports
        const reports = await prisma_1.default.workTimeReport.findMany({
            where: {
                deletedAt: null,
                employeeId: employeeId ? employeeId : undefined,
                date: {
                    gte: dateFrom ? new Date(dateFrom) : undefined,
                    lte: dateTo ? new Date(dateTo) : undefined,
                },
            },
            include: {
                employee: true,
            },
        });
        // Pivot in memory
        const pivot = {};
        reports.forEach((r) => {
            const empId = r.employeeId;
            if (!pivot[empId]) {
                pivot[empId] = {
                    employeeId: empId,
                    employeeName: r.employee.fullName,
                    G: 0,
                    NDR: 0,
                    NS: 0,
                    UW: 0,
                    UOK: 0,
                    UŻ: 0,
                    L4: 0,
                    suma: 0,
                };
            }
            const hrs = Number(r.hours);
            const code = r.workTimeTypeCode;
            if (['G', 'NDR', 'NS', 'UW', 'UOK', 'UŻ', 'L4'].includes(code)) {
                pivot[empId][code] += hrs;
            }
            pivot[empId].suma += hrs;
        });
        const result = Object.values(pivot).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
        return res.json(result);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd podczas pobierania raportu wg pracowników' });
    }
});
// 4. Report by Accounting Account
router.get('/report-by-account', async (req, res) => {
    const { dateFrom, dateTo, accountingAccount } = req.query;
    try {
        const reports = await prisma_1.default.workTimeReport.findMany({
            where: {
                deletedAt: null,
                date: {
                    gte: dateFrom ? new Date(dateFrom) : undefined,
                    lte: dateTo ? new Date(dateTo) : undefined,
                },
                order: {
                    accountingAccount: accountingAccount
                        ? { contains: accountingAccount, mode: 'insensitive' }
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
            accountingAccount: r.order?.accountingAccount || 'Brak (urlop/l4)',
            orderNumber: r.order?.orderNumber || '-',
            productName: r.order?.productName || '-',
            hours: Number(r.hours),
            workTimeTypeCode: r.workTimeTypeCode,
        }));
        return res.json(formatted);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd podczas pobierania raportu wg kont' });
    }
});
// 5. Detailed report (Full list)
router.get('/report-detailed', async (req, res) => {
    const { dateFrom, dateTo, employeeId, orderId } = req.query;
    try {
        const reports = await prisma_1.default.workTimeReport.findMany({
            where: {
                deletedAt: null,
                employeeId: employeeId ? employeeId : undefined,
                orderId: orderId ? orderId : undefined,
                date: {
                    gte: dateFrom ? new Date(dateFrom) : undefined,
                    lte: dateTo ? new Date(dateTo) : undefined,
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
            productNumber: r.order?.productNumber || '-',
            productName: r.order?.productName || '-',
            accountingAccount: r.order?.accountingAccount || '-',
            hours: Number(r.hours),
            workTimeTypeCode: r.workTimeTypeCode,
            creatorName: r.createdByUser.fullName,
            createdAt: r.createdAt,
        }));
        return res.json(formatted);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd podczas pobierania szczegółowych wpisów' });
    }
});
// ================= EXPORTS =================
// Export: Order Report
router.get('/export/by-order', async (req, res) => {
    const { dateFrom, dateTo, status, orderNumber } = req.query;
    try {
        const orders = await prisma_1.default.order.findMany({
            where: {
                deletedAt: null,
                status: status ? status : undefined,
                orderNumber: orderNumber ? { contains: orderNumber, mode: 'insensitive' } : undefined,
            },
            include: {
                reports: {
                    where: {
                        deletedAt: null,
                        date: {
                            gte: dateFrom ? new Date(dateFrom) : undefined,
                            lte: dateTo ? new Date(dateTo) : undefined,
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
            const est = Number(o.estimatedHours);
            const actual = o.reports.reduce((sum, r) => sum + Number(r.hours), 0);
            const deviation = est - actual;
            const percent = est > 0 ? (actual / est) * 100 : 0;
            const statusPolish = o.status === 'open' ? 'Otwarte' : o.status === 'suspended' ? 'Wstrzymane' : 'Zamknięte';
            return [
                o.orderNumber,
                o.productNumber,
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
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd eksportu XLSX' });
    }
});
// Export: Employee (Monthly) Report
router.get('/export/by-employee', async (req, res) => {
    const { dateFrom, dateTo, employeeId } = req.query;
    try {
        const reports = await prisma_1.default.workTimeReport.findMany({
            where: {
                deletedAt: null,
                employeeId: employeeId ? employeeId : undefined,
                date: {
                    gte: dateFrom ? new Date(dateFrom) : undefined,
                    lte: dateTo ? new Date(dateTo) : undefined,
                },
            },
            include: {
                employee: true,
            },
        });
        const pivot = {};
        reports.forEach((r) => {
            const empId = r.employeeId;
            if (!pivot[empId]) {
                pivot[empId] = {
                    employeeName: r.employee.fullName,
                    G: 0,
                    NDR: 0,
                    NS: 0,
                    UW: 0,
                    UOK: 0,
                    UŻ: 0,
                    L4: 0,
                    suma: 0,
                };
            }
            const hrs = Number(r.hours);
            const code = r.workTimeTypeCode;
            if (['G', 'NDR', 'NS', 'UW', 'UOK', 'UŻ', 'L4'].includes(code)) {
                pivot[empId][code] += hrs;
            }
            pivot[empId].suma += hrs;
        });
        const sortedRows = Object.values(pivot).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
        const headers = [
            'Pracownik',
            'G (Standard)',
            'NDR (Nadgodziny)',
            'NS (Nadgodziny weekend)',
            'UW (Urlop wypoczynkowy)',
            'UOK (Urlop okoliczn.)',
            'UŻ (Urlop żądanie)',
            'L4 (Chorobowe)',
            'Suma godzin',
        ];
        const data = sortedRows.map((r) => [r.employeeName, r.G, r.NDR, r.NS, r.UW, r.UOK, r.UŻ, r.L4, r.suma]);
        await generateExcelResponse({
            res,
            filename: 'Raport_miesieczny_pracownicy.xlsx',
            sheetName: 'Czas pracy',
            headers,
            data,
            numberColumns: [2, 3, 4, 5, 6, 7, 8, 9],
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd eksportu XLSX' });
    }
});
// Export: Accounting Account Report
router.get('/export/by-account', async (req, res) => {
    const { dateFrom, dateTo, accountingAccount } = req.query;
    try {
        const reports = await prisma_1.default.workTimeReport.findMany({
            where: {
                deletedAt: null,
                date: {
                    gte: dateFrom ? new Date(dateFrom) : undefined,
                    lte: dateTo ? new Date(dateTo) : undefined,
                },
                order: {
                    accountingAccount: accountingAccount
                        ? { contains: accountingAccount, mode: 'insensitive' }
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
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd eksportu XLSX' });
    }
});
// Export: Detailed report
router.get('/export/detailed', async (req, res) => {
    const { dateFrom, dateTo, employeeId, orderId } = req.query;
    try {
        const reports = await prisma_1.default.workTimeReport.findMany({
            where: {
                deletedAt: null,
                employeeId: employeeId ? employeeId : undefined,
                orderId: orderId ? orderId : undefined,
                date: {
                    gte: dateFrom ? new Date(dateFrom) : undefined,
                    lte: dateTo ? new Date(dateTo) : undefined,
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
            r.order?.productNumber || '-',
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
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd eksportu XLSX' });
    }
});
exports.default = router;
