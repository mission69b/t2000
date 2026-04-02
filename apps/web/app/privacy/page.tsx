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
            className="inline-block text-muted hover:text-accent font-mono text-[10px] tracking-[0.12em] uppercase mb-8 transition-colors"
          >
            ← t2000.ai
          </Link>
          <h1 className="text-3xl sm:text-4xl font-serif italic text-foreground tracking-tight mb-2">
            Privacy Policy
          </h1>
          <p className="text-sm text-muted font-mono">
            Last updated: February 2026
          </p>
        </header>

        <div className="prose prose-invert prose-sm max-w-none space-y-8 text-muted leading-relaxed text-[13.5px]">
          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              Overview
            </h2>
            <p>
              t2000 is designed with privacy as a core principle. We collect
              minimal data, operate non-custodially, and never store your
              private keys. This policy covers all t2000 surfaces: the consumer
              web app, CLI, SDK, MCP tools, and the t2000.ai website.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              What We Collect
            </h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong className="text-foreground">Email address</strong> —
                Collected via Google sign-in (zkLogin) for authentication in the
                consumer app. Also used as the delivery address for services
                like flight search results.
              </li>
              <li>
                <strong className="text-foreground">Sui wallet addresses</strong>{" "}
                — Generated via zkLogin (Mysten Labs Enoki). These are public
                blockchain addresses derived from your Google session.
              </li>
              <li>
                <strong className="text-foreground">Transaction digests</strong>{" "}
                — On-chain transaction IDs recorded for payment verification and
                service delivery. These are public blockchain data.
              </li>
              <li>
                <strong className="text-foreground">
                  Timezone and browser locale
                </strong>{" "}
                — Used to detect your country for regional service availability.
                Not stored permanently.
              </li>
              <li>
                <strong className="text-foreground">Chat messages</strong> —
                Sent to Anthropic&apos;s API for AI processing during your session.
                Not stored by t2000 after your session ends. Subject to{" "}
                <a
                  href="https://www.anthropic.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  Anthropic&apos;s privacy policy
                </a>
                .
              </li>
              <li>
                <strong className="text-foreground">
                  Protocol usage metrics
                </strong>{" "}
                — Aggregate counts of operations for the public stats dashboard.
                No individual user data is exposed.
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
              What We Do Not Collect
            </h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Private keys (managed by zkLogin/Enoki, never exposed to t2000)</li>
              <li>Passwords or PINs</li>
              <li>Government-issued identity documents</li>
              <li>Financial account numbers or credit card details</li>
              <li>IP addresses (not stored permanently)</li>
              <li>Browser cookies for tracking</li>
            </ul>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              Data Shared with Third Parties
            </h2>
            <p>
              When you use t2000 services, certain data is shared with upstream
              providers to fulfill your request. We do not sell or transfer data
              for advertising or profiling purposes.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>
                <strong className="text-foreground">Anthropic</strong> — Chat
                messages for AI processing
              </li>
              <li>
                <strong className="text-foreground">
                  Mysten Labs (Enoki)
                </strong>{" "}
                — Authentication and gas sponsorship
              </li>
              <li>
                <strong className="text-foreground">Google</strong> — OAuth
                sign-in via zkLogin
              </li>
              <li>
                <strong className="text-foreground">Lob</strong> — Recipient
                name and physical address for postcard and letter delivery
              </li>
              <li>
                <strong className="text-foreground">Printful</strong> —
                Shipping address for merchandise orders
              </li>
              <li>
                <strong className="text-foreground">SerpAPI</strong> — Search
                queries for flight results
              </li>
              <li>
                <strong className="text-foreground">
                  DeFi protocols (NAVI)
                </strong>{" "}
                — Via on-chain smart contracts (public blockchain data only)
              </li>
              <li>
                <strong className="text-foreground">Sui RPC nodes</strong> —
                For blockchain interaction
              </li>
              <li>
                <strong className="text-foreground">Vercel</strong> — Website
                and app hosting, analytics
              </li>
              <li>
                <strong className="text-foreground">Neon</strong> — Database
                hosting for aggregate protocol data
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              Data Storage
            </h2>
            <p>
              Aggregate protocol data (transaction summaries, fee records,
              service delivery logs) is stored in a PostgreSQL database hosted
              on Neon. Chat messages are processed in-memory during your session
              and are not persisted by t2000. Physical addresses provided for
              mail services are passed directly to the delivery provider and not
              stored by t2000.
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
              Open Source
            </h2>
            <p>
              t2000 is open source. You can verify exactly what data is
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
