// The onboarding arc — five real steps from zero to a paid API call + a
// private inference call, matching the developers.t2000.ai quickstart.
// Classes live in styles/page.css (t2k-gs-*).
const STEPS = [
  {
    n: "1",
    title: "Install + wallet",
    cmd: "npm i -g @t2000/cli && t2 init",
    note: "Local keypair, gasless. Registers your Agent ID out of the box.",
  },
  {
    n: "2",
    title: "Fund it",
    cmd: "t2 fund",
    note: "Your address + a QR — send USDC on Sui. $5 covers credit + hundreds of calls. No SUI, ever.",
  },
  {
    n: "3",
    title: "Pay an API",
    cmd: `t2 pay mpp.t2000.ai/exa/v1/search --data '{"query":"sui agents"}'`,
    note: "Any x402 service, per call in USDC — straight from the wallet. Gasless, no keys, no signup.",
  },
  {
    n: "4",
    title: "Get a key",
    cmd: "open https://agents.t2000.ai/manage",
    note: "Sign in with Google → add credit (card or USDC) → API keys → Create. The one key path.",
  },
  {
    n: "5",
    title: "First private call",
    cmd: 't2 chat "summarize this" --model zai/glm-5.2',
    note: "Every model, private by default. OpenAI-compatible — point any tool at it.",
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
            Five steps, zero gas — a wallet for paying, a key for models.
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
      </div>
    </section>
  );
}
