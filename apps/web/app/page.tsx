import { TerminalDemo } from "./components/TerminalDemo";
import { InstallCommand } from "./components/InstallCommand";

const FEATURES = [
  {
    title: "Send",
    description: "Send USDC anywhere. Gas is invisible.",
    icon: "→",
  },
  {
    title: "Save",
    description: "Earn 8%+ APY on idle balance.",
    icon: "↓",
  },
  {
    title: "Swap",
    description: "Swap any supported asset. On-chain slippage protection.",
    icon: "⇄",
  },
  {
    title: "Borrow",
    description: "Borrow against savings. Health factor enforced.",
    icon: "↑",
  },
  {
    title: "History",
    description: "Full tx history. JSON.",
    icon: "⊡",
  },
  {
    title: "Events",
    description: "Real-time push events. Yield, balance, health.",
    icon: "⚡",
  },
];

const GITHUB_URL = "https://github.com/mission69b/t2000";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* ── Section 1: Hero ── */}
      <section className="flex flex-col items-center justify-center min-h-screen px-6 relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,212,255,0.03)_0%,transparent_70%)]" />

        <div className="relative z-10 flex flex-col items-center text-center max-w-3xl mx-auto">
          <div className="text-6xl sm:text-8xl font-mono font-bold tracking-tighter text-foreground">
            t2000
          </div>

          <h1 className="mt-6 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            The first wallet for AI agents.
          </h1>

          <div className="mt-10">
            <InstallCommand command="npx t2000 init" />
          </div>

          <p className="mt-6 text-muted text-lg font-mono">
            One command. Zero cost. No blockchain.
          </p>

          <div className="mt-8 flex items-center gap-6 text-sm text-muted">
            <a
              href={GITHUB_URL}
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
              className="hover:text-foreground transition-colors"
            >
              npm
            </a>
            <a
              href="https://www.npmjs.com/package/@t2000/cli"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              Docs
            </a>
          </div>
        </div>
      </section>

      {/* ── Section 2: The Demo ── */}
      <section className="py-24 px-6">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-center">
            See it work.
          </h2>

          <div className="mt-12">
            <TerminalDemo />
          </div>

          <p className="mt-8 text-center text-muted text-lg">
            30 seconds. Wallet → send → earn. That&apos;s it.
          </p>
        </div>
      </section>

      {/* ── Section 3: Feature Grid ── */}
      <section className="py-24 px-6">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-center">
            Everything an agent wallet needs.
          </h2>
          <p className="mt-3 text-center text-muted text-lg">
            Nothing it doesn&apos;t.
          </p>

          <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-border bg-surface p-6 transition-all hover:border-accent/30 hover:shadow-[0_0_24px_rgba(0,212,255,0.06)]"
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

      {/* ── Section 4: How It Works ── */}
      <section className="py-24 px-6 border-t border-border">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-center">
            Three steps. No blockchain knowledge.
          </h2>

          <div className="mt-16 grid gap-12 sm:grid-cols-3">
            <div>
              <div className="text-4xl font-mono font-bold text-accent">1</div>
              <div className="mt-2 h-px bg-border" />
              <h3 className="mt-4 text-xl font-semibold">Create</h3>
              <p className="mt-3 text-sm text-muted leading-relaxed">
                One command. Zero cost. Wallet exists.
              </p>
              <div className="mt-4 rounded-lg bg-surface border border-border px-4 py-2.5 font-mono text-sm text-muted">
                <span className="text-accent">$</span> npx t2000 init
              </div>
            </div>

            <div>
              <div className="text-4xl font-mono font-bold text-accent">2</div>
              <div className="mt-2 h-px bg-border" />
              <h3 className="mt-4 text-xl font-semibold">Fund</h3>
              <p className="mt-3 text-sm text-muted leading-relaxed">
                Withdraw USDC from Coinbase/Binance to your wallet address. Takes 2 minutes.
              </p>
              <div className="mt-4 rounded-lg bg-surface border border-border px-4 py-2.5 font-mono text-sm text-muted">
                <span className="text-accent">$</span> t2000 deposit
              </div>
            </div>

            <div>
              <div className="text-4xl font-mono font-bold text-accent">3</div>
              <div className="mt-2 h-px bg-border" />
              <h3 className="mt-4 text-xl font-semibold">Operate</h3>
              <p className="mt-3 text-sm text-muted leading-relaxed">
                Send, save, swap, borrow — all via CLI or SDK.
              </p>
              <div className="mt-4 rounded-lg bg-surface border border-border px-4 py-2.5 font-mono text-sm text-muted">
                <span className="text-accent">$</span> t2000 save 100 USDC
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 5: For Every Agent Framework ── */}
      <section className="py-24 px-6 border-t border-border">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-center">
            Works with everything.
          </h2>

          <div className="mt-16 space-y-6">
            <div className="flex flex-col sm:flex-row items-start gap-4 rounded-xl border border-border bg-surface p-5">
              <div className="shrink-0 rounded-lg bg-accent/10 px-3 py-1.5 font-mono text-xs font-semibold text-accent">
                SDK (TS/JS)
              </div>
              <pre className="font-mono text-sm text-foreground/80 overflow-x-auto whitespace-pre">
{`const agent = await T2000.create()
await agent.send({ to: '0x...', amount: 50 })`}
              </pre>
            </div>

            <div className="flex flex-col sm:flex-row items-start gap-4 rounded-xl border border-border bg-surface p-5">
              <div className="shrink-0 rounded-lg bg-accent/10 px-3 py-1.5 font-mono text-xs font-semibold text-accent">
                HTTP API
              </div>
              <pre className="font-mono text-sm text-foreground/80 overflow-x-auto whitespace-pre">
{`curl localhost:3001/v1/send \\
  -H "Authorization: Bearer t2k_..." \\
  -d '{"to":"0x...","amount":50}'`}
              </pre>
            </div>

            <div className="flex flex-col sm:flex-row items-start gap-4 rounded-xl border border-border bg-surface p-5">
              <div className="shrink-0 rounded-lg bg-accent/10 px-3 py-1.5 font-mono text-xs font-semibold text-accent">
                CLI (shell)
              </div>
              <pre className="font-mono text-sm text-foreground/80 overflow-x-auto whitespace-pre">
{`t2000 send 50 USDC to 0x...`}
              </pre>
            </div>
          </div>

          <p className="mt-10 text-center text-muted text-sm font-mono tracking-wide">
            Eliza · LangChain · AutoGen · CrewAI · custom
          </p>
        </div>
      </section>

      {/* ── Section 6: The Numbers ── */}
      <section className="py-24 px-6 border-t border-border">
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="text-center p-8 rounded-xl border border-border bg-surface">
              <div className="text-4xl font-mono font-bold text-foreground">0.003</div>
              <div className="mt-2 text-sm text-muted">SUI avg gas cost</div>
            </div>
            <div className="text-center p-8 rounded-xl border border-border bg-surface">
              <div className="text-4xl font-mono font-bold text-foreground">$0.00</div>
              <div className="mt-2 text-sm text-muted">to start</div>
            </div>
            <div className="text-center p-8 rounded-xl border border-border bg-surface">
              <div className="text-4xl font-mono font-bold text-foreground">&lt; 1 sec</div>
              <div className="mt-2 text-sm text-muted">to finality</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 7: Footer CTA ── */}
      <section className="py-24 px-6 border-t border-border">
        <div className="mx-auto max-w-3xl text-center">
          <div className="text-4xl font-mono font-bold tracking-tighter text-foreground">
            t2000
          </div>

          <h2 className="mt-6 text-2xl sm:text-3xl font-semibold tracking-tight">
            Give your agent a wallet.
          </h2>

          <div className="mt-10">
            <InstallCommand command="npx t2000 init" />
          </div>

          <div className="mt-10 flex justify-center gap-6 text-sm text-muted">
            <a
              href={GITHUB_URL}
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
              className="hover:text-foreground transition-colors"
            >
              npm
            </a>
            <a
              href="https://www.npmjs.com/package/@t2000/cli"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              Docs
            </a>
          </div>

          <div className="mt-12 text-xs text-muted">
            t2000.ai · MIT License
          </div>
        </div>
      </section>
    </div>
  );
}
