import Link from "next/link";
import { allCards, totalServices, type ServiceCard } from "@/lib/catalog";

export function MppCatalogTeaser() {
  const cards = allCards().slice(0, 12);
  const total = totalServices();

  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header className="mb-10 grid items-end gap-12 md:grid-cols-2">
          <div>
            <span className="t2k-eyebrow">// SERVICES</span>
            <h2
              className="t2k-section-title"
              style={{ marginTop: 14, lineHeight: 1.0 }}
            >
              Every paid API.
              <br />
              <span style={{ color: "var(--fg-faint)" }}>For your agent.</span>
            </h2>
          </div>
          <div className="flex justify-end">
            <Link href="/services" className="t2k-btn t2k-btn--ghost">
              Browse all {total}&nbsp;→
            </Link>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((s) => (
            <ServiceTeaserCard key={s.id} s={s} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ServiceTeaserCard({ s }: { s: ServiceCard }) {
  return (
    <Link
      href={`/services/${s.id}`}
      className="t2k-card t2k-card-hover flex flex-col gap-1.5 no-underline"
      style={{ padding: "14px 16px", color: "var(--fg)" }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="font-semibold tracking-[-0.018em]"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 15,
            color: "var(--fg)",
          }}
        >
          {s.name}
        </span>
        <span
          className="font-mono"
          style={{
            fontSize: 11,
            color: "var(--fg-muted)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {s.fromPrice}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span
          className="font-mono uppercase"
          style={{
            fontSize: 10,
            letterSpacing: "0.10em",
            color: "var(--fg-subtle)",
          }}
        >
          {s.category}
        </span>
        <span
          className="font-mono"
          style={{ fontSize: 10, color: "var(--fg-subtle)" }}
        >
          {s.endpointCount} {s.endpointCount === 1 ? "endpoint" : "endpoints"}
        </span>
      </div>
    </Link>
  );
}
