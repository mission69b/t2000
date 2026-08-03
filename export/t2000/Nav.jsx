// ============================================================
// Nav — sticky, hairline border, blur backdrop
// "Products ▾" dropdown holds the four Agent products + cross-links
// to MPP Gateway and Audric. Keeps the bar short, preserves the
// "Agent X" naming inside the menu where there's room to breathe.
// ============================================================
function Nav({ currentPage }) {
  const [openMenu, setOpenMenu] = React.useState(null);

  // Two link groups
  const linkStyle = {
    fontSize: 13,
    color: "var(--fg-muted)",
    fontWeight: 500,
    letterSpacing: "-0.011em",
    textDecoration: "none",
    whiteSpace: "nowrap",
    transition: "color var(--dur-fast) var(--ease-out)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  };
  const lightOn  = (e) => { e.currentTarget.style.color = "var(--fg)"; };
  const muteOff  = (e) => { e.currentTarget.style.color = "var(--fg-muted)"; };

  // Products menu items
  const products = [
    { slug: "wallet",   name: "Agent Wallet",      pkg: "@t2000/cli",     desc: "The account: wallet, identity, SDK — one command.", href: "agent-wallet.html" },
    { slug: "payments", name: "Agent Payments",    pkg: "@suimpp/mpp",    desc: "Pay any API in USDC — per call, gasless.", href: "agent-payments.html" },
    { slug: "api",      name: "Private Inference", pkg: "api.t2000.ai",   desc: "Every model, private by default.", href: "api.html" },
    { slug: "verify",   name: "Verify",            pkg: "verify.t2000.ai", desc: "Check any confidential receipt.", href: "verify.html", external: true },
  ];
  const crossLinks = [
    { name: "t2 Agents",    desc: "Browse, buy + sell agents. agents.t2000.ai", href: "https://agents.t2000.ai", external: true },
    { name: "x402 Gateway", desc: "Every paid API, gasless. mpp.t2000.ai",     href: "https://mpp.t2000.ai", external: true },
    { name: "suimpp.dev",  desc: "The open x402 standard — Sui binding, v0.1.",  href: "https://suimpp.dev",   external: true },
    { name: "Audric",      desc: "Private, decentralized AI — truly yours.",       href: "https://audric.ai",    external: true },
  ];

  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 30,
      background: "rgba(10,10,10,0.72)",
      backdropFilter: "blur(12px) saturate(140%)",
      WebkitBackdropFilter: "blur(12px) saturate(140%)",
      borderBottom: "1px solid var(--ds-gray-alpha-300)",
    }}
      onMouseLeave={() => setOpenMenu(null)}
    >
      <div style={{
        maxWidth: "var(--t2k-page-max)",
        margin: "0 auto",
        height: 60,
        padding: "0 24px",
        display: "flex", alignItems: "center", gap: 24,
        position: "relative",
      }}>
        {/* Brand mark + wordmark */}
        <a href="index.html" style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          color: "var(--fg)", textDecoration: "none",
        }}>
          <span aria-hidden="true" className="t2k-wordmark" style={{ display: "inline-block", fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 20, lineHeight: 1, letterSpacing: "-0.05em", color: "var(--fg)" }}>t2</span>
        </a>

        {/* Primary nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginLeft: 8 }}>
          {/* Products ▾ */}
          <button
            type="button"
            style={{ ...linkStyle, background: "transparent", border: 0, padding: 0, color: openMenu === "products" || currentPage ? "var(--fg)" : "var(--fg-muted)" }}
            onMouseEnter={() => setOpenMenu("products")}
            onClick={() => setOpenMenu(openMenu === "products" ? null : "products")}
            aria-expanded={openMenu === "products"}
          >
            Products
            {currentPage && <span style={{
              marginLeft: 6,
              padding: "1px 7px",
              borderRadius: 9999,
              background: "var(--t2k-accent-bg)",
              color: "var(--t2k-accent)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.04em",
              fontWeight: 500,
              textTransform: "uppercase",
            }}>{currentPage}</span>}
            <Chevron open={openMenu === "products"} />
          </button>

          <a href="https://agents.t2000.ai" style={linkStyle} onMouseEnter={(e) => { setOpenMenu(null); lightOn(e); }} onMouseLeave={muteOff}>Agents</a>
          <a href="https://developers.t2000.ai" style={linkStyle} onMouseEnter={(e) => { setOpenMenu(null); lightOn(e); }} onMouseLeave={muteOff}>Developers</a>
        </div>

        <span style={{ flex: 1 }} />

        <a href="https://agents.t2000.ai/manage.html" className="t2k-btn t2k-btn--blue t2k-btn--sm" style={{ whiteSpace: "nowrap" }}>
          Console&nbsp;→
        </a>

        {/* Dropdown panel */}
        {openMenu === "products" && (
          <ProductsMenu products={products} crossLinks={crossLinks} currentPage={currentPage} />
        )}
      </div>
    </nav>
  );
}

