import request from 'supertest';
import { randomUUID } from 'crypto';
import { app } from '../src/app';
import { pool } from '../src/config/db';
import { runSeed } from '../src/scripts/seed';

jest.setTimeout(30000);

let jashimToken: string;
let jashimVehicleId: string;
let nusratToken: string;
let rafiqToken: string;
let secondDriverToken: string;
let secondDriverId: string | undefined;
let secondVehicleId: string;

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

  await pool.query(
    `INSERT INTO users (id, full_name, phone, password_hash, role)
     VALUES ('00000000-0000-0000-0000-000000000099', 'Kamal', '+8801988888888',
             (SELECT password_hash FROM users WHERE phone = '+8801744444444'),
             'DRIVER')
     ON CONFLICT (phone) DO NOTHING`
  );
  const s = await request(app).post('/api/auth/login').send({ phone: '+8801988888888', password: 'password123' });
  secondDriverToken = s.body.token;
  secondDriverId = s.body.user.id;

  await pool.query(
    `INSERT INTO vehicles (id, driver_id, name, capacity, is_online)
     VALUES ('00000000-0000-0000-0000-0000000000a0', $1, 'Bullet-2', 3, TRUE)
     ON CONFLICT (driver_id) DO NOTHING`,
    [secondDriverId]
  );
  const v2 = await pool.query('SELECT id FROM vehicles WHERE driver_id = $1', [secondDriverId]);
  secondVehicleId = v2.rows[0].id;
}, 30000);

beforeEach(async () => {
  await pool.query('TRUNCATE ride_requests, ride_pools, pool_members, ride_events, idempotency_keys CASCADE');
  await pool.query('UPDATE vehicles SET is_online = TRUE WHERE id IN ($1, $2)', [jashimVehicleId, secondVehicleId]);
});

afterAll(async () => {
  // Guard against undefined if beforeAll failed partway
  if (secondDriverId) {
    await pool.query('DELETE FROM vehicles WHERE driver_id = $1', [secondDriverId]);
    await pool.query('DELETE FROM users WHERE id = $1', [secondDriverId]);
  }
  await pool.end();
});

describe('authorization boundaries', () => {
  it('1. Passenger A cannot GET passenger B ride', async () => {
    const booking = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 })
      .expect(201);

    const res = await request(app)
      .get(`/api/rides/${booking.body.id}`)
      .set('Authorization', `Bearer ${rafiqToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('2. Passenger A cannot cancel passenger B ride', async () => {
    const booking = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 })
      .expect(201);

    const res = await request(app)
      .post(`/api/rides/${booking.body.id}/cancel`)
      .set('Authorization', `Bearer ${rafiqToken}`)
      .set('Idempotency-Key', randomUUID());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');

    const followUp = await request(app)
      .get(`/api/rides/${booking.body.id}`)
      .set('Authorization', `Bearer ${nusratToken}`);
    expect(followUp.body.status).toBe('WAITING');
    expect(followUp.body.cancelledAt).toBeNull();
  });

  it('3. Passenger token on every driver endpoint returns 403', async () => {
    const endpoints: Array<{ method: 'get' | 'post' | 'patch'; path: string; body?: object; idempotency?: boolean }> = [
      { method: 'get', path: '/api/driver/requests' },
      { method: 'get', path: '/api/driver/pools/current' },
      { method: 'get', path: '/api/driver/history' },
      { method: 'patch', path: '/api/driver/online', body: { isOnline: true } },
      { method: 'post', path: '/api/driver/requests/00000000-0000-0000-0000-000000000000/accept', idempotency: true },
      { method: 'patch', path: '/api/driver/pools/00000000-0000-0000-0000-000000000000/status', body: { status: 'ARRIVED' } },
      { method: 'post', path: '/api/driver/pools/00000000-0000-0000-0000-000000000000/cancel', idempotency: true },
    ];

    for (const ep of endpoints) {
      let req = request(app)[ep.method](ep.path).set('Authorization', `Bearer ${nusratToken}`);
      if (ep.body) req = req.send(ep.body);
      if (ep.idempotency) req = req.set('Idempotency-Key', randomUUID());
      const res = await req;
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('4. Driver token on passenger endpoints returns 403', async () => {
    const endpoints: Array<{ method: 'get' | 'post'; path: string; body?: object; idempotency?: boolean }> = [
      { method: 'post', path: '/api/rides', body: { pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 }, idempotency: true },
      { method: 'get', path: '/api/rides/history' },
    ];

    for (const ep of endpoints) {
      let req = request(app)[ep.method](ep.path).set('Authorization', `Bearer ${jashimToken}`);
      if (ep.body) req = req.send(ep.body);
      if (ep.idempotency) req = req.set('Idempotency-Key', randomUUID());
      const res = await req;
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('5. Unauthenticated access to protected endpoints returns 401', async () => {
    const res1 = await request(app).get('/api/rides/history');
    expect(res1.status).toBe(401);
    expect(res1.body.error.code).toBe('UNAUTHENTICATED');

    const res2 = await request(app).get('/api/driver/requests');
    expect(res2.status).toBe(401);
    expect(res2.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('6. Cross-driver isolation on pool endpoints', async () => {
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

    const statusRes = await request(app)
      .patch(`/api/driver/pools/${poolId}/status`)
      .set('Authorization', `Bearer ${secondDriverToken}`)
      .send({ status: 'ARRIVED' });
    expect(statusRes.status).toBe(404);
    expect(statusRes.body.error.code).toBe('POOL_NOT_FOUND');

    const cancelRes = await request(app)
      .post(`/api/driver/pools/${poolId}/cancel`)
      .set('Authorization', `Bearer ${secondDriverToken}`)
      .set('Idempotency-Key', randomUUID());
    expect(cancelRes.status).toBe(404);
    expect(cancelRes.body.error.code).toBe('POOL_NOT_FOUND');
  });

  it('7. Idempotency tenant isolation — same key, different users, distinct rows', async () => {
    const key = 'shared-tenant-key';

    const r1 = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', key)
      .send({ pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 })
      .expect(201);

    const r2 = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${rafiqToken}`)
      .set('Idempotency-Key', key)
      .send({ pickupZone: 'BANANI', dropoffZone: 'GULSHAN_1', requestedSeats: 1 })
      .expect(201);

    expect(r1.body.id).not.toBe(r2.body.id);

    const both = await pool.query(
      'SELECT id FROM ride_requests WHERE id IN ($1, $2)',
      [r1.body.id, r2.body.id]
    );
    expect(both.rowCount).toBe(2);
  });

  it('8. Cross-passenger history isolation', async () => {
    const nusratA = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 })
      .expect(201);

    const nusratB = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${nusratToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ pickupZone: 'BANANI', dropoffZone: 'GULSHAN_1', requestedSeats: 1 })
      .expect(201);

    const rafiqBooking = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${rafiqToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({ pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 })
      .expect(201);

    const history = await request(app)
      .get('/api/rides/history')
      .set('Authorization', `Bearer ${rafiqToken}`)
      .expect(200);

    expect(history.body.data.length).toBe(1);
    expect(history.body.data[0].id).toBe(rafiqBooking.body.id);
    expect(history.body.data[0].id).not.toBe(nusratA.body.id);
    expect(history.body.data[0].id).not.toBe(nusratB.body.id);
  });
});
