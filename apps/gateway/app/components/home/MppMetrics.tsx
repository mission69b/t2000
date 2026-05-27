import { totalServices, totalEndpoints, totalCategories } from "@/lib/catalog";
import { prisma } from "@/lib/prisma";

async function getLifetimeStats() {
  try {
    const [payments, agg] = await Promise.all([
      prisma.mppPayment.count(),
      prisma.mppPayment.findMany({ select: { amount: true } }),
    ]);
    const volume = agg.reduce((sum, row) => sum + (parseFloat(row.amount) || 0), 0);
    return { payments, volume };
  } catch {
    return { payments: 0, volume: 0 };
  }
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function fmtVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(2)}k`;
  return `$${v.toFixed(2)}`;
}

export async function MppMetrics() {
  const { payments, volume } = await getLifetimeStats();

  const cells: Array<[string, string]> = [
    ["Services", totalServices().toString()],
    ["Endpoints", totalEndpoints().toString()],
    ["Categories", totalCategories().toString()],
    ["Requests settled", payments > 0 ? fmtCount(payments) : "—"],
    ["Volume", volume > 0 ? fmtVolume(volume) : "—"],
  ];

  return (
    <section
      style={{
        background: "var(--ds-background-200)",
        borderTop: "1px solid var(--ds-gray-alpha-300)",
        borderBottom: "1px solid var(--ds-gray-alpha-300)",
        padding: "60px 24px",
      }}
    >
      <div
        className="mx-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5"
        style={{ maxWidth: "var(--t2k-page-max)" }}
      >
        {cells.map(([label, value], i) => (
          <div
            key={label}
            className="px-6 py-4 lg:py-0"
            style={{
              borderRight:
                i < cells.length - 1
                  ? "1px solid var(--ds-gray-alpha-300)"
                  : "none",
            }}
          >
            <div className="t2k-eyebrow" style={{ fontSize: 11 }}>
              {label}
            </div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: 44,
                lineHeight: 1.05,
                letterSpacing: "-0.04em",
                marginTop: 10,
                color: "var(--fg)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
