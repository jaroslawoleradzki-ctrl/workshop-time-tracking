import { describe, expect, it } from 'vitest';
import { getDatabaseName, validateDatabaseName, validateDemoDatabaseUrl } from '../prisma/seed-demo-utils';

describe('database name validation for demo seeding', () => {
  it('allows time_reporting_demo', () => {
    const dbUrl = 'postgresql://jarek:password@localhost:5432/time_reporting_demo?schema=public';
    expect(validateDemoDatabaseUrl(dbUrl)).toBe('time_reporting_demo');
  });

  it('allows other databases ending with _demo', () => {
    const dbUrl = 'postgresql://localhost:5432/my_cool_app_demo';
    const dbName = getDatabaseName(dbUrl);
    expect(dbName).toBe('my_cool_app_demo');
    expect(validateDatabaseName(dbName)).toBe(true);
  });

  it('rejects demo since it does not end with _demo', () => {
    const dbUrl = 'postgresql://localhost:5432/demo';
    expect(() => validateDemoDatabaseUrl(dbUrl)).toThrow('kończy się "_demo"');
  });

  it('rejects time_reporting since it does not end with _demo', () => {
    const dbUrl = 'postgresql://user:pass@localhost:5432/time_reporting';
    expect(() => validateDemoDatabaseUrl(dbUrl)).toThrow('kończy się "_demo"');
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => validateDemoDatabaseUrl(undefined)).toThrow('Brak wymaganej zmiennej DATABASE_URL');
  });

  it('rejects an empty DATABASE_URL', () => {
    expect(() => validateDemoDatabaseUrl('')).toThrow('Brak wymaganej zmiennej DATABASE_URL');
  });

  it('rejects an invalid DATABASE_URL without echoing its value', () => {
    const invalidUrl = 'not-a-url/secret-password/time_reporting_demo';

    expect(() => validateDemoDatabaseUrl(invalidUrl)).toThrow(
      'DATABASE_URL nie jest poprawnym adresem URL PostgreSQL',
    );

    try {
      validateDemoDatabaseUrl(invalidUrl);
    } catch (error) {
      expect((error as Error).message).not.toContain('secret-password');
    }
  });

  it('rejects a non-PostgreSQL URL', () => {
    expect(() => validateDemoDatabaseUrl('https://localhost/time_reporting_demo')).toThrow(
      'musi używać protokołu postgresql:// lub postgres://',
    );
  });
});
