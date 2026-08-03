// ============================================================
// FiveLayers — "What every agent needs."
// The five layers of the agent economy: what's live, what's next,
// what's on the horizon. Status is a mono tag, never a filled badge.
// ============================================================
function FiveLayers() {
  return (
    <section className="t2k-section" style={{ paddingLeft: 24, paddingRight: 24, borderBottom: "1px solid var(--ds-gray-alpha-300)" }}>
      <div className="t2k-container">
        <div className="t2k-eyebrow" style={{ marginBottom: 18 }}>// THE FIVE LAYERS</div>
        <h2 className="t2k-display t2k-section-title" style={{ fontSize: "clamp(34px, 5vw, 62px)" }}>
          What every agent needs.
        </h2>
        <p style={{ fontSize: 17, lineHeight: 1.6, color: "var(--fg-muted)", maxWidth: 520, margin: "20px 0 0", letterSpacing: "-0.014em" }}>
          Identity, commerce, capital, labor, law. Machines and humans use the same five layers.
        </p>

        <div className="t2k-layers">
          {T2K.layers.map((l) => (
            <LayerCard key={l.n} {...l} />
          ))}
        </div>

        <div className="t2k-layer-extras">
          <ExtraCard
            chip="@t2000/sdk" mono
            title="Agent SDK"
            desc="One TypeScript class under all of it — wallet, payments, swaps."
            href="https://developers.t2000.ai/agent-sdk"
          />
          <ExtraCard
            chip="developers.t2000.ai" mono accent
            title="Docs"
            desc="Quickstart, CLI reference, API reference — everything above."
            href="https://developers.t2000.ai"
          />
        </div>
      </div>
    </section>
  );
}

function LayerCard({ n, name, status, statusColor, desc, chips, links, wide }) {
  return (
    <article className={"t2k-layer" + (wide ? " t2k-layer--wide" : "")}>
      <header className="t2k-layer-head">
        <span className="t2k-layer-n">{n}</span>
        <span className="t2k-layer-status" style={{ color: statusColor }}>{status}</span>
      </header>

      <h3 className="t2k-layer-name">{name}</h3>
      <p className="t2k-layer-desc">{desc}</p>

      <div className="t2k-layer-chips">
        {chips.map((c) => <span key={c} className="t2k-chip">{c}</span>)}
      </div>

      {links && links.length > 0 && (
        <div className="t2k-layer-links">
          {links.map((k) => (
            <a key={k.l} href={k.href} className="t2k-layer-link">
              {k.l} <span aria-hidden="true">→</span>
            </a>
          ))}
        </div>
      )}
    </article>
  );
}

function ExtraCard({ chip, title, desc, href, accent }) {
  return (
    <a href={href} className="t2k-extra">
      <span className={"t2k-chip t2k-chip--mono" + (accent ? " t2k-chip--accent" : "")}>{chip}</span>
      <div style={{ flex: 1 }}>
        <div className="t2k-extra-title">{title}</div>
        <div className="t2k-extra-desc">{desc}</div>
      </div>
      <span className="t2k-extra-arrow" aria-hidden="true">→</span>
    </a>
  );
}

window.FiveLayers = FiveLayers;
