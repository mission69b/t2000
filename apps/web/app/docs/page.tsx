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
    desc: "29 tools, 15 prompts. Connect Claude Desktop, Cursor, or any MCP-compatible client. Stdio transport, safeguard enforced.",
    install: "npx -y @t2000/mcp@latest",
    npm: "https://www.npmjs.com/package/@t2000/mcp",
    github: `${GITHUB_URL}/tree/main/packages/mcp`,
    commands: [
      "t2000_overview · t2000_balance · t2000_send",
      "t2000_save · t2000_withdraw · t2000_borrow",
      "t2000_swap · t2000_rates · t2000_health",
      "t2000_pay · t2000_claim_rewards · +18 more",
    ],
  },
  {
    title: "Engine",
    pkg: "@t2000/engine",
    desc: "Reasoning engine for financial agents. 34 tools, adaptive thinking, 14 step guards, 6 skill recipes, silent intelligence layer, canvas, streaming.",
    install: "npm i @t2000/engine",
    npm: "https://www.npmjs.com/package/@t2000/engine",
    github: `${GITHUB_URL}/tree/main/packages/engine`,
    commands: [
      "1. classify effort (quick/moderate/deep)",
      "2. match recipe (6 skill recipes)",
      "3. run guards (14 pre/post gates across 3 tiers)",
      "4. execute tools (34 financial tools)",
      "5. self-evaluate (post-flight checklist)",
    ],
  },
  {
    title: "Gateway",
    pkg: "mpp.t2000.ai",
    desc: "Pay-per-use API gateway for agents. 40 services, 88 endpoints. No API keys \u2014 pay per request with USDC. Reputation tiers.",
    install: "POST mpp.t2000.ai/{service}/{endpoint}",
    npm: null,
    github: `${GITHUB_URL}/tree/main/apps/gateway`,
    commands: [
      "HTTP 402 \u2192 pay $0.01 \u2192 200 OK",
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
    desc: "Browse all 41 API services",
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
                  3 &mdash; Add to your AI client&rsquo;s MCP config
                </div>
                <code className="block font-mono text-sm text-muted bg-background px-4 py-2.5 border border-border whitespace-pre overflow-x-auto">
{`{
  "mcpServers": {
    "t2000": {
      "command": "npx",
      "args": ["-y", "@t2000/mcp@latest"]
    }
  }
}`}
                </code>
                <div className="font-mono text-[10px] text-dim mt-2 leading-relaxed">
                  Paste into Claude Desktop, Cursor, Cline, or any MCP client.
                  This is a <span className="text-muted">config snippet</span>,
                  not a terminal command &mdash; the AI client launches the
                  server automatically over stdio.
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] tracking-wider uppercase text-dim mb-1.5">
                  4 &mdash; Verify (optional)
                </div>
                <code className="block font-mono text-[11px] text-muted bg-background px-4 py-2.5 border border-border whitespace-pre overflow-x-auto">
{`printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}\\n' \\
  | npx -y @t2000/mcp@latest`}
                </code>
                <div className="font-mono text-[10px] text-dim mt-2 leading-relaxed">
                  A healthy server replies with{' '}
                  <span className="text-muted">&quot;serverInfo&quot;:&#123;&quot;name&quot;:&quot;t2000&quot;...&#125;</span>{' '}
                  and exits.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Capabilities */}
        <section className="max-w-[900px] mb-14 sm:mb-20">
          <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-accent mb-6">
            Capabilities
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border border-border">
            {[
              { value: "34", label: "Financial tools", sub: "23 read + 11 write" },
              { value: "9", label: "Step guards", sub: "balance, HF, slippage, cost, ..." },
              { value: "7", label: "Skill recipes", sub: "safe_borrow, swap_and_save, ..." },
              { value: "8", label: "Canvas templates", sub: "yield, health, portfolio, ..." },
            ].map((cap) => (
              <div key={cap.label} className="bg-surface p-5 text-center">
                <div className="text-[22px] font-semibold text-accent leading-none mb-1.5">{cap.value}</div>
                <div className="font-mono text-[10px] tracking-wider uppercase text-muted mb-1">{cap.label}</div>
                <div className="font-mono text-[9px] text-dim">{cap.sub}</div>
              </div>
            ))}
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
                      {pkg.title === "Gateway" ? "Endpoints" : pkg.title === "MCP" ? "Tools (29)" : pkg.title === "Engine" ? "Reasoning pipeline" : "Usage"}
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
