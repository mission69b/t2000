// ============================================================
// NotFound — generic 404 component used by t2000 + mpp + suimpp.
// Renders the property-appropriate brand + tagline + 2 CTAs.
// Brand is auto-detected from where the script is loaded; pass
// `brand` prop to override.
// ============================================================
function NotFound({ brand = "t2000", homeHref = "index.html" }) {
  const config = {
    t2000: {
      logo:      "assets/t2000-logo.svg",
      mark:      "t2000",
      title:     "Page not found.",
      sub:       "The thing you wanted isn't here. Probably never was.",
      primary:   { l: "Back home",          href: homeHref },
      secondary: { l: "Read the docs ↗",    href: "https://developers.t2000.ai" },
    },
    mpp: {
      logo:      "assets/t2000-logo.svg",
      mark:      "mpp",
      title:     "Endpoint not found.",
      sub:       "No such resource at this URL. The gateway only routes to known services.",
      primary:   { l: "Browse services",    href: "services.html" },
      secondary: { l: "Open OpenAPI ↗",     href: "https://mpp.t2000.ai/openapi.json" },
    },
    suimpp: {
      logo:      null,
      mark:      "suimpp",
      title:     "Section not found.",
      sub:       "This page isn't part of the v0.1 spec. Try the spec index.",
      primary:   { l: "Read the spec",      href: "spec.html" },
      secondary: { l: "GitHub ↗",           href: "https://github.com/mission69b/suimpp" },
    },
  };

  const c = config[brand] || config.t2000;

  return (
    <section style={{
      minHeight: "calc(100vh - 60px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "80px 24px",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Soft ambient glow */}
      <div aria-hidden="true" style={{
        position: "absolute", left: "50%", top: "50%",
        transform: "translate(-50%,-50%)",
        width: 760, height: 360,
        background: `radial-gradient(50% 50% at 50% 50%, rgba(255,255,255,0.10) 0%, transparent 70%)`,
        filter: "blur(24px)",
        pointerEvents: "none",
      }} />

      <div style={{ position: "relative", maxWidth: 640, textAlign: "center" }}>
        {/* 404 in big numbers */}
        <div style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: "clamp(96px, 18vw, 200px)",
          lineHeight: 0.9,
          letterSpacing: "-0.05em",
          color: "var(--fg)",
          fontVariantNumeric: "tabular-nums",
          marginBottom: 12,
        }}>
          4<span style={{ color: "var(--t2k-accent)" }}>0</span>4
        </div>

        {/* Brand mark */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
          {c.logo && <span aria-hidden="true" style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 15, lineHeight: 1, letterSpacing: "-0.05em", color: "var(--fg)" }}>t2</span>}
          <span style={{
            fontFamily: brand === "mpp" ? "var(--font-mono)" : "var(--font-sans)",
            fontSize: 14, fontWeight: 500,
            color: "var(--fg-muted)",
            letterSpacing: brand === "mpp" ? "0.02em" : "-0.022em",
            paddingLeft: c.logo ? 8 : 0,
            borderLeft: c.logo ? "1px solid var(--ds-gray-alpha-300)" : "none",
          }}>{c.mark}</span>
        </div>

        <h1 style={{
          fontFamily: "var(--font-sans)", fontWeight: 600,
          fontSize: "clamp(28px, 4vw, 40px)",
          lineHeight: 1.15, letterSpacing: "-0.025em",
          margin: 0, color: "var(--fg)",
        }}>{c.title}</h1>

        <p style={{
          marginTop: 14, fontSize: 16, lineHeight: 1.55,
          color: "var(--fg-muted)", letterSpacing: "-0.011em",
          maxWidth: 460, marginLeft: "auto", marginRight: "auto",
        }}>{c.sub}</p>

        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 32, flexWrap: "wrap" }}>
          <a href={c.primary.href} className="t2k-btn t2k-btn--blue t2k-btn--lg">{c.primary.l}</a>
          <a href={c.secondary.href} className="t2k-btn t2k-btn--ghost t2k-btn--lg">{c.secondary.l}</a>
        </div>
      </div>
    </section>
  );
}

window.NotFound = NotFound;
