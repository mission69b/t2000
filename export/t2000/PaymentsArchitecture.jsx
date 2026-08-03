// ============================================================
// PaymentsArchitecture — three-property strip
// Where to go next: gateway · standard · docs.
// Sitemap-style. No marketing prose. Three cards, one line each.
// ============================================================
function PaymentsArchitecture() {
  const properties = [
    {
      url:      "mpp.t2000.ai",
      href:     "https://mpp.t2000.ai",
      role:     "GATEWAY",
      title:    "The live gateway.",
      desc:     "Browse 40 services, 88 endpoints, real activity.",
      cta:      "Open the gateway",
    },
    {
      url:      "suimpp.dev",
      href:     "https://suimpp.dev",
      role:     "STANDARD",
      title:    "The open standard.",
      desc:     "MPP is an open spec. Anyone can implement a gateway.",
      cta:      "Read the spec",
      standard: true,
    },
    {
      url:      "developers.t2000.ai",
      href:     "https://developers.t2000.ai/agent-payments",
      role:     "DOCS",
      title:    "The developer docs.",
      desc:     "Full reference for @suimpp/mpp + recipes.",
      cta:      "Read the docs",
    },
  ];

  return (
    <section style={{
      padding: "80px 0",
      borderTop: "1px solid var(--ds-gray-alpha-300)",
      borderBottom: "1px solid var(--ds-gray-alpha-300)",
      background: "var(--ds-background-200)",
    }}>
      <div className="t2k-container">
        <header style={{ marginBottom: 32, maxWidth: 720 }}>
          <span className="t2k-eyebrow">// ARCHITECTURE</span>
          <h2 style={{
            fontFamily: "var(--font-display)", fontWeight: 600,
            fontSize: 28, lineHeight: 1.15, letterSpacing: "-0.022em",
            margin: "10px 0 0", color: "var(--fg)",
          }}>
            Three properties. <span style={{ color: "var(--fg-muted)" }}>One stack.</span>
          </h2>
        </header>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 14,
        }}>
          {properties.map((p) => (
            <a key={p.url} href={p.href} className="t2k-card" style={{
              padding: "22px 22px 18px",
              display: "flex", flexDirection: "column", gap: 14,
              textDecoration: "none", color: "var(--fg)",
              transition: "border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out)",
              background: "var(--bg-elevated)",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--ds-gray-alpha-500)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--ds-gray-alpha-400)"; }}
            >
              {/* URL row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 13,
                  color: "var(--fg)", letterSpacing: "0.01em",
                }}>{p.url}</span>
                <span className="t2k-eyebrow" style={{
                  fontSize: 10,
                  color: p.standard ? "var(--t2k-accent)" : "var(--fg-subtle)",
                }}>{p.role}</span>
              </div>

              <div style={{ height: 1, background: "var(--ds-gray-alpha-300)" }} />

              {/* Title */}
              <div style={{
                fontFamily: "var(--font-sans)", fontWeight: 600,
                fontSize: 18, lineHeight: 1.2, letterSpacing: "-0.022em",
              }}>{p.title}</div>

              {/* Description */}
              <p style={{
                fontSize: 13.5, lineHeight: 1.5,
                color: "var(--fg-muted)", margin: 0,
              }}>{p.desc}</p>

              <div style={{ flex: 1 }} />

              {/* CTA */}
              <div style={{
                fontSize: 13, fontWeight: 500, letterSpacing: "-0.011em",
                color: p.standard ? "var(--t2k-accent)" : "var(--fg)",
                display: "inline-flex", alignItems: "center", gap: 4,
              }}>
                {p.cta} <span style={{ opacity: 0.6 }}>↗</span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

window.PaymentsArchitecture = PaymentsArchitecture;
