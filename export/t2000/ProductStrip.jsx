// ============================================================
// ProductStrip — cross-product navigation, appears near the bottom of
// every product page. Lets visitors hop to siblings without going through
// the nav. Active product is dimmed (you're already here).
// ============================================================
function ProductStrip({ currentPage }) {
  const products = [
    { slug: "wallet",   name: "Agent Wallet",      pkg: "@t2000/cli",      href: "agent-wallet.html"   },
    { slug: "payments", name: "Agent Payments",    pkg: "@suimpp/mpp",     href: "agent-payments.html" },
    { slug: "api",      name: "Private Inference", pkg: "api.t2000.ai",    href: "api.html"            },
    { slug: "verify",   name: "Verify",            pkg: "verify.t2000.ai", href: "verify.html"         },
  ];

  return (
    <section style={{
      padding: "72px 24px",
      borderTop: "1px solid var(--ds-gray-alpha-300)",
    }}>
      <div className="t2k-container">
        <span className="t2k-eyebrow" style={{ display: "block", marginBottom: 14 }}>
          // PART OF THE STACK
        </span>
        <h2 style={{
          fontFamily: "var(--font-display)", fontWeight: 600,
          fontSize: "clamp(28px, 3.6vw, 40px)",
          letterSpacing: "-0.03em", lineHeight: 1.1,
          margin: "0 0 36px",
          color: "var(--fg)",
        }}>
          One agent stack.
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {products.map((p) => {
            const active = p.slug === currentPage;
            return (
              <a key={p.slug}
                href={active ? "#" : p.href}
                style={{
                  display: "flex", flexDirection: "column",
                  padding: "20px 18px",
                  background: active ? "var(--ds-gray-alpha-100)" : "transparent",
                  border: "1px solid " + (active ? "var(--ds-gray-alpha-500)" : "var(--ds-gray-alpha-400)"),
                  borderRadius: 8,
                  textDecoration: "none",
                  color: active ? "var(--fg-muted)" : "var(--fg)",
                  transition: "border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out)",
                  cursor: active ? "default" : "pointer",
                  pointerEvents: active ? "none" : "auto",
                }}
                onMouseEnter={(e) => { if (!active) { e.currentTarget.style.borderColor = "var(--t2k-accent)"; e.currentTarget.style.background = "var(--t2k-accent-bg)"; } }}
                onMouseLeave={(e) => { if (!active) { e.currentTarget.style.borderColor = "var(--ds-gray-alpha-400)"; e.currentTarget.style.background = "transparent"; } }}
              >
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  marginBottom: 6,
                }}>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 10.5,
                    color: "var(--fg-subtle)", letterSpacing: "0.06em",
                  }}>{p.pkg}</span>
                  {active ? (
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 10,
                      color: "var(--t2k-accent)", letterSpacing: "0.06em",
                    }}>YOU&apos;RE HERE</span>
                  ) : (
                    <span style={{ color: "var(--fg-subtle)", fontSize: 13 }}>→</span>
                  )}
                </div>
                <span style={{
                  fontFamily: "var(--font-sans)", fontSize: 17, fontWeight: 600,
                  letterSpacing: "-0.018em",
                }}>{p.name}</span>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}

window.ProductStrip = ProductStrip;
