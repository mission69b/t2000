import { T2K } from "../../data/t2k";
import { CountUp } from "./CountUp";

// Endpoints + Services counts are owned by the MPP gateway catalog — fetch
// them live (hourly ISR) so the homepage never drifts when a service is
// added/removed. Falls back to the static T2K.metrics baseline if the
// gateway is unreachable at build/revalidate time.
async function getLiveCatalogCounts(): Promise<{
  services: number;
  endpoints: number;
} | null> {
  try {
    const res = await fetch("https://mpp.t2000.ai/api/services", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return null;
    const endpoints = data.reduce<number>((n, s) => {
      const eps = (s as { endpoints?: unknown[] })?.endpoints;
      return n + (Array.isArray(eps) ? eps.length : 0);
    }, 0);
    return { services: data.length, endpoints };
  } catch {
    return null;
  }
}

export async function Metrics() {
  const live = await getLiveCatalogCounts();
  const metrics = T2K.metrics.map(([label, value]) => {
    if (live && label === "Services") return [label, String(live.services)] as const;
    if (live && label === "Endpoints") return [label, String(live.endpoints)] as const;
    return [label, value] as const;
  });

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
        {metrics.map(([label, value], i) => (
          <div
            key={label}
            className="px-6 py-4 md:py-0"
            style={{
              borderRight:
                i < metrics.length - 1
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
