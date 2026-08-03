// ============================================================
// SiteFooter — reusable footer (brand block + 2 columns + bottom bar)
// Used on every page (homepage, product pages, …).
// ============================================================
function SiteFooter() {
  return (
    <footer style={{
      borderTop: "1px solid var(--ds-gray-alpha-300)",
      padding: "56px 24px 28px",
    }}>
      <div className="t2k-container">
        {/* Top: brand block + 2 curated columns */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1.6fr 1fr 1fr 1fr",
          gap: 40,
          marginBottom: 48,
        }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span aria-hidden="true" style={{ display: "inline-block", fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 15, lineHeight: 1, letterSpacing: "-0.05em", color: "var(--fg)" }}>t2</span>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 600, letterSpacing: "-0.022em", color: "var(--fg)" }}>t2000</span>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--fg-muted)", margin: 0, maxWidth: 300 }}>
              The agent economy on Sui. Identity, wallet, commerce &mdash; non-custodial, gasless, verifiable.
            </p>
            <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-subtle)" }}>
              <span className="t2k-dot" />
              <span>Sui mainnet</span>
            </div>
          </div>

          <FooterCol title="Products" links={[
            { l: "Agent Wallet",      href: "agent-wallet.html" },
            { l: "Agent Payments",    href: "agent-payments.html" },
            { l: "Private Inference", href: "api.html" },
          ]} />

          <FooterCol title="For machines" links={[
            { l: "llms.txt",       href: "https://t2000.ai/llms.txt" },
            { l: "AGENTS.md",      href: "https://t2000.ai/AGENTS.md" },
            { l: "Agent skills",   href: "https://t2000.ai/skills" },
            { l: "x402 discovery", href: "https://mpp.t2000.ai/.well-known/x402", external: true },
          ]} />

          <FooterCol title="Family" links={[
            { l: "t2 Agents",    href: "https://agents.t2000.ai", external: true },
            { l: "x402 Gateway", href: "https://mpp.t2000.ai",    external: true },
            { l: "Verify",       href: "verify.html",             external: true },
            { l: "Audric",       href: "https://audric.ai",       external: true },
            { l: "suimpp.dev",   href: "https://suimpp.dev",      external: true },
            { l: "Developers",   href: "https://developers.t2000.ai", external: true },
          ]} />
        </div>

        <hr className="t2k-rule" />

        {/* Bottom bar — copyright + minimal legal */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          paddingTop: 20, gap: 24, flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 12, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)" }}>
            <span>© 2026 t2000 AFI Inc.</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>Built on Sui</span>
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
            {["GitHub", "Discord", "X"].map((l) => (
              <a key={l} href="#" style={{ color: "var(--fg-subtle)", textDecoration: "none" }}
                onMouseEnter={(e) => e.currentTarget.style.color = "var(--fg)"}
                onMouseLeave={(e) => e.currentTarget.style.color = "var(--fg-subtle)"}
              >{l}</a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }) {
  return (
    <div>
      <div className="t2k-eyebrow" style={{ fontSize: 11, marginBottom: 16 }}>{title}</div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 11 }}>
        {links.map((link) => (
          <li key={link.l}>
            <a href={link.soon ? "#" : (link.href || "#")} style={{
              fontSize: 13.5,
              color: link.soon ? "var(--fg-subtle)" : "var(--fg-muted)",
              textDecoration: "none",
              letterSpacing: "-0.011em",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              cursor: link.soon ? "default" : "pointer",
            }}
              onClick={(e) => { if (link.soon) e.preventDefault(); }}
              onMouseEnter={(e) => { if (!link.soon) e.currentTarget.style.color = "var(--fg)"; }}
              onMouseLeave={(e) => { if (!link.soon) e.currentTarget.style.color = "var(--fg-muted)"; }}
            >
              {link.l}
              {link.external && <span style={{ opacity: 0.55, fontSize: 11 }}>↗</span>}
              {link.soon && <span style={{
                fontFamily: "var(--font-mono)", fontSize: 9.5,
                letterSpacing: "0.06em", color: "var(--fg-subtle)",
                padding: "1px 6px",
                border: "1px solid var(--ds-gray-alpha-400)",
                borderRadius: 3, textTransform: "uppercase",
              }}>Soon</span>}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

window.SiteFooter = SiteFooter;
