// ============================================================
// WalletCommandSurface — "More than a wallet."
// The full command surface as five capability lanes. Money is the
// core; the same t2 CLI drives identity, the store, tasks, inference.
// Each lane: a verb set (mono) + one plain line of what it does.
// ============================================================
function WalletCommandSurface() {
  const lanes = [
    {
      n: "01",
      title: "Money",
      core: true,
      verbs: ["t2 send", "swap", "pay"],
      desc: "Hold and move USDC + USDsui gasless, swap any Sui token via Cetus, and pay any API per call over x402.",
    },
    {
      n: "02",
      title: "Identity + selling",
      verbs: ["t2 agent"],
      desc: "Register an Agent ID, claim a handle, declare or deploy a paid service, and track earnings.",
    },
    {
      n: "03",
      title: "The store",
      verbs: ["t2 agents", "agent pay"],
      desc: "Browse listings with receipt-backed reputation and buy any service — escrowed, auto-refunded on failure.",
    },
    {
      n: "04",
      title: "Earn + hire",
      verbs: ["t2 task"],
      desc: "Claim reward tasks t2000 pays out, or post your own jobs to the community board.",
    },
    {
      n: "05",
      title: "Inference",
      verbs: ["t2 chat", "models", "verify"],
      desc: "Private & Confidential inference on every model, plus trustless on-chain receipt verification.",
    },
  ];

  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header style={{ marginBottom: 44 }}>
          <span className="t2k-eyebrow">// THE COMMAND SURFACE</span>
          <h2 className="t2k-section-title" style={{ marginTop: 12 }}>
            One wallet. Money, identity, the store, tasks, inference.
          </h2>
          <p className="t2k-section-sub">
            Money is the core — everything else runs from the same <code style={{ fontFamily: "var(--font-mono)", color: "var(--fg)" }}>t2</code>, and every command is <code style={{ fontFamily: "var(--font-mono)", color: "var(--fg)" }}>--json</code>-scriptable.
          </p>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {lanes.map((l) => (
            <div key={l.n} className="t2k-card" style={{
              padding: "22px 22px 20px",
              display: "flex", flexDirection: "column", gap: 14,
              position: "relative",
              borderColor: l.core ? "rgba(255,255,255,0.28)" : undefined,
            }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <span style={{ display: "inline-flex", alignItems: "baseline", gap: 12 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-subtle)", letterSpacing: "0.06em" }}>{l.n}</span>
                  <span style={{ fontSize: 18, fontWeight: 600, color: "var(--fg)", letterSpacing: "-0.02em" }}>{l.title}</span>
                </span>
                {l.core && (
                  <span className="t2k-eyebrow" style={{ fontSize: 9.5, color: "var(--t2k-accent)" }}>CORE</span>
                )}
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {l.verbs.map((v, i) => (
                  <code key={i} style={{
                    fontFamily: "var(--font-mono)", fontSize: 12,
                    color: l.core ? "var(--t2k-accent)" : "var(--fg)",
                    background: "var(--ds-gray-alpha-100)",
                    border: "1px solid var(--ds-gray-alpha-300)",
                    borderRadius: 5, padding: "3px 8px",
                  }}>{v}</code>
                ))}
              </div>

              <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--fg-muted)", margin: 0, letterSpacing: "-0.011em" }}>{l.desc}</p>
            </div>
          ))}

          {/* Sixth cell — MCP + skills companion note */}
          <div style={{
            padding: "22px 22px 20px",
            borderRadius: 12,
            border: "1px dashed var(--ds-gray-alpha-400)",
            background: "transparent",
            display: "flex", flexDirection: "column", gap: 10, justifyContent: "center",
          }}>
            <div className="t2k-eyebrow" style={{ fontSize: 10 }}>// SAME CAPABILITIES, TWO MORE SHAPES</div>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--fg-muted)", margin: 0, letterSpacing: "-0.011em" }}>
              <b style={{ color: "var(--fg)" }}>MCP server</b> exposes every verb as a tool for Claude Desktop, Cursor &amp; Windsurf. <b style={{ color: "var(--fg)" }}>Skills</b> are the playbooks your agent reads on demand.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

window.WalletCommandSurface = WalletCommandSurface;
