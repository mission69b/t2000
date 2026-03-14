import type { Metadata } from "next";
import { CinematicWalkthrough } from "./CinematicWalkthrough";
import { DemoShowcase } from "./DemoShowcase";

export const metadata: Metadata = {
  title: "t2000 — Live Demos",
  description:
    "Interactive terminal demos of t2000: investing, safeguards, savings, borrowing, swaps, x402 payments, and the full financial dashboard for AI agents on Sui.",
  openGraph: {
    title: "t2000 — Live Demos",
    description:
      "Interactive terminal demos — see how AI agents bank on Sui.",
    type: "website",
  },
};

export default function DemoPage() {
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
          <h1 className="text-3xl sm:text-4xl font-serif italic text-foreground mb-3 tracking-tight">
            Live Demos
          </h1>
          <p className="text-muted text-sm max-w-lg leading-relaxed">
            Every demo below runs with real CLI output and real transaction
            digests from Sui mainnet. Click any terminal to replay.
          </p>
        </header>

        {/* ── Cinematic Walkthrough ── */}
        <section className="mb-16 sm:mb-20">
          <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
            Product Walkthrough
          </div>
          <h2 className="text-xl sm:text-2xl font-serif italic text-foreground mb-3 tracking-tight">
            The full story in 60 seconds.
          </h2>
          <p className="text-muted text-[12px] sm:text-[13px] max-w-lg leading-relaxed mb-6">
            Watch the cinematic demo — balance checks, savings, borrowing,
            safeguards, x402 payments, and more. All real interactions.
          </p>
          <CinematicWalkthrough />
        </section>

        <DemoShowcase />

        <footer className="mt-20 pt-8 border-t border-border text-center">
          <p className="text-muted text-xs">
            t2000 — The first bank account for AI agents.{" "}
            <a href="/" className="text-accent hover:underline">
              Home
            </a>{" "}
            ·{" "}
            <a href="/docs" className="text-accent hover:underline">
              Docs
            </a>{" "}
            ·{" "}
            <a
              href="https://github.com/mission69b/t2000"
              className="text-accent hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
