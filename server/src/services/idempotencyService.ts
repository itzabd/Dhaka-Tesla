import { pool } from '../config/db';

export async function claimIdempotencyKey(input: {
  key: string;
  userId: string;
  requestPath: string;
}): Promise<
  | { status: 'CLAIMED' }
  | { status: 'COMPLETED'; statusCode: number; responsePayload: unknown }
  | { status: 'IN_PROGRESS' }
> {
  const insertResult = await pool.query(
    `INSERT INTO idempotency_keys (key, user_id, request_path, status, expires_at)
     VALUES ($1, $2, $3, 'PROCESSING', NOW() + INTERVAL '24 hours')
     ON CONFLICT (key, user_id, request_path) DO NOTHING
     RETURNING key`,
    [input.key, input.userId, input.requestPath]
  );

  if ((insertResult.rowCount ?? 0) > 0) {
    return { status: 'CLAIMED' };
  }

  const selectResult = await pool.query(
    `SELECT status, status_code, response_payload, created_at,
            (created_at < NOW() - INTERVAL '5 minutes') AS is_stale
     FROM idempotency_keys
     WHERE key = $1 AND user_id = $2 AND request_path = $3`,
    [input.key, input.userId, input.requestPath]
  );

  if (selectResult.rowCount === 0) {
    return claimIdempotencyKey(input);
  }

  const row = selectResult.rows[0];

  if (row.status === 'COMPLETED') {
    return {
      status: 'COMPLETED',
      statusCode: row.status_code,
      responsePayload: row.response_payload,
    };
  }

  if (row.status === 'PROCESSING') {
    if (row.is_stale) {
      await pool.query(
        `DELETE FROM idempotency_keys WHERE key = $1 AND user_id = $2 AND request_path = $3`,
        [input.key, input.userId, input.requestPath]
      );
      return claimIdempotencyKey(input);
    }
    return { status: 'IN_PROGRESS' };
  }

  return { status: 'IN_PROGRESS' };
}

export async function completeIdempotencyKey(input: {
  key: string;
  userId: string;
  requestPath: string;
  statusCode: number;
  responsePayload: unknown;
}): Promise<void> {
  await pool.query(
    `UPDATE idempotency_keys
     SET status = 'COMPLETED', response_payload = $4, status_code = $5
     WHERE key = $1 AND user_id = $2 AND request_path = $3`,
    [input.key, input.userId, input.requestPath, JSON.stringify(input.responsePayload), input.statusCode]
  );
}

export async function releaseIdempotencyKey(input: {
  key: string;
  userId: string;
  requestPath: string;
}): Promise<void> {
  await pool.query(
    `DELETE FROM idempotency_keys
     WHERE key = $1 AND user_id = $2 AND request_path = $3`,
    [input.key, input.userId, input.requestPath]
  );
}
