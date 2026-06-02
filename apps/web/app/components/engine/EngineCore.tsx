// EngineCore — systems 01 + 02, compact. 01 Agent Harness: read/write
// split + tool families. 02 Reasoning Engine: 12 guards across 3 tiers.
// The ARCHITECTURE grid is the map; this is the two artifacts that matter.

export function EngineCore() {
  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header style={{ marginBottom: 48, maxWidth: 720 }}>
          <span className="t2k-eyebrow">{"// TOOLS"}</span>
          <h2 className="t2k-section-title" style={{ marginTop: 12 }}>
            Wired.
            <br />
            <span style={{ color: "var(--fg-muted)" }}>And guarded.</span>
          </h2>
          <p className="t2k-section-sub">
            26 tools your agent can call. 12 guards it can&apos;t get around.
          </p>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <HarnessCard />
          <ReasoningCard />
        </div>
      </div>
    </section>
  );
}

function HarnessCard() {
  const reads = 18;
  const writes = 8;
  return (
    <div
      className="t2k-card"
      style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "14px 18px",
          borderBottom: "1px solid var(--ds-gray-alpha-300)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--fg-subtle)",
              letterSpacing: "0.06em",
            }}
          >
            01
          </span>
          <span style={{ width: 1, height: 12, background: "var(--ds-gray-alpha-400)" }} />
          <span style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.011em" }}>
            Agent Harness
          </span>
        </div>
        <span className="t2k-eyebrow" style={{ fontSize: 10 }}>
          26 TOOLS
        </span>
      </header>

      <div style={{ padding: "18px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div
            style={{
              display: "flex",
              height: 6,
              borderRadius: 3,
              overflow: "hidden",
              background: "var(--ds-background-200)",
            }}
          >
            <div style={{ flex: reads, background: "var(--ds-gray-500)" }} />
            <div style={{ flex: writes, background: "var(--t2k-accent)" }} />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 8,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.04em",
            }}
          >
            <span
              style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--fg-muted)" }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--ds-gray-500)",
                }}
              />
              {reads} read · parallel
            </span>
            <span
              style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--t2k-accent)" }}
            >
              {writes} write · confirm-tier
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--t2k-accent)",
                }}
              />
            </span>
          </div>
        </div>

        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            lineHeight: 1.7,
            color: "var(--fg-muted)",
          }}
        >
          <span style={{ color: "var(--fg-subtle)", letterSpacing: "0.04em" }}>
            FAMILIES&nbsp;&nbsp;
          </span>
          wallet · payments · navi · cetus · ptb · sui · data · stream
        </div>
      </div>

      <div
        style={{
          padding: "14px 18px",
          borderTop: "1px solid var(--ds-gray-alpha-300)",
          background: "var(--ds-background-200)",
          marginTop: "auto",
        }}
      >
        <div className="t2k-eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>
          SAMPLE DEFINITION
        </div>
        <pre
          style={{
            margin: 0,
            fontFamily: "var(--font-mono)",
            fontSize: 11.5,
            lineHeight: 1.65,
            color: "var(--fg)",
            whiteSpace: "pre",
          }}
        >
          <span style={{ color: "var(--ds-blue-700)" }}>const</span>
          {" sendTool = "}
          <span style={{ color: "var(--ds-teal-700)" }}>tool</span>
          {"({\n  description: "}
          <span style={{ color: "var(--t2k-success)" }}>{"'Send USDC'"}</span>
          {",\n  parameters: z."}
          <span style={{ color: "var(--ds-teal-700)" }}>object</span>
          {"({ to, amount, asset }),\n  execute: (p) => t."}
          <span style={{ color: "var(--ds-teal-700)" }}>send</span>
          {"(p),\n});"}
        </pre>
      </div>
    </div>
  );
}

interface Tier {
  name: string;
  color: string;
  desc: string;
}

function ReasoningCard() {
  const TIERS: Tier[] = [
    { name: "block", color: "var(--ds-red-700)", desc: "hard stop · agent escalates" },
    { name: "warn", color: "var(--ds-amber-700)", desc: "flag · continues with note" },
    { name: "tap", color: "var(--t2k-accent)", desc: "user confirms in one tap" },
  ];

  return (
    <div
      className="t2k-card"
      style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "14px 18px",
          borderBottom: "1px solid var(--ds-gray-alpha-300)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--fg-subtle)",
              letterSpacing: "0.06em",
            }}
          >
            02
          </span>
          <span style={{ width: 1, height: 12, background: "var(--ds-gray-alpha-400)" }} />
          <span style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.011em" }}>
            Reasoning Engine
          </span>
        </div>
        <span className="t2k-eyebrow" style={{ fontSize: 10 }}>
          12 GUARDS
        </span>
      </header>

      <div style={{ padding: "18px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--fg-subtle)",
            letterSpacing: "0.04em",
          }}
        >
          12 GUARDS · 3 PRIORITY TIERS
        </div>
        {TIERS.map((t) => (
          <div
            key={t.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "6px 0",
              borderBottom: "1px dotted var(--ds-gray-alpha-300)",
              fontFamily: "var(--font-mono)",
              fontSize: 11.5,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: t.color,
                flexShrink: 0,
              }}
            />
            <span style={{ color: "var(--fg)", minWidth: 48 }}>{t.name}</span>
            <span style={{ color: "var(--fg-subtle)", fontSize: 10.5 }}>{t.desc}</span>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: "14px 18px",
          borderTop: "1px solid var(--ds-gray-alpha-300)",
          background: "var(--ds-background-200)",
          marginTop: "auto",
        }}
      >
        <div className="t2k-eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>
          EXAMPLE TRIP
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11.5,
            lineHeight: 1.65,
            color: "var(--fg)",
          }}
        >
          <div>
            <span style={{ color: "var(--ds-red-700)" }}>✗</span>{" "}
            <span style={{ color: "var(--ds-amber-700)" }}>GUARD</span>{" "}
            <span style={{ color: "var(--fg)" }}>spending_limits</span>
          </div>
          <div style={{ color: "var(--fg-muted)", paddingLeft: 18, fontSize: 11 }}>
            attempted $310 · daily cap $200 · blocked
          </div>
          <div style={{ color: "var(--fg-muted)", paddingLeft: 18, fontSize: 11 }}>
            escalated to user.
          </div>
        </div>
      </div>
    </div>
  );
}
