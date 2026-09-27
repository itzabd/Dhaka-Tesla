import request from 'supertest';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
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

describe('audit integrity', () => {
  it('1. Every state transition produces exactly one ride_event', async () => {
    const booking = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 })
      .expect(201);
    const rideId = booking.body.id;

    await request(app)
      .post(`/api/driver/requests/${rideId}/accept`)
      .set('Authorization', `Bearer ${jashimToken}`)
      .set('Idempotency-Key', randomUUID())
      .expect(200);

    const requested = await pool.query(
      `SELECT event_type, from_status, to_status FROM ride_events
       WHERE ride_request_id = $1 AND event_type = 'RIDE_REQUESTED'`,
      [rideId]
    );
    expect(requested.rowCount).toBe(1);
    expect(requested.rows[0].from_status).toBeNull();
    expect(requested.rows[0].to_status).toBe('WAITING');

    const accepted = await pool.query(
      `SELECT event_type, from_status, to_status FROM ride_events
       WHERE ride_request_id = $1 AND event_type = 'PASSENGER_ACCEPTED'`,
      [rideId]
    );
    expect(accepted.rowCount).toBe(1);
    expect(accepted.rows[0].from_status).toBe('WAITING');
    expect(accepted.rows[0].to_status).toBe('MATCHED');
  });

  it('2. Foreign key constraint rejects audit events with invalid pool_member_id', async () => {
    const userRow = await pool.query('SELECT id FROM users ORDER BY id LIMIT 1');
    const userId = userRow.rows[0].id;

    await expect(
      pool.query(
        `INSERT INTO ride_events (actor_user_id, ride_request_id, pool_id, pool_member_id,
                                  event_type, to_status)
         VALUES ($1, NULL, NULL, $2, 'TEST', 'WAITING')`,
        [userId, randomUUID()]
      )
    ).rejects.toThrow(/foreign key constraint/i);
  });

  it('3. Lifecycle transition produces one POOL_ARRIVED event per active passenger', async () => {
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

    await request(app)
      .patch(`/api/driver/pools/${acceptRes.body.poolId}/status`)
      .set('Authorization', `Bearer ${jashimToken}`)
      .send({ status: 'ARRIVED' })
      .expect(200);

    const arrivedEvents = await pool.query(
      `SELECT count(*)::int AS n FROM ride_events
       WHERE pool_id = $1 AND event_type = 'POOL_ARRIVED'`,
      [acceptRes.body.poolId]
    );
    expect(arrivedEvents.rows[0].n).toBe(1);
  });

  it('4. Driver cancellation produces one DRIVER_CANCELLED_POOL event per affected passenger', async () => {
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

    await request(app)
      .post(`/api/driver/pools/${acceptRes.body.poolId}/cancel`)
      .set('Authorization', `Bearer ${jashimToken}`)
      .set('Idempotency-Key', randomUUID())
      .expect(200);

    const cancelled = await pool.query(
      `SELECT event_type, from_status, to_status FROM ride_events
       WHERE pool_id = $1 AND event_type = 'DRIVER_CANCELLED_POOL'`,
      [acceptRes.body.poolId]
    );
    expect(cancelled.rowCount).toBe(1);
    expect(cancelled.rows[0].from_status).toBe('MATCHED');
    expect(cancelled.rows[0].to_status).toBe('WAITING');
  });

  it('5. Passenger cancellation produces PASSENGER_CANCELLED event', async () => {
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

    await request(app)
      .post(`/api/rides/${booking.body.id}/cancel`)
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID())
      .expect(200);

    const passengerCancelled = await pool.query(
      `SELECT event_type, from_status, to_status FROM ride_events
       WHERE ride_request_id = $1 AND event_type = 'PASSENGER_CANCELLED'`,
      [booking.body.id]
    );
    expect(passengerCancelled.rowCount).toBe(1);
    expect(passengerCancelled.rows[0].from_status).toBe('MATCHED');
    expect(passengerCancelled.rows[0].to_status).toBe('CANCELLED');
  });

  it('no source file issues UPDATE or DELETE against ride_events', async () => {
    const srcDir = path.join(__dirname, '..', 'src');
    const files: string[] = [];

    async function walk(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(full);
      }
    }
    await walk(srcDir);

    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      expect(content).not.toMatch(/UPDATE\s+ride_events/i);
      expect(content).not.toMatch(/DELETE\s+FROM\s+ride_events/i);
    }
  });
});
