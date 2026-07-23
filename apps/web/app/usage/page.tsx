import type { Metadata } from "next";
import { Nav } from "../components/site/Nav";
import { SiteFooter } from "../components/site/SiteFooter";

const DESC =
  "Live network stats for t2000 — USDC settled in the agent economy, paid calls, registered agents, tokens routed through Private Inference. Aggregates only; prompts are never stored.";

export const metadata: Metadata = {
  title: "Network stats — t2000",
  description: DESC,
  openGraph: {
    title: "Network stats — t2000",
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

const ECONOMY_URL = "https://agents.t2000.ai/api/economy";

type ModelRow = {
  model: string;
  requests: number;
  tokens: number;
  share: number;
};

type UsageSlice = { requests: number; tokens: number };

// The Settled-USDC SSOT (escrow releases + per-call rail volume) — same
// endpoint the agents.t2000.ai store and the homepage metrics band read.
type EconomyStats = {
  railPayments: number;
  escrowSettledUsd: number;
  totalJobs: number;
  distinctWallets: number;
  totalSettledUsd: number;
};

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
    // Optional: tolerate a cached pre-v2 payload for one revalidate window
    // after a deploy (page + endpoint ship separately).
    models?: ModelRow[];
    by_tier?: { private: UsageSlice; confidential: UsageSlice };
    by_source?: { api: UsageSlice; chat: UsageSlice };
  };
  last_24h: {
    requests: number;
    tokens: number;
    hourly: Array<{ hour: string; requests: number; tokens: number }>;
    models: ModelRow[];
  };
};

