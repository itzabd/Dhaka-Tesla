import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-surface p-6 flex flex-col items-center justify-center text-center font-sans">
      <div className="max-w-md w-full bg-card border border-[rgba(0,0,0,0.06)] rounded-2xl p-8 shadow-sm space-y-6">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-sm">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M15.914 4a1.5 1.5 0 0 0-2.474-1.561l-9 9A1.5 1.5 0 0 0 5.5 14h4.002a.5.5 0 0 1 .471.666L8.086 20a1.5 1.5 0 0 0 2.475 1.56l9-9A1.5 1.5 0 0 0 18.5 10h-3.997a.5.5 0 0 1-.472-.667z" />
          </svg>
        </div>

        <div>
          <h1 className="text-3xl font-extrabold text-ink tracking-tight">Dhaka Tesla Pool</h1>
          <p className="text-sm text-ink-muted mt-2 font-medium">
            Autonomous corridor-based electric rideshare pooling platform in Dhaka.
          </p>
        </div>

        <div className="pt-2">
          <Link
            href="/login"
            className="w-full inline-flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-primary hover:bg-primary-dark text-white font-bold text-sm shadow-sm transition"
          >
            <span>Enter App / Sign in</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </main>
  );
}
