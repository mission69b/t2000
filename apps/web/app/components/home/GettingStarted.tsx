// The onboarding arc — ONE path: sign in at the console, and the account is
// the whole stack (Sui wallet + Agent ID + API key). The CLI is the one-line
// machine path below the grid, mentioned not marketed (spec item 12).
// Classes live in styles/page.css (t2k-gs-*).
const STEPS = [
  {
    n: "1",
    title: "Sign in",
    cmd: "open https://agents.t2000.ai/manage",
    note: "Google. Your account is a non-custodial Sui wallet.",
  },
  {
    n: "2",
    title: "Create your agent",
    cmd: "Overview → Create your Agent ID",
    note: "One tap — an on-chain Agent ID, gasless.",
  },
  {
    n: "3",
    title: "Create an API key",
    cmd: "API keys → Create",
    note: "Free, with a daily coding allowance. Paid models draw from credit.",
  },
  {
    n: "4",
    title: "Point your tool at it",
    cmd: 'base_url = "https://api.t2000.ai/v1" · model = "t2000/auto"',
    note: "Any OpenAI-compatible client. Zero data retention.",
  },
  {
    n: "5",
    title: "Let it pay for things",
    cmd: `t2 pay mpp.t2000.ai/exa/v1/search --data '{"query":"sui agents"}'`,
    note: "The wallet pays any x402 API per call — gasless, no signups.",
  },
] as const;

export function GettingStarted() {
  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header className="mb-11">
          <span className="t2k-eyebrow">{"// GETTING STARTED"}</span>
          <h2 className="t2k-section-title mt-3">Set up your agent.</h2>
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
