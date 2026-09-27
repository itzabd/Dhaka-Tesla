import request from 'supertest';
import { randomUUID } from 'crypto';
import { app } from '../src/app';
import { pool } from '../src/config/db';
import { runSeed } from '../src/scripts/seed';
import { signToken } from '../src/services/authService';

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

async function createTestPool(input: {
  vehicleId: string;
  status: 'FORMING' | 'ARRIVED' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED';
  occupiedSeats: number;
  completedAt?: Date | null;
}): Promise<string> {
  const result = await pool.query(
    `INSERT INTO ride_pools
       (vehicle_id, initial_pickup_zone, farthest_dropoff_zone, pickup_to_farthest_km,
        status, total_capacity, occupied_seats, completed_at)
     VALUES ($1, 'BANANI', 'MOHAKHALI', 4, $2, 3, $3, $4)
     RETURNING id`,
    [input.vehicleId, input.status, input.occupiedSeats, input.completedAt ?? null]
  );
  return result.rows[0].id;
}

async function createPoolMember(input: {
  poolId: string;
  rideRequestId: string;
  seatCount: number;
  farePoysha: number;
  status: 'ACTIVE' | 'CANCELLED';
}): Promise<void> {
  await pool.query(
    `INSERT INTO pool_members (pool_id, ride_request_id, status, seat_count, individual_fare_poysha)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.poolId, input.rideRequestId, input.status, input.seatCount, input.farePoysha]
  );
}

let jashimToken: string;
let jashimVehicleId: string;
let nusratToken: string;
let rafiqToken: string;
let shirinToken: string;

beforeAll(async () => {
  await pool.query('TRUNCATE users, vehicles, ride_requests, ride_pools, pool_members, ride_events, idempotency_keys CASCADE');
  await runSeed();

  const j = await request(app).post('/api/auth/login').send({ phone: '+8801744444444', password: 'password123' });
  jashimToken = j.body.token;

  const v = await pool.query('SELECT id FROM vehicles WHERE driver_id = $1', [j.body.user.id]);
  jashimVehicleId = v.rows[0].id;

  const n = await request(app).post('/api/auth/login').send({ phone: '+8801711111111', password: 'password123' });
  nusratToken = n.body.token;

  const r = await request(app).post('/api/auth/login').send({ phone: '+8801722222222', password: 'password123' });
  rafiqToken = r.body.token;

  const s = await request(app).post('/api/auth/login').send({ phone: '+8801733333333', password: 'password123' });
  shirinToken = s.body.token;
});

beforeEach(async () => {
  await pool.query('TRUNCATE ride_requests, ride_pools, pool_members, ride_events, idempotency_keys CASCADE');
  await pool.query('UPDATE vehicles SET is_online = FALSE WHERE id = $1', [jashimVehicleId]);
});

afterAll(async () => {
  await pool.end();
});

describe('driver', () => {
  it('toggle online -> 200', async () => {
    const res = await request(app)
      .patch('/api/driver/online')
      .set('Authorization', `Bearer ${jashimToken}`)
      .send({ isOnline: true });

    expect(res.status).toBe(200);
    expect(res.body.isOnline).toBe(true);
    expect(res.body.name).toBe('Bullet');

    const v = await pool.query('SELECT is_online FROM vehicles WHERE id = $1', [jashimVehicleId]);
    expect(v.rows[0].is_online).toBe(true);
  });

  it('toggle offline with no active pool -> 200', async () => {
    const res = await request(app)
      .patch('/api/driver/online')
      .set('Authorization', `Bearer ${jashimToken}`)
      .send({ isOnline: false });

    expect(res.status).toBe(200);
    expect(res.body.isOnline).toBe(false);
  });

  it('toggle offline with active FORMING pool -> 409 DRIVER_HAS_ACTIVE_POOL', async () => {
    await request(app)
      .patch('/api/driver/online')
      .set('Authorization', `Bearer ${jashimToken}`)
      .send({ isOnline: true })
      .expect(200);

    await createTestPool({ vehicleId: jashimVehicleId, status: 'FORMING', occupiedSeats: 0 });

    const res = await request(app)
      .patch('/api/driver/online')
      .set('Authorization', `Bearer ${jashimToken}`)
      .send({ isOnline: false });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DRIVER_HAS_ACTIVE_POOL');

    const v = await pool.query('SELECT is_online FROM vehicles WHERE id = $1', [jashimVehicleId]);
    expect(v.rows[0].is_online).toBe(true);
  });

  it('no active pool -> GET requests returns all WAITING', async () => {
    await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    await bookRide({ token: rafiqToken, pickupZone: 'BANANI', dropoffZone: 'GULSHAN_1', requestedSeats: 1 });
    await bookRide({ token: shirinToken, pickupZone: 'UTTARA', dropoffZone: 'FARMGATE', requestedSeats: 1 });

    const res = await request(app)
      .get('/api/driver/requests')
      .set('Authorization', `Bearer ${jashimToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(3);
  });

  it('active FORMING pool filters by pickup zone', async () => {
    await createTestPool({ vehicleId: jashimVehicleId, status: 'FORMING', occupiedSeats: 0 });

    await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'GULSHAN_1', requestedSeats: 1 });
    await bookRide({ token: rafiqToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    await bookRide({ token: shirinToken, pickupZone: 'UTTARA', dropoffZone: 'BANANI', requestedSeats: 1 });

    const res = await request(app)
      .get('/api/driver/requests')
      .set('Authorization', `Bearer ${jashimToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
  });

  it('active pool filters by distance', async () => {
    await createTestPool({ vehicleId: jashimVehicleId, status: 'FORMING', occupiedSeats: 0 });
    await bookRide({ token: rafiqToken, pickupZone: 'BANANI', dropoffZone: 'FARMGATE', requestedSeats: 1 });

    const res = await request(app)
      .get('/api/driver/requests')
      .set('Authorization', `Bearer ${jashimToken}`);
    expect(res.body.data.length).toBe(0);
  });

  it('active pool filters by capacity', async () => {
    await createTestPool({ vehicleId: jashimVehicleId, status: 'FORMING', occupiedSeats: 2 });
    await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 2 });

    const res = await request(app)
      .get('/api/driver/requests')
      .set('Authorization', `Bearer ${jashimToken}`);
    expect(res.body.data.length).toBe(0);
  });

  it('GET pools/current with no active pool -> pool is null', async () => {
    const res = await request(app)
      .get('/api/driver/pools/current')
      .set('Authorization', `Bearer ${jashimToken}`);
    expect(res.status).toBe(200);
    expect(res.body.vehicle.name).toBe('Bullet');
    expect(res.body.pool).toBeNull();
  });

  it('GET pools/current with active pool -> manifest with passengers', async () => {
    const poolId = await createTestPool({ vehicleId: jashimVehicleId, status: 'FORMING', occupiedSeats: 2 });
    const b1 = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const b2 = await bookRide({ token: rafiqToken, pickupZone: 'BANANI', dropoffZone: 'GULSHAN_1', requestedSeats: 1 });
    await createPoolMember({ poolId, rideRequestId: b1.id, seatCount: 1, farePoysha: 7200, status: 'ACTIVE' });
    await createPoolMember({ poolId, rideRequestId: b2.id, seatCount: 1, farePoysha: 4800, status: 'ACTIVE' });
    await pool.query(`UPDATE ride_requests SET status='MATCHED' WHERE id IN ($1, $2)`, [b1.id, b2.id]);

    const res = await request(app)
      .get('/api/driver/pools/current')
      .set('Authorization', `Bearer ${jashimToken}`);
    expect(res.status).toBe(200);
    expect(res.body.pool).not.toBeNull();
    expect(res.body.pool.passengers.length).toBe(2);
    expect(res.body.pool.passengers[0].individualFarePoysha).toBeGreaterThan(0);
  });

  it('GET history with no completed pools -> empty array', async () => {
    const res = await request(app)
      .get('/api/driver/history')
      .set('Authorization', `Bearer ${jashimToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
    expect(res.body.pagination.hasMore).toBe(false);
  });

  it('GET history with completed pool -> aggregation correct', async () => {
    const poolId = await createTestPool({ vehicleId: jashimVehicleId, status: 'COMPLETED', occupiedSeats: 2, completedAt: new Date() });
    const b1 = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    const b2 = await bookRide({ token: rafiqToken, pickupZone: 'BANANI', dropoffZone: 'GULSHAN_1', requestedSeats: 1 });
    await createPoolMember({ poolId, rideRequestId: b1.id, seatCount: 1, farePoysha: 7200, status: 'ACTIVE' });
    await createPoolMember({ poolId, rideRequestId: b2.id, seatCount: 1, farePoysha: 4800, status: 'ACTIVE' });

    const res = await request(app)
      .get('/api/driver/history')
      .set('Authorization', `Bearer ${jashimToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].totalFareCollectedPoysha).toBe(12000);
    expect(res.body.data[0].passengerCount).toBe(2);
  });

  it('GET history with cancelled pool -> fares sum to zero', async () => {
    const poolId = await createTestPool({ vehicleId: jashimVehicleId, status: 'CANCELLED', occupiedSeats: 0 });
    const b1 = await bookRide({ token: nusratToken, pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
    await createPoolMember({ poolId, rideRequestId: b1.id, seatCount: 1, farePoysha: 7200, status: 'CANCELLED' });

    const res = await request(app)
      .get('/api/driver/history')
      .set('Authorization', `Bearer ${jashimToken}`);
    const row = res.body.data.find((r: any) => r.poolId === poolId);
    expect(row).toBeDefined();
    expect(row.totalFareCollectedPoysha).toBe(0);
  });

  it('passenger cannot access driver endpoints', async () => {
    const res = await request(app)
      .get('/api/driver/requests')
      .set('Authorization', `Bearer ${nusratToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('unauthenticated -> 401', async () => {
    const res = await request(app).get('/api/driver/requests');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('driver without vehicle -> 404 VEHICLE_NOT_FOUND', async () => {
    const inserted = await pool.query(
      `INSERT INTO users (full_name, phone, password_hash, role)
       VALUES ('Orphan', '+8801988888888', '$2b$12$placeholder', 'DRIVER')
       RETURNING id`
    );
    const orphanToken = signToken({ userId: inserted.rows[0].id, role: 'DRIVER' });

    const res = await request(app)
      .get('/api/driver/requests')
      .set('Authorization', `Bearer ${orphanToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('VEHICLE_NOT_FOUND');

    await pool.query('DELETE FROM users WHERE id = $1', [inserted.rows[0].id]);
  });
});
