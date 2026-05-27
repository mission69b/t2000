import { GATEWAY_URL, T2K } from "../../data/t2k";

interface Endpoint {
  method: string;
  path: string;
  description: string;
  price: string;
}

interface Service {
  id: string;
  name: string;
  description: string;
  categories: string[];
  endpoints: Endpoint[];
}

interface ServiceTeaser {
  name: string;
  cat: string;
  from: string;
}

const FEATURED_IDS = [
  "openai",
  "anthropic",
  "fal",
  "elevenlabs",
  "perplexity",
  "groq",
  "firecrawl",
  "alphavantage",
] as const;

async function fetchTeasers(): Promise<ServiceTeaser[]> {
  try {
    const res = await fetch(`${GATEWAY_URL}/api/services`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`gateway ${res.status}`);
    const services: Service[] = await res.json();
    const byId = new Map(services.map((s) => [s.id, s]));

    const picks = FEATURED_IDS.map((id) => byId.get(id)).filter(
      (s): s is Service => Boolean(s),
    );

    return picks.map((s) => {
      const prices = s.endpoints
        .map((e) => parseFloat(e.price))
        .filter((n) => Number.isFinite(n) && n > 0)
        .sort((a, b) => a - b);
      const min = prices[0];
      return {
        name: s.name,
        cat: s.categories.join(" · "),
        from: min !== undefined ? formatPrice(min) : "—",
      };
    });
  } catch {
    return T2K.servicesFallback.map((s) => ({ ...s }));
  }
}

function formatPrice(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

export async function Catalog() {
  const services = await fetchTeasers();

  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <div className="mb-12 grid items-end gap-10 lg:grid-cols-2 lg:gap-12">
          <div>
            <span className="t2k-eyebrow">{"// AGENT PAYMENTS · LIVE"}</span>
            <h2 className="t2k-section-title mt-3.5" style={{ lineHeight: 1 }}>
              Pay-per-request APIs
              <br />
              <span style={{ color: "var(--fg-faint)" }}>on Sui. Gasless.</span>
            </h2>
          </div>
          <div>
            <p
              className="m-0 max-w-[440px] text-[17px] leading-[1.55]"
              style={{
                color: "var(--fg-muted)",
                letterSpacing: "-0.011em",
              }}
            >
              Pay-per-request to every major AI provider. 40 services. 88
              endpoints. Live on{" "}
              <span style={{ color: "var(--fg)" }}>mpp.t2000.ai</span>.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((s) => (
            <ServiceCard key={s.name} s={s} />
          ))}
        </div>

        <a
          href={GATEWAY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3.5 flex items-center justify-between rounded-lg border border-dashed px-[18px] py-3.5 no-underline transition-colors hover:border-accent hover:bg-accent/[0.08]"
          style={{
            borderColor: "var(--ds-gray-alpha-400)",
            color: "var(--fg)",
          }}
        >
          <div
            className="flex flex-wrap items-center gap-3 font-mono text-[13px]"
            style={{ color: "var(--fg-muted)" }}
          >
            <span style={{ color: "var(--fg)" }}>+ 32 more</span>
            <span className="opacity-50">·</span>
            <span>88 endpoints</span>
            <span className="opacity-50">·</span>
            <span>USDC on Sui</span>
            <span className="opacity-50">·</span>
            <span>gasless</span>
          </div>
          <span
            className="whitespace-nowrap text-[13.5px] font-medium"
            style={{
              letterSpacing: "-0.011em",
              color: "var(--t2k-accent)",
            }}
          >
            Browse services →
          </span>
        </a>
      </div>
    </section>
  );
}

function ServiceCard({ s }: { s: ServiceTeaser }) {
  return (
    <div
      className="t2k-card flex flex-col gap-1 transition-colors hover:border-[var(--ds-gray-alpha-500)]"
      style={{ padding: "16px" }}
    >
      <div className="flex items-baseline justify-between">
        <span
          className="text-[16px] font-semibold"
          style={{ letterSpacing: "-0.018em", color: "var(--fg)" }}
        >
          {s.name}
        </span>
        <span
          className="font-mono text-[12px]"
          style={{
            color: "var(--fg-muted)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {s.from}
        </span>
      </div>
      <span
        className="font-mono text-[10.5px] uppercase"
        style={{
          letterSpacing: "0.10em",
          color: "var(--fg-subtle)",
        }}
      >
        {s.cat}
      </span>
    </div>
  );
}