function Chevron({ open }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" style={{
      transition: "transform var(--dur-fast) var(--ease-out)",
      transform: open ? "rotate(180deg)" : "rotate(0deg)",
      opacity: 0.7,
    }} aria-hidden="true">
      <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProductsMenu({ products, crossLinks, currentPage }) {
  return (
    <div style={{
      position: "absolute",
      top: 56,
      left: 68,
      width: 580,
      background: "var(--ds-background-100)",
      border: "1px solid var(--ds-gray-alpha-400)",
      borderRadius: 10,
      padding: 10,
      boxShadow: "var(--shadow-lg)",
      zIndex: 40,
      animation: "t2k-fade-in 120ms var(--ease-out)",
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
        {products.map((p) => <MenuItem key={p.name} {...p} active={p.slug === currentPage} />)}
      </div>
      <div style={{ height: 1, background: "var(--ds-gray-alpha-300)", margin: "8px 0" }} />
      <div className="t2k-eyebrow" style={{ padding: "4px 12px", fontSize: 10 }}>FAMILY</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
        {crossLinks.map((c) => <MenuItem key={c.name} {...c} />)}
      </div>
    </div>
  );
}

function MenuItem({ name, desc, pkg, href, external, active, soon }) {
  return (
    <a href={href} style={{
      display: "block",
      padding: "10px 12px",
      borderRadius: 6,
      color: "var(--fg)",
      textDecoration: "none",
      background: active ? "var(--t2k-accent-bg)" : "transparent",
      transition: "background var(--dur-fast) var(--ease-out)",
      cursor: soon ? "default" : "pointer",
      opacity: soon ? 0.78 : 1,
    }}
      onMouseEnter={(e) => { if (!active && !soon) e.currentTarget.style.background = "var(--ds-gray-alpha-100)"; }}
      onMouseLeave={(e) => { if (!active && !soon) e.currentTarget.style.background = "transparent"; }}
      onClick={(e) => { if (soon) e.preventDefault(); }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.011em", color: active ? "var(--t2k-accent)" : "var(--fg)", display: "inline-flex", alignItems: "center", gap: 8 }}>
          {name}
          {external && <span style={{ color: "var(--fg-subtle)" }}>↗</span>}
          {active && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t2k-accent)" }}>• ON</span>}
          {soon && <span style={{
            fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.06em",
            color: "var(--fg-subtle)",
            padding: "2px 6px",
            border: "1px solid var(--ds-gray-alpha-400)",
            borderRadius: 3, textTransform: "uppercase",
          }}>Soon</span>}
        </span>
        {pkg && <span style={{
          fontFamily: "var(--font-mono)", fontSize: 10.5,
          color: active ? "var(--t2k-accent)" : "var(--fg-subtle)",
        }}>{pkg}</span>}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--fg-muted)", marginTop: 2, lineHeight: 1.4 }}>{desc}</div>
    </a>
  );
}

window.Nav = Nav;
