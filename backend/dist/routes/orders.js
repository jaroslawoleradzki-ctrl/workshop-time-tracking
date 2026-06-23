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
// GET / - list all orders with calculated hours
router.get('/', async (req, res) => {
    try {
        const orders = await prisma_1.default.order.findMany({
            where: { deletedAt: null },
            include: {
                reports: {
                    where: { deletedAt: null },
                    select: { hours: true },
                },
            },
            orderBy: { orderNumber: 'desc' },
        });
        const formatted = orders.map((order) => {
            const actualHours = order.reports.reduce((sum, r) => sum + Number(r.hours), 0);
            const estimatedHours = Number(order.estimatedHours);
            const utilizationPercent = estimatedHours > 0 ? (actualHours / estimatedHours) * 100 : 0;
            return {
                id: order.id,
                orderNumber: order.orderNumber,
                productNumber: order.productNumber,
                productName: order.productName,
                accountingAccount: order.accountingAccount,
                estimatedHours,
                actualHours: Math.round(actualHours * 100) / 100,
                utilizationPercent: Math.round(utilizationPercent * 100) / 100,
                status: order.status,
                createdAt: order.createdAt,
                closedAt: order.closedAt,
            };
        });
        return res.json(formatted);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd podczas pobierania zleceń' });
    }
});
// GET /active - list only open orders for time reporting (optimized autocomplete dropdown)
router.get('/active', async (req, res) => {
    try {
        const orders = await prisma_1.default.order.findMany({
            where: {
                deletedAt: null,
                status: 'open',
            },
            select: {
                id: true,
                orderNumber: true,
                productNumber: true,
                productName: true,
                accountingAccount: true,
            },
            orderBy: { orderNumber: 'asc' },
        });
        return res.json(orders);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd podczas pobierania aktywnych zleceń' });
    }
});
// Admin-only paths below
router.post('/', (0, auth_1.requireRole)(['admin']), async (req, res) => {
    const { orderNumber, productNumber, productName, accountingAccount, estimatedHours, status } = req.body;
    if (!orderNumber || !productNumber || !productName || !accountingAccount || estimatedHours === undefined) {
        return res.status(400).json({ message: 'Wszystkie pola formularza są wymagane' });
    }
    try {
        const existing = await prisma_1.default.order.findFirst({
            where: { orderNumber, deletedAt: null },
        });
        if (existing) {
            return res.status(400).json({ message: `Zlecenie o numerze ${orderNumber} już istnieje` });
        }
        const order = await prisma_1.default.order.create({
            data: {
                orderNumber,
                productNumber,
                productName,
                accountingAccount,
                estimatedHours: Number(estimatedHours),
                status: status || 'open',
                closedAt: status === 'closed' ? new Date() : null,
            },
        });
        // Log audit
        if (req.user) {
            await (0, audit_1.logChange)({
                tableName: 'orders',
                recordId: order.id,
                action: 'CREATE',
                newValues: order,
                userId: req.user.id,
            });
        }
        return res.status(201).json(order);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd podczas dodawania zlecenia' });
    }
});
router.put('/:id', (0, auth_1.requireRole)(['admin']), async (req, res) => {
    const { id } = req.params;
    const { orderNumber, productNumber, productName, accountingAccount, estimatedHours, status } = req.body;
    if (!orderNumber || !productNumber || !productName || !accountingAccount || estimatedHours === undefined || !status) {
        return res.status(400).json({ message: 'Wszystkie pola są wymagane' });
    }
    try {
        const oldOrder = await prisma_1.default.order.findFirst({
            where: { id, deletedAt: null },
        });
        if (!oldOrder) {
            return res.status(404).json({ message: 'Zlecenie nie istnieje' });
        }
        // Check unique order number if it changed
        if (oldOrder.orderNumber !== orderNumber) {
            const duplicate = await prisma_1.default.order.findFirst({
                where: { orderNumber, deletedAt: null },
            });
            if (duplicate) {
                return res.status(400).json({ message: `Inne zlecenie ma już numer ${orderNumber}` });
            }
        }
        // Set closedAt when changing to closed
        let closedAt = oldOrder.closedAt;
        if (status === 'closed' && oldOrder.status !== 'closed') {
            closedAt = new Date();
        }
        else if (status !== 'closed') {
            closedAt = null;
        }
        const updatedOrder = await prisma_1.default.order.update({
            where: { id },
            data: {
                orderNumber,
                productNumber,
                productName,
                accountingAccount,
                estimatedHours: Number(estimatedHours),
                status,
                closedAt,
            },
        });
        // Log audit
        if (req.user) {
            await (0, audit_1.logChange)({
                tableName: 'orders',
                recordId: updatedOrder.id,
                action: 'UPDATE',
                oldValues: oldOrder,
                newValues: updatedOrder,
                userId: req.user.id,
            });
        }
        return res.json(updatedOrder);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd podczas edycji zlecenia' });
    }
});
// Soft Delete order
router.delete('/:id', (0, auth_1.requireRole)(['admin']), async (req, res) => {
    const { id } = req.params;
    try {
        const oldOrder = await prisma_1.default.order.findFirst({
            where: { id, deletedAt: null },
        });
        if (!oldOrder) {
            return res.status(404).json({ message: 'Zlecenie nie istnieje' });
        }
        const updatedOrder = await prisma_1.default.order.update({
            where: { id },
            data: {
                deletedAt: new Date(),
                status: 'closed', // Automatically mark as closed
            },
        });
        // Log audit
        if (req.user) {
            await (0, audit_1.logChange)({
                tableName: 'orders',
                recordId: id,
                action: 'DELETE',
                oldValues: oldOrder,
                newValues: updatedOrder,
                userId: req.user.id,
            });
        }
        return res.json({ message: 'Zlecenie zostało pomyślnie usunięty' });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Błąd podczas usuwania zlecenia' });
    }
});
exports.default = router;
