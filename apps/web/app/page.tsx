import { TerminalDemo } from "./components/TerminalDemo";
import { InstallCommand } from "./components/InstallCommand";

const FEATURES = [
  {
    title: "Send USDC",
    description: "Transfer USDC to any Sui address with one method call.",
    icon: "→",
  },
  {
    title: "Earn Yield",
    description: "Deposit to Suilend and earn APY on savings automatically.",
    icon: "↗",
  },
  {
    title: "Swap Assets",
    description: "USDC/SUI swaps via Cetus with on-chain slippage protection.",
    icon: "⇄",
  },
  {
    title: "Borrow & Repay",
    description: "Borrow against savings collateral with health factor safety.",
    icon: "↓",
  },
  {
    title: "Gas Abstraction",
    description: "Auto SUI top-up, sponsored gas, or self-funded. Zero config.",
    icon: "⚡",
  },
  {
    title: "HTTP API",
    description: "Run t2000 serve for a REST API any language can call.",
    icon: "{}",
  },
];

const CODE_EXAMPLE = `import { T2000 } from '@t2000/sdk';

const agent = await T2000.create({
  passphrase: process.env.T2000_PASSPHRASE,
});

// Check balance
const { available, savings } = await agent.balance();

// Send USDC
await agent.send({ to: '0x...', amount: 50 });

// Save and earn yield
await agent.save({ amount: 100 });

// Swap USDC → SUI
await agent.swap({ from: 'USDC', to: 'SUI', amount: 5 });

// Check earnings
const { currentApy, dailyEarning } = await agent.earnings();`;

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="fixed top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight">t2000</span>
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
              beta
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted">
            <a href="#features" className="hover:text-foreground transition-colors">
              Features
            </a>
            <a href="#sdk" className="hover:text-foreground transition-colors">
              SDK
            </a>
            <a
              href="https://github.com/user/t2000"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://www.npmjs.com/package/@t2000/sdk"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-foreground px-4 py-2 text-background font-medium hover:bg-foreground/90 transition-colors"
            >
              npm install
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center pt-40 pb-20 px-6">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-5xl font-bold tracking-tight sm:text-7xl leading-[1.1]">
            The first wallet
            <br />
            <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">
              for AI agents
            </span>
          </h1>
          <p className="mt-6 text-lg text-muted max-w-2xl mx-auto leading-relaxed">
            Send, save, swap, and borrow on Sui — in one line of code.
            TypeScript SDK and CLI that handles keys, gas, and DeFi so your agent
            doesn&apos;t have to.
          </p>

          <div className="mt-10">
            <InstallCommand />
          </div>

          <div className="mt-16">
            <TerminalDemo />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Everything an agent needs
          </h2>
          <p className="mt-4 text-center text-muted max-w-xl mx-auto">
            One SDK. Full DeFi access. Zero blockchain complexity.
          </p>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-xl border border-border bg-card p-6 transition-colors hover:border-accent/30 hover:bg-card/80"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent text-lg font-mono">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SDK Code Example */}
      <section id="sdk" className="py-24 px-6 border-t border-border">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-12 lg:grid-cols-2 items-start">
            <div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Build with the SDK
              </h2>
              <p className="mt-4 text-muted leading-relaxed">
                Everything is a method call. Create an agent, send USDC, earn
                yield, swap tokens — all with TypeScript types and auto-complete.
              </p>
              <ul className="mt-8 space-y-4 text-sm">
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-emerald-400">✓</span>
                  <span>
                    <strong className="text-foreground">Auto gas management</strong>
                    <span className="text-muted"> — self-funded, auto-topup, or sponsored</span>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-emerald-400">✓</span>
                  <span>
                    <strong className="text-foreground">Encrypted key storage</strong>
                    <span className="text-muted"> — AES-256-GCM with passphrase</span>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-emerald-400">✓</span>
                  <span>
                    <strong className="text-foreground">Risk checks</strong>
                    <span className="text-muted"> — health factor validation before borrows</span>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-emerald-400">✓</span>
                  <span>
                    <strong className="text-foreground">Event system</strong>
                    <span className="text-muted"> — subscribe to yield, balance, health events</span>
                  </span>
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <span className="text-xs text-muted font-mono">agent.ts</span>
              </div>
              <pre className="p-5 text-sm leading-6 overflow-x-auto">
                <code className="font-mono text-zinc-300">
                  {CODE_EXAMPLE}
                </code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 border-t border-border">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Get started in 30 seconds
          </h2>
          <p className="mt-4 text-muted">
            Install the CLI, create a wallet, fund it with USDC, and start building.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 font-mono text-sm">
            <div className="rounded-lg bg-card border border-border px-6 py-3 text-left w-full max-w-md">
              <div className="text-muted">
                <span className="text-accent">$</span> npm install -g @t2000/cli
              </div>
              <div className="text-muted mt-1">
                <span className="text-accent">$</span> t2000 init
              </div>
              <div className="text-muted mt-1">
                <span className="text-accent">$</span> t2000 deposit
              </div>
              <div className="text-muted mt-1">
                <span className="text-accent">$</span> t2000 save 100
              </div>
              <div className="text-emerald-400 mt-1">
                &nbsp; ✓ Saved $100.00 USDC @ 8.2% APY
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12 px-6">
        <div className="mx-auto max-w-6xl flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div className="text-sm text-muted">
            t2000 — Built on Sui
          </div>
          <div className="flex gap-6 text-sm text-muted">
            <a
              href="https://github.com/user/t2000"
              className="hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://www.npmjs.com/package/@t2000/sdk"
              className="hover:text-foreground transition-colors"
            >
              npm
            </a>
            <a
              href="https://www.npmjs.com/package/@t2000/cli"
              className="hover:text-foreground transition-colors"
            >
              CLI
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
