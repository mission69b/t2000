import Link from "next/link";
import { TerminalDemo } from "./components/TerminalDemo";
import { InstallCommand } from "./components/InstallCommand";

const GITHUB_URL = "https://github.com/mission69b/t2000";
const TWITTER_URL = "https://x.com/t2000ai";
const DISCORD_URL = "https://discord.gg/qE95FPt6Z5";
const AUDRIC_URL = "https://audric.ai";

const PACKAGES = [
  {
    num: "01 / 05",
    icon: "▸",
    title: "CLI",
    pkg: "@t2000/cli",
    desc: "Terminal-first agent banking. Save, send, borrow, pay, and manage — all from the command line.",
    install: "npm i -g @t2000/cli",
    cmd: "t2000 save all",
  },
  {
    num: "02 / 05",
    icon: "{ }",
    title: "SDK",
    pkg: "@t2000/sdk",
    desc: "TypeScript SDK for agent wallets. Wallet management, balance queries, transaction building, protocol adapters.",
    install: "npm i @t2000/sdk",
    cmd: "const agent = new T2000({ keyfile })",
  },
  {
    num: "03 / 05",
    icon: "⟡",
    title: "MCP",
    pkg: "@t2000/mcp",
    desc: "25 tools, 16 prompts. Connect Claude Desktop, Cursor, or any MCP-compatible client to t2000.",
    install: "npx @t2000/mcp",
    cmd: "t2000_save · t2000_send · t2000_balance",
  },
  {
    num: "04 / 05",
    icon: "◈",
    title: "Engine",
    pkg: "@t2000/engine",
    desc: "Conversational finance runtime. QueryEngine with streaming, tool system, confirmation flow, session management.",
    install: "npm i @t2000/engine",
    cmd: "engine.submitMessage('Save my idle cash')",
  },
  {
    num: "05 / 05",
    icon: "⇌",
    title: "Gateway",
    pkg: "mpp.t2000.ai",
    desc: "Pay-per-use APIs for agents. 40+ services, no API keys. Your agent pays per request with USDC on Sui.",
    install: "POST mpp.t2000.ai/{service}/...",
    cmd: "HTTP 402 → pay $0.01 → 200 OK",
  },
];

const STEPS = [
  {
    num: "01",
    title: "Install",
    badge: "30s",
    content: "One command. Wallet, MCP, safeguards — all guided.",
    code: "npm i -g @t2000/cli && t2000 init",
  },
  {
    num: "02",
    title: "Fund",
    badge: "1 min",
    content: "Send USDC to the wallet address. Gas and routing are automatic.",
  },
  {
    num: "03",
    title: "Connect",
    badge: "done",
    content: "Point your AI platform at the MCP server. Ask: \"What's my t2000 balance?\" It handles the rest.",
  },
];

