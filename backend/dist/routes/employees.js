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
// GET / - list employees
router.get('/', async (req, res) => {
    const activeOnly = req.query.activeOnly === 'true';
    try {
        const employees = await prisma_1.default.employee.findMany({
            where: {
                deletedAt: null,
                ...(activeOnly ? { isActive: true } : {}),
            },
            orderBy: { fullName: 'asc' },
        });
        return res.json(employees);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd podczas pobierania pracowników' });
    }
});
// Admin-only paths below
router.post('/', (0, auth_1.requireRole)(['admin']), async (req, res) => {
    const { fullName, isActive } = req.body;
    if (!fullName) {
        return res.status(400).json({ message: 'Imię i nazwisko pracownika jest wymagane' });
    }
    try {
        const employee = await prisma_1.default.employee.create({
            data: {
                fullName,
                isActive: isActive !== undefined ? isActive : true,
            },
        });
        // Log audit
        if (req.user) {
            await (0, audit_1.logChange)({
                tableName: 'employees',
                recordId: employee.id,
                action: 'CREATE',
                newValues: employee,
                userId: req.user.id,
            });
        }
        return res.status(201).json(employee);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd podczas dodawania pracownika' });
    }
});
router.put('/:id', (0, auth_1.requireRole)(['admin']), async (req, res) => {
    const { id } = req.params;
    const { fullName, isActive } = req.body;
    if (!fullName || isActive === undefined) {
        return res.status(400).json({ message: 'Wszystkie pola są wymagane' });
    }
    try {
        const oldEmployee = await prisma_1.default.employee.findUnique({
            where: { id, deletedAt: null },
        });
        if (!oldEmployee) {
            return res.status(404).json({ message: 'Pracownik nie istnieje' });
        }
        const updatedEmployee = await prisma_1.default.employee.update({
            where: { id },
            data: { fullName, isActive },
        });
        // Log audit
        if (req.user) {
            await (0, audit_1.logChange)({
                tableName: 'employees',
                recordId: updatedEmployee.id,
                action: 'UPDATE',
                oldValues: oldEmployee,
                newValues: updatedEmployee,
                userId: req.user.id,
            });
        }
        return res.json(updatedEmployee);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd podczas edycji pracownika' });
    }
});
// Soft Delete employee
router.delete('/:id', (0, auth_1.requireRole)(['admin']), async (req, res) => {
    const { id } = req.params;
    try {
        const oldEmployee = await prisma_1.default.employee.findUnique({
            where: { id, deletedAt: null },
        });
        if (!oldEmployee) {
            return res.status(404).json({ message: 'Pracownik nie istnieje' });
        }
        const updatedEmployee = await prisma_1.default.employee.update({
            where: { id },
            data: {
                deletedAt: new Date(),
                isActive: false, // Automatically deactivate on delete
            },
        });
        // Log audit
        if (req.user) {
            await (0, audit_1.logChange)({
                tableName: 'employees',
                recordId: id,
                action: 'DELETE',
                oldValues: oldEmployee,
                newValues: updatedEmployee,
                userId: req.user.id,
            });
        }
        return res.json({ message: 'Pracownik został pomyślnie usunięty' });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd podczas usuwania pracownika' });
    }
});
exports.default = router;
