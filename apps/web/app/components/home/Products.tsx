import Link from "next/link";
import { T2K } from "../../data/t2k";

export function Products() {
  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header className="mb-12 flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="t2k-eyebrow">{"// THE STACK"}</span>
            <h2 className="t2k-section-title mt-[22px]">One agent stack.</h2>
          </div>
          <p
            className="m-0 max-w-[380px] text-[16px] leading-[1.55]"
            style={{
              color: "var(--fg-muted)",
              letterSpacing: "-0.011em",
            }}
          >
            Hold, send, swap, and pay. Everything an agent needs to move
            money on Sui.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {T2K.products.map((p, i) => (
            <ProductCard key={p.slug} p={p} i={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductCard({
  p,
  i,
}: {
  p: (typeof T2K.products)[number];
  i: number;
}) {
  return (
    <Link
      href={p.href}
      className="t2k-card t2k-card-hover group flex flex-col gap-4 no-underline"
      style={{ padding: 28, color: "var(--fg)" }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-[11px]"
            style={{ color: "var(--fg-subtle)", letterSpacing: "0.06em" }}
          >
            0{i + 1}
          </span>
          <span
            className="block"
            style={{
              width: 1,
              height: 14,
              background: "var(--ds-gray-alpha-400)",
            }}
          />
          <h3
            className="m-0 text-[22px] font-semibold leading-[1.1]"
            style={{ letterSpacing: "-0.022em" }}
          >
            {p.name}
          </h3>
        </div>
        <span className="t2k-mono-tag t2k-mono-tag--blue">{p.pkg}</span>
      </div>

      <div
        className="text-[15px] font-medium leading-[1.5]"
        style={{ letterSpacing: "-0.011em", color: "var(--fg)" }}
      >
        {p.one}
      </div>

      <p
        className="m-0 text-[14px] leading-[1.55]"
        style={{ color: "var(--fg-muted)" }}
      >
        {p.desc}
      </p>

      <div
        className="mt-auto flex flex-col gap-0.5 rounded-md border font-mono text-[12px] leading-[1.7]"
        style={{
          padding: "12px 14px",
          background: "var(--ds-background-200)",
          borderColor: "var(--ds-gray-alpha-300)",
          color: "var(--fg-muted)",
        }}
      >
        {p.verbs.map((v, idx) => (
          <div key={idx}>
            <span style={{ color: "var(--fg-subtle)", marginRight: 6 }}>$</span>
            {v}
          </div>
        ))}
      </div>

      <div
        className="pt-1 text-[13px] font-medium"
        style={{
          letterSpacing: "-0.011em",
          color: "var(--t2k-accent)",
        }}
      >
        Learn more →
      </div>
    </Link>
  );
}