const MPP_SERVICES = [
  { name: "OpenAI", id: "openai", detail: "GPT-4o · DALL-E · Whisper" },
  { name: "Anthropic", id: "anthropic", detail: "Claude Sonnet · Opus" },
  { name: "Google Gemini", id: "gemini", detail: "2.5 Flash · Pro" },
  { name: "DeepSeek", id: "deepseek", detail: "V3 · R1 Reasoning" },
  { name: "Groq", id: "groq", detail: "Ultra-fast inference" },
  { name: "Perplexity", id: "perplexity", detail: "Web-grounded answers" },
  { name: "Together AI", id: "together", detail: "Open-source models" },
  { name: "Replicate", id: "replicate", detail: "1000s of ML models" },
  { name: "fal.ai", id: "fal", detail: "Flux · Recraft images" },
  { name: "Stability AI", id: "stability", detail: "Stable Diffusion 3" },
  { name: "ElevenLabs", id: "elevenlabs", detail: "Voice synthesis" },
  { name: "AssemblyAI", id: "assemblyai", detail: "Transcription + AI" },
  { name: "Brave Search", id: "brave", detail: "Web · News · Video" },
  { name: "Exa", id: "exa", detail: "Semantic search" },
  { name: "Serper", id: "serper", detail: "Google SERP JSON" },
  { name: "SerpAPI", id: "serpapi", detail: "Multi-engine search" },
  { name: "Firecrawl", id: "firecrawl", detail: "Scrape · Crawl" },
  { name: "Jina Reader", id: "jina", detail: "URL to markdown" },
  { name: "NewsAPI", id: "newsapi", detail: "150k+ news sources" },
  { name: "CoinGecko", id: "coingecko", detail: "Crypto market data" },
  { name: "Alpha Vantage", id: "alphavantage", detail: "Stock quotes" },
  { name: "OpenWeather", id: "openweather", detail: "Weather forecasts" },
  { name: "Google Maps", id: "googlemaps", detail: "Geocode · Places" },
  { name: "Resend", id: "resend", detail: "Transactional email" },
  { name: "Lob", id: "lob", detail: "Physical mail API" },
  { name: "DeepL", id: "deepl", detail: "AI translation" },
  { name: "Judge0", id: "judge0", detail: "Code execution" },
  { name: "Mistral", id: "mistral", detail: "Mistral Large · Codestral" },
  { name: "Cohere", id: "cohere", detail: "Chat · Embed · Rerank" },
  { name: "VirusTotal", id: "virustotal", detail: "Security scanning" },
  { name: "Short.io", id: "shortio", detail: "URL shortener" },
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

export default function Home() {
  return (
    <>
      {/* ── Header ── */}
      <header className="fixed top-0 inset-x-0 z-50 px-4 sm:px-6 lg:px-10 py-3 sm:py-4 flex items-center justify-between border-b border-border bg-background">
        <div className="font-mono text-sm sm:text-base text-accent tracking-[0.08em] flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse-dot shadow-[0_0_8px_var(--accent)]" />
          t2000
        </div>
        <nav className="flex items-center gap-4 sm:gap-8">
          <a
            href="https://audric.ai/docs"
            className="hidden md:inline font-mono text-[10px] tracking-[0.12em] text-muted uppercase hover:text-foreground transition-colors min-h-[36px] flex items-center"
          >
            Docs
          </a>
          <a
            href="https://mpp.t2000.ai"
            className="hidden md:inline font-mono text-[10px] tracking-[0.12em] text-muted uppercase hover:text-foreground transition-colors min-h-[36px] flex items-center"
          >
            Gateway
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:inline font-mono text-[10px] tracking-[0.12em] text-muted uppercase hover:text-foreground transition-colors min-h-[36px] flex items-center"
          >
            GitHub
          </a>
          <a
            href="#install"
            className="px-4 sm:px-5 py-2 min-h-[36px] flex items-center bg-foreground text-background font-mono text-[10px] tracking-[0.12em] uppercase transition-all hover:opacity-80"
          >
            Install
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
              Agentic finance infrastructure
            </div>

            <h1 className="font-serif text-[40px] sm:text-[clamp(48px,5vw,72px)] leading-[1.05] text-foreground mb-2 font-normal">
              The infrastructure
              <br />
              behind <em className="italic text-accent">Audric.</em>
            </h1>

            <p className="text-sm text-muted leading-[1.7] mb-8 sm:mb-12 max-w-[440px] mt-4 sm:mt-5">
              CLI, SDK, MCP server, conversational engine, and pay-per-use API gateway. Open source. Non-custodial. Built on Sui.
            </p>

            <div className="flex items-center gap-3 sm:gap-5 flex-wrap">
              <a
                href="#install"
                className="px-6 sm:px-8 py-3 sm:py-3.5 min-h-[40px] bg-foreground text-background font-mono text-[10px] tracking-[0.12em] uppercase transition-all hover:opacity-80"
              >
                Get started
              </a>
              <a
                href="https://audric.ai/docs"
                className="px-6 sm:px-8 py-3 sm:py-3.5 min-h-[40px] text-muted font-mono text-[10px] tracking-[0.12em] uppercase border border-border-bright transition-all hover:text-foreground hover:border-foreground"
              >
                Documentation
              </a>
            </div>

            <a
              href={AUDRIC_URL}
              className="mt-8 text-[11px] text-dim tracking-wide hover:text-muted transition-colors inline-flex items-center gap-2"
            >
              Looking for the consumer app? <span className="text-accent">audric.ai &#8594;</span>
            </a>
          </div>

          <div className="flex items-center justify-center px-6 sm:px-8 lg:px-5 xl:px-20 py-8 lg:py-20 relative">
            <div className="relative w-full max-w-[520px]">
              <TerminalDemo />
            </div>
          </div>
        </section>

        {/* ── Packages ── */}
        <section id="packages" className="relative z-1 px-6 sm:px-8 lg:px-20 py-16 sm:py-20 lg:py-24 border-t border-border">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-10 items-end mb-10 sm:mb-16">
            <div>
              <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
                Five packages
              </div>
              <h2 className="font-serif text-[32px] sm:text-[clamp(32px,4vw,52px)] font-normal leading-[1.1] text-foreground">
                Five packages.
                <br />
                One <em className="italic text-accent">stack.</em>
              </h2>
            </div>
            <p className="text-sm text-muted leading-[1.7] max-w-[400px]">
              From terminal commands to full conversational finance — pick the integration level that fits.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-px bg-border border border-border">
            {PACKAGES.map((pkg) => (
              <div
                key={pkg.title}
                className="bg-panel p-6 sm:p-7 lg:p-9 relative overflow-hidden group transition-colors hover:bg-[rgba(0,214,143,0.03)]"
              >
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-accent scale-x-0 origin-left transition-transform duration-400 group-hover:scale-x-100" />
                <div className="text-[10px] tracking-[0.15em] text-dim mb-4 sm:mb-5">
                  {pkg.num}
                </div>
                <span className="text-[24px] sm:text-[28px] block mb-3 sm:mb-4">{pkg.icon}</span>
                <div className="text-base font-medium text-foreground mb-1 tracking-tight">
                  {pkg.title}
                </div>
                <div className="text-[11px] text-accent tracking-[0.05em] mb-4 sm:mb-5">
                  {pkg.pkg}
                </div>
                <p className="text-[13px] text-muted leading-[1.7] mb-5 sm:mb-6">
                  {pkg.desc}
                </p>
                <div className="text-[11px] text-accent bg-accent-dim px-3 py-2 tracking-wide overflow-x-auto scrollbar-hide">
                  {pkg.install}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── How It Works ── */}
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
            <p className="text-sm text-muted leading-[1.7] max-w-[400px]">
              Install. Fund. Connect your AI. Walk away.
            </p>
          </div>

          <div className="flex flex-col max-w-[600px]">
            {STEPS.map((step, i) => (
              <div
                key={step.num}
                className={`group grid grid-cols-[40px_1fr] gap-5 py-7 border-b border-border ${i === 0 ? "border-t" : ""}`}
              >
                <div className="text-[11px] text-dim pt-1 tracking-wide">
                  {step.num}
                </div>
                <div>
                  <div className="text-sm text-foreground mb-2 font-medium flex items-center gap-3">
                    {step.title}
                    <span className="text-[10px] px-2 py-0.5 tracking-[0.08em] bg-accent-dim text-accent">
                      {step.badge}
                    </span>
                  </div>
                  <div className="text-[13px] text-muted leading-[1.7]">
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
        </section>

        {/* ── Services ── */}
        <section
          id="services"
          className="relative z-1 py-16 sm:py-20 lg:py-24 border-t border-border bg-surface overflow-hidden"
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,214,143,0.04)_0%,transparent_60%)] pointer-events-none" />

          <div className="relative px-6 sm:px-8 lg:px-20">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-10 items-end mb-10 sm:mb-14">
              <div>
                <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
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
                { value: "90", label: "Endpoints" },
                { value: "$0.001", label: "Starting price" },
              ].map((stat) => (
                <div key={stat.label} className="bg-panel px-5 py-5 sm:py-6 text-center">
                  <div className="text-[24px] sm:text-[32px] font-semibold text-accent leading-none mb-1.5">
                    {stat.value}
                  </div>
                  <div className="text-[10px] sm:text-[11px] tracking-[0.1em] uppercase text-muted">
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
                  className="flex items-center gap-2.5 px-4 sm:px-5 py-3 sm:py-3.5 border border-border bg-panel mx-1 sm:mx-1.5 shrink-0"
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
                  className="flex items-center gap-2.5 px-4 sm:px-5 py-3 sm:py-3.5 border border-border bg-panel mx-1 sm:mx-1.5 shrink-0"
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

          <div className="px-6 sm:px-8 lg:px-20">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="https://mpp.t2000.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 sm:px-8 py-3 sm:py-3.5 min-h-[40px] bg-foreground text-background font-mono text-[10px] tracking-[0.12em] uppercase transition-all hover:opacity-80"
              >
                Explore all services
              </a>
              <div className="text-[11px] text-dim tracking-wide">
                No signup required · Pay per request with USDC
              </div>
            </div>
          </div>
        </section>

        {/* ── Integrations ── */}
        <section
          id="integrations"
          className="relative z-1 px-6 sm:px-8 lg:px-20 py-16 sm:py-20 lg:py-24 border-t border-border"
        >
          <div className="max-w-[900px] mx-auto">
            <div className="text-center mb-12 sm:mb-16">
              <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
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

            {/* Architecture flow */}
            <div className="mb-12 sm:mb-16">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-4 sm:gap-0 max-w-[700px] mx-auto">
                <div className="bg-panel border border-border-bright p-5 sm:p-6 text-center">
                  <div className="text-[10px] tracking-[0.15em] uppercase text-dim mb-3">Your AI</div>
                  <div className="flex flex-col gap-1.5">
                    {["Claude Desktop", "Cursor", "Windsurf", "Any MCP client"].map((name) => (
                      <div key={name} className="text-[11px] text-muted">{name}</div>
                    ))}
                  </div>
                </div>
                <div className="hidden sm:flex flex-col items-center px-2">
                  <div className="w-8 h-px bg-accent/40" />
                  <div className="text-[9px] text-accent/60 mt-1">stdio</div>
                </div>
                <div className="sm:hidden flex justify-center">
                  <div className="h-6 w-px bg-accent/40" />
                </div>
                <div className="bg-panel border border-accent/30 p-5 sm:p-6 text-center relative">
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] px-2 py-0.5 bg-accent text-background tracking-[0.1em] uppercase font-semibold">
                    MCP
                  </div>
                  <div className="text-[10px] tracking-[0.15em] uppercase text-accent mb-3">@t2000/mcp</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-accent-dim px-2.5 py-1.5">
                      <div className="text-[18px] sm:text-[20px] font-semibold text-accent leading-none">25</div>
                      <div className="text-[9px] text-accent/70 tracking-wider uppercase">tools</div>
                    </div>
                    <div className="bg-accent-dim px-2.5 py-1.5">
                      <div className="text-[18px] sm:text-[20px] font-semibold text-accent leading-none">16</div>
                      <div className="text-[9px] text-accent/70 tracking-wider uppercase">prompts</div>
                    </div>
                  </div>
                </div>
                <div className="hidden sm:flex flex-col items-center px-2">
                  <div className="w-8 h-px bg-accent/40" />
                  <div className="text-[9px] text-accent/60 mt-1">SDK</div>
                </div>
                <div className="sm:hidden flex justify-center">
                  <div className="h-6 w-px bg-accent/40" />
                </div>
                <div className="bg-panel border border-border-bright p-5 sm:p-6 text-center">
                  <div className="text-[10px] tracking-[0.15em] uppercase text-dim mb-3">On-chain</div>
                  <div className="flex flex-col gap-1.5">
                    {["Savings + Credit", "Payments (MPP)", "Send + Receive", "Sui mainnet"].map((item) => (
                      <div key={item} className="text-[11px] text-muted">{item}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-2.5 sm:gap-3">
              {INTEGRATIONS.map((name, i) => (
                <span
                  key={name}
                  className={`text-[11px] sm:text-[12px] px-3.5 sm:px-4 py-1.5 sm:py-2 border tracking-wide transition-all hover:border-accent hover:text-foreground hover:bg-accent-dim ${
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

        {/* ── Audric CTA ── */}
        <section className="relative z-1 px-6 sm:px-8 lg:px-20 py-16 sm:py-20 border-t border-border bg-surface">
          <div className="max-w-[700px] mx-auto text-center">
            <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
              For consumers
            </div>
            <h2 className="font-serif text-[28px] sm:text-[clamp(28px,3.5vw,42px)] font-normal leading-[1.1] text-foreground mb-5">
              Meet <em className="italic text-accent">Audric.</em>
            </h2>
            <p className="text-sm text-muted leading-[1.7] max-w-[460px] mx-auto mb-8">
              Banking by conversation. Sign in with email, talk to your money, earn yield.
              No seed phrase, no gas fees, no crypto jargon. Powered by t2000 infrastructure.
            </p>
            <a
              href={AUDRIC_URL}
              className="inline-flex items-center gap-2 px-6 sm:px-8 py-3 sm:py-3.5 min-h-[40px] bg-foreground text-background font-mono text-[10px] tracking-[0.12em] uppercase transition-all hover:opacity-80"
            >
              audric.ai &#8594;
            </a>
          </div>
        </section>

        {/* ── Install CTA ── */}
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
              Start{" "}
              <em className="italic text-accent">building.</em>
            </h2>
            <p className="text-sm text-muted max-w-[500px] mx-auto mb-8 sm:mb-12 leading-[1.7]">
              Open source. Non-custodial. MIT licensed. Built on Sui.
            </p>

            <div className="mb-6 overflow-x-auto scrollbar-hide">
              <InstallCommand command="curl -fsSL https://t2000.ai/install.sh | bash" />
            </div>

            <div className="flex justify-center gap-3 sm:gap-4 mt-6 flex-wrap">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 sm:px-7 py-3 min-h-[40px] text-muted font-mono text-[10px] tracking-[0.12em] uppercase border border-border-bright transition-all hover:text-foreground hover:border-foreground"
              >
                GitHub
              </a>
              <a
                href="https://audric.ai/docs"
                className="px-5 sm:px-7 py-3 min-h-[40px] text-muted font-mono text-[10px] tracking-[0.12em] uppercase border border-border-bright transition-all hover:text-foreground hover:border-foreground"
              >
                Docs
              </a>
            </div>

            <div className="text-[10px] sm:text-[11px] text-dim tracking-wide mt-6">
              MIT · Non-custodial · Sui mainnet
            </div>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="relative z-1 px-6 sm:px-8 lg:px-20 py-6 sm:py-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="font-mono text-[10px] tracking-[0.1em] text-dim uppercase">
            t2000 · The infrastructure behind Audric
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
