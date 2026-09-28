import Link from 'next/link';
import { clearToken } from '@/lib/api';

interface DriverSidebarProps {
  active: 'dashboard' | 'requests' | 'history';
  variant?: 'sidebar' | 'bottom-nav';
}

export function DriverSidebar({ active, variant = 'sidebar' }: DriverSidebarProps) {
  // Navigation mapping:
  // Dashboard -> /driver/dashboard
  // Requests  -> /driver/dashboard (placeholder — inbox lives on the dashboard)
  // History   -> /driver/history
  // Log out   -> button, clears token, redirects to /login
  // The active pool manifest is displayed on the dashboard, not on a separate page.
  // The Pool tab from earlier drafts was removed to match the Stitch tab list.

  function handleLogout(): void {
    if (typeof window === 'undefined') return;
    clearToken('DRIVER');
    window.location.href = '/login';
  }

  if (variant === 'bottom-nav') {
    return (
      <nav aria-label="Mobile Navigation" className="fixed bottom-0 inset-x-0 bg-white border-t border-[rgba(0,0,0,0.08)] px-4 py-2 flex items-center justify-around z-20 md:hidden">
        <Link
          href="/driver/dashboard"
          className={`flex flex-col items-center gap-1 py-1 px-3 text-xs font-semibold rounded-lg transition ${
            active === 'dashboard'
              ? 'text-primary bg-primary/10'
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <rect width="7" height="7" x="3" y="3" rx="1" />
            <rect width="7" height="7" x="14" y="3" rx="1" />
            <rect width="7" height="7" x="14" y="14" rx="1" />
            <rect width="7" height="7" x="3" y="14" rx="1" />
          </svg>
          <span className="text-[10px]">Dashboard</span>
        </Link>

        <Link
          href="/driver/dashboard"
          className={`flex flex-col items-center gap-1 py-1 px-3 text-xs font-medium rounded-lg transition ${
            active === 'requests'
              ? 'text-primary bg-primary/10 font-semibold'
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-[10px]">Requests</span>
        </Link>

        <Link
          href="/driver/history"
          className={`flex flex-col items-center gap-1 py-1 px-3 text-xs font-medium rounded-lg transition ${
            active === 'history'
              ? 'text-primary bg-primary/10 font-semibold'
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span className="text-[10px]">History</span>
        </Link>

        <button
          type="button"
          onClick={handleLogout}
          aria-label="Log out"
          className="flex flex-col items-center gap-1 py-1 px-3 text-xs text-ink-muted hover:text-danger-dark transition flex-1"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span className="text-[10px]">Log out</span>
        </button>
      </nav>
    );
  }

  // Desktop sidebar (variant='sidebar')
  return (
    <aside className="fixed top-0 bottom-0 left-0 w-60 z-20 flex-shrink-0 bg-white border-r border-[rgba(0,0,0,0.06)] hidden md:flex flex-col justify-between p-4">
      <div>
        {/* Brand Header */}
        <div className="flex items-center gap-2.5 px-3 py-3 mb-6 border-b border-[rgba(0,0,0,0.05)]">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M15.914 4a1.5 1.5 0 0 0-2.474-1.561l-9 9A1.5 1.5 0 0 0 5.5 14h4.002a.5.5 0 0 1 .471.666L8.086 20a1.5 1.5 0 0 0 2.475 1.56l9-9A1.5 1.5 0 0 0 18.5 10h-3.997a.5.5 0 0 1-.472-.667z" />
            </svg>
          </div>
          <div>
            <div className="font-bold text-xs tracking-tight text-ink">DHAKA TESLA POOL</div>
            <div className="text-[10px] text-ink-muted font-medium">Driver Terminal</div>
          </div>
        </div>

        {/* Navigation */}
        <nav aria-label="Driver Navigation" className="space-y-1">
          <Link
            href="/driver/dashboard"
            className={`flex items-center justify-between px-3 py-2.5 text-xs rounded-lg transition ${
              active === 'dashboard'
                ? 'font-semibold bg-primary/10 text-primary relative'
                : 'font-medium text-ink-muted hover:text-ink hover:bg-zinc-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <rect width="7" height="7" x="3" y="3" rx="1" />
                <rect width="7" height="7" x="14" y="3" rx="1" />
                <rect width="7" height="7" x="14" y="14" rx="1" />
                <rect width="7" height="7" x="3" y="14" rx="1" />
              </svg>
              <span>Dashboard</span>
            </div>
            {active === 'dashboard' && <span className="w-1.5 h-4 rounded-full bg-primary" />}
          </Link>

          <Link
            href="/driver/dashboard"
            className={`flex items-center justify-between px-3 py-2.5 text-xs rounded-lg transition ${
              active === 'requests'
                ? 'font-semibold bg-primary/10 text-primary relative'
                : 'font-medium text-ink-muted hover:text-ink hover:bg-zinc-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Requests</span>
            </div>
            {active === 'requests' && <span className="w-1.5 h-4 rounded-full bg-primary" />}
          </Link>

          <Link
            href="/driver/history"
            className={`flex items-center justify-between px-3 py-2.5 text-xs rounded-lg transition ${
              active === 'history'
                ? 'font-semibold bg-primary/10 text-primary relative'
                : 'font-medium text-ink-muted hover:text-ink hover:bg-zinc-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>History</span>
            </div>
            {active === 'history' && <span className="w-1.5 h-4 rounded-full bg-primary" />}
          </Link>
        </nav>
      </div>

      {/* Bottom Area: Logout & Footer */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={handleLogout}
          aria-label="Log out"
          className="flex items-center gap-3 px-4 py-3 text-danger-dark hover:bg-danger/10 rounded-md transition-colors w-full text-left text-xs font-semibold"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>Log out</span>
        </button>

        <div className="p-3 bg-surface-alt rounded-lg border border-[rgba(0,0,0,0.05)]">
          <div className="text-[11px] font-semibold text-ink">Corridor Transit</div>
          <div className="text-[10px] text-ink-muted mt-0.5">Fixed corridor electric pooling</div>
        </div>
      </div>
    </aside>
  );
}
