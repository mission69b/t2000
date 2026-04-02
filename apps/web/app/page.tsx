import Link from "next/link";
import { TerminalDemo } from "./components/TerminalDemo";
import { InstallCommand } from "./components/InstallCommand";

const GITHUB_URL = "https://github.com/mission69b/t2000";
const TWITTER_URL = "https://x.com/t2000ai";
const DISCORD_URL = "https://discord.gg/qE95FPt6Z5";
const AUDRIC_URL = "https://audric.ai";

const PACKAGES = [
  {
    icon: "▸",
    title: "CLI",
    pkg: "@t2000/cli",
    desc: "Save, send, borrow, pay — all from the command line.",
    install: "npm i -g @t2000/cli",
  },
  {
    icon: "{ }",
    title: "SDK",
    pkg: "@t2000/sdk",
    desc: "Wallet management, balance queries, transaction building.",
    install: "npm i @t2000/sdk",
  },
  {
    icon: "⟡",
    title: "MCP",
    pkg: "@t2000/mcp",
    desc: "25 tools, 16 prompts. Works with Claude, Cursor, any MCP client.",
    install: "npx @t2000/mcp",
  },
  {
    icon: "◈",
    title: "Engine",
    pkg: "@t2000/engine",
    desc: "Conversational finance runtime. Streaming, tools, sessions.",
    install: "npm i @t2000/engine",
  },
  {
    icon: "⇌",
    title: "Gateway",
    pkg: "mpp.t2000.ai",
    desc: "Pay-per-use APIs for agents. No keys, just USDC.",
    install: "POST mpp.t2000.ai/{service}",
  },
];

const MPP_SERVICES = [
  { name: "OpenAI", id: "openai" },
  { name: "Anthropic", id: "anthropic" },
  { name: "Google Gemini", id: "gemini" },
  { name: "DeepSeek", id: "deepseek" },
  { name: "Groq", id: "groq" },
  { name: "Perplexity", id: "perplexity" },
  { name: "Together AI", id: "together" },
  { name: "Replicate", id: "replicate" },
  { name: "fal.ai", id: "fal" },
  { name: "Stability AI", id: "stability" },
  { name: "ElevenLabs", id: "elevenlabs" },
  { name: "AssemblyAI", id: "assemblyai" },
  { name: "Brave Search", id: "brave" },
  { name: "Exa", id: "exa" },
  { name: "Serper", id: "serper" },
  { name: "SerpAPI", id: "serpapi" },
  { name: "Firecrawl", id: "firecrawl" },
  { name: "Jina Reader", id: "jina" },
  { name: "NewsAPI", id: "newsapi" },
  { name: "CoinGecko", id: "coingecko" },
  { name: "Alpha Vantage", id: "alphavantage" },
  { name: "OpenWeather", id: "openweather" },
  { name: "Google Maps", id: "googlemaps" },
  { name: "Resend", id: "resend" },
  { name: "Lob", id: "lob" },
  { name: "DeepL", id: "deepl" },
  { name: "Judge0", id: "judge0" },
  { name: "Mistral", id: "mistral" },
  { name: "Cohere", id: "cohere" },
  { name: "VirusTotal", id: "virustotal" },
  { name: "Short.io", id: "shortio" },
];

const INTEGRATIONS = [
  "Claude Desktop",
  "Cursor",
  "Claude Code",
  "Windsurf",
  "OpenAI Codex",
  "GitHub Copilot",
  "Amp",
  "Any MCP client",
];

const PRODUCTS = [
  { name: "Savings", desc: "Earn yield on USDC", icon: "◎" },
  { name: "Pay", desc: "APIs via micropayments", icon: "⬡" },
  { name: "Send", desc: "Instant USDC transfers", icon: "→" },
  { name: "Credit", desc: "Borrow against savings", icon: "⊞" },
  { name: "Receive", desc: "Accept payments", icon: "↙" },
];

