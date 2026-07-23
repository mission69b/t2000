// Live usage — the inference half of the old /usage page, folded into the
// product page it describes (consolidation 2026-07-23: one activity feed on
// agents.t2000.ai, one usage section here, one teaser band on the homepage).
// Anchored at #usage so the old /usage URL can 301 here.

const USAGE_URL =
  process.env.USAGE_URL_OVERRIDE || "https://api.t2000.ai/v1/usage/global";

type ModelRow = {
  model: string;
  requests: number;
  tokens: number;
  share: number;
};

type UsageSlice = { requests: number; tokens: number };

type GlobalUsage = {
  counting_since: string | null;
  days_live: number;
  all_time: {
    requests: number;
    tokens: number;
    compute_usd: number;
    models_served: number;
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

export async function ApiUsage() {
  const usage = (await fetch(USAGE_URL, { next: { revalidate: 300 } })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)) as GlobalUsage | null;

  if (!usage) {
    return null;
  }

  const peakTokens = Math.max(1, ...usage.last_24h.hourly.map((h) => h.tokens));
  const allModels = usage.all_time.models ?? [];
  const confidentialShare =
    usage.all_time.tokens > 0 && usage.all_time.by_tier
      ? (usage.all_time.by_tier.confidential.tokens / usage.all_time.tokens) *
        100
      : 0;
  const chatShare =
    usage.all_time.tokens > 0 && usage.all_time.by_source
      ? (usage.all_time.by_source.chat.tokens / usage.all_time.tokens) * 100
      : 0;

  const stats = [
    { label: "requests", value: compact(usage.all_time.requests) },
    {
      label: "compute routed",
      value: `$${usage.all_time.compute_usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
    },
    { label: "models", value: String(usage.all_time.models_served) },
    { label: "days live", value: String(usage.days_live) },
    { label: "confidential (TEE)", value: `${confidentialShare.toFixed(1)}%` },
    { label: "in-app chat", value: `${chatShare.toFixed(1)}%` },
  ];

  return (
    <section
      id="usage"
      className="t2k-section border-t"
      style={{ borderTopColor: "var(--border)" }}
    >
      <div className="t2k-container">
        <header className="mb-10">
          <span className="t2k-eyebrow">{"// LIVE USAGE"}</span>
          <h2 className="t2k-section-title mt-3">
            {compact(usage.all_time.tokens)} tokens routed.
          </h2>
        </header>

        <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((s) => (
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
          className="mt-5 font-mono text-[12.5px]"
          style={{ color: "var(--fg-subtle)" }}
        >
          <span>
            {"// /v1 API + Audric chat · aggregates only, prompts never stored · "}
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
  );
}
