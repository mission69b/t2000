import Link from "next/link";
import { TerminalDemo } from "./components/TerminalDemo";
import { InstallCommand } from "./components/InstallCommand";
import { Ticker } from "./components/Ticker";
import { BalanceWidget } from "./components/BalanceWidget";

const GITHUB_URL = "https://github.com/mission69b/t2000";
const NPM_ORG_URL = "https://www.npmjs.com/org/t2000";
const DOCS_URL = "/docs";

const ACCOUNTS = [
  {
    num: "01 / 04",
    icon: "⟳",
    title: "Checking",
    subtitle: "Send · Receive · Balance",
    desc: "The agent's operating account. Send USDC to any Sui address, receive funds, and check balances. Gas is self-funded and auto-topped up when needed.",
    cmd: "t2000 send 10 USDC to 0x8b3e...",
  },
  {
    num: "02 / 04",
    icon: "◈",
    title: "Savings",
    subtitle: "Earn · Yield · NAVI",
    desc: "Idle USDC earns yield automatically via NAVI Protocol (~4–8% APY). Deposits are non-custodial, composable with the borrow account, and withdrawable any time.",
    cmd: "t2000 save all",
  },
  {
    num: "03 / 04",
    icon: "◎",
    title: "Credit",
    subtitle: "Borrow · Repay · NAVI",
    desc: "Borrow USDC against savings collateral without selling the position. Health factor is enforced on-chain. The agent can leverage, operate, and repay autonomously.",
    cmd: "t2000 borrow 40 USDC",
  },
  {
    num: "04 / 04",
    icon: "⇌",
    title: "Exchange",
    subtitle: "Swap · Cetus DEX · On-chain",
    desc: "Exchange any token pair via Cetus DEX. Slippage is enforced on-chain. The agent can rebalance portfolios, acquire gas, or hedge exposure — all autonomously.",
    cmd: "t2000 swap 5 USDC SUI",
  },
];

const STEPS = [
  {
    num: "01",
    title: "Install & init",
    badge: "30s",
    badgeType: "done" as const,
    content:
      "Generates an Ed25519 keypair, encrypts it with AES-256-GCM, and bootstraps the wallet with 10 Gas Station-sponsored transactions.",
    code: "npm install -g @t2000/cli && t2000 init",
  },
  {
    num: "02",
    title: "Fund with USDC",
    badge: "1 min",
    badgeType: "done" as const,
    content:
      "Deposit any amount of USDC to the wallet address. The first send auto-tops up the gas reserve ($1 USDC → SUI). All subsequent transactions are self-funded.",
  },
  {
    num: "03",
    title: "Install skills",
    badge: "Agent Skills",
    badgeType: "new" as const,
    content:
      "Works with Claude Code, Codex, Copilot, Cursor, and 20+ platforms. Your agent now knows when and how to use every t2000 command — no manual wiring.",
    code: "npx skills add t2000/t2000-skills",
  },
  {
    num: "04",
    title: "Operate autonomously",
    badge: "∞",
    badgeType: "new" as const,
    content:
      "The agent checks rates, moves money to savings, borrows when needed, pays for APIs via x402 — all without human approval. You set the rules once; the agent executes.",
  },
];

const X402_STEPS = [
  {
    icon: "→",
    active: true,
    title: "Agent requests API",
    detail: "GET https://data.api.com/prices",
    isCode: true,
  },
  {
    icon: "402",
    active: false,
    title: "Server responds: Payment Required",
    detail: "Amount: $0.01 USDC · Network: Sui · Expires: 60s",
  },
  {
    icon: "✓",
    active: true,
    title: "t2000 signs & broadcasts payment",
    detail: "Sui Payment Kit · 0.01 USDC → 0x8b3e... · ~380ms finality",
  },
  {
    icon: "⬡",
    active: false,
    title: "Facilitator verifies on-chain",
    detail:
      "api.t2000.ai/x402/verify · checks PaymentReceipt · Move enforces no replay",
  },
  {
    icon: "200",
    active: true,
    title: "API returns data",
    detail: "Total round-trip: ~820ms · balance: -$0.01",
  },
];

const SKILLS = [
  { name: "t2000-check-balance", trigger: '"how much USDC do I have?"' },
  { name: "t2000-send", trigger: '"send 10 USDC to 0x8b3e..."' },
  { name: "t2000-save", trigger: '"put idle funds to work"' },
  { name: "t2000-withdraw", trigger: '"I need liquidity now"' },
  { name: "t2000-swap", trigger: '"convert USDC to SUI"' },
  { name: "t2000-borrow", trigger: '"borrow against my savings"' },
  { name: "t2000-repay", trigger: '"pay back what I borrowed"' },
  { name: "t2000-pay", trigger: '"call that paid API"' },
];

