import type { Metadata } from "next";
import Link from "next/link";
import { InvestShowcase } from "./InvestShowcase";

export const metadata: Metadata = {
  title: "t2000 — Investment Account",
  description:
    "Buy SUI, BTC, and ETH with dollar-denominated commands. Portfolio tracking with cost-basis P&L, lending yield on holdings, strategies, and DCA.",
  openGraph: {
    title: "t2000 — Investment Account",
    description:
      "Buy SUI, BTC, and ETH. Earn yield while holding. Strategies + DCA. Cost-basis P&L tracking.",
    type: "website",
  },
};

const GITHUB_URL = "https://github.com/mission69b/t2000";

const ASSETS = [
  { symbol: "SUI", name: "Sui native", desc: "The Layer 1 powering t2000", icon: "◆" },
  { symbol: "BTC", name: "Bitcoin via SuiBridge", desc: "The original cryptocurrency", icon: "₿" },
  { symbol: "ETH", name: "Ethereum via SuiBridge", desc: "The smart contract pioneer", icon: "Ξ" },
];

export default function InvestPage() {
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
            Investment Account
          </div>

          <h1 className="font-serif text-[36px] sm:text-[clamp(42px,5vw,64px)] leading-[1.05] text-foreground mb-4 font-normal tracking-tight">
            Your agent builds
            <br />
            a <em className="italic text-accent">portfolio.</em>
          </h1>

          <p className="font-mono text-[12px] sm:text-[13px] text-muted leading-[1.7] max-w-[520px] mt-5">
            Buy SUI, BTC, and ETH. Earn lending yield while holding. Track
            cost-basis P&L. Use strategies for diversified allocation. Set up DCA
            for automated investing. All from natural language or CLI.
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

        {/* ── Supported Assets ── */}
        <section className="py-16 sm:py-24 border-b border-border">
          <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
            Supported Assets
          </div>
          <h2 className="font-serif text-[28px] sm:text-[clamp(28px,3.5vw,42px)] font-normal leading-[1.1] text-foreground mb-10 sm:mb-14 tracking-tight">
            Three assets.{" "}
            <em className="italic text-accent">Dollar-denominated.</em>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border border border-border">
            {ASSETS.map((asset) => (
              <div
                key={asset.symbol}
                className="bg-panel p-7 sm:p-9 relative overflow-hidden group transition-colors hover:bg-[rgba(0,214,143,0.03)]"
              >
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-accent scale-x-0 origin-left transition-transform duration-400 group-hover:scale-x-100" />
                <span className="text-[28px] block mb-4">{asset.icon}</span>
                <div className="text-lg font-medium text-foreground mb-1 tracking-tight">
                  {asset.symbol}
                </div>
                <div className="text-[11px] text-muted tracking-[0.05em] uppercase mb-4">
                  {asset.name}
                </div>
                <p className="text-xs text-muted leading-[1.7]">{asset.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── See it in action (interactive demos) ── */}
        <InvestShowcase />

        {/* ── Yield on Investments ── */}
        <section className="py-16 sm:py-24 border-b border-border">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div>
              <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
                Yield
              </div>
              <h2 className="font-serif text-[28px] sm:text-[clamp(28px,3.5vw,42px)] font-normal leading-[1.1] text-foreground mb-6 tracking-tight">
                Earn yield.
                <br />
                <em className="italic text-accent">Keep exposure.</em>
              </h2>
              <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[460px] mb-8">
                Deposit invested SUI or ETH into NAVI or Suilend for lending
                yield. You keep full price exposure — sell anytime.
                Auto-withdraw on sell brings funds back before the swap.
              </p>

              <div className="space-y-4">
                {[
                  { cmd: "t2000 invest earn SUI", desc: "Deposit into best-rate lending" },
                  { cmd: "t2000 invest unearn SUI", desc: "Withdraw from lending, keep invested" },
                  { cmd: "t2000 invest sell all SUI", desc: "Sell — auto-withdraws from lending first" },
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
                t2000 portfolio — with yield
              </div>
              <pre className="px-5 py-5 text-[11px] sm:text-[12px] font-mono leading-[2] overflow-x-auto scrollbar-hide">
                <span className="text-foreground">Investment Portfolio</span>
                {"\n"}
                <span className="text-muted/30">─────────────────────────────────────────────</span>
                {"\n"}
                <span className="text-foreground">SUI:</span>
                {"  "}
                <span className="text-muted">4.8500</span>
                {"    "}
                <span className="text-muted">Avg: $1.03</span>
                {"    "}
                <span className="text-muted">Now: $1.05</span>
                {"    "}
                <span className="text-accent">+$0.10 (+2.0%)</span>
                {"    "}
                <span className="text-accent">2.61% APY</span>
                {"\n\n"}
                <span className="text-muted">Total invested:</span>
                {"  "}
                <span className="text-foreground">$5.00</span>
                {"\n"}
                <span className="text-muted">Current value:</span>
                {"  "}
                <span className="text-foreground">$5.09</span>
                {"\n"}
                <span className="text-accent">Unrealized P&L:</span>
                {"  "}
                <span className="text-accent">+$0.10 (+2.0%)</span>
              </pre>
            </div>
          </div>
        </section>

        {/* ── Strategies & DCA ── */}
        <section className="py-16 sm:py-24 border-b border-border">
          <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-6 flex items-center gap-3">
            <span className="block w-8 h-px bg-accent" />
            Strategies + Auto-Invest
          </div>

          <h2 className="font-serif text-[28px] sm:text-[36px] leading-[1.1] text-foreground mb-4 font-normal">
            Themed allocations.{" "}
            <em className="italic text-accent">One command.</em>
          </h2>

          <p className="font-mono text-[12px] text-muted leading-[1.7] max-w-[520px] mb-10">
            Pick a strategy, set an amount — one atomic transaction buys
            multiple assets. Dollar-cost average with weekly or monthly
            recurring purchases.
          </p>

          <div className="grid sm:grid-cols-3 gap-6 mb-12">
            {[
              { name: "bluechip", alloc: "BTC 40% · ETH 40% · SUI 20%", desc: "Large-cap crypto index" },
              { name: "layer1", alloc: "ETH 50% · SUI 50%", desc: "Smart contract platforms" },
              { name: "sui-heavy", alloc: "SUI 70% · BTC 15% · ETH 15%", desc: "Sui-weighted portfolio" },
            ].map((s) => (
              <div key={s.name} className="border border-border-bright rounded-lg p-5 hover:border-accent/30 transition-colors">
                <div className="font-mono text-sm text-accent mb-1">{s.name}</div>
                <div className="font-mono text-[11px] text-foreground/70 mb-2">{s.alloc}</div>
                <div className="font-mono text-[11px] text-muted/60">{s.desc}</div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-muted mb-6">
            Create custom strategies with{" "}
            <code className="text-accent bg-accent-dim px-1.5 py-0.5">
              t2000 invest strategy create myplan SUI:60 BTC:25 ETH:15
            </code>
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-panel border border-border-bright rounded-sm overflow-hidden">
              <div className="px-4 py-3 bg-white/[0.02] border-b border-border text-[10px] text-muted tracking-[0.1em] uppercase">
                Strategy buy — one atomic transaction
              </div>
              <pre className="px-5 py-5 text-[11px] sm:text-[12px] font-mono leading-[1.9] overflow-x-auto scrollbar-hide">
                <span className="text-foreground">❯ t2000 invest strategy buy bluechip 100</span>
                {"\n\n"}
                <span className="text-accent">  ✓ Invested $100.00 in bluechip strategy</span>
                {"\n"}
                <span className="text-muted">  BTC:  0.00056000 @ $71,326</span>
                {"\n"}
                <span className="text-muted">  ETH:  0.01890 @ $2,119</span>
                {"\n"}
                <span className="text-muted">  SUI:  19.4170 @ $1.03</span>
                {"\n"}
                <span className="text-muted">  Total invested:  $100.00</span>
              </pre>
            </div>
            <div className="bg-panel border border-border-bright rounded-sm overflow-hidden">
              <div className="px-4 py-3 bg-white/[0.02] border-b border-border text-[10px] text-muted tracking-[0.1em] uppercase">
                Auto-invest — set and forget
              </div>
              <pre className="px-5 py-5 text-[11px] sm:text-[12px] font-mono leading-[1.9] overflow-x-auto scrollbar-hide">
                <span className="text-foreground">❯ t2000 invest auto setup 50 weekly bluechip</span>
                {"\n\n"}
                <span className="text-accent">  ✓ Auto-invest created: $50.00 weekly → bluechip</span>
                {"\n"}
                <span className="text-muted">  Next run:  Feb 24, 2026</span>
                {"\n\n"}
                <span className="text-foreground">❯ t2000 invest auto status</span>
                {"\n\n"}
                <span className="text-muted">  #1:  $50.00 weekly → bluechip  </span>
                <span className="text-accent">active</span>
                {"\n"}
                <span className="text-muted">      Next: Feb 24 · Runs: 0 · Total: $0.00</span>
              </pre>
            </div>
          </div>
        </section>

        {/* ── Investment Locking ── */}
        <section className="py-16 sm:py-24 border-b border-border">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div>
              <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
                Safety
              </div>
              <h2 className="font-serif text-[28px] sm:text-[clamp(28px,3.5vw,42px)] font-normal leading-[1.1] text-foreground mb-6 tracking-tight">
                Investment{" "}
                <em className="italic text-accent">locking guard.</em>
              </h2>
              <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[460px]">
                Invested assets are locked. Your agent can&apos;t accidentally
                send or swap them during routine operations. To access value,
                sell back to USDC through the investment account.
              </p>
            </div>

            <div className="bg-panel border border-border-bright rounded-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center gap-2">
                <span className="text-[11px] tracking-[0.1em] text-muted uppercase">
                  Guard behavior
                </span>
              </div>
              <div className="p-5 space-y-3">
                {[
                  { icon: "✗", ok: false, label: "t2000 send 1 SUI to 0x...", status: "Blocked — INVESTMENT_LOCKED" },
                  { icon: "✗", ok: false, label: "t2000 exchange 1 SUI USDC", status: "Blocked — use invest sell" },
                  { icon: "✓", ok: true, label: "t2000 invest sell all SUI", status: "Allowed" },
                  { icon: "✓", ok: true, label: "t2000 invest earn SUI", status: "Allowed" },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-3 text-xs">
                    <span className={`font-mono ${row.ok ? "text-accent" : "text-red-400"}`}>
                      {row.icon}
                    </span>
                    <code className="text-[11px] text-muted flex-1">{row.label}</code>
                    <span className={`text-[10px] tracking-[0.06em] ${row.ok ? "text-accent" : "text-red-400"}`}>
                      {row.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Unified Balance ── */}
        <section className="py-16 sm:py-24 border-b border-border">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div>
              <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
                Unified Balance
              </div>
              <h2 className="font-serif text-[28px] sm:text-[clamp(28px,3.5vw,42px)] font-normal leading-[1.1] text-foreground mb-6 tracking-tight">
                Four accounts.{" "}
                <em className="italic text-accent">One command.</em>
              </h2>
              <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[460px]">
                Checking, savings, credit, and investment — your full financial
                picture in a single command. Investment value with P&L
                percentage, credit with interest rate.
              </p>
            </div>

            <div className="bg-panel border border-border-bright rounded-sm overflow-hidden">
              <div className="px-4 py-3 bg-white/[0.02] border-b border-border text-[10px] text-muted tracking-[0.1em] uppercase">
                t2000 balance
              </div>
              <pre className="px-5 py-5 text-[12px] sm:text-[13px] font-mono leading-[1.9] overflow-x-auto scrollbar-hide">
                <span className="text-muted">Available:</span>
                {"  "}
                <span className="text-accent">$69.60</span>
                {"  "}
                <span className="text-muted/50">(checking — spendable)</span>
                {"\n"}
                <span className="text-muted">Savings:</span>
                {"  "}
                <span className="text-accent">$9.26</span>
                {"  "}
                <span className="text-muted/50">(earning 4.15% APY)</span>
                {"\n"}
                <span className="text-muted">Credit:</span>
                {"  "}
                <span className="text-red-400">-$1.00</span>
                {"  "}
                <span className="text-muted/50">(7.67% APY)</span>
                {"\n"}
                <span className="text-muted">Investment:</span>
                {"  "}
                <span className="text-accent">$5.01</span>
                {"  "}
                <span className="text-accent/70">(+0.1%)</span>
                {"\n"}
                <span className="text-muted/30">──────────────────────────────────────</span>
                {"\n"}
                <span className="text-muted">Total:</span>
                {"  "}
                <span className="text-accent">$82.87</span>
              </pre>
            </div>
          </div>
        </section>

        {/* ── MCP + SDK ── */}
        <section className="py-16 sm:py-24 border-b border-border">
          <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
            Programmatic Access
          </div>
          <h2 className="font-serif text-[28px] sm:text-[clamp(28px,3.5vw,42px)] font-normal leading-[1.1] text-foreground mb-6 tracking-tight">
            Natural language.{" "}
            <em className="italic text-accent">Or code.</em>
          </h2>
          <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[520px] mb-10">
            Your AI invests autonomously via 21 MCP tools and 12 prompts.
            Or integrate directly with the TypeScript SDK for full control.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-panel border border-border-bright rounded-sm overflow-hidden">
              <div className="px-4 py-3 bg-white/[0.02] border-b border-border flex items-center justify-between">
                <span className="text-[10px] tracking-[0.1em] text-muted uppercase">
                  MCP — Natural language
                </span>
                <span className="text-[10px] px-2 py-0.5 bg-accent-dim text-accent tracking-[0.08em]">
                  Claude / Cursor
                </span>
              </div>
              <pre className="px-5 py-5 text-[12px] sm:text-[13px] font-mono leading-[1.8] overflow-x-auto scrollbar-hide">
                <span className="text-accent">User:</span>
                {" "}
                <span className="text-foreground">&quot;Invest $100 in the bluechip strategy&quot;</span>
                {"\n\n"}
                <span className="text-muted/50">→ AI calls t2000_strategy</span>
                {"\n"}
                <span className="text-muted/50">→ Previews allocation (dryRun: true)</span>
                {"\n"}
                <span className="text-muted/50">→ Asks for confirmation</span>
                {"\n"}
                <span className="text-muted/50">→ Executes atomic PTB</span>
                {"\n\n"}
                <span className="text-accent">AI:</span>
                {" "}
                <span className="text-foreground">&quot;Done — invested $100 across</span>
                {"\n"}
                <span className="text-foreground">{"     "}BTC, ETH, and SUI.&quot;</span>
              </pre>
            </div>

            <div className="bg-panel border border-border-bright rounded-sm overflow-hidden">
              <div className="px-4 py-3 bg-white/[0.02] border-b border-border flex items-center justify-between">
                <span className="text-[10px] tracking-[0.1em] text-muted uppercase">
                  SDK
                </span>
                <span className="text-[10px] px-2 py-0.5 bg-accent-dim text-accent tracking-[0.08em]">
                  TypeScript
                </span>
              </div>
              <pre className="px-5 py-5 text-[12px] sm:text-[13px] font-mono leading-[1.8] overflow-x-auto scrollbar-hide">
                <span className="text-purple-400">const</span>
                {` agent = `}
                <span className="text-purple-400">await</span>
                {` T2000.`}
                <span className="text-accent">create</span>
                {`({ pin });`}
                {"\n\n"}
                <span className="text-purple-400">await</span>
                {` agent.`}
                <span className="text-accent">investBuy</span>
                {`({ asset: `}
                <span className="text-amber-300">&apos;SUI&apos;</span>
                {`, usdAmount: `}
                <span className="text-amber-400">100</span>
                {` });`}
                {"\n"}
                <span className="text-purple-400">await</span>
                {` agent.`}
                <span className="text-accent">investEarn</span>
                {`({ asset: `}
                <span className="text-amber-300">&apos;SUI&apos;</span>
                {` });`}
                {"\n"}
                <span className="text-purple-400">await</span>
                {` agent.`}
                <span className="text-accent">investStrategy</span>
                {`({`}
                {"\n"}
                {"  "}
                {`strategy: `}
                <span className="text-amber-300">&apos;bluechip&apos;</span>
                {`, usdAmount: `}
                <span className="text-amber-400">200</span>
                {"\n"}
                {`});`}
                {"\n"}
                <span className="text-purple-400">const</span>
                {` pf = `}
                <span className="text-purple-400">await</span>
                {` agent.`}
                <span className="text-accent">getPortfolio</span>
                {`();`}
              </pre>
            </div>
          </div>
        </section>

        {/* ── Margin — Coming Soon ── */}
        <section className="py-16 sm:py-24 border-b border-border">
          <div className="text-[10px] tracking-[0.2em] uppercase text-amber-400/80 mb-4">
            Coming Soon
          </div>
          <h2 className="font-serif text-[28px] sm:text-[clamp(28px,3.5vw,42px)] font-normal leading-[1.1] text-foreground mb-6 tracking-tight">
            Margin <em className="italic text-amber-400/80">trading.</em>
          </h2>
          <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[520px] mb-8">
            Leveraged positions on SUI, BTC, and ETH — using your savings and
            investment deposits as collateral. Your agent will be able to take
            amplified positions while the locking guard manages risk
            automatically.
          </p>

          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { label: "Leverage", value: "Up to 3×", desc: "Amplify positions with collateral" },
              { label: "Collateral", value: "Savings + Investments", desc: "Use existing deposits" },
              { label: "Risk Management", value: "Auto-liquidation guard", desc: "Health factor enforced" },
            ].map((item) => (
              <div
                key={item.label}
                className="border border-amber-400/15 rounded-lg p-5 bg-amber-400/[0.02]"
              >
                <div className="text-[10px] text-amber-400/60 tracking-[0.1em] uppercase mb-2">
                  {item.label}
                </div>
                <div className="font-mono text-sm text-foreground mb-1">
                  {item.value}
                </div>
                <div className="text-[11px] text-muted">{item.desc}</div>
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
            Give your agent an
            <br />
            <em className="italic text-accent">investment account.</em>
          </h2>
          <p className="text-muted text-[12px] sm:text-[13px] max-w-[460px] mx-auto mb-8 sm:mb-10 leading-[1.8]">
            Install t2000, fund with USDC, and start building a portfolio.
            Open source, non-custodial, built on Sui.
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
            t2000 — The first bank account for AI agents.{" "}
            <a href="/" className="text-accent hover:underline">Home</a>
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
