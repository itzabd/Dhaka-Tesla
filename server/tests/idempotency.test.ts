import request from 'supertest';
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { app } from '../src/app';
import { pool } from '../src/config/db';
import { runSeed } from '../src/scripts/seed';
import { authenticate } from '../src/middleware/authenticate';
import { requireRole } from '../src/middleware/requireRole';
import { idempotency } from '../src/middleware/idempotency';

const testRouter = Router();
testRouter.post('/echo', authenticate, requireRole('PASSENGER'), idempotency, (req, res) => {
  res.status(201).json({ value: randomUUID(), echo: req.body });
});
app.use('/test-idem', testRouter);

let passengerToken: string;
let passengerUserId: string;
let rafiqToken: string;
let rafiqUserId: string;

beforeAll(async () => {
  await pool.query(
    'TRUNCATE users, vehicles, ride_requests, ride_pools, pool_members, ride_events, idempotency_keys CASCADE'
  );
  await runSeed();

  const nusratLogin = await request(app)
    .post('/api/auth/login')
    .send({ phone: '+8801711111111', password: 'password123' });
  passengerToken = nusratLogin.body.token;
  passengerUserId = nusratLogin.body.user.id;

  const rafiqLogin = await request(app)
    .post('/api/auth/login')
    .send({ phone: '+8801722222222', password: 'password123' });
  rafiqToken = rafiqLogin.body.token;
  rafiqUserId = rafiqLogin.body.user.id;
});

afterAll(async () => {
  await pool.end();
});

describe('idempotency', () => {
  it('returns cached response for same key and user', async () => {
    const r1 = await request(app)
      .post('/test-idem/echo')
      .set('Authorization', `Bearer ${passengerToken}`)
      .set('Idempotency-Key', 'key-1')
      .send({ hello: 'world' });
    expect(r1.status).toBe(201);

    let r2: any = null;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 50));
      r2 = await request(app)
        .post('/test-idem/echo')
        .set('Authorization', `Bearer ${passengerToken}`)
        .set('Idempotency-Key', 'key-1')
        .send({ hello: 'world' });
      if (r2.status === 201) break;
    }
    expect(r2.status).toBe(201);
    expect(r1.body.value).toBe(r2.body.value);

    const rows = await pool.query(
      `SELECT count(*)::int AS n FROM idempotency_keys WHERE key = 'key-1'`
    );
    expect(rows.rows[0].n).toBe(1);
  });

  it('generates distinct responses for different keys by same user', async () => {
    const r1 = await request(app)
      .post('/test-idem/echo')
      .set('Authorization', `Bearer ${passengerToken}`)
      .set('Idempotency-Key', 'key-a')
      .send({});
    const r2 = await request(app)
      .post('/test-idem/echo')
      .set('Authorization', `Bearer ${passengerToken}`)
      .set('Idempotency-Key', 'key-b')
      .send({});
    expect(r1.body.value).not.toBe(r2.body.value);
    const rows = await pool.query(
      `SELECT count(*)::int AS n FROM idempotency_keys WHERE key IN ('key-a','key-b')`
    );
    expect(rows.rows[0].n).toBe(2);
  });

  it('rejects fresh in-progress request with 409', async () => {
    await pool.query(
      `INSERT INTO idempotency_keys (key, user_id, request_path, status, expires_at)
       VALUES ('manual-key', $1, '/test-idem/echo', 'PROCESSING', NOW() + INTERVAL '24 hours')`,
      [passengerUserId]
    );

    const res = await request(app)
      .post('/test-idem/echo')
      .set('Authorization', `Bearer ${passengerToken}`)
      .set('Idempotency-Key', 'manual-key')
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REQUEST_IN_PROGRESS');
  });

  it('evicts stale in-progress request and completes with 201', async () => {
    await pool.query(
      `INSERT INTO idempotency_keys (key, user_id, request_path, status, created_at, expires_at)
       VALUES ('stale-key', $1, '/test-idem/echo', 'PROCESSING',
               NOW() - INTERVAL '6 minutes', NOW() + INTERVAL '24 hours')`,
      [passengerUserId]
    );

    const res = await request(app)
      .post('/test-idem/echo')
      .set('Authorization', `Bearer ${passengerToken}`)
      .set('Idempotency-Key', 'stale-key')
      .send({});
    expect(res.status).toBe(201);
  });

  it('isolates keys across different users', async () => {
    const r1 = await request(app)
      .post('/test-idem/echo')
      .set('Authorization', `Bearer ${passengerToken}`)
      .set('Idempotency-Key', 'shared-key')
      .send({});
    const r2 = await request(app)
      .post('/test-idem/echo')
      .set('Authorization', `Bearer ${rafiqToken}`)
      .set('Idempotency-Key', 'shared-key')
      .send({});
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r1.body.value).not.toBe(r2.body.value);

    const rows = await pool.query(
      `SELECT count(*)::int AS n FROM idempotency_keys WHERE key = 'shared-key'`
    );
    expect(rows.rows[0].n).toBe(2);
  });
});
