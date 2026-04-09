import Link from "next/link";

export const metadata = {
  title: "Docs — t2000",
  description:
    "Developer hub for t2000 CLI, SDK, MCP, Engine, and Gateway.",
};

const GITHUB_URL = "https://github.com/mission69b/t2000";

const PACKAGES = [
  {
    title: "CLI",
    pkg: "@t2000/cli",
    desc: "Terminal-first agent banking. Save, send, borrow, pay, and manage wallets from the command line.",
    install: "npm i -g @t2000/cli",
    npm: "https://www.npmjs.com/package/@t2000/cli",
    github: `${GITHUB_URL}/tree/main/packages/cli`,
    commands: [
      "t2000 init",
      "t2000 balance",
      "t2000 save <amount>",
      "t2000 send <address> <amount>",
      "t2000 borrow <amount>",
      "t2000 pay",
    ],
  },
  {
    title: "SDK",
    pkg: "@t2000/sdk",
    desc: "TypeScript SDK for agent wallets. Wallet management, balance queries, transaction building, and protocol adapters.",
    install: "npm i @t2000/sdk",
    npm: "https://www.npmjs.com/package/@t2000/sdk",
    github: `${GITHUB_URL}/tree/main/packages/sdk`,
    commands: [
      "import { T2000 } from '@t2000/sdk'",
      "const agent = new T2000({ keyfile })",
      "await agent.balance()",
      "await agent.save(amount)",
    ],
  },
  {
    title: "MCP",
    pkg: "@t2000/mcp",
    desc: "25 tools, 16 prompts. Connect Claude Desktop, Cursor, or any MCP-compatible client to t2000 infrastructure.",
    install: "npx @t2000/mcp",
    npm: "https://www.npmjs.com/package/@t2000/mcp",
    github: `${GITHUB_URL}/tree/main/packages/mcp`,
    commands: [
      "t2000_balance",
      "t2000_save",
      "t2000_send",
      "t2000_borrow",
      "t2000_rates",
      "t2000_health",
    ],
  },
  {
    title: "Engine",
    pkg: "@t2000/engine",
    desc: "Conversational finance runtime. QueryEngine with streaming, tool system, confirmation flow, and session management.",
    install: "npm i @t2000/engine",
    npm: "https://www.npmjs.com/package/@t2000/engine",
    github: `${GITHUB_URL}/tree/main/packages/engine`,
    commands: [
      "import { QueryEngine } from '@t2000/engine'",
      "const engine = new QueryEngine({ ... })",
      "engine.submitMessage('Save my idle cash')",
    ],
  },
  {
    title: "Gateway",
    pkg: "mpp.t2000.ai",
    desc: "Pay-per-use API gateway for agents. 40+ services, 90+ endpoints. No API keys — your agent pays per request with USDC on Sui.",
    install: "POST mpp.t2000.ai/{service}/{endpoint}",
    npm: null,
    github: `${GITHUB_URL}/tree/main/apps/gateway`,
    commands: [
      "HTTP 402 → pay $0.01 → 200 OK",
      "GET  /api/services",
      "POST /openai/chat/completions",
      "POST /anthropic/messages",
    ],
  },
];

