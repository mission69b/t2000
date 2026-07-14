import Link from "next/link";

import { AGENTS_URL } from "../../data/t2k";

// Live catalog — rendered from the public GET /v1/models (revalidated), never
// hand-written (CLAUDE.md docs rule: catalog tables come from live truth).
interface CatalogModel {
  id: string;
  name: string;
  privacy: "private" | "confidential";
  router?: boolean;
  pricing?: { input_per_1m?: number; output_per_1m?: number };
}

// Build-time fallback ONLY (fetch failure) — a snapshot, not the SSOT.
const MODELS_FALLBACK: CatalogModel[] = [
  { id: "zai/glm-5.2", name: "GLM 5.2", privacy: "private", pricing: { input_per_1m: 1.96, output_per_1m: 6.16 } },
  { id: "moonshotai/kimi-k2.7-code", name: "Kimi K2.7 Code", privacy: "private", pricing: { input_per_1m: 1.33, output_per_1m: 5.6 } },
  { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5", privacy: "private", pricing: { input_per_1m: 2.6, output_per_1m: 13 } },
  { id: "deepseek/deepseek-v3.2", name: "DeepSeek V3.2", privacy: "private", pricing: { input_per_1m: 0.39, output_per_1m: 0.59 } },
  { id: "phala/glm-5.2", name: "GLM 5.2 (Confidential)", privacy: "confidential", pricing: { input_per_1m: 2.8, output_per_1m: 8.8 } },
  { id: "phala/gpt-oss-120b", name: "GPT-OSS 120B (Confidential)", privacy: "confidential", pricing: { input_per_1m: 0.3, output_per_1m: 1.2 } },
];

async function fetchModels(): Promise<CatalogModel[]> {
  try {
    const res = await fetch("https://api.t2000.ai/v1/models", {
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`models ${res.status}`);
    const body = (await res.json()) as { data: CatalogModel[] };
    return body.data;
  } catch {
    return MODELS_FALLBACK;
  }
}

function fmtPer1M(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  const r = Math.round(n * 100) / 100;
  return `$${r}`;
}

export async function ApiModels() {
  const models = await fetchModels();
  const groups = [
    {
      label: "PRIVATE",
      tag: "every model · ZDR",
      accent: false,
      blurb:
        "Zero data retention — providers are contractually bound not to store or train on your prompts.",
      models: models.filter((m) => m.privacy === "private" && !m.router),
    },
    {
      label: "CONFIDENTIAL",
      tag: "phala/* · verifiable",
      accent: true,
      blurb:
        "Runs in a verified GPU-TEE; every response carries a signed receipt anchored on Sui you can check yourself.",
      models: models.filter((m) => m.privacy === "confidential"),
    },
  ];

  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="t2k-eyebrow">{"// ONE ENDPOINT · TWO POSTURES"}</span>
            <h2 className="t2k-section-title mt-3">
              Private by default.
              <br />
              Confidential when it matters.
            </h2>
          </div>
          <p
            className="m-0 max-w-[400px] text-[16px] leading-[1.55]"
            style={{ color: "var(--fg-muted)", letterSpacing: "-0.011em" }}
          >
            Live catalog — USD per 1M tokens, straight from{" "}
            <code className="font-mono" style={{ color: "var(--fg)" }}>
              GET /v1/models
            </code>
            . Public, no key.
          </p>
        </header>
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((g) => (
            <div
              key={g.label}
              className="t2k-card flex flex-col gap-4"
              style={{
                padding: 26,
                borderColor: g.accent ? "rgba(29,168,96,0.35)" : undefined,
                background: g.accent ? "rgba(29,168,96,0.04)" : undefined,
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="font-mono text-[12px]"
                  style={{
                    letterSpacing: "0.08em",
                    color: g.accent ? "var(--t2k-success)" : "var(--fg)",
                  }}
                >
                  {g.label}
                </span>
                <span
                  className="t2k-mono-tag"
                  style={g.accent ? { color: "var(--t2k-success)" } : undefined}
                >
                  {g.tag}
                </span>
              </div>
              <p
                className="m-0 text-[13.5px] leading-[1.55]"
                style={{ color: "var(--fg-muted)" }}
              >
                {g.blurb}
              </p>
              <div className="mt-0.5 flex flex-col gap-[9px]">
                <div
                  className="flex items-baseline justify-between font-mono text-[10.5px] uppercase"
                  style={{ letterSpacing: "0.08em", color: "var(--fg-subtle)" }}
                >
                  <span>model</span>
                  <span>in / out per 1M</span>
                </div>
                {g.models.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-baseline justify-between gap-3 font-mono text-[13px]"
                    style={{ color: "var(--fg)", letterSpacing: "-0.005em" }}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      <span
                        className="h-[5px] w-[5px] flex-none rounded-full"
                        style={{
                          background: g.accent ? "var(--t2k-success)" : "var(--t2k-accent)",
                        }}
                      />
                      {m.id}
                    </span>
                    <span
                      className="whitespace-nowrap text-[12px]"
                      style={{
                        color: "var(--fg-muted)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {fmtPer1M(m.pricing?.input_per_1m)} /{" "}
                      {fmtPer1M(m.pricing?.output_per_1m)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div
          className="mt-4 flex flex-wrap items-center gap-3.5 rounded-lg border"
          style={{
            padding: "16px 20px",
            borderColor: "var(--border)",
            background: "var(--ds-background-200)",
          }}
        >
          <span className="t2k-mono-tag t2k-mono-tag--blue">GET /v1/models</span>
          <span
            className="text-[14px]"
            style={{ color: "var(--fg-muted)", letterSpacing: "-0.011em" }}
          >
            Metered per token from one credit balance — no subscription, no
            per-provider account. Settled in USDC.
          </span>
        </div>
      </div>
    </section>
  );
}

export function ApiRouter() {
  return (
    <section className="t2k-section" style={{ background: "var(--ds-background-200)" }}>
      <div className="t2k-container">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="t2k-eyebrow">{"// BUILT FOR CODING AGENTS"}</span>
            <h2 className="t2k-section-title mt-3">
              One model id.
              <br />
              The right model per step.
            </h2>
          </div>
          <p
            className="m-0 max-w-[400px] text-[15px] leading-[1.6]"
            style={{ color: "var(--fg-muted)", letterSpacing: "-0.011em" }}
          >
            Agents fire hundreds of calls; a few are hard. The router sends
            each where it belongs — billed at the model that served.
          </p>
        </header>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="t2k-card flex flex-col gap-3" style={{ padding: 24, background: "var(--bg)" }}>
            <span className="t2k-mono-tag t2k-mono-tag--blue">t2000/auto</span>
            <p className="m-0 text-[13.5px] leading-[1.6]" style={{ color: "var(--fg-muted)" }}>
              Bulk steps run on{" "}
              <code className="font-mono" style={{ color: "var(--fg)" }}>zai/glm-5.2</code>.
              Long context, plan/architecture asks, and retry-after-failure
              escalate to{" "}
              <code className="font-mono" style={{ color: "var(--fg)" }}>
                anthropic/claude-sonnet-5
              </code>
              .
            </p>
          </div>
          <div className="t2k-card flex flex-col gap-3" style={{ padding: 24, background: "var(--bg)" }}>
            <span className="t2k-mono-tag">t2000/auto-open</span>
            <p className="m-0 text-[13.5px] leading-[1.6]" style={{ color: "var(--fg-muted)" }}>
              The same router, never leaving open models — hard steps go to{" "}
              <code className="font-mono" style={{ color: "var(--fg)" }}>
                moonshotai/kimi-k2.7-code
              </code>
              . For price ceilings and privacy purists.
            </p>
          </div>
          <div className="t2k-card flex flex-col gap-3" style={{ padding: 24, background: "var(--bg)" }}>
            <span className="t2k-mono-tag" style={{ color: "var(--t2k-success)" }}>
              transparent
            </span>
            <p className="m-0 text-[13.5px] leading-[1.6]" style={{ color: "var(--fg-muted)" }}>
              Every response says what served it:{" "}
              <code className="font-mono" style={{ color: "var(--fg)" }}>
                x-t2000-served-model
              </code>{" "}
              +{" "}
              <code className="font-mono" style={{ color: "var(--fg)" }}>
                x-t2000-route-reason
              </code>{" "}
              headers. No blended rates, no mystery bills.
            </p>
          </div>
        </div>
        <div
          className="mt-4 flex flex-wrap items-center justify-between gap-3.5 rounded-lg border"
          style={{
            padding: "18px 22px",
            borderColor: "rgba(29,168,96,0.35)",
            background: "rgba(29,168,96,0.04)",
          }}
        >
          <div className="flex flex-col gap-1">
            <span
              className="text-[15px] font-semibold"
              style={{ color: "var(--fg)", letterSpacing: "-0.014em" }}
            >
              Free daily coding. No ads. Your code is not the product.
            </span>
            <span className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
              Every account gets a daily allowance on{" "}
              <code className="font-mono">moonshotai/kimi-k2.7-code</code> —
              works in any OpenAI-compatible tool. Resets daily.
            </span>
          </div>
          <a
            href={`${AGENTS_URL}/manage`}
            target="_blank"
            rel="noopener noreferrer"
            className="t2k-btn t2k-btn--ghost"
            style={{ borderColor: "rgba(29,168,96,0.45)", color: "var(--t2k-success)" }}
          >
            Start free&nbsp;↗
          </a>
        </div>
      </div>
    </section>
  );
}

export function ApiX402() {
  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div>
            <span className="t2k-eyebrow">{"// NO KEY · NO ACCOUNT"}</span>
            <h2 className="t2k-section-title mt-3">
              Or pay per call
              <br />
              over x402.
            </h2>
            <p
              className="m-0 max-w-[440px]"
              style={{
                marginTop: 16,
                fontSize: 15.5,
                lineHeight: 1.65,
                color: "var(--fg-muted)",
                letterSpacing: "-0.011em",
              }}
            >
              Private Inference is a first-party service on the gateway, so an
              agent can pay per call from its wallet&rsquo;s USDC — gasless, no
              key. The gateway handles{" "}
              <code className="font-mono" style={{ color: "var(--fg)" }}>
                402 → pay → retry
              </code>
              . The agent-native path.
            </p>
            <Link
              href="/agent-payments"
              className="mt-5 inline-flex items-center gap-1.5 pb-0.5 font-mono text-[12.5px] no-underline transition-colors hover:text-[var(--t2k-accent)]"
              style={{
                color: "var(--fg)",
                borderBottom: "1px solid var(--ds-gray-alpha-500)",
              }}
            >
              See Agent Payments →
            </Link>
          </div>
          <div
            className="t2k-card overflow-hidden p-0"
            style={{ background: "var(--ds-background-200)" }}
          >
            <div
              className="flex items-center gap-2 border-b px-3.5 py-2.5"
              style={{
                borderBottomColor: "var(--border)",
                background: "var(--bg-elevated)",
              }}
            >
              <span className="block h-[9px] w-[9px] rounded-full" style={{ background: "#ff5f57" }} />
              <span className="block h-[9px] w-[9px] rounded-full" style={{ background: "#febc2e" }} />
              <span className="block h-[9px] w-[9px] rounded-full" style={{ background: "#28c840" }} />
              <span
                className="ml-2 font-mono text-[11.5px]"
                style={{ color: "var(--fg-subtle)" }}
              >
                ~ /agent
              </span>
            </div>
            <pre
              className="m-0 whitespace-pre-wrap break-words font-mono text-[12.5px]"
              style={{ padding: "18px 20px", lineHeight: 1.8, color: "var(--fg)" }}
            >
              <span style={{ color: "var(--fg-subtle)" }}>$ </span>
              <span style={{ color: "var(--t2k-accent)" }}>t2 pay</span>{" "}
              https://x402.t2000.ai/t2000/v1/chat/completions{" "}
              <span style={{ color: "var(--fg-subtle)" }}>\</span>
              {"\n"}
              {"  "}
              <span style={{ color: "var(--fg-muted)" }}>--data</span>{" "}
              <span style={{ color: "var(--ds-amber-700)" }}>
                &apos;{"{"}&quot;model&quot;:&quot;zai/glm-5.2&quot;,&quot;messages&quot;:[…]{"}"}&apos;
              </span>{" "}
              <span style={{ color: "var(--fg-subtle)" }}>\</span>
              {"\n"}
              {"  "}
              <span style={{ color: "var(--fg-muted)" }}>--max-price</span>{" "}
              <span style={{ color: "var(--t2k-success)" }}>0.10</span>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}

const RUNGS = [
  {
    k: "01",
    name: "Private by default",
    desc: "Every model is zero data retention — prompts and outputs are never stored, logged, or trained on.",
  },
  {
    k: "02",
    name: "Confidential tier",
    desc: "phala/* models run in a verified GPU-TEE. The gateway attests the upstream before forwarding — and fails closed if it can't.",
  },
  {
    k: "03",
    name: "Signed, Sui-anchored receipts",
    desc: "Every confidential response commits its hash on-chain — tamper-evident and publicly timestamped.",
  },
  {
    k: "04",
    name: "Verify it yourself",
    desc: "t2 verify checks the Sui anchor, receipt signature, and TDX quote on your machine. Check the proofs yourself.",
  },
] as const;

export function ApiPrivacy() {
  return (
    <section className="t2k-section" style={{ background: "var(--ds-background-200)" }}>
      <div className="t2k-container">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="t2k-eyebrow">{"// VERIFIABLE, NOT JUST CLAIMED"}</span>
            <h2 className="t2k-section-title mt-3">
              The only Sui-native verifiable
              <br />
              confidential inference.
            </h2>
          </div>
          <p
            className="m-0 max-w-[360px] text-[15px] leading-[1.6]"
            style={{ color: "var(--fg-muted)", letterSpacing: "-0.011em" }}
          >
            Anchored on Sui and read straight from a fullnode — so we can&rsquo;t
            forge it.
          </p>
        </header>
        <div className="grid gap-4 lg:grid-cols-2">
          {RUNGS.map((r) => (
            <div
              key={r.k}
              className="t2k-card flex gap-5"
              style={{ padding: "26px 28px", background: "var(--bg)" }}
            >
              <span
                className="flex-none font-mono text-[13px]"
                style={{ color: "var(--t2k-accent)" }}
              >
                {r.k}
              </span>
              <div>
                <h3
                  className="m-0 mb-2 text-[18px] font-semibold"
                  style={{ letterSpacing: "-0.017em" }}
                >
                  {r.name}
                </h3>
                <p
                  className="m-0 text-[13.5px] leading-[1.6]"
                  style={{ color: "var(--fg-muted)" }}
                >
                  {r.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const TOOLS = [
  "OpenAI SDK",
  "Cursor",
  "Codex CLI",
  "Vercel AI SDK",
  "LangChain",
  "LiteLLM",
  "Cline",
  "Aider",
] as const;

export function ApiIntegrations() {
  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header className="mb-9">
          <span className="t2k-eyebrow">{"// OPENAI-COMPATIBLE · DROP-IN"}</span>
          <h2 className="t2k-section-title mt-3">Point any OpenAI client at it.</h2>
          <p
            className="m-0 max-w-[560px]"
            style={{
              marginTop: 14,
              fontSize: 15.5,
              lineHeight: 1.6,
              color: "var(--fg-muted)",
              letterSpacing: "-0.011em",
            }}
          >
            Two environment variables. Most tools repoint with zero code
            changes.
          </p>
        </header>

        <div className="grid items-stretch gap-4 lg:grid-cols-2">
          <div
            className="t2k-card overflow-hidden p-0"
            style={{ background: "var(--ds-background-200)" }}
          >
            <div
              className="border-b font-mono text-[11px]"
              style={{
                padding: "12px 18px",
                borderBottomColor: "var(--border)",
                color: "var(--fg-subtle)",
                letterSpacing: "0.04em",
              }}
            >
              THE UNIVERSAL SWAP
            </div>
            <pre
              className="m-0 whitespace-pre-wrap break-words font-mono text-[13px]"
              style={{ padding: "20px", lineHeight: 1.9, color: "var(--fg)" }}
            >
              <span style={{ color: "var(--fg-subtle)" }}>export </span>
              OPENAI_BASE_URL=
              <span style={{ color: "var(--ds-amber-700)" }}>
                &quot;https://api.t2000.ai/v1&quot;
              </span>
              {"\n"}
              <span style={{ color: "var(--fg-subtle)" }}>export </span>
              OPENAI_API_KEY=
              <span style={{ color: "var(--ds-amber-700)" }}>&quot;sk-…&quot;</span>
            </pre>
            <div
              className="border-t text-[12.5px] leading-[1.55]"
              style={{
                padding: "13px 20px",
                borderTopColor: "var(--border)",
                color: "var(--fg-muted)",
              }}
            >
              Keys are free — sign in at{" "}
              <span style={{ color: "var(--fg)" }}>agents.t2000.ai/manage</span>.
              Then pick any model ID from the catalog.
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2.5">
              {TOOLS.map((t) => (
                <div
                  key={t}
                  className="flex items-center gap-2.5 rounded-lg border text-[14px]"
                  style={{
                    padding: "13px 16px",
                    borderColor: "var(--border)",
                    background: "var(--ds-background-200)",
                    color: "var(--fg)",
                    letterSpacing: "-0.011em",
                  }}
                >
                  <span
                    className="h-[5px] w-[5px] flex-none rounded-full"
                    style={{ background: "var(--t2k-accent)" }}
                  />
                  {t}
                </div>
              ))}
            </div>
            <div
              className="rounded-lg border text-[12.5px] leading-[1.55]"
              style={{
                padding: "13px 16px",
                borderColor: "var(--border)",
                background: "var(--ds-background-200)",
                color: "var(--fg-muted)",
              }}
            >
              Anthropic-format tools (Claude Code) work today via a translation
              proxy — the same key and credit balance.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
