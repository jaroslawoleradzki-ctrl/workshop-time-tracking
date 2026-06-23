"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../utils/prisma"));
const auth_1 = require("../middlewares/auth");
const audit_1 = require("../utils/audit");
const router = (0, express_1.Router)();
// Auth required for all
router.use(auth_1.authenticateJWT);
// GET /by-employee-date - fetch reports for employee on date
router.get('/by-employee-date', async (req, res) => {
    const { employeeId, date } = req.query;
    if (!employeeId || !date) {
        return res.status(400).json({ message: 'employeeId i date są wymagane' });
    }
    try {
        const reports = await prisma_1.default.workTimeReport.findMany({
            where: {
                employeeId: employeeId,
                date: new Date(date),
                deletedAt: null,
            },
            include: {
                order: {
                    select: {
                        orderNumber: true,
                        productNumber: true,
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
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd podczas pobierania wpisów' });
    }
});
// Helper to calculate warnings
async function checkLimits(params) {
    const targetDate = new Date(params.dateStr);
    const existing = await prisma_1.default.workTimeReport.findMany({
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
router.post('/check-warnings', async (req, res) => {
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
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd podczas sprawdzania limitów' });
    }
});
// POST / - create a report
router.post('/', async (req, res) => {
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
        const employee = await prisma_1.default.employee.findUnique({
            where: { id: employeeId, deletedAt: null },
        });
        if (!employee || !employee.isActive) {
            return res.status(400).json({ message: 'Pracownik nie istnieje lub jest nieaktywny' });
        }
        // 2. Validate work time type
        const type = await prisma_1.default.workTimeType.findUnique({
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
            const order = await prisma_1.default.order.findUnique({
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
        const report = await prisma_1.default.workTimeReport.create({
            data: {
                date: new Date(date),
                employeeId,
                orderId: type.requiresOrder ? orderId : null,
                hours: hoursNum,
                workTimeTypeCode,
                createdByUserId: req.user.id,
            },
            include: {
                order: true,
                workTimeType: true,
            },
        });
        // 5. Log audit
        await (0, audit_1.logChange)({
            tableName: 'work_time_reports',
            recordId: report.id,
            action: 'CREATE',
            newValues: report,
            userId: req.user.id,
        });
        return res.status(201).json({
            report: {
                ...report,
                hours: Number(report.hours),
            },
            warnings,
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd podczas dodawania wpisu czasu pracy' });
    }
});
// PUT /:id - update report
router.put('/:id', async (req, res) => {
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
        const oldReport = await prisma_1.default.workTimeReport.findUnique({
            where: { id, deletedAt: null },
        });
        if (!oldReport) {
            return res.status(404).json({ message: 'Wpis nie istnieje' });
        }
        // Validate type and order requirement
        const type = await prisma_1.default.workTimeType.findUnique({
            where: { code: workTimeTypeCode },
        });
        if (!type) {
            return res.status(400).json({ message: 'Kod czasu pracy nie istnieje' });
        }
        if (type.requiresOrder) {
            if (!orderId) {
                return res.status(400).json({ message: `Dla typu '${workTimeTypeCode}' wymagane jest podanie zlecenia` });
            }
            const order = await prisma_1.default.order.findUnique({
                where: { id: orderId, deletedAt: null },
            });
            if (!order) {
                return res.status(400).json({ message: 'Wybrane zlecenie nie istnieje' });
            }
        }
        const updated = await prisma_1.default.workTimeReport.update({
            where: { id },
            data: {
                date: new Date(date),
                employeeId,
                orderId: type.requiresOrder ? orderId : null,
                hours: hoursNum,
                workTimeTypeCode,
                modifiedByUserId: req.user.id,
            },
            include: {
                order: true,
                workTimeType: true,
            },
        });
        // Log audit
        await (0, audit_1.logChange)({
            tableName: 'work_time_reports',
            recordId: id,
            action: 'UPDATE',
            oldValues: oldReport,
            newValues: updated,
            userId: req.user.id,
        });
        return res.json({
            report: {
                ...updated,
                hours: Number(updated.hours),
            },
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd podczas edycji wpisu' });
    }
});
// Soft DELETE report
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const oldReport = await prisma_1.default.workTimeReport.findUnique({
            where: { id, deletedAt: null },
        });
        if (!oldReport) {
            return res.status(404).json({ message: 'Wpis nie istnieje' });
        }
        const updated = await prisma_1.default.workTimeReport.update({
            where: { id },
            data: {
                deletedAt: new Date(),
                modifiedByUserId: req.user.id,
            },
        });
        // Log audit
        await (0, audit_1.logChange)({
            tableName: 'work_time_reports',
            recordId: id,
            action: 'DELETE',
            oldValues: oldReport,
            newValues: updated,
            userId: req.user.id,
        });
        return res.json({ message: 'Wpis został pomyślnie usunięty' });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd podczas usuwania wpisu' });
    }
});
// POST /copy-last-day - copy entries from the last day that has entries
router.post('/copy-last-day', async (req, res) => {
    const { date } = req.body; // Target date (YYYY-MM-DD)
    if (!date) {
        return res.status(400).json({ message: 'Bieżąca data (date) jest wymagana' });
    }
    try {
        const targetDate = new Date(date);
        // 1. Find the last day containing reports before targetDate
        const lastReport = await prisma_1.default.workTimeReport.findFirst({
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
        const reportsToCopy = await prisma_1.default.workTimeReport.findMany({
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
            if (r.employee.deletedAt || !r.employee.isActive)
                return false;
            // Check if order is not deleted (if order is required)
            if (r.orderId && r.order?.deletedAt)
                return false;
            return true;
        });
        // 4. Create new reports for targetDate
        const createdReports = [];
        for (const report of validReports) {
            const newReport = await prisma_1.default.workTimeReport.create({
                data: {
                    date: targetDate,
                    employeeId: report.employeeId,
                    orderId: report.orderId,
                    hours: report.hours,
                    workTimeTypeCode: report.workTimeTypeCode,
                    createdByUserId: req.user.id,
                },
                include: {
                    order: {
                        select: {
                            orderNumber: true,
                            productNumber: true,
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
            await (0, audit_1.logChange)({
                tableName: 'work_time_reports',
                recordId: newReport.id,
                action: 'CREATE',
                newValues: newReport,
                userId: req.user.id,
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
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd podczas kopiowania wpisów' });
    }
});
exports.default = router;
