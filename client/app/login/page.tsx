'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, setToken } from '@/lib/api';

const QUICK_USERS = [
  { name: 'Nusrat', role: 'Passenger', phone: '+8801711111111', badge: 'bg-primary/10 text-primary' },
  { name: 'Jashim', role: 'Driver (Bullet)', phone: '+8801744444444', badge: 'bg-emerald-50 text-emerald-700' },
  { name: 'Rafiq', role: 'Passenger', phone: '+8801722222222', badge: 'bg-primary/10 text-primary' },
  { name: 'Shirin', role: 'Passenger', phone: '+8801733333333', badge: 'bg-primary/10 text-primary' },
];

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('+8801711111111');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loginWithCredentials(targetPhone: string, targetPass: string) {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ token: string; user: { role: string } }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone: targetPhone, password: targetPass }),
      });
      setToken(data.token);
      router.push(data.user.role === 'DRIVER' ? '/driver/dashboard' : '/passenger/book');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await loginWithCredentials(phone, password);
  }

  function handleQuickLogin(userPhone: string) {
    setPhone(userPhone);
    setPassword('password123');
    loginWithCredentials(userPhone, 'password123');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface text-ink font-sans p-4">
      <div className="bg-card border border-[rgba(0,0,0,0.06)] rounded-2xl p-8 shadow-sm w-full max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">Sign in</h1>
          <p className="text-xs text-ink-muted mt-1">Access your Dhaka Tesla Pool account</p>
        </div>

        {/* Quick Demo Login Chips */}
        <div>
          <div className="text-[11px] font-bold text-ink-muted uppercase tracking-wider mb-2">
            Quick Demo Login
          </div>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_USERS.map((u) => (
              <button
                key={u.phone}
                type="button"
                onClick={() => handleQuickLogin(u.phone)}
                disabled={loading}
                className="p-2.5 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white hover:border-primary hover:bg-primary/5 transition text-left space-y-0.5 disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink">{u.name}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${u.badge}`}>
                    {u.role.split(' ')[0]}
                  </span>
                </div>
                <div className="text-[10px] text-ink-muted">{u.role}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="relative flex py-1 items-center">
          <div className="flex-grow border-t border-[rgba(0,0,0,0.08)]"></div>
          <span className="flex-shrink mx-3 text-[10px] uppercase font-bold text-ink-muted">or manually sign in</span>
          <div className="flex-grow border-t border-[rgba(0,0,0,0.08)]"></div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">Phone Number</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+8801711111111"
              className="w-full text-xs font-medium bg-surface border border-[rgba(0,0,0,0.08)] rounded-lg py-2.5 px-3 focus:outline-none focus:border-primary text-ink"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password123"
              className="w-full text-xs font-medium bg-surface border border-[rgba(0,0,0,0.08)] rounded-lg py-2.5 px-3 focus:outline-none focus:border-primary text-ink"
            />
          </div>

          {error && <p className="text-danger-dark text-xs font-medium">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-primary hover:bg-primary-dark text-white rounded-lg text-xs font-bold transition shadow-sm disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
