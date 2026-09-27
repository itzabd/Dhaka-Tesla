import request from 'supertest';
import { randomUUID } from 'crypto';
import { app } from '../src/app';
import { pool } from '../src/config/db';
import { runSeed } from '../src/scripts/seed';

let nusratToken: string;
let rafiqToken: string;

beforeAll(async () => {
  await pool.query(
    'TRUNCATE users, vehicles, ride_requests, ride_pools, pool_members, ride_events, idempotency_keys CASCADE'
  );
  await runSeed();

  const n = await request(app)
    .post('/api/auth/login')
    .send({ phone: '+8801711111111', password: 'password123' });
  nusratToken = n.body.token;

  const r = await request(app)
    .post('/api/auth/login')
    .send({ phone: '+8801722222222', password: 'password123' });
  rafiqToken = r.body.token;
});

beforeEach(async () => {
  await pool.query(
    'TRUNCATE ride_requests, ride_pools, pool_members, ride_events, idempotency_keys CASCADE'
  );
});

afterAll(async () => {
  await pool.end();
});

describe('rides', () => {
  it('booking creates a ride with correct fare', async () => {
    const res = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });

    expect(res.status).toBe(201);
    expect(res.body.pricing.perSeatPooledFarePoysha).toBe(7200);
    expect(res.body.pricing.totalPooledFarePoysha).toBe(7200);
    expect(res.body.status).toBe('WAITING');
  });

  it('banani to gulshan_1 gives 4800 poysha', async () => {
    const res = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${rafiqToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ pickupZone: 'BANANI', dropoffZone: 'GULSHAN_1', requestedSeats: 1 });

    expect(res.status).toBe(201);
    expect(res.body.pricing.perSeatPooledFarePoysha).toBe(4800);
  });

  it('invalid pickup zone gives 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ pickupZone: 'NOPE', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('requestedSeats=4 gives 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 4 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('cross-passenger GET returns 403 FORBIDDEN', async () => {
    const booking = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });

    const res = await request(app)
      .get(`/api/rides/${booking.body.id}`)
      .set('Authorization', `Bearer ${rafiqToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('owner GET returns ride with WAITING status and correct pricing', async () => {
    const booking = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });

    const res = await request(app)
      .get(`/api/rides/${booking.body.id}`)
      .set('Authorization', `Bearer ${nusratToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('WAITING');
    expect(res.body.pricing.perSeatPooledFarePoysha).toBe(7200);
    expect(res.body.pricing.totalPooledFarePoysha).toBe(7200);
    expect(res.body.pool).toBeNull();
  });

  it('cross-passenger CANCEL returns 403 FORBIDDEN and ride remains unchanged', async () => {
    const booking = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const rideId = booking.body.id;

    const attack = await request(app)
      .post(`/api/rides/${rideId}/cancel`)
      .set('Authorization', `Bearer ${rafiqToken}`)
      .set('Idempotency-Key', randomUUID());

    expect(attack.status).toBe(403);
    expect(attack.body.error.code).toBe('FORBIDDEN');

    const check = await request(app)
      .get(`/api/rides/${rideId}`)
      .set('Authorization', `Bearer ${nusratToken}`);

    expect(check.status).toBe(200);
    expect(check.body.status).toBe('WAITING');
    expect(check.body.cancelledAt).toBeNull();
  });

  it('cancel WAITING ride, then second cancel with different key returns 409', async () => {
    const booking = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const rideId = booking.body.id;

    const c1 = await request(app)
      .post(`/api/rides/${rideId}/cancel`)
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID());

    expect(c1.status).toBe(200);
    expect(c1.body.status).toBe('CANCELLED');
    expect(c1.body.cancelledAt).toBeTruthy();

    const c2 = await request(app)
      .post(`/api/rides/${rideId}/cancel`)
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID());

    expect(c2.status).toBe(409);
    expect(c2.body.error.code).toBe('ALREADY_CANCELLED');
  });

  it('history returns own rides', async () => {
    await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });

    await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ pickupZone: 'BANANI', dropoffZone: 'GULSHAN_1', requestedSeats: 1 });

    const res = await request(app)
      .get('/api/rides/history')
      .set('Authorization', `Bearer ${nusratToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.pagination.hasMore).toBe(false);
    expect(res.body.pagination.nextCursor).toBeNull();
  });

  it('cross-passenger history isolation', async () => {
    const nusratBooking = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const nusratRideId = nusratBooking.body.id;

    await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${rafiqToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ pickupZone: 'BANANI', dropoffZone: 'GULSHAN_1', requestedSeats: 1 });

    const res = await request(app)
      .get('/api/rides/history')
      .set('Authorization', `Bearer ${rafiqToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].id).not.toBe(nusratRideId);
  });
});
