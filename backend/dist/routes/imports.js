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
const audit_1 = require("../utils/audit");
const multer_1 = __importDefault(require("multer"));
const XLSX = __importStar(require("xlsx"));
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
// Auth required
router.use(auth_1.authenticateJWT);
router.use((0, auth_1.requireRole)(['admin']));
// 1. Download Templates
router.get('/template/employees', async (req, res) => {
    try {
        const wb = XLSX.utils.book_new();
        const wsData = [
            ['Imię i nazwisko'],
            ['Nowak Jan'],
            ['Kowalski Piotr'],
            ['Wiśniewski Krzysztof'],
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, 'Pracownicy');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="szablon_pracownicy.xlsx"');
        return res.send(buf);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd generowania szablonu' });
    }
});
router.get('/template/orders', async (req, res) => {
    try {
        const wb = XLSX.utils.book_new();
        const wsData = [
            ['Numer zlecenia', 'Numer produktu', 'Nazwa produktu', 'Konto księgowe', 'Przewidywana liczba godzin'],
            ['ZL-2026-001', 'PR-10022', 'Silnik obrotowy 12V', 'KK-12345', 25.5],
            ['ZL-2026-002', 'PR-10023', 'Wspornik stalowy ocynk', 'KK-12345', 10.0],
            ['ZL-2026-003', 'PR-20044', 'Przewody ciśnieniowe L-1500', 'KK-54321', 8.25],
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, 'Zlecenia');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="szablon_zlecen.xlsx"');
        return res.send(buf);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd generowania szablonu' });
    }
});
// 2. Import history list
router.get('/history', async (req, res) => {
    try {
        const history = await prisma_1.default.importHistory.findMany({
            include: {
                importedBy: {
                    select: { fullName: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        const formatted = history.map((h) => ({
            id: h.id,
            filename: h.filename,
            importType: h.importType,
            importedByName: h.importedBy.fullName,
            status: h.status,
            totalRows: h.totalRows,
            successRows: h.successRows,
            errorRows: h.errorRows,
            errorsLog: h.errorsLog,
            createdAt: h.createdAt,
        }));
        return res.json(formatted);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd pobierania historii importów' });
    }
});
// 3. Import Employees
router.post('/employees', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Brak przesłanego pliku' });
    }
    const filename = req.file.originalname;
    let totalRows = 0;
    let successRows = 0;
    let errorRows = 0;
    const errorsLog = [];
    try {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json(worksheet);
        totalRows = rawData.length;
        if (totalRows === 0) {
            return res.status(400).json({ message: 'Arkusz jest pusty lub niepoprawny' });
        }
        for (let idx = 0; idx < rawData.length; idx++) {
            const rowNum = idx + 2; // Excel row number (1-based index, plus header)
            const row = rawData[idx];
            const fullName = row['Imię i nazwisko'] || row['fullName'] || row['Name'];
            if (!fullName || typeof fullName !== 'string' || fullName.trim() === '') {
                errorRows++;
                errorsLog.push(`Wiersz ${rowNum}: Brak kolumny 'Imię i nazwisko' lub pusta wartość.`);
                continue;
            }
            const cleanName = fullName.trim();
            try {
                // Find if employee already exists (active or soft deleted)
                const existing = await prisma_1.default.employee.findFirst({
                    where: { fullName: cleanName },
                });
                if (existing) {
                    // Update: reactivate and make sure it's active
                    const updated = await prisma_1.default.employee.update({
                        where: { id: existing.id },
                        data: {
                            isActive: true,
                            deletedAt: null, // Clear soft delete
                        },
                    });
                    await (0, audit_1.logChange)({
                        tableName: 'employees',
                        recordId: existing.id,
                        action: 'UPDATE',
                        oldValues: existing,
                        newValues: updated,
                        userId: req.user.id,
                    });
                }
                else {
                    // Create new
                    const created = await prisma_1.default.employee.create({
                        data: {
                            fullName: cleanName,
                            isActive: true,
                        },
                    });
                    await (0, audit_1.logChange)({
                        tableName: 'employees',
                        recordId: created.id,
                        action: 'CREATE',
                        newValues: created,
                        userId: req.user.id,
                    });
                }
                successRows++;
            }
            catch (err) {
                errorRows++;
                errorsLog.push(`Wiersz ${rowNum}: Błąd bazy danych (${err.message || err}).`);
            }
        }
        const status = errorRows === 0 ? 'success' : successRows > 0 ? 'partial' : 'failed';
        const history = await prisma_1.default.importHistory.create({
            data: {
                filename,
                importType: 'employees',
                importedById: req.user.id,
                status,
                totalRows,
                successRows,
                errorRows,
                errorsLog: errorsLog,
            },
        });
        return res.json({
            status,
            totalRows,
            successRows,
            errorRows,
            errorsLog,
            historyId: history.id,
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: `Błąd przetwarzania pliku: ${error.message || error}` });
    }
});
// 4. Import Orders
router.post('/orders', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Brak przesłanego pliku' });
    }
    const filename = req.file.originalname;
    let totalRows = 0;
    let successRows = 0;
    let errorRows = 0;
    const errorsLog = [];
    try {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json(worksheet);
        totalRows = rawData.length;
        if (totalRows === 0) {
            return res.status(400).json({ message: 'Arkusz jest pusty lub niepoprawny' });
        }
        for (let idx = 0; idx < rawData.length; idx++) {
            const rowNum = idx + 2;
            const row = rawData[idx];
            const orderNumber = row['Numer zlecenia'] || row['orderNumber'];
            const productNumber = row['Numer produktu'] || row['productNumber'];
            const productName = row['Nazwa produktu'] || row['productName'];
            const accountingAccount = row['Konto księgowe'] || row['accountingAccount'];
            const estimatedHoursRaw = row['Przewidywana liczba godzin'] || row['estimatedHours'];
            if (!orderNumber || !productNumber || !productName || !accountingAccount || estimatedHoursRaw === undefined) {
                errorRows++;
                errorsLog.push(`Wiersz ${rowNum}: Brakujące pola. Wymagane: 'Numer zlecenia', 'Numer produktu', 'Nazwa produktu', 'Konto księgowe', 'Przewidywana liczba godzin'.`);
                continue;
            }
            const estimatedHours = parseFloat(estimatedHoursRaw);
            if (isNaN(estimatedHours) || estimatedHours < 0) {
                errorRows++;
                errorsLog.push(`Wiersz ${rowNum}: Niepoprawna liczba godzin ('${estimatedHoursRaw}'). Musi być liczbą.`);
                continue;
            }
            const cleanOrderNum = orderNumber.toString().trim();
            const cleanProdNum = productNumber.toString().trim();
            const cleanProdName = productName.toString().trim();
            const cleanAccount = accountingAccount.toString().trim();
            try {
                // Duplicate detection (checks if exists)
                const existing = await prisma_1.default.order.findFirst({
                    where: { orderNumber: cleanOrderNum },
                });
                if (existing) {
                    // Update duplicate
                    const updated = await prisma_1.default.order.update({
                        where: { id: existing.id },
                        data: {
                            productNumber: cleanProdNum,
                            productName: cleanProdName,
                            accountingAccount: cleanAccount,
                            estimatedHours: estimatedHours,
                            status: 'open', // Re-open if closed or suspended on re-import
                            deletedAt: null, // Reactivate
                        },
                    });
                    await (0, audit_1.logChange)({
                        tableName: 'orders',
                        recordId: existing.id,
                        action: 'UPDATE',
                        oldValues: existing,
                        newValues: updated,
                        userId: req.user.id,
                    });
                }
                else {
                    // Create new
                    const created = await prisma_1.default.order.create({
                        data: {
                            orderNumber: cleanOrderNum,
                            productNumber: cleanProdNum,
                            productName: cleanProdName,
                            accountingAccount: cleanAccount,
                            estimatedHours: estimatedHours,
                            status: 'open',
                        },
                    });
                    await (0, audit_1.logChange)({
                        tableName: 'orders',
                        recordId: created.id,
                        action: 'CREATE',
                        newValues: created,
                        userId: req.user.id,
                    });
                }
                successRows++;
            }
            catch (err) {
                errorRows++;
                errorsLog.push(`Wiersz ${rowNum}: Błąd bazy danych (${err.message || err}).`);
            }
        }
        const status = errorRows === 0 ? 'success' : successRows > 0 ? 'partial' : 'failed';
        const history = await prisma_1.default.importHistory.create({
            data: {
                filename,
                importType: 'orders',
                importedById: req.user.id,
                status,
                totalRows,
                successRows,
                errorRows,
                errorsLog: errorsLog,
            },
        });
        return res.json({
            status,
            totalRows,
            successRows,
            errorRows,
            errorsLog,
            historyId: history.id,
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: `Błąd przetwarzania pliku: ${error.message || error}` });
    }
});
exports.default = router;
