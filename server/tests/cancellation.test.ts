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
  status: 'ARRIVED' | 'IN_TRANSIT' | 'COMPLETED';
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
}, 30000);

beforeEach(async () => {
  await pool.query('TRUNCATE ride_requests, ride_pools, pool_members, ride_events, idempotency_keys CASCADE');
  await pool.query('UPDATE vehicles SET is_online = TRUE WHERE id = $1', [jashimVehicleId]);
});

afterAll(async () => {
  await pool.end();
});

describe('pool cancellation', () => {
  it('1. Driver cancels FORMING pool', async () => {
    const b = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const acc = await accept({ driverToken: jashimToken, rideRequestId: b.id });
    const poolId = acc.body.poolId;

    const res = await request(app)
      .post(`/api/driver/pools/${poolId}/cancel`)
      .set('Authorization', `Bearer ${jashimToken}`)
      .set('Idempotency-Key', randomUUID());

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.affectedRequests.length).toBe(1);
    expect(res.body.affectedRequests[0].requestId).toBe(b.id);
    expect(res.body.affectedRequests[0].newStatus).toBe('WAITING');

    const poolDb = await pool.query('SELECT status, cancelled_at FROM ride_pools WHERE id = $1', [poolId]);
    expect(poolDb.rows[0].status).toBe('CANCELLED');
    expect(poolDb.rows[0].cancelled_at).not.toBeNull();

    const memDb = await pool.query('SELECT status FROM pool_members WHERE pool_id = $1', [poolId]);
    expect(memDb.rows[0].status).toBe('CANCELLED');

    const reqDb = await pool.query('SELECT status, cancelled_at FROM ride_requests WHERE id = $1', [b.id]);
    expect(reqDb.rows[0].status).toBe('WAITING');
    expect(reqDb.rows[0].cancelled_at).toBeNull();

    const evDb = await pool.query(
      `SELECT event_type, from_status, to_status FROM ride_events WHERE pool_id = $1`,
      [poolId]
    );
    const cancelEv = evDb.rows.find((e) => e.event_type === 'DRIVER_CANCELLED_POOL');
    expect(cancelEv).toBeDefined();
    expect(cancelEv.from_status).toBe('MATCHED');
    expect(cancelEv.to_status).toBe('WAITING');
  });

  it('2. Driver cancels ARRIVED pool', async () => {
    const b = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const acc = await accept({ driverToken: jashimToken, rideRequestId: b.id });
    const poolId = acc.body.poolId;

    await patchStatus({ driverToken: jashimToken, poolId, status: 'ARRIVED' });

    const res = await request(app)
      .post(`/api/driver/pools/${poolId}/cancel`)
      .set('Authorization', `Bearer ${jashimToken}`)
      .set('Idempotency-Key', randomUUID());

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.affectedRequests.length).toBe(1);

    const poolDb = await pool.query('SELECT status, cancelled_at FROM ride_pools WHERE id = $1', [poolId]);
    expect(poolDb.rows[0].status).toBe('CANCELLED');

    const reqDb = await pool.query('SELECT status, cancelled_at FROM ride_requests WHERE id = $1', [b.id]);
    expect(reqDb.rows[0].status).toBe('WAITING');
    expect(reqDb.rows[0].cancelled_at).toBeNull();
  });

  it('3. Driver cannot cancel IN_TRANSIT pool', async () => {
    const b = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const acc = await accept({ driverToken: jashimToken, rideRequestId: b.id });
    const poolId = acc.body.poolId;

    await patchStatus({ driverToken: jashimToken, poolId, status: 'ARRIVED' });
    await patchStatus({ driverToken: jashimToken, poolId, status: 'IN_TRANSIT' });

    const res = await request(app)
      .post(`/api/driver/pools/${poolId}/cancel`)
      .set('Authorization', `Bearer ${jashimToken}`)
      .set('Idempotency-Key', randomUUID());

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('4. Driver cannot cancel COMPLETED pool', async () => {
    const b = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const acc = await accept({ driverToken: jashimToken, rideRequestId: b.id });
    const poolId = acc.body.poolId;

    await patchStatus({ driverToken: jashimToken, poolId, status: 'ARRIVED' });
    await patchStatus({ driverToken: jashimToken, poolId, status: 'IN_TRANSIT' });
    await patchStatus({ driverToken: jashimToken, poolId, status: 'COMPLETED' });

    const res = await request(app)
      .post(`/api/driver/pools/${poolId}/cancel`)
      .set('Authorization', `Bearer ${jashimToken}`)
      .set('Idempotency-Key', randomUUID());

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('5. Passenger cancellation from MATCHED pool FORMING', async () => {
    const b = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const acc = await accept({ driverToken: jashimToken, rideRequestId: b.id });
    const poolId = acc.body.poolId;

    const res = await request(app)
      .post(`/api/rides/${b.id}/cancel`)
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID());

    expect(res.status).toBe(200);

    const poolDb = await pool.query('SELECT status, occupied_seats FROM ride_pools WHERE id = $1', [poolId]);
    expect(poolDb.rows[0].occupied_seats).toBe(0);
    expect(poolDb.rows[0].status).toBe('CANCELLED');

    const reqDb = await pool.query('SELECT status FROM ride_requests WHERE id = $1', [b.id]);
    expect(reqDb.rows[0].status).toBe('CANCELLED');

    const evDb = await pool.query(
      `SELECT event_type FROM ride_events WHERE ride_request_id = $1`,
      [b.id]
    );
    expect(evDb.rows.some((e) => e.event_type === 'PASSENGER_CANCELLED')).toBe(true);
  });

  it('6. Passenger cannot cancel from MATCHED pool ARRIVED', async () => {
    const b = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const acc = await accept({ driverToken: jashimToken, rideRequestId: b.id });
    const poolId = acc.body.poolId;

    await patchStatus({ driverToken: jashimToken, poolId, status: 'ARRIVED' });

    const res = await request(app)
      .post(`/api/rides/${b.id}/cancel`)
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID());

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('7. Passenger cannot cancel from IN_TRANSIT', async () => {
    const b = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const acc = await accept({ driverToken: jashimToken, rideRequestId: b.id });
    const poolId = acc.body.poolId;

    await patchStatus({ driverToken: jashimToken, poolId, status: 'ARRIVED' });
    await patchStatus({ driverToken: jashimToken, poolId, status: 'IN_TRANSIT' });

    const res = await request(app)
      .post(`/api/rides/${b.id}/cancel`)
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID());

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('8. Two-passenger pool, one cancels', async () => {
    const b1 = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const b2 = await bookRide({ token: rafiqToken, pickupZone: 'BANANI', dropoffZone: 'GULSHAN_1', requestedSeats: 1 });
    const acc1 = await accept({ driverToken: jashimToken, rideRequestId: b1.id });
    await accept({ driverToken: jashimToken, rideRequestId: b2.id });
    const poolId = acc1.body.poolId;

    const res = await request(app)
      .post(`/api/rides/${b1.id}/cancel`)
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID());
    expect(res.status).toBe(200);

    const poolDb = await pool.query('SELECT status, occupied_seats FROM ride_pools WHERE id = $1', [poolId]);
    expect(poolDb.rows[0].status).toBe('FORMING');
    expect(poolDb.rows[0].occupied_seats).toBe(1);

    const r2Db = await pool.query('SELECT status FROM ride_requests WHERE id = $1', [b2.id]);
    expect(r2Db.rows[0].status).toBe('MATCHED');
  });

  it('9. Sequential duplicate passenger cancellation with different keys', async () => {
    const b = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const acc = await accept({ driverToken: jashimToken, rideRequestId: b.id });
    const poolId = acc.body.poolId;

    const res1 = await request(app)
      .post(`/api/rides/${b.id}/cancel`)
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID());
    expect(res1.status).toBe(200);

    const res2 = await request(app)
      .post(`/api/rides/${b.id}/cancel`)
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID());
    expect(res2.status).toBe(409);
    expect(res2.body.error.code).toBe('ALREADY_CANCELLED');

    const poolDb = await pool.query('SELECT occupied_seats FROM ride_pools WHERE id = $1', [poolId]);
    expect(poolDb.rows[0].occupied_seats).toBe(0);
  });

  it('10. Cross-passenger cancel is 403', async () => {
    const b = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    await accept({ driverToken: jashimToken, rideRequestId: b.id });

    const res = await request(app)
      .post(`/api/rides/${b.id}/cancel`)
      .set('Authorization', `Bearer ${rafiqToken}`)
      .set('Idempotency-Key', randomUUID());

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
