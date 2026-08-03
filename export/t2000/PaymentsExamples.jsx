// ============================================================
// PaymentsExamples — "What your agent builds with MPP."
// Self-contained StoryCard (originally shared from the homepage,
// now local since the homepage dropped its Stories section).
// Filtered to MPP stories, shows the same chained prompts.
// ============================================================
function StoryCard({ s }) {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(s.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      border: "1px solid var(--ds-gray-alpha-400)",
      borderRadius: 10, overflow: "hidden",
      background: "var(--bg-elevated)",
    }}>
      {/* Header — mono tag + copy */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 16px", borderBottom: "1px solid var(--ds-gray-alpha-300)",
      }}>
        <span className="t2k-mono-tag t2k-mono-tag--blue">{s.tag}</span>
        <button onClick={copy} style={{
          fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.02em",
          color: copied ? "var(--t2k-success)" : "var(--fg-subtle)",
          background: "transparent", border: "none", cursor: "pointer", padding: 0,
        }}>{copied ? "✓ copied" : "copy ⧉"}</button>
      </div>

      {/* Body */}
      <div style={{ padding: "18px 20px 20px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        <h3 style={{
          fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 16,
          letterSpacing: "-0.018em", color: "var(--fg)", margin: 0,
        }}>{s.title}</h3>

        <p style={{
          fontSize: 14, lineHeight: 1.55, color: "var(--fg-muted)",
          letterSpacing: "-0.011em", margin: 0,
        }}>“{s.prompt}”</p>

        {/* Step trace */}
        <code style={{
          fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.6,
          color: "var(--fg-subtle)", background: "var(--ds-background-200)",
          border: "1px solid var(--ds-gray-alpha-300)", borderRadius: 6,
          padding: "9px 11px", wordBreak: "break-word",
        }}>{s.steps.join("  ")}</code>

        {/* Footer — done + cost */}
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 6, paddingTop: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--t2k-success)", fontSize: 13 }}>✓</span>
            <span style={{ fontSize: 13, color: "var(--fg)", letterSpacing: "-0.011em" }}>{s.done}</span>
          </div>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.01em",
            color: "var(--fg-subtle)",
          }}>{s.total}</span>
        </div>
      </div>
    </div>
  );
}

function PaymentsExamples() {
  const mpp = T2K_STORIES.filter((s) => s.tag.startsWith("MPP"));

  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header style={{ marginBottom: 48, maxWidth: 720 }}>
          <span className="t2k-eyebrow">// COMMON PATTERNS</span>
          <h2 className="t2k-section-title" style={{ marginTop: 12 }}>
            What your agent builds.
          </h2>
          <p className="t2k-section-sub">
            Real chained prompts. Copy any, paste into Claude Desktop.
          </p>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {mpp.map((s) => <StoryCard key={s.n} s={s} />)}
        </div>
      </div>
    </section>
  );
}

window.PaymentsExamples = PaymentsExamples;
