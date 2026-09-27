import fs from 'fs';
import path from 'path';
import { pool } from '../config/db';

export async function runMigrations(): Promise<void> {
  const migrationsDir = path.join(__dirname, '../db/migrations');
  if (!fs.existsSync(migrationsDir)) {
    return;
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const filename of files) {
    const filePath = path.join(migrationsDir, filename);
    const sql = fs.readFileSync(filePath, 'utf-8');
    try {
      await pool.query(sql);
      console.log(`[MIGRATE_OK] ${filename}`);
    } catch (error: any) {
      console.error(`[MIGRATE_FAIL] ${filename}: ${error.message}`);
      throw error;
    }
  }
}

if (require.main === module) {
  runMigrations()
    .then(async () => {
      console.log('migrations complete');
      await pool.end();
      process.exit(0);
    })
    .catch(async () => {
      await pool.end();
      process.exit(1);
    });
}
