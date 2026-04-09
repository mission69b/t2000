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
    href: "https://www.npmjs.com/package/@t2000/cli",
  },
  {
    icon: "{ }",
    title: "SDK",
    pkg: "@t2000/sdk",
    desc: "Wallet management, balance queries, transaction building.",
    install: "npm i @t2000/sdk",
    href: "https://www.npmjs.com/package/@t2000/sdk",
  },
  {
    icon: "⟡",
    title: "MCP",
    pkg: "@t2000/mcp",
    desc: "25 tools, 16 prompts. Works with Claude, Cursor, any MCP client.",
    install: "npx @t2000/mcp",
    href: "https://www.npmjs.com/package/@t2000/mcp",
  },
  {
    icon: "◈",
    title: "Engine",
    pkg: "@t2000/engine",
    desc: "Conversational finance runtime. Streaming, tools, sessions.",
    install: "npm i @t2000/engine",
    href: "https://www.npmjs.com/package/@t2000/engine",
  },
  {
    icon: "⇌",
    title: "Gateway",
    pkg: "mpp.t2000.ai",
    desc: "Pay-per-use APIs for agents. No keys, just USDC.",
    install: "POST mpp.t2000.ai/{service}",
    href: "https://mpp.t2000.ai",
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

const THREE_PRODUCTS = [
  {
    tag: "Consumer",
    name: "Audric",
    desc: "The consumer app. Banking by conversation. Sign in with Google. Chat with your money.",
    cta: { label: "Try Audric", href: AUDRIC_URL, primary: true },
  },
  {
    tag: "Gateway",
    name: "Gateway",
    desc: "Pay-per-use API gateway for AI agents. 40+ services, 90+ endpoints. One USDC wallet. No API keys.",
    cta: { label: "mpp.t2000.ai", href: "https://mpp.t2000.ai", primary: false },
    accent: true,
  },
  {
    tag: "Developer",
    name: "Build",
    desc: "SDK, MCP, Engine, CLI. The full stack that powers Audric — open for builders.",
    cta: { label: "See what\u2019s included", href: "#stack", primary: false },
  },
];

const PRIMITIVES = [
  { title: "Non-custodial wallet", desc: "Ed25519 keypair, AES-256-GCM encrypted locally at ~/.t2000/. Export/import anytime." },
  { title: "DeFi access", desc: "Savings at 3\u20138% APY, credit/borrow \u2014 NAVI Protocol on Sui mainnet." },
  { title: "Allowance model", desc: "On-chain scoped permissions. User-funded micropayment budget. Deduct $0.005/day \u2014 never more than the cap." },
  { title: "Intent signing", desc: "Short-lived signed intents. Every autonomous action is cryptographically scoped and time-bounded." },
  { title: "Financial data", desc: "getFinancialSummary(), health factor, rates, yield \u2014 free with the SDK." },
  { title: "Payment rail", desc: "40+ APIs via MPP gateway. No API keys. Pay per request in USDC." },
];

const ARCH_LAYERS = [
  { label: "Layer 1 \u2014 Sui L1", content: "400ms finality \u00B7 USDC \u00B7 PTBs \u00B7 zkLogin primitive" },
  {
    label: "Layer 2 \u2014 Protocols",
    split: [
      { title: "t2000 (owned)", items: "allowance.move \u00B7 treasury.move", sub: "Scoped \u00B7 time-bounded \u00B7 daily-limited" },
      { title: "Third-party (via MCP)", items: "NAVI lending + yield \u00B7 Cetus swaps" },
    ],
  },
  {
    label: "Layer 3 \u2014 t2000 Stack",
    split: [
      { title: "Packages (npm)", items: "@t2000/sdk \u00B7 @t2000/engine \u00B7 @t2000/mcp \u00B7 @t2000/cli \u00B7 @suimpp/mpp" },
      { title: "Services", items: "api.t2000.ai (gas station + indexer) \u00B7 mpp.t2000.ai (gateway, 40+ services)", sub: "Identity: zkLogin via Enoki (web) \u00B7 Ed25519 AES-256-GCM (CLI)" },
    ],
  },
];

export default function Home() {
  return (
    <>
      {/* ── Header ── */}
      <header className="fixed top-0 inset-x-0 z-50 px-4 sm:px-6 lg:px-10 py-3 sm:py-4 flex items-center justify-between border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="font-mono text-[13px] font-medium text-foreground tracking-[0.08em]">
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
            className="px-4 sm:px-5 py-2 min-h-[36px] flex items-center bg-foreground text-background font-mono text-[10px] tracking-[0.12em] uppercase transition-all hover:bg-accent hover:text-foreground"
          >
            Try Audric
          </a>
        </nav>
      </header>

      <div className="min-h-screen bg-background">
        {/* ── Hero ── */}
        <section className="relative z-1 min-h-screen grid grid-cols-1 lg:grid-cols-2 gap-0 pt-16 sm:pt-20">
          <div className="flex flex-col justify-center px-6 sm:px-8 lg:px-16 xl:px-20 py-12 sm:py-16 lg:py-20">
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-accent mb-6 flex items-center gap-3">
              <span className="block w-8 h-px bg-accent" />
              Agentic finance infrastructure
            </div>

            <h1 className="text-[40px] sm:text-[52px] leading-[1.05] tracking-[-2px] text-foreground mb-2 font-normal">
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
                className="px-6 sm:px-8 py-3 sm:py-3.5 min-h-[44px] bg-foreground text-background font-mono text-[10px] tracking-[0.12em] uppercase transition-all hover:bg-accent hover:text-foreground flex items-center gap-2"
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

        {/* ── S2: Three products ── */}
        <section className="relative z-1 px-6 sm:px-8 lg:px-20 py-16 sm:py-20 lg:py-24 border-t border-border bg-surface">
          <div className="max-w-[1000px] mx-auto">
            <div className="mb-10 sm:mb-14">
              <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
                What we build
              </div>
              <h2 className="text-[28px] sm:text-[36px] font-normal leading-[1.1] tracking-[-0.5px] text-foreground">
                Three products. One stack.
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border border border-border">
              {THREE_PRODUCTS.map((p) => (
                <div key={p.name} className={`bg-background p-7 sm:p-8 flex flex-col ${p.accent ? 'border-t-2 border-t-accent' : ''}`}>
                  <div className="font-mono text-[9px] tracking-[0.15em] uppercase text-muted mb-3">{p.tag}</div>
                  <h3 className={`text-[22px] font-semibold mb-3 tracking-tight ${p.accent ? 'text-accent' : 'text-foreground'}`}>{p.name}</h3>
                  <p className="text-[13px] text-muted leading-[1.7] mb-6 flex-1">{p.desc}</p>
                  <a
                    href={p.cta.href}
                    className={`inline-flex items-center gap-2 px-4 py-2 font-mono text-[10px] tracking-[0.12em] uppercase transition-all w-fit ${
                      p.cta.primary
                        ? 'bg-foreground text-background hover:bg-accent hover:text-foreground'
                        : 'border border-border-bright text-muted hover:text-foreground hover:border-foreground'
                    }`}
                  >
                    {p.cta.label} <span aria-hidden="true">&rarr;</span>
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── S3: What you get ── */}
        <section className="relative z-1 px-6 sm:px-8 lg:px-20 py-16 sm:py-20 lg:py-24 border-t border-border">
          <div className="max-w-[900px] mx-auto">
            <div className="mb-10 sm:mb-14">
              <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
                What you get
              </div>
              <h2 className="text-[28px] sm:text-[36px] font-normal leading-[1.1] tracking-[-0.5px] text-foreground mb-4">
                One install. Your agent gets<br />
                <em className="italic text-accent">a financial brain.</em>
              </h2>
              <p className="text-sm text-muted leading-[1.7] max-w-[540px] mt-3">
                Wallet, DeFi access, allowance model, intent signing, payment rail — open source, non-custodial, Sui-native.
              </p>
            </div>

            <div className="border border-border bg-background overflow-hidden">
              <div className="grid grid-cols-1 sm:grid-cols-2">
                {PRIMITIVES.map((item, i) => (
                  <div
                    key={item.title}
                    className={`p-5 sm:p-6 ${
                      i < PRIMITIVES.length - 1 ? 'border-b border-border' : ''
                    } ${i % 2 === 0 ? 'sm:border-r sm:border-border' : ''}`}
                  >
                    <div className="text-[11px] font-semibold text-foreground mb-1">{item.title}</div>
                    <p className="font-mono text-[10px] text-muted leading-[1.7]">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── The stack ── */}
        <section id="stack" className="relative z-1 px-6 sm:px-8 lg:px-20 py-16 sm:py-20 lg:py-24 border-t border-border bg-surface">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-10 items-end mb-10 sm:mb-16">
            <div>
              <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
                For developers
              </div>
              <h2 className="text-[28px] sm:text-[36px] font-normal leading-[1.1] tracking-[-0.5px] text-foreground">
                Five packages.<br />
                <em className="italic text-accent">Pick your depth.</em>
              </h2>
            </div>
            <p className="text-sm text-muted leading-[1.7] max-w-[360px]">
              From a single terminal command to a full conversational finance runtime — every layer is open source and composable.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-px bg-border border border-border">
            {PACKAGES.map((pkg) => (
              <a
                key={pkg.title}
                href={pkg.href}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-surface p-6 sm:p-7 lg:p-8 relative overflow-hidden group transition-colors hover:bg-[rgba(0,214,143,0.03)] no-underline"
              >
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-accent scale-x-0 origin-left transition-transform duration-400 group-hover:scale-x-100" />
                <span className="text-[24px] sm:text-[28px] block mb-3">{pkg.icon}</span>
                <div className="text-base font-medium text-foreground mb-1 tracking-tight">
                  {pkg.title}
                </div>
                <div className="font-mono text-[11px] text-accent tracking-[0.05em] mb-4">
                  {pkg.pkg} <span className="text-dim opacity-0 group-hover:opacity-100 transition-opacity">&rarr;</span>
                </div>
                <p className="text-[13px] text-muted leading-[1.7] mb-5">
                  {pkg.desc}
                </p>
                <div className="font-mono text-[11px] text-accent bg-accent-dim px-3 py-2 tracking-wide overflow-x-auto scrollbar-hide">
                  {pkg.install}
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* ── Architecture ── */}
        <section className="relative z-1 px-6 sm:px-8 lg:px-20 py-16 sm:py-20 lg:py-24 border-t border-border bg-surface">
          <div className="max-w-[700px] mx-auto">
            <div className="text-center mb-10 sm:mb-14">
              <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
                Architecture
              </div>
              <h2 className="text-[28px] sm:text-[36px] font-normal leading-[1.1] tracking-[-0.5px] text-foreground">
                Four layers. One stack.
              </h2>
            </div>

            <div className="flex flex-col items-center">
              {ARCH_LAYERS.map((layer, i) => (
                <div key={layer.label} className="w-full">
                  {i > 0 && (
                    <div className="text-center text-accent text-lg py-1">↓</div>
                  )}
                  <div className="border border-border bg-background p-4 sm:p-5 text-center">
                    <div className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted mb-2">
                      {layer.label}
                    </div>
                    {layer.content && (
                      <div className="text-[13px] font-medium text-foreground">{layer.content}</div>
                    )}
                    {layer.split && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2 text-left">
                        {layer.split.map((col) => (
                          <div key={col.title}>
                            <div className="text-[10px] font-semibold text-accent mb-1">{col.title}</div>
                            <div className="text-[12px] text-foreground">{col.items}</div>
                            {col.sub && <div className="font-mono text-[9px] text-muted mt-1">{col.sub}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <div className="text-center text-accent text-lg py-1">↓</div>
              <div className="grid grid-cols-2 gap-px bg-border border border-border w-full">
                <div className="bg-background p-4 text-center">
                  <div className="font-semibold text-foreground mb-1 text-sm">Audric</div>
                  <div className="font-mono text-[10px] text-muted">Consumer app — audric.ai</div>
                </div>
                <div className="bg-background p-4 text-center">
                  <div className="font-semibold text-foreground mb-1 text-sm">Your app</div>
                  <div className="font-mono text-[10px] text-muted">Build on t2000</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Gateway ── */}
        <section
          id="gateway"
          className="relative z-1 py-16 sm:py-20 lg:py-24 border-t border-border overflow-hidden"
        >
          <div className="relative px-6 sm:px-8 lg:px-20">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-10 items-end mb-10 sm:mb-14">
              <div>
                <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
                  MPP Gateway
                </div>
                <h2 className="text-[28px] sm:text-[36px] font-normal leading-[1.1] tracking-[-0.5px] text-foreground">
                  40+ services.<br />
                  <em className="italic text-accent">No API keys.</em>
                </h2>
              </div>
              <p className="text-sm text-muted leading-[1.7] max-w-[400px]">
                Your agent calls MPP. MPP handles auth, billing, and routing.
                Powered by suimpp. From $0.001/request.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-px bg-border border border-border mb-10 sm:mb-14 max-w-[500px]">
              {[
                { value: "41", label: "Services" },
                { value: "90+", label: "Endpoints" },
                { value: "$0.001", label: "From" },
              ].map((stat) => (
                <div key={stat.label} className="bg-surface px-5 py-5 sm:py-6 text-center">
                  <div className="text-[20px] sm:text-[24px] font-semibold text-foreground leading-none mb-1.5 tracking-tight">
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
            <div className="absolute left-0 top-0 bottom-0 w-16 sm:w-24 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-16 sm:w-24 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
            <div className="flex animate-marquee w-max">
              {[...MPP_SERVICES.slice(0, 16), ...MPP_SERVICES.slice(0, 16)].map((svc, i) => (
                <div
                  key={`m1-${svc.id}-${i}`}
                  className="flex items-center gap-2.5 px-4 sm:px-5 py-3 sm:py-3.5 border border-border bg-background mx-1 sm:mx-1.5 shrink-0"
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
            <div className="absolute left-0 top-0 bottom-0 w-16 sm:w-24 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-16 sm:w-24 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
            <div className="flex animate-marquee-reverse w-max">
              {[...MPP_SERVICES.slice(16), ...MPP_SERVICES.slice(16)].map((svc, i) => (
                <div
                  key={`m2-${svc.id}-${i}`}
                  className="flex items-center gap-2.5 px-4 sm:px-5 py-3 sm:py-3.5 border border-border bg-background mx-1 sm:mx-1.5 shrink-0"
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
              className="inline-flex items-center gap-2 px-6 sm:px-8 py-3 min-h-[40px] bg-foreground text-background font-mono text-[10px] tracking-[0.12em] uppercase transition-all hover:bg-accent hover:text-foreground"
            >
              Explore all services <span aria-hidden="true">&rarr;</span>
            </a>
            <p className="font-mono text-[10px] text-dim tracking-wider uppercase mt-4">
              No signup · Pay per request with USDC
            </p>
          </div>
        </section>

        {/* ── Get started ── */}
        <section
          id="install"
          className="relative z-1 px-6 sm:px-8 lg:px-20 py-16 sm:py-24 lg:py-32 border-t border-border bg-surface text-center overflow-hidden"
        >

          <div className="relative">
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-accent mb-5">
              Get started
            </div>
            <h2 className="text-[28px] sm:text-[36px] font-normal leading-[1.1] tracking-[-0.5px] text-foreground mb-5">
              Start <em className="italic text-accent">building.</em>
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
