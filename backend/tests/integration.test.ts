import { afterEach, describe, it, expect, vi } from 'vitest';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../src/app';
import prisma from '../src/utils/prisma';
import logger from '../src/utils/logger';
import { TEST_JWT_SECRET } from './setup-env';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('API Integration Tests', () => {
  // 1. GET /api/health
  describe('GET /api/health', () => {
    it('should return 200 when the database connection is healthy', async () => {
      vi.spyOn(prisma, '$queryRaw').mockResolvedValueOnce([{ result: 1 }]);
      const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);

      const res = await request(app)
        .get('/api/health')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(res.body).toEqual({
        status: 'ok',
        database: 'ok',
        timestamp: expect.any(String),
      });
      expect(Number.isNaN(Date.parse(res.body.timestamp))).toBe(false);
      expect(infoSpy).not.toHaveBeenCalled();
    });

    it('should return 503 when Prisma cannot reach the database', async () => {
      vi.spyOn(prisma, '$queryRaw').mockRejectedValue(new Error('Database unavailable'));
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

      const firstResponse = await request(app)
        .get('/api/health')
        .expect(503)
        .expect('Content-Type', /json/);
      const repeatedResponse = await request(app)
        .get('/api/health')
        .expect(503)
        .expect('Content-Type', /json/);

      expect(firstResponse.body).toEqual({
        status: 'error',
        database: 'error',
        timestamp: expect.any(String),
      });
      expect(repeatedResponse.body).toEqual({
        status: 'error',
        database: 'error',
        timestamp: expect.any(String),
      });
      expect(Number.isNaN(Date.parse(firstResponse.body.timestamp))).toBe(false);
      expect(Number.isNaN(Date.parse(repeatedResponse.body.timestamp))).toBe(false);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  // 2. POST /api/auth/login with invalid credentials
  describe('POST /api/auth/login (Invalid Credentials)', () => {
    it('should return 401 Unauthorized for invalid credentials', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'nonexistent_user_998', password: 'wrongpassword' })
        .expect(401)
        .expect('Content-Type', /json/);

      expect(res.body).toHaveProperty('message');
      expect(typeof res.body.message).toBe('string');
    });
  });

  describe('JWT configuration', () => {
    it('uses the configured secret for login and token verification', async () => {
      const password = 'correct-test-password';
      const user = {
        id: '10000000-0000-4000-8000-000000000001',
        username: 'test-admin',
        passwordHash: await bcrypt.hash(password, 4),
        fullName: 'Test Administrator',
        role: 'admin',
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      vi.spyOn(prisma.user, 'findUnique')
        .mockResolvedValueOnce(user)
        .mockResolvedValueOnce(user);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: user.username, password })
        .expect(200)
        .expect('Content-Type', /json/);

      expect(jwt.verify(loginResponse.body.token, TEST_JWT_SECRET)).toMatchObject({
        id: user.id,
        username: user.username,
        role: user.role,
      });

      const meResponse = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${loginResponse.body.token}`)
        .expect(200)
        .expect('Content-Type', /json/);

      expect(meResponse.body.user).toEqual({
        id: user.id,
        username: user.username,
        role: user.role,
        fullName: user.fullName,
      });
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
