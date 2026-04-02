import Link from 'next/link';
import { services } from '@/lib/services';
import { Header } from './components/Header';
import { StatsBar } from './components/StatsBar';
import { LiveFeed } from './components/LiveFeed';
import { TerminalDemo } from './components/TerminalDemo';
import { CopyInstall } from './components/CopyInstall';

const categories = new Set(services.flatMap((s) => s.categories));
const endpointCount = services.reduce(
  (sum, s) => sum + (s.endpoints?.length ?? 0),
  0,
);

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-10">
          {/* Hero */}
          <section className="text-center space-y-4">
            <p className="font-mono text-[10px] tracking-[0.15em] text-accent uppercase">
              MPP Gateway
            </p>
            <h1 className="font-serif text-3xl sm:text-4xl text-foreground leading-[1.1]">
              Pay-per-request APIs on Sui
            </h1>
            <p className="text-sm text-muted max-w-md mx-auto leading-relaxed">
              No API keys. No accounts. No subscriptions. Your agent pays per request with USDC.
            </p>
          </section>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-px bg-border border border-border rounded-lg overflow-hidden">
            <div className="bg-surface px-4 py-4 text-center">
              <div className="text-xl sm:text-2xl font-medium text-foreground">{services.length}</div>
              <div className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase mt-1">Services</div>
            </div>
            <div className="bg-surface px-4 py-4 text-center">
              <div className="text-xl sm:text-2xl font-medium text-foreground">{endpointCount}</div>
              <div className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase mt-1">Endpoints</div>
            </div>
            <div className="bg-surface px-4 py-4 text-center">
              <div className="text-xl sm:text-2xl font-medium text-foreground">{categories.size}</div>
              <div className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase mt-1">Categories</div>
            </div>
          </div>

          {/* Live stats */}
          <StatsBar />

          {/* Live feed */}
          <LiveFeed />

          {/* Terminal demo */}
          <TerminalDemo />

          {/* Bottom CTA */}
          <section className="flex flex-col sm:flex-row items-stretch gap-3">
            <Link
              href="/services"
              className="flex-1 min-h-[40px] rounded-md bg-foreground text-background font-mono text-[10px] tracking-[0.12em] uppercase flex items-center justify-center gap-2 hover:opacity-80 transition-all"
            >
              Browse all services
              <span aria-hidden="true">&rarr;</span>
            </Link>

            <div className="flex-1 border border-border rounded-md bg-surface px-4 py-2.5">
              <CopyInstall />
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-[0.1em] text-dim uppercase">t2000</span>
          <span className="font-mono text-[10px] tracking-[0.1em] text-dim uppercase">
            Powered by{' '}
            <a href="https://suimpp.dev" className="text-accent hover:text-foreground transition-colors">
              MPP
            </a>{' '}
            +{' '}
            <a href="https://sui.io" className="text-accent hover:text-foreground transition-colors">
              Sui
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
