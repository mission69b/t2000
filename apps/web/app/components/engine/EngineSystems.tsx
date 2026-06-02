import type { ReactNode } from "react";

interface SystemItem {
  n: string;
  tag: string;
  title: string;
  line: string;
  lives: string;
  killer?: boolean;
  icon: ReactNode;
}

const SYSTEMS: SystemItem[] = [
  {
    n: "01",
    tag: "HARNESS",
    title: "Agent Harness",
    line: "26 tools. 18 read, 8 write.",
    lives: "v2/engine.ts · tool-policy.ts",
    icon: (
      <g>
        <rect x="2.5" y="2.5" width="5" height="5" rx="1.2" />
        <rect x="10.5" y="2.5" width="5" height="5" rx="1.2" />
        <rect x="2.5" y="10.5" width="5" height="5" rx="1.2" />
        <rect x="10.5" y="10.5" width="5" height="5" rx="1.2" />
      </g>
    ),
  },
  {
    n: "02",
    tag: "REASONING",
    title: "Reasoning Engine",
    line: "Thinks before it acts. 12 guards.",
    lives: "classify-effort.ts · guards.ts",
    icon: (
      <g>
        <circle cx="4" cy="9" r="2" />
        <circle cx="14" cy="4" r="2" />
        <circle cx="14" cy="14" r="2" />
        <path d="M6 8L12 4.6M6 10L12 13.4" />
      </g>
    ),
  },
  {
    n: "03",
    tag: "MEMWAL",
    title: "Memory",
    killer: true,
    line: "Knows your money. Learns your habits.",
    lives: "prepareStep · MemoryStore",
    icon: (
      <g>
        <ellipse cx="9" cy="4" rx="6" ry="2.2" />
        <path d="M3 4v5c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2V4" />
        <path d="M3 9v5c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2V9" />
      </g>
    ),
  },
  {
    n: "04",
    tag: "PRISMA",
    title: "AdviceLog",
    killer: true,
    line: "Remembers what it told you.",
    lives: "record_advice · buildAdviceContext()",
    icon: (
      <g>
        <path d="M4 2.5h8a1.5 1.5 0 011.5 1.5v11.5L9 13l-4.5 2V4A1.5 1.5 0 014 2.5z" />
      </g>
    ),
  },
];

export function EngineSystems() {
  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header style={{ marginBottom: 44, maxWidth: 720 }}>
          <span className="t2k-eyebrow">{"// ARCHITECTURE"}</span>
          <h2 className="t2k-section-title" style={{ marginTop: 12 }}>
            Four systems.
            <br />
            <span style={{ color: "var(--fg-muted)" }}>One import.</span>
          </h2>
          <p className="t2k-section-sub">
            Tools and guards are the floor. Memory makes it a finance engine.
          </p>
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
          }}
        >
          {SYSTEMS.map((s) => (
            <div
              key={s.n}
              className="t2k-card"
              style={{
                padding: "20px 20px 18px",
                background: "var(--bg-elevated)",
                display: "flex",
                flexDirection: "column",
                position: "relative",
                minHeight: 196,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 18,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: s.killer ? "var(--t2k-accent)" : "var(--fg-subtle)",
                    letterSpacing: "0.06em",
                  }}
                >
                  {s.n}
                </span>
                <span className="t2k-eyebrow" style={{ fontSize: 9.5 }}>
                  {s.tag}
                </span>
              </div>

              <svg
                width="22"
                height="22"
                viewBox="0 0 18 18"
                fill="none"
                stroke={s.killer ? "var(--t2k-accent)" : "var(--fg)"}
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ marginBottom: 14 }}
                aria-hidden="true"
              >
                {s.icon}
              </svg>

              <h3
                style={{
                  margin: 0,
                  fontFamily: "var(--font-sans)",
                  fontSize: 16,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                  color: "var(--fg)",
                }}
              >
                {s.title}
              </h3>

              <p
                style={{
                  margin: "7px 0 0",
                  fontSize: 13,
                  lineHeight: 1.45,
                  color: "var(--fg-muted)",
                  letterSpacing: "-0.011em",
                }}
              >
                {s.line}
              </p>

              <div
                style={{
                  marginTop: "auto",
                  paddingTop: 16,
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--fg-subtle)",
                  letterSpacing: "0.01em",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {s.lives}
              </div>
            </div>
          ))}
        </div>

        <p
          style={{
            marginTop: 18,
            fontFamily: "var(--font-mono)",
            fontSize: 11.5,
            color: "var(--fg-subtle)",
            letterSpacing: "0.01em",
            lineHeight: 1.6,
            maxWidth: 760,
          }}
        >
          The engine package owns the harness and reasoning layers in code, plus the{" "}
          <span style={{ color: "var(--fg-muted)" }}>MemoryStore</span> injection point. The MemWal
          vector backend, the daily{" "}
          <span style={{ color: "var(--fg-muted)" }}>{"<financial_context>"}</span> snapshot, and the
          AdviceLog model live audric-side.
        </p>
      </div>
    </section>
  );
}
