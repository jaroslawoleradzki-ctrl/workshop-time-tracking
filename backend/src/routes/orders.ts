import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticateJWT, requireRole } from '../middlewares/auth';
import { logChange } from '../utils/audit';
import { OrderStatus } from '@prisma/client';

const router = Router();

// Auth required for all
router.use(authenticateJWT);

// GET / - list all orders with calculated hours
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const orders = await prisma.order.findMany({
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
      const plannedHours = Number(order.plannedHours);
      const utilizationPercent = plannedHours > 0 ? (actualHours / plannedHours) * 100 : 0;

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        orderDate: order.orderDate,
        plannedShipmentDate: order.plannedShipmentDate,
        productCode: order.productCode,
        productName: order.productName,
        accountingAccount: order.accountingAccount,
        orderedBy: order.orderedBy,
        plannedHours,
        quantity: order.quantity ? Number(order.quantity) : null,
        quantityUnit: order.quantityUnit,
        hoursPerUnit: Number(order.hoursPerUnit),
        actualHours: Math.round(actualHours * 100) / 100,
        utilizationPercent: Math.round(utilizationPercent * 100) / 100,
        status: order.status,
        isActive: order.isActive,
        createdAt: order.createdAt,
        completionDate: order.completionDate,
      };
    });

    return res.json(formatted);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Błąd podczas pobierania zleceń' });
  }
});

// GET /active - list only open and active orders for time reporting (optimized autocomplete dropdown)
router.get('/active', async (req: AuthRequest, res: Response) => {
  try {
    const orders = await prisma.order.findMany({
      where: {
        deletedAt: null,
        status: OrderStatus.OPEN,
        isActive: true,
      },
      select: {
        id: true,
        orderNumber: true,
        productCode: true,
        productName: true,
        accountingAccount: true,
      },
      orderBy: { orderNumber: 'asc' },
    });
    return res.json(orders);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Błąd podczas pobierania aktywnych zleceń' });
  }
});

// Admin-only paths below
router.post('/', requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  const { orderNumber, orderDate, plannedShipmentDate, productCode, productName, accountingAccount, orderedBy, quantity, quantityUnit, hoursPerUnit, status, isActive } = req.body;

  if (!orderNumber || !orderDate || !productName || quantity === undefined || hoursPerUnit === undefined || !status) {
    return res.status(400).json({ message: 'Numer zlecenia, data zlecenia, nazwa produktu, ilość, godziny/szt. oraz status są wymagane.' });
  }

  const parsedOrderDate = new Date(orderDate);
  if (isNaN(parsedOrderDate.getTime())) {
    return res.status(400).json({ message: 'Niepoprawny format daty zlecenia.' });
  }

  let parsedShipmentDate: Date | null = null;
  if (plannedShipmentDate) {
    parsedShipmentDate = new Date(plannedShipmentDate);
    if (isNaN(parsedShipmentDate.getTime())) {
      return res.status(400).json({ message: 'Niepoprawny format daty planowanej wysyłki.' });
    }
  }

  const parsedQuantity = Number(quantity);
  const parsedHoursPerUnit = Number(hoursPerUnit);

  if (isNaN(parsedQuantity) || parsedQuantity <= 0 || isNaN(parsedHoursPerUnit) || parsedHoursPerUnit < 0) {
    return res.status(400).json({ message: 'Ilość musi być liczbą większą od 0, a godziny/szt. musi być liczbą większą lub równą 0.' });
  }

  const calculatedPlannedHours = parsedQuantity * parsedHoursPerUnit;

  try {
    const existing = await prisma.order.findFirst({
      where: { orderNumber, deletedAt: null },
    });

    if (existing) {
      return res.status(400).json({ message: `Zlecenie o numerze ${orderNumber} już istnieje` });
    }

    const orderStatusVal = (status as OrderStatus) || OrderStatus.OPEN;
    const cleanProductCode = productCode && productCode.trim() !== '' ? productCode.trim() : null;
    const cleanAccountingAccount = accountingAccount && accountingAccount.trim() !== '' ? accountingAccount.trim() : null;
    const cleanOrderedBy = orderedBy && orderedBy.trim() !== '' ? orderedBy.trim() : null;

    const order = await prisma.order.create({
      data: {
        orderNumber,
        orderDate: parsedOrderDate,
        plannedShipmentDate: parsedShipmentDate,
        productCode: cleanProductCode,
        productName,
        accountingAccount: cleanAccountingAccount,
        orderedBy: cleanOrderedBy,
        plannedHours: calculatedPlannedHours,
        quantity: parsedQuantity,
        quantityUnit: quantityUnit || 'szt.',
        hoursPerUnit: parsedHoursPerUnit,
        status: orderStatusVal,
        isActive: isActive !== undefined ? isActive : true,
        completionDate: orderStatusVal === OrderStatus.CLOSED ? new Date() : null,
      },
    });

    // Log audit
    if (req.user) {
      await logChange({
        tableName: 'orders',
        recordId: order.id,
        action: 'CREATE',
        newValues: order,
        userId: req.user.id,
      });
    }

    return res.status(201).json(order);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Błąd podczas dodawania zlecenia' });
  }
});

