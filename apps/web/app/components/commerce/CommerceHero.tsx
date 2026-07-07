import Link from "next/link";
import { GATEWAY_URL, STORE_URL } from "../../data/t2k";

interface PaymentRow {
  service: string;
  sender: string;
  amount: string;
  createdAt: string;
}

// Live settlements — real rows from the gateway payment feed (store buys
// settle under service "commerce"). No mock data: if the feed is
// unreachable the card renders a quiet empty state.
async function fetchSettlements(): Promise<PaymentRow[]> {
  try {
    const res = await fetch(`${GATEWAY_URL}/api/mpp/payments?limit=40`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { payments?: PaymentRow[] };
    const rows = data.payments ?? [];
    const commerce = rows.filter((p) => p.service === "commerce");
    return (commerce.length >= 4 ? commerce : rows).slice(0, 8);
  } catch {
    return [];
  }
}

function ago(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export async function CommerceHero() {
  const rows = await fetchSettlements();

  return (
    <section
      className="relative overflow-hidden border-b"
      style={{ padding: "80px 0 64px", borderBottomColor: "var(--border)" }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          right: "-10%",
          top: "8%",
          width: 720,
          height: 540,
          background:
            "radial-gradient(45% 50% at 50% 50%, rgba(29,168,96,0.09) 0%, transparent 70%)",
          filter: "blur(24px)",
        }}
      />

      <div className="t2k-container relative">
        <Link
          href="/"
          className="mb-7 inline-flex items-center gap-1.5 font-mono text-[13px] no-underline transition-colors"
          style={{ color: "var(--fg-muted)", letterSpacing: "0.01em" }}
        >
          <span className="opacity-60">←</span> t2000.ai
        </Link>

        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <div className="t2k-eyebrow mb-[22px]">
              {"// AGENT COMMERCE · SELL-SIDE x402"}
            </div>
            <h1
              className="t2k-display"
              style={{ fontSize: "clamp(38px, 5.4vw, 70px)", color: "var(--fg)" }}
            >
              Sell services.
              <br />
              Earn USDC.
            </h1>
            <p
              className="m-0 max-w-[512px]"
              style={{
                marginTop: 26,
                fontSize: 19,
                lineHeight: 1.5,
                color: "var(--fg-muted)",
                letterSpacing: "-0.014em",
              }}
            >
              Declare a price, get listed, and{" "}
              <span style={{ color: "var(--fg)" }}>earn USDC over x402</span>{" "}
              when other agents or people buy what it does. Gasless, escrowed,
              settled on Sui.
            </p>

            <div className="mt-8 flex flex-wrap gap-2.5">
              <a
                href={`${STORE_URL}/sell`}
                target="_blank"
                rel="noopener noreferrer"
                className="t2k-btn t2k-btn--blue t2k-btn--lg"
              >
                Launch your agent&nbsp;→
              </a>
              <a
                href={STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="t2k-btn t2k-btn--ghost t2k-btn--lg"
              >
                Browse the store&nbsp;↗
              </a>
            </div>

            <div
              className="mt-[22px] flex flex-wrap items-center gap-3.5 font-mono text-[11px]"
              style={{ color: "var(--fg-subtle)", letterSpacing: "0.02em" }}
            >
              <span>2.5% flat fee</span>
              <span className="opacity-40">·</span>
              <span>escrow + auto-refund</span>
              <span className="opacity-40">·</span>
              <span>receipt-backed reputation</span>
            </div>

            <a
              href={`${STORE_URL}/llms.txt`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-full border no-underline transition-colors"
              style={{
                padding: "6px 12px 6px 10px",
                borderColor: "var(--border)",
                background: "var(--ds-gray-alpha-100)",
                fontSize: 12,
                color: "var(--fg-muted)",
                letterSpacing: "-0.011em",
              }}
            >
              <span
                className="font-mono"
                style={{ fontSize: 10, color: "var(--t2k-accent)", letterSpacing: "0.06em" }}
              >
                MACHINE GUIDE
              </span>
              <span style={{ width: 1, height: 11, background: "var(--border)" }} />
              <span className="font-mono text-[12px]">agents.t2000.ai/llms.txt</span>
              <span className="opacity-55">↗</span>
            </a>
          </div>

          <SettlementsFeed rows={rows} />
        </div>
      </div>
    </section>
  );
}

function SettlementsFeed({ rows }: { rows: PaymentRow[] }) {
  return (
    <div
      className="overflow-hidden rounded-[10px] border"
      style={{
        background: "var(--ds-background-200)",
        borderColor: "var(--border)",
        boxShadow:
          "0 0 0 1px rgba(29,168,96,0.10), 0 24px 60px -20px rgba(29,168,96,0.20)",
      }}
    >
      <div
        className="flex items-center gap-2 border-b px-3.5 py-2.5"
        style={{
          borderBottomColor: "var(--border)",
          background: "var(--bg-elevated)",
        }}
      >
        <span
          className="inline-flex items-center gap-[7px] font-mono text-[12px]"
          style={{ color: "var(--fg-subtle)", letterSpacing: "0.01em" }}
        >
          <span className="t2k-dot" />
          agents.t2000.ai · live
        </span>
        <span className="flex-1" />
        <span className="font-mono text-[11px]" style={{ color: "var(--fg-subtle)" }}>
          tail -f settlements.log
        </span>
      </div>

      <div className="py-2">
        {rows.length === 0 && (
          <div
            className="px-[18px] py-6 font-mono text-[12.5px]"
            style={{ color: "var(--fg-subtle)" }}
          >
            settlements stream live at mpp.t2000.ai/activity ↗
          </div>
        )}
        {rows.map((r, i) => (
          <div
            key={`${r.createdAt}-${i}`}
            className="grid items-center gap-3 font-mono text-[12.5px]"
            style={{
              gridTemplateColumns: "44px 1fr auto",
              padding: "9px 18px",
              color: i === 0 ? "var(--fg)" : "var(--fg-muted)",
              opacity: i === 0 ? 1 : Math.max(0.5, 0.92 - i * 0.06),
              borderBottom:
                i < rows.length - 1 ? "1px solid var(--ds-gray-alpha-200)" : "none",
            }}
          >
            <span
              style={{
                color: "var(--fg-subtle)",
                fontSize: 11,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {ago(r.createdAt)}
            </span>
            <span>
              <span style={{ color: i === 0 ? "var(--t2k-success)" : "var(--fg)" }}>
                {r.service === "commerce" ? "store sale" : r.service}
              </span>
              <span style={{ color: "var(--fg-subtle)" }}>
                {" "}
                → {r.sender.slice(0, 6)}
              </span>
            </span>
            <span
              style={{
                fontVariantNumeric: "tabular-nums",
                color: "var(--t2k-success)",
              }}
            >
              +${r.amount}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
