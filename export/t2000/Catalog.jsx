// ============================================================
// Catalog — 40 services / 88 endpoints teaser
// Sits between Showcase ("how you call it") and Stories ("what you
// build with it") to ground the rest of the page in the actual catalog.
// 8 services on the home page; full grid lives on the Payments page.
// ============================================================
function Catalog() {
  return (
    <section className="t2k-section">
      <div className="t2k-container">
        {/* Headline + lead — 2 columns */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
          gap: 48, alignItems: "end",
          marginBottom: 48,
        }}>
          <div>
            <span className="t2k-eyebrow">// AGENT PAYMENTS</span>
            <h2 className="t2k-section-title" style={{ marginTop: 14, lineHeight: 1.05 }}>
              Pay any API.<br/>
              <span style={{ color: "var(--t2k-accent)" }}>Gasless.</span>
            </h2>
          </div>
          <div>
            <p style={{
              fontSize: 17, lineHeight: 1.55,
              color: "var(--fg-muted)", margin: 0,
              letterSpacing: "-0.011em",
              maxWidth: 440,
            }}>
              Every major AI provider. <span style={{ color: "var(--fg)" }}>40 services, 88 endpoints</span> — live on <span style={{ color: "var(--fg)" }}>mpp.t2000.ai</span>.
            </p>
          </div>
        </div>

        {/* 8-service grid — 4 cols × 2 rows */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14,
        }}>
          {T2K.services.map((s) => <ServiceCard key={s.name} s={s} />)}
        </div>

        {/* Footer strip */}
        <a href="https://mpp.t2000.ai" style={{
          marginTop: 14,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "14px 18px",
          border: "1px dashed var(--ds-gray-alpha-400)",
          borderRadius: 8,
          color: "var(--fg)", textDecoration: "none",
          transition: "border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out)",
        }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--t2k-accent)"; e.currentTarget.style.background = "var(--t2k-accent-bg)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--ds-gray-alpha-400)"; e.currentTarget.style.background = "transparent"; }}
        >
          <div style={{
            display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
            fontFamily: "var(--font-mono)", fontSize: 13,
            color: "var(--fg-muted)",
          }}>
            <span style={{ color: "var(--fg)" }}>+ 32 more</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>88 endpoints</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>USDC on Sui</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>gasless</span>
          </div>
          <span style={{
            fontFamily: "var(--font-sans)", fontSize: 13.5,
            fontWeight: 500, letterSpacing: "-0.011em",
            color: "var(--t2k-accent)",
            whiteSpace: "nowrap",
          }}>Browse services →</span>
        </a>
      </div>
    </section>
  );
}

function ServiceCard({ s }) {
  return (
    <div className="t2k-card" style={{
      padding: "16px 16px",
      display: "flex", flexDirection: "column", gap: 4,
      transition: "border-color var(--dur-fast) var(--ease-out)",
    }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--ds-gray-alpha-500)"}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--ds-gray-alpha-400)"}
    >
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
      }}>
        <span style={{
          fontFamily: "var(--font-sans)", fontWeight: 600,
          fontSize: 16, letterSpacing: "-0.018em",
          color: "var(--fg)",
        }}>{s.name}</span>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 12,
          color: "var(--fg-muted)",
          fontVariantNumeric: "tabular-nums",
        }}>{s.from}</span>
      </div>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 10.5,
        textTransform: "uppercase",
        letterSpacing: "0.10em",
        color: "var(--fg-subtle)",
      }}>{s.cat}</span>
    </div>
  );
}

window.Catalog = Catalog;
