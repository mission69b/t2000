import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "t2000 — Privacy Policy",
  description: "Privacy policy for the t2000 platform.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background text-foreground relative z-10">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <header className="mb-12">
          <Link
            href="/"
            className="inline-block text-muted hover:text-accent text-xs font-mono mb-8 transition-colors"
          >
            ← t2000.ai
          </Link>
          <h1 className="text-3xl sm:text-4xl font-serif italic text-foreground tracking-tight mb-2">
            Privacy Policy
          </h1>
          <p className="text-sm text-muted font-mono">
            Last updated: March 2026
          </p>
        </header>

        <div className="prose prose-invert prose-sm max-w-none space-y-8 text-muted leading-relaxed font-mono text-[13px]">
          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              Overview
            </h2>
            <p>
              t2000 is designed with privacy as a core principle. We collect
              minimal data and never have access to your private keys or funds.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              What We Do Not Collect
            </h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Private keys (generated and stored locally on your device)</li>
              <li>PINs or passwords</li>
              <li>Personal identity information</li>
              <li>IP addresses (not stored permanently)</li>
              <li>Browser cookies for tracking</li>
            </ul>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              What We Collect
            </h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong className="text-foreground">
                  Sui wallet addresses
                </strong>{" "}
                — Registered when an agent initializes via the gas sponsorship
                endpoint. These are public blockchain addresses.
              </li>
              <li>
                <strong className="text-foreground">
                  Transaction digests
                </strong>{" "}
                — On-chain transaction IDs recorded for fee accounting and
                protocol analytics. These are public blockchain data.
              </li>
              <li>
                <strong className="text-foreground">
                  Protocol usage metrics
                </strong>{" "}
                — Aggregate counts of operations (saves, withdrawals, swaps)
                for the public stats dashboard. No individual user data is
                exposed.
              </li>
              <li>
                <strong className="text-foreground">Website analytics</strong>{" "}
                — We use{" "}
                <a
                  href="https://vercel.com/analytics"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  Vercel Analytics
                </a>{" "}
                for anonymous, cookieless page view analytics on t2000.ai.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              Data Storage
            </h2>
            <p>
              Aggregate protocol data (agent registrations, transaction
              summaries, fee records) is stored in a PostgreSQL database hosted
              on Neon. No personal information is stored.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              Blockchain Data
            </h2>
            <p>
              All transactions executed through t2000 are recorded on the Sui
              blockchain, which is a public, immutable ledger. Transaction data
              including wallet addresses, amounts, and timestamps are publicly
              visible. This is inherent to blockchain technology and not within
              our control.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              Third Parties
            </h2>
            <p>
              We do not sell, share, or transfer any data to third parties. The
              only third-party services we interact with are:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>Sui RPC nodes (for blockchain interaction)</li>
              <li>DeFi protocols (NAVI, Suilend, Cetus — via on-chain contracts)</li>
              <li>Vercel (website hosting and analytics)</li>
              <li>Neon (database hosting)</li>
              <li>npm (package distribution)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              Open Source
            </h2>
            <p>
              t2000 is fully open source. You can verify exactly what data is
              collected and how it is used by reviewing the{" "}
              <a
                href="https://github.com/mission69b/t2000"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                source code
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              Contact
            </h2>
            <p>
              For privacy-related questions, reach out at{" "}
              <span className="text-foreground">security@t2000.ai</span>.
            </p>
          </section>
        </div>

        <footer className="mt-16 pt-8 border-t border-border text-xs text-dim font-mono flex gap-6">
          <Link href="/terms" className="hover:text-muted transition-colors">
            Terms
          </Link>
          <Link
            href="/disclaimer"
            className="hover:text-muted transition-colors"
          >
            Disclaimer
          </Link>
          <Link href="/security" className="hover:text-muted transition-colors">
            Security
          </Link>
        </footer>
      </div>
    </main>
  );
}
