import { T2K } from "../../data/t2k";
import { CountUp } from "./CountUp";

// The metrics band renders LIVE numbers (repositioning rule: numbers render
// live or not at all): paid calls / settled volume from the store's economy
// endpoint — the SSOT that composes escrow releases + per-call rail volume,
// so this "Settled" matches agents.t2000.ai's "Settled USDC" exactly.
// Registered agents from the directory. Falls back to the static baseline in
// t2k.ts when an API is unreachable at revalidate time.
async function getLiveMetrics(): Promise<ReadonlyArray<readonly [string, string]>> {
  const [economy, agents, usage] = await Promise.all([
    fetch("https://agents.t2000.ai/api/economy", {
      next: { revalidate: 300 },
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null) as Promise<{
      railPayments?: number;
      totalSettledUsd?: number;
    } | null>,
    fetch("https://api.t2000.ai/v1/agents?limit=1", {
      next: { revalidate: 300 },
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null) as Promise<{ total?: number } | null>,
    fetch("https://api.t2000.ai/v1/usage/global", {
      next: { revalidate: 300 },
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null) as Promise<{
      all_time?: { tokens?: number };
    } | null>,
  ]);

  return T2K.metricsFallback.map(([label, fallback]) => {
    if (label === "Registered agents" && agents?.total) {
      return [label, String(agents.total)] as const;
    }
    if (label === "Paid calls" && economy?.railPayments) {
      return [label, economy.railPayments.toLocaleString("en-US")] as const;
    }
    if (label === "Settled" && economy?.totalSettledUsd) {
      return [label, `$${Math.round(economy.totalSettledUsd)}`] as const;
    }
    if (label === "Tokens routed" && usage?.all_time?.tokens) {
      const t = usage.all_time.tokens;
      const v = t >= 1e6 ? `${Math.round(t / 1e6)}M` : `${Math.round(t / 1e3)}k`;
      return [label, v] as const;
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
