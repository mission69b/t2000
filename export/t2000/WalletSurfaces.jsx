// ============================================================
// WalletSurfaces — "Two surfaces. One wallet."
// Mirrors the homepage Showcase pattern: a 2-card grid where each
// card SHOWS the wallet in use, not lists of commands.
//
// Card 01 — From your terminal (CLI):     real shell session.
// Card 02 — Inside Claude Desktop (MCP):  user prompt + tool trace + reply.
// ============================================================
function WalletSurfaces() {
  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header style={{ marginBottom: 48 }}>
          <span className="t2k-eyebrow">// TWO SURFACES</span>
          <h2 className="t2k-section-title" style={{ marginTop: 12 }}>
            Drive it from a terminal,<br/>
            <span style={{ color: "var(--fg-muted)" }}>or from Claude Desktop.</span>
          </h2>
          <p className="t2k-section-sub">
            The same keys, the same gasless rails. One <code style={{ fontFamily: "var(--font-mono)", color: "var(--fg)" }}>t2 mcp install</code> wires the wallet into any MCP-aware AI client.
          </p>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <WalletCardCLI />
          <WalletCardClaude />
        </div>
      </div>
    </section>
  );
}

// ── Shared card chrome (mirrors homepage ShowcaseCardShell pattern)
function WalletCardShell({ num, title, label, footer, children }) {
  return (
    <div className="t2k-card" style={{ display: "flex", flexDirection: "column" }}>
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 18px",
        borderBottom: "1px solid var(--ds-gray-alpha-300)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 11,
            color: "var(--fg-subtle)", letterSpacing: "0.06em",
          }}>{num}</span>
          <span style={{ width: 1, height: 12, background: "var(--ds-gray-alpha-400)" }} />
          <span style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.011em" }}>{title}</span>
        </div>
        <span className="t2k-eyebrow" style={{ fontSize: 10 }}>{label}</span>
      </header>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {children}
      </div>
      <footer style={{
        padding: "12px 18px",
        borderTop: "1px solid var(--ds-gray-alpha-300)",
        fontFamily: "var(--font-mono)", fontSize: 11.5,
        color: "var(--fg-subtle)", letterSpacing: "0.01em",
      }}>{footer}</footer>
    </div>
  );
}

// 01 · From your terminal — real shell session
function WalletCardCLI() {
  return (
    <WalletCardShell num="01" title="From your terminal" label="CLI" footer="@t2000/cli">
      <pre style={{
        margin: 0,
        padding: "22px 20px",
        background: "var(--ds-background-200)",
        color: "var(--fg)",
        fontFamily: "var(--font-mono)",
        fontSize: 13,
        lineHeight: 1.85,
        flex: 1,
        whiteSpace: "pre",
        overflow: "hidden",
        minHeight: 280,
      }}>
<span style={{ color: "var(--fg-subtle)" }}>$ </span>t2 send 10 USDC alice.sui{"\n"}
<span style={{ color: "var(--t2k-success)" }}>✓</span> Sent · gasless · 0.41s{"\n\n"}
<span style={{ color: "var(--fg-subtle)" }}>$ </span>t2 swap 50 SUI USDC{"\n"}
<span style={{ color: "var(--t2k-success)" }}>✓</span> Swapped on Cetus · 200ms{"\n\n"}
<span style={{ color: "var(--fg-subtle)" }}>$ </span>t2 pay x402.t2000.ai/openai/v1/chat{"\n"}
<span style={{ color: "var(--t2k-success)" }}>✓</span> Paid $0.012 · gasless · 200 OK
      </pre>
    </WalletCardShell>
  );
}

// 02 · Inside Claude Desktop — chat bubbles + tool trace
function WalletCardClaude() {
  return (
    <WalletCardShell num="02" title="Inside Claude Desktop" label="MCP" footer="@t2000/mcp">
      <div style={{
        flex: 1,
        padding: "20px",
        background: "var(--ds-gray-100)",
        display: "flex", flexDirection: "column", gap: 12,
        minHeight: 280,
      }}>
        <WalletBubble side="right">Send $10 USDC to alice.sui and grab the latest SUI price.</WalletBubble>
        <WalletToolTrace lines={[
          { tool: "t2000_send → alice.sui",    cost: "$10"     },
          { tool: "t2000_pay → coingecko",     cost: "$0.001"  },
        ]} note="one Payment Intent · gasless" />
        <WalletBubble side="left">
          <span style={{ color: "var(--t2k-success)", marginRight: 6 }}>✓</span>
          Sent <b>$10</b> to alice.sui · SUI is <b>$4.21</b>.
        </WalletBubble>
      </div>
    </WalletCardShell>
  );
}

// ── Atoms
function WalletBubble({ side, children }) {
  const isUser = side === "right";
  return (
    <div style={{
      alignSelf: isUser ? "flex-end" : "flex-start",
      maxWidth: "92%",
      padding: "11px 14px",
      borderRadius: 10,
      fontSize: 13.5,
      lineHeight: 1.5,
      letterSpacing: "-0.011em",
      background: isUser ? "var(--ds-gray-200)" : "var(--ds-background-200)",
      color: "var(--fg)",
      border: isUser ? "1px solid var(--ds-gray-alpha-300)" : "1px solid var(--ds-gray-alpha-400)",
    }}>{children}</div>
  );
}

function WalletToolTrace({ lines, note }) {
  return (
    <div style={{
      fontFamily: "var(--font-mono)",
      fontSize: 12,
      color: "var(--fg-muted)",
      lineHeight: 1.7,
      paddingLeft: 4,
      display: "flex", flexDirection: "column", gap: 2,
    }}>
      {lines.map((l, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span><span style={{ color: "var(--t2k-accent)", marginRight: 6 }}>▸</span>{l.tool}</span>
          {l.cost && <span style={{ color: "var(--fg-subtle)" }} className="t2k-tabular">{l.cost}</span>}
        </div>
      ))}
      {note && <div style={{ paddingLeft: 14, color: "var(--fg-subtle)", fontSize: 11 }}>{note}</div>}
    </div>
  );
}

window.WalletSurfaces = WalletSurfaces;
