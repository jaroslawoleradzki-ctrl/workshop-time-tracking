import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('isAbsence migration', () => {
  const sql = readFileSync(
    resolve(__dirname, '../prisma/migrations/20260806120000_add_is_absence_to_work_time_types/migration.sql'),
    'utf8',
  );

  it('adds a non-null false default and marks only the four standard absence codes', () => {
    expect(sql).toContain('"is_absence" BOOLEAN NOT NULL DEFAULT false');
    expect(sql).toContain("WHERE \"code\" IN ('UW', 'UOK', 'UŻ', 'L4')");
    expect(sql).not.toMatch(/DELETE|DROP|TRUNCATE/i);
  });
});