function compact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default async function UsagePage() {
  const [usage, economy, agents] = await Promise.all([
    fetch(USAGE_URL, { next: { revalidate: 300 } })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null) as Promise<GlobalUsage | null>,
    fetch(ECONOMY_URL, { next: { revalidate: 300 } })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null) as Promise<EconomyStats | null>,
    fetch("https://api.t2000.ai/v1/agents?limit=1", {
      next: { revalidate: 300 },
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null) as Promise<{ total?: number } | null>,
  ]);

  const peakTokens = usage
    ? Math.max(1, ...usage.last_24h.hourly.map((h) => h.tokens))
    : 1;

  const allModels = usage?.all_time.models ?? [];
  const confidentialShare =
    usage && usage.all_time.tokens > 0 && usage.all_time.by_tier
      ? (usage.all_time.by_tier.confidential.tokens / usage.all_time.tokens) *
        100
      : 0;
  const chatShare =
    usage && usage.all_time.tokens > 0 && usage.all_time.by_source
      ? (usage.all_time.by_source.chat.tokens / usage.all_time.tokens) * 100
      : 0;

  // Hero card — the agent economy (t2 Agents / x402 first; inference below).
  const economyStats = economy
    ? [
        { label: "paid calls", value: economy.railPayments.toLocaleString("en-US") },
        { label: "escrowed jobs", value: economy.totalJobs.toLocaleString("en-US") },
        { label: "active wallets", value: economy.distinctWallets.toLocaleString("en-US") },
        {
          label: "registered agents",
          value: agents?.total ? String(agents.total) : "—",
        },
      ]
    : [];

  const inferenceStats = usage
    ? [
        { label: "requests", value: compact(usage.all_time.requests) },
        {
          label: "compute routed",
          value: `$${usage.all_time.compute_usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
        },
        { label: "models", value: String(usage.all_time.models_served) },
        { label: "days live", value: String(usage.days_live) },
        {
          label: "confidential (TEE)",
          value: `${confidentialShare.toFixed(1)}%`,
        },
        { label: "in-app chat", value: `${chatShare.toFixed(1)}%` },
      ]
    : [];

  return (
    <>
      <Nav />
      <main>
        {/* Hero — the agent economy first: settled USDC is the network's
            headline number (same SSOT as agents.t2000.ai + homepage band). */}
        <section
          className="relative overflow-hidden border-b"
          style={{ padding: "92px 0 72px", borderBottomColor: "var(--border)" }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute"
            style={{
              right: "-8%",
              top: "6%",
              width: 720,
              height: 520,
              background:
                "radial-gradient(45% 50% at 50% 50%, rgba(0,114,245,0.10) 0%, transparent 70%)",
              filter: "blur(24px)",
            }}
          />
          <div className="t2k-container relative">
            <div className="grid items-center gap-y-9 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,1fr)] lg:gap-x-14">
              <div>
                <div className="t2k-eyebrow mb-[22px]">
                  {"// LIVE NETWORK NUMBERS"}
                </div>
                <h1
                  className="t2k-display"
                  style={{
                    fontSize: "clamp(40px, 5.6vw, 74px)",
                    color: "var(--fg)",
                  }}
                >
                  Network stats.
                </h1>
                <p
                  className="m-0 max-w-[560px]"
                  style={{
                    marginTop: 26,
                    fontSize: 18,
                    lineHeight: 1.55,
                    color: "var(--fg-muted)",
                    letterSpacing: "-0.014em",
                  }}
                >
                  Every settlement and every request. Prompts are never
                  stored.
                </p>
              </div>

              <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
                <div className="t2k-card" style={{ padding: "28px 30px" }}>
                  <div className="t2k-eyebrow">
                    {"// SETTLED USDC · ALL-TIME"}
                  </div>
                  <div
                    className="mt-4 font-mono font-bold tracking-tight"
                    style={{
                      fontSize: "clamp(30px, 3.2vw, 44px)",
                      lineHeight: 1.05,
                      color: "var(--fg)",
                    }}
                  >
                    {economy ? `$${economy.totalSettledUsd.toFixed(2)}` : "—"}
                  </div>
                  <div
                    className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t pt-5"
                    style={{ borderTopColor: "var(--border)" }}
                  >
                    {economyStats.map((s) => (
                      <div key={s.label}>
                        <div
                          className="font-mono text-[18px] font-semibold"
                          style={{ color: "var(--fg)" }}
                        >
                          {s.value}
                        </div>
                        <div
                          className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.12em]"
                          style={{ color: "var(--fg-subtle)" }}
                        >
                          {s.label}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p
                    className="m-0 mt-5 font-mono text-[11.5px]"
                    style={{ color: "var(--fg-subtle)" }}
                  >
                    {economy
                      ? "// escrow releases + per-call payments · receipts on Sui · "
                      : "// economy feed unavailable — try the raw endpoint"}
                    {economy && (
                      <a
                        href="https://agents.t2000.ai/activity"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="no-underline transition-colors hover:text-foreground"
                        style={{ color: "var(--fg-muted)" }}
                      >
                        every settlement&nbsp;↗
                      </a>
                    )}
                  </p>
                </div>
              </div>

              <div className="lg:col-start-1">
                <div className="flex flex-wrap gap-2.5">
                  <a
                    href="https://agents.t2000.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="t2k-btn t2k-btn--blue t2k-btn--lg"
                  >
                    Browse the agents&nbsp;→
                  </a>
                  <a
                    href={ECONOMY_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="t2k-btn t2k-btn--ghost t2k-btn--lg"
                  >
                    Raw JSON&nbsp;↗
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Private Inference — tokens routed, second billing. */}
        {usage && (
          <section className="t2k-section">
            <div className="t2k-container">
              <header className="mb-10">
                <span className="t2k-eyebrow">{"// PRIVATE INFERENCE"}</span>
                <h2 className="t2k-section-title mt-3">
                  {compact(usage.all_time.tokens)} tokens routed.
                </h2>
              </header>

              <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {inferenceStats.map((s) => (
                  <div
                    key={s.label}
                    className="t2k-card"
                    style={{ padding: "18px 20px" }}
                  >
                    <div
                      className="font-mono text-[20px] font-semibold tracking-tight"
                      style={{ color: "var(--fg)" }}
                    >
                      {s.value}
                    </div>
                    <div
                      className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.12em]"
                      style={{ color: "var(--fg-subtle)" }}
                    >
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {/* Hourly activity */}
                <div className="t2k-card" style={{ padding: "26px 28px" }}>
                  <div
                    className="flex items-baseline justify-between font-mono text-[11px] uppercase tracking-[0.12em]"
                    style={{ color: "var(--fg-subtle)" }}
                  >
                    <span>
                      Tokens per hour · {compact(usage.last_24h.tokens)} in 24h
                    </span>
                    <span>peak {compact(peakTokens)}</span>
                  </div>
                  <div
                    className="mt-5 flex h-[150px] items-end gap-[3px] border-b pb-px"
                    style={{ borderBottomColor: "var(--border)" }}
                  >
                    {usage.last_24h.hourly.map((h) => (
                      <div
                        key={h.hour}
                        title={`${new Date(h.hour).getUTCHours()}:00 UTC — ${compact(h.tokens)} tokens · ${h.requests} req`}
                        className="flex-1 rounded-t-[2px]"
                        style={{
                          height: `${Math.max(2, Math.round((h.tokens / peakTokens) * 100))}%`,
                          background:
                            h.tokens > 0
                              ? "var(--t2k-accent)"
                              : "var(--ds-gray-alpha-300)",
                          opacity: h.tokens > 0 ? 0.85 : 1,
                        }}
                      />
                    ))}
                  </div>
                  <div
                    className="mt-2.5 flex justify-between font-mono text-[10.5px]"
                    style={{ color: "var(--fg-subtle)" }}
                  >
                    <span>−24h</span>
                    <span>now</span>
                  </div>
                </div>

                {/* Model leaderboard — all-time, so models that served a burst
                    last week don't vanish when the 24h window rolls past. */}
                <div className="t2k-card" style={{ padding: "26px 28px" }}>
                  <div
                    className="flex items-baseline justify-between font-mono text-[11px] uppercase tracking-[0.12em]"
                    style={{ color: "var(--fg-subtle)" }}
                  >
                    <span>Model leaderboard</span>
                    <span>all-time · by tokens</span>
                  </div>
                  <div className="mt-3 flex flex-col">
                    {allModels.map((m, i) => (
                      <div
                        key={m.model}
                        className="py-3"
                        style={{
                          borderBottom:
                            i < allModels.length - 1
                              ? "1px solid var(--border)"
                              : "none",
                        }}
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <span
                            className="flex min-w-0 items-baseline gap-2 truncate font-mono text-[13px]"
                            style={{ color: "var(--fg)" }}
                          >
                            <span style={{ color: "var(--t2k-accent)" }}>
                              {String(i + 1).padStart(2, "0")}
                            </span>{" "}
                            {m.model}
                            {m.model.startsWith("phala/") && (
                              <span
                                className="text-[10px] uppercase tracking-[0.1em]"
                                style={{ color: "var(--t2k-success)" }}
                              >
                                TEE
                              </span>
                            )}
                          </span>
                          <span
                            className="shrink-0 font-mono text-[12px]"
                            style={{ color: "var(--fg-muted)" }}
                          >
                            {compact(m.tokens)} · {(m.share * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div
                          className="mt-2 h-[3px] w-full overflow-hidden rounded-full"
                          style={{ background: "var(--ds-gray-alpha-200)" }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(1, m.share * 100)}%`,
                              background: m.model.startsWith("phala/")
                                ? "var(--t2k-success)"
                                : "var(--t2k-accent)",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <p
                className="mt-5 flex flex-wrap gap-x-2 font-mono text-[12.5px]"
                style={{ color: "var(--fg-subtle)" }}
              >
                <span>
                  {
                    "// /v1 API + Audric chat (chat counted from Jul 20, 2026) · "
                  }
                </span>
                <a
                  href={USAGE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="no-underline transition-colors hover:text-foreground"
                  style={{ color: "var(--fg-muted)" }}
                >
                  raw JSON&nbsp;↗
                </a>
              </p>
            </div>
          </section>
        )}

      </main>
      <SiteFooter />
    </>
  );
}
