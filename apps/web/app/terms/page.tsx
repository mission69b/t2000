import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "t2000 — Terms of Service",
  description: "Terms of Service for the t2000 platform.",
};

export default function TermsPage() {
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
            Terms of Service
          </h1>
          <p className="text-sm text-muted font-mono">
            Last updated: March 2026
          </p>
        </header>

        <div className="prose prose-invert prose-sm max-w-none space-y-8 text-muted leading-relaxed font-mono text-[13px]">
          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              1. Acceptance
            </h2>
            <p>
              By using t2000 software (&quot;the Service&quot;), including the CLI, SDK,
              API, and website, you agree to these Terms of Service. If you do
              not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              2. Description of Service
            </h2>
            <p>
              t2000 provides open-source tools for AI agents to interact with
              the Sui blockchain. This includes sending tokens, earning yield
              through DeFi protocols, swapping assets, and making payments. The
              Service is provided as-is and is currently in{" "}
              <strong className="text-amber-400">beta</strong>.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              3. Non-Custodial
            </h2>
            <p>
              t2000 is entirely non-custodial. Private keys are generated and
              encrypted locally on your device. We never have access to your
              keys, funds, or wallet. You are solely responsible for securing
              your keys and PIN.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              4. No Financial Advice
            </h2>
            <p>
              Nothing provided by the Service constitutes financial, investment,
              or legal advice. DeFi interactions (lending, borrowing, swapping)
              carry inherent risks including but not limited to smart contract
              risk, impermanent loss, and liquidation. You are solely responsible
              for evaluating these risks.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              5. Third-Party Protocols
            </h2>
            <p>
              t2000 integrates with third-party DeFi protocols (NAVI, Suilend,
              Cetus, and others) via their on-chain smart contracts. We do not
              control, audit, or guarantee the security of these protocols. Use
              of third-party protocols is at your own risk.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              6. Protocol Fees
            </h2>
            <p>
              t2000 may collect a small protocol fee (currently 0.1%) on certain
              operations such as deposits. Fees are collected on-chain via
              auditable smart contracts. Fee changes are subject to a 7-day
              on-chain timelock with a hard cap of 5%.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              7. Gas Sponsorship
            </h2>
            <p>
              t2000 may sponsor gas fees for new users at our discretion. This
              is a convenience feature and may be modified, rate-limited, or
              discontinued at any time without notice.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              8. Beta Software
            </h2>
            <p>
              t2000 is currently in beta. The software may contain bugs, errors,
              or vulnerabilities. We do not guarantee the software will function
              without interruption or error. Use in production with significant
              funds is at your own risk.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              9. Limitation of Liability
            </h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, t2000 AND ITS
              CONTRIBUTORS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
              SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF
              PROFITS, DATA, OR FUNDS, WHETHER IN CONTRACT, TORT, OR OTHERWISE,
              ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE SERVICE.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              10. Open Source
            </h2>
            <p>
              t2000 is open-source software licensed under the MIT License. The
              source code is available at{" "}
              <a
                href="https://github.com/mission69b/t2000"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                github.com/mission69b/t2000
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              11. Changes
            </h2>
            <p>
              We may update these Terms at any time. Continued use of the
              Service after changes constitutes acceptance of the updated Terms.
            </p>
          </section>
        </div>

        <footer className="mt-16 pt-8 border-t border-border text-xs text-dim font-mono flex gap-6">
          <Link href="/privacy" className="hover:text-muted transition-colors">
            Privacy
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
