import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { AuthRequest, authenticateJWT, requireRole } from '../middlewares/auth';
import { logChange } from '../utils/audit';
import { OrderStatus } from '@prisma/client';
import logger from '../utils/logger';
import { generateExcelResponse } from '../utils/excel-report';

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
        notes: order.notes,
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
    logger.error(error, 'Błąd podczas pobierania zleceń');
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
    logger.error(error, 'Błąd podczas pobierania aktywnych zleceń');
    return res.status(500).json({ message: 'Błąd podczas pobierania aktywnych zleceń' });
  }
});

const exportOrdersSchema = z
  .object({
    searchQuery: z.string().optional().default(''),
    statusFilter: z.enum(['ALL', 'OPEN', 'SUSPENDED', 'CLOSED']).optional().default('ALL'),
    sortField: z.enum(['orderDate', 'plannedShipmentDate']).nullable().optional().default(null),
    sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
  })
  .strict();

// POST /export-xlsx - Export filtered and sorted orders list to Excel XLSX
router.post('/export-xlsx', requireRole(['admin', 'leader']), async (req: AuthRequest, res: Response) => {
  const parseResult = exportOrdersSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      message: 'Nieprawidłowe parametry eksportu zleceń.',
      code: 'INVALID_EXPORT_PARAMS',
      errors: parseResult.error.flatten().fieldErrors,
    });
  }

  const { searchQuery, statusFilter, sortField, sortOrder } = parseResult.data;

  try {
    const orders = await prisma.order.findMany({
      where: { deletedAt: null },
      include: {
        reports: {
          where: { deletedAt: null },
          select: { hours: true },
        },
      },
    });

    const formattedOrders = orders.map((order) => {
      const actualHours = order.reports.reduce((sum, r) => sum + Number(r.hours), 0);
      const plannedHours = Number(order.plannedHours);
      const utilizationPercent = plannedHours > 0 ? (actualHours / plannedHours) * 100 : 0;

      return {
        ...order,
        actualHours: Math.round(actualHours * 100) / 100,
        plannedHours,
        utilizationPercent: Math.round(utilizationPercent * 100) / 100,
      };
    });

    // 1. Filtering
    const searchLower = searchQuery.toLowerCase().trim();
    const filteredOrders = formattedOrders.filter((o) => {
      const matchesSearch =
        !searchLower ||
        (o.orderNumber?.toLowerCase() || '').includes(searchLower) ||
        (o.orderedBy?.toLowerCase() || '').includes(searchLower) ||
        (o.productCode?.toLowerCase() || '').includes(searchLower) ||
        (o.productName?.toLowerCase() || '').includes(searchLower) ||
        (o.accountingAccount?.toLowerCase() || '').includes(searchLower);

      const matchesStatus = statusFilter === 'ALL' || o.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

    // 2. Sorting
    const sortedOrders = [...filteredOrders].sort((a, b) => {
      if (sortField) {
        const valA = a[sortField] ? new Date(a[sortField] as any).getTime() : (sortOrder === 'asc' ? Infinity : -Infinity);
        const valB = b[sortField] ? new Date(b[sortField] as any).getTime() : (sortOrder === 'asc' ? Infinity : -Infinity);

        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        // Tie breaker: stable orderNumber asc
        return a.orderNumber.localeCompare(b.orderNumber, 'pl');
      }

      // Default sort (sortField === null): match GET /api/orders default order (orderNumber desc)
      return b.orderNumber.localeCompare(a.orderNumber, 'pl');
    });

    // 3. Build data rows (16 columns)
    const headers = [
      'Numer zlecenia',
      'Data zlecenia',
      'Planowana data wysyłki',
      'Kod produktu',
      'Nazwa produktu',
      'Zamawiający',
      'Konto księgowe',
      'Ilość',
      'Jednostka',
      'Godziny na jednostkę',
      'Godziny planowane',
      'Godziny rzeczywiste',
      'Wykorzystanie budżetu [%]',
      'Status',
      'Data zamknięcia',
      'Uwagi',
    ];

    const data = sortedOrders.map((o) => {
      const statusPolish =
        o.status === 'OPEN' ? 'Otwarte' : o.status === 'SUSPENDED' ? 'Wstrzymane' : 'Zamknięte';

      const orderNumberDisplay = o.isActive ? o.orderNumber : `${o.orderNumber} (nieaktywne)`;

      return [
        orderNumberDisplay,
        o.orderDate ? new Date(o.orderDate).toISOString().split('T')[0] : '',
        o.plannedShipmentDate ? new Date(o.plannedShipmentDate).toISOString().split('T')[0] : '',
        o.productCode || '',
        o.productName,
        o.orderedBy || '',
        o.accountingAccount || '',
        o.quantity !== null ? Number(o.quantity) : null,
        o.quantityUnit || '',
        o.hoursPerUnit !== null ? Number(o.hoursPerUnit) : null,
        Number(o.plannedHours),
        Number(o.actualHours),
        Number(o.utilizationPercent),
        statusPolish,
        o.completionDate ? new Date(o.completionDate).toISOString().split('T')[0] : '',
        o.notes || '',
      ];
    });

    // 4. Filename & Metadata
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const filename = `baza_zlecen_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.xlsx`;

    const statusFilterVal =
      statusFilter === 'OPEN'
        ? 'Otwarte'
        : statusFilter === 'SUSPENDED'
        ? 'Wstrzymane'
        : statusFilter === 'CLOSED'
        ? 'Zamknięte'
        : 'Wszystkie';

    const searchQueryVal = searchLower ? searchQuery.trim() : 'Brak';

    let sortVal = 'Brak';
    if (sortField === 'orderDate') {
      sortVal = sortOrder === 'asc' ? 'Data zlecenia rosnąco' : 'Data zlecenia malejąco';
    } else if (sortField === 'plannedShipmentDate') {
      sortVal = sortOrder === 'asc' ? 'Planowana wysyłka rosnąco' : 'Planowana wysyłka malejąco';
    }

    await generateExcelResponse({
      res,
      filename,
      sheetName: 'Baza zleceń',
      headers,
      data,
      metadata: {
        reportTitle: 'Baza zleceń',
        filters: [
          { label: 'Zakres danych', value: 'Aktualny widok' },
          { label: 'Filtr statusu', value: statusFilterVal },
          { label: 'Wyszukiwanie', value: searchQueryVal },
          { label: 'Sortowanie', value: sortVal },
          { label: 'Liczba rekordów', value: `${data.length}` },
        ],
      },
      numberColumns: [8, 10, 11, 12, 13],
      dateColumns: [2, 3, 15],
    });
  } catch (error) {
    logger.error(error, 'Błąd podczas eksportowania bazy zleceń do Excela');
    return res.status(500).json({ message: 'Błąd podczas eksportowania bazy zleceń do Excela' });
  }
});

