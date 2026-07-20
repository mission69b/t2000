import type { Metadata } from "next";
import { Nav } from "../components/site/Nav";
import { SiteFooter } from "../components/site/SiteFooter";

const DESC =
  "Live, transparent usage of the t2000 Private Inference API — tokens routed, requests served, model leaderboard. Aggregates only; prompts are never stored.";

export const metadata: Metadata = {
  title: "Global usage — t2000",
  description: DESC,
  openGraph: {
    title: "Global usage — t2000",
    description: DESC,
    url: "https://t2000.ai/usage",
    type: "website",
  },
};

// Refreshed at most every 5 minutes — matches the API-side Redis cache.
export const revalidate = 300;

// Optional local-dev override (apps/web has the zero-required-env carve-out;
// validated inline: any non-empty value is used as-is).
const USAGE_URL =
  process.env.USAGE_URL_OVERRIDE || "https://api.t2000.ai/v1/usage/global";

type GlobalUsage = {
  updated_at: string;
  counting_since: string | null;
  days_live: number;
  all_time: {
    requests: number;
    tokens: number;
    input_tokens: number;
    output_tokens: number;
    compute_usd: number;
    models_served: number;
  };
  last_24h: {
    requests: number;
    tokens: number;
    hourly: Array<{ hour: string; requests: number; tokens: number }>;
    models: Array<{
      model: string;
      requests: number;
      tokens: number;
      share: number;
    }>;
  };
};

function compact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div
      className="flex flex-col gap-1.5 border p-5"
      style={{ borderColor: "var(--ds-gray-alpha-300)" }}
    >
      <span
        className="font-mono text-[10.5px] uppercase tracking-[0.14em]"
        style={{ color: "var(--fg-subtle)" }}
      >
        {label}
      </span>
      <span
        className="font-mono text-[26px] font-bold tracking-tight"
        style={{ color: "var(--fg)" }}
      >
        {value}
      </span>
      <span className="text-[12px]" style={{ color: "var(--fg-subtle)" }}>
        {sub}
      </span>
    </div>
  );
}

