import type { Metadata } from "next";
import { StatsView } from "./StatsView";

export const metadata: Metadata = {
  title: "t2000 — Network Stats",
  description:
    "Live stats for the t2000 agent network: registered agents, transactions, gas usage, and protocol fees on Sui mainnet.",
  openGraph: {
    title: "t2000 — Network Stats",
    description: "Live stats for the t2000 agent network on Sui mainnet.",
    type: "website",
  },
};

export default function StatsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground relative z-10">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <header className="mb-12 sm:mb-16">
          <a
            href="/"
            className="inline-block text-muted hover:text-accent text-xs font-mono mb-8 transition-colors"
          >
            ← t2000.ai
          </a>
          <div className="flex items-center gap-4 mb-3">
            <h1 className="text-3xl sm:text-4xl font-serif italic text-foreground tracking-tight">
              Network Stats
            </h1>
            <span className="inline-flex items-center gap-1.5 text-[10px] text-accent font-mono tracking-wider uppercase">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-dot" />
              Live
            </span>
          </div>
          <p className="text-muted text-sm max-w-lg leading-relaxed">
            Real-time data from the t2000 agent network on Sui mainnet.
            Auto-refreshes every 60 seconds.
          </p>
        </header>

        <StatsView />

        <footer className="mt-20 pt-8 border-t border-border text-center">
          <p className="text-muted text-xs">
            t2000 — A bank account for the AI economy.{" "}
            <a href="/" className="text-accent hover:underline">
              Home
            </a>{" "}
            ·{" "}
            <a href="/docs" className="text-accent hover:underline">
              Docs
            </a>{" "}
            ·{" "}
            <a href="/demo" className="text-accent hover:underline">
              Demos
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
