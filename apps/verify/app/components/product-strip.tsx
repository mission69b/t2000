import { NAV_PRODUCTS } from "../data/site";

// "One agent stack." cross-sell strip (designer's ProductStrip) — links out
// to the six t2000.ai product pages.
export function ProductStrip() {
  return (
    <section
      className="border-t"
      style={{ padding: "72px 24px", borderTopColor: "var(--border)" }}
    >
      <div className="t2k-container">
        <header className="mb-9">
          <span className="t2k-eyebrow mb-3.5 block">{"// PART OF THE STACK"}</span>
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: "clamp(28px, 3.6vw, 40px)",
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
              color: "var(--fg)",
            }}
          >
            One agent stack.
          </h2>
        </header>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {NAV_PRODUCTS.map((p) => (
            <a
              key={p.slug}
              href={p.href}
              className="group flex flex-col rounded-lg border p-[20px_18px] no-underline transition-colors border-[color:var(--border)] hover:border-[color:var(--t2k-accent)] hover:bg-[color:var(--t2k-accent-bg)]"
              style={{ color: "var(--fg)" }}
            >
              <div className="mb-1.5 flex items-center justify-between">
                <span
                  className="font-mono text-[10.5px]"
                  style={{ color: "var(--fg-subtle)", letterSpacing: "0.06em" }}
                >
                  {p.pkg}
                </span>
                <span className="text-[13px]" style={{ color: "var(--fg-subtle)" }}>
                  →
                </span>
              </div>
              <span className="text-[17px] font-semibold" style={{ letterSpacing: "-0.018em" }}>
                {p.name}
              </span>
              <span className="mt-1 text-[12.5px] leading-snug" style={{ color: "var(--fg-muted)" }}>
                {p.desc}
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
