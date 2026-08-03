// ============================================================
// Metrics — chapter break band.
// On Geist's dark canvas, we use the deepest tier (--ds-background-200)
// with hairline top/bottom borders to make the band feel distinct.
// Tabular Geist 600 numerics with count-up animation when entering view.
// ============================================================
function Metrics() {
  return (
    <section style={{
      background: "var(--ds-background-200)",
      borderTop: "1px solid var(--ds-gray-alpha-300)",
      borderBottom: "1px solid var(--ds-gray-alpha-300)",
      padding: "64px 24px",
    }}>
      <div style={{
        maxWidth: "var(--t2k-page-max)", margin: "0 auto",
        display: "grid", gridTemplateColumns: "repeat(5, 1fr)",
      }}>
        {T2K.metrics.map(([label, value], i) => (
          <div key={label} style={{
            padding: "0 24px",
            borderRight: i < T2K.metrics.length - 1 ? "1px solid var(--ds-gray-alpha-300)" : "none",
          }}>
            {/* Reserved 2-line height so a wrapping label can never push its
                value off the shared baseline. */}
            <div className="t2k-eyebrow" style={{ fontSize: 11, minHeight: 40, display: "flex", alignItems: "flex-start" }}>{label}</div>
            <div style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: 48,
              lineHeight: 1.05,
              letterSpacing: "-0.04em",
              marginTop: 0,
              color: "var(--fg)",
              fontVariantNumeric: "tabular-nums",
            }}>
              <CountUp value={value} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// Animate any numeric portion of `value`; preserve prefix/suffix.
function CountUp({ value, duration = 1100 }) {
  const ref = React.useRef(null);
  const [display, setDisplay] = React.useState(value);
  const started = React.useRef(false);

  // Parse "~400ms" → prefix="~", num=400, suffix="ms"
  const match = String(value).match(/^(\D*)(\d[\d.,]*)(\D*)$/);
  const numeric = match ? parseFloat(match[2].replace(/,/g, "")) : null;
  const prefix = match ? match[1] : "";
  const suffix = match ? match[3] : "";

  React.useEffect(() => {
    if (numeric === null) { setDisplay(value); return; }
    // Only zero-out when the band is genuinely still below the fold. If it's
    // already on screen (deep-link, restored scroll, capture) we show the real
    // number immediately — the band must never render as an unlaunched "0".
    const r = ref.current && ref.current.getBoundingClientRect();
    if (!r || r.top > window.innerHeight * 0.95) setDisplay(prefix + "0" + suffix);
    else { setDisplay(value); started.current = true; return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && !started.current) {
          started.current = true;
          const t0 = performance.now();
          const tick = (t) => {
            const k = Math.min(1, (t - t0) / duration);
            const eased = 1 - Math.pow(1 - k, 3);
            const n = numeric * eased;
            const formatted = numeric % 1 === 0 ? Math.round(n).toLocaleString("en-US") : n.toFixed(2);
            setDisplay(prefix + formatted + suffix);
            if (k < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      });
    }, { threshold: 0.2 });
    if (ref.current) io.observe(ref.current);
    // Fallback: if the observer never fires (already-scrolled load, offscreen
    // measurement, print/capture), run the count-up anyway so the band is
    // never left reading zeros.
    const fb = setTimeout(() => {
      if (!started.current) {
        started.current = true;
        setDisplay(value);
      }
    }, 2500);
    return () => { io.disconnect(); clearTimeout(fb); };
  }, [value]);

  return <span ref={ref}>{display}</span>;
}

window.Metrics = Metrics;
