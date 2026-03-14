import Link from "next/link";
import { TerminalDemo } from "./components/TerminalDemo";
import { InstallCommand } from "./components/InstallCommand";
import { Ticker } from "./components/Ticker";
import { BalanceWidget } from "./components/BalanceWidget";
import { HomeShowcase } from "./components/HomeShowcase";

const GITHUB_URL = "https://github.com/mission69b/t2000";
const SKILLS_URL = "https://github.com/mission69b/t2000-skills";
const DOCS_URL = "/docs";
const DEMO_URL = "/demo";

const ACCOUNTS = [
  {
    num: "01 / 05",
    icon: "⟳",
    title: "Checking",
    subtitle: "Send · Receive · Balance",
    desc: "The everyday account. Send USDC to anyone, receive funds, check balances. Gas is handled automatically.",
    prompt: "Send $10 to Alice",
    cmd: "t2000 send 10 to alice",
    href: "/accounts",
  },
  {
    num: "02 / 05",
    icon: "◈",
    title: "Savings",
    subtitle: "Earn 2–8% APY",
    desc: "Idle USDC earns interest automatically. Auto-routed to the best rate across lending protocols. Withdraw any time.",
    prompt: "Put all my idle cash to work",
    cmd: "t2000 save all",
    href: "/accounts",
  },
  {
    num: "03 / 05",
    icon: "◎",
    title: "Credit",
    subtitle: "Borrow · Repay",
    desc: "Borrow USDC against your savings — without selling. Repay when ready. Safety limits enforced automatically.",
    prompt: "Borrow $40 against my savings",
    cmd: "t2000 borrow 40",
    href: "/accounts",
  },
  {
    num: "04 / 05",
    icon: "⇌",
    title: "Exchange",
    subtitle: "Swap any pair",
    desc: "Swap between any supported tokens at market rates. The agent can convert currencies, acquire gas, or rebalance — all automatically.",
    prompt: "Convert $5 to SUI",
    cmd: "t2000 exchange 5 USDC SUI",
    href: "/accounts",
  },
  {
    num: "05 / 05",
    icon: "◆",
    title: "Investment",
    subtitle: "Buy · Sell · Strategies · DCA",
    desc: "Invest in crypto, commodities, and more. Use pre-built strategies or set up recurring investments. Track P&L automatically.",
    prompt: "Invest $200 in layer1 strategy",
    cmd: "t2000 invest strategy buy layer1 200",
    href: "/invest",
  },
];

const STEPS = [
  {
    num: "01",
    title: "Install",
    badge: "30s",
    badgeType: "done" as const,
    content: "One command creates a secure wallet, sets up gas, and opens all five accounts.",
    code: "npm install -g @t2000/cli && t2000 init",
  },
  {
    num: "02",
    title: "Fund",
    badge: "1 min",
    badgeType: "done" as const,
    content: "Send USDC to the wallet address. Everything else — gas, fees, protocol routing — is automatic.",
  },
  {
    num: "03",
    title: "Connect your AI",
    badge: "1 cmd",
    badgeType: "new" as const,
    content: "One command connects Claude, Cursor, or any AI platform. Your agent gets 21 tools with built-in safety limits.",
    code: "t2000 mcp install",
  },
  {
    num: "04",
    title: "Let it work",
    badge: "∞",
    badgeType: "new" as const,
    content: "Your agent earns yield, borrows when needed, invests, and pays for APIs — without asking you. Set the rules once.",
  },
];

const X402_STEPS = [
  {
    icon: "→",
    active: true,
    title: "Agent requests a paid API",
    detail: "GET https://data.api.com/prices",
    isCode: true,
  },
  {
    icon: "402",
    active: false,
    title: "Server says: pay $0.01 USDC",
    detail: "Standard HTTP 402 response — no API key needed",
  },
  {
    icon: "✓",
    active: true,
    title: "t2000 pays automatically",
    detail: "$0.01 USDC sent on-chain · confirmed in ~380ms",
  },
  {
    icon: "200",
    active: true,
    title: "API returns the data",
    detail: "Total round-trip: ~820ms · no subscription required",
  },
];

