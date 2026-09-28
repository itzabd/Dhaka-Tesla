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

export function getRoleFromLocation(): 'DRIVER' | 'PASSENGER' | null {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname;
  if (path.startsWith('/driver')) return 'DRIVER';
  if (path.startsWith('/passenger')) return 'PASSENGER';
  return null;
}

export function getToken(preferredRole?: 'DRIVER' | 'PASSENGER'): string | null {
  if (typeof window === 'undefined') return null;
  const role = preferredRole || getRoleFromLocation();
  if (role === 'DRIVER') {
    return window.localStorage.getItem('token_driver') || window.localStorage.getItem('token');
  }
  if (role === 'PASSENGER') {
    return window.localStorage.getItem('token_passenger') || window.localStorage.getItem('token');
  }
  return (
    window.localStorage.getItem('token') ||
    window.localStorage.getItem('token_passenger') ||
    window.localStorage.getItem('token_driver')
  );
}

export function setToken(token: string, role?: string): void {
  if (typeof window === 'undefined') return;
  const normalizedRole = role ? role.toUpperCase() : getRoleFromLocation();
  if (normalizedRole === 'DRIVER') {
    window.localStorage.setItem('token_driver', token);
  } else if (normalizedRole === 'PASSENGER') {
    window.localStorage.setItem('token_passenger', token);
  }
  // Also store default token for backward compatibility
  window.localStorage.setItem('token', token);
}

export function clearToken(role?: 'DRIVER' | 'PASSENGER'): void {
  if (typeof window === 'undefined') return;
  const targetRole = role || getRoleFromLocation();
  if (targetRole === 'DRIVER') {
    window.localStorage.removeItem('token_driver');
  } else if (targetRole === 'PASSENGER') {
    window.localStorage.removeItem('token_passenger');
  } else {
    window.localStorage.removeItem('token_driver');
    window.localStorage.removeItem('token_passenger');
    window.localStorage.removeItem('token');
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { idempotencyKey?: string } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  const token = getToken();
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