const PLATFORMS = [
  "Claude Code",
  "OpenAI Codex",
  "GitHub Copilot",
  "Cursor",
  "VS Code",
  "Amp",
  "Goose",
  "+ 20 more",
];

const COMPARE_ROWS = [
  { feature: "Chain", coinbase: "Base only", t2000: "Sui" },
  { feature: "Send / receive", coinbase: "✓", t2000: "✓", bothCheck: true },
  {
    feature: "Earn yield on savings",
    coinbase: "—",
    t2000: "✓ NAVI (~4–8% APY)",
    coinbaseCross: true,
  },
  {
    feature: "Borrow / credit line",
    coinbase: "—",
    t2000: "✓ Collateralized via NAVI",
    coinbaseCross: true,
  },
  {
    feature: "Token swap / exchange",
    coinbase: "✓ Base tokens",
    t2000: "✓ Cetus DEX",
    bothCheck: true,
  },
  {
    feature: "x402 client",
    coinbase: "✓ Base / Solana",
    t2000: "✓ Sui (first on Sui)",
    bothCheck: true,
  },
  {
    feature: "Agent Skills",
    coinbase: "✓",
    t2000: "✓",
    bothCheck: true,
  },
  {
    feature: "Gas abstraction",
    coinbase: "✓ Gasless (Base)",
    t2000: "✓ Auto-topup (Sui)",
    bothCheck: true,
  },
  {
    feature: "DeFi composability",
    coinbase: "—",
    t2000: "✓ Atomic PTB multi-step",
    coinbaseCross: true,
  },
  {
    feature: "Health factor protection",
    coinbase: "—",
    t2000: "✓ On-chain enforcement",
    coinbaseCross: true,
  },
  {
    feature: "Move-level nonce enforcement",
    coinbase: "— (EIP-3009)",
    t2000: "✓ Sui Payment Kit",
    coinbaseCross: true,
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Grid background */}
      <div className="fixed inset-0 z-0 pointer-events-none bg-[linear-gradient(rgba(0,214,143,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,214,143,0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />

      {/* ── Header ── */}
      <header className="site-nav px-4 sm:px-6 lg:px-10 py-3 sm:py-4 flex items-center justify-between border-b border-border bg-background">
        <div className="font-mono font-semibold text-base sm:text-lg text-accent tracking-tight flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse-dot shadow-[0_0_8px_var(--accent)]" />
          t2000
        </div>
        <nav className="flex items-center gap-4 sm:gap-8">
          <a
            href="#how"
            className="hidden md:inline text-muted text-xs tracking-[0.08em] uppercase hover:text-foreground transition-colors"
          >
            How it works
          </a>
          <a
            href="#skills"
            className="hidden md:inline text-muted text-xs tracking-[0.08em] uppercase hover:text-foreground transition-colors"
          >
            Skills
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
            Your agent can hold money, earn yield, borrow against savings,
            exchange currencies, and pay for APIs — all in one CLI command. No
            human in the loop.
          </p>

          <div className="flex gap-2 sm:gap-3 mb-8 sm:mb-12 flex-wrap">
            {[
              { icon: "⟳", label: "Checking" },
              { icon: "◈", label: "Savings" },
              { icon: "◎", label: "Credit" },
              { icon: "⇌", label: "Exchange" },
              { icon: "⬡", label: "x402 Pay" },
            ].map((pill) => (
              <div
                key={pill.label}
                className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 border border-border-bright text-[10px] sm:text-[11px] tracking-[0.06em] flex items-center gap-1.5 sm:gap-2 text-muted transition-all hover:border-accent hover:text-foreground hover:bg-accent-dim"
              >
                <span className="text-xs sm:text-sm">{pill.icon}</span>
                {pill.label}
              </div>
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
          Four accounts. One agent. Zero friction.
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
              Four accounts
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

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-px bg-border border border-border">
          {ACCOUNTS.map((account) => (
            <div
              key={account.title}
              className="bg-panel p-6 sm:p-7 lg:p-9 relative overflow-hidden group transition-colors hover:bg-[rgba(0,214,143,0.03)]"
            >
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
              <div className="text-[11px] text-accent bg-accent-dim px-3 py-2 tracking-wide overflow-x-auto scrollbar-hide">
                {account.cmd}
              </div>
            </div>
          ))}
        </div>
      </section>

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
            t2000 handles gas sponsorship, key management, DeFi protocol
            integration, and x402 commerce. The agent just calls commands.
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
                  x402 payment flow · live
                </span>
                <span className="text-[10px] px-2 py-0.5 bg-[rgba(74,144,226,0.15)] text-blue tracking-[0.08em]">
                  Sui · USDC
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
                    First x402 client on Sui
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Agent Skills ── */}
      <section
        id="skills"
        className="relative z-1 px-6 sm:px-8 lg:px-20 py-16 sm:py-20 lg:py-24 border-t border-border bg-surface"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-10 items-end mb-10 sm:mb-16">
          <div>
            <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
              Agent Skills
            </div>
            <h2 className="font-serif text-[32px] sm:text-[clamp(32px,4vw,52px)] font-normal leading-[1.1] text-foreground">
              Your agent already knows
              <br />
              how to use{" "}
              <em className="italic text-accent">t2000.</em>
            </h2>
          </div>
          <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[400px]">
            Install once. Works across every major AI platform — Claude, Codex,
            Copilot, Cursor, and more. No manual wiring. The agent understands
            when to save, when to borrow, and when to pay.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20">
          <div>
            {/* Install box */}
            <div className="bg-panel border border-border-bright rounded-sm overflow-hidden mb-6">
              <div className="px-4 py-3 bg-white/[0.02] border-b border-border text-[10px] text-muted tracking-[0.1em] uppercase">
                Install · one command
              </div>
              <div className="px-4 sm:px-5 py-4 text-xs sm:text-sm text-accent flex items-center gap-2.5 overflow-x-auto scrollbar-hide">
                <span className="text-muted shrink-0">$</span>
                <span className="whitespace-nowrap">npx skills add t2000/t2000-skills</span>
              </div>
            </div>

            {/* Skills grid */}
            <div className="flex flex-col gap-px bg-border border border-border overflow-hidden">
              {SKILLS.map((skill) => (
                <div
                  key={skill.name}
                  className="grid grid-cols-1 sm:grid-cols-[180px_1fr] bg-panel transition-colors hover:bg-[rgba(0,214,143,0.03)]"
                >
                  <div className="px-4 py-2.5 sm:py-3.5 text-xs text-accent sm:border-r border-border">
                    {skill.name}
                  </div>
                  <div className="px-4 pb-2.5 sm:py-3.5 text-xs text-muted italic">
                    {skill.trigger}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-muted text-[13px] leading-[1.8] mb-8">
              Agent Skills is the open standard for portable AI capabilities. A
              skill is a markdown file — it tells the agent what to do and when
              to do it. Skills install into the agent&apos;s context and activate
              automatically when relevant.
            </p>
            <p className="text-muted text-[13px] leading-[1.8] mb-8">
              t2000 skills include precise trigger phrases, step-by-step
              instructions, pre-flight safety checks, and error handling
              guidance — so the agent executes financial operations correctly,
              every time.
            </p>
            <div>
              <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-3">
                Works with
              </div>
              <div className="flex flex-wrap gap-2 mt-5">
                {PLATFORMS.map((p) => (
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
            Coinbase Agentic Wallet is excellent for Base. t2000 is the only
            option with a complete banking stack on Sui — including yield,
            credit, and x402 commerce.
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
                  <td className="px-5 py-4 border-b border-border text-foreground bg-[rgba(0,214,143,0.03)] border-l border-r border-l-accent/10 border-r-accent/10">
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
                  <div className="text-[11px] leading-[1.5] text-foreground">
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
            <a
              href={`${GITHUB_URL}/tree/main/t2000-skills`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 sm:px-7 py-3.5 sm:py-4 bg-transparent text-muted font-mono text-xs tracking-[0.1em] uppercase border border-border-bright rounded-sm transition-all hover:text-foreground hover:border-foreground"
            >
              Skills package →
            </a>
            <Link
              href={DOCS_URL}
              className="px-5 sm:px-7 py-3.5 sm:py-4 bg-transparent text-muted font-mono text-xs tracking-[0.1em] uppercase border border-border-bright rounded-sm transition-all hover:text-foreground hover:border-foreground"
            >
              Docs →
            </Link>
          </div>

          <div className="text-[10px] sm:text-[11px] text-dim tracking-wide mt-6">
            MIT · Non-custodial · Sui mainnet & testnet
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-1 px-6 sm:px-8 lg:px-20 py-6 sm:py-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
        <div className="text-xs text-dim">t2000 · Built on Sui</div>
        <div className="flex gap-4 sm:gap-6 flex-wrap justify-center">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-dim tracking-wide hover:text-muted transition-colors"
          >
            GitHub
          </a>
          <a
            href={`${GITHUB_URL}/tree/main/t2000-skills`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-dim tracking-wide hover:text-muted transition-colors"
          >
            Skills
          </a>
          <Link
            href={DOCS_URL}
            className="text-[11px] text-dim tracking-wide hover:text-muted transition-colors"
          >
            Docs
          </Link>
        </div>
      </footer>
    </div>
  );
}
