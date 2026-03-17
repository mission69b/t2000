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
    desc: "Send and receive USDC. Gas handled automatically.",
    prompt: "Send $10 to Alice",
    cmd: "t2000 send 10 to alice",
    href: "/accounts",
  },
  {
    num: "02 / 05",
    icon: "◈",
    title: "Savings",
    subtitle: "Earn 2–8% APY",
    desc: "Idle funds earn yield automatically. Best rate, any time.",
    prompt: "Put all my idle cash to work",
    cmd: "t2000 save all",
    href: "/accounts",
  },
  {
    num: "03 / 05",
    icon: "◎",
    title: "Credit",
    subtitle: "Borrow · Repay",
    desc: "Borrow against savings without selling. Repay anytime.",
    prompt: "Borrow $40 against my savings",
    cmd: "t2000 borrow 40",
    href: "/accounts",
  },
  {
    num: "04 / 05",
    icon: "⇌",
    title: "Exchange",
    subtitle: "Swap any pair",
    desc: "Swap any token pair at market rates. Automatic routing.",
    prompt: "Convert $5 to SUI",
    cmd: "t2000 exchange 5 USDC SUI",
    href: "/accounts",
  },
  {
    num: "05 / 05",
    icon: "◆",
    title: "Investment",
    subtitle: "Buy · Sell · Strategies · DCA",
    desc: "Buy, sell, earn yield. Strategies and DCA built in.",
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
    content: "One command. Wallet, MCP, safeguards — all guided.",
    code: "npm i -g @t2000/cli && t2000 init",
  },
  {
    num: "02",
    title: "Fund",
    badge: "1 min",
    badgeType: "done" as const,
    content: "Send USDC to the wallet. Gas and routing are automatic.",
  },
  {
    num: "03",
    title: "Let it work",
    badge: "∞",
    badgeType: "new" as const,
    content: "Restart your AI platform and ask: \"What's my t2000 balance?\" Your agent handles the rest — 24/7.",
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

const INTEGRATIONS = [
  { name: "Claude Desktop", type: "ai" },
  { name: "Cursor", type: "ai" },
  { name: "Claude Code", type: "ai" },
  { name: "Windsurf", type: "ai" },
  { name: "OpenAI Codex", type: "ai" },
  { name: "GitHub Copilot", type: "ai" },
  { name: "Amp", type: "ai" },
  { name: "OpenClaw", type: "ai" },
  { name: "Any MCP client", type: "ai" },
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
  { feature: "AI integration", coinbase: "—", t2000: "✓ 23 tools + 15 AI prompts + MCP", coinbaseCross: true },
  { feature: "AI Financial Advisor", coinbase: "—", t2000: "✓ MCP server + 15 AI prompts", coinbaseCross: true },
  { feature: "Agent Safeguards", coinbase: "—", t2000: "✓ Per-tx + daily limits + lock", coinbaseCross: true },
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
            href="#integrations"
            className="hidden md:inline text-muted text-xs tracking-[0.08em] uppercase hover:text-foreground transition-colors"
          >
            Integrations
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
            Agentic finance
          </div>

          <h1 className="font-serif text-[40px] sm:text-[clamp(48px,5vw,72px)] leading-[1.05] text-foreground mb-2 font-normal">
            A bank account
            <br />
            for <em className="italic text-accent">AI agents.</em>
          </h1>

          <p className="font-mono text-[12px] sm:text-[13px] text-muted leading-[1.7] mb-8 sm:mb-12 max-w-[420px] mt-4 sm:mt-5">
            Five accounts. Earn, borrow, invest, exchange — autonomously.
          </p>

          <div className="flex gap-2 sm:gap-3 mb-8 sm:mb-12 flex-wrap">
            {[
              { icon: "⟳", label: "Checking", href: "/accounts" },
              { icon: "◈", label: "Savings", href: "/accounts" },
              { icon: "◎", label: "Credit", href: "/accounts" },
              { icon: "◆", label: "Investment", href: "/invest" },
              { icon: "⇌", label: "Exchange", href: "/accounts" },
            ].map((pill) => (
              <Link
                key={pill.label}
                href={pill.href}
                className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 border border-border-bright text-[10px] sm:text-[11px] tracking-[0.06em] flex items-center gap-1.5 sm:gap-2 text-muted transition-all hover:border-accent hover:text-foreground hover:bg-accent-dim"
              >
                <span className="text-xs sm:text-sm">{pill.icon}</span>
                {pill.label}
              </Link>
            ))}
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
            Not just spending. Earning, borrowing, investing, exchanging.
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
            Install. Fund. Connect your AI. Walk away.
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

      {/* ── Works With Everything ── */}
      <section
        id="integrations"
        className="relative z-1 px-6 sm:px-8 lg:px-20 py-16 sm:py-20 lg:py-24 border-t border-border bg-surface overflow-hidden"
      >
        {/* Glow effect */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[radial-gradient(ellipse,rgba(0,214,143,0.06)_0%,transparent_70%)] pointer-events-none" />

        <div className="relative max-w-[900px] mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
              One protocol
            </div>
            <h2 className="font-serif text-[32px] sm:text-[clamp(32px,4vw,52px)] font-normal leading-[1.1] text-foreground mb-5">
              Any AI that speaks{" "}
              <em className="italic text-accent">MCP.</em>
            </h2>
            <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[480px] mx-auto">
              Every new AI platform that supports MCP gets t2000 for free.
              No adapters. No plugins. No code changes.
            </p>
          </div>

          {/* Architecture flow */}
          <div className="mb-12 sm:mb-16">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-4 sm:gap-0 max-w-[700px] mx-auto">
              {/* AI Platforms */}
              <div className="bg-panel border border-border-bright p-5 sm:p-6 text-center">
                <div className="text-[10px] tracking-[0.15em] uppercase text-dim mb-3">Your AI</div>
                <div className="flex flex-col gap-1.5">
                  {["Claude Desktop", "Cursor", "Windsurf", "Any MCP client"].map((name) => (
                    <div key={name} className="text-[11px] text-muted">{name}</div>
                  ))}
                </div>
              </div>

              {/* Arrow */}
              <div className="hidden sm:flex flex-col items-center px-2">
                <div className="w-8 h-px bg-accent/40" />
                <div className="text-[9px] text-accent/60 mt-1">stdio</div>
              </div>
              <div className="sm:hidden flex justify-center">
                <div className="h-6 w-px bg-accent/40" />
              </div>

              {/* MCP Server */}
              <div className="bg-panel border border-accent/30 p-5 sm:p-6 text-center relative">
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] px-2 py-0.5 bg-accent text-background tracking-[0.1em] uppercase font-semibold">
                  MCP
                </div>
                <div className="text-[10px] tracking-[0.15em] uppercase text-accent mb-3">@t2000/mcp</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-accent-dim px-2.5 py-1.5">
                    <div className="text-[18px] sm:text-[20px] font-semibold text-accent leading-none">23</div>
                    <div className="text-[9px] text-accent/70 tracking-wider uppercase">tools</div>
                  </div>
                  <div className="bg-accent-dim px-2.5 py-1.5">
                    <div className="text-[18px] sm:text-[20px] font-semibold text-accent leading-none">15</div>
                    <div className="text-[9px] text-accent/70 tracking-wider uppercase">prompts</div>
                  </div>
                </div>
              </div>

              {/* Arrow */}
              <div className="hidden sm:flex flex-col items-center px-2">
                <div className="w-8 h-px bg-accent/40" />
                <div className="text-[9px] text-accent/60 mt-1">SDK</div>
              </div>
              <div className="sm:hidden flex justify-center">
                <div className="h-6 w-px bg-accent/40" />
              </div>

              {/* Sui */}
              <div className="bg-panel border border-border-bright p-5 sm:p-6 text-center">
                <div className="text-[10px] tracking-[0.15em] uppercase text-dim mb-3">On-chain</div>
                <div className="flex flex-col gap-1.5">
                  {["5 accounts", "DeFi protocols", "Safeguards", "Sui mainnet"].map((item) => (
                    <div key={item} className="text-[11px] text-muted">{item}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Integration pills */}
          <div className="flex flex-wrap justify-center gap-2.5 sm:gap-3 mb-12 sm:mb-16">
            {INTEGRATIONS.map((item, i) => (
              <span
                key={item.name}
                className={`text-[11px] sm:text-[12px] px-3.5 sm:px-4 py-1.5 sm:py-2 border tracking-wide transition-all hover:border-accent hover:text-foreground hover:bg-accent-dim ${
                  i < 2
                    ? "border-accent/30 text-foreground bg-accent-dim"
                    : "border-border-bright text-muted"
                }`}
              >
                {item.name}
              </span>
            ))}
          </div>

          {/* Try asking */}
          <div className="bg-panel border border-border-bright p-6 sm:p-8 max-w-[700px] mx-auto">
            <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-5 flex items-center gap-3">
              <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse-dot" />
              Try asking your AI
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
              {[
                "Move my idle USDC to the highest yield",
                "Send $50 to alice",
                "Invest $200 in the all-weather strategy",
                "Give me a full financial report",
                "Borrow $40 against my savings",
                "What\u2019s my portfolio performance?",
              ].map((q) => (
                <p key={q} className="text-[11px] sm:text-xs text-muted/80 italic flex items-start gap-2">
                  <span className="text-accent/50 text-[10px] mt-px shrink-0">&gt;</span>
                  {q}
                </p>
              ))}
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
            Wallets let agents spend. t2000 gives them a full bank account.
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
            Open source. Non-custodial. Built on Sui.
          </p>

          <div className="mb-6 overflow-x-auto scrollbar-hide">
            <InstallCommand command="curl -fsSL https://t2000.sh/install | bash" />
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
