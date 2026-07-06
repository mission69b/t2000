import { GATEWAY_URL, T2K } from "../../data/t2k";
import { CountUp } from "./CountUp";

// The metrics band renders LIVE numbers (repositioning rule: numbers render
// live or not at all): paid calls / settled volume from the gateway stats
// API, registered agents from the directory. Falls back to the static
// baseline in t2k.ts when an API is unreachable at revalidate time.
async function getLiveMetrics(): Promise<ReadonlyArray<readonly [string, string]>> {
  const [stats, agents] = await Promise.all([
    fetch(`${GATEWAY_URL}/api/mpp/stats`, { next: { revalidate: 300 } })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null) as Promise<{
      totalPayments?: number;
      totalVolume?: string;
    } | null>,
    fetch("https://api.t2000.ai/v1/agents?limit=1", {
      next: { revalidate: 300 },
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null) as Promise<{ total?: number } | null>,
  ]);

  return T2K.metricsFallback.map(([label, fallback]) => {
    if (label === "Registered agents" && agents?.total) {
      return [label, String(agents.total)] as const;
    }
    if (label === "Paid calls" && stats?.totalPayments) {
      return [label, stats.totalPayments.toLocaleString("en-US")] as const;
    }
    if (label === "Settled" && stats?.totalVolume) {
      return [label, `$${Math.round(parseFloat(stats.totalVolume))}`] as const;
    }
    return [label, fallback] as const;
  });
}

export async function Metrics() {
  const metrics = await getLiveMetrics();

  return (
    <section
      className="border-y px-6 py-16"
      style={{
        background: "var(--ds-background-200)",
        borderColor: "var(--border)",
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
                i < metrics.length - 1 ? "1px solid var(--border)" : "none",
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
                fontSize: 44,
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