router.put('/:id', requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { orderNumber, orderDate, plannedShipmentDate, productCode, productName, accountingAccount, orderedBy, quantity, quantityUnit, hoursPerUnit, status, isActive } = req.body;

  if (!orderNumber || !orderDate || !productName || quantity === undefined || hoursPerUnit === undefined || !status) {
    return res.status(400).json({ message: 'Wszystkie pola są wymagane.' });
  }

  const parsedOrderDate = new Date(orderDate);
  if (isNaN(parsedOrderDate.getTime())) {
    return res.status(400).json({ message: 'Niepoprawny format daty zlecenia.' });
  }

  let parsedShipmentDate: Date | null = null;
  if (plannedShipmentDate) {
    parsedShipmentDate = new Date(plannedShipmentDate);
    if (isNaN(parsedShipmentDate.getTime())) {
      return res.status(400).json({ message: 'Niepoprawny format daty planowanej wysyłki.' });
    }
  }

  const parsedQuantity = Number(quantity);
  const parsedHoursPerUnit = Number(hoursPerUnit);

  if (isNaN(parsedQuantity) || parsedQuantity <= 0 || isNaN(parsedHoursPerUnit) || parsedHoursPerUnit < 0) {
    return res.status(400).json({ message: 'Ilość musi być liczbą większą od 0, a godziny/szt. musi być liczbą większą lub równą 0.' });
  }

  const calculatedPlannedHours = parsedQuantity * parsedHoursPerUnit;

  try {
    const oldOrder = await prisma.order.findFirst({
      where: { id, deletedAt: null },
    });

    if (!oldOrder) {
      return res.status(404).json({ message: 'Zlecenie nie istnieje' });
    }

    // Check unique order number if it changed
    if (oldOrder.orderNumber !== orderNumber) {
      const duplicate = await prisma.order.findFirst({
        where: { orderNumber, deletedAt: null },
      });
      if (duplicate) {
        return res.status(400).json({ message: `Inne zlecenie ma już numer ${orderNumber}` });
      }
    }

    const orderStatusVal = status as OrderStatus;

    // Set completionDate when changing to CLOSED
    let completionDate = oldOrder.completionDate;
    if (orderStatusVal === OrderStatus.CLOSED && oldOrder.status !== OrderStatus.CLOSED) {
      completionDate = new Date();
    } else if (orderStatusVal !== OrderStatus.CLOSED) {
      completionDate = null;
    }

    const cleanProductCode = productCode && productCode.trim() !== '' ? productCode.trim() : null;
    const cleanAccountingAccount = accountingAccount && accountingAccount.trim() !== '' ? accountingAccount.trim() : null;
    const cleanOrderedBy = orderedBy && orderedBy.trim() !== '' ? orderedBy.trim() : null;

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        orderNumber,
        orderDate: parsedOrderDate,
        plannedShipmentDate: parsedShipmentDate,
        productCode: cleanProductCode,
        productName,
        accountingAccount: cleanAccountingAccount,
        orderedBy: cleanOrderedBy,
        plannedHours: calculatedPlannedHours,
        quantity: parsedQuantity,
        quantityUnit: quantityUnit || 'szt.',
        hoursPerUnit: parsedHoursPerUnit,
        status: orderStatusVal,
        isActive: isActive !== undefined ? isActive : true,
        completionDate,
      },
    });

    // Log audit
    if (req.user) {
      await logChange({
        tableName: 'orders',
        recordId: updatedOrder.id,
        action: 'UPDATE',
        oldValues: oldOrder,
        newValues: updatedOrder,
        userId: req.user.id,
      });
    }

    return res.json(updatedOrder);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Błąd podczas edycji zlecenia' });
  }
});

// Soft Delete order
router.delete('/:id', requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const oldOrder = await prisma.order.findFirst({
      where: { id, deletedAt: null },
    });

    if (!oldOrder) {
      return res.status(404).json({ message: 'Zlecenie nie istnieje' });
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: OrderStatus.CLOSED, // Automatically mark as CLOSED
      },
    });

    // Log audit
    if (req.user) {
      await logChange({
        tableName: 'orders',
        recordId: id,
        action: 'DELETE',
        oldValues: oldOrder,
        newValues: updatedOrder,
        userId: req.user.id,
      });
    }

    return res.json({ message: 'Zlecenie zostało pomyślnie usunięty' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Błąd podczas usuwania zlecenia' });
  }
});

export default router;
