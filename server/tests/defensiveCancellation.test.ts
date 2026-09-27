import request from 'supertest';
import { randomUUID } from 'crypto';
import { app } from '../src/app';
import { pool } from '../src/config/db';
import { runSeed } from '../src/scripts/seed';

jest.setTimeout(30000);

let jashimToken: string;
let jashimVehicleId: string;
let nusratToken: string;

beforeAll(async () => {
  await pool.query('TRUNCATE users, vehicles, ride_requests, ride_pools, pool_members, ride_events, idempotency_keys CASCADE');
  await runSeed();

  const j = await request(app).post('/api/auth/login').send({ phone: '+8801744444444', password: 'password123' });
  jashimToken = j.body.token;

  const v = await pool.query('SELECT id FROM vehicles WHERE driver_id = $1', [j.body.user.id]);
  jashimVehicleId = v.rows[0].id;

  const n = await request(app).post('/api/auth/login').send({ phone: '+8801711111111', password: 'password123' });
  nusratToken = n.body.token;
}, 30000);

beforeEach(async () => {
  await pool.query('TRUNCATE ride_requests, ride_pools, pool_members, ride_events, idempotency_keys CASCADE');
  await pool.query('UPDATE vehicles SET is_online = TRUE WHERE id = $1', [jashimVehicleId]);
});

afterAll(async () => {
  await pool.end();
});

describe('defensive cancellation', () => {
  it('1. Sequential duplicate passenger cancel does not double-decrement occupied_seats', async () => {
    const booking = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 })
      .expect(201);

    const acceptRes = await request(app)
      .post(`/api/driver/requests/${booking.body.id}/accept`)
      .set('Authorization', `Bearer ${jashimToken}`)
      .set('Idempotency-Key', randomUUID())
      .expect(200);
    const poolId = acceptRes.body.poolId;

    let p = await pool.query('SELECT occupied_seats FROM ride_pools WHERE id = $1', [poolId]);
    expect(p.rows[0].occupied_seats).toBe(1);

    await request(app)
      .post(`/api/rides/${booking.body.id}/cancel`)
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID())
      .expect(200);

    p = await pool.query('SELECT occupied_seats FROM ride_pools WHERE id = $1', [poolId]);
    expect(p.rows[0].occupied_seats).toBe(0);

    const second = await request(app)
      .post(`/api/rides/${booking.body.id}/cancel`)
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID());

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ALREADY_CANCELLED');

    p = await pool.query('SELECT occupied_seats FROM ride_pools WHERE id = $1', [poolId]);
    expect(p.rows[0].occupied_seats).toBe(0);
  });

  it('2. Sequential duplicate driver cancel does not produce duplicate audit events', async () => {
    const booking = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 })
      .expect(201);

    const acceptRes = await request(app)
      .post(`/api/driver/requests/${booking.body.id}/accept`)
      .set('Authorization', `Bearer ${jashimToken}`)
      .set('Idempotency-Key', randomUUID())
      .expect(200);
    const poolId = acceptRes.body.poolId;

    const key = randomUUID();
    await request(app)
      .post(`/api/driver/pools/${poolId}/cancel`)
      .set('Authorization', `Bearer ${jashimToken}`)
      .set('Idempotency-Key', key)
      .expect(200);

    const second = await request(app)
      .post(`/api/driver/pools/${poolId}/cancel`)
      .set('Authorization', `Bearer ${jashimToken}`)
      .set('Idempotency-Key', randomUUID());

    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe('INVALID_TRANSITION');

    const events = await pool.query(
      `SELECT count(*)::int AS n FROM ride_events
       WHERE pool_id = $1 AND event_type = 'DRIVER_CANCELLED_POOL'`,
      [poolId]
    );
    expect(events.rows[0].n).toBe(1);
  });

  it('3. Same idempotency key on driver cancel returns cached response (no second event)', async () => {
    const booking = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 })
      .expect(201);

    const acceptRes = await request(app)
      .post(`/api/driver/requests/${booking.body.id}/accept`)
      .set('Authorization', `Bearer ${jashimToken}`)
      .set('Idempotency-Key', randomUUID())
      .expect(200);
    const poolId = acceptRes.body.poolId;

    const key = randomUUID();
    const c1 = await request(app)
      .post(`/api/driver/pools/${poolId}/cancel`)
      .set('Authorization', `Bearer ${jashimToken}`)
      .set('Idempotency-Key', key);
    expect(c1.status).toBe(200);

    let c2: request.Response | null = null;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 50));
      c2 = await request(app)
        .post(`/api/driver/pools/${poolId}/cancel`)
        .set('Authorization', `Bearer ${jashimToken}`)
        .set('Idempotency-Key', key);
      if (c2.status === 200) break;
    }
    expect(c2).not.toBeNull();
    expect(c2!.status).toBe(200);

    const events = await pool.query(
      `SELECT count(*)::int AS n FROM ride_events
       WHERE pool_id = $1 AND event_type = 'DRIVER_CANCELLED_POOL'`,
      [poolId]
    );
    expect(events.rows[0].n).toBe(1);
  });

  it('4. Cancelled passenger cannot re-cancel from CANCELLED state', async () => {
    const booking = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 })
      .expect(201);

    await request(app)
      .post(`/api/rides/${booking.body.id}/cancel`)
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID())
      .expect(200);

    const retry = await request(app)
      .post(`/api/rides/${booking.body.id}/cancel`)
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID());
    expect(retry.status).toBe(409);
    expect(retry.body.error.code).toBe('ALREADY_CANCELLED');
  });
});
