import { T2K } from "../../data/t2k";
import { CountUp } from "./CountUp";

export function Metrics() {
  return (
    <section
      className="border-y px-6 py-16"
      style={{
        background: "var(--ds-background-200)",
        borderColor: "var(--ds-gray-alpha-300)",
      }}
    >
      <div
        className="mx-auto grid grid-cols-2 md:grid-cols-5"
        style={{ maxWidth: "var(--t2k-page-max)" }}
      >
        {T2K.metrics.map(([label, value], i) => (
          <div
            key={label}
            className="px-6 py-4 md:py-0"
            style={{
              borderRight:
                i < T2K.metrics.length - 1
                  ? "1px solid var(--ds-gray-alpha-300)"
                  : "none",
            }}
          >
            <div className="t2k-eyebrow" style={{ fontSize: 11 }}>
              {label}
            </div>
            <div
              className="mt-2.5"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: 48,
                lineHeight: 1.05,
                letterSpacing: "-0.04em",
                color: "var(--fg)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <CountUp value={value} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
