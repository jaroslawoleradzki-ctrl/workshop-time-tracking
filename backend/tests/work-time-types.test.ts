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

  it('accepts an independent true/true combination when creating a custom type', async () => {
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue(null);
    const createSpy = vi.spyOn(prisma.workTimeType, 'create').mockImplementation(async ({ data }) => data as any);

    await request(app)
      .post('/api/work-time-types')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'NIEST', name: 'Niestandardowa nieobecność', requiresOrder: true, isAbsence: true })
      .expect(201);

    expect(createSpy).toHaveBeenCalledWith({
      data: expect.objectContaining({ requiresOrder: true, isAbsence: true }),
    });
  });

  it('changes isAbsence without changing requiresOrder', async () => {
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue({
      code: 'SZK', name: 'Szkolenie', requiresOrder: true, isAbsence: false, isSystem: false,
    } as any);
    const updateSpy = vi.spyOn(prisma.workTimeType, 'update').mockResolvedValue({} as any);

    await request(app)
      .put('/api/work-time-types/SZK')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Szkolenie', isAbsence: true })
      .expect(200);

    expect(updateSpy).toHaveBeenCalledWith({
      where: { code: 'SZK' },
      data: { name: 'Szkolenie', requiresOrder: undefined, isAbsence: true },
    });
  });

  it('changes requiresOrder without changing isAbsence', async () => {
    vi.spyOn(prisma.workTimeType, 'findUnique').mockResolvedValue({
      code: 'NIEST', name: 'Niestandardowa', requiresOrder: false, isAbsence: true, isSystem: false,
    } as any);
    const updateSpy = vi.spyOn(prisma.workTimeType, 'update').mockResolvedValue({} as any);

    await request(app)
      .put('/api/work-time-types/NIEST')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Niestandardowa', requiresOrder: true })
      .expect(200);

    expect(updateSpy).toHaveBeenCalledWith({
      where: { code: 'NIEST' },
      data: { name: 'Niestandardowa', requiresOrder: true },
    });
  });

  it('rejects non-boolean flag values', async () => {
    await request(app)
      .post('/api/work-time-types')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'BAD', name: 'Błędny', requiresOrder: false, isAbsence: 'yes' })
      .expect(400);
  });
});
