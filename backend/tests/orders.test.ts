import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../src/app';
import prisma from '../src/utils/prisma';
import { TEST_JWT_SECRET } from './setup-env';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const ORDER_ID = '20000000-0000-4000-8000-000000000001';
const token = jwt.sign(
  {
    id: USER_ID,
    username: 'test-admin',
    role: 'admin',
    fullName: 'Test Administrator',
  },
  TEST_JWT_SECRET,
);

const order = {
  id: ORDER_ID,
  orderNumber: 'ZL-2026-001',
  orderDate: new Date('2026-07-27T00:00:00.000Z'),
  plannedShipmentDate: null,
  productCode: null,
  productName: 'Produkt testowy',
  accountingAccount: null,
  orderedBy: null,
  notes: 'Uzgodnić termin wysyłki',
  plannedHours: 4,
  quantity: 2,
  quantityUnit: 'szt.',
  hoursPerUnit: 2,
  status: 'OPEN',
  isActive: true,
  createdAt: new Date('2026-07-27T00:00:00.000Z'),
  completionDate: null,
  updatedAt: new Date('2026-07-27T00:00:00.000Z'),
  deletedAt: null,
};

const authenticatedRequest = () =>
  request(app).post('/api/orders').set('Authorization', `Bearer ${token}`);

