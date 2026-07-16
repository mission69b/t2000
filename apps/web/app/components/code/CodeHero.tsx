"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DEVELOPERS_URL } from "../../data/t2k";

// A real-shaped t2code session: privacy badge on entry, plan → edit → test,
// served-by line with the free-allowance price. Keep lines honest to the
// product — this mock is the hero, not a fantasy.
const LINES = [
  { t: "cmd", s: "t2code" },
  { t: "badge", s: "◆ t2 code · privacy: private — open models only" },
  { t: "gap", s: "" },
  { t: "user", s: "> add rate limiting to /api/chat and cover it with tests" },
  { t: "dim", s: "read route.ts, middleware.ts · plan ready" },
  { t: "ok", s: "✎ src/lib/rate-limit.ts        +64" },
  { t: "ok", s: "✎ src/app/api/chat/route.ts    +9" },
  { t: "ok", s: "✓ vitest run — 14 passed" },
  { t: "gap", s: "" },
  { t: "user", s: "> /skill:improve" },
  { t: "ok", s: "✓ audit plan → plans/improve-api.md" },
  { t: "served", s: "served by kimi-k2.7-code · $0.00 (free daily)" },
] as const;

const INSTALL = "npm install -g @t2000/code";

export function CodeHero() {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    void navigator.clipboard?.writeText(INSTALL);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

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

        <div className="grid gap-y-9 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,1fr)] lg:items-center lg:gap-x-14">
          <div>
            <div className="t2k-eyebrow mb-[22px]">
              {"// T2 CODE · THE TERMINAL CODING AGENT"}
            </div>
            <h1
              className="t2k-display"
              style={{ fontSize: "clamp(42px, 6vw, 76px)", color: "var(--fg)" }}
            >
              The free private
              <br />
              <span style={{ color: "var(--t2k-accent)" }}>coding agent.</span>
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
              A terminal agent that plans, edits, and tests your code on{" "}
              <span style={{ color: "var(--fg)" }}>open models</span> — zero
              data retention, telemetry stripped at the source, and a free
              daily allowance. Your code is not the product.
            </p>
          </div>

          <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
            <CodeHeroTerminal />
          </div>

          <div className="lg:col-start-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onCopy}
                className="inline-flex cursor-pointer items-center gap-2.5 rounded-lg border font-mono text-[13.5px]"
                style={{
                  padding: "12px 18px",
                  background: "var(--ds-background-200)",
                  borderColor: "var(--border)",
                  color: "var(--fg)",
                }}
              >
                <span style={{ color: "var(--fg-subtle)" }}>$</span>
                <span>{INSTALL}</span>
                <span
                  className="ml-1 text-[11.5px]"
                  style={{
                    color: copied ? "var(--t2k-accent)" : "var(--fg-subtle)",
                  }}
                >
                  {copied ? "copied" : "copy"}
                </span>
              </button>
              <a
                href={`${DEVELOPERS_URL}/t2-code`}
                target="_blank"
                rel="noopener noreferrer"
                className="t2k-btn t2k-btn--ghost t2k-btn--lg"
              >
                Read the docs&nbsp;↗
              </a>
            </div>
            <div className="mt-[30px] flex flex-wrap gap-[22px]">
              {(
                [
                  ["Open models", "private by default"],
                  ["0 telemetry", "stripped at the source"],
                  ["$0 / day", "free daily coding"],
                ] as const
              ).map(([a, b]) => (
                <div key={b} className="flex flex-col gap-0.5">
                  <span
                    className="font-mono text-[15px]"
                    style={{ color: "var(--fg)", letterSpacing: "-0.01em" }}
                  >
                    {a}
                  </span>
                  <span
                    className="text-[12.5px]"
                    style={{ color: "var(--fg-subtle)" }}
                  >
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

function CodeHeroTerminal() {
  const [n, setN] = useState(0);

  useEffect(() => {
    if (n >= LINES.length) {
      const r = setTimeout(() => setN(0), 3200);
      return () => clearTimeout(r);
    }
    const d = LINES[n].t === "gap" ? 120 : 430;
    const r = setTimeout(() => setN(n + 1), d);
    return () => clearTimeout(r);
  }, [n]);

  const color = (t: string) =>
    t === "badge"
      ? "var(--t2k-accent)"
      : t === "ok"
        ? "var(--t2k-success)"
        : t === "user" || t === "cmd"
          ? "var(--fg)"
          : t === "served"
            ? "var(--fg-subtle)"
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
        <span
          className="block h-2.5 w-2.5 rounded-full"
          style={{ background: "#ff5f57" }}
        />
        <span
          className="block h-2.5 w-2.5 rounded-full"
          style={{ background: "#febc2e" }}
        />
        <span
          className="block h-2.5 w-2.5 rounded-full"
          style={{ background: "#28c840" }}
        />
        <span
          className="ml-2 font-mono text-[12px]"
          style={{ color: "var(--fg-subtle)" }}
        >
          ~/your-app
        </span>
        <span className="flex-1" />
        <span
          className="inline-flex items-center gap-1.5 font-mono text-[11px]"
          style={{ color: "var(--fg-subtle)" }}
        >
          <span className="t2k-dot" /> private
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
            style={{
              color: color(l.t),
              minHeight: l.t === "gap" ? 10 : undefined,
            }}
          >
            {l.t === "cmd" && (
              <span style={{ color: "var(--fg-subtle)", marginRight: 6 }}>
                $
              </span>
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
