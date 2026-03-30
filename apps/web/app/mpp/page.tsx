import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "t2000 — MPP Payments on Sui",
  description:
    "Accept Sui USDC payments on any API. 5 lines of code. Your AI agent pays automatically. Built on MPP by Stripe + Tempo.",
  openGraph: {
    title: "t2000 — MPP Payments on Sui",
    description:
      "Accept Sui USDC payments on any API. 5 lines of code. Your AI agent pays automatically.",
    type: "website",
  },
};

const GITHUB_URL = "https://github.com/mission69b/t2000";
const NPM_URL = "https://www.npmjs.com/package/@t2000/mpp-sui";
const MPP_URL = "https://mpp.dev";

const HOW_IT_WORKS = [
  {
    step: "1",
    title: "Agent requests a resource",
    desc: "Any HTTP request — GET, POST, whatever. The agent doesn't know if it costs money yet.",
    code: "POST https://mpp.t2000.ai/openai/v1/chat/completions",
  },
  {
    step: "2",
    title: "API returns 402 Payment Required",
    desc: "The MPP challenge tells the client exactly what to pay: amount, currency, recipient.",
    code: "402 → { amount: '0.01', currency: 'USDC', recipient: '0x...' }",
  },
  {
    step: "3",
    title: "Agent pays on Sui",
    desc: "The mppx client builds a USDC transfer, signs it with the agent's keypair, and broadcasts to Sui.",
    code: "build USDC transfer → sign → broadcast → finalized in ~400ms",
  },
  {
    step: "4",
    title: "Agent retries with proof",
    desc: "The credential (Sui transaction digest) is sent back. Server verifies on-chain, delivers content.",
    code: "POST /v1/chat/completions + x-payment-credential: { digest: '...' } → 200 OK",
  },
];