describe('Orders notes', () => {
  beforeEach(() => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: USER_ID,
      username: 'test-admin',
      passwordHash: 'unused',
      fullName: 'Test Administrator',
      role: 'admin',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns notes in the order list', async () => {
    vi.spyOn(prisma.order, 'findMany').mockResolvedValue([
      { ...order, reports: [] },
    ] as any);

    const response = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body[0]).toMatchObject({
      id: ORDER_ID,
      notes: 'Uzgodnić termin wysyłki',
    });
  });

  it('saves trimmed notes while creating an order', async () => {
    vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(null);
    const createSpy = vi.spyOn(prisma.order, 'create').mockResolvedValue(order as any);

    await authenticatedRequest()
      .send({
        orderNumber: order.orderNumber,
        orderDate: '2026-07-27',
        productName: order.productName,
        notes: '  Uzgodnić termin wysyłki  ',
        quantity: 2,
        quantityUnit: 'szt.',
        hoursPerUnit: 2,
        status: 'OPEN',
        isActive: true,
      })
      .expect(201);

    expect(createSpy).toHaveBeenCalledWith({
      data: expect.objectContaining({ notes: 'Uzgodnić termin wysyłki' }),
    });
  });

  it('updates notes and converts an empty value to null', async () => {
    vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(order as any);
    const updateSpy = vi.spyOn(prisma.order, 'update').mockResolvedValue({
      ...order,
      notes: null,
    } as any);

    await request(app)
      .put(`/api/orders/${ORDER_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderNumber: order.orderNumber,
        orderDate: '2026-07-27',
        productName: order.productName,
        notes: '   ',
        quantity: 2,
        quantityUnit: 'szt.',
        hoursPerUnit: 2,
        status: 'OPEN',
        isActive: true,
      })
      .expect(200);

    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: ORDER_ID },
      data: expect.objectContaining({ notes: null }),
    });
  });

  it('rejects a non-text notes value', async () => {
    await authenticatedRequest()
      .send({
        orderNumber: order.orderNumber,
        orderDate: '2026-07-27',
        productName: order.productName,
        notes: 123,
        quantity: 2,
        hoursPerUnit: 2,
        status: 'OPEN',
      })
      .expect(400, { message: 'Uwagi muszą być tekstem.' });
  });

  it('allows leader role to fetch order list but blocks modification endpoints with 403', async () => {
    const leaderToken = jwt.sign(
      {
        id: '10000000-0000-4000-8000-000000000002',
        username: 'test-leader',
        role: 'leader',
        fullName: 'Test Leader',
      },
      TEST_JWT_SECRET,
    );
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: '10000000-0000-4000-8000-000000000002',
      username: 'test-leader',
      passwordHash: 'unused',
      fullName: 'Test Leader',
      role: 'leader',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    vi.spyOn(prisma.order, 'findMany').mockResolvedValue([{ ...order, reports: [] }] as any);

    await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${leaderToken}`)
      .expect(200);

    await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${leaderToken}`)
      .send({ orderNumber: 'ZL-NEW', orderDate: '2026-07-27', productName: 'Produkt', quantity: 1, hoursPerUnit: 1, status: 'OPEN' })
      .expect(403);

    await request(app)
      .put(`/api/orders/${ORDER_ID}`)
      .set('Authorization', `Bearer ${leaderToken}`)
      .send({ orderNumber: 'ZL-NEW', orderDate: '2026-07-27', productName: 'Produkt', quantity: 1, hoursPerUnit: 1, status: 'OPEN' })
      .expect(403);

    await request(app)
      .delete(`/api/orders/${ORDER_ID}`)
      .set('Authorization', `Bearer ${leaderToken}`)
      .expect(403);
  });

  describe('completionDate status transitions and validations (v0.4.6)', () => {
    it('1. Closing order with valid completionDate succeeds', async () => {
      vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(order as any);
      const updateSpy = vi.spyOn(prisma.order, 'update').mockResolvedValue({
        ...order,
        status: 'CLOSED',
        completionDate: new Date('2026-08-05T00:00:00.000Z'),
      } as any);

      await request(app)
        .put(`/api/orders/${ORDER_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          orderNumber: order.orderNumber,
          orderDate: '2026-07-27',
          productName: order.productName,
          quantity: 2,
          quantityUnit: 'szt.',
          hoursPerUnit: 2,
          status: 'CLOSED',
          isActive: true,
          completionDate: '2026-08-05',
        })
        .expect(200);

      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: ORDER_ID },
        data: expect.objectContaining({
          status: 'CLOSED',
          completionDate: expect.any(Date),
        }),
      });
    });

    it('2. Closing without completionDate returns 400 COMPLETION_DATE_REQUIRED', async () => {
      vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(order as any);

      const res = await request(app)
        .put(`/api/orders/${ORDER_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          orderNumber: order.orderNumber,
          orderDate: '2026-07-27',
          productName: order.productName,
          quantity: 2,
          quantityUnit: 'szt.',
          hoursPerUnit: 2,
          status: 'CLOSED',
          isActive: true,
        })
        .expect(400);

      expect(res.body).toEqual({
        message: 'Rzeczywista data zakończenia jest wymagana przy zamykaniu zlecenia.',
        code: 'COMPLETION_DATE_REQUIRED',
      });
    });

    it('3. Closing with completionDate: null returns 400 COMPLETION_DATE_REQUIRED', async () => {
      vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(order as any);

      const res = await request(app)
        .put(`/api/orders/${ORDER_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          orderNumber: order.orderNumber,
          orderDate: '2026-07-27',
          productName: order.productName,
          quantity: 2,
          quantityUnit: 'szt.',
          hoursPerUnit: 2,
          status: 'CLOSED',
          isActive: true,
          completionDate: null,
        })
        .expect(400);

      expect(res.body.code).toBe('COMPLETION_DATE_REQUIRED');
    });

    it('4. Closing with empty string completionDate returns 400 COMPLETION_DATE_REQUIRED', async () => {
      vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(order as any);

      const res = await request(app)
        .put(`/api/orders/${ORDER_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          orderNumber: order.orderNumber,
          orderDate: '2026-07-27',
          productName: order.productName,
          quantity: 2,
          quantityUnit: 'szt.',
          hoursPerUnit: 2,
          status: 'CLOSED',
          isActive: true,
          completionDate: '   ',
        })
        .expect(400);

      expect(res.body.code).toBe('COMPLETION_DATE_REQUIRED');
    });

    it('5. Closing with invalid completionDate string returns 400', async () => {
      vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(order as any);

      const res = await request(app)
        .put(`/api/orders/${ORDER_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          orderNumber: order.orderNumber,
          orderDate: '2026-07-27',
          productName: order.productName,
          quantity: 2,
          quantityUnit: 'szt.',
          hoursPerUnit: 2,
          status: 'CLOSED',
          isActive: true,
          completionDate: 'not-a-valid-date',
        })
        .expect(400);

      expect(res.body.code).toBe('COMPLETION_DATE_REQUIRED');
    });

    it('6. Creating CLOSED order without completionDate is rejected with 400', async () => {
      vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(null);

      const res = await authenticatedRequest()
        .send({
          orderNumber: 'ZL-CLOSED-NEW',
          orderDate: '2026-07-27',
          productName: 'Produkt',
          quantity: 1,
          hoursPerUnit: 1,
          status: 'CLOSED',
          isActive: true,
        })
        .expect(400);

      expect(res.body.code).toBe('COMPLETION_DATE_REQUIRED');
    });

    it('7. Creating OPEN order without completionDate succeeds', async () => {
      vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(null);
      const createSpy = vi.spyOn(prisma.order, 'create').mockResolvedValue(order as any);

      await authenticatedRequest()
        .send({
          orderNumber: 'ZL-OPEN-NEW',
          orderDate: '2026-07-27',
          productName: 'Produkt',
          quantity: 1,
          hoursPerUnit: 1,
          status: 'OPEN',
          isActive: true,
        })
        .expect(201);

      expect(createSpy).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'OPEN',
          completionDate: null,
        }),
      });
    });

    it('8. Creating SUSPENDED order without completionDate succeeds', async () => {
      vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(null);
      const createSpy = vi.spyOn(prisma.order, 'create').mockResolvedValue({
        ...order,
        status: 'SUSPENDED',
      } as any);

      await authenticatedRequest()
        .send({
          orderNumber: 'ZL-SUSP-NEW',
          orderDate: '2026-07-27',
          productName: 'Produkt',
          quantity: 1,
          hoursPerUnit: 1,
          status: 'SUSPENDED',
          isActive: true,
        })
        .expect(201);

      expect(createSpy).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'SUSPENDED',
          completionDate: null,
        }),
      });
    });

    it('9. Reopening closed order preserves completionDate instead of deleting it', async () => {
      const existingCompletionDate = new Date('2026-07-28T00:00:00.000Z');
      const closedOrder = {
        ...order,
        status: 'CLOSED',
        completionDate: existingCompletionDate,
      };
      vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(closedOrder as any);
      const updateSpy = vi.spyOn(prisma.order, 'update').mockResolvedValue({
        ...closedOrder,
        status: 'OPEN',
      } as any);

      await request(app)
        .put(`/api/orders/${ORDER_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          orderNumber: order.orderNumber,
          orderDate: '2026-07-27',
          productName: order.productName,
          quantity: 2,
          quantityUnit: 'szt.',
          hoursPerUnit: 2,
          status: 'OPEN',
          isActive: true,
        })
        .expect(200);

      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: ORDER_ID },
        data: expect.objectContaining({
          status: 'OPEN',
          completionDate: existingCompletionDate,
        }),
      });
    });

    it('10. Updating completionDate of a closed order saves the new value', async () => {
      const originalCompletionDate = new Date('2026-07-28T00:00:00.000Z');
      const closedOrder = {
        ...order,
        status: 'CLOSED',
        completionDate: originalCompletionDate,
      };
      vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(closedOrder as any);
      const updateSpy = vi.spyOn(prisma.order, 'update').mockResolvedValue({
        ...closedOrder,
        completionDate: new Date('2026-08-01T00:00:00.000Z'),
      } as any);

      await request(app)
        .put(`/api/orders/${ORDER_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          orderNumber: order.orderNumber,
          orderDate: '2026-07-27',
          productName: 'Produkt zaktualizowany',
          quantity: 2,
          quantityUnit: 'szt.',
          hoursPerUnit: 2,
          status: 'CLOSED',
          isActive: true,
          completionDate: '2026-08-01',
        })
        .expect(200);

      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: ORDER_ID },
        data: expect.objectContaining({
          status: 'CLOSED',
          completionDate: expect.any(Date),
        }),
      });
    });

    it('11. Date value does not shift by 1 day when saving and retrieving', async () => {
      const targetDateStr = '2026-08-05';
      vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(order as any);
      vi.spyOn(prisma.order, 'update').mockImplementation(async ({ data }: any) => {
        return {
          ...order,
          status: 'CLOSED',
          completionDate: data.completionDate,
        } as any;
      });

      const res = await request(app)
        .put(`/api/orders/${ORDER_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          orderNumber: order.orderNumber,
          orderDate: '2026-07-27',
          productName: order.productName,
          quantity: 2,
          quantityUnit: 'szt.',
          hoursPerUnit: 2,
          status: 'CLOSED',
          isActive: true,
          completionDate: targetDateStr,
        })
        .expect(200);

      const returnedDate = new Date(res.body.completionDate).toISOString().split('T')[0];
      expect(returnedDate).toBe(targetDateStr);
    });

    it('12. Audit log contains status and completionDate changes', async () => {
      const auditLogSpy = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);
      vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(order as any);
      vi.spyOn(prisma.order, 'update').mockResolvedValue({
        ...order,
        status: 'CLOSED',
        completionDate: new Date('2026-08-05T00:00:00.000Z'),
      } as any);

      await request(app)
        .put(`/api/orders/${ORDER_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          orderNumber: order.orderNumber,
          orderDate: '2026-07-27',
          productName: order.productName,
          quantity: 2,
          quantityUnit: 'szt.',
          hoursPerUnit: 2,
          status: 'CLOSED',
          isActive: true,
          completionDate: '2026-08-05',
        })
        .expect(200);

      expect(auditLogSpy).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tableName: 'orders',
          recordId: ORDER_ID,
          action: 'UPDATE',
          oldValues: expect.objectContaining({ status: 'OPEN', completionDate: null }),
          newValues: expect.objectContaining({ status: 'CLOSED' }),
        }),
      });
    });
  });
});
