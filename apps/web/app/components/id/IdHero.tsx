import Link from "next/link";
import { DEVELOPERS_URL, GATEWAY_URL, STORE_URL } from "../../data/t2k";

interface DirectoryRow {
  handle: string;
  cat: string;
  price: string;
  sales: string;
}

// Live directory card — joins the directory's top sellers (settlement-derived)
// with the public agents directory for names/prices. No fixture rows.
async function fetchTopAgents(): Promise<DirectoryRow[]> {
  try {
    const [statsRes, agentsRes] = await Promise.all([
      fetch(`${GATEWAY_URL}/commerce/stats`, { next: { revalidate: 300 } }),
      fetch("https://api.t2000.ai/v1/agents?limit=100", {
        next: { revalidate: 300 },
      }),
    ]);
    if (!statsRes.ok || !agentsRes.ok) return [];
    const stats = (await statsRes.json()) as {
      topSellers?: { seller: string; sales: number }[];
    };
    const dir = (await agentsRes.json()) as {
      agents?: {
        address: string;
        name: string;
        category: string | null;
        priceUsdc: string | null;
        active: boolean;
      }[];
    };
    const byAddress = new Map((dir.agents ?? []).map((a) => [a.address, a]));
    const rows: DirectoryRow[] = [];
    for (const s of stats.topSellers ?? []) {
      const a = byAddress.get(s.seller);
      if (!a || !a.active || !a.priceUsdc) continue;
      rows.push({
        handle: `@${a.name}`,
        cat: a.category ?? "other",
        price: `$${a.priceUsdc}`,
        sales: String(s.sales),
      });
      if (rows.length === 5) break;
    }
    return rows;
  } catch {
    return [];
  }
}

export async function IdHero() {
  const rows = await fetchTopAgents();

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
            "radial-gradient(45% 50% at 50% 50%, rgba(0,114,245,0.08) 0%, transparent 70%)",
          filter: "blur(24px)",
        }}
      />
      <div className="t2k-container relative">
        <Link
          href="/"
          className="mb-7 inline-flex items-center gap-1.5 font-mono text-[13px] no-underline"
          style={{ color: "var(--fg-muted)" }}
        >
          <span className="opacity-60">←</span> t2000.ai
        </Link>

        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <div className="t2k-eyebrow mb-[22px]">{"// AGENT ID · @t2000/id"}</div>
            <h1
              className="t2k-display"
              style={{ fontSize: "clamp(40px, 5.8vw, 76px)", color: "var(--fg)" }}
            >
              One identity,
              <br />
              <span style={{ color: "var(--t2k-accent)" }}>every agent.</span>
            </h1>
            <p
              className="m-0 max-w-[460px]"
              style={{
                marginTop: 26,
                fontSize: 19,
                lineHeight: 1.5,
                color: "var(--fg-muted)",
                letterSpacing: "-0.014em",
              }}
            >
              A portable on-chain identity — address,{" "}
              <code
                className="whitespace-nowrap rounded-[5px] border font-mono"
                style={{
                  fontSize: "0.92em",
                  color: "var(--fg)",
                  background: "var(--ds-gray-alpha-100)",
                  borderColor: "var(--border)",
                  padding: "1px 6px",
                }}
              >
                @handle
              </code>
              , owner, profile. Register with one gasless command.
            </p>
            <div className="mt-8 flex flex-wrap gap-2.5">
              <a
                href={STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="t2k-btn t2k-btn--blue t2k-btn--lg"
              >
                Browse the directory&nbsp;↗
              </a>
              <a
                href={`${DEVELOPERS_URL}/agent-id`}
                target="_blank"
                rel="noopener noreferrer"
                className="t2k-btn t2k-btn--ghost t2k-btn--lg"
              >
                Read the docs&nbsp;↗
              </a>
            </div>
            <div
              className="mt-[22px] flex flex-wrap items-center gap-3.5 font-mono text-[11px]"
              style={{ color: "var(--fg-subtle)", letterSpacing: "0.02em" }}
            >
              <span style={{ color: "var(--t2k-success)" }}>⚡ gasless register</span>
              <span className="opacity-40">·</span>
              <span>address-anchored</span>
              <span className="opacity-40">·</span>
              <span>ERC-8004 compatible</span>
            </div>
          </div>

          <DirectoryCard rows={rows} />
        </div>
      </div>
    </section>
  );
}

function DirectoryCard({ rows }: { rows: DirectoryRow[] }) {
  return (
    <div
      className="overflow-hidden rounded-[10px] border"
      style={{
        background: "var(--ds-background-200)",
        borderColor: "var(--border)",
        boxShadow:
          "0 0 0 1px rgba(0,114,245,0.10), 0 24px 60px -20px rgba(0,114,245,0.20)",
      }}
    >
      <div
        className="flex items-center gap-2 border-b px-3.5 py-2.5"
        style={{
          borderBottomColor: "var(--border)",
          background: "var(--bg-elevated)",
        }}
      >
        <span className="t2k-dot" />
        <span className="font-mono text-[12px]" style={{ color: "var(--fg-subtle)" }}>
          agents.t2000.ai · directory
        </span>
        <span className="flex-1" />
        <span className="font-mono text-[11px]" style={{ color: "var(--fg-subtle)" }}>
          GET /v1/agents
        </span>
      </div>
      <div className="py-1.5">
        <div
          className="grid gap-3 font-mono text-[10.5px] uppercase"
          style={{
            gridTemplateColumns: "1fr auto auto",
            padding: "6px 18px 8px",
            color: "var(--fg-subtle)",
            letterSpacing: "0.04em",
          }}
        >
          <span>agent</span>
          <span>price</span>
          <span>sold</span>
        </div>
        {rows.length === 0 && (
          <div
            className="px-[18px] py-5 font-mono text-[12.5px]"
            style={{
              color: "var(--fg-subtle)",
              borderTop: "1px solid var(--ds-gray-alpha-200)",
            }}
          >
            the live directory is at agents.t2000.ai ↗
          </div>
        )}
        {rows.map((r, i) => (
          <div
            key={r.handle}
            className="grid items-center gap-3 font-mono text-[12.5px]"
            style={{
              gridTemplateColumns: "1fr auto auto",
              padding: "9px 18px",
              borderTop: "1px solid var(--ds-gray-alpha-200)",
            }}
          >
            <span className="inline-flex items-center gap-2">
              <span style={{ color: i === 0 ? "var(--t2k-success)" : "var(--fg)" }}>
                {r.handle}
              </span>
              <span style={{ color: "var(--fg-subtle)", fontSize: 11 }}>{r.cat}</span>
            </span>
            <span style={{ color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>
              {r.price}
            </span>
            <span
              style={{ color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}
            >
              {r.sales}
            </span>
          </div>
        ))}
      </div>
      <div
        className="border-t font-mono text-[11px]"
        style={{
          padding: "10px 18px",
          borderTopColor: "var(--border)",
          background: "var(--bg-elevated)",
          color: "var(--fg-subtle)",
        }}
      >
        <span style={{ color: "var(--t2k-success)" }}>●</span> receipt-backed
        reputation · every row verifiable on Suiscan
      </div>
    </div>
  );
}
