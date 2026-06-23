"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../utils/prisma"));
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
// Auth required for all
router.use(auth_1.authenticateJWT);
// GET / - list all types
router.get('/', async (req, res) => {
    try {
        const types = await prisma_1.default.workTimeType.findMany({
            orderBy: { code: 'asc' },
        });
        return res.json(types);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd podczas pobierania słownika typów' });
    }
});
// Admin-only paths below
router.post('/', (0, auth_1.requireRole)(['admin']), async (req, res) => {
    const { code, name, requiresOrder } = req.body;
    if (!code || !name) {
        return res.status(400).json({ message: 'Kod i nazwa są wymagane' });
    }
    // UpperCase code
    const formattedCode = code.trim().toUpperCase();
    try {
        const existing = await prisma_1.default.workTimeType.findUnique({
            where: { code: formattedCode },
        });
        if (existing) {
            return res.status(400).json({ message: `Kod słownika ${formattedCode} już istnieje` });
        }
        const newType = await prisma_1.default.workTimeType.create({
            data: {
                code: formattedCode,
                name: name.trim(),
                requiresOrder: requiresOrder || false,
                isSystem: false, // Custom types are not system types
            },
        });
        return res.status(201).json(newType);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd podczas tworzenia pozycji słownika' });
    }
});
router.put('/:code', (0, auth_1.requireRole)(['admin']), async (req, res) => {
    const { code } = req.params;
    const { name, requiresOrder } = req.body;
    if (!name) {
        return res.status(400).json({ message: 'Nazwa słownika jest wymagana' });
    }
    try {
        const type = await prisma_1.default.workTimeType.findUnique({
            where: { code },
        });
        if (!type) {
            return res.status(404).json({ message: 'Pozycja słownika nie istnieje' });
        }
        // System dictionary lock: system codes cannot change requiresOrder
        const updated = await prisma_1.default.workTimeType.update({
            where: { code },
            data: {
                name: name.trim(),
                // Only allow changing requiresOrder if NOT system type
                ...(!type.isSystem ? { requiresOrder } : {}),
            },
        });
        return res.json(updated);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd podczas edycji pozycji słownika' });
    }
});
router.delete('/:code', (0, auth_1.requireRole)(['admin']), async (req, res) => {
    const { code } = req.params;
    try {
        const type = await prisma_1.default.workTimeType.findUnique({
            where: { code },
        });
        if (!type) {
            return res.status(404).json({ message: 'Pozycja słownika nie istnieje' });
        }
        if (type.isSystem) {
            return res.status(400).json({ message: 'Pozycje słownika systemowego nie mogą być usuwane' });
        }
        // Check if there are reports using this code
        const reportsCount = await prisma_1.default.workTimeReport.count({
            where: { workTimeTypeCode: code, deletedAt: null },
        });
        if (reportsCount > 0) {
            return res.status(400).json({
                message: 'Nie można usunąć pozycji, ponieważ istnieją zaraportowane godziny z tym kodem',
            });
        }
        await prisma_1.default.workTimeType.delete({
            where: { code },
        });
        return res.json({ message: 'Pozycja słownika została usunięta' });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd podczas usuwania pozycji słownika' });
    }
});
exports.default = router;
