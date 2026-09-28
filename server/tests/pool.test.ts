import request from 'supertest';
import { randomUUID } from 'crypto';
import { app } from '../src/app';
import { pool } from '../src/config/db';
import { runSeed } from '../src/scripts/seed';

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
  idempotencyKey?: string;
}): Promise<request.Response> {
  return request(app)
    .post(`/api/driver/requests/${input.rideRequestId}/accept`)
    .set('Authorization', `Bearer ${input.driverToken}`)
    .set('Idempotency-Key', input.idempotencyKey ?? randomUUID());
}

let jashimToken: string;
let jashimVehicleId: string;
let nusratToken: string;
let rafiqToken: string;
let shirinToken: string;

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
  shirinToken = await login('+8801733333333');
});

beforeEach(async () => {
  await pool.query('TRUNCATE ride_requests, ride_pools, pool_members, ride_events, idempotency_keys CASCADE');
  await pool.query('UPDATE vehicles SET is_online = TRUE WHERE id = $1', [jashimVehicleId]);
});

afterAll(async () => {
  await pool.end();
});

describe('poolService & accept endpoint', () => {
  it('single accept creates pool', async () => {
    const booking = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const res = await accept({ driverToken: jashimToken, rideRequestId: booking.id });

    expect(res.status).toBe(200);
    expect(res.body.poolId).toBeDefined();
    expect(res.body.occupiedSeats).toBe(1);
    expect(res.body.totalCapacity).toBe(3);
    expect(res.body.individualFarePoysha).toBe(7200);

    const pools = await pool.query('SELECT * FROM ride_pools WHERE vehicle_id = $1', [jashimVehicleId]);
    expect(pools.rows.length).toBe(1);
    expect(pools.rows[0].initial_pickup_zone).toBe('BANANI');
    expect(pools.rows[0].farthest_dropoff_zone).toBe('MOHAKHALI');
    expect(pools.rows[0].pickup_to_farthest_km).toBe(4);
  });

  it('second accept joins same pool', async () => {
    const b1 = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const r1 = await accept({ driverToken: jashimToken, rideRequestId: b1.id });
    expect(r1.status).toBe(200);

    const b2 = await bookRide({ token: rafiqToken, pickupZone: 'BANANI', dropoffZone: 'GULSHAN_1', requestedSeats: 1 });
    const r2 = await accept({ driverToken: jashimToken, rideRequestId: b2.id });
    expect(r2.status).toBe(200);
    expect(r2.body.poolId).toBe(r1.body.poolId);
    expect(r2.body.occupiedSeats).toBe(2);
    expect(r2.body.individualFarePoysha).toBe(4800);
  });

  it('route incompatibility by distance', async () => {
    const b1 = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    await accept({ driverToken: jashimToken, rideRequestId: b1.id });

    const b2 = await bookRide({ token: shirinToken, pickupZone: 'BANANI', dropoffZone: 'FARMGATE', requestedSeats: 1 });
    const res = await accept({ driverToken: jashimToken, rideRequestId: b2.id });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INCOMPATIBLE_ROUTE');
  });

  it('wrong pickup zone', async () => {
    const b1 = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    await accept({ driverToken: jashimToken, rideRequestId: b1.id });

    const b2 = await bookRide({ token: shirinToken, pickupZone: 'UTTARA', dropoffZone: 'BANANI', requestedSeats: 1 });
    const res = await accept({ driverToken: jashimToken, rideRequestId: b2.id });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INCOMPATIBLE_ROUTE');
  });

  it('capacity rejection', async () => {
    const b1 = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const b2 = await bookRide({ token: rafiqToken, pickupZone: 'BANANI', dropoffZone: 'GULSHAN_1', requestedSeats: 1 });
    await accept({ driverToken: jashimToken, rideRequestId: b1.id });
    await accept({ driverToken: jashimToken, rideRequestId: b2.id });

    const b3 = await bookRide({ token: shirinToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 2 });
    const res = await accept({ driverToken: jashimToken, rideRequestId: b3.id });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CAPACITY_EXCEEDED');

    const p = await pool.query('SELECT occupied_seats FROM ride_pools WHERE vehicle_id = $1', [jashimVehicleId]);
    expect(p.rows[0].occupied_seats).toBe(2);
  });

  it('first-pool race', async () => {
    const b1 = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const b2 = await bookRide({ token: rafiqToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });

    const [r1, r2] = await Promise.all([
      accept({ driverToken: jashimToken, rideRequestId: b1.id }),
      accept({ driverToken: jashimToken, rideRequestId: b2.id }),
    ]);

    if (r1.status !== 200) {
      console.error('[RACE-DIAG] R1 failed:', r1.status, JSON.stringify(r1.body));
    }
    if (r2.status !== 200) {
      console.error('[RACE-DIAG] R2 failed:', r2.status, JSON.stringify(r2.body));
    }

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const pools = await pool.query('SELECT * FROM ride_pools WHERE vehicle_id = $1', [jashimVehicleId]);
    expect(pools.rows.length).toBe(1);
    expect(pools.rows[0].occupied_seats).toBe(2);
    expect(pools.rows[0].farthest_dropoff_zone).toBe('MOHAKHALI');
  });

  it('last-seat race', async () => {
    const b1 = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const b2 = await bookRide({ token: rafiqToken, pickupZone: 'BANANI', dropoffZone: 'GULSHAN_1', requestedSeats: 1 });
    await accept({ driverToken: jashimToken, rideRequestId: b1.id });
    await accept({ driverToken: jashimToken, rideRequestId: b2.id });

    const b3 = await bookRide({ token: shirinToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const b4 = await bookRide({ token: shirinToken, pickupZone: 'BANANI', dropoffZone: 'GULSHAN_1', requestedSeats: 1 });

    const [r3, r4] = await Promise.all([
      accept({ driverToken: jashimToken, rideRequestId: b3.id }),
      accept({ driverToken: jashimToken, rideRequestId: b4.id }),
    ]);

    if (r3.status !== 200 && r3.status !== 409) {
      console.error('[RACE-DIAG] R3 failed:', r3.status, JSON.stringify(r3.body));
    }
    if (r4.status !== 200 && r4.status !== 409) {
      console.error('[RACE-DIAG] R4 failed:', r4.status, JSON.stringify(r4.body));
    }

    const statuses = [r3.status, r4.status].sort();
    expect(statuses).toEqual([200, 409]);

    const p = await pool.query('SELECT occupied_seats FROM ride_pools WHERE vehicle_id = $1', [jashimVehicleId]);
    expect(p.rows[0].occupied_seats).toBe(3);
  });

  it('passenger token -> 403', async () => {
    const b = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const res = await request(app)
      .post(`/api/driver/requests/${b.id}/accept`)
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('unauthenticated -> 401', async () => {
    const b = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const res = await request(app)
      .post(`/api/driver/requests/${b.id}/accept`)
      .set('Idempotency-Key', randomUUID());
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('driver offline -> 409', async () => {
    await pool.query('UPDATE vehicles SET is_online = FALSE WHERE id = $1', [jashimVehicleId]);
    const b = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const res = await accept({ driverToken: jashimToken, rideRequestId: b.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DRIVER_OFFLINE');
  });

  it('request not WAITING -> 400', async () => {
    const b = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    await accept({ driverToken: jashimToken, rideRequestId: b.id });
    const res = await accept({ driverToken: jashimToken, rideRequestId: b.id });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('nonexistent request -> 404', async () => {
    const res = await accept({ driverToken: jashimToken, rideRequestId: randomUUID() });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RIDE_NOT_FOUND');
  });

  it('idempotency: same key returns cached response', async () => {
    const b = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const key = randomUUID();

    const r1 = await accept({ driverToken: jashimToken, rideRequestId: b.id, idempotencyKey: key });
    expect(r1.status).toBe(200);

    let r2: request.Response | null = null;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 50));
      r2 = await accept({ driverToken: jashimToken, rideRequestId: b.id, idempotencyKey: key });
      if (r2.status === 200) break;
    }
    expect(r2).not.toBeNull();
    expect(r2!.status).toBe(200);
    expect(r2!.body.poolId).toBe(r1.body.poolId);

    const count = await pool.query('SELECT count(*)::int AS n FROM pool_members WHERE ride_request_id = $1', [b.id]);
    expect(count.rows[0].n).toBe(1);
  });
});
