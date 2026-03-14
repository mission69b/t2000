import type { Metadata } from "next";
import Link from "next/link";
import { InvestShowcase } from "./InvestShowcase";

export const metadata: Metadata = {
  title: "t2000 — Investment Account",
  description:
    "Invest in crypto, earn yield while holding, and automate with strategies and DCA. All from natural language or CLI.",
  openGraph: {
    title: "t2000 — Investment Account",
    description:
      "Invest in crypto, earn yield while holding, and automate with strategies and DCA.",
    type: "website",
  },
};

const GITHUB_URL = "https://github.com/mission69b/t2000";

const ASSETS = [
  { symbol: "SUI", name: "Sui", desc: "The L1 powering your bank account", icon: "◆" },
  { symbol: "BTC", name: "Bitcoin", desc: "The world's largest digital asset", icon: "₿" },
  { symbol: "ETH", name: "Ethereum", desc: "The leading smart contract network", icon: "Ξ" },
  { symbol: "GOLD", name: "Gold", desc: "Tokenized physical gold by Matrixdock", icon: "◉" },
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
            Invest. Earn.
            <br />
            <em className="italic text-accent">Grow.</em>
          </h1>

          <p className="font-mono text-[12px] sm:text-[13px] text-muted leading-[1.7] max-w-[520px] mt-5">
            Build a portfolio with one command. Your holdings earn yield
            automatically while you keep full price exposure. Diversify with
            strategies, automate with DCA.
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
            What you can invest in
          </div>
          <h2 className="font-serif text-[28px] sm:text-[clamp(28px,3.5vw,42px)] font-normal leading-[1.1] text-foreground mb-4 tracking-tight">
            Crypto and commodities.{" "}
            <em className="italic text-accent">More coming.</em>
          </h2>
          <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[520px] mb-10 sm:mb-14">
            Say how much in dollars — t2000 handles the rest. No wallet
            complexity, no manual swaps. Stocks and RWA on the roadmap.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border border border-border">
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
                Earn while
                <br />
                <em className="italic text-accent">you hold.</em>
              </h2>
              <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[460px] mb-8">
                Your holdings earn lending yield automatically while you keep
                full price exposure. Sell anytime — funds withdraw from
                lending first, then swap back to USDC.
              </p>

              <div className="space-y-4">
                {[
                  { cmd: "t2000 invest earn <asset>", desc: "Start earning yield on any holding" },
                  { cmd: "t2000 invest unearn <asset>", desc: "Stop earning, keep the investment" },
                  { cmd: "t2000 invest sell all <asset>", desc: "Sell — auto-withdraws from lending first" },
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
                <span className="text-muted">4.85</span>
                {"    "}
                <span className="text-muted">Avg: $1.03</span>
                {"    "}
                <span className="text-muted">Now: $1.05</span>
                {"    "}
                <span className="text-accent">+2.0%</span>
                {"    "}
                <span className="text-accent">2.61% APY</span>
                {"\n"}
                <span className="text-foreground">BTC:</span>
                {"  "}
                <span className="text-muted">0.00035</span>
                {"  "}
                <span className="text-muted">Avg: $71k</span>
                {"     "}
                <span className="text-muted">Now: $72k</span>
                {"    "}
                <span className="text-accent">+1.4%</span>
                {"\n"}
                <span className="text-foreground">ETH:</span>
                {"  "}
                <span className="text-muted">0.00070</span>
                {"  "}
                <span className="text-muted">Avg: $2.1k</span>
                {"    "}
                <span className="text-muted">Now: $2.2k</span>
                {"   "}
                <span className="text-accent">+0.9%</span>
                {"    "}
                <span className="text-accent">0.04% APY</span>
                {"\n"}
                <span className="text-foreground">GOLD:</span>
                {" "}
                <span className="text-muted">0.01005</span>
                {"  "}
                <span className="text-muted">Avg: $4.9k</span>
                {"    "}
                <span className="text-muted">Now: $5.0k</span>
                {"   "}
                <span className="text-accent">+1.2%</span>
                {"\n"}
                <span className="text-muted/30">─────────────────────────────────────────────</span>
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

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {[
              { name: "bluechip", alloc: "BTC 50% · ETH 30% · SUI 20%", desc: "Large-cap crypto index" },
              { name: "all-weather", alloc: "BTC 30% · ETH 20% · SUI 20% · GOLD 30%", desc: "Crypto and commodities" },
              { name: "safe-haven", alloc: "BTC 50% · GOLD 50%", desc: "Store-of-value assets" },
              { name: "layer1", alloc: "ETH 50% · SUI 50%", desc: "Smart contract platforms" },
              { name: "sui-heavy", alloc: "SUI 60% · BTC 20% · ETH 20%", desc: "Sui-weighted portfolio" },
            ].map((s) => (
              <div key={s.name} className="border border-border-bright rounded-lg p-5 hover:border-accent/30 transition-colors">
                <div className="font-mono text-sm text-accent mb-1">{s.name}</div>
                <div className="font-mono text-[11px] text-foreground/70 mb-2">{s.alloc}</div>
                <div className="font-mono text-[11px] text-muted/60">{s.desc}</div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-muted mb-6">
            Or create your own with{" "}
            <code className="text-accent bg-accent-dim px-1.5 py-0.5">
              t2000 invest strategy create
            </code>
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-panel border border-border-bright rounded-sm overflow-hidden">
              <div className="px-4 py-3 bg-white/[0.02] border-b border-border text-[10px] text-muted tracking-[0.1em] uppercase">
                Strategy buy — one atomic transaction
              </div>
              <pre className="px-5 py-5 text-[11px] sm:text-[12px] font-mono leading-[1.9] overflow-x-auto scrollbar-hide">
                <span className="text-foreground">❯ t2000 invest strategy buy all-weather 500</span>
                {"\n\n"}
                <span className="text-accent">  ✓ Invested $500.00 in all-weather strategy</span>
                {"\n"}
                <span className="text-muted">  BTC:   0.00155 @ $96,420</span>
                {"\n"}
                <span className="text-muted">  ETH:   0.03780 @ $2,640</span>
                {"\n"}
                <span className="text-muted">  SUI:   26.3100 @ $3.80</span>
                {"\n"}
                <span className="text-muted">  GOLD:  0.03017 @ $4,974</span>
                {"\n"}
                <span className="text-muted">  Total invested:  $500.00</span>
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

        {/* ── Investment Protection ── */}
        <section className="py-16 sm:py-24 border-b border-border">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div>
              <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
                Safety
              </div>
              <h2 className="font-serif text-[28px] sm:text-[clamp(28px,3.5vw,42px)] font-normal leading-[1.1] text-foreground mb-6 tracking-tight">
                Protected{" "}
                <em className="italic text-accent">by default.</em>
              </h2>
              <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[460px]">
                Your investments can&apos;t be accidentally sent or swapped
                during routine operations. To access value, sell through the
                investment account — everything else is blocked.
              </p>
            </div>

            <div className="bg-panel border border-border-bright rounded-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center gap-2">
                <span className="text-[11px] tracking-[0.1em] text-muted uppercase">
                  How it works
                </span>
              </div>
              <div className="p-5 space-y-3">
                {[
                  { icon: "✗", ok: false, label: "Send invested assets", status: "Blocked" },
                  { icon: "✗", ok: false, label: "Swap invested assets", status: "Blocked" },
                  { icon: "✓", ok: true, label: "Sell through invest account", status: "Allowed" },
                  { icon: "✓", ok: true, label: "Earn yield on holdings", status: "Allowed" },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-3 text-xs">
                    <span className={`font-mono ${row.ok ? "text-accent" : "text-red-400"}`}>
                      {row.icon}
                    </span>
                    <span className="text-[12px] text-muted flex-1">{row.label}</span>
                    <span className={`text-[11px] tracking-[0.06em] ${row.ok ? "text-accent" : "text-red-400"}`}>
                      {row.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── MCP ── */}
        <section className="py-16 sm:py-24 border-b border-border">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div>
              <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
                AI-Powered
              </div>
              <h2 className="font-serif text-[28px] sm:text-[clamp(28px,3.5vw,42px)] font-normal leading-[1.1] text-foreground mb-6 tracking-tight">
                Just ask{" "}
                <em className="italic text-accent">your AI.</em>
              </h2>
              <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[460px] mb-6">
                Connect any AI platform and invest through natural conversation.
                Your AI previews every trade before executing, and you confirm
                before anything moves.
              </p>
              <div className="flex flex-wrap gap-2">
                {["Claude", "Cursor", "Copilot", "Codex"].map((p) => (
                  <span
                    key={p}
                    className="text-[11px] px-3 py-1.5 border border-border-bright text-muted tracking-wide"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-panel border border-border-bright rounded-sm overflow-hidden">
              <div className="px-4 py-3 bg-white/[0.02] border-b border-border flex items-center justify-between">
                <span className="text-[10px] tracking-[0.1em] text-muted uppercase">
                  Natural language
                </span>
                <span className="text-[10px] px-2 py-0.5 bg-accent-dim text-accent tracking-[0.08em]">
                  MCP
                </span>
              </div>
              <pre className="px-5 py-5 text-[12px] sm:text-[13px] font-mono leading-[1.8] overflow-x-auto scrollbar-hide">
                <span className="text-accent">You:</span>
                {" "}
                <span className="text-foreground">&quot;Invest $100 in the bluechip strategy&quot;</span>
                {"\n\n"}
                <span className="text-muted/50">→ Previews allocation</span>
                {"\n"}
                <span className="text-muted/50">→ Asks for your confirmation</span>
                {"\n"}
                <span className="text-muted/50">→ Executes in one transaction</span>
                {"\n\n"}
                <span className="text-accent">AI:</span>
                {" "}
                <span className="text-foreground">&quot;Done — invested $100 across</span>
                {"\n"}
                <span className="text-foreground">{"     "}BTC, ETH, SUI, and GOLD.&quot;</span>
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
            Leveraged positions on SUI, BTC, and ETH — powered by Bluefin
            with USDC collateral. Your agent will be able to take amplified
            positions while an auto-liquidation guard manages risk
            automatically.
          </p>

          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { label: "Leverage", value: "Up to 3×", desc: "Amplify positions with USDC collateral" },
              { label: "Collateral", value: "USDC", desc: "Deposit from checking or borrow from credit" },
              { label: "Risk Management", value: "Auto-liquidation guard", desc: "Auto top-up collateral to avoid liquidation" },
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
            <Link href="/" className="text-accent hover:underline">Home</Link>
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
