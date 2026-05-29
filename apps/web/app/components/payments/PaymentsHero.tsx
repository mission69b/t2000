import { DEVELOPERS_URL, GATEWAY_URL, SUIMPP_URL } from "../../data/t2k";
import { Breadcrumb } from "../site/Breadcrumb";

interface Entry {
  ago: string;
  service: string;
  endpoint: string;
  amount: string;
  live?: boolean;
}

const ENTRIES: Entry[] = [
  { ago: "5s", service: "openai", endpoint: "/chat/completions", amount: "$0.01", live: true },
  { ago: "12s", service: "fal.ai", endpoint: "/flux/dev", amount: "$0.03" },
  { ago: "37s", service: "elevenlabs", endpoint: "/text-to-speech", amount: "$0.05" },
  { ago: "1m", service: "anthropic", endpoint: "/messages", amount: "$0.01" },
  { ago: "1m", service: "coingecko", endpoint: "/price", amount: "$0.01" },
  { ago: "2m", service: "firecrawl", endpoint: "/scrape", amount: "$0.01" },
  { ago: "3m", service: "tavily", endpoint: "/search", amount: "$0.01" },
  { ago: "4m", service: "lob", endpoint: "/postcards", amount: "$1.00" },
];

export function PaymentsHero() {
  return (
    <section
      className="relative overflow-hidden border-b"
      style={{
        padding: "80px 0 64px",
        borderBottomColor: "var(--ds-gray-alpha-300)",
      }}
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
        <Breadcrumb />

        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <div className="t2k-eyebrow mb-[22px]">
              {"// AGENT PAYMENTS · @suimpp/mpp"}
            </div>
            <h1
              className="t2k-display"
              style={{
                fontSize: "clamp(40px, 5.8vw, 76px)",
                color: "var(--fg)",
              }}
            >
              Pay any API
              <br />
              <span style={{ color: "var(--t2k-accent)" }}>in USDC.</span>
            </h1>
            <p className="t2k-section-sub" style={{ marginTop: 26 }}>
              Your agent hits an endpoint. The gateway prices it. USDC settles
              in under a second. No keys. No accounts.
            </p>

            <div className="mt-8 flex flex-wrap gap-2.5">
              <a
                href={GATEWAY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="t2k-btn t2k-btn--blue t2k-btn--lg"
              >
                Browse services&nbsp;↗
              </a>
              <a
                href={`${DEVELOPERS_URL}/agent-payments`}
                target="_blank"
                rel="noopener noreferrer"
                className="t2k-btn t2k-btn--ghost t2k-btn--lg"
              >
                Read the docs&nbsp;↗
              </a>
            </div>

            <div
              className="mt-[22px] flex flex-wrap items-center gap-3.5 font-mono text-[11px]"
              style={{
                color: "var(--fg-subtle)",
                letterSpacing: "0.02em",
              }}
            >
              <span>~$0.01 per LLM call</span>
              <span className="opacity-40">·</span>
              <span>~400ms settle</span>
              <span className="opacity-40">·</span>
              <span>$0 network fee</span>
            </div>

            <a
              href={SUIMPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] no-underline transition-colors hover:!border-[var(--t2k-accent)] hover:!text-[var(--fg)]"
              style={{
                borderColor: "var(--ds-gray-alpha-400)",
                background: "var(--ds-gray-alpha-100)",
                color: "var(--fg-muted)",
                letterSpacing: "-0.011em",
              }}
            >
              <span
                className="font-mono text-[10px]"
                style={{
                  color: "var(--t2k-accent)",
                  letterSpacing: "0.06em",
                }}
              >
                OPEN STANDARD
              </span>
              <span
                className="block"
                style={{
                  width: 1,
                  height: 11,
                  background: "var(--ds-gray-alpha-400)",
                }}
              />
              <span className="font-mono text-[12px]">suimpp.dev</span>
              <span className="opacity-55">↗</span>
            </a>
          </div>

          <ActivityFeed entries={ENTRIES} />
        </div>
      </div>
    </section>
  );
}

function ActivityFeed({ entries }: { entries: Entry[] }) {
  return (
    <div
      className="overflow-hidden rounded-[10px] border"
      style={{
        background: "var(--ds-background-200)",
        borderColor: "var(--ds-gray-alpha-400)",
        boxShadow:
          "0 0 0 1px rgba(0,114,245,0.10), 0 24px 60px -20px rgba(0,114,245,0.20)",
      }}
    >
      <div
        className="flex items-center gap-2 border-b px-3.5 py-2.5"
        style={{
          borderBottomColor: "var(--ds-gray-alpha-300)",
          background: "var(--ds-gray-100)",
        }}
      >
        <span
          className="inline-flex items-center gap-[7px] font-mono text-[12px] tracking-[0.01em]"
          style={{ color: "var(--fg-subtle)" }}
        >
          <span className="t2k-dot" />
          mpp.t2000.ai · live
        </span>
        <span className="flex-1" />
        <span
          className="font-mono text-[11px]"
          style={{ color: "var(--fg-subtle)" }}
        >
          tail -f payments.log
        </span>
      </div>

      <div className="py-2">
        {entries.map((e, i) => (
          <div
            key={i}
            className="grid items-center gap-3 font-mono text-[12.5px]"
            style={{
              gridTemplateColumns: "44px 1fr auto",
              padding: "9px 18px",
              color: e.live ? "var(--fg)" : "var(--fg-muted)",
              opacity: e.live ? 1 : 0.92 - i * 0.06,
              borderBottom:
                i < entries.length - 1
                  ? "1px solid var(--ds-gray-alpha-200)"
                  : "none",
            }}
          >
            <span
              className="t2k-tabular text-[11px]"
              style={{ color: "var(--fg-subtle)" }}
            >
              {e.ago}
            </span>
            <span>
              <span
                style={{
                  color: e.live ? "var(--t2k-success)" : "var(--fg)",
                }}
              >
                {e.service}
              </span>
              <span style={{ color: "var(--fg-subtle)" }}>{e.endpoint}</span>
            </span>
            <span
              className="t2k-tabular"
              style={{ color: "var(--fg)" }}
            >
              {e.amount}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
