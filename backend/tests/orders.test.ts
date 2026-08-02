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

  describe('completionDate status transitions', () => {
    it('sets completionDate when status changes from OPEN to CLOSED', async () => {
      vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(order as any);
      const updateSpy = vi.spyOn(prisma.order, 'update').mockResolvedValue({
        ...order,
        status: 'CLOSED',
        completionDate: new Date(),
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

    it('clears completionDate to null when status changes from CLOSED to OPEN', async () => {
      const closedOrder = {
        ...order,
        status: 'CLOSED',
        completionDate: new Date('2026-07-28T12:00:00.000Z'),
      };
      vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(closedOrder as any);
      const updateSpy = vi.spyOn(prisma.order, 'update').mockResolvedValue({
        ...order,
        status: 'OPEN',
        completionDate: null,
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
          completionDate: null,
        }),
      });
    });

    it('preserves existing completionDate when updating an already CLOSED order', async () => {
      const originalCompletionDate = new Date('2026-07-28T12:00:00.000Z');
      const closedOrder = {
        ...order,
        status: 'CLOSED',
        completionDate: originalCompletionDate,
      };
      vi.spyOn(prisma.order, 'findFirst').mockResolvedValue(closedOrder as any);
      const updateSpy = vi.spyOn(prisma.order, 'update').mockResolvedValue(closedOrder as any);

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
        })
        .expect(200);

      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: ORDER_ID },
        data: expect.objectContaining({
          status: 'CLOSED',
          completionDate: originalCompletionDate,
        }),
      });
    });
  });
});
