// The onboarding arc — ONE path: sign in at the console, and the account is
// the whole stack (Sui wallet + Agent ID + API key). The CLI is the one-line
// machine path below the grid, mentioned not marketed (spec item 12).
// Classes live in styles/page.css (t2k-gs-*).
const STEPS = [
  {
    n: "1",
    title: "Sign in",
    cmd: "open https://agents.t2000.ai/manage",
    note: "Google sign-in. Your account is a non-custodial Sui wallet + an Agent ID — nothing to install, nothing to fund.",
  },
  {
    n: "2",
    title: "Create an API key",
    cmd: "API keys → Create",
    note: "Free. Includes a daily coding allowance on kimi-k2.7-code — paid models draw from credit (card or USDC).",
  },
  {
    n: "3",
    title: "Point your tool at it",
    cmd: 'base_url = "https://api.t2000.ai/v1" · model = "t2000/auto"',
    note: "Works in Cursor, zero, aider — any OpenAI-compatible client. Every model zero data retention; the router picks the cheapest capable model per step.",
  },
  {
    n: "4",
    title: "Let it pay for things",
    cmd: `t2 pay mpp.t2000.ai/exa/v1/search --data '{"query":"sui agents"}'`,
    note: "The same account's wallet pays any x402 API per call in USDC — gasless, no signup with the upstream.",
  },
] as const;

export function GettingStarted() {
  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header className="mb-11 flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="t2k-eyebrow">{"// GETTING STARTED"}</span>
            <h2 className="t2k-section-title mt-3">Set up your agent.</h2>
          </div>
          <p
            className="m-0 max-w-[300px] text-[16px] leading-[1.55]"
            style={{ color: "var(--fg-muted)", letterSpacing: "-0.011em" }}
          >
            One sign-in — the key for models, the wallet for paying.
          </p>
        </header>

        <ol className="t2k-gs-grid">
          {STEPS.map((s) => (
            <li key={s.n} className="t2k-gs-step">
              <div className="t2k-gs-head">
                <span className="t2k-gs-num">{s.n}</span>
                <span className="t2k-gs-title">{s.title}</span>
              </div>
              <code className="t2k-gs-cmd">
                <span className="t2k-gs-dollar">$</span>
                {s.cmd}
              </code>
              <p className="t2k-gs-note">{s.note}</p>
            </li>
          ))}
        </ol>

        <p
          className="mt-5 font-mono text-[12.5px]"
          style={{ color: "var(--fg-subtle)", letterSpacing: "0.01em" }}
        >
          {"// Terminal-native? "}
          <span style={{ color: "var(--fg-muted)" }}>
            npm i -g @t2000/cli && t2 init
          </span>
          {" — a local keypair wallet, no account needed."}
        </p>
      </div>
    </section>
  );
}
