import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app';

describe('API Integration Tests', () => {
  // 1. GET /api/health
  describe('GET /api/health', () => {
    it('should return health status metadata', async () => {
      const res = await request(app)
        .get('/api/health')
        .expect('Content-Type', /json/);

      expect([200, 503]).toContain(res.status);
      // The status can be 200 or 503 depending on database availability in the test environment,
      // but the response structure must contain the expected keys.
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('database');
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  // 2. POST /api/auth/login with invalid credentials
  describe('POST /api/auth/login (Invalid Credentials)', () => {
    it('should return 401 Unauthorized for invalid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'nonexistent_user_998', password: 'wrongpassword' })
        .expect(401)
        .expect('Content-Type', /json/);

      expect(res.body).toHaveProperty('message');
      expect(typeof res.body.message).toBe('string');
    });
  });

  // 3. Protected endpoint without token
  describe('GET /api/employees (Protected endpoint without token)', () => {
    it('should return 401 Unauthorized when no token is provided', async () => {
      const res = await request(app)
        .get('/api/employees')
        .expect(401)
        .expect('Content-Type', /json/);

      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toMatch(/token/i);
    });
  });

  // 4. Admin/protected endpoint without token
  describe('GET /api/users (Admin protected endpoint without token)', () => {
    it('should return 401 Unauthorized when no token is provided', async () => {
      const res = await request(app)
        .get('/api/users')
        .expect(401)
        .expect('Content-Type', /json/);

      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toMatch(/token/i);
    });
  });
});
