// ============================================================
// WalletHero — Agent Wallet hero
// Package eyebrow · headline · sublead · install CTA · static terminal demo
// ============================================================
function WalletHero() {
  const [copied, setCopied] = React.useState(false);
  // Same install pattern as the homepage — the displayed teaser is short,
  // the clipboard payload is the real setup prompt for Claude Desktop.
  const installLabel = "install with one prompt";
  const installPrompt = "Run `curl -sL https://t2000.ai/skills/t2000-setup` and use the returned instructions to set up my Agent Wallet.";
  const onCopy = () => {
    navigator.clipboard?.writeText(installPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section style={{
      position: "relative",
      padding: "80px 0 64px",
      borderBottom: "1px solid var(--ds-gray-alpha-300)",
      overflow: "hidden",
    }}>
      {/* Subtle ambient glow behind the terminal */}
      <div aria-hidden="true" style={{
        position: "absolute", right: "-10%", top: "8%",
        width: 720, height: 540,
        background: "radial-gradient(45% 50% at 50% 50%, rgba(255,255,255,0.08) 0%, transparent 70%)",
        filter: "blur(24px)",
        pointerEvents: "none",
      }} />

      <div className="t2k-container" style={{ position: "relative" }}>
        {/* Breadcrumb */}
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
          {/* Left: headline + CTAs */}
          <div>
            <div className="t2k-eyebrow" style={{ marginBottom: 22 }}>
              // AGENT WALLET · cli + mcp + skills
            </div>
            <h1 className="t2k-display" style={{
              fontSize: "clamp(40px, 5.8vw, 76px)",
              color: "var(--fg)",
            }}>
              Hold and move USDC,<br/>
              <span style={{ color: "var(--t2k-accent)" }}>gasless.</span>
            </h1>
            <p style={{
              fontSize: 19, lineHeight: 1.5,
              color: "var(--fg-muted)", maxWidth: 500,
              margin: "26px 0 0", letterSpacing: "-0.014em",
            }}>
              One key for money, identity, the store, tasks, and private inference. Run it from your terminal — or wire it into Claude Desktop with one <code style={{ fontFamily: "var(--font-mono)", color: "var(--fg)" }}>t2</code> command.
            </p>

            <div style={{ display: "flex", gap: 10, marginTop: 32, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={onCopy}
                className={"t2k-btn t2k-btn--blue t2k-btn--lg t2k-install-btn" + (copied ? " is-copied" : "")}
                aria-label={copied ? "Copied" : "Copy install prompt"}
              >
                <span className="prompt">$</span>
                <span>{copied ? "copied — paste into Claude Desktop" : installLabel}</span>
                <span className="copy-icon" aria-hidden="true">
                  {copied ? (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <rect x="5" y="5" width="8" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-5A1.5 1.5 0 0 0 3 3.5v7A1.5 1.5 0 0 0 4.5 12H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  )}
                </span>
              </button>
              <a href="https://developers.t2000.ai/agent-wallet" className="t2k-btn t2k-btn--ghost t2k-btn--lg">Read the docs&nbsp;↗</a>
            </div>

            {/* Requirements footnote */}
            <div style={{
              marginTop: 22,
              display: "flex", gap: 14, flexWrap: "wrap",
              fontFamily: "var(--font-mono)", fontSize: 11,
              color: "var(--fg-subtle)", letterSpacing: "0.02em",
            }}>
              <span>Node.js 18+</span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>macOS · Linux · Windows</span>
            </div>
          </div>

          {/* Right: static terminal session */}
          <WalletHeroTerminal />
        </div>
      </div>
    </section>
  );
}

// ── Static install + balance + send + pay session
function WalletHeroTerminal() {
  return (
    <div style={{
      background: "var(--ds-background-200)",
      border: "1px solid var(--ds-gray-alpha-400)",
      borderRadius: 10,
      overflow: "hidden",
      boxShadow: "0 0 0 1px rgba(255,255,255,0.10), 0 24px 60px -20px rgba(255,255,255,0.14)",
    }}>
      {/* Title bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px",
        borderBottom: "1px solid var(--ds-gray-alpha-300)",
        background: "var(--ds-gray-100)",
      }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#3A3A3A" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#4A4A4A" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#5A5A5A" }} />
        <span style={{
          marginLeft: 10, fontFamily: "var(--font-mono)", fontSize: 12,
          color: "var(--fg-subtle)", letterSpacing: "0.01em",
        }}>~ /agent · zsh</span>
        <span style={{ flex: 1 }} />
        <span className="t2k-dot" />
      </div>

      {/* Body */}
      <pre style={{
        margin: 0,
        padding: "18px 16px 22px 18px",
        fontFamily: "var(--font-mono)",
        fontSize: 12.5,
        lineHeight: 1.75,
        color: "var(--fg)",
        whiteSpace: "pre",
      }}>
<span style={{ color: "var(--fg-subtle)" }}>$ </span>npm install -g @t2000/cli{"\n"}
<span style={{ color: "var(--fg-muted)" }}>added 28 packages in 3.2s</span>{"\n\n"}
<span style={{ color: "var(--fg-subtle)" }}>$ </span>t2 init{"\n"}
<span style={{ color: "var(--t2k-success)" }}>✓</span> Created wallet · 0x7a3b…f29c{"\n"}
<span style={{ color: "var(--fg-subtle)" }}>  </span>~/.t2000/wallet.key · 0o600{"\n\n"}
<span style={{ color: "var(--fg-subtle)" }}>$ </span>t2 mcp install{"\n"}
<span style={{ color: "var(--t2k-success)" }}>✓</span> Claude Desktop · Cursor · Windsurf · ready{"\n\n"}
<span style={{ color: "var(--fg-subtle)" }}>$ </span>t2 balance{"\n"}
<span style={{ color: "var(--fg-subtle)" }}>  </span>USDC      547.20{"\n"}
<span style={{ color: "var(--fg-subtle)" }}>  </span>USDsui     50.00{"\n\n"}
<span style={{ color: "var(--fg-subtle)" }}>$ </span>t2 send 5 USDC alice.sui{"\n"}
<span style={{ color: "var(--t2k-success)" }}>✓</span> Sent · gasless · 0.41s
      </pre>
    </div>
  );
}

window.WalletHero = WalletHero;