// Admin-only paths below
router.post('/', requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  const { orderNumber, orderDate, plannedShipmentDate, productCode, productName, accountingAccount, orderedBy, notes, quantity, quantityUnit, hoursPerUnit, status, isActive, completionDate } = req.body;

  if (!orderNumber || !orderDate || !productName || quantity === undefined || hoursPerUnit === undefined || !status) {
    return res.status(400).json({ message: 'Numer zlecenia, data zlecenia, nazwa produktu, ilość, godziny/szt. oraz status są wymagane.' });
  }

  if (notes !== undefined && notes !== null && typeof notes !== 'string') {
    return res.status(400).json({ message: 'Uwagi muszą być tekstem.' });
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
  const orderStatusVal = (status as OrderStatus) || OrderStatus.OPEN;

  let parsedCompletionDate: Date | null = null;
  if (completionDate !== undefined && completionDate !== null && completionDate !== '') {
    if (typeof completionDate === 'string' && completionDate.trim() === '') {
      if (orderStatusVal === OrderStatus.CLOSED) {
        return res.status(400).json({
          message: 'Rzeczywista data zakończenia jest wymagana przy zamykaniu zlecenia.',
          code: 'COMPLETION_DATE_REQUIRED',
        });
      }
    } else {
      const d = new Date(completionDate);
      if (isNaN(d.getTime())) {
        return res.status(400).json({
          message: 'Rzeczywista data zakończenia jest wymagana przy zamykaniu zlecenia.',
          code: 'COMPLETION_DATE_REQUIRED',
        });
      }
      parsedCompletionDate = d;
    }
  }

  if (orderStatusVal === OrderStatus.CLOSED && !parsedCompletionDate) {
    return res.status(400).json({
      message: 'Rzeczywista data zakończenia jest wymagana przy zamykaniu zlecenia.',
      code: 'COMPLETION_DATE_REQUIRED',
    });
  }

  try {
    const existing = await prisma.order.findFirst({
      where: { orderNumber, deletedAt: null },
    });

    if (existing) {
      return res.status(400).json({ message: `Zlecenie o numerze ${orderNumber} już istnieje` });
    }

    const cleanProductCode = productCode && productCode.trim() !== '' ? productCode.trim() : null;
    const cleanAccountingAccount = accountingAccount && accountingAccount.trim() !== '' ? accountingAccount.trim() : null;
    const cleanOrderedBy = orderedBy && orderedBy.trim() !== '' ? orderedBy.trim() : null;
    const cleanNotes = notes && notes.trim() !== '' ? notes.trim() : null;

    const order = await prisma.order.create({
      data: {
        orderNumber,
        orderDate: parsedOrderDate,
        plannedShipmentDate: parsedShipmentDate,
        productCode: cleanProductCode,
        productName,
        accountingAccount: cleanAccountingAccount,
        orderedBy: cleanOrderedBy,
        notes: cleanNotes,
        plannedHours: calculatedPlannedHours,
        quantity: parsedQuantity,
        quantityUnit: quantityUnit || 'szt.',
        hoursPerUnit: parsedHoursPerUnit,
        status: orderStatusVal,
        isActive: isActive !== undefined ? isActive : true,
        completionDate: parsedCompletionDate,
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
    logger.error(error, 'Błąd podczas dodawania zlecenia');
    return res.status(500).json({ message: 'Błąd podczas dodawania zlecenia' });
  }
});

router.put('/:id', requireRole(['admin']), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { orderNumber, orderDate, plannedShipmentDate, productCode, productName, accountingAccount, orderedBy, notes, quantity, quantityUnit, hoursPerUnit, status, isActive, completionDate } = req.body;

  if (!orderNumber || !orderDate || !productName || quantity === undefined || hoursPerUnit === undefined || !status) {
    return res.status(400).json({ message: 'Wszystkie pola są wymagane.' });
  }

  if (notes !== undefined && notes !== null && typeof notes !== 'string') {
    return res.status(400).json({ message: 'Uwagi muszą być tekstem.' });
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

    let finalCompletionDate: Date | null = oldOrder.completionDate;

    if (completionDate !== undefined) {
      if (completionDate === null || (typeof completionDate === 'string' && completionDate.trim() === '')) {
        if (orderStatusVal === OrderStatus.CLOSED) {
          return res.status(400).json({
            message: 'Rzeczywista data zakończenia jest wymagana przy zamykaniu zlecenia.',
            code: 'COMPLETION_DATE_REQUIRED',
          });
        }
      } else {
        const d = new Date(completionDate);
        if (isNaN(d.getTime())) {
          return res.status(400).json({
            message: 'Rzeczywista data zakończenia jest wymagana przy zamykaniu zlecenia.',
            code: 'COMPLETION_DATE_REQUIRED',
          });
        }
        finalCompletionDate = d;
      }
    }

    if (orderStatusVal === OrderStatus.CLOSED && !finalCompletionDate) {
      return res.status(400).json({
        message: 'Rzeczywista data zakończenia jest wymagana przy zamykaniu zlecenia.',
        code: 'COMPLETION_DATE_REQUIRED',
      });
    }

    const cleanProductCode = productCode && productCode.trim() !== '' ? productCode.trim() : null;
    const cleanAccountingAccount = accountingAccount && accountingAccount.trim() !== '' ? accountingAccount.trim() : null;
    const cleanOrderedBy = orderedBy && orderedBy.trim() !== '' ? orderedBy.trim() : null;
    const cleanNotes = notes && notes.trim() !== '' ? notes.trim() : null;

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
        notes: cleanNotes,
        plannedHours: calculatedPlannedHours,
        quantity: parsedQuantity,
        quantityUnit: quantityUnit || 'szt.',
        hoursPerUnit: parsedHoursPerUnit,
        status: orderStatusVal,
        isActive: isActive !== undefined ? isActive : true,
        completionDate: finalCompletionDate,
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
    logger.error(error, 'Błąd podczas edycji zlecenia');
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
        completionDate: oldOrder.completionDate || new Date(),
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
    logger.error(error, 'Błąd podczas usuwania zlecenia');
    return res.status(500).json({ message: 'Błąd podczas usuwania zlecenia' });
  }
});

export default router;
