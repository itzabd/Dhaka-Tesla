import request from 'supertest';
import { Router } from 'express';
import { app } from '../src/app';
import { pool } from '../src/config/db';
import { runSeed } from '../src/scripts/seed';
import { authenticate } from '../src/middleware/authenticate';
import { requireRole } from '../src/middleware/requireRole';

const testRouter = Router();
testRouter.get('/protected', authenticate, (req, res) => res.json({ ok: true }));
testRouter.get('/driver-only', authenticate, requireRole('DRIVER'), (req, res) => res.json({ ok: true }));
app.use('/test', testRouter);

beforeAll(async () => {
  await pool.query(
    'TRUNCATE users, vehicles, ride_requests, ride_pools, pool_members, ride_events, idempotency_keys CASCADE'
  );
  await runSeed();
});

afterAll(async () => {
  await pool.end();
});

describe('auth', () => {
  it('registers a new user successfully', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        fullName: 'Test User',
        phone: '+8801999999999',
        password: 'password123',
        role: 'PASSENGER',
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.fullName).toBe('Test User');
    expect(res.body.phone).toBe('+8801999999999');
    expect(res.body.role).toBe('PASSENGER');
    expect(res.body).not.toHaveProperty('token');
  });

  it('rejects registration with duplicate phone', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        fullName: 'Duplicate User',
        phone: '+8801999999999',
        password: 'password123',
        role: 'PASSENGER',
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PHONE_TAKEN');
  });

  it('rejects registration with invalid phone format', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        fullName: 'Bad Phone',
        phone: '123',
        password: 'password123',
        role: 'PASSENGER',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('logs in successfully with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        phone: '+8801711111111',
        password: 'password123',
      });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.fullName).toBe('Nusrat');
  });

  it('rejects login with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        phone: '+8801711111111',
        password: 'wrongpassword',
      });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 200 for health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('guards protected endpoint against missing or invalid token', async () => {
    const resNoToken = await request(app).get('/test/protected');
    expect(resNoToken.status).toBe(401);
    expect(resNoToken.body.error.code).toBe('UNAUTHENTICATED');

    const resInvalidToken = await request(app)
      .get('/test/protected')
      .set('Authorization', 'Bearer invalid');
    expect(resInvalidToken.status).toBe(401);
    expect(resInvalidToken.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('guards role-specific endpoint against wrong role', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        phone: '+8801711111111',
        password: 'password123',
      });
    const token = loginRes.body.token;

    const res = await request(app)
      .get('/test/driver-only')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
