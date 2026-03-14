import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "t2000 — Accounts",
  description:
    "Five accounts, one wallet. Checking, savings, credit, exchange, and investment — everything your AI agent needs to manage money.",
  openGraph: {
    title: "t2000 — Accounts",
    description:
      "Five accounts, one wallet. Everything your AI agent needs to manage money.",
    type: "website",
  },
};

const GITHUB_URL = "https://github.com/mission69b/t2000";

export default function AccountsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground relative z-10">
      <div className="fixed inset-0 z-0 pointer-events-none bg-[linear-gradient(rgba(0,214,143,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,214,143,0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6">
        {/* ── Back link ── */}
        <div className="pt-8 sm:pt-12">
          <Link href="/" className="inline-block text-muted hover:text-accent text-xs font-mono mb-8 transition-colors">
            ← t2000.ai
          </Link>
        </div>

        {/* ── Hero ── */}
        <section className="pb-16 sm:pb-24 border-b border-border">
          <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-6 flex items-center gap-3">
            <span className="block w-8 h-px bg-accent" />
            Accounts
          </div>

          <h1 className="font-serif text-[36px] sm:text-[clamp(42px,5vw,64px)] leading-[1.05] text-foreground mb-4 font-normal tracking-tight">
            Five accounts.
            <br />
            <em className="italic text-accent">One wallet.</em>
          </h1>

          <p className="font-mono text-[12px] sm:text-[13px] text-muted leading-[1.7] max-w-[520px] mt-5">
            Everything your agent needs to manage money — spend, save, borrow,
            swap, and invest. Each account has a clear purpose. They work
            together seamlessly.
          </p>

          <div className="flex items-center gap-3 sm:gap-5 mt-8 sm:mt-10 flex-wrap">
            <Link
              href="/docs"
              className="px-5 sm:px-7 py-3 sm:py-3.5 bg-accent text-background font-mono text-[11px] sm:text-xs font-semibold tracking-[0.1em] uppercase transition-all hover:bg-[#00f0a0] hover:shadow-[0_0_40px_var(--accent-glow)] hover:-translate-y-px"
            >
              Get started →
            </Link>
            <Link
              href="/demo"
              className="px-5 sm:px-7 py-3 sm:py-3.5 bg-transparent text-muted font-mono text-[11px] sm:text-xs tracking-[0.1em] uppercase border border-border-bright transition-all hover:text-foreground hover:border-foreground"
            >
              Live demos →
            </Link>
          </div>
        </section>

        {/* ── Checking ── */}
        <section className="py-16 sm:py-24 border-b border-border">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xl">⟳</span>
                <div className="text-[10px] tracking-[0.2em] uppercase text-accent">
                  Checking
                </div>
              </div>
              <h2 className="font-serif text-[28px] sm:text-[clamp(28px,3.5vw,42px)] font-normal leading-[1.1] text-foreground mb-6 tracking-tight">
                Your money,{" "}
                <em className="italic text-accent">ready to use.</em>
              </h2>
              <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[460px] mb-8">
                USDC that&apos;s immediately available. Send to anyone, fund
                other accounts, or let your agent spend it. This is your
                working balance.
              </p>

              <div className="space-y-4">
                {[
                  { cmd: "t2000 send 50 to alice", desc: "Send USDC to any address or contact" },
                  { cmd: "t2000 balance", desc: "See what's available across all accounts" },
                  { cmd: "t2000 deposit", desc: "Get your wallet address for funding" },
                ].map((step) => (
                  <div key={step.cmd} className="flex items-start gap-3">
                    <span className="text-accent text-xs mt-0.5">▸</span>
                    <div>
                      <code className="text-[11px] text-accent bg-accent-dim px-2 py-1 tracking-wide">
                        {step.cmd}
                      </code>
                      <div className="text-[11px] text-muted mt-1">{step.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-panel border border-border-bright rounded-sm overflow-hidden">
              <div className="px-4 py-3 bg-white/[0.02] border-b border-border text-[10px] text-muted tracking-[0.1em] uppercase">
                t2000 send
              </div>
              <pre className="px-5 py-5 text-[11px] sm:text-[12px] font-mono leading-[2] overflow-x-auto scrollbar-hide">
                <span className="text-foreground">❯ t2000 send 50 to alice</span>
                {"\n\n"}
                <span className="text-accent">  ✓ Sent $50.00 USDC → alice</span>
                {"\n"}
                <span className="text-muted">  Balance:  $150.00 USDC</span>
                {"\n"}
                <span className="text-muted">  Tx:  </span>
                <span className="text-accent/50">https://suiscan.xyz/mainnet/tx/0xa1b2...</span>
              </pre>
            </div>
          </div>
        </section>

        {/* ── Savings ── */}
        <section className="py-16 sm:py-24 border-b border-border">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xl">◈</span>
                <div className="text-[10px] tracking-[0.2em] uppercase text-accent">
                  Savings
                </div>
              </div>
              <h2 className="font-serif text-[28px] sm:text-[clamp(28px,3.5vw,42px)] font-normal leading-[1.1] text-foreground mb-6 tracking-tight">
                Idle money{" "}
                <em className="italic text-accent">earns yield.</em>
              </h2>
              <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[460px] mb-8">
                Deposit USDC into savings and earn variable APY automatically.
                Your funds are routed to the best rate across lending
                protocols. Withdraw anytime.
              </p>

              <div className="space-y-4">
                {[
                  { cmd: "t2000 save all", desc: "Deposit everything — gas handled automatically" },
                  { cmd: "t2000 withdraw 50", desc: "Pull funds back to checking instantly" },
                  { cmd: "t2000 rebalance", desc: "Optimize yield across protocols" },
                ].map((step) => (
                  <div key={step.cmd} className="flex items-start gap-3">
                    <span className="text-accent text-xs mt-0.5">▸</span>
                    <div>
                      <code className="text-[11px] text-accent bg-accent-dim px-2 py-1 tracking-wide">
                        {step.cmd}
                      </code>
                      <div className="text-[11px] text-muted mt-1">{step.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-panel border border-border-bright rounded-sm overflow-hidden">
              <div className="px-4 py-3 bg-white/[0.02] border-b border-border text-[10px] text-muted tracking-[0.1em] uppercase">
                t2000 save all
              </div>
              <pre className="px-5 py-5 text-[11px] sm:text-[12px] font-mono leading-[2] overflow-x-auto scrollbar-hide">
                <span className="text-foreground">❯ t2000 save all</span>
                {"\n\n"}
                <span className="text-accent">  ✓ Saved $99.00 USDC to best rate</span>
                {"\n"}
                <span className="text-accent">  ✓ Protocol fee: </span>
                <span className="text-muted">$0.099 (0.1%)</span>
                {"\n"}
                <span className="text-accent">  ✓ Current APY: </span>
                <span className="text-accent">4.86%</span>
                {"\n"}
                <span className="text-muted">  Savings balance:  $98.90 USDC</span>
                {"\n"}
                <span className="text-muted">  Tx:  </span>
                <span className="text-accent/50">https://suiscan.xyz/mainnet/tx/0x9f2c...</span>
              </pre>
            </div>
          </div>
        </section>

        {/* ── Credit ── */}
        <section className="py-16 sm:py-24 border-b border-border">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xl">◎</span>
                <div className="text-[10px] tracking-[0.2em] uppercase text-accent">
                  Credit
                </div>
              </div>
              <h2 className="font-serif text-[28px] sm:text-[clamp(28px,3.5vw,42px)] font-normal leading-[1.1] text-foreground mb-6 tracking-tight">
                Borrow{" "}
                <em className="italic text-accent">without selling.</em>
              </h2>
              <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[460px] mb-8">
                Need liquidity but don&apos;t want to withdraw? Borrow USDC
                against your savings. Health factor is enforced automatically
                — your agent can&apos;t over-borrow.
              </p>

              <div className="space-y-4">
                {[
                  { cmd: "t2000 borrow 40", desc: "Borrow against savings collateral" },
                  { cmd: "t2000 repay all", desc: "Repay including accrued interest" },
                  { cmd: "t2000 health", desc: "Check your health factor" },
                ].map((step) => (
                  <div key={step.cmd} className="flex items-start gap-3">
                    <span className="text-accent text-xs mt-0.5">▸</span>
                    <div>
                      <code className="text-[11px] text-accent bg-accent-dim px-2 py-1 tracking-wide">
                        {step.cmd}
                      </code>
                      <div className="text-[11px] text-muted mt-1">{step.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-panel border border-border-bright rounded-sm overflow-hidden">
              <div className="px-4 py-3 bg-white/[0.02] border-b border-border text-[10px] text-muted tracking-[0.1em] uppercase">
                t2000 borrow
              </div>
              <pre className="px-5 py-5 text-[11px] sm:text-[12px] font-mono leading-[2] overflow-x-auto scrollbar-hide">
                <span className="text-foreground">❯ t2000 borrow 40</span>
                {"\n\n"}
                <span className="text-accent">  ✓ Borrowed $40.00 USDC</span>
                {"\n"}
                <span className="text-muted">  Health Factor:  </span>
                <span className="text-accent">2.15</span>
                {"\n"}
                <span className="text-muted">  Tx:  </span>
                <span className="text-accent/50">https://suiscan.xyz/mainnet/tx/0xd5e6...</span>
                {"\n\n"}
                <span className="text-foreground">❯ t2000 repay all</span>
                {"\n\n"}
                <span className="text-accent">  ✓ Repaid $40.12 USDC</span>
                {"\n"}
                <span className="text-muted">  Remaining debt:  $0.00</span>
              </pre>
            </div>
          </div>
        </section>

        {/* ── Exchange ── */}
        <section className="py-16 sm:py-24 border-b border-border">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xl">⇌</span>
                <div className="text-[10px] tracking-[0.2em] uppercase text-accent">
                  Exchange
                </div>
              </div>
              <h2 className="font-serif text-[28px] sm:text-[clamp(28px,3.5vw,42px)] font-normal leading-[1.1] text-foreground mb-6 tracking-tight">
                Swap{" "}
                <em className="italic text-accent">anything.</em>
              </h2>
              <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[460px] mb-8">
                Convert between any supported tokens at market rates with
                on-chain slippage protection. Also used internally by the gas
                manager and rebalancer — your agent never gets stuck.
              </p>

              <div className="space-y-4">
                {[
                  { cmd: "t2000 exchange 5 USDC SUI", desc: "Swap USDC for SUI" },
                  { cmd: "t2000 exchange 2 SUI USDC", desc: "Swap SUI back to USDC" },
                ].map((step) => (
                  <div key={step.cmd} className="flex items-start gap-3">
                    <span className="text-accent text-xs mt-0.5">▸</span>
                    <div>
                      <code className="text-[11px] text-accent bg-accent-dim px-2 py-1 tracking-wide">
                        {step.cmd}
                      </code>
                      <div className="text-[11px] text-muted mt-1">{step.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-panel border border-border-bright rounded-sm overflow-hidden">
              <div className="px-4 py-3 bg-white/[0.02] border-b border-border text-[10px] text-muted tracking-[0.1em] uppercase">
                t2000 exchange
              </div>
              <pre className="px-5 py-5 text-[11px] sm:text-[12px] font-mono leading-[2] overflow-x-auto scrollbar-hide">
                <span className="text-foreground">❯ t2000 exchange 10 USDC SUI</span>
                {"\n\n"}
                <span className="text-accent">  ✓ Exchanged $10.00 USDC → 9.71 SUI</span>
                {"\n"}
                <span className="text-muted">  Rate:  1 SUI = $1.03</span>
                {"\n"}
                <span className="text-muted">  Slippage:  0.12%</span>
                {"\n"}
                <span className="text-muted">  Tx:  </span>
                <span className="text-accent/50">https://suiscan.xyz/mainnet/tx/0xf7a8...</span>
              </pre>
            </div>
          </div>
        </section>

        {/* ── Investment (link to invest page) ── */}
        <section className="py-16 sm:py-24 border-b border-border">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xl">◆</span>
                <div className="text-[10px] tracking-[0.2em] uppercase text-accent">
                  Investment
                </div>
              </div>
              <h2 className="font-serif text-[28px] sm:text-[clamp(28px,3.5vw,42px)] font-normal leading-[1.1] text-foreground mb-6 tracking-tight">
                Invest. Earn.{" "}
                <em className="italic text-accent">Grow.</em>
              </h2>
              <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[460px] mb-8">
                Build a portfolio across crypto and beyond. Earn yield while
                holding, diversify with strategies, and automate with DCA.
                Protected by default — investments can&apos;t be accidentally
                sent or swapped.
              </p>

              <Link
                href="/invest"
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-mono text-accent border border-accent/30 rounded transition-all hover:bg-accent-dim hover:shadow-[0_0_20px_rgba(0,214,143,0.08)]"
              >
                Explore investment account →
              </Link>
            </div>

            <div className="bg-panel border border-border-bright rounded-sm overflow-hidden">
              <div className="px-4 py-3 bg-white/[0.02] border-b border-border text-[10px] text-muted tracking-[0.1em] uppercase">
                t2000 portfolio
              </div>
              <pre className="px-5 py-5 text-[11px] sm:text-[12px] font-mono leading-[2] overflow-x-auto scrollbar-hide">
                <span className="text-foreground">Investment Portfolio</span>
                {"\n"}
                <span className="text-muted/30">─────────────────────────────────────────</span>
                {"\n"}
                <span className="text-foreground">SUI:</span>
                {"  "}
                <span className="text-muted">4.85</span>
                {"    "}
                <span className="text-muted">Avg: $1.03</span>
                {"  "}
                <span className="text-accent">+2.0%</span>
                {"  "}
                <span className="text-accent">2.61% APY</span>
                {"\n"}
                <span className="text-foreground">BTC:</span>
                {"  "}
                <span className="text-muted">0.00035</span>
                {"  "}
                <span className="text-muted">Avg: $71k</span>
                {"   "}
                <span className="text-accent">+1.4%</span>
                {"\n"}
                <span className="text-foreground">ETH:</span>
                {"  "}
                <span className="text-muted">0.00070</span>
                {"  "}
                <span className="text-muted">Avg: $2.1k</span>
                {"  "}
                <span className="text-accent">+0.9%</span>
                {"\n"}
                <span className="text-foreground">GOLD:</span>
                {" "}
                <span className="text-muted">0.01005</span>
                {"  "}
                <span className="text-muted">Avg: $4.9k</span>
                {"  "}
                <span className="text-accent">+1.2%</span>
                {"\n"}
                <span className="text-muted/30">─────────────────────────────────────────</span>
                {"\n"}
                <span className="text-muted">Total:</span>
                {"  "}
                <span className="text-foreground">$82.60</span>
                {"  "}
                <span className="text-accent">+$3.32 (+4.2%)</span>
              </pre>
            </div>
          </div>
        </section>

        {/* ── Claim Rewards ── */}
        <section className="py-16 sm:py-24 border-b border-border">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xl">✦</span>
                <div className="text-[10px] tracking-[0.2em] uppercase text-accent">
                  Rewards
                </div>
              </div>
              <h2 className="font-serif text-[28px] sm:text-[clamp(28px,3.5vw,42px)] font-normal leading-[1.1] text-foreground mb-6 tracking-tight">
                Claim. Convert.{" "}
                <em className="italic text-accent">Done.</em>
              </h2>
              <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[460px] mb-6">
                DeFi protocols reward you with various tokens — vSUI, sSUI,
                DEEP, and more. One command claims everything across all
                protocols and auto-converts to USDC. Zero friction.
              </p>
              <div className="space-y-3">
                {[
                  { step: "Positions accrue reward tokens automatically", icon: "◈" },
                  { step: "claim-rewards collects from all protocols at once", icon: "⟳" },
                  { step: "Reward tokens auto-convert to USDC", icon: "⇌" },
                ].map((item) => (
                  <div key={item.step} className="flex items-start gap-3">
                    <span className="text-accent text-xs mt-0.5">{item.icon}</span>
                    <span className="text-[12px] text-muted leading-[1.6]">{item.step}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-panel border border-border-bright rounded-sm overflow-hidden">
              <div className="px-4 py-3 bg-white/[0.02] border-b border-border text-[10px] text-muted tracking-[0.1em] uppercase">
                t2000 claim-rewards
              </div>
              <pre className="px-5 py-5 text-[11px] sm:text-[12px] font-mono leading-[2] overflow-x-auto scrollbar-hide">
                <span className="text-foreground">❯ t2000 positions</span>
                {"\n"}
                <span className="text-muted">  navi:  $5.30 USDC @ 4.09% APY  </span>
                <span className="text-accent">+rewards</span>
                {"\n"}
                <span className="text-muted">  suilend:  $6.15 SUI @ 2.61% APY  </span>
                <span className="text-accent">+rewards</span>
                {"\n\n"}
                <span className="text-foreground">❯ t2000 claim-rewards</span>
                {"\n\n"}
                <span className="text-accent">  ✓ Claimed and converted rewards to USDC</span>
                {"\n"}
                <span className="text-muted">  Received:  </span>
                <span className="text-accent">$0.42 USDC</span>
                {"\n"}
                <span className="text-muted">  Source:  navi, suilend</span>
                {"\n"}
                <span className="text-muted">  Tx:  </span>
                <span className="text-accent/50">https://suiscan.xyz/mainnet/tx/0xd9f2...</span>
              </pre>
            </div>
          </div>
        </section>

        {/* ── How they work together ── */}
        <section className="py-16 sm:py-24 border-b border-border">
          <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
            Together
          </div>
          <h2 className="font-serif text-[28px] sm:text-[clamp(28px,3.5vw,42px)] font-normal leading-[1.1] text-foreground mb-4 tracking-tight">
            They work as{" "}
            <em className="italic text-accent">one.</em>
          </h2>
          <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[520px] mb-10">
            Accounts aren&apos;t siloed — they flow into each other. Your AI
            can chain operations in a single atomic transaction.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                title: "Save all → auto gas",
                desc: "Saving everything? The gas manager converts $1 USDC to SUI first, then deposits the rest.",
              },
              {
                title: "Borrow → spend → repay",
                desc: "Need liquidity without withdrawing? Borrow from credit, spend from checking, repay when ready.",
              },
              {
                title: "Sell → save → earn",
                desc: "Sell an investment, route proceeds to savings, and start earning yield — all in one flow.",
              },
              {
                title: "Rebalance across protocols",
                desc: "Move savings to the highest-yield protocol automatically. Withdraw, swap if needed, deposit — one transaction.",
              },
              {
                title: "Investment locking",
                desc: "Invested assets are protected from send and swap. Only the investment account can access them.",
              },
              {
                title: "Unified balance",
                desc: "One command shows everything — checking, savings, credit, investment — with APY and P&L.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="border border-border-bright rounded-sm p-5 hover:border-accent/20 transition-colors"
              >
                <div className="text-xs font-mono text-foreground mb-2">
                  {item.title}
                </div>
                <p className="text-[11px] text-muted leading-[1.7]">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="py-16 sm:py-24 text-center">
          <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-5">
            Get started
          </div>
          <h2 className="font-serif text-[28px] sm:text-[clamp(28px,3.5vw,42px)] font-normal leading-[1.1] text-foreground mb-5 tracking-tight">
            Open all five accounts
            <br />
            <em className="italic text-accent">in 30 seconds.</em>
          </h2>
          <p className="text-muted text-[12px] sm:text-[13px] max-w-[460px] mx-auto mb-8 sm:mb-10 leading-[1.8]">
            One command. No KYC. Non-custodial. Your agent gets checking,
            savings, credit, exchange, and investment — ready to go.
          </p>

          <div className="flex justify-center gap-3 sm:gap-4 flex-wrap">
            <Link
              href="/docs"
              className="px-5 sm:px-7 py-3.5 sm:py-4 bg-accent text-background font-mono text-xs font-semibold tracking-[0.1em] uppercase transition-all hover:bg-[#00f0a0] hover:shadow-[0_0_40px_var(--accent-glow)] hover:-translate-y-px"
            >
              Read the docs →
            </Link>
            <Link
              href="/demo"
              className="px-5 sm:px-7 py-3.5 sm:py-4 bg-transparent text-muted font-mono text-xs tracking-[0.1em] uppercase border border-border-bright rounded-sm transition-all hover:text-foreground hover:border-foreground"
            >
              Live demos →
            </Link>
          </div>

          <div className="text-[10px] sm:text-[11px] text-muted/40 tracking-wide mt-6">
            MIT · Non-custodial · Sui mainnet
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="pt-8 pb-10 border-t border-border text-center">
          <p className="text-muted text-xs">
            t2000 — A bank account for the AI economy.{" "}
            <Link href="/" className="text-accent hover:underline">Home</Link>
            {" · "}
            <Link href="/invest" className="text-accent hover:underline">Invest</Link>
            {" · "}
            <Link href="/docs" className="text-accent hover:underline">Docs</Link>
            {" · "}
            <Link href="/demo" className="text-accent hover:underline">Demos</Link>
            {" · "}
            <a href={GITHUB_URL} className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">GitHub</a>
          </p>
        </footer>
      </div>
    </main>
  );
}
