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
          <h1 className="text-3xl sm:text-5xl font-serif italic text-foreground tracking-tight leading-[1.15] mb-6">
            A banking app where you
            <br />
            talk to your{" "}
            <em className="italic text-accent">money.</em>
          </h1>
          <p className="text-sm sm:text-base text-muted font-mono leading-relaxed max-w-xl mb-10">
            Sign in with email. Save, earn yield, buy gift cards, mail
            postcards, search flights — all from one chat. No seed phrase, no
            gas, no credit card.
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
          <div className="flex flex-wrap gap-2">
            {[
              "No seed phrase",
              "No gas fees",
              "No credit card",
              "No wallet extension",
              "No app install",
              "No crypto jargon",
            ].map((item) => (
              <span
                key={item}
                className="text-xs font-mono text-muted border border-border rounded-full px-3.5 py-1.5"
              >
                {item}
              </span>
            ))}
          </div>
        </section>

        {/* What you can say */}
        <section className="mb-20 sm:mb-28">
          <h2 className="text-lg sm:text-xl font-serif italic text-foreground mb-8">
            Things you can say
          </h2>
          <div className="space-y-2">
            {[
              { q: "\"Coffee run\"", a: "Gift card, 15 seconds" },
              { q: "\"Am I getting the best yield?\"", a: "Compared every protocol" },
              { q: "\"Send mum a birthday postcard\"", a: "Printed, mailed — $1" },
              { q: "\"Find me flights to Tokyo\"", a: "Searched, compared, emailed" },
              { q: "\"Save my idle cash\"", a: "Deposited into 6.5% APY" },
            ].map((d) => (
              <div
                key={d.q}
                className="flex items-baseline justify-between gap-4 py-2.5 border-b border-border"
              >
                <span className="text-sm font-mono text-foreground">
                  {d.q}
                </span>
                <span className="text-xs font-mono text-muted shrink-0">
                  {d.a}
                </span>
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
              { num: "01", title: "Sign in with email", desc: "Google sign-in. Under 10 seconds. No wallet, no extension." },
              { num: "02", title: "Fund your account", desc: "Send USDC from any exchange or Sui wallet." },
              { num: "03", title: "Ask for anything", desc: "Tap a chip or type. The AI handles the rest." },
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

        {/* CTA */}
        <section className="text-center py-12 sm:py-16 border-t border-border">
          <h2 className="text-2xl sm:text-3xl font-serif italic text-foreground mb-6">
            Try it now
          </h2>
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
          <Link href="/privacy" className="hover:text-muted transition-colors">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-muted transition-colors">
            Terms
          </Link>
          <Link
            href="/disclaimer"
            className="hover:text-muted transition-colors"
          >
            Disclaimer
          </Link>
        </footer>
      </div>
    </main>
  );
}
