import { describe, expect, it } from 'vitest';
import { getDatabaseName, validateDatabaseName } from '../prisma/seed-demo-utils';

describe('database name validation for demo seeding', () => {
  it('allows time_reporting_demo', () => {
    const dbUrl = 'postgresql://jarek:password@localhost:5432/time_reporting_demo?schema=public';
    const dbName = getDatabaseName(dbUrl);
    expect(dbName).toBe('time_reporting_demo');
    expect(validateDatabaseName(dbName)).toBe(true);
  });

  it('allows other databases ending with _demo', () => {
    const dbUrl = 'postgresql://localhost:5432/my_cool_app_demo';
    const dbName = getDatabaseName(dbUrl);
    expect(dbName).toBe('my_cool_app_demo');
    expect(validateDatabaseName(dbName)).toBe(true);
  });

  it('rejects demo since it does not end with _demo', () => {
    const dbUrl = 'postgresql://localhost:5432/demo';
    const dbName = getDatabaseName(dbUrl);
    expect(dbName).toBe('demo');
    expect(validateDatabaseName(dbName)).toBe(false);
  });

  it('rejects time_reporting since it does not end with _demo', () => {
    const dbUrl = 'postgresql://user:pass@localhost:5432/time_reporting';
    const dbName = getDatabaseName(dbUrl);
    expect(dbName).toBe('time_reporting');
    expect(validateDatabaseName(dbName)).toBe(false);
  });

  it('throws on empty or missing DATABASE_URL', () => {
    expect(() => getDatabaseName('')).toThrow('DATABASE_URL is not defined or empty');
    expect(() => getDatabaseName(undefined)).toThrow('DATABASE_URL is not defined or empty');
  });

  it('throws on invalid DATABASE_URL that cannot be parsed', () => {
    expect(() => getDatabaseName('invalid-url-connection-string')).toThrow('Could not parse database name from DATABASE_URL');
  });
});
