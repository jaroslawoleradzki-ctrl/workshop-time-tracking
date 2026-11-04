import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../src/app';
import prisma from '../src/utils/prisma';
import { TEST_JWT_SECRET } from './setup-env';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const token = jwt.sign(
  { id: USER_ID, username: 'admin', role: 'admin', fullName: 'Administrator' },
  TEST_JWT_SECRET,
);

describe('WorkTimeType isAbsence', () => {
  beforeEach(() => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: USER_ID,
      username: 'admin',
      passwordHash: 'unused',
      fullName: 'Administrator',
      role: 'admin',
      isActive: true,
    } as any);
  });

  afterEach(() => vi.restoreAllMocks());

  it('rejects an independent true/true combination when creating a custom type', async () => {
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue(null);
    const createSpy = vi.spyOn(prisma.workTimeType, 'create').mockImplementation(async ({ data }) => data as any);

    await request(app)
      .post('/api/work-time-types')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'NIEST', name: 'Niestandardowa nieobecność', requiresOrder: true, isAbsence: true })
      .expect(400);

    expect(createSpy).not.toHaveBeenCalled();
  });

  it('rejects changing a legacy type into a contradictory configuration', async () => {
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue({
      code: 'SZK', name: 'Szkolenie', requiresOrder: true, isAbsence: false, isSystem: false,
    } as any);
    const updateSpy = vi.spyOn(prisma.workTimeType, 'update').mockResolvedValue({} as any);

    await request(app)
      .put('/api/work-time-types/SZK')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Szkolenie', isAbsence: true })
      .expect(400);

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('rejects requiring an order for a legacy absence', async () => {
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue({
      code: 'NIEST', name: 'Niestandardowa', requiresOrder: false, isAbsence: true, isSystem: false,
    } as any);
    const updateSpy = vi.spyOn(prisma.workTimeType, 'update').mockResolvedValue({} as any);

    await request(app)
      .put('/api/work-time-types/NIEST')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Niestandardowa', requiresOrder: true })
      .expect(400);

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('rejects non-boolean flag values', async () => {
    await request(app)
      .post('/api/work-time-types')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'BAD', name: 'Błędny', requiresOrder: false, isAbsence: 'yes' })
      .expect(400);
  });
  it.each(['ORDER_WORK', 'ABSENCE', 'OFF_ORDER_WORK'])('creates %s with synchronized flags', async category => {
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue(null);
    const create = vi.spyOn(prisma.workTimeType, 'create').mockImplementation(async ({data}) => data as any);
    const res = await request(app).post('/api/work-time-types').set('Authorization', `Bearer ${token}`)
      .send({ code: 'NEW', name: 'Fikcyjny typ', accountingCategory: category }).expect(201);
    expect(res.body).toMatchObject({ accountingCategory: category, requiresOrder: category === 'ORDER_WORK', isAbsence: category === 'ABSENCE' });
    expect(create).toHaveBeenCalledOnce();
  });
  it('rejects contradictory category flags without writing', async () => {
    const create = vi.spyOn(prisma.workTimeType, 'create');
    await request(app).post('/api/work-time-types').set('Authorization', `Bearer ${token}`)
      .send({ code: 'NEW', name: 'Fikcyjny typ', accountingCategory: 'ABSENCE', requiresOrder: true }).expect(400);
    expect(create).not.toHaveBeenCalled();
  });

});