const RESOURCES = [
  {
    label: "GitHub",
    href: GITHUB_URL,
    desc: "Source code, issues, discussions",
  },
  {
    label: "Gateway Explorer",
    href: "https://mpp.t2000.ai/services",
    desc: "Browse all 40+ API services",
  },
  {
    label: "suimpp Protocol",
    href: "https://suimpp.dev",
    desc: "Micropayment protocol specification",
  },
  {
    label: "npm",
    href: "https://www.npmjs.com/org/t2000",
    desc: "Published packages",
  },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-50 px-4 sm:px-6 lg:px-10 py-3 sm:py-4 flex items-center justify-between border-b border-border bg-background/90 backdrop-blur-sm">
        <Link
          href="/"
          className="font-mono text-[13px] font-medium text-foreground tracking-[0.08em]"
        >
          t2000
        </Link>
        <nav className="flex items-center gap-4 sm:gap-6">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:flex items-center font-mono text-[10px] tracking-[0.12em] text-muted uppercase hover:text-foreground transition-colors min-h-[36px]"
          >
            GitHub
          </a>
          <a
            href="https://audric.ai"
            className="px-4 sm:px-5 py-2 min-h-[36px] flex items-center bg-foreground text-background font-mono text-[10px] tracking-[0.12em] uppercase transition-all hover:opacity-80"
          >
            Try Audric
          </a>
        </nav>
      </header>

      <main className="pt-20 sm:pt-24 px-6 sm:px-8 lg:px-20 pb-16 sm:pb-24">
        {/* Hero */}
        <div className="max-w-[900px] mb-12 sm:mb-16">
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-accent mb-4 flex items-center gap-3">
            <span className="block w-8 h-px bg-accent" />
            Developer hub
          </div>
          <h1 className="text-[36px] sm:text-[44px] leading-[1.1] tracking-[-1px] text-foreground mb-4 font-normal">
            Documentation
          </h1>
          <p className="text-sm sm:text-base text-muted leading-[1.7] max-w-[560px]">
            Everything you need to integrate t2000 into your agent, app, or workflow.
            Five packages, one stack.
          </p>
        </div>

        {/* Quick start */}
        <section className="max-w-[900px] mb-14 sm:mb-20">
          <div className="border border-accent/30 bg-surface p-6 sm:p-8">
            <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-accent mb-4">
              Quick start
            </div>
            <div className="space-y-3">
              <div>
                <div className="font-mono text-[10px] tracking-wider uppercase text-dim mb-1.5">
                  1 &mdash; Install
                </div>
                <code className="block font-mono text-sm text-accent bg-background px-4 py-2.5 border border-border">
                  npm i -g @t2000/cli
                </code>
              </div>
              <div>
                <div className="font-mono text-[10px] tracking-wider uppercase text-dim mb-1.5">
                  2 &mdash; Initialize wallet
                </div>
                <code className="block font-mono text-sm text-accent bg-background px-4 py-2.5 border border-border">
                  t2000 init
                </code>
              </div>
              <div>
                <div className="font-mono text-[10px] tracking-wider uppercase text-dim mb-1.5">
                  3 &mdash; Connect to your AI
                </div>
                <code className="block font-mono text-sm text-muted bg-background px-4 py-2.5 border border-border">
                  <span className="text-dim">{'{'}</span>
                  {' '}<span className="text-accent">&quot;mcpServers&quot;</span>
                  : <span className="text-dim">{'{'}</span>
                  {' '}<span className="text-accent">&quot;t2000&quot;</span>
                  : <span className="text-dim">{'{'}</span>
                  {' '}<span className="text-accent">&quot;command&quot;</span>
                  : <span className="text-foreground">&quot;npx @t2000/mcp&quot;</span>
                  {' '}<span className="text-dim">{'}'} {'}'} {'}'}</span>
                </code>
              </div>
            </div>
          </div>
        </section>

        {/* Packages */}
        <section className="mb-14 sm:mb-20">
          <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-accent mb-6">
            Packages
          </div>

          <div className="space-y-px">
            {PACKAGES.map((pkg) => (
              <div
                key={pkg.title}
                className="bg-surface border border-border p-6 sm:p-8 group"
              >
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-6 sm:gap-8">
                  <div>
                    <div className="flex items-baseline gap-3 mb-2">
                      <h2 className="text-lg font-medium text-foreground tracking-tight">
                        {pkg.title}
                      </h2>
                      <span className="font-mono text-[11px] text-accent tracking-[0.05em]">
                        {pkg.pkg}
                      </span>
                    </div>
                    <p className="text-[13px] text-muted leading-[1.7] mb-4">
                      {pkg.desc}
                    </p>
                    <div className="flex items-center gap-3 flex-wrap">
                      <a
                        href={pkg.github}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted border border-border px-3 py-1.5 hover:text-foreground hover:border-foreground transition-colors"
                      >
                        GitHub
                      </a>
                      {pkg.npm && (
                        <a
                          href={pkg.npm}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted border border-border px-3 py-1.5 hover:text-foreground hover:border-foreground transition-colors"
                        >
                          npm
                        </a>
                      )}
                      {pkg.title === "Gateway" && (
                        <a
                          href="https://mpp.t2000.ai/services"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted border border-border px-3 py-1.5 hover:text-foreground hover:border-foreground transition-colors"
                        >
                          Explorer
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="bg-background border border-border p-4">
                    <div className="font-mono text-[10px] tracking-wider uppercase text-dim mb-3">
                      {pkg.title === "Gateway" ? "Endpoints" : pkg.title === "MCP" ? "Tools" : "Usage"}
                    </div>
                    <div className="space-y-1">
                      {pkg.commands.map((cmd) => (
                        <div
                          key={cmd}
                          className="font-mono text-[12px] text-muted leading-relaxed"
                        >
                          <span className="text-dim select-none">
                            {pkg.title === "Gateway" ? "" : "$ "}
                          </span>
                          {cmd}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-border">
                  <code className="font-mono text-[12px] text-accent">
                    {pkg.install}
                  </code>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Resources */}
        <section className="max-w-[900px]">
          <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-accent mb-6">
            Resources
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border border border-border">
            {RESOURCES.map((r) => (
              <a
                key={r.label}
                href={r.href}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-surface p-5 sm:p-6 group/link hover:bg-[rgba(0,214,143,0.03)] transition-colors"
              >
                <div className="text-sm font-medium text-foreground mb-1 flex items-center gap-2">
                  {r.label}
                  <span className="text-dim group-hover/link:text-accent transition-colors">&rarr;</span>
                </div>
                <div className="text-[13px] text-muted">{r.desc}</div>
              </a>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="px-6 sm:px-8 lg:px-20 py-6 sm:py-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
        <div className="font-mono text-[10px] tracking-[0.1em] text-dim uppercase">
          t2000 · The engine behind Audric
        </div>
        <nav className="flex gap-4 sm:gap-5 flex-wrap justify-center">
          <Link
            href="/"
            className="font-mono text-[10px] tracking-[0.1em] text-dim uppercase hover:text-muted transition-colors"
          >
            Home
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] tracking-[0.1em] text-dim uppercase hover:text-muted transition-colors"
          >
            GitHub
          </a>
          <a
            href="https://audric.ai"
            className="font-mono text-[10px] tracking-[0.1em] text-accent uppercase hover:text-foreground transition-colors"
          >
            Audric
          </a>
        </nav>
      </footer>
    </div>
  );
}
