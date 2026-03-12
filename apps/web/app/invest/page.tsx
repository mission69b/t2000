import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "t2000 — Investment Account",
  description:
    "Buy SUI, BTC, and ETH with dollar-denominated commands. Portfolio tracking with cost-basis P&L. Investment locking guard.",
  openGraph: {
    title: "t2000 — Investment Account",
    description:
      "Buy SUI, BTC, and ETH with dollar-denominated commands. Portfolio tracking with cost-basis P&L.",
    type: "website",
  },
};

const GITHUB_URL = "https://github.com/mission69b/t2000";

const ASSETS = [
  {
    symbol: "SUI",
    name: "Sui native",
    desc: "The Layer 1 powering t2000",
    icon: "◆",
  },
  {
    symbol: "BTC",
    name: "Bitcoin via SuiBridge",
    desc: "The original cryptocurrency",
    icon: "₿",
  },
  {
    symbol: "ETH",
    name: "Ethereum via SuiBridge",
    desc: "The smart contract pioneer",
    icon: "Ξ",
  },
];

const STEPS = [
  {
    num: "01",
    cmd: "t2000 invest buy 100 SUI",
    title: "Buy",
    desc: "Spend $100 to buy SUI at market price via Cetus DEX",
  },
  {
    num: "02",
    cmd: "t2000 portfolio",
    title: "Track",
    desc: "Track positions with cost basis, live prices, and unrealized P&L",
  },
  {
    num: "03",
    cmd: "t2000 invest sell all SUI",
    title: "Sell",
    desc: "Sell back to USDC. Realized P&L calculated automatically.",
  },
];

