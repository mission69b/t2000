// ============================================================
// WalletTrust — gasless · non-custodial · opt-in limits
// Three-column trust posture. Each column has a concrete artifact
// (a Move call, a file path, a CLI flag) — not marketing fluff.
// ============================================================
function WalletTrust() {
  const pillars = [
    {
      title: "Gasless USDC.",
      desc: "USDC and USDsui transfers cost nothing to send. SUI and Cetus swaps still need ~0.05 SUI for gas.",
      artifact: { tag: "SPONSORED PTB", value: "splitCoins → transferObjects · gas: sponsor" },
    },
    {
      title: "Non-custodial.",
      desc: "Keys live on the agent's machine. Never transmitted. Move between machines with one command.",
      artifact: { tag: "FILE", value: "~/.t2000/wallet.key · 0o600" },
    },
    {
      title: "Spending limits.",
      desc: "On by default — $25/tx · $100/day. Adjust the caps with a single command, or override a call with --force.",
      artifact: { tag: "CLI", value: "t2 limit set --per-tx 50 --daily 200" },
    },
  ];

  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header style={{ marginBottom: 48 }}>
          <span className="t2k-eyebrow">// SECURITY POSTURE</span>
          <h2 className="t2k-section-title" style={{ marginTop: 12 }}>
            Built for agents.<br/>
            <span style={{ color: "var(--fg-muted)" }}>Safe for humans.</span>
          </h2>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {pillars.map((p) => (
            <div key={p.title} className="t2k-card" style={{
              padding: "24px 22px",
              display: "flex", flexDirection: "column", gap: 12,
            }}>
              <h3 style={{
                fontFamily: "var(--font-sans)", fontWeight: 600,
                fontSize: 20, letterSpacing: "-0.022em",
                margin: 0, color: "var(--fg)",
              }}>{p.title}</h3>
              <p style={{
                fontSize: 13.5, lineHeight: 1.55,
                color: "var(--fg-muted)", margin: 0,
              }}>{p.desc}</p>

              {/* The actual artifact — small mono block */}
              <div style={{
                marginTop: "auto",
                paddingTop: 14,
                borderTop: "1px dashed var(--ds-gray-alpha-300)",
              }}>
                <div className="t2k-eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>{p.artifact.tag}</div>
                <code style={{
                  display: "block",
                  fontFamily: "var(--font-mono)", fontSize: 11.5,
                  color: "var(--fg)",
                  background: "var(--ds-background-200)",
                  border: "1px solid var(--ds-gray-alpha-300)",
                  borderRadius: 4,
                  padding: "8px 10px",
                  wordBreak: "break-all",
                }}>{p.artifact.value}</code>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

window.WalletTrust = WalletTrust;
