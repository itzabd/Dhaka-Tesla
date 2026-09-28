'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, setToken } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ token: string; user: { role: string } }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone, password }),
      });
      setToken(data.token);
      router.push(data.user.role === 'DRIVER' ? '/driver/dashboard' : '/passenger/book');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface text-ink font-sans">
      <form onSubmit={onSubmit} className="bg-card rounded-lg p-8 shadow w-full max-w-md space-y-4">
        <h1 className="text-2xl font-serif">Sign in</h1>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+8801711111111"
          className="w-full border rounded px-3 py-2"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password123"
          className="w-full border rounded px-3 py-2"
        />
        {error && <p className="text-danger-dark text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="bg-primary text-white rounded px-4 py-2 w-full disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
