import { pool } from '../config/db';

export async function runCleanup(): Promise<number> {
  const result = await pool.query(
    `DELETE FROM idempotency_keys
     WHERE status = 'PROCESSING'
       AND created_at < NOW() - INTERVAL '5 minutes'`
  );
  return result.rowCount ?? 0;
}

if (require.main === module) {
  runCleanup()
    .then(async (n) => { console.log(`cleaned ${n}`); await pool.end(); process.exit(0); })
    .catch(async (err) => { console.error(err); await pool.end(); process.exit(1); });
}
