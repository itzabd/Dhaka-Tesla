import Link from 'next/link';

interface PassengerSidebarProps {
  active: 'dashboard' | 'requests' | 'history' | 'account';
  variant?: 'sidebar' | 'bottom-nav';
}

export function PassengerSidebar({ active, variant = 'sidebar' }: PassengerSidebarProps) {
  // Navigation mapping:
  // Dashboard -> /passenger/book
  // Requests  -> /passenger/book (In the MVP, Requests points to /passenger/book as there is no separate requests view)
  // History   -> /passenger/history
  // Account   -> disabled <span> (Coming soon in MVP)

  if (variant === 'bottom-nav') {
    return (
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-[rgba(0,0,0,0.08)] px-2 py-1.5 flex items-center justify-around z-20 md:hidden">
        <Link
          href="/passenger/book"
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
          href="/passenger/book"
          className={`flex flex-col items-center gap-1 py-1 px-3 text-xs font-medium rounded-lg transition ${
            active === 'requests'
              ? 'text-primary bg-primary/10 font-semibold'
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z" />
          </svg>
          <span className="text-[10px]">Requests</span>
        </Link>

        <Link
          href="/passenger/history"
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

        <span
          className="flex flex-col items-center gap-1 py-1 px-3 text-xs text-ink-muted opacity-50 cursor-not-allowed"
          title="Coming soon"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <span className="text-[10px]">Account</span>
        </span>
      </nav>
    );
  }

  // Sidebar variant: fixed left column, w-60 (240px matching Stitch w-[240px]), hidden md:flex
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
            <div className="text-[10px] text-ink-muted font-medium">Passenger Portal</div>
          </div>
        </div>

        {/* 4 Items Navigation */}
        <nav className="space-y-1">
          <Link
            href="/passenger/book"
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
            href="/passenger/book"
            className={`flex items-center justify-between px-3 py-2.5 text-xs rounded-lg transition ${
              active === 'requests'
                ? 'font-semibold bg-primary/10 text-primary relative'
                : 'font-medium text-ink-muted hover:text-ink hover:bg-zinc-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                <path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z" />
              </svg>
              <span>Requests</span>
            </div>
            {active === 'requests' && <span className="w-1.5 h-4 rounded-full bg-primary" />}
          </Link>

          <Link
            href="/passenger/history"
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

          <span
            className="flex items-center gap-3 px-3 py-2.5 text-xs text-ink-muted opacity-50 cursor-not-allowed"
            title="Coming soon"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>Account</span>
          </span>
        </nav>
      </div>

      {/* Sidebar Footer */}
      <div className="p-3 bg-surface-alt rounded-lg border border-[rgba(0,0,0,0.05)]">
        <div className="text-[11px] font-semibold text-ink">Corridor Transit</div>
        <div className="text-[10px] text-ink-muted mt-0.5">Fixed corridor electric pooling</div>
      </div>
    </aside>
  );
}
