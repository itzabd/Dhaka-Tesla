import bcrypt from 'bcrypt';
import { pool } from '../config/db';

export async function runSeed(): Promise<void> {
  const passwordHash = await bcrypt.hash('password123', 12);

  const users = [
    {
      id: '00000000-0000-0000-0000-000000000001',
      full_name: 'Jashim',
      phone: '+8801744444444',
      role: 'DRIVER',
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      full_name: 'Nusrat',
      phone: '+8801711111111',
      role: 'PASSENGER',
    },
    {
      id: '00000000-0000-0000-0000-000000000003',
      full_name: 'Rafiq',
      phone: '+8801722222222',
      role: 'PASSENGER',
    },
    {
      id: '00000000-0000-0000-0000-000000000004',
      full_name: 'Shirin',
      phone: '+8801733333333',
      role: 'PASSENGER',
    },
  ];

  for (const user of users) {
    await pool.query(
      `INSERT INTO users (id, full_name, phone, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (phone) DO NOTHING`,
      [user.id, user.full_name, user.phone, passwordHash, user.role]
    );
  }

  const jashimId = '00000000-0000-0000-0000-000000000001';
  await pool.query(
    `INSERT INTO vehicles (id, driver_id, name, model, capacity, is_online, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (driver_id) DO NOTHING`,
    ['00000000-0000-0000-0000-000000000010', jashimId, 'Bullet', 'Custom Electric 3-Wheeler', 3, false, true]
  );
}

if (require.main === module) {
  runSeed()
    .then(async () => {
      console.log('seed complete');
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('seed failed', err);
      await pool.end();
      process.exit(1);
    });
}
