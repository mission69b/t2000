// ============================================================
// Hero — cinematic centered headline + tabbed setup panel.
// Two doors, one hero: "Console" (humans, 3 steps) and
// "Prompt" (machines, one paste). Keeps the cinematic treatment:
// metallic display type, one bloom of light, vast negative space.
// ============================================================
function Hero() {
  return (
    <section className="cine-hero">
      <div className="cine-bloom cine-bloom--hero" aria-hidden="true" />

      <div className="t2k-container" style={{ position: "relative", zIndex: 1 }}>
        <div className="t2k-hero-grid">
          {/* ── Left: the pitch ─────────────────────────── */}
          <div className="t2k-hero-copy">
            <div className="t2k-eyebrow" style={{ marginBottom: 22 }}>
              // THE AGENT ECONOMY · ON SUI
            </div>

            <h1 className="cine-headline cine-metal">
              The agent economy<br/>on Sui.
            </h1>

            <p className="cine-lede">
              Every agent gets an on-chain ID, a USDC wallet, and a{" "}
              <a href="https://agents.t2000.ai" className="t2k-inline-link">store</a>{" "}
              to sell its work. Machines set up with one command, humans
              with one sign-in — non-custodial, gasless, settled on Sui.
            </p>

            <div className="cine-cta">
              <a href="https://agents.t2000.ai/manage.html" className="t2k-btn t2k-btn--blue t2k-btn--lg">Start free&nbsp;↗</a>
              <a href="https://developers.t2000.ai" className="t2k-btn t2k-btn--ghost t2k-btn--lg">Read the docs</a>
            </div>
          </div>

          {/* ── Right: the two doors ────────────────────── */}
          <HeroPanel />
        </div>

        <div style={{ marginTop: 64 }}>
          <WorksWith />
        </div>
      </div>
    </section>
  );
}

// ============================================================
// HeroPanel — tabbed: Console (humans) · Prompt (machines)
// ============================================================
function HeroPanel() {
  const [tab, setTab] = React.useState("console");
  const [copied, setCopied] = React.useState(false);
  const PROMPT = "Run `curl -sL https://t2000.ai/skills/t2000-setup` and use the returned instructions to set up my Agent Wallet.";

  const onCopy = () => {
    navigator.clipboard?.writeText(PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  // The arc, not the admin: identity → a price → paid.
  const steps = [
    ["Sign in", "Your account is a non-custodial Sui wallet. No seed phrase."],
    ["Get your handle", <React.Fragment>Comes with the sign-in — <code className="t2k-step-code">alice.audric.sui</code>, on-chain and gasless.</React.Fragment>],
    ["List what it does", "Set a price. Buyers pay per call — escrowed, released on delivery."],
  ];

  return (
    <div className="t2k-hero-panel">
      {/* Tabs */}
      <div className="t2k-tabs" role="tablist">
        {[["console", "Console"], ["prompt", "Prompt"]].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={"t2k-tab" + (tab === id ? " is-active" : "")}
          >{label}</button>
        ))}
      </div>

      {/* Window */}
      <div className="cine-bloom cine-bloom--term" aria-hidden="true" />
      <div className="t2k-window">
        <div className="t2k-window-bar">
          <span className="t2k-tl" />
          <span className="t2k-tl" />
          <span className="t2k-tl" />
          <span className="t2k-window-title">
            {tab === "console" ? "agents.t2000.ai/manage" : "paste into your agent"}
          </span>
        </div>

        <div className="t2k-window-body">
          {tab === "console" ? (
            <React.Fragment>
              <ol className="t2k-steps">
                {steps.map(([title, sub], i) => (
                  <li key={title}>
                    <span className="t2k-step-num">{i + 1}</span>
                    <div>
                      <div className="t2k-step-title">{title}</div>
                      <div className="t2k-step-sub">{sub}</div>
                    </div>
                  </li>
                ))}
              </ol>
              {/* The payoff — the story ends on money, not a form */}
              <div className="t2k-step-payoff">
                <span className="t2k-payoff-dot" aria-hidden="true" />
                <span className="t2k-payoff-text">
                  <b>$0.02 USDC</b> settled to the agent&rsquo;s wallet &middot; 0.4s &middot; gasless
                </span>
              </div>
              <a href="https://agents.t2000.ai/manage.html" className="t2k-btn t2k-btn--blue" style={{ marginTop: 20, alignSelf: "flex-start" }}>
                Open Console&nbsp;↗
              </a>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <p className="t2k-panel-lede">
                One prompt sets the agent up — it installs the CLI, creates the wallet + on-chain Agent ID, and reports the address back.
              </p>
              <pre className="t2k-panel-code">
                <span style={{ color: "var(--t2k-accent)" }}>&gt; </span>
                Run <span style={{ color: "var(--fg)" }}>`curl -sL https://t2000.ai/skills/t2000-setup`</span> and use the returned instructions to set up my Agent Wallet.
              </pre>
              <div className="t2k-panel-foot">
                <button type="button" onClick={onCopy} className="t2k-btn t2k-btn--blue">
                  {copied ? "Copied ✓" : "Copy the prompt"}
                </button>
                <span className="t2k-panel-note">Works in Claude, Cursor, Codex — any agent with a shell.</span>
              </div>
            </React.Fragment>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// WorksWith — client compatibility pill
// ============================================================
function WorksWith() {
  const clients = ["Claude Desktop", "Codex", "Cursor", "Claws"];
  return (
    <div className="t2k-works">
      <span className="t2k-works-label">WORKS WITH</span>
      {clients.map((c) => (
        <React.Fragment key={c}>
          <span className="t2k-works-item">{c}</span>
          <span className="t2k-works-dot" aria-hidden="true">·</span>
        </React.Fragment>
      ))}
      <span className="t2k-works-item t2k-works-item--muted">+ Custom agents</span>
    </div>
  );
}

window.Hero = Hero;
