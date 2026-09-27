import request from 'supertest';
import { randomUUID } from 'crypto';
import { app } from '../src/app';
import { pool } from '../src/config/db';
import { runSeed } from '../src/scripts/seed';

jest.setTimeout(30000);

async function login(phone: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ phone, password: 'password123' });
  return res.body.token;
}

async function bookRide(input: {
  token: string;
  pickupZone: string;
  dropoffZone: string;
  requestedSeats: number;
}): Promise<{ id: string }> {
  const res = await request(app)
    .post('/api/rides')
    .set('Authorization', `Bearer ${input.token}`)
    .set('Idempotency-Key', randomUUID())
    .send({
      pickupZone: input.pickupZone,
      dropoffZone: input.dropoffZone,
      requestedSeats: input.requestedSeats,
    })
    .expect(201);
  return res.body;
}

async function accept(input: {
  driverToken: string;
  rideRequestId: string;
}): Promise<request.Response> {
  return request(app)
    .post(`/api/driver/requests/${input.rideRequestId}/accept`)
    .set('Authorization', `Bearer ${input.driverToken}`)
    .set('Idempotency-Key', randomUUID());
}

async function patchStatus(input: {
  driverToken: string;
  poolId: string;
  status: 'ARRIVED' | 'IN_TRANSIT' | 'COMPLETED' | string;
}): Promise<request.Response> {
  return request(app)
    .patch(`/api/driver/pools/${input.poolId}/status`)
    .set('Authorization', `Bearer ${input.driverToken}`)
    .send({ status: input.status });
}

let jashimToken: string;
let jashimVehicleId: string;
let nusratToken: string;
let rafiqToken: string;
let secondDriverToken: string;
let secondVehicleId: string;

beforeAll(async () => {
  await pool.query('TRUNCATE users, vehicles, ride_requests, ride_pools, pool_members, ride_events, idempotency_keys CASCADE');
  await runSeed();

  jashimToken = await login('+8801744444444');
  const v = await pool.query(
    'SELECT id FROM vehicles WHERE driver_id = (SELECT id FROM users WHERE phone = $1)',
    ['+8801744444444']
  );
  jashimVehicleId = v.rows[0].id;

  nusratToken = await login('+8801711111111');
  rafiqToken  = await login('+8801722222222');

  // Create second driver with own vehicle
  const secondDriver = await pool.query(
    `INSERT INTO users (full_name, phone, password_hash, role)
     VALUES ('Kamal', '+8801988888888',
             (SELECT password_hash FROM users WHERE phone = '+8801744444444'),
             'DRIVER')
     RETURNING id`
  );
  await pool.query(
    `INSERT INTO vehicles (driver_id, name, capacity, is_online)
     VALUES ($1, 'Bullet-2', 3, TRUE)`,
    [secondDriver.rows[0].id]
  );
  secondDriverToken = await login('+8801988888888');
  const v2 = await pool.query('SELECT id FROM vehicles WHERE driver_id = $1', [secondDriver.rows[0].id]);
  secondVehicleId = v2.rows[0].id;
}, 30000);

beforeEach(async () => {
  await pool.query('TRUNCATE ride_requests, ride_pools, pool_members, ride_events, idempotency_keys CASCADE');
  await pool.query('UPDATE vehicles SET is_online = TRUE WHERE id IN ($1, $2)', [jashimVehicleId, secondVehicleId]);
});

afterAll(async () => {
  await pool.end();
});