export default async function UsagePage() {
  let usage: GlobalUsage | null = null;
  try {
    const res = await fetch(USAGE_URL, { next: { revalidate: 300 } });
    if (res.ok) {
      usage = (await res.json()) as GlobalUsage;
    }
  } catch {
    // Render the unavailable state below.
  }

  const peakTokens = usage
    ? Math.max(1, ...usage.last_24h.hourly.map((h) => h.tokens))
    : 1;

  return (
    <>
      <Nav />
      <main>
        <section style={{ padding: "72px 0 88px" }}>
          <div className="t2k-container">
            <div
              className="font-mono text-[11px] uppercase tracking-[0.16em]"
              style={{ color: "var(--fg-subtle)" }}
            >
              Private Inference / global usage
            </div>

            {!usage ? (
              <p className="mt-8 text-[15px]" style={{ color: "var(--fg-muted)" }}>
                Usage feed is unavailable right now — raw data lives at{" "}
                <a href={USAGE_URL} style={{ color: "var(--t2k-accent)" }}>
                  {USAGE_URL}
                </a>
                .
              </p>
            ) : (
              <>
                {/* Big counter */}
                <div className="mt-10">
                  <div
                    className="font-mono text-[11px] uppercase tracking-[0.16em]"
                    style={{ color: "var(--fg-subtle)" }}
                  >
                    Tokens routed, all-time
                  </div>
                  <div
                    className="mt-3 font-mono font-bold tracking-tight"
                    style={{
                      fontSize: "clamp(40px, 7.4vw, 88px)",
                      lineHeight: 1,
                      color: "var(--fg)",
                    }}
                  >
                    {usage.all_time.tokens.toLocaleString("en-US")}
                  </div>
                  <div
                    className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px]"
                    style={{ color: "var(--fg-subtle)" }}
                  >
                    {usage.counting_since && (
                      <span>
                        counting since{" "}
                        {new Date(usage.counting_since).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    )}
                    <span>refreshed every 5 minutes</span>
                    <a href={USAGE_URL} style={{ color: "var(--t2k-accent)" }}>
                      raw JSON ↗
                    </a>
                  </div>
                </div>

                {/* Stat cards */}
                <div className="mt-12 grid grid-cols-2 gap-px md:grid-cols-5">
                  <StatCard
                    label="Requests served"
                    value={compact(usage.all_time.requests)}
                    sub={`~${compact(Math.round(usage.all_time.requests / Math.max(1, usage.days_live)))} a day`}
                  />
                  <StatCard
                    label="Compute routed"
                    value={`$${usage.all_time.compute_usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                    sub="at charged price"
                  />
                  <StatCard
                    label="Tokens, 24h"
                    value={compact(usage.last_24h.tokens)}
                    sub={`${compact(usage.last_24h.requests)} requests`}
                  />
                  <StatCard
                    label="Models served"
                    value={String(usage.all_time.models_served)}
                    sub="one endpoint"
                  />
                  <StatCard
                    label="Days live"
                    value={String(usage.days_live)}
                    sub={
                      usage.counting_since
                        ? `since ${new Date(usage.counting_since).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                        : ""
                    }
                  />
                </div>

                {/* 24h activity */}
                <div className="mt-14">
                  <div
                    className="font-mono text-[11px] uppercase tracking-[0.16em]"
                    style={{ color: "var(--fg-subtle)" }}
                  >
                    Last 24 hours · tokens per hour (UTC)
                  </div>
                  <div
                    className="mt-5 flex h-[160px] items-end gap-[3px] border-b pb-px"
                    style={{ borderColor: "var(--ds-gray-alpha-300)" }}
                  >
                    {usage.last_24h.hourly.map((h) => (
                      <div
                        key={h.hour}
                        title={`${new Date(h.hour).getUTCHours()}:00 UTC — ${compact(h.tokens)} tokens · ${h.requests} req`}
                        className="flex-1"
                        style={{
                          height: `${Math.max(2, Math.round((h.tokens / peakTokens) * 100))}%`,
                          background: "var(--ds-gray-alpha-600)",
                        }}
                      />
                    ))}
                  </div>
                  <div
                    className="mt-2 flex justify-between font-mono text-[10.5px]"
                    style={{ color: "var(--fg-subtle)" }}
                  >
                    <span>−24h</span>
                    <span>peak {compact(peakTokens)}</span>
                    <span>now</span>
                  </div>
                </div>

                {/* Model leaderboard */}
                <div className="mt-14">
                  <div
                    className="flex items-baseline justify-between font-mono text-[11px] uppercase tracking-[0.16em]"
                    style={{ color: "var(--fg-subtle)" }}
                  >
                    <span>Model leaderboard</span>
                    <span>last 24 hours</span>
                  </div>
                  <div className="mt-4 flex flex-col">
                    {usage.last_24h.models.length === 0 && (
                      <span className="py-6 text-[13px]" style={{ color: "var(--fg-subtle)" }}>
                        No traffic in the last 24 hours.
                      </span>
                    )}
                    {usage.last_24h.models.map((m, i) => (
                      <div
                        key={m.model}
                        className="border-b py-3"
                        style={{ borderColor: "var(--ds-gray-alpha-200)" }}
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 truncate font-mono text-[13px]" style={{ color: "var(--fg)" }}>
                            <span style={{ color: "var(--fg-subtle)" }}>
                              {String(i + 1).padStart(2, "0")}{" "}
                            </span>
                            {m.model}
                          </span>
                          <span
                            className="shrink-0 font-mono text-[12px]"
                            style={{ color: "var(--fg-muted)" }}
                          >
                            {compact(m.requests)} req · <b style={{ color: "var(--fg)" }}>{compact(m.tokens)}</b> ·{" "}
                            {(m.share * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div
                          className="mt-2 h-[3px] w-full"
                          style={{ background: "var(--ds-gray-alpha-200)" }}
                        >
                          <div
                            className="h-full"
                            style={{
                              width: `${Math.max(0.5, m.share * 100)}%`,
                              background: "var(--fg)",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="mt-10 text-[12.5px] leading-relaxed" style={{ color: "var(--fg-subtle)" }}>
                  Aggregates from t2000&apos;s own gateway-edge metering on{" "}
                  <span className="font-mono">api.t2000.ai/v1</span> — the Private
                  Inference API only (Audric in-app chat is not counted). Zero data
                  retention on content: prompts and completions are never stored, so
                  the only thing we can show you is that the rail is used.
                </p>
              </>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
