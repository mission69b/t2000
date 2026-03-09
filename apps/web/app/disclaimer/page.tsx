import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "t2000 — Disclaimer",
  description: "Risk disclaimer for the t2000 platform.",
};

export default function DisclaimerPage() {
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
            Disclaimer
          </h1>
          <p className="text-sm text-muted font-mono">
            Last updated: March 2026
          </p>
        </header>

        <div className="prose prose-invert prose-sm max-w-none space-y-8 text-muted leading-relaxed font-mono text-[13px]">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 text-amber-300/90">
            <strong className="text-amber-400">
              t2000 is beta software.
            </strong>{" "}
            This software is provided &quot;as is&quot; without warranty of any kind. Use
            at your own risk.
          </div>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              Risk of Loss
            </h2>
            <p>
              Interacting with blockchain protocols and DeFi applications
              involves substantial risk of loss. You could lose some or all of
              your funds due to smart contract bugs, protocol exploits, oracle
              failures, liquidation events, or other unforeseen circumstances.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              Smart Contract Risk
            </h2>
            <p>
              t2000 interacts with third-party smart contracts on the Sui
              blockchain (NAVI Protocol, Suilend, Cetus, and others). These
              contracts have been audited by their respective teams but are not
              guaranteed to be free of vulnerabilities. t2000 does not audit or
              guarantee the safety of any third-party protocol.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              No Guarantee of Returns
            </h2>
            <p>
              APY rates displayed are variable and based on real-time protocol
              data. They can change at any time and are not guaranteed. Past
              performance does not indicate future results.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              Key Management
            </h2>
            <p>
              t2000 generates and stores private keys locally on your device,
              encrypted with your PIN. If you lose your key file or forget your
              PIN, your funds are irrecoverable. There is no recovery mechanism,
              customer support hotline, or backup service. You are solely
              responsible for your keys.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              Beta Software
            </h2>
            <p>
              t2000 is currently in active development. Features may change,
              break, or be removed without notice. The software has not
              undergone a formal third-party security audit. An internal
              security review has been completed and is publicly available.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              Regulatory
            </h2>
            <p>
              t2000 does not provide financial services and is not a bank,
              custodian, exchange, or financial advisor. The use of terms like
              &quot;bank account,&quot; &quot;savings,&quot; and &quot;checking&quot; are metaphorical and
              describe the functional roles within the agent framework. Users
              are responsible for understanding and complying with the laws and
              regulations in their jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              Autonomous Agents
            </h2>
            <p>
              t2000 is designed for use by autonomous AI agents. Transactions
              executed by agents are final and irreversible. Ensure agent
              configurations and spending limits are set appropriately before
              granting agents access to funds.
            </p>
          </section>
        </div>

        <footer className="mt-16 pt-8 border-t border-border text-xs text-dim font-mono flex gap-6">
          <Link href="/terms" className="hover:text-muted transition-colors">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-muted transition-colors">
            Privacy
          </Link>
          <Link href="/security" className="hover:text-muted transition-colors">
            Security
          </Link>
        </footer>
      </div>
    </main>
  );
}
