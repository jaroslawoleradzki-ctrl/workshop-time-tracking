import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app';

describe('GET /api/version', () => {
  it('should return 200 OK and match the metadata schema', async () => {
    const res = await request(app)
      .get('/api/version')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).toHaveProperty('name');
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('backendVersion');

    expect(typeof res.body.name).toBe('string');
    expect(typeof res.body.version).toBe('string');
    expect(typeof res.body.backendVersion).toBe('string');

    expect(res.body.name).toBe('workshop-time-tracking');
  });
});