export default function Home() {
  return (
    <>
      {/* ── Header ── */}
      <header className="fixed top-0 inset-x-0 z-50 px-4 sm:px-6 lg:px-10 py-3 sm:py-4 flex items-center justify-between border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="font-mono text-sm text-accent tracking-[0.08em] flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse-dot shadow-[0_0_8px_var(--accent)]" />
          t2000
        </div>
        <nav className="flex items-center gap-4 sm:gap-6">
          <Link
            href="/docs"
            className="hidden md:flex items-center font-mono text-[10px] tracking-[0.12em] text-muted uppercase hover:text-foreground transition-colors min-h-[36px]"
          >
            Docs
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:flex items-center font-mono text-[10px] tracking-[0.12em] text-muted uppercase hover:text-foreground transition-colors min-h-[36px]"
          >
            GitHub
          </a>
          <a
            href="https://mpp.t2000.ai"
            className="hidden md:flex items-center font-mono text-[10px] tracking-[0.12em] text-muted uppercase hover:text-foreground transition-colors min-h-[36px]"
          >
            Gateway
          </a>
          <a
            href={AUDRIC_URL}
            className="px-4 sm:px-5 py-2 min-h-[36px] flex items-center bg-foreground text-background font-mono text-[10px] tracking-[0.12em] uppercase transition-all hover:opacity-80"
          >
            Try Audric
          </a>
        </nav>
      </header>

      <div className="min-h-screen bg-background">
        <div className="fixed inset-0 z-0 pointer-events-none bg-[linear-gradient(rgba(0,214,143,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,214,143,0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />

        {/* ── Hero ── */}
        <section className="relative z-1 min-h-screen grid grid-cols-1 lg:grid-cols-2 gap-0 pt-16 sm:pt-20">
          <div className="flex flex-col justify-center px-6 sm:px-8 lg:px-16 xl:px-20 py-12 sm:py-16 lg:py-20">
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-accent mb-6 flex items-center gap-3">
              <span className="block w-8 h-px bg-accent" />
              Agentic finance infrastructure
            </div>

            <h1 className="font-serif text-[40px] sm:text-[clamp(48px,5vw,72px)] leading-[1.05] text-foreground mb-2 font-normal">
              The engine behind
              <br />
              <em className="italic text-accent">Audric.</em>
            </h1>

            <p className="text-sm sm:text-base text-muted leading-[1.7] mb-8 sm:mb-10 max-w-[460px] mt-4 sm:mt-5">
              CLI, SDK, MCP server, conversational engine, and pay-per-use API gateway.
              Open source. Non-custodial. Built on Sui.
            </p>

            <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
              <a
                href={AUDRIC_URL}
                className="px-6 sm:px-8 py-3 sm:py-3.5 min-h-[44px] bg-foreground text-background font-mono text-[10px] tracking-[0.12em] uppercase transition-all hover:opacity-80 flex items-center gap-2"
              >
                Try Audric <span aria-hidden="true">&rarr;</span>
              </a>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 sm:px-8 py-3 sm:py-3.5 min-h-[44px] text-muted font-mono text-[10px] tracking-[0.12em] uppercase border border-border-bright transition-all hover:text-foreground hover:border-foreground flex items-center"
              >
                GitHub
              </a>
            </div>
          </div>

          <div className="flex items-center justify-center px-6 sm:px-8 lg:px-5 xl:px-20 py-8 lg:py-20 relative">
            <div className="relative w-full max-w-[520px]">
              <TerminalDemo />
            </div>
          </div>
        </section>

        {/* ── What Audric does — the product showcase ── */}
        <section className="relative z-1 px-6 sm:px-8 lg:px-20 py-16 sm:py-20 lg:py-24 border-t border-border bg-surface">
          <div className="max-w-[900px] mx-auto">
            <div className="text-center mb-10 sm:mb-14">
              <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
                The product
              </div>
              <h2 className="font-serif text-[28px] sm:text-[clamp(32px,4vw,48px)] font-normal leading-[1.1] text-foreground mb-4">
                Audric is banking by conversation.
              </h2>
              <p className="text-sm text-muted leading-[1.7] max-w-[520px] mx-auto">
                Sign in with Google. Talk to your money. Earn yield, pay for APIs, send USDC,
                borrow against savings — all by chat. No seed phrase. No crypto jargon.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-border border border-border mb-10">
              {PRODUCTS.map((p) => (
                <div key={p.name} className="bg-surface p-4 sm:p-5 text-center">
                  <div className="text-lg sm:text-xl mb-2 text-accent">{p.icon}</div>
                  <div className="text-sm font-medium text-foreground mb-1">{p.name}</div>
                  <div className="text-xs text-muted">{p.desc}</div>
                </div>
              ))}
            </div>

            <div className="text-center">
              <a
                href={AUDRIC_URL}
                className="inline-flex items-center gap-2 px-6 py-3 min-h-[40px] bg-foreground text-background font-mono text-[10px] tracking-[0.12em] uppercase transition-all hover:opacity-80"
              >
                Try Audric <span aria-hidden="true">&rarr;</span>
              </a>
            </div>
          </div>
        </section>

        {/* ── The stack ── */}
        <section id="stack" className="relative z-1 px-6 sm:px-8 lg:px-20 py-16 sm:py-20 lg:py-24 border-t border-border">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-10 items-end mb-10 sm:mb-16">
            <div>
              <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
                For developers
              </div>
              <h2 className="font-serif text-[32px] sm:text-[clamp(32px,4vw,52px)] font-normal leading-[1.1] text-foreground">
                Five packages.
                <br />
                One <em className="italic text-accent">stack.</em>
              </h2>
            </div>
            <p className="text-sm text-muted leading-[1.7] max-w-[400px]">
              From terminal commands to full conversational finance —
              pick the integration level that fits.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-px bg-border border border-border">
            {PACKAGES.map((pkg) => (
              <div
                key={pkg.title}
                className="bg-surface p-6 sm:p-7 lg:p-8 relative overflow-hidden group transition-colors hover:bg-[rgba(0,214,143,0.03)]"
              >
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-accent scale-x-0 origin-left transition-transform duration-400 group-hover:scale-x-100" />
                <span className="text-[24px] sm:text-[28px] block mb-3">{pkg.icon}</span>
                <div className="text-base font-medium text-foreground mb-1 tracking-tight">
                  {pkg.title}
                </div>
                <div className="font-mono text-[11px] text-accent tracking-[0.05em] mb-4">
                  {pkg.pkg}
                </div>
                <p className="text-[13px] text-muted leading-[1.7] mb-5">
                  {pkg.desc}
                </p>
                <div className="font-mono text-[11px] text-accent bg-accent-dim px-3 py-2 tracking-wide overflow-x-auto scrollbar-hide">
                  {pkg.install}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Gateway ── */}
        <section
          id="gateway"
          className="relative z-1 py-16 sm:py-20 lg:py-24 border-t border-border bg-surface overflow-hidden"
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,214,143,0.04)_0%,transparent_60%)] pointer-events-none" />

          <div className="relative px-6 sm:px-8 lg:px-20">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-10 items-end mb-10 sm:mb-14">
              <div>
                <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
                  MPP Gateway
                </div>
                <h2 className="font-serif text-[32px] sm:text-[clamp(32px,4vw,52px)] font-normal leading-[1.1] text-foreground">
                  40+ services.
                  <br />
                  <em className="italic text-accent">No API keys.</em>
                </h2>
              </div>
              <p className="text-sm text-muted leading-[1.7] max-w-[400px]">
                Your agent calls MPP. MPP handles auth, billing, and routing.
                From $0.001 per request.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-px bg-border border border-border mb-10 sm:mb-14">
              {[
                { value: "41", label: "Services" },
                { value: "90+", label: "Endpoints" },
                { value: "$0.001", label: "Starting price" },
              ].map((stat) => (
                <div key={stat.label} className="bg-surface px-5 py-5 sm:py-6 text-center">
                  <div className="text-[24px] sm:text-[32px] font-medium text-foreground leading-none mb-1.5">
                    {stat.value}
                  </div>
                  <div className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Marquee row 1 */}
          <div className="relative mb-2.5 overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-16 sm:w-24 bg-gradient-to-r from-[var(--surface)] to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-16 sm:w-24 bg-gradient-to-l from-[var(--surface)] to-transparent z-10 pointer-events-none" />
            <div className="flex animate-marquee w-max">
              {[...MPP_SERVICES.slice(0, 16), ...MPP_SERVICES.slice(0, 16)].map((svc, i) => (
                <div
                  key={`m1-${svc.id}-${i}`}
                  className="flex items-center gap-2.5 px-4 sm:px-5 py-3 sm:py-3.5 border border-border bg-surface mx-1 sm:mx-1.5 shrink-0"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://mpp.t2000.ai/logos/${svc.id}.svg`}
                    alt=""
                    width={18}
                    height={18}
                    className="opacity-70"
                  />
                  <span className="text-[11px] sm:text-xs text-foreground whitespace-nowrap tracking-wide">
                    {svc.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Marquee row 2 (reverse) */}
          <div className="relative mb-10 sm:mb-14 overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-16 sm:w-24 bg-gradient-to-r from-[var(--surface)] to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-16 sm:w-24 bg-gradient-to-l from-[var(--surface)] to-transparent z-10 pointer-events-none" />
            <div className="flex animate-marquee-reverse w-max">
              {[...MPP_SERVICES.slice(16), ...MPP_SERVICES.slice(16)].map((svc, i) => (
                <div
                  key={`m2-${svc.id}-${i}`}
                  className="flex items-center gap-2.5 px-4 sm:px-5 py-3 sm:py-3.5 border border-border bg-surface mx-1 sm:mx-1.5 shrink-0"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://mpp.t2000.ai/logos/${svc.id}.svg`}
                    alt=""
                    width={18}
                    height={18}
                    className="opacity-70"
                  />
                  <span className="text-[11px] sm:text-xs text-foreground whitespace-nowrap tracking-wide">
                    {svc.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="px-6 sm:px-8 lg:px-20 text-center">
            <a
              href="https://mpp.t2000.ai/services"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 sm:px-8 py-3 min-h-[40px] bg-foreground text-background font-mono text-[10px] tracking-[0.12em] uppercase transition-all hover:opacity-80"
            >
              Explore all services <span aria-hidden="true">&rarr;</span>
            </a>
            <p className="font-mono text-[10px] text-dim tracking-wider uppercase mt-4">
              No signup · Pay per request with USDC
            </p>
          </div>
        </section>

        {/* ── Integrations ── */}
        <section
          id="integrations"
          className="relative z-1 px-6 sm:px-8 lg:px-20 py-16 sm:py-20 lg:py-24 border-t border-border"
        >
          <div className="max-w-[900px] mx-auto">
            <div className="text-center mb-12 sm:mb-16">
              <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
                Integrations
              </div>
              <h2 className="font-serif text-[32px] sm:text-[clamp(32px,4vw,52px)] font-normal leading-[1.1] text-foreground mb-5">
                Any AI that speaks{" "}
                <em className="italic text-accent">MCP.</em>
              </h2>
              <p className="text-sm text-muted leading-[1.7] max-w-[480px] mx-auto">
                Every AI platform that supports MCP gets t2000 for free.
                No adapters. No plugins. No code changes.
              </p>
            </div>

            <div className="mb-12 sm:mb-16">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-4 sm:gap-0 max-w-[700px] mx-auto">
                <div className="bg-surface border border-border-bright p-5 sm:p-6 text-center">
                  <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-dim mb-3">Your AI</div>
                  <div className="flex flex-col gap-1.5">
                    {["Claude Desktop", "Cursor", "Windsurf", "Any MCP client"].map((name) => (
                      <div key={name} className="text-[12px] text-muted">{name}</div>
                    ))}
                  </div>
                </div>
                <div className="hidden sm:flex flex-col items-center px-2">
                  <div className="w-8 h-px bg-accent/40" />
                  <div className="font-mono text-[9px] text-accent/60 mt-1">stdio</div>
                </div>
                <div className="sm:hidden flex justify-center">
                  <div className="h-6 w-px bg-accent/40" />
                </div>
                <div className="bg-surface border border-accent/30 p-5 sm:p-6 text-center relative">
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 font-mono text-[9px] px-2 py-0.5 bg-accent text-background tracking-[0.1em] uppercase font-medium">
                    MCP
                  </div>
                  <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-accent mb-3">@t2000/mcp</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-accent-dim px-2.5 py-1.5">
                      <div className="text-[18px] sm:text-[20px] font-medium text-accent leading-none">25</div>
                      <div className="font-mono text-[9px] text-accent/70 tracking-wider uppercase">tools</div>
                    </div>
                    <div className="bg-accent-dim px-2.5 py-1.5">
                      <div className="text-[18px] sm:text-[20px] font-medium text-accent leading-none">16</div>
                      <div className="font-mono text-[9px] text-accent/70 tracking-wider uppercase">prompts</div>
                    </div>
                  </div>
                </div>
                <div className="hidden sm:flex flex-col items-center px-2">
                  <div className="w-8 h-px bg-accent/40" />
                  <div className="font-mono text-[9px] text-accent/60 mt-1">SDK</div>
                </div>
                <div className="sm:hidden flex justify-center">
                  <div className="h-6 w-px bg-accent/40" />
                </div>
                <div className="bg-surface border border-border-bright p-5 sm:p-6 text-center">
                  <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-dim mb-3">On-chain</div>
                  <div className="flex flex-col gap-1.5">
                    {["Savings + Credit", "Payments (MPP)", "Send + Receive", "Sui mainnet"].map((item) => (
                      <div key={item} className="text-[12px] text-muted">{item}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-2.5 sm:gap-3">
              {INTEGRATIONS.map((name, i) => (
                <span
                  key={name}
                  className={`font-mono text-[10px] tracking-[0.08em] uppercase px-3.5 sm:px-4 py-1.5 sm:py-2 border transition-all hover:border-accent hover:text-foreground hover:bg-accent-dim ${
                    i < 2
                      ? "border-accent/30 text-foreground bg-accent-dim"
                      : "border-border-bright text-muted"
                  }`}
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── Get started ── */}
        <section
          id="install"
          className="relative z-1 px-6 sm:px-8 lg:px-20 py-16 sm:py-24 lg:py-32 border-t border-border text-center overflow-hidden"
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] sm:w-[600px] h-[300px] sm:h-[400px] bg-[radial-gradient(ellipse,rgba(0,214,143,0.08)_0%,transparent_70%)] pointer-events-none" />

          <div className="relative">
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-accent mb-5">
              Get started
            </div>
            <h2 className="font-serif text-[32px] sm:text-[clamp(32px,4vw,52px)] font-normal leading-[1.1] text-foreground mb-5">
              Start{" "}
              <em className="italic text-accent">building.</em>
            </h2>
            <p className="text-sm text-muted max-w-[500px] mx-auto mb-8 sm:mb-12 leading-[1.7]">
              Open source. Non-custodial. MIT licensed. Built on Sui.
            </p>

            <div className="mb-6 overflow-x-auto scrollbar-hide">
              <InstallCommand command="npm i -g @t2000/cli && t2000 init" />
            </div>

            <div className="flex justify-center gap-3 sm:gap-4 mt-6 flex-wrap">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 sm:px-7 py-3 min-h-[40px] flex items-center text-muted font-mono text-[10px] tracking-[0.12em] uppercase border border-border-bright transition-all hover:text-foreground hover:border-foreground"
              >
                GitHub
              </a>
              <Link
                href="/docs"
                className="px-5 sm:px-7 py-3 min-h-[40px] flex items-center text-muted font-mono text-[10px] tracking-[0.12em] uppercase border border-border-bright transition-all hover:text-foreground hover:border-foreground"
              >
                Docs
              </Link>
            </div>

            <div className="font-mono text-[10px] text-dim tracking-wider uppercase mt-6">
              MIT · Non-custodial · Sui mainnet
            </div>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="relative z-1 px-6 sm:px-8 lg:px-20 py-6 sm:py-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="font-mono text-[10px] tracking-[0.1em] text-dim uppercase">
            t2000 · The engine behind Audric
          </div>
          <nav className="flex gap-4 sm:gap-5 flex-wrap justify-center">
            <a href="https://mpp.t2000.ai" target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] tracking-[0.1em] text-dim uppercase hover:text-muted transition-colors">Gateway</a>
            <a href="https://www.npmjs.com/package/@t2000/cli" target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] tracking-[0.1em] text-dim uppercase hover:text-muted transition-colors">npm</a>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] tracking-[0.1em] text-dim uppercase hover:text-muted transition-colors">GitHub</a>
            <a href={TWITTER_URL} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] tracking-[0.1em] text-dim uppercase hover:text-muted transition-colors">X</a>
            <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] tracking-[0.1em] text-dim uppercase hover:text-muted transition-colors">Discord</a>
            <a href="https://suimpp.dev" target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] tracking-[0.1em] text-dim uppercase hover:text-muted transition-colors">suimpp</a>
            <a href={AUDRIC_URL} className="font-mono text-[10px] tracking-[0.1em] text-accent uppercase hover:text-foreground transition-colors">Audric</a>
            <Link href="/terms" className="font-mono text-[10px] tracking-[0.1em] text-dim uppercase hover:text-muted transition-colors">Terms</Link>
            <Link href="/privacy" className="font-mono text-[10px] tracking-[0.1em] text-dim uppercase hover:text-muted transition-colors">Privacy</Link>
          </nav>
        </footer>
      </div>
    </>
  );
}
