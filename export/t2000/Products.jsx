// ============================================================
// Products — "The climb": four capabilities an agent gains,
// bottom to top. A numbered vertical ladder with a connecting
// spine, each rung linking to its product page(s).
// Hairline borders, no shadow, Geist canonical.
// ============================================================
function Products() {
  return (
    <section className="t2k-section" id="stack">
      <div className="t2k-container">
        <header style={{ marginBottom: 48, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
          <div>
            <span className="t2k-eyebrow">// THE STACK</span>
            <h2 className="t2k-section-title" style={{ marginTop: 12 }}>
              Everything an agent needs.
            </h2>
          </div>
          <p style={{
            fontSize: 16, lineHeight: 1.55,
            color: "var(--fg-muted)", margin: 0,
            maxWidth: 340, letterSpacing: "-0.011em",
          }}>
            Four products, one stack. Free and MIT.
          </p>
        </header>

        <div className="t2k-climb">
          {T2K.climb.map((r, i) => (
            <ClimbRung key={r.n} r={r} last={i === T2K.climb.length - 1} />
          ))}
        </div>

        {/* Substrate + platform footer */}
        <div className="t2k-climb-base">
          <a href="agent-sdk.html" className="t2k-climb-base-card">
            <span className="t2k-mono-tag">@t2000/sdk</span>
            <div>
              <div className="t2k-climb-base-name">Agent SDK</div>
              <div className="t2k-climb-base-sub">One TypeScript class under all of it. Wallet, payments, swaps — the substrate that powers Audric.</div>
            </div>
            <span className="t2k-climb-base-arrow">→</span>
          </a>
          <a href="https://agents.t2000.ai/" className="t2k-climb-base-card">
            <span className="t2k-mono-tag t2k-mono-tag--blue">agents.t2000.ai</span>
            <div>
              <div className="t2k-climb-base-name">Agent Store</div>
              <div className="t2k-climb-base-sub">The marketplace + console. Browse and sell agents, post tasks, and manage one Passport, keys, billing and every receipt.</div>
            </div>
            <span className="t2k-climb-base-arrow">→</span>
          </a>
        </div>
      </div>
    </section>
  );
}

function ClimbRung({ r, last }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div className="t2k-rung">
      {/* Left spine: node + connector */}
      <div className="t2k-rung-spine">
        <span className="t2k-rung-node" style={hover ? { borderColor: "var(--t2k-accent)", color: "var(--t2k-accent)" } : null}>{r.n}</span>
        {!last && <span className="t2k-rung-line" />}
      </div>

      {/* Right content */}
      <div
        className="t2k-rung-body"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={hover ? { borderColor: "var(--ds-gray-alpha-500)" } : null}
      >
        <div className="t2k-rung-head">
          <div>
            <span className="t2k-rung-layer">{r.layer}</span>
            <h3 className="t2k-rung-name">{r.name}</h3>
          </div>
          <div className="t2k-rung-one">{r.one}</div>
        </div>

        <p className="t2k-rung-desc">{r.desc}</p>

        <div className="t2k-rung-foot">
          <div className="t2k-rung-verbs">
            {r.verbs.map((v, idx) => (
              <div key={idx}><span className="t2k-rung-dollar">$</span>{v}</div>
            ))}
          </div>
          <div className="t2k-rung-links">
            {r.links.map((l, idx) => (
              <a key={idx} href={l.href} className="t2k-rung-link">{l.label} →</a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

window.Products = Products;
