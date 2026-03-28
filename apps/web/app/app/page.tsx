import type { Metadata } from "next";
import Link from "next/link";

const APP_URL = "https://app.t2000.ai";

export const metadata: Metadata = {
  title: "t2000 — The App",
  description:
    "A banking app where you talk to your money. No seed phrase. No gas fees. Sign in with email.",
  openGraph: {
    title: "t2000 — The App",
    description:
      "A banking app where you talk to your money. No seed phrase. No gas fees. Sign in with email.",
    type: "website",
  },
};

const FEATURES = [
  {
    icon: "◈",
    title: "Save & earn yield",
    desc: "Idle funds earn 2–8% APY automatically. Best rate across protocols.",
  },
  {
    icon: "⇌",
    title: "Send, swap & invest",
    desc: "Move money, swap tokens, buy crypto and gold. All by asking.",
  },
  {
    icon: "◎",
    title: "Borrow instantly",
    desc: "Credit against your savings. No paperwork. Repay anytime.",
  },
  {
    icon: "⟳",
    title: "Rebalance in one tap",
    desc: "AI compares rates across every protocol. Switch with one confirmation.",
  },
  {
    icon: "✦",
    title: "Buy real things",
    desc: "Gift cards, physical mail, flight searches, translations — 41 services.",
  },
  {
    icon: "◆",
    title: "Risk monitoring",
    desc: "Health factor, liquidation thresholds, debt exposure — always watching.",
  },
];

const ZERO_LIST = [
  "No seed phrase",
  "No private key",
  "No wallet extension",
  "No gas fees",
  "No credit card",
  "No API keys",
  "No app install",
  "No crypto jargon",
];

