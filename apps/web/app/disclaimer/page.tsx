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
            Last updated: February 2026
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
              AI Assistant Accuracy
            </h2>
            <p>
              The AI assistant is powered by large language models that can
              produce incorrect, incomplete, or misleading information. This
              includes but is not limited to:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>Yield comparisons and rebalancing recommendations</li>
              <li>Risk assessments and health factor analysis</li>
              <li>Price predictions or market commentary</li>
              <li>Tax or regulatory interpretations</li>
              <li>Gift card availability and pricing</li>
              <li>Flight search results and pricing</li>
            </ul>
            <p className="mt-2">
              Always verify critical financial information independently before
              making decisions. The AI confirms actions before executing them,
              but you bear full responsibility for approving transactions.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              Authentication and Key Management
            </h2>
            <p>
              <strong className="text-foreground">Consumer web app:</strong>{" "}
              Uses zkLogin via Google sign-in, powered by Mysten Labs Enoki.
              Your wallet is derived from your Google session. If you lose
              access to your Google account, you may lose access to your
              wallet. t2000 cannot recover funds on your behalf.
            </p>
            <p className="mt-2">
              <strong className="text-foreground">CLI and SDK:</strong>{" "}
              Private keys are generated and stored locally on your device,
              encrypted with your PIN. If you lose your key file or forget your
              PIN, your funds are irrecoverable. There is no recovery mechanism.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              Service Delivery
            </h2>
            <p>
              t2000 connects you to third-party services. We cannot guarantee:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>Gift card availability in your region or for specific brands</li>
              <li>Physical mail delivery times or successful delivery</li>
              <li>Merchandise print quality or shipping accuracy</li>
              <li>Flight pricing accuracy (prices shown are from search APIs and may change)</li>
              <li>Upstream service availability or uptime</li>
            </ul>
            <p className="mt-2">
              Service payments are on-chain and final. If a third-party service
              fails after payment, contact{" "}
              <span className="text-foreground">support@t2000.ai</span>.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              Tax Implications
            </h2>
            <p>
              Using cryptocurrency (including stablecoins like USDC) to purchase
              goods and services may constitute a taxable disposal event in your
              jurisdiction, even if no capital gain is realized. t2000 does not
              provide tax advice, does not generate tax reports, and does not
              report transactions to tax authorities. Consult a qualified tax
              professional regarding your obligations.
            </p>
          </section>

          <section>
            <h2 className="text-foreground text-lg font-serif italic mb-3">
              Regulatory
            </h2>
            <p>
              t2000 does not provide financial services and is not a bank,
              custodian, exchange, or financial advisor. The use of terms like
              &quot;bank account,&quot; &quot;savings,&quot; and &quot;cash&quot; are functional labels within
              the app and describe interactions with DeFi protocols, not
              traditional banking products. Deposits are not insured. Users are
              responsible for understanding and complying with the laws and
              regulations in their jurisdiction.
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