export default function InvestPage() {
  return (
    <main className="min-h-screen bg-background text-foreground relative z-10">
      <div className="fixed inset-0 z-0 pointer-events-none bg-[linear-gradient(rgba(0,214,143,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,214,143,0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6">
        {/* ── Back link ── */}
        <div className="pt-8 sm:pt-12">
          <a
            href="/"
            className="inline-block text-muted hover:text-accent text-xs font-mono mb-8 transition-colors"
          >
            ← t2000.ai
          </a>
        </div>

        {/* ── Hero ── */}
        <section className="pb-16 sm:pb-24 border-b border-border">
          <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-6 flex items-center gap-3">
            <span className="block w-8 h-px bg-accent" />
            Investment Account
          </div>

          <h1 className="font-serif text-[36px] sm:text-[clamp(42px,5vw,64px)] leading-[1.05] text-foreground mb-4 font-normal tracking-tight">
            Invest in crypto.
            <br />
            Track <em className="italic text-accent">everything.</em>
          </h1>

          <p className="font-mono text-[12px] sm:text-[13px] text-muted leading-[1.7] max-w-[520px] mt-5">
            Buy SUI, BTC, and ETH with dollar-denominated commands. Portfolio
            tracking with cost-basis P&L. Investment locking so your assets stay
            invested.
          </p>

          <div className="flex items-center gap-3 sm:gap-5 mt-8 sm:mt-10 flex-wrap">
            <Link
              href="/docs"
              className="px-5 sm:px-7 py-3 sm:py-3.5 bg-accent text-background font-mono text-[11px] sm:text-xs font-semibold tracking-[0.1em] uppercase transition-all hover:bg-[#00f0a0] hover:shadow-[0_0_40px_var(--accent-glow)] hover:-translate-y-px"
            >
              Get started →
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 sm:px-7 py-3 sm:py-3.5 bg-transparent text-muted font-mono text-[11px] sm:text-xs tracking-[0.1em] uppercase border border-border-bright transition-all hover:text-foreground hover:border-foreground"
            >
              View on GitHub
            </a>
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
                <p className="text-xs text-muted leading-[1.7]">
                  {asset.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── How It Works ── */}
        <section className="py-16 sm:py-24 border-b border-border">
          <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
            How it works
          </div>
          <h2 className="font-serif text-[28px] sm:text-[clamp(28px,3.5vw,42px)] font-normal leading-[1.1] text-foreground mb-10 sm:mb-14 tracking-tight">
            Buy. Track. <em className="italic text-accent">Sell.</em>
          </h2>

          <div className="flex flex-col">
            {STEPS.map((step, i) => (
              <div
                key={step.num}
                className={`group grid grid-cols-[40px_1fr] gap-5 py-7 border-b border-border ${i === 0 ? "border-t" : ""}`}
              >
                <div className="text-[11px] text-muted/50 pt-1 tracking-wide">
                  {step.num}
                </div>
                <div>
                  <div className="text-sm text-foreground mb-2 font-medium tracking-tight">
                    {step.title}
                  </div>
                  <div className="text-xs text-muted leading-[1.7] mb-3">
                    {step.desc}
                  </div>
                  <code className="text-[11px] text-accent bg-accent-dim px-3 py-2 tracking-wide inline-block">
                    {step.cmd}
                  </code>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Yield on Investments ── */}
        <section className="py-16 sm:py-24 border-b border-border">
          <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
            Yield
          </div>
          <h2 className="font-serif text-[28px] sm:text-[clamp(28px,3.5vw,42px)] font-normal leading-[1.1] text-foreground mb-6 tracking-tight">
            Earn yield. <em className="italic text-accent">Keep exposure.</em>
          </h2>
          <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[520px] mb-8">
            Deposit invested SUI or ETH into NAVI or Suilend for lending yield.
            You keep full price exposure — sell anytime. Auto-withdraw on sell
            brings funds back before the swap.
          </p>

          <div className="flex flex-col">
            {[
              {
                cmd: "t2000 invest earn SUI",
                title: "Earn",
                desc: "Deposit invested asset into best-rate lending protocol",
              },
              {
                cmd: "t2000 invest unearn SUI",
                title: "Unearn",
                desc: "Withdraw from lending, keep in portfolio",
              },
            ].map((step, i) => (
              <div
                key={step.cmd}
                className={`group grid grid-cols-[40px_1fr] gap-5 py-7 border-b border-border ${i === 0 ? "border-t" : ""}`}
              >
                <div className="text-[11px] text-muted/50 pt-1 tracking-wide">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div>
                  <div className="text-sm text-foreground mb-2 font-medium tracking-tight">
                    {step.title}
                  </div>
                  <div className="text-xs text-muted leading-[1.7] mb-3">
                    {step.desc}
                  </div>
                  <code className="text-[11px] text-accent bg-accent-dim px-3 py-2 tracking-wide inline-block">
                    {step.cmd}
                  </code>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Investment Locking ── */}
        <section className="py-16 sm:py-24 border-b border-border">
          <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
            Safety
          </div>
          <h2 className="font-serif text-[28px] sm:text-[clamp(28px,3.5vw,42px)] font-normal leading-[1.1] text-foreground mb-6 tracking-tight">
            Investment <em className="italic text-accent">locking guard.</em>
          </h2>
          <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[520px] mb-8">
            Invested assets are locked. You can&apos;t accidentally send or swap
            them. To access value, sell back to USDC. This prevents the agent
            from liquidating investment positions during routine operations like
            sends or gas top-ups.
          </p>

          <div className="bg-panel border border-border-bright rounded-sm overflow-hidden max-w-md">
            <div className="px-5 py-3 border-b border-border flex items-center gap-2">
              <span className="text-[11px] tracking-[0.1em] text-muted uppercase">
                Guard behavior
              </span>
            </div>
            <div className="p-5 space-y-3">
              {[
                {
                  icon: "✗",
                  iconClass: "text-red-400",
                  label: "t2000 send 1 SUI to 0x...",
                  status: "Blocked",
                },
                {
                  icon: "✗",
                  iconClass: "text-red-400",
                  label: "t2000 exchange 1 SUI USDC",
                  status: "Blocked",
                },
                {
                  icon: "✓",
                  iconClass: "text-accent",
                  label: "t2000 invest sell all SUI",
                  status: "Allowed",
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center gap-3 text-xs"
                >
                  <span className={`font-mono ${row.iconClass}`}>
                    {row.icon}
                  </span>
                  <code className="text-[11px] text-muted flex-1">
                    {row.label}
                  </code>
                  <span
                    className={`text-[10px] tracking-[0.08em] uppercase ${row.iconClass}`}
                  >
                    {row.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Balance Integration ── */}
        <section className="py-16 sm:py-24 border-b border-border">
          <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
            Unified Balance
          </div>
          <h2 className="font-serif text-[28px] sm:text-[clamp(28px,3.5vw,42px)] font-normal leading-[1.1] text-foreground mb-6 tracking-tight">
            Five tiers.{" "}
            <em className="italic text-accent">One command.</em>
          </h2>
          <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[520px] mb-8">
            Investment value integrates directly into the balance output. See
            your full financial picture — checking, savings, investment, gas —
            with a single command.
          </p>

          <div className="bg-panel border border-border-bright rounded-sm overflow-hidden max-w-lg">
            <div className="px-4 py-3 bg-white/[0.02] border-b border-border text-[10px] text-muted tracking-[0.1em] uppercase">
              t2000 balance
            </div>
            <pre className="px-5 py-5 text-[12px] sm:text-[13px] font-mono leading-[1.9] overflow-x-auto scrollbar-hide">
              <span className="text-muted">Available:</span>
              {"  "}
              <span className="text-amber-400">$500.00</span>
              {"  "}
              <span className="text-muted/50">(checking)</span>
              {"\n"}
              <span className="text-muted">Savings:</span>
              {"    "}
              <span className="text-amber-400">$2,000.00</span>
              {"  "}
              <span className="text-muted/50">(earning 4.9% APY)</span>
              {"\n"}
              <span className="text-muted">Investment:</span>
              {" "}
              <span className="text-amber-400">$150.00</span>
              {"  "}
              <span className="text-accent">(+5.2%)</span>
              {"\n"}
              <span className="text-muted">Gas:</span>
              {"        "}
              <span className="text-amber-400">0.50</span>
              {" SUI"}
              {"\n"}
              <span className="text-muted/40">
                ──────────────────────────────────────
              </span>
              {"\n"}
              <span className="text-muted">Total:</span>
              {"      "}
              <span className="text-amber-400">$2,650.50</span>
            </pre>
          </div>
        </section>

        {/* ── MCP + SDK ── */}
        <section className="py-16 sm:py-24 border-b border-border">
          <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
            Programmatic Access
          </div>
          <h2 className="font-serif text-[28px] sm:text-[clamp(28px,3.5vw,42px)] font-normal leading-[1.1] text-foreground mb-6 tracking-tight">
            MCP tool.{" "}
            <em className="italic text-accent">SDK method.</em>
          </h2>
          <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[520px] mb-10">
            Your AI can invest autonomously via the MCP server, or integrate
            directly with the SDK for full programmatic control.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* MCP Tool */}
            <div className="bg-panel border border-border-bright rounded-sm overflow-hidden">
              <div className="px-4 py-3 bg-white/[0.02] border-b border-border flex items-center justify-between">
                <span className="text-[10px] tracking-[0.1em] text-muted uppercase">
                  MCP Tool
                </span>
                <span className="text-[10px] px-2 py-0.5 bg-accent-dim text-accent tracking-[0.08em]">
                  t2000_invest
                </span>
              </div>
              <pre className="px-5 py-5 text-[12px] sm:text-[13px] font-mono leading-[1.8] overflow-x-auto scrollbar-hide">
                <span className="text-muted/50">
                  {`// AI calls t2000_invest tool`}
                </span>
                {"\n"}
                {`{`}
                {"\n"}
                {"  "}
                <span className="text-accent">&quot;action&quot;</span>
                {`: `}
                <span className="text-amber-400">&quot;buy&quot;</span>
                {`,`}
                {"\n"}
                {"  "}
                <span className="text-accent">&quot;amount&quot;</span>
                {`: `}
                <span className="text-amber-400">100</span>
                {`,`}
                {"\n"}
                {"  "}
                <span className="text-accent">&quot;asset&quot;</span>
                {`:  `}
                <span className="text-amber-400">&quot;SUI&quot;</span>
                {"\n"}
                {`}`}
              </pre>
            </div>

            {/* SDK */}
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
                <span className="text-purple-400">import</span>
                {` { T2000 } `}
                <span className="text-purple-400">from</span>
                {` `}
                <span className="text-amber-300">&apos;@t2000/sdk&apos;</span>
                {`;`}
                {"\n\n"}
                <span className="text-purple-400">const</span>
                {` agent = `}
                <span className="text-purple-400">await</span>
                {` T2000.`}
                <span className="text-accent">create</span>
                {`({ pin });`}
                {"\n\n"}
                <span className="text-muted/50">{`// Buy $100 of SUI`}</span>
                {"\n"}
                <span className="text-purple-400">await</span>
                {` agent.`}
                <span className="text-accent">investBuy</span>
                {`({`}
                {"\n"}
                {"  "}
                {`asset: `}
                <span className="text-amber-300">&apos;SUI&apos;</span>
                {`,`}
                {"\n"}
                {"  "}
                {`usdAmount: `}
                <span className="text-amber-400">100</span>
                {"\n"}
                {`});`}
                {"\n\n"}
                <span className="text-muted/50">{`// Get portfolio`}</span>
                {"\n"}
                <span className="text-purple-400">const</span>
                {` pf = `}
                <span className="text-purple-400">await</span>
                {` agent.`}
                <span className="text-accent">portfolio</span>
                {`();`}
              </pre>
            </div>
          </div>
        </section>

        {/* ── Strategies ── */}
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
            Pick a strategy, set an amount — done. Auto-invest on a schedule
            with dollar-cost averaging.
          </p>

          <div className="grid sm:grid-cols-3 gap-6 mb-12">
            {[
              { name: "bluechip", alloc: "BTC 50% · ETH 30% · SUI 20%", desc: "Large-cap crypto index" },
              { name: "layer1", alloc: "ETH 50% · SUI 50%", desc: "Smart contract platforms" },
              { name: "sui-heavy", alloc: "BTC 20% · ETH 20% · SUI 60%", desc: "Sui-weighted portfolio" },
            ].map((s) => (
              <div key={s.name} className="border border-border-bright rounded-lg p-5">
                <div className="font-mono text-sm text-accent mb-1">{s.name}</div>
                <div className="font-mono text-[11px] text-muted mb-2">{s.alloc}</div>
                <div className="font-mono text-[11px] text-muted/60">{s.desc}</div>
              </div>
            ))}
          </div>

          <div className="border border-border-bright rounded-lg p-5 bg-[#0a0f0a] max-w-xl">
            <pre className="font-mono text-[11px] sm:text-xs text-muted leading-[1.8] overflow-x-auto whitespace-pre">
{`❯ t2000 invest strategy buy layer1 200

  ✓ Invested $200.00 in layer1 strategy
  ──────────────────────────────────────
  ETH:  0.0490 @ $2,040.00
  SUI:  103.09 @ $0.97
  ──────────────────────────────────────
  Total invested:  $200.00
  Tx:  https://suiscan.xyz/mainnet/tx/...

❯ t2000 invest auto setup 50 weekly bluechip

  ✓ Auto-invest created
  Strategy:   bluechip (Large-cap crypto index)
  Amount:     $50.00 per week
  Next run:   Feb 24, 2026`}
            </pre>
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
            Install t2000, fund with USDC, and start building a portfolio. Open
            source, non-custodial, built on Sui.
          </p>

          <div className="flex justify-center gap-3 sm:gap-4 flex-wrap">
            <Link
              href="/docs"
              className="px-5 sm:px-7 py-3.5 sm:py-4 bg-accent text-background font-mono text-xs font-semibold tracking-[0.1em] uppercase transition-all hover:bg-[#00f0a0] hover:shadow-[0_0_40px_var(--accent-glow)] hover:-translate-y-px"
            >
              Read the docs →
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 sm:px-7 py-3.5 sm:py-4 bg-transparent text-muted font-mono text-xs tracking-[0.1em] uppercase border border-border-bright rounded-sm transition-all hover:text-foreground hover:border-foreground"
            >
              View on GitHub →
            </a>
          </div>

          <div className="text-[10px] sm:text-[11px] text-muted/40 tracking-wide mt-6">
            MIT · Non-custodial · Sui mainnet
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="pt-8 pb-10 border-t border-border text-center">
          <p className="text-muted text-xs">
            t2000 — The first bank account for AI agents.{" "}
            <a href="/" className="text-accent hover:underline">
              Home
            </a>{" "}
            ·{" "}
            <Link href="/docs" className="text-accent hover:underline">
              Docs
            </Link>{" "}
            ·{" "}
            <Link href="/demo" className="text-accent hover:underline">
              Demos
            </Link>{" "}
            ·{" "}
            <a
              href={GITHUB_URL}
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