const MCP_PLATFORMS = [
  "Claude Desktop",
  "Cursor",
  "OpenClaw",
  "Claude Code",
  "Windsurf",
  "OpenAI Codex",
  "GitHub Copilot",
  "Amp",
  "+ any MCP client",
];

const COMPARE_ROWS: {
  feature: string;
  coinbase: string;
  t2000: string;
  bothCheck?: boolean;
  coinbaseCross?: boolean;
  comingSoon?: boolean;
}[] = [
  { feature: "Chain", coinbase: "Base", t2000: "Sui" },
  { feature: "Send / receive", coinbase: "✓", t2000: "✓", bothCheck: true },
  { feature: "Savings account", coinbase: "—", t2000: "✓ Earn 2–8% APY automatically", coinbaseCross: true },
  { feature: "Credit line", coinbase: "—", t2000: "✓ Borrow against savings + investments", coinbaseCross: true },
  { feature: "Token exchange", coinbase: "✓ Base tokens", t2000: "✓ Any pair on Sui", bothCheck: true },
  { feature: "Investment account", coinbase: "—", t2000: "✓ Buy / sell + strategies + DCA", coinbaseCross: true },
  { feature: "Yield on investments", coinbase: "—", t2000: "✓ Earn while holding", coinbaseCross: true },
  { feature: "Pay-per-use APIs (x402)", coinbase: "✓ Base / Solana", t2000: "✓ First on Sui", bothCheck: true },
  { feature: "AI integration", coinbase: "—", t2000: "✓ 21 tools + 12 AI prompts", coinbaseCross: true },
  { feature: "Safety limits + lock", coinbase: "—", t2000: "✓ Per-tx limits, daily caps, emergency lock", coinbaseCross: true },
  { feature: "Margin trading", coinbase: "—", t2000: "Coming soon", coinbaseCross: true, comingSoon: true },
];

