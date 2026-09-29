import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { seedDocs } from '../prisma/docs-seed-data';

function recordingClient() {
  const calls: unknown[] = [];
  const record = vi.fn(async (args: unknown) => { calls.push(args); return args; });
  const prisma = { user: { upsert: record }, workTimeType: { upsert: record }, employee: { upsert: record }, order: { upsert: record } } as unknown as PrismaClient;
  return { prisma, calls };
}

describe('documentation seed data', () => {
  it('writes identical fixed fixture values on equivalent runs', async () => {
    const first = recordingClient();
    const second = recordingClient();
    await seedDocs(first.prisma, 'postgresql://localhost/fixture_docs');
    await seedDocs(second.prisma, 'postgresql://localhost/fixture_docs');
    expect(first.calls).toHaveLength(6);
    expect(first.calls).toEqual(second.calls);
    for (const call of first.calls as Array<{ create: Record<string, unknown>; update: Record<string, unknown> }>) {
      expect(call.create.createdAt).toEqual(new Date('2026-07-01T08:00:00.000Z'));
      expect(call.create.updatedAt).toEqual(new Date('2026-07-01T08:00:00.000Z'));
      expect(call.update).toEqual(call.create);
    }
    expect((first.calls[0] as { create: { id: string } }).create.id).toBe('00000000-0000-4000-8000-000000000101');
    expect((first.calls[5] as { create: { id: string } }).create.id).toBe('00000000-0000-4000-8000-000000000201');
  });
  it('rejects a non-docs target before any fixture write', async () => {
    const target = recordingClient();
    await expect(seedDocs(target.prisma, 'postgresql://localhost/fixture_development')).rejects.toThrow('Documentation database');
    expect(target.calls).toEqual([]);
  });
});
