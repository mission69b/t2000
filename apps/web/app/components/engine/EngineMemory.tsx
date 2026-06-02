// EngineMemory — systems 03 + 04, at the same depth as tools/guards.
// 03 Memory (MemWal): recall + daily financial_context snapshot.
// 04 AdviceLog: record_advice → recalled next session.

interface Capability {
  fn: string;
  note: string;
}

export function EngineMemory() {
  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header style={{ marginBottom: 48, maxWidth: 720 }}>
          <span className="t2k-eyebrow">{"// MEMORY"}</span>
          <h2 className="t2k-section-title" style={{ marginTop: 12 }}>
            It remembers
            <br />
            <span style={{ color: "var(--fg-muted)" }}>what generic agents forget.</span>
          </h2>
          <p className="t2k-section-sub">
            Your money, your habits, the advice it already gave — across every session.
          </p>
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
          }}
        >
          <MemoryCard />
          <AdviceCard />
        </div>
      </div>
    </section>
  );
}

function MemoryCard() {
  const CAPS: Capability[] = [
    { fn: "recall(message)", note: "injects <memory_recall> at prepareStep" },
    { fn: "financialContextBlock", note: "daily <financial_context> snapshot" },
    { fn: "write(finishReason)", note: "post-turn analyze · learns patterns" },
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
              color: "var(--t2k-accent)",
              letterSpacing: "0.06em",
            }}
          >
            03
          </span>
          <span style={{ width: 1, height: 12, background: "var(--ds-gray-alpha-400)" }} />
          <span style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.011em" }}>Memory</span>
        </div>
        <span className="t2k-eyebrow" style={{ fontSize: 10 }}>
          MEMWAL
        </span>
      </header>

      <div
        style={{
          padding: "16px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          fontFamily: "var(--font-mono)",
          fontSize: 11.5,
          color: "var(--fg-muted)",
        }}
      >
        {CAPS.map((c) => (
          <div
            key={c.fn}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              padding: "5px 0",
              borderBottom: "1px dotted var(--ds-gray-alpha-300)",
            }}
          >
            <span style={{ color: "var(--fg)" }}>{c.fn}</span>
            <span style={{ fontSize: 10, color: "var(--fg-subtle)", textAlign: "right" }}>
              {c.note}
            </span>
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
          SAMPLE RECALL
        </div>
        <pre
          style={{
            margin: 0,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            lineHeight: 1.7,
            color: "var(--fg)",
            whiteSpace: "pre-wrap",
          }}
        >
          <span style={{ color: "var(--ds-blue-700)" }}>{"<memory_recall>"}</span>
          {"\n"}
          <span style={{ color: "var(--fg-muted)" }}>{"  prefers USDC over USDsui for sends"}</span>
          {"\n"}
          <span style={{ color: "var(--fg-muted)" }}>{"  NAVI target $5,000 · 78% there"}</span>
          {"\n"}
          <span style={{ color: "var(--fg-muted)" }}>{"  compounds rewards weekly"}</span>
          {"\n"}
          <span style={{ color: "var(--ds-blue-700)" }}>{"</memory_recall>"}</span>
        </pre>
      </div>
    </div>
  );
}

function AdviceCard() {
  const CAPS: Capability[] = [
    { fn: "record_advice(text)", note: "logs every suggestion it makes" },
    { fn: "buildAdviceContext()", note: "injected at the next session start" },
    { fn: "follow-up", note: "won't repeat or contradict itself" },
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
              color: "var(--t2k-accent)",
              letterSpacing: "0.06em",
            }}
          >
            04
          </span>
          <span style={{ width: 1, height: 12, background: "var(--ds-gray-alpha-400)" }} />
          <span style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.011em" }}>
            AdviceLog
          </span>
        </div>
        <span className="t2k-eyebrow" style={{ fontSize: 10 }}>
          PRISMA
        </span>
      </header>

      <div
        style={{
          padding: "16px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          fontFamily: "var(--font-mono)",
          fontSize: 11.5,
          color: "var(--fg-muted)",
        }}
      >
        {CAPS.map((c) => (
          <div
            key={c.fn}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              padding: "5px 0",
              borderBottom: "1px dotted var(--ds-gray-alpha-300)",
            }}
          >
            <span style={{ color: "var(--fg)" }}>{c.fn}</span>
            <span style={{ fontSize: 10, color: "var(--fg-subtle)", textAlign: "right" }}>
              {c.note}
            </span>
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
          RECORDED
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            lineHeight: 1.7,
            color: "var(--fg)",
          }}
        >
          <div>
            <span style={{ color: "var(--t2k-accent)", marginRight: 6 }}>▸</span>
            record_advice()
          </div>
          <div style={{ color: "var(--fg-muted)", paddingLeft: 18 }}>
            &quot;move idle USDC → NAVI · 5.2%&quot;
          </div>
          <div style={{ color: "var(--fg-subtle)", paddingLeft: 18, fontSize: 10.5 }}>
            3 days ago · not yet acted on
          </div>
          <div style={{ color: "var(--t2k-success)", paddingLeft: 18, marginTop: 4 }}>
            ✓ recalled next session
          </div>
        </div>
      </div>
    </div>
  );
}
