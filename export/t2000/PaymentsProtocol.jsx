// ============================================================
// PaymentsProtocol — how MPP works (HTTP 402 → quote → pay → retry)
// 3-step horizontal flow with concrete artifacts. The protocol is the
// product moment — this block earns the "no signup, no API keys" claim.
// ============================================================
function PaymentsProtocol() {
  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header style={{ marginBottom: 48, maxWidth: 720 }}>
          <span className="t2k-eyebrow">// HOW IT WORKS · HTTP 402</span>
          <h2 className="t2k-section-title" style={{ marginTop: 12 }}>
            No signup. <span style={{ color: "var(--fg-muted)" }}>No API keys.</span>
          </h2>
          <p className="t2k-section-sub">
            Send. Get priced. Pay. Get the response. Under two seconds end to end.
          </p>
        </header>

        {/* The flow — 4 panels, arrows between */}
        <FlowDiagram />

        {/* Concrete spec strip */}
        <div style={{
          marginTop: 32,
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 0,
          border: "1px solid var(--ds-gray-alpha-300)",
          borderRadius: 8,
          overflow: "hidden",
          background: "var(--ds-background-200)",
        }}>
          {[
            { label: "PROTOCOL",  value: "MPP",                        sub: "Machine Payments" },
            { label: "TOKEN",     value: "USDC",                       sub: "Sui mainnet" },
            { label: "SPONSORED PTB", value: "splitCoins → transferObjects",   sub: "gas: sponsor" },
            { label: "SETTLE",    value: "~400ms",                     sub: "Sui finality" },
          ].map((s, i) => (
            <div key={s.label} style={{
              padding: "16px 18px",
              borderRight: i < 3 ? "1px solid var(--ds-gray-alpha-300)" : "none",
              display: "flex", flexDirection: "column", gap: 6,
            }}>
              <span className="t2k-eyebrow" style={{ fontSize: 10 }}>{s.label}</span>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 13.5,
                color: "var(--fg)", wordBreak: "break-all",
              }}>{s.value}</span>
              <span style={{
                fontSize: 11.5, color: "var(--fg-subtle)",
                lineHeight: 1.4,
              }}>{s.sub}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FlowDiagram() {
  const steps = [
    {
      n: "01",
      title: "Request",
      body: <React.Fragment>
        <span style={{ color: "var(--fg-subtle)" }}>POST </span>
        <span>/openai/v1/chat/completions</span>
      </React.Fragment>,
      note: "First hit is always free.",
    },
    {
      n: "02",
      title: "402 Challenge",
      body: <React.Fragment>
        <span style={{ color: "var(--ds-amber-700)" }}>HTTP 402</span>{"\n"}
        <span style={{ color: "var(--fg-subtle)" }}>{"{"} price: <b style={{ color: "var(--fg)" }}>0.012</b>,{"\n  "}recipient: <span style={{ color: "var(--fg)" }}>0x4f…a01</span>,{"\n  "}expiry: 30s {"}"}</span>
      </React.Fragment>,
      note: "Gateway prices the call. 30 seconds to settle.",
    },
    {
      n: "03",
      title: "Sign + Retry",
      body: <React.Fragment>
        <span>splitCoins → transferObjects</span>{"\n"}
        <span style={{ color: "var(--fg-subtle)" }}>↳ </span>
        <span>Payment: 0x7a3b…</span>
      </React.Fragment>,
      note: "USDC sent gasless. Same request, retried with the Payment header.",
    },
    {
      n: "04",
      title: "200 OK",
      body: <React.Fragment>
        <span style={{ color: "var(--t2k-success)" }}>200 OK</span>{"\n"}
        <span style={{ color: "var(--fg-subtle)" }}>{"{"} choices: [...] {"}"}</span>
      </React.Fragment>,
      note: "Upstream response, forwarded.",
    },
  ];

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: 14,
      alignItems: "stretch",
    }}>
      {steps.map((s, i) => (
        <React.Fragment key={s.n}>
          <div className="t2k-card" style={{
            padding: "18px 18px 16px",
            display: "flex", flexDirection: "column", gap: 12,
            position: "relative",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 11,
                color: i === 2 ? "var(--t2k-accent)" : "var(--fg-subtle)",
                letterSpacing: "0.06em",
              }}>{s.n}</span>
              <span style={{ width: 1, height: 12, background: "var(--ds-gray-alpha-400)" }} />
              <span style={{
                fontFamily: "var(--font-sans)", fontWeight: 600,
                fontSize: 15, letterSpacing: "-0.011em",
              }}>{s.title}</span>
            </div>

            {/* Mono content */}
            <pre style={{
              margin: 0,
              padding: "10px 12px",
              background: "var(--ds-background-200)",
              border: "1px solid var(--ds-gray-alpha-300)",
              borderRadius: 4,
              borderLeft: i === 1 ? "2px solid var(--ds-amber-700)" : i === 3 ? "2px solid var(--t2k-success)" : "2px solid var(--t2k-accent)",
              fontFamily: "var(--font-mono)", fontSize: 11,
              lineHeight: 1.65, color: "var(--fg)",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
              minHeight: 84,
            }}>{s.body}</pre>

            <p style={{
              fontSize: 12.5, lineHeight: 1.5,
              color: "var(--fg-muted)", margin: 0,
            }}>{s.note}</p>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

window.PaymentsProtocol = PaymentsProtocol;
