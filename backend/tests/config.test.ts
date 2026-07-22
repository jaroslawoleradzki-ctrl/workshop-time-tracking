import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('backend environment configuration', () => {
  it('fails with a clear error when JWT_SECRET is missing', async () => {
    vi.stubEnv('JWT_SECRET', '');
    vi.resetModules();

    await expect(import('../src/config')).rejects.toThrow('JWT_SECRET is required');
  });

  it('uses the explicitly configured JWT_SECRET', async () => {
    const configuredSecret = 'configured-test-secret-4a6c8e0f2b4d6a8c';
    vi.stubEnv('JWT_SECRET', configuredSecret);
    vi.resetModules();

    const { JWT_SECRET } = await import('../src/config');

    expect(JWT_SECRET).toBe(configuredSecret);
  });
});
