import { pool } from '../src/config/db';
import { runSeed } from '../src/scripts/seed';

beforeAll(async () => {
  await pool.query('TRUNCATE users, vehicles, ride_requests, ride_pools, pool_members, ride_events, idempotency_keys CASCADE');
});

afterAll(async () => {
  await pool.end();
});

describe('seed', () => {
  it('seeds 4 users and 1 vehicle', async () => {
    await runSeed();
    const users = await pool.query('SELECT count(*)::int AS n FROM users');
    const vehicles = await pool.query('SELECT count(*)::int AS n FROM vehicles');
    expect(users.rows[0].n).toBe(4);
    expect(vehicles.rows[0].n).toBe(1);
  });

  it('is idempotent on second run', async () => {
    await runSeed();
    const users = await pool.query('SELECT count(*)::int AS n FROM users');
    const vehicles = await pool.query('SELECT count(*)::int AS n FROM vehicles');
    expect(users.rows[0].n).toBe(4);
    expect(vehicles.rows[0].n).toBe(1);
  });

  it('Bullet has capacity 3 owned by Jashim', async () => {
    const result = await pool.query(`
      SELECT v.capacity, v.driver_id, u.full_name
      FROM vehicles v JOIN users u ON v.driver_id = u.id
      WHERE v.name = 'Bullet'
    `);
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].capacity).toBe(3);
    expect(result.rows[0].full_name).toBe('Jashim');
  });
});
