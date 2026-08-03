// ============================================================
// WalletCloser — page-specific closing CTA for the Wallet page
// Shows the literal install command as a copyable terminal card.
// ============================================================
function WalletCloser() {
  const [copied, setCopied] = React.useState(false);
  const CMD = "npm install -g @t2000/cli";
  const onCopy = () => {
    navigator.clipboard?.writeText(CMD);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section style={{
      padding: "120px 24px 96px",
      position: "relative",
      overflow: "hidden",
    }}>
      <div aria-hidden="true" style={{
        position: "absolute", left: "50%", top: "55%",
        transform: "translate(-50%,-50%)",
        width: 820, height: 360,
        background: "radial-gradient(50% 50% at 50% 50%, rgba(255,255,255,0.10) 0%, transparent 70%)",
        filter: "blur(28px)",
        pointerEvents: "none",
      }} />

      <div style={{ position: "relative", maxWidth: 820, margin: "0 auto", textAlign: "center" }}>
        <h2 className="t2k-display" style={{
          fontSize: "clamp(40px, 5.6vw, 68px)",
          letterSpacing: "-0.04em",
        }}>
          Install in 60 seconds.
        </h2>

        <div style={{
          marginTop: 40,
          background: "var(--ds-background-200)",
          border: "1px solid var(--ds-gray-alpha-400)",
          borderRadius: 10,
          overflow: "hidden",
          textAlign: "left",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.10), 0 24px 60px -20px rgba(255,255,255,0.13)",
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px",
            borderBottom: "1px solid var(--ds-gray-alpha-300)",
            background: "var(--ds-gray-100)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#3A3A3A" }} />
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#4A4A4A" }} />
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#5A5A5A" }} />
              <span style={{
                marginLeft: 10,
                fontFamily: "var(--font-mono)", fontSize: 12,
                color: "var(--fg-subtle)", letterSpacing: "0.01em",
              }}>~ /agent</span>
            </div>
            <button type="button" onClick={onCopy} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "5px 10px 5px 8px",
              background: copied ? "var(--t2k-success)" : "var(--t2k-accent)",
              border: 0, borderRadius: 5,
              color: copied ? "var(--t2k-on-success)" : "var(--t2k-on-accent)",
              fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500,
              letterSpacing: "-0.011em",
              cursor: "pointer",
              transition: "background var(--dur-fast) var(--ease-out)",
            }}>
              {copied ? (
                <React.Fragment>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Copied
                </React.Fragment>
              ) : (
                <React.Fragment>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <rect x="5" y="5" width="8" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-5A1.5 1.5 0 0 0 3 3.5v7A1.5 1.5 0 0 0 4.5 12H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  Copy
                </React.Fragment>
              )}
            </button>
          </div>
          <pre style={{
            margin: 0,
            padding: "22px 20px",
            fontFamily: "var(--font-mono)",
            fontSize: 15,
            lineHeight: 1.75,
            color: "var(--fg)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}>
            <span style={{ color: "var(--fg-subtle)" }}>$ </span>
            <span style={{ color: "var(--t2k-accent)" }}>npm install -g @t2000/cli</span>{"\n"}
            <span style={{ color: "var(--fg-subtle)" }}>$ </span>
            t2 init{"\n"}
            <span style={{ color: "var(--fg-subtle)" }}>$ </span>
            t2 mcp install
          </pre>
        </div>

        <div style={{ marginTop: 28, fontSize: 14, color: "var(--fg-muted)" }}>
          Prefer a guided install?{" "}
          <a href="index.html#install" style={{ color: "var(--fg)", textDecoration: "none", borderBottom: "1px solid var(--ds-gray-alpha-500)" }}>
            Paste a prompt into Claude Desktop
          </a>{" "}
          <span style={{ opacity: 0.4 }}>·</span>{" "}
          <a href="https://developers.t2000.ai/agent-wallet" style={{ color: "var(--fg)", textDecoration: "none", borderBottom: "1px solid var(--ds-gray-alpha-500)" }}>
            Full command reference ↗
          </a>
        </div>
      </div>
    </section>
  );
}

window.WalletCloser = WalletCloser;
