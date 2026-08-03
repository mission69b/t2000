// ============================================================
// GettingStarted — the onboarding arc, not the capability map.
// Five real steps from zero to a private call + agent payment:
// install+wallet → fund → credit/key → private call → pay an API.
// Aligned to the quickstart source of truth. A numbered stepper
// with mono commands + one-line results.
// ============================================================
function GettingStarted() {
  const STEPS = [
    {
      n: "1", title: "Install + wallet",
      cmd: "npm i -g @t2000/cli && t2 init",
      note: "Local keypair, gasless. Registers your Agent ID out of the box.",
    },
    {
      n: "2", title: "Fund it",
      cmd: "t2 fund",
      note: "Your address + a QR — send USDC on Sui. $5 covers credit + hundreds of calls. No SUI, ever.",
    },
    {
      n: "3", title: "Credit + key",
      cmd: "t2 agent onboard --fund 5",
      note: "$5 from this wallet → a credit balance and an API key. No browser.",
    },
    {
      n: "4", title: "First private call",
      cmd: "t2 chat \"summarize this\" --model zai/glm-5.2",
      note: "Every model, private by default. OpenAI-compatible — point any tool at it.",
    },
    {
      n: "5", title: "Pay an API",
      cmd: "t2 pay x402.t2000.ai/t2000/v1/…",
      note: "Any x402 service, per call in USDC. Gasless, no keys, straight from your wallet.",
    },
  ];

  return (
    <section className="t2k-section" style={{ borderTop: "1px solid var(--ds-gray-alpha-300)" }}>
      <div className="t2k-container">
        <header style={{ marginBottom: 44, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
          <div>
            <span className="t2k-eyebrow">// GETTING STARTED</span>
            <h2 className="t2k-section-title" style={{ marginTop: 12 }}>
              Set up your agent.
            </h2>
          </div>
          <p style={{
            fontSize: 16, lineHeight: 1.55, color: "var(--fg-muted)",
            margin: 0, maxWidth: 300, letterSpacing: "-0.011em",
          }}>
            Five commands. No signup, no keys, no gas.
          </p>
        </header>

        <ol className="t2k-gs-grid">
          {STEPS.map((s) => (
            <li key={s.n} className="t2k-gs-step">
              <div className="t2k-gs-head">
                <span className="t2k-gs-num">{s.n}</span>
                <span className="t2k-gs-title">{s.title}</span>
              </div>
              <code className="t2k-gs-cmd"><span className="t2k-gs-dollar">$</span>{s.cmd}</code>
              <p className="t2k-gs-note">{s.note}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

window.GettingStarted = GettingStarted;