export default function Home() {
  return (
    <>
      {/* ── Header — direct child of <body> for reliable fixed positioning ── */}
      <header className="fixed top-0 inset-x-0 z-50 px-4 sm:px-6 lg:px-10 py-3 sm:py-4 flex items-center justify-between border-b border-border bg-background">
        <div className="font-mono font-semibold text-base sm:text-lg text-accent tracking-tight flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse-dot shadow-[0_0_8px_var(--accent)]" />
          t2000
          <span className="ml-1.5 px-1.5 py-0.5 text-[9px] font-semibold tracking-widest uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded">beta</span>
        </div>
        <nav className="flex items-center gap-4 sm:gap-8">
          <Link
            href="/accounts"
            className="hidden md:inline text-muted text-xs tracking-[0.08em] uppercase hover:text-foreground transition-colors"
          >
            Accounts
          </Link>
          <a
            href="#how"
            className="hidden md:inline text-muted text-xs tracking-[0.08em] uppercase hover:text-foreground transition-colors"
          >
            How it works
          </a>
          <a
            href="#mcp"
            className="hidden md:inline text-muted text-xs tracking-[0.08em] uppercase hover:text-foreground transition-colors"
          >
            Connect AI
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:inline text-muted text-xs tracking-[0.08em] uppercase hover:text-foreground transition-colors"
          >
            GitHub
          </a>
          <a
            href="#install"
            className="px-4 sm:px-5 py-2 border border-accent text-accent text-[11px] sm:text-xs tracking-[0.1em] uppercase transition-all hover:bg-accent-dim hover:shadow-[0_0_20px_var(--accent-glow)]"
          >
            Install →
          </a>
        </nav>
      </header>

      <div className="min-h-screen bg-background">
      {/* Grid background */}
      <div className="fixed inset-0 z-0 pointer-events-none bg-[linear-gradient(rgba(0,214,143,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,214,143,0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />

      {/* ── Hero ── */}
      <section className="relative z-1 min-h-screen grid grid-cols-1 lg:grid-cols-2 gap-0 pt-16 sm:pt-20">
        <div className="flex flex-col justify-center px-6 sm:px-8 lg:px-16 xl:px-20 py-12 sm:py-16 lg:py-20">
          <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-6 flex items-center gap-3">
            <span className="block w-8 h-px bg-accent" />
            Built for Sui · Open source · Non-custodial
          </div>

          <h1 className="font-serif text-[40px] sm:text-[clamp(48px,5vw,72px)] leading-[1.05] text-foreground mb-2 font-normal">
            The first{" "}
            <em className="italic text-accent">bank account</em>
            <br />
            for AI agents.
          </h1>

          <p className="font-mono text-[12px] sm:text-[13px] text-muted leading-[1.7] mb-8 sm:mb-12 max-w-[420px] mt-4 sm:mt-5">
            Five accounts — checking, savings, credit, investment, and
            exchange. Your AI earns yield, borrows, invests, and pays for
            services. One command to set up. Connect any AI platform.
          </p>

          <div className="flex gap-2 sm:gap-3 mb-8 sm:mb-12 flex-wrap">
            {[
              { icon: "⟳", label: "Checking", href: "/accounts" },
              { icon: "◈", label: "Savings", href: "/accounts" },
              { icon: "◎", label: "Credit", href: "/accounts" },
              { icon: "◆", label: "Investment", href: "/invest" },
              { icon: "⇌", label: "Exchange", href: "/accounts" },
            ].map((pill) => {
              const cls = "px-2.5 sm:px-3.5 py-1 sm:py-1.5 border border-border-bright text-[10px] sm:text-[11px] tracking-[0.06em] flex items-center gap-1.5 sm:gap-2 text-muted transition-all hover:border-accent hover:text-foreground hover:bg-accent-dim";
              return pill.href ? (
                <Link key={pill.label} href={pill.href} className={cls}>
                  <span className="text-xs sm:text-sm">{pill.icon}</span>
                  {pill.label}
                </Link>
              ) : (
                <div key={pill.label} className={cls}>
                  <span className="text-xs sm:text-sm">{pill.icon}</span>
                  {pill.label}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3 sm:gap-5 flex-wrap">
            <a
              href="#install"
              className="px-5 sm:px-7 py-3 sm:py-3.5 bg-accent text-background font-mono text-[11px] sm:text-xs font-semibold tracking-[0.1em] uppercase transition-all hover:bg-[#00f0a0] hover:shadow-[0_0_40px_var(--accent-glow)] hover:-translate-y-px"
            >
              Get started →
            </a>
            <a
              href="#how"
              className="px-5 sm:px-7 py-3 sm:py-3.5 bg-transparent text-muted font-mono text-[11px] sm:text-xs tracking-[0.1em] uppercase border border-border-bright transition-all hover:text-foreground hover:border-foreground"
            >
              How it works
            </a>
          </div>
        </div>

        <div className="flex items-center justify-center px-6 sm:px-8 lg:px-5 xl:px-20 py-8 lg:py-20 relative">
          <div className="relative w-full max-w-[520px]">
            <TerminalDemo />
            <BalanceWidget />
          </div>
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="relative z-1 px-6 sm:px-10 lg:px-20 border-t border-border">
        <div className="text-[10px] tracking-[0.2em] uppercase text-dim py-5 flex items-center gap-4">
          Five accounts. One agent. Zero friction.
          <span className="flex-1 h-px bg-border" />
        </div>
      </div>

      {/* ── Ticker ── */}
      <Ticker />

      {/* ── Account Cards ── */}
      <section id="accounts" className="relative z-1 px-6 sm:px-8 lg:px-20 py-16 sm:py-20 lg:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-10 items-end mb-10 sm:mb-16">
          <div>
            <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
              Five accounts
            </div>
            <h2 className="font-serif text-[32px] sm:text-[clamp(32px,4vw,52px)] font-normal leading-[1.1] text-foreground">
              Everything a bank offers.
              <br />
              Built for <em className="italic text-accent">machines.</em>
            </h2>
          </div>
          <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[400px]">
            Traditional wallets let agents spend. t2000 lets agents build
            wealth — earning yield on idle capital, accessing credit without
            selling positions, and exchanging currencies at market rates.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-px bg-border border border-border">
          {ACCOUNTS.map((account) => {
            const inner = (
              <>
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-accent scale-x-0 origin-left transition-transform duration-400 group-hover:scale-x-100" />
                <div className="text-[10px] tracking-[0.15em] text-dim mb-4 sm:mb-5">
                  {account.num}
                </div>
                <span className="text-[24px] sm:text-[28px] block mb-3 sm:mb-4">{account.icon}</span>
                <div className="text-base font-medium text-foreground mb-2 tracking-tight">
                  {account.title}
                </div>
                <div className="text-[11px] text-muted tracking-[0.05em] uppercase mb-4 sm:mb-5">
                  {account.subtitle}
                </div>
                <p className="text-xs text-muted leading-[1.7] mb-5 sm:mb-6">
                  {account.desc}
                </p>
                <div className="text-[11px] italic text-muted/70 mb-1.5 tracking-wide">
                  &ldquo;{account.prompt}&rdquo;
                </div>
                <div className="text-[11px] text-accent bg-accent-dim px-3 py-2 tracking-wide overflow-x-auto scrollbar-hide">
                  {account.cmd}
                </div>
              </>
            );
            const cls = "bg-panel p-6 sm:p-7 lg:p-9 relative overflow-hidden group transition-colors hover:bg-[rgba(0,214,143,0.03)]";
            return account.href ? (
              <Link key={account.title} href={account.href} className={cls}>
                {inner}
              </Link>
            ) : (
              <div key={account.title} className={cls}>
                {inner}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── See It In Action (demos) ── */}
      <HomeShowcase />

      {/* ── How It Works + x402 Panel ── */}
      <section id="how" className="relative z-1 px-6 sm:px-8 lg:px-20 py-16 sm:py-20 lg:py-24 border-t border-border">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-10 items-end mb-10 sm:mb-16">
          <div>
            <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
              How it works
            </div>
            <h2 className="font-serif text-[32px] sm:text-[clamp(32px,4vw,52px)] font-normal leading-[1.1] text-foreground">
              From zero to{" "}
              <em className="italic text-accent">operating</em>
              <br />
              in 30 seconds.
            </h2>
          </div>
          <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[400px]">
            Install, fund, connect your AI, and walk away. t2000 handles
            everything else — security, gas, protocol routing, safety limits.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-start">
          {/* Steps */}
          <div className="flex flex-col">
            {STEPS.map((step, i) => (
              <div
                key={step.num}
                className={`group grid grid-cols-[40px_1fr] gap-5 py-7 border-b border-border cursor-pointer transition-all ${i === 0 ? "border-t" : ""}`}
              >
                <div className="text-[11px] text-dim pt-1 tracking-wide">
                  {step.num}
                </div>
                <div>
                  <div className="text-sm text-foreground mb-2 font-medium flex items-center gap-3">
                    {step.title}
                    <span
                      className={`text-[10px] px-2 py-0.5 tracking-[0.08em] ${step.badgeType === "done" ? "bg-accent-dim text-accent" : "bg-[rgba(245,166,35,0.1)] text-warning"}`}
                    >
                      {step.badge}
                    </span>
                  </div>
                  <div className="text-xs text-muted leading-[1.7] opacity-70 transition-opacity group-hover:opacity-100">
                    {step.code && (
                      <>
                        <code className="text-accent text-xs">
                          {step.code}
                        </code>
                        <br />
                        <br />
                      </>
                    )}
                    {step.content}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* x402 Panel */}
          <div className="lg:sticky lg:top-[120px]">
            <div className="bg-panel border border-border-bright rounded-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <span className="text-[11px] tracking-[0.1em] text-muted uppercase">
                  How agents pay for APIs
                </span>
                <span className="text-[10px] px-2 py-0.5 bg-[rgba(74,144,226,0.15)] text-blue tracking-[0.08em]">
                  x402
                </span>
              </div>
              <div className="p-6">
                <div className="flex flex-col">
                  {X402_STEPS.map((step, i) => (
                    <div key={i} className="flex gap-4 pb-5 relative">
                      {i < X402_STEPS.length - 1 && (
                        <div className="absolute left-[15px] top-8 bottom-0 w-px bg-border" />
                      )}
                      <div
                        className={`w-[30px] h-[30px] rounded-full border flex items-center justify-center text-xs shrink-0 relative z-1 ${step.active ? "border-accent bg-accent-dim text-accent" : "border-border-bright bg-surface"}`}
                      >
                        {step.icon}
                      </div>
                      <div className="pt-1">
                        <div className="text-xs text-foreground mb-1">
                          {step.title}
                        </div>
                        <div className="text-[11px] text-muted leading-[1.6]">
                          {step.isCode ? (
                            <code className="text-accent text-[11px]">
                              {step.detail}
                            </code>
                          ) : (
                            step.detail
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 pt-5 border-t border-border">
                  <div className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.1em] uppercase text-accent px-2.5 py-1 border border-accent/30 bg-accent-dim">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse-dot" />
                    No API keys. No subscriptions. Just pay per request.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Connect Your AI ── */}
      <section
        id="mcp"
        className="relative z-1 px-6 sm:px-8 lg:px-20 py-16 sm:py-20 lg:py-24 border-t border-border bg-surface"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-10 items-end mb-10 sm:mb-16">
          <div>
            <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
              Connect Your AI
            </div>
            <h2 className="font-serif text-[32px] sm:text-[clamp(32px,4vw,52px)] font-normal leading-[1.1] text-foreground">
              Your AI already has a
              <br />
              <em className="italic text-accent">bank account.</em>
            </h2>
          </div>
          <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[400px]">
            One command connects Claude, Cursor, or any AI platform. Your agent
            gets 21 tools with built-in safety limits — no config files to edit.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-start">
          {/* Left: Terminal showing setup */}
          <div className="bg-panel border border-border-bright rounded-sm overflow-hidden">
            <div className="px-4 py-3 bg-white/[0.02] border-b border-border text-[10px] text-muted tracking-[0.1em] uppercase">
              Setup
            </div>
            <pre className="px-4 sm:px-5 py-5 text-xs sm:text-[13px] overflow-x-auto scrollbar-hide leading-[1.8]">
              <span className="text-muted/40">{`# macOS / Linux`}</span>{"\n"}
              <span className="text-muted">$</span> <span className="text-accent">curl -fsSL https://t2000.ai/install.sh | bash</span>{"\n\n"}
              <span className="text-muted/40">{`# or Node.js`}</span>{"\n"}
              <span className="text-muted">$</span> <span className="text-accent">npm i -g @t2000/cli</span>{"\n"}
              <span className="text-muted">$</span> <span className="text-accent">t2000 init</span>{"\n"}
              <span className="text-muted">$</span> <span className="text-accent">t2000 config set maxPerTx 100</span>{"\n"}
              <span className="text-muted">$</span> <span className="text-accent">t2000 mcp install</span>{"\n"}
              <span className="text-muted/50">{"\n"}  {"✓"} Claude Desktop  configured{"\n"}  {"✓"} Cursor (global)  configured</span>
            </pre>
            <div className="px-4 sm:px-5 py-3 border-t border-border text-[11px] text-muted/60">
              Then ask your AI: <span className="text-muted">&quot;what&apos;s my balance?&quot;</span>
            </div>
          </div>

          {/* Right: Categories + examples + platforms */}
          <div>
            <div className="grid grid-cols-3 gap-3 mb-8">
              {[
                { count: "9", label: "Read", desc: "Balance, rates, earnings, portfolio" },
                { count: "10", label: "Write", desc: "Send, save, invest, swap, borrow" },
                { count: "2", label: "Safety", desc: "Limits + emergency lock" },
              ].map((g) => (
                <div key={g.label} className="border border-border rounded-sm p-3 sm:p-4">
                  <div className="text-accent text-lg sm:text-xl font-mono">{g.count}</div>
                  <div className="text-[10px] tracking-[0.15em] uppercase text-muted mt-1">{g.label}</div>
                  <p className="text-[11px] text-muted/60 mt-2 leading-[1.5]">{g.desc}</p>
                </div>
              ))}
            </div>

            <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-2">
              Try asking
            </div>
            <div className="flex flex-col gap-1.5 mb-6">
              {[
                "Move my idle USDC to the highest yield",
                "Send $50 to alice but borrow if I\u2019m short",
                "Invest $100 in SUI and show my portfolio",
                "What would happen if I invest $200 in bluechip?",
                "Give me a full financial report",
              ].map((q) => (
                <p key={q} className="text-xs text-muted/70 italic">
                  &ldquo;{q}&rdquo;
                </p>
              ))}
            </div>

            <div>
              <div className="text-[10px] tracking-[0.15em] uppercase text-muted mb-2">
                Works with
              </div>
              <div className="flex flex-wrap gap-2">
                {MCP_PLATFORMS.map((p) => (
                  <span
                    key={p}
                    className="text-[11px] px-3 py-1.5 border border-border-bright text-muted tracking-wide"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Comparison Table ── */}
      <section
        id="compare"
        className="relative z-1 px-6 sm:px-8 lg:px-20 py-16 sm:py-20 lg:py-24 border-t border-border"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-10 items-end mb-10 sm:mb-16">
          <div>
            <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
              Comparison
            </div>
            <h2 className="font-serif text-[32px] sm:text-[clamp(32px,4vw,52px)] font-normal leading-[1.1] text-foreground">
              Not a wallet.
              <br />A{" "}
              <em className="italic text-accent">bank account.</em>
            </h2>
          </div>
          <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[400px]">
            Most agent wallets let you send money. t2000 gives your agent a
            full banking stack — savings, credit, investments, and more.
          </p>
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="text-left px-5 py-4 border-b border-border-bright font-medium tracking-[0.05em] text-[11px] uppercase text-muted">
                  Feature
                </th>
                <th className="text-left px-5 py-4 border-b border-border-bright font-medium tracking-[0.05em] text-[11px] uppercase text-muted">
                  Coinbase
                </th>
                <th className="text-left px-5 py-4 border-b border-border-bright font-medium tracking-[0.05em] text-[11px] uppercase text-accent">
                  t2000
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((row) => (
                <tr
                  key={row.feature}
                  className="hover:bg-white/[0.01]"
                >
                  <td className="px-5 py-4 border-b border-border text-foreground whitespace-nowrap">
                    {row.feature}
                  </td>
                  <td
                    className={`px-5 py-4 border-b border-border ${row.coinbaseCross ? "text-dim" : row.bothCheck ? "text-accent" : "text-muted"}`}
                  >
                    {row.coinbase}
                  </td>
                  <td className={`px-5 py-4 border-b border-border bg-[rgba(0,214,143,0.03)] border-l border-r border-l-accent/10 border-r-accent/10 ${row.comingSoon ? "text-warning italic" : "text-foreground"}`}>
                    {row.t2000}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile stacked cards */}
        <div className="sm:hidden flex flex-col gap-px">
          {COMPARE_ROWS.map((row) => (
            <div
              key={row.feature}
              className="border-b border-border py-4"
            >
              <div className="text-[11px] font-medium text-foreground mb-2.5">
                {row.feature}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[9px] tracking-[0.1em] uppercase text-muted mb-1">
                    Coinbase
                  </div>
                  <div
                    className={`text-[11px] leading-[1.5] ${row.coinbaseCross ? "text-dim" : row.bothCheck ? "text-accent" : "text-muted"}`}
                  >
                    {row.coinbase}
                  </div>
                </div>
                <div className="bg-[rgba(0,214,143,0.03)] rounded px-2.5 py-1.5 -my-1.5 border-l border-l-accent/10">
                  <div className="text-[9px] tracking-[0.1em] uppercase text-accent mb-1">
                    t2000
                  </div>
                  <div className={`text-[11px] leading-[1.5] ${row.comingSoon ? "text-warning italic" : "text-foreground"}`}>
                    {row.t2000}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section
        id="install"
        className="relative z-1 px-6 sm:px-8 lg:px-20 py-16 sm:py-24 lg:py-32 border-t border-border text-center overflow-hidden"
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] sm:w-[600px] h-[300px] sm:h-[400px] bg-[radial-gradient(ellipse,rgba(0,214,143,0.08)_0%,transparent_70%)] pointer-events-none" />

        <div className="relative">
          <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-5">
            Get started
          </div>
          <h2 className="font-serif text-[32px] sm:text-[clamp(32px,4vw,52px)] font-normal leading-[1.1] text-foreground mb-5">
            Give your agent
            <br />a{" "}
            <em className="italic text-accent">financial life.</em>
          </h2>
          <p className="text-muted text-[12px] sm:text-[13px] max-w-[500px] mx-auto mb-8 sm:mb-12 leading-[1.8]">
            Install t2000, fund with USDC, and your agent is operating in under
            a minute. Open source, non-custodial, built on Sui.
          </p>

          <div className="mb-6 overflow-x-auto scrollbar-hide">
            <InstallCommand />
          </div>

          <div className="flex justify-center gap-3 sm:gap-4 mt-6 flex-wrap">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 sm:px-7 py-3.5 sm:py-4 bg-transparent text-muted font-mono text-xs tracking-[0.1em] uppercase border border-border-bright rounded-sm transition-all hover:text-foreground hover:border-foreground"
            >
              GitHub →
            </a>
            <Link
              href={DEMO_URL}
              className="px-5 sm:px-7 py-3.5 sm:py-4 bg-transparent text-muted font-mono text-xs tracking-[0.1em] uppercase border border-border-bright rounded-sm transition-all hover:text-foreground hover:border-foreground"
            >
              Live Demos →
            </Link>
            <Link
              href={DOCS_URL}
              className="px-5 sm:px-7 py-3.5 sm:py-4 bg-transparent text-muted font-mono text-xs tracking-[0.1em] uppercase border border-border-bright rounded-sm transition-all hover:text-foreground hover:border-foreground"
            >
              Docs →
            </Link>
          </div>

          <div className="text-[10px] sm:text-[11px] text-dim tracking-wide mt-6">
            MIT · Non-custodial · Sui mainnet
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-1 px-6 sm:px-8 lg:px-20 py-6 sm:py-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
        <div className="text-xs text-dim">t2000 · Built on Sui</div>
        <div className="flex gap-4 sm:gap-6 flex-wrap justify-center">
          <a
            href="https://www.npmjs.com/package/@t2000/cli"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-dim tracking-wide hover:text-muted transition-colors"
          >
            npm
          </a>
          <a
            href={SKILLS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-dim tracking-wide hover:text-muted transition-colors"
          >
            Skills
          </a>
          <Link
            href="/accounts"
            className="text-[11px] text-dim tracking-wide hover:text-muted transition-colors"
          >
            Accounts
          </Link>
          <Link
            href={DEMO_URL}
            className="text-[11px] text-dim tracking-wide hover:text-muted transition-colors"
          >
            Demos
          </Link>
          <Link
            href="/stats"
            className="text-[11px] text-dim tracking-wide hover:text-muted transition-colors"
          >
            Stats
          </Link>
          <Link
            href={DOCS_URL}
            className="text-[11px] text-dim tracking-wide hover:text-muted transition-colors"
          >
            Docs
          </Link>
          <Link
            href="/security"
            className="text-[11px] text-dim tracking-wide hover:text-muted transition-colors"
          >
            Security
          </Link>
          <Link
            href="/terms"
            className="text-[11px] text-dim tracking-wide hover:text-muted transition-colors"
          >
            Terms
          </Link>
          <Link
            href="/privacy"
            className="text-[11px] text-dim tracking-wide hover:text-muted transition-colors"
          >
            Privacy
          </Link>
        </div>
      </footer>
    </div>
    </>
  );
}
