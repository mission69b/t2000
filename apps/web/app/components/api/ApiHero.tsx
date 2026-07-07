"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DEVELOPERS_URL } from "../../data/t2k";

// Confidential path demo: a phala/* call returns a receipt; t2 verify
// checks the Sui anchor + receipt signature + TDX quote client-side.
const LINES = [
  { t: "cmd", s: 't2 chat --model phala/glm-5.2 \\' },
  { t: "cont", s: '  "Summarize the filing."' },
  { t: "gap", s: "" },
  { t: "conf", s: "🔒 confidential · attested · enclave verified" },
  { t: "out", s: '"Here\u2019s the summary you asked for …"' },
  { t: "rcpt", s: "x-receipt-id: rcpt-9f4c…a21e" },
  { t: "gap", s: "" },
  { t: "cmd", s: "t2 verify rcpt-9f4c…a21e" },
  { t: "ok", s: "✓ Sui anchor (trustless)        matches" },
  { t: "ok", s: "✓ Receipt signature (trustless) attested key" },
  { t: "ok", s: "✓ TDX quote (DCAP)              genuine Intel TDX" },
  { t: "res", s: "RESULT: ✓ verified — checked on your machine" },
] as const;

export function ApiHero() {
  return (
    <section
      className="relative overflow-hidden border-b"
      style={{ padding: "92px 0 64px", borderBottomColor: "var(--border)" }}
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
        <Link
          href="/"
          className="mb-[26px] inline-flex items-center gap-1.5 font-mono text-[13px] no-underline"
          style={{ color: "var(--fg-muted)", letterSpacing: "0.01em" }}
        >
          <span className="opacity-60">←</span> t2000.ai
        </Link>

        {/* Stacked (<lg): copy → terminal → CTAs, so the hero CLI stays in
            view. Desktop (lg+): copy+CTAs left, terminal right — per design. */}
        <div className="grid gap-y-9 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,1fr)] lg:items-center lg:gap-x-14">
          <div>
            <div className="t2k-eyebrow mb-[22px]">
              {"// PRIVATE & CONFIDENTIAL API · api.t2000.ai"}
            </div>
            <h1
              className="t2k-display"
              style={{ fontSize: "clamp(42px, 6vw, 76px)", color: "var(--fg)" }}
            >
              Every model.
              <br />
              <span style={{ color: "var(--t2k-accent)" }}>Private by default.</span>
            </h1>
            <p
              className="m-0 max-w-[512px]"
              style={{
                marginTop: 26,
                fontSize: 18,
                lineHeight: 1.5,
                color: "var(--fg-muted)",
                letterSpacing: "-0.014em",
              }}
            >
              An OpenAI-compatible endpoint. Point any OpenAI SDK at it — every
              model <span style={{ color: "var(--fg)" }}>private by default</span>,
              verifiably <span style={{ color: "var(--fg)" }}>confidential</span>{" "}
              when it matters. Paid per token in USDC.
            </p>
          </div>

          <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
            <ApiHeroTerminal />
          </div>

          <div className="lg:col-start-1">
            <div className="flex flex-wrap gap-2.5">
              <a
                href={`${DEVELOPERS_URL}/private-api`}
                target="_blank"
                rel="noopener noreferrer"
                className="t2k-btn t2k-btn--blue t2k-btn--lg"
              >
                Read the docs&nbsp;↗
              </a>
              <Link href="/verify" className="t2k-btn t2k-btn--ghost t2k-btn--lg">
                Verify a receipt&nbsp;→
              </Link>
            </div>
            <div className="mt-[30px] flex flex-wrap gap-[22px]">
              {(
                [
                  ["ZDR", "every model private"],
                  ["GPU-TEE", "confidential tier"],
                  ["Sui-anchored", "verify every response"],
                ] as const
              ).map(([a, b]) => (
                <div key={b} className="flex flex-col gap-0.5">
                  <span
                    className="font-mono text-[15px]"
                    style={{ color: "var(--fg)", letterSpacing: "-0.01em" }}
                  >
                    {a}
                  </span>
                  <span className="text-[12.5px]" style={{ color: "var(--fg-subtle)" }}>
                    {b}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ApiHeroTerminal() {
  const [n, setN] = useState(0);

  useEffect(() => {
    if (n >= LINES.length) {
      const r = setTimeout(() => setN(0), 2800);
      return () => clearTimeout(r);
    }
    const d = LINES[n].t === "gap" ? 120 : 420;
    const r = setTimeout(() => setN(n + 1), d);
    return () => clearTimeout(r);
  }, [n]);

  const color = (t: string) =>
    t === "rcpt"
      ? "var(--t2k-accent)"
      : t === "conf" || t === "ok" || t === "res"
        ? "var(--t2k-success)"
        : t === "out" || t === "cmd"
          ? "var(--fg)"
          : "var(--fg-muted)";

  return (
    <div
      className="t2k-card overflow-hidden p-0"
      style={{ background: "var(--bg)" }}
    >
      <div
        className="flex items-center gap-2 border-b px-4 py-3"
        style={{ borderBottomColor: "var(--border)" }}
      >
        <span className="block h-2.5 w-2.5 rounded-full" style={{ background: "#ff5f57" }} />
        <span className="block h-2.5 w-2.5 rounded-full" style={{ background: "#febc2e" }} />
        <span className="block h-2.5 w-2.5 rounded-full" style={{ background: "#28c840" }} />
        <span className="ml-2 font-mono text-[12px]" style={{ color: "var(--fg-subtle)" }}>
          ~ /agent
        </span>
        <span className="flex-1" />
        <span
          className="inline-flex items-center gap-1.5 font-mono text-[11px]"
          style={{ color: "var(--fg-subtle)" }}
        >
          <span className="t2k-dot" /> api.t2000.ai
        </span>
      </div>
      <div
        className="font-mono text-[12.5px]"
        style={{ padding: "18px 18px 22px", lineHeight: 1.75, minHeight: 340 }}
      >
        {LINES.slice(0, n).map((l, i) => (
          <div
            key={i}
            className="whitespace-pre-wrap"
            style={{ color: color(l.t), minHeight: l.t === "gap" ? 10 : undefined }}
          >
            {l.t === "cmd" && (
              <span style={{ color: "var(--fg-subtle)", marginRight: 6 }}>$</span>
            )}
            {l.s}
          </div>
        ))}
        {n < LINES.length && (
          <span
            className="inline-block align-middle"
            style={{
              width: 7,
              height: 15,
              background: "var(--t2k-accent)",
              animation: "t2k-blink 1s steps(1) infinite",
            }}
          />
        )}
      </div>
    </div>
  );
}
