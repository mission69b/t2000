// ============================================================
// Pricing — "Free. Open source. Mostly gasless."
// Sits between Products and Metrics on the homepage.
// Single source of truth for the family's cost story.
// ============================================================
function Pricing() {
  const rows = [
    {
      pkg: "@t2000/cli",     name: "Agent Wallet",   line: "Free · MIT",
      gasless: ["USDC sends", "USDsui sends", "MPP API calls"],
      withGas: "Swaps (~0.05 SUI per tx)",
    },
    {
      pkg: "@suimpp/mpp",    name: "Agent Payments", line: "Free to use",
      gasless: ["Every paid request"],
      withGas: "Per-request fee to the upstream service",
    },
    {
      pkg: "@t2000/sdk",     name: "Agent SDK",      line: "Free · MIT",
      gasless: ["Same rails as Wallet"],
      withGas: "Same gas as Wallet",
    },
    {
      pkg: "@t2000/id",      name: "Agent ID",       line: "Free · MIT",
      gasless: ["Register", "Handle", "Profile + service"],
      withGas: "Nothing — identity is fully sponsored",
    },
    {
      pkg: "api.t2000.ai",   name: "Private API",   line: "Usage-based",
      gasless: ["Pay-per-call in USDC"],
      withGas: "Per-token model cost · confidential TEE tier",
    },
    {
      pkg: "agents.t2000.ai", name: "Agent Commerce", line: "2.5% flat",
      gasless: ["List a service", "Escrowed buys + payouts"],
      withGas: "Facilitator fee only — 2.5% of each sale",
    },
  ];

  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
          gap: 48, alignItems: "end",
          marginBottom: 40,
        }}>
          <div>
            <span className="t2k-eyebrow">// PRICING</span>
            <h2 className="t2k-section-title" style={{ marginTop: 14, lineHeight: 1.0 }}>
              Free.<br/>
              <span style={{ color: "var(--fg-muted)" }}>Mostly gasless.</span>
            </h2>
          </div>
          <div>
            <p style={{
              fontSize: 16, lineHeight: 1.6,
              color: "var(--fg-muted)", margin: 0,
              letterSpacing: "-0.011em", maxWidth: 480,
            }}>
              Every package is MIT. Sends and API calls ship <span style={{ color: "var(--fg)" }}>gasless on Sui</span>. Only swaps touch real gas.
            </p>
          </div>
        </header>

        {/* Pricing table */}
        <div className="t2k-card" style={{ overflow: "hidden" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.5fr 1.5fr 150px",
            padding: "12px 22px",
            gap: 24,
            borderBottom: "1px solid var(--ds-gray-alpha-300)",
            background: "var(--ds-gray-100)",
            fontFamily: "var(--font-mono)", fontSize: 10.5,
            color: "var(--fg-subtle)", letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}>
            <span>Product</span>
            <span>Gasless</span>
            <span>You pay gas for</span>
            <span style={{ textAlign: "right" }}>Price</span>
          </div>

          {rows.map((r) => (
            <div key={r.pkg} style={{
              display: "grid",
              gridTemplateColumns: "1fr 1.5fr 1.5fr 150px",
              padding: "18px 22px",
              gap: 24,
              borderBottom: "1px solid var(--ds-gray-alpha-300)",
              alignItems: "start",
            }}>
              <div>
                <div style={{
                  fontFamily: "var(--font-sans)", fontWeight: 600,
                  fontSize: 15, letterSpacing: "-0.018em",
                  color: "var(--fg)",
                }}>{r.name}</div>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 11,
                  color: "var(--fg-subtle)", marginTop: 3,
                }}>{r.pkg}</div>
              </div>
              <div style={{
                fontSize: 13.5, lineHeight: 1.55,
                color: "var(--fg-muted)", letterSpacing: "-0.011em",
              }}>
                {r.gasless.map((g, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ color: "var(--t2k-success)" }}>✓</span>
                    <span>{g}</span>
                  </div>
                ))}
              </div>
              <div style={{
                fontSize: 13.5, lineHeight: 1.55,
                color: "var(--fg-muted)", letterSpacing: "-0.011em",
              }}>{r.withGas}</div>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 12.5,
                color: "var(--fg)", textAlign: "right",
                fontVariantNumeric: "tabular-nums",
              }}>{r.line}</div>
            </div>
          ))}
        </div>

        {/* Footnote */}
        <p style={{
          marginTop: 18, fontSize: 12.5,
          color: "var(--fg-subtle)", fontFamily: "var(--font-mono)",
          letterSpacing: "0.01em",
        }}>
          // Gasless = $0 network fee via Sui's <span style={{ color: "var(--fg-muted)" }}>Gasless Stablecoin Transfers</span>. Swaps need ~0.05 SUI for chain gas.
        </p>
      </div>
    </section>
  );
}

window.Pricing = Pricing;
