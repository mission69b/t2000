// ============================================================
// PaymentsHero — Agent Payments hero
// Hero distinctly uses a live-activity-feed demo (NOT a terminal) —
// the marketplace energy, not the CLI energy. Recent agent payments
// scrolling against a "● live" indicator.
// ============================================================
function PaymentsHero() {
  return (
    <section style={{
      position: "relative",
      padding: "80px 0 64px",
      borderBottom: "1px solid var(--ds-gray-alpha-300)",
      overflow: "hidden",
    }}>
      <div aria-hidden="true" style={{
        position: "absolute", right: "-10%", top: "8%",
        width: 720, height: 540,
        background: "radial-gradient(45% 50% at 50% 50%, rgba(255,255,255,0.08) 0%, transparent 70%)",
        filter: "blur(24px)",
        pointerEvents: "none",
      }} />

      <div className="t2k-container" style={{ position: "relative" }}>
        <a href="index.html" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 13, color: "var(--fg-muted)", textDecoration: "none",
          fontFamily: "var(--font-mono)", letterSpacing: "0.01em",
          marginBottom: 28,
        }}
          onMouseEnter={(e) => e.currentTarget.style.color = "var(--fg)"}
          onMouseLeave={(e) => e.currentTarget.style.color = "var(--fg-muted)"}
        >
          <span style={{ opacity: 0.6 }}>←</span> t2000.ai
        </a>

        <div style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 56,
          alignItems: "center",
        }}>
          {/* Left: headline */}
          <div>
            <div className="t2k-eyebrow" style={{ marginBottom: 22 }}>
              // AGENT PAYMENTS · x402 ON SUI
            </div>
            <h1 className="t2k-display" style={{
              fontSize: "clamp(40px, 5.8vw, 76px)",
              color: "var(--fg)",
            }}>
              Pay any API<br/>
              <span style={{ color: "var(--t2k-accent)" }}>in USDC.</span>
            </h1>
            <p style={{
              fontSize: 19, lineHeight: 1.5,
              color: "var(--fg-muted)", maxWidth: 500,
              margin: "26px 0 0", letterSpacing: "-0.014em",
            }}>
              Your agent hits an endpoint. The gateway prices it. USDC settles in under a second. No keys. No accounts.
            </p>

            <div style={{ display: "flex", gap: 10, marginTop: 32, flexWrap: "wrap" }}>
              <a href="https://mpp.t2000.ai" className="t2k-btn t2k-btn--blue t2k-btn--lg">
                Browse services&nbsp;↗
              </a>
              <a href="https://developers.t2000.ai/agent-payments" className="t2k-btn t2k-btn--ghost t2k-btn--lg">Read the docs&nbsp;↗</a>
            </div>

            {/* Inline price floor + open standard tag */}
            <div style={{
              marginTop: 22,
              display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center",
              fontFamily: "var(--font-mono)", fontSize: 11,
              color: "var(--fg-subtle)", letterSpacing: "0.02em",
            }}>
              <span>~$0.005 per LLM call</span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>~400ms settle</span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>$0 network fee</span>
            </div>

            {/* Open standard line — subtle but assertive */}
            <a href="https://suimpp.dev" style={{
              marginTop: 16,
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "6px 12px 6px 10px",
              border: "1px solid var(--ds-gray-alpha-400)",
              borderRadius: 9999,
              background: "var(--ds-gray-alpha-100)",
              fontSize: 12,
              color: "var(--fg-muted)",
              textDecoration: "none",
              letterSpacing: "-0.011em",
              transition: "border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--t2k-accent)"; e.currentTarget.style.color = "var(--fg)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--ds-gray-alpha-400)"; e.currentTarget.style.color = "var(--fg-muted)"; }}
            >
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 10,
                color: "var(--t2k-accent)", letterSpacing: "0.06em",
              }}>OPEN STANDARD</span>
              <span style={{ width: 1, height: 11, background: "var(--ds-gray-alpha-400)" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>suimpp.dev</span>
              <span style={{ opacity: 0.55 }}>↗</span>
            </a>
          </div>

          {/* Right: live payment activity feed */}
          <PaymentsActivityFeed />
        </div>
      </div>
    </section>
  );
}

// ── Static "tail -f payments.log" — recent agent payments
function PaymentsActivityFeed() {
  const entries = [
    { ago: "5s",  service: "openai",      endpoint: "/chat/completions",     amount: "$0.012", live: true },
    { ago: "12s", service: "fal.ai",      endpoint: "/flux/dev",             amount: "$0.050" },
    { ago: "37s", service: "elevenlabs",  endpoint: "/text-to-speech",       amount: "$0.008" },
    { ago: "1m",  service: "anthropic",   endpoint: "/messages",             amount: "$0.015" },
    { ago: "1m",  service: "coingecko",   endpoint: "/price",                amount: "$0.001" },
    { ago: "2m",  service: "firecrawl",   endpoint: "/scrape",               amount: "$0.002" },
    { ago: "3m",  service: "tavily",      endpoint: "/search",               amount: "$0.005" },
    { ago: "4m",  service: "lob",         endpoint: "/postcards",            amount: "$1.000" },
  ];

  return (
    <div style={{
      background: "var(--ds-background-200)",
      border: "1px solid var(--ds-gray-alpha-400)",
      borderRadius: 10,
      overflow: "hidden",
      boxShadow: "0 0 0 1px rgba(255,255,255,0.10), 0 24px 60px -20px rgba(255,255,255,0.13)",
    }}>
      {/* Title bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px",
        borderBottom: "1px solid var(--ds-gray-alpha-300)",
        background: "var(--ds-gray-100)",
      }}>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 12,
          color: "var(--fg-subtle)", letterSpacing: "0.01em",
          display: "inline-flex", alignItems: "center", gap: 7,
        }}>
          <span className="t2k-dot" />
          mpp.t2000.ai · live
        </span>
        <span style={{ flex: 1 }} />
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 11,
          color: "var(--fg-subtle)",
        }}>tail -f payments.log</span>
      </div>

      {/* Activity table */}
      <div style={{ padding: "8px 0" }}>
        {entries.map((e, i) => (
          <div key={i} style={{
            display: "grid",
            gridTemplateColumns: "44px 1fr auto",
            alignItems: "center",
            gap: 12,
            padding: "9px 18px",
            fontFamily: "var(--font-mono)", fontSize: 12.5,
            color: e.live ? "var(--fg)" : "var(--fg-muted)",
            opacity: e.live ? 1 : 0.92 - i * 0.06,
            borderBottom: i < entries.length - 1 ? "1px solid var(--ds-gray-alpha-200)" : "none",
          }}>
            <span style={{
              color: "var(--fg-subtle)",
              fontSize: 11,
              fontVariantNumeric: "tabular-nums",
            }}>{e.ago}</span>
            <span>
              <span style={{ color: e.live ? "var(--t2k-success)" : "var(--fg)" }}>{e.service}</span>
              <span style={{ color: "var(--fg-subtle)" }}>{e.endpoint}</span>
            </span>
            <span style={{
              fontVariantNumeric: "tabular-nums",
              color: "var(--fg)",
            }}>{e.amount}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

window.PaymentsHero = PaymentsHero;
