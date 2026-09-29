const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message?: string) {
    super(message ?? code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export type AuthRole = 'passenger' | 'driver';

export function getToken(role: AuthRole = 'passenger'): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(`token_${role}`);
}

export function setToken(token: string, role: AuthRole = 'passenger'): void {
  window.localStorage.setItem(`token_${role}`, token);
}

export function clearToken(role: AuthRole = 'passenger'): void {
  window.localStorage.removeItem(`token_${role}`);
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { idempotencyKey?: string; role?: AuthRole } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  const token = getToken(options.role ?? 'passenger');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = body?.error?.code || 'REQUEST_FAILED';
    const detail = body?.error?.detail || body?.error?.message;
    throw new ApiError(code, res.status, detail);
  }
  return body as T;
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function isSessionExpired(err: unknown): boolean {
  return err instanceof ApiError && (err.code === 'UNAUTHENTICATED' || err.code === 'TOKEN_EXPIRED');
}
