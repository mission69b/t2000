import Link from 'next/link';
import { services } from '@/lib/services';
import { Header } from './components/Header';
import { StatsBar } from './components/StatsBar';
import { LiveFeed } from './components/LiveFeed';
import { TerminalDemo } from './components/TerminalDemo';
import { CopyInstall } from './components/CopyInstall';

const categories = new Set(services.flatMap((s) => s.categories));

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-6 py-14 space-y-10">
          {/* Hero */}
          <section className="text-center space-y-3">
            <h1 className="text-xl font-medium text-foreground">
              Machine Payment Protocol
            </h1>
            <p className="text-sm text-muted max-w-md mx-auto">
              Pay-per-request APIs on Sui. No keys, no accounts.
            </p>
          </section>

          {/* Stats bar */}
          <StatsBar />

          {/* Live feed */}
          <LiveFeed />

          {/* Terminal demo */}
          <TerminalDemo />

          {/* Bottom CTA */}
          <section className="flex flex-col sm:flex-row items-stretch gap-3">
            <div className="border border-border rounded-lg bg-surface/40 px-4 py-2.5 flex items-center gap-2 text-xs">
              <span className="text-foreground font-medium">{services.length} services</span>
              <span className="text-dim">·</span>
              <span className="text-muted">{categories.size} categories</span>
            </div>

            <Link
              href="/services"
              className="border border-border rounded-lg bg-surface/40 px-4 py-2.5 flex items-center justify-center gap-2 hover:border-accent/40 hover:bg-accent-dim transition-all group"
            >
              <span className="text-foreground font-medium text-xs group-hover:text-accent transition-colors">
                Browse all
              </span>
              <span className="text-accent text-xs">→</span>
            </Link>

            <div className="border border-border rounded-lg bg-surface/40 px-4 py-2.5 flex-1">
              <CopyInstall />
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between text-xs text-muted">
          <span>t2000</span>
          <span>
            Powered by{' '}
            <a href="https://mpp.dev" className="text-accent hover:underline">
              MPP
            </a>{' '}
            +{' '}
            <a href="https://sui.io" className="text-accent hover:underline">
              Sui
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