export default function MppPage() {
  return (
    <main className="min-h-screen bg-background text-foreground relative z-10">
      <div className="fixed inset-0 z-0 pointer-events-none bg-[linear-gradient(rgba(0,214,143,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,214,143,0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6">
        {/* ── Back link ── */}
        <div className="pt-8 sm:pt-12">
          <Link
            href="/"
            className="inline-block text-muted hover:text-accent text-xs font-mono mb-8 transition-colors"
          >
            ← t2000.ai
          </Link>
        </div>

        {/* ── Hero ── */}
        <section className="pb-16 sm:pb-24 border-b border-border">
          <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-6 flex items-center gap-3">
            <span className="block w-8 h-px bg-accent" />
            Machine Payments Protocol
          </div>

          <h1 className="font-serif text-[36px] sm:text-[clamp(42px,5vw,64px)] leading-[1.05] text-foreground mb-4 font-normal tracking-tight">
            Sui payments
            <br />
            <em className="italic text-accent">for MPP.</em>
          </h1>

          <p className="font-mono text-[12px] sm:text-[13px] text-muted leading-[1.7] max-w-[520px] mt-5">
            Accept USDC on any API. 5 lines of code.
            <br />
            Your AI agent pays automatically.
          </p>

          <div className="flex items-center gap-3 sm:gap-5 mt-8 sm:mt-10 flex-wrap">
            <a
              href={NPM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 sm:px-7 py-3 sm:py-3.5 bg-accent text-background font-mono text-[11px] sm:text-xs font-semibold tracking-[0.1em] uppercase transition-all hover:bg-[#00f0a0] hover:shadow-[0_0_40px_var(--accent-glow)] hover:-translate-y-px"
            >
              npm install @t2000/mpp-sui →
            </a>
            <a
              href={MPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 sm:px-7 py-3 sm:py-3.5 bg-transparent text-muted font-mono text-[11px] sm:text-xs tracking-[0.1em] uppercase border border-border-bright transition-all hover:text-foreground hover:border-foreground"
            >
              What is MPP? →
            </a>
          </div>

          <div className="flex items-center gap-4 mt-6 text-[10px] sm:text-[11px] text-muted/50 tracking-wide">
            <span>Stripe + Tempo standard</span>
            <span className="text-muted/20">·</span>
            <span>Sui USDC</span>
            <span className="text-muted/20">·</span>
            <span>40 services, 88 endpoints</span>
            <span className="text-muted/20">·</span>
            <span>Open source</span>
          </div>
        </section>

        {/* ── Accept Payments (Server) ── */}
        <section className="py-16 sm:py-24 border-b border-border">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div>
              <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
                For API Developers
              </div>
              <h2 className="font-serif text-[28px] sm:text-[clamp(28px,3.5vw,42px)] font-normal leading-[1.1] text-foreground mb-6 tracking-tight">
                Accept payments.{" "}
                <em className="italic text-accent">5 lines.</em>
              </h2>
              <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[460px] mb-8">
                No webhooks. No Stripe dashboard. No KYC.
                Your API returns 402 — the agent pays — content delivered.
              </p>
              <div className="space-y-3">
                {[
                  "Works with any MPP-compatible client",
                  "Payments settle on Sui in seconds",
                  "USDC arrives directly in your wallet",
                  "No intermediary, no fees beyond gas",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <span className="text-accent text-xs mt-0.5">▸</span>
                    <span className="text-[12px] text-muted">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-panel border border-border-bright rounded-sm overflow-hidden">
              <div className="px-4 py-3 bg-white/[0.02] border-b border-border flex items-center justify-between">
                <span className="text-[10px] tracking-[0.1em] text-muted uppercase">
                  api/route.ts
                </span>
                <span className="text-[10px] px-2 py-0.5 bg-accent-dim text-accent tracking-[0.08em]">
                  Server
                </span>
              </div>
              <pre className="px-5 py-5 text-[11px] sm:text-[12px] font-mono leading-[2] overflow-x-auto scrollbar-hide">
                <span className="text-muted">{"import"}</span>
                <span className="text-foreground">{" { sui }"}</span>
                <span className="text-muted">{" from "}</span>
                <span className="text-accent">{`'@t2000/mpp-sui/server'`}</span>
                <span className="text-muted">;</span>
                {"\n"}
                <span className="text-muted">{"import"}</span>
                <span className="text-foreground">{" { Mppx }"}</span>
                <span className="text-muted">{" from "}</span>
                <span className="text-accent">{`'mppx'`}</span>
                <span className="text-muted">;</span>
                {"\n\n"}
                <span className="text-muted">{"const"}</span>
                <span className="text-foreground">{" mppx"}</span>
                <span className="text-muted">{" = "}</span>
                <span className="text-foreground">{"Mppx.create"}</span>
                <span className="text-muted">{"({"}</span>
                {"\n"}
                <span className="text-muted">{"  methods: ["}</span>
                <span className="text-foreground">{"sui"}</span>
                <span className="text-muted">{"({"}</span>
                {"\n"}
                <span className="text-muted">{"    currency: "}</span>
                <span className="text-accent">{"SUI_USDC"}</span>
                <span className="text-muted">{","}</span>
                {"\n"}
                <span className="text-muted">{"    recipient: "}</span>
                <span className="text-accent">{`'0xYOUR_ADDRESS'`}</span>
                {"\n"}
                <span className="text-muted">{"  })]\n});"}</span>
                {"\n\n"}
                <span className="text-muted">{"export const "}</span>
                <span className="text-foreground">{"GET"}</span>
                <span className="text-muted">{" = mppx."}</span>
                <span className="text-foreground">{"charge"}</span>
                <span className="text-muted">{"({ "}</span>
                <span className="text-foreground">{"amount"}</span>
                <span className="text-muted">{": "}</span>
                <span className="text-accent">{`'0.01'`}</span>
                <span className="text-muted">{" })("}</span>
                {"\n"}
                <span className="text-muted">{"  () => "}</span>
                <span className="text-foreground">{"Response.json"}</span>
                <span className="text-muted">{"({ "}</span>
                <span className="text-accent">{"data"}</span>
                <span className="text-muted">{": "}</span>
                <span className="text-accent">{`'paid content'`}</span>
                <span className="text-muted">{" })"}</span>
                {"\n"}
                <span className="text-muted">{");"}</span>
              </pre>
            </div>
          </div>
        </section>

        {/* ── Agent Pays (Client) ── */}
        <section className="py-16 sm:py-24 border-b border-border">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div className="order-2 lg:order-1">
              <div className="bg-panel border border-border-bright rounded-sm overflow-hidden">
                <div className="px-4 py-3 bg-white/[0.02] border-b border-border flex items-center justify-between">
                  <span className="text-[10px] tracking-[0.1em] text-muted uppercase">
                    agent.ts
                  </span>
                  <span className="text-[10px] px-2 py-0.5 bg-accent-dim text-accent tracking-[0.08em]">
                    Client
                  </span>
                </div>
                <pre className="px-5 py-5 text-[11px] sm:text-[12px] font-mono leading-[2] overflow-x-auto scrollbar-hide">
                  <span className="text-muted">{"import"}</span>
                  <span className="text-foreground">{" { T2000 }"}</span>
                  <span className="text-muted">{" from "}</span>
                  <span className="text-accent">{`'@t2000/sdk'`}</span>
                  <span className="text-muted">;</span>
                  {"\n\n"}
                  <span className="text-muted">{"const"}</span>
                  <span className="text-foreground">{" agent"}</span>
                  <span className="text-muted">{" = new "}</span>
                  <span className="text-foreground">{"T2000"}</span>
                  <span className="text-muted">{"();"}</span>
                  {"\n\n"}
                  <span className="text-muted">{"const"}</span>
                  <span className="text-foreground">{" result"}</span>
                  <span className="text-muted">{" = await agent."}</span>
                  <span className="text-accent">{"pay"}</span>
                  <span className="text-muted">{"({"}</span>
                  {"\n"}
                  <span className="text-muted">{"  url: "}</span>
                  <span className="text-accent">{`'https://mpp.t2000.ai/openai/v1/chat/completions'`}</span>
                  <span className="text-muted">{","}</span>
                  {"\n"}
                  <span className="text-muted">{"  body: { model: "}</span>
                  <span className="text-accent">{`'gpt-4o'`}</span>
                  <span className="text-muted">{", ... },"}</span>
                  {"\n"}
                  <span className="text-muted">{"  maxPrice: "}</span>
                  <span className="text-foreground">{"0.05"}</span>
                  {"\n"}
                  <span className="text-muted">{"});"}</span>
                  {"\n\n"}
                  <span className="text-muted/50">{"// If the API returns 402, agent pays automatically."}</span>
                  {"\n"}
                  <span className="text-muted/50">{"// USDC transferred on Sui. Content returned."}</span>
                </pre>
              </div>
            </div>

            <div className="order-1 lg:order-2">
              <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
                For AI Agents
              </div>
              <h2 className="font-serif text-[28px] sm:text-[clamp(28px,3.5vw,42px)] font-normal leading-[1.1] text-foreground mb-6 tracking-tight">
                Your agent{" "}
                <em className="italic text-accent">pays.</em>
              </h2>
              <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[460px] mb-8">
                No API keys. No credit cards. Just money.
                The agent pays from its Sui USDC balance — automatically.
              </p>

              <div className="bg-panel border border-border-bright rounded-sm overflow-hidden">
                <div className="px-4 py-3 bg-white/[0.02] border-b border-border text-[10px] text-muted tracking-[0.1em] uppercase">
                  What the user sees
                </div>
                <pre className="px-5 py-5 text-[12px] sm:text-[13px] font-mono leading-[1.8] overflow-x-auto scrollbar-hide">
                  <span className="text-accent">You:</span>
                  {" "}
                  <span className="text-foreground">&quot;Ask GPT-4o to summarize this PDF&quot;</span>
                  {"\n\n"}
                  <span className="text-accent">Claude:</span>
                  {" "}
                  <span className="text-foreground">&quot;Done. Paid $0.01 USDC from your</span>
                  {"\n"}
                  <span className="text-foreground">{"        "}t2000 balance. Here&apos;s the summary.&quot;</span>
                </pre>
              </div>
            </div>
          </div>
        </section>

        {/* ── How It Works ── */}
        <section className="py-16 sm:py-24 border-b border-border">
          <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-6 flex items-center gap-3">
            <span className="block w-8 h-px bg-accent" />
            How It Works
          </div>

          <h2 className="font-serif text-[28px] sm:text-[36px] leading-[1.1] text-foreground mb-4 font-normal">
            The 402 flow.{" "}
            <em className="italic text-accent">4 steps.</em>
          </h2>

          <p className="font-mono text-[12px] text-muted leading-[1.7] max-w-[520px] mb-10">
            Like a browser discovering a paywall — but for machines.
            No pre-registration. No API keys. Just HTTP.
          </p>

          <div className="space-y-px bg-border">
            {HOW_IT_WORKS.map((item) => (
              <div
                key={item.step}
                className="bg-background p-6 sm:p-8 relative group hover:bg-panel transition-colors"
              >
                <div className="flex items-start gap-5 sm:gap-8">
                  <div className="text-accent text-[28px] sm:text-[32px] font-serif italic leading-none pt-1 min-w-[32px]">
                    {item.step}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-foreground text-sm sm:text-base font-medium mb-2 tracking-tight">
                      {item.title}
                    </h3>
                    <p className="text-muted text-[11px] sm:text-[12px] leading-[1.7] mb-3 max-w-[480px]">
                      {item.desc}
                    </p>
                    <code className="text-[10px] sm:text-[11px] text-accent/70 bg-accent-dim px-2.5 py-1 tracking-wide inline-block">
                      {item.code}
                    </code>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── CLI + MCP ── */}
        <section className="py-16 sm:py-24 border-b border-border">
          <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
            Multiple Interfaces
          </div>
          <h2 className="font-serif text-[28px] sm:text-[clamp(28px,3.5vw,42px)] font-normal leading-[1.1] text-foreground mb-6 tracking-tight">
            CLI, SDK, or{" "}
            <em className="italic text-accent">AI.</em>
          </h2>
          <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[520px] mb-10">
            Pay for APIs from the terminal, your code, or through natural conversation with Claude.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-panel border border-border-bright rounded-sm overflow-hidden">
              <div className="px-4 py-3 bg-white/[0.02] border-b border-border text-[10px] text-muted tracking-[0.1em] uppercase">
                CLI
              </div>
              <pre className="px-5 py-5 text-[11px] sm:text-[12px] font-mono leading-[1.9] overflow-x-auto scrollbar-hide">
                <span className="text-foreground">{"❯ t2000 pay \\"}</span>
                {"\n"}
                <span className="text-muted">{"    mpp.t2000.ai/openai/v1/chat/completions \\"}</span>
                {"\n"}
                <span className="text-muted">{"    --max-price 0.05"}</span>
                {"\n\n"}
                <span className="text-accent">{"  ✓ Paid $0.01 USDC"}</span>
                {"\n"}
                <span className="text-muted">{"  tx: 7xK2m...9fQ3"}</span>
                {"\n"}
                <span className="text-muted">{"  → 200 OK (1.2s)"}</span>
              </pre>
            </div>

            <div className="bg-panel border border-border-bright rounded-sm overflow-hidden">
              <div className="px-4 py-3 bg-white/[0.02] border-b border-border text-[10px] text-muted tracking-[0.1em] uppercase">
                SDK
              </div>
              <pre className="px-5 py-5 text-[11px] sm:text-[12px] font-mono leading-[1.9] overflow-x-auto scrollbar-hide">
                <span className="text-muted">{"const result = "}</span>
                {"\n"}
                <span className="text-muted">{"  await agent."}</span>
                <span className="text-accent">{"pay"}</span>
                <span className="text-muted">{"({"}</span>
                {"\n"}
                <span className="text-muted">{"    url, body,"}</span>
                {"\n"}
                <span className="text-muted">{"    maxPrice: "}</span>
                <span className="text-foreground">{"0.05"}</span>
                {"\n"}
                <span className="text-muted">{"  });"}</span>
                {"\n\n"}
                <span className="text-muted/50">{"// Handles 402 → pay → retry"}</span>
                {"\n"}
                <span className="text-muted/50">{"// automatically."}</span>
              </pre>
            </div>

            <div className="bg-panel border border-border-bright rounded-sm overflow-hidden">
              <div className="px-4 py-3 bg-white/[0.02] border-b border-border flex items-center justify-between">
                <span className="text-[10px] tracking-[0.1em] text-muted uppercase">
                  MCP
                </span>
                <span className="text-[10px] px-2 py-0.5 bg-accent-dim text-accent tracking-[0.08em]">
                  Claude
                </span>
              </div>
              <pre className="px-5 py-5 text-[12px] sm:text-[13px] font-mono leading-[1.8] overflow-x-auto scrollbar-hide">
                <span className="text-accent">You:</span>
                {"\n"}
                <span className="text-foreground">&quot;Ask GPT-4o what</span>
                {"\n"}
                <span className="text-foreground">{"  it thinks about Sui&quot;"}</span>
                {"\n\n"}
                <span className="text-accent">Claude:</span>
                {"\n"}
                <span className="text-muted/50">{"→ calls t2000_pay"}</span>
                {"\n"}
                <span className="text-muted/50">{"→ pays $0.03 USDC"}</span>
                {"\n"}
                <span className="text-muted/50">{"→ returns image"}</span>
              </pre>
            </div>
          </div>
        </section>

        {/* ── Why Sui ── */}
        <section className="py-16 sm:py-24 border-b border-border">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div>
              <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
                Why Sui
              </div>
              <h2 className="font-serif text-[28px] sm:text-[clamp(28px,3.5vw,42px)] font-normal leading-[1.1] text-foreground mb-6 tracking-tight">
                Built for{" "}
                <em className="italic text-accent">machines.</em>
              </h2>
              <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[460px]">
                MPP is chain-agnostic. We chose Sui because
                agent payments need speed, low cost, and finality.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-px bg-border border border-border">
              {[
                { label: "Finality", value: "~400ms", desc: "Sub-second settlement" },
                { label: "Gas", value: "<$0.001", desc: "Negligible per payment" },
                { label: "USDC", value: "Native", desc: "Circle-issued on Sui" },
                { label: "Standard", value: "MPP", desc: "Stripe + Tempo protocol" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="bg-panel p-5 sm:p-7 group hover:bg-[rgba(0,214,143,0.03)] transition-colors"
                >
                  <div className="text-[10px] text-muted tracking-[0.1em] uppercase mb-2">
                    {stat.label}
                  </div>
                  <div className="text-lg sm:text-xl font-medium text-foreground mb-1 tracking-tight">
                    {stat.value}
                  </div>
                  <div className="text-[11px] text-muted">{stat.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Open Standard ── */}
        <section className="py-16 sm:py-24 border-b border-border">
          <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-6 flex items-center gap-3">
            <span className="block w-8 h-px bg-accent" />
            Open Standard
          </div>

          <h2 className="font-serif text-[28px] sm:text-[36px] leading-[1.1] text-foreground mb-4 font-normal">
            Not a proprietary protocol.{" "}
            <em className="italic text-accent">A standard.</em>
          </h2>

          <p className="font-mono text-[12px] text-muted leading-[1.7] max-w-[520px] mb-10">
            MPP is an open standard by Stripe and Tempo Labs.{" "}
            <code className="text-accent bg-accent-dim px-1.5 py-0.5">@t2000/mpp-sui</code>{" "}
            is one payment method. Any MPP client can pay any MPP server.
          </p>

          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                title: "@t2000/mpp-sui",
                desc: "Sui USDC payment method for MPP. Use it standalone or with the t2000 SDK.",
                link: NPM_URL,
                linkText: "npm →",
              },
              {
                title: "mppx",
                desc: "The official MPP TypeScript SDK by Stripe + Tempo. Client and server.",
                link: "https://www.npmjs.com/package/mppx",
                linkText: "npm →",
              },
              {
                title: "mpp.dev",
                desc: "The MPP spec, ecosystem, and documentation. Learn the standard.",
                link: MPP_URL,
                linkText: "Read →",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="border border-border-bright rounded-sm p-6 hover:border-accent/30 transition-colors"
              >
                <div className="font-mono text-sm text-accent mb-2">{item.title}</div>
                <p className="text-[11px] text-muted leading-[1.7] mb-4">{item.desc}</p>
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-accent hover:underline tracking-wide"
                >
                  {item.linkText}
                </a>
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
            Accept Sui payments.
            <br />
            <em className="italic text-accent">Today.</em>
          </h2>
          <p className="text-muted text-[12px] sm:text-[13px] max-w-[460px] mx-auto mb-8 sm:mb-10 leading-[1.8]">
            Open source. No intermediary. Built on Sui.
          </p>

          <div className="inline-block bg-panel border border-border-bright rounded-sm px-6 py-4 mb-8 sm:mb-10">
            <code className="font-mono text-sm sm:text-base text-foreground tracking-wide">
              npm install <span className="text-accent">@t2000/mpp-sui</span>
            </code>
          </div>

          <div className="flex justify-center gap-3 sm:gap-4 flex-wrap">
            <a
              href="https://mpp.t2000.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 sm:px-7 py-3.5 sm:py-4 bg-accent text-background font-mono text-xs font-semibold tracking-[0.1em] uppercase transition-all hover:bg-[#00f0a0] hover:shadow-[0_0_40px_var(--accent-glow)] hover:-translate-y-px"
            >
              Browse services →
            </a>
            <Link
              href="/docs"
              className="px-5 sm:px-7 py-3.5 sm:py-4 bg-transparent text-muted font-mono text-xs tracking-[0.1em] uppercase border border-border-bright transition-all hover:text-foreground hover:border-foreground"
            >
              Read the docs →
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 sm:px-7 py-3.5 sm:py-4 bg-transparent text-muted font-mono text-xs tracking-[0.1em] uppercase border border-border-bright transition-all hover:text-foreground hover:border-foreground"
            >
              View on GitHub →
            </a>
          </div>

          <div className="text-[10px] sm:text-[11px] text-muted/40 tracking-wide mt-6">
            MIT · Open source · Sui mainnet
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="pt-8 pb-10 border-t border-border text-center">
          <p className="text-muted text-xs">
            t2000 — A bank account for AI agents.{" "}
            <Link href="/" className="text-accent hover:underline">
              Home
            </Link>
            {" · "}
            <Link href="/docs" className="text-accent hover:underline">
              Docs
            </Link>
            {" · "}
            <Link href="/demo" className="text-accent hover:underline">
              Demos
            </Link>
            {" · "}
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