describe('pool lifecycle', () => {
  it('1. FORMING -> ARRIVED', async () => {
    const b = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const acc = await accept({ driverToken: jashimToken, rideRequestId: b.id });
    const poolId = acc.body.poolId;

    const res = await patchStatus({ driverToken: jashimToken, poolId, status: 'ARRIVED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ARRIVED');
    expect(res.body.driverArrivedAt).not.toBeNull();

    const reqDb = await pool.query('SELECT status FROM ride_requests WHERE id = $1', [b.id]);
    expect(reqDb.rows[0].status).toBe('MATCHED');
  });

  it('2. ARRIVED -> IN_TRANSIT', async () => {
    const b = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const acc = await accept({ driverToken: jashimToken, rideRequestId: b.id });
    const poolId = acc.body.poolId;

    await patchStatus({ driverToken: jashimToken, poolId, status: 'ARRIVED' });
    const res = await patchStatus({ driverToken: jashimToken, poolId, status: 'IN_TRANSIT' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('IN_TRANSIT');
    expect(res.body.startedAt).not.toBeNull();

    const reqDb = await pool.query('SELECT status FROM ride_requests WHERE id = $1', [b.id]);
    expect(reqDb.rows[0].status).toBe('IN_PROGRESS');
  });

  it('3. IN_TRANSIT -> COMPLETED', async () => {
    const b = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const acc = await accept({ driverToken: jashimToken, rideRequestId: b.id });
    const poolId = acc.body.poolId;

    await patchStatus({ driverToken: jashimToken, poolId, status: 'ARRIVED' });
    await patchStatus({ driverToken: jashimToken, poolId, status: 'IN_TRANSIT' });
    const res = await patchStatus({ driverToken: jashimToken, poolId, status: 'COMPLETED' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('COMPLETED');
    expect(res.body.completedAt).not.toBeNull();

    const reqDb = await pool.query('SELECT status, completed_at FROM ride_requests WHERE id = $1', [b.id]);
    expect(reqDb.rows[0].status).toBe('COMPLETED');
    expect(reqDb.rows[0].completed_at).not.toBeNull();
  });

  it('4. Invalid transition: FORMING -> IN_TRANSIT', async () => {
    const b = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const acc = await accept({ driverToken: jashimToken, rideRequestId: b.id });
    const poolId = acc.body.poolId;

    const res = await patchStatus({ driverToken: jashimToken, poolId, status: 'IN_TRANSIT' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('5. Invalid transition from terminal state', async () => {
    const b = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const acc = await accept({ driverToken: jashimToken, rideRequestId: b.id });
    const poolId = acc.body.poolId;

    await patchStatus({ driverToken: jashimToken, poolId, status: 'ARRIVED' });
    await patchStatus({ driverToken: jashimToken, poolId, status: 'IN_TRANSIT' });
    await patchStatus({ driverToken: jashimToken, poolId, status: 'COMPLETED' });

    const res = await patchStatus({ driverToken: jashimToken, poolId, status: 'ARRIVED' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('6. Unknown status -> 400 VALIDATION_ERROR', async () => {
    const b = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const acc = await accept({ driverToken: jashimToken, rideRequestId: b.id });
    const poolId = acc.body.poolId;

    const res = await patchStatus({ driverToken: jashimToken, poolId, status: 'FLYING' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('7. Cross-driver isolation', async () => {
    const b = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const acc = await accept({ driverToken: jashimToken, rideRequestId: b.id });
    const poolId = acc.body.poolId;

    const res = await patchStatus({ driverToken: secondDriverToken, poolId, status: 'ARRIVED' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('POOL_NOT_FOUND');
  });

  it('8. Unauthenticated PATCH -> 401', async () => {
    const res = await request(app)
      .patch(`/api/driver/pools/${randomUUID()}/status`)
      .send({ status: 'ARRIVED' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('9. Passenger PATCH -> 403', async () => {
    const res = await request(app)
      .patch(`/api/driver/pools/${randomUUID()}/status`)
      .set('Authorization', `Bearer ${nusratToken}`)
      .send({ status: 'ARRIVED' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('10. Concurrent duplicate PATCH to same target', async () => {
    const b = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const acc = await accept({ driverToken: jashimToken, rideRequestId: b.id });
    const poolId = acc.body.poolId;

    const [r1, r2] = await Promise.all([
      patchStatus({ driverToken: jashimToken, poolId, status: 'ARRIVED' }),
      patchStatus({ driverToken: jashimToken, poolId, status: 'ARRIVED' }),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 400]);

    const events = await pool.query(
      `SELECT count(*)::int AS count FROM ride_events WHERE pool_id = $1 AND event_type = 'POOL_ARRIVED'`,
      [poolId]
    );
    expect(events.rows[0].count).toBe(1);
  });

  it('11. Audit events recorded per passenger', async () => {
    const b1 = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const b2 = await bookRide({ token: rafiqToken, pickupZone: 'BANANI', dropoffZone: 'GULSHAN_1', requestedSeats: 1 });
    const acc1 = await accept({ driverToken: jashimToken, rideRequestId: b1.id });
    await accept({ driverToken: jashimToken, rideRequestId: b2.id });
    const poolId = acc1.body.poolId;

    await patchStatus({ driverToken: jashimToken, poolId, status: 'ARRIVED' });

    const events = await pool.query(
      `SELECT count(*)::int AS count FROM ride_events WHERE pool_id = $1 AND event_type = 'POOL_ARRIVED'`,
      [poolId]
    );
    expect(events.rows[0].count).toBe(2);
  });

  it('12. Auto-cancel after last passenger cancels from MATCHED', async () => {
    const b1 = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const b2 = await bookRide({ token: rafiqToken, pickupZone: 'BANANI', dropoffZone: 'GULSHAN_1', requestedSeats: 1 });
    const acc1 = await accept({ driverToken: jashimToken, rideRequestId: b1.id });
    await accept({ driverToken: jashimToken, rideRequestId: b2.id });
    const poolId = acc1.body.poolId;

    const c1 = await request(app)
      .post(`/api/rides/${b1.id}/cancel`)
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID());
    expect(c1.status).toBe(200);

    const c2 = await request(app)
      .post(`/api/rides/${b2.id}/cancel`)
      .set('Authorization', `Bearer ${rafiqToken}`)
      .set('Idempotency-Key', randomUUID());
    expect(c2.status).toBe(200);

    const poolDb = await pool.query('SELECT status, occupied_seats FROM ride_pools WHERE id = $1', [poolId]);
    expect(poolDb.rows[0].status).toBe('CANCELLED');
    expect(poolDb.rows[0].occupied_seats).toBe(0);
  });

  it('13. Sequential duplicate driver cancel (same pool)', async () => {
    const b = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const acc = await accept({ driverToken: jashimToken, rideRequestId: b.id });
    const poolId = acc.body.poolId;

    const key1 = randomUUID();
    const r1 = await request(app)
      .post(`/api/driver/pools/${poolId}/cancel`)
      .set('Authorization', `Bearer ${jashimToken}`)
      .set('Idempotency-Key', key1);
    expect(r1.status).toBe(200);

    let r2: request.Response | null = null;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 50));
      r2 = await request(app)
        .post(`/api/driver/pools/${poolId}/cancel`)
        .set('Authorization', `Bearer ${jashimToken}`)
        .set('Idempotency-Key', key1);
      if (r2.status === 200) break;
    }
    expect(r2).not.toBeNull();
    expect(r2!.status).toBe(200);

    const key2 = randomUUID();
    const r3 = await request(app)
      .post(`/api/driver/pools/${poolId}/cancel`)
      .set('Authorization', `Bearer ${jashimToken}`)
      .set('Idempotency-Key', key2);
    expect(r3.status).toBe(400);
    expect(r3.body.error.code).toBe('INVALID_TRANSITION');
  });
});
