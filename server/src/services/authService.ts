import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db';

const BCRYPT_COST = 12;

export interface RegisteredUser {
  id: string;
  fullName: string;
  phone: string;
  role: 'PASSENGER' | 'DRIVER';
}

export class PhoneTakenError extends Error {
  code = 'PHONE_TAKEN';
  constructor() { super('Phone already registered'); }
}

export async function registerUser(input: {
  fullName: string;
  phone: string;
  password: string;
  role: 'PASSENGER' | 'DRIVER';
}): Promise<RegisteredUser> {
  const hash = await bcrypt.hash(input.password, BCRYPT_COST);
  try {
    const result = await pool.query(
      `INSERT INTO users (full_name, phone, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name AS "fullName", phone, role`,
      [input.fullName, input.phone, hash, input.role]
    );
    return result.rows[0];
  } catch (err: any) {
    if (err?.code === '23505') throw new PhoneTakenError();
    throw err;
  }
}

export async function verifyCredentials(
  phone: string,
  password: string
): Promise<{ id: string; fullName: string; role: 'PASSENGER' | 'DRIVER' } | null> {
  const result = await pool.query(
    `SELECT id, full_name AS "fullName", password_hash, role FROM users WHERE phone = $1`,
    [phone]
  );
  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return null;
  return { id: row.id, fullName: row.fullName, role: row.role };
}

export function signToken(payload: { userId: string; role: 'PASSENGER' | 'DRIVER' }): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET missing');
  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    expiresIn: (process.env.JWT_EXPIRES_IN as any) ?? '24h',
  });
}

export function verifyToken(token: string): { userId: string; role: 'PASSENGER' | 'DRIVER' } {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET missing');
  return jwt.verify(token, secret) as { userId: string; role: 'PASSENGER' | 'DRIVER' };
}