export default function AppPage() {
  return (
    <main className="min-h-screen bg-background text-foreground relative z-10">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        {/* Nav */}
        <nav className="flex items-center justify-between mb-16 sm:mb-24">
          <Link
            href="/"
            className="text-muted hover:text-accent text-xs font-mono transition-colors"
          >
            ← t2000.ai
          </Link>
          <a
            href={APP_URL}
            className="text-xs font-mono text-accent hover:text-foreground transition-colors"
          >
            Open app →
          </a>
        </nav>

        {/* Hero */}
        <section className="mb-20 sm:mb-28">
          <p className="text-xs font-mono text-accent mb-4 tracking-wider uppercase">
            Consumer app
          </p>
          <h1 className="text-3xl sm:text-5xl font-serif italic text-foreground tracking-tight leading-[1.15] mb-6">
            A banking app where you
            <br />
            talk to your money.
          </h1>
          <p className="text-sm sm:text-base text-muted font-mono leading-relaxed max-w-xl mb-10">
            Sign in with your email. Save, send, invest, borrow, buy gift cards,
            mail postcards, search flights — all from a single chat interface.
            Your AI handles everything.
          </p>
          <a
            href={APP_URL}
            className="inline-flex items-center gap-2 bg-accent text-background font-mono text-sm font-medium px-6 py-3 rounded-md hover:brightness-110 transition-all"
          >
            Sign in with email
            <span className="text-xs opacity-60">— free</span>
          </a>
        </section>

        {/* Zero friction */}
        <section className="mb-20 sm:mb-28">
          <h2 className="text-lg sm:text-xl font-serif italic text-foreground mb-8">
            Zero friction
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {ZERO_LIST.map((item) => (
              <div
                key={item}
                className="border border-border rounded-lg px-4 py-3 text-center"
              >
                <span className="text-xs font-mono text-accent">✓</span>
                <p className="text-xs font-mono text-muted mt-1">{item}</p>
              </div>
            ))}
          </div>
          <p className="text-xs font-mono text-dim mt-6 leading-relaxed">
            Powered by Sui. Gas is sponsored — you never pay network fees. No
            blockchain knowledge needed.
          </p>
        </section>

        {/* Features */}
        <section className="mb-20 sm:mb-28">
          <h2 className="text-lg sm:text-xl font-serif italic text-foreground mb-8">
            What your AI can do
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="border border-border rounded-lg p-5 hover:border-border-bright transition-colors"
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-accent text-sm">{f.icon}</span>
                  <h3 className="text-sm font-mono text-foreground font-medium">
                    {f.title}
                  </h3>
                </div>
                <p className="text-xs font-mono text-muted leading-relaxed">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mb-20 sm:mb-28">
          <h2 className="text-lg sm:text-xl font-serif italic text-foreground mb-8">
            How it works
          </h2>
          <div className="space-y-6">
            {[
              {
                num: "01",
                title: "Sign in",
                desc: "Email only. Under 10 seconds. No wallet, no extension, no seed phrase.",
              },
              {
                num: "02",
                title: "Fund",
                desc: "Send USDC to your address from any Sui wallet or exchange.",
              },
              {
                num: "03",
                title: "Talk",
                desc: "Tap a chip or type what you need. The AI finds the best way to do it.",
              },
              {
                num: "04",
                title: "Confirm",
                desc: "Every transaction shows you exactly what happens and what it costs. One tap.",
              },
            ].map((step) => (
              <div key={step.num} className="flex gap-4 items-start">
                <span className="text-xs font-mono text-accent mt-0.5 shrink-0">
                  {step.num}
                </span>
                <div>
                  <h3 className="text-sm font-mono text-foreground font-medium mb-1">
                    {step.title}
                  </h3>
                  <p className="text-xs font-mono text-muted leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Demos */}
        <section className="mb-20 sm:mb-28">
          <h2 className="text-lg sm:text-xl font-serif italic text-foreground mb-8">
            Real things people said this week
          </h2>
          <div className="space-y-3">
            {[
              { q: '"I\'m hungry"', a: "→ $25 Uber Eats gift card. 15 seconds." },
              {
                q: '"Send mum a birthday postcard"',
                a: "→ Physical postcard, printed and mailed. $1.",
              },
              {
                q: '"Am I getting the best yield?"',
                a: "→ Compared every protocol in 2 seconds. Already optimal.",
              },
              {
                q: '"Find me flights to Tokyo"',
                a: "→ Searched, compared, emailed. Under a minute.",
              },
              {
                q: '"Complain to my ISP"',
                a: "→ Wrote a formal letter and physically posted it. $1.50.",
              },
            ].map((d) => (
              <div
                key={d.q}
                className="border border-border rounded-lg px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3"
              >
                <span className="text-sm font-mono text-foreground font-medium shrink-0">
                  {d.q}
                </span>
                <span className="text-xs font-mono text-muted">{d.a}</span>
              </div>
            ))}
          </div>
          <p className="text-xs font-mono text-dim mt-4">
            41 services. 90 endpoints. All paid from your balance — no credit
            card, no API keys, no signups.
          </p>
        </section>

        {/* CTA */}
        <section className="text-center py-12 sm:py-16 border-t border-border">
          <h2 className="text-2xl sm:text-3xl font-serif italic text-foreground mb-3">
            Try it now
          </h2>
          <p className="text-sm font-mono text-muted mb-8">
            Sign in with email. Free. Works on any device.
          </p>
          <a
            href={APP_URL}
            className="inline-flex items-center gap-2 bg-accent text-background font-mono text-sm font-medium px-8 py-3.5 rounded-md hover:brightness-110 transition-all"
          >
            Open t2000
          </a>
        </section>

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t border-border text-xs text-dim font-mono flex flex-wrap gap-6">
          <Link href="/" className="hover:text-muted transition-colors">
            Home
          </Link>
          <Link href="/docs" className="hover:text-muted transition-colors">
            Docs
          </Link>
          <Link href="/demo" className="hover:text-muted transition-colors">
            Demo
          </Link>
          <Link href="/privacy" className="hover:text-muted transition-colors">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-muted transition-colors">
            Terms
          </Link>
        </footer>
      </div>
    </main>
  );
}
