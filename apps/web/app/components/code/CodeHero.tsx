"use client";

import Link from "next/link";
import { useState } from "react";
import { DEVELOPERS_URL } from "../../data/t2k";

const INSTALL = "npm install -g @t2000/code";

// The REAL welcome screen — logo art + copy lifted from the t2code source
// (cli/src/login/constants.ts LOGO_T2CODE, cli/src/commands/t2code-privacy.ts).
// Faithful except the tagline, which drops "rail" per positioning.
const LOGO_LINES = [
  " ████████╗██████╗      ██████╗ ██████╗ ██████╗ ███████╗",
  " ╚══██╔══╝╚════██╗    ██╔════╝██╔═══██╗██╔══██╗██╔════╝",
  "    ██║    █████╔╝    ██║     ██║   ██║██║  ██║█████╗  ",
  "    ██║   ██╔═══╝     ██║     ██║   ██║██║  ██║██╔══╝  ",
  "    ██║   ███████╗    ╚██████╗╚██████╔╝██████╔╝███████╗",
  "    ╚═╝   ╚══════╝     ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝",
] as const;

// Box-drawing chars get the accent (matches the TUI's SHADOW_CHARS sheen set).
const SHADOW = new Set(["╚", "═", "╝", "║", "╔", "╗"]);

const MODES = [
  {
    id: "private",
    line: "private      — t2000/auto-open · open models only, never a closed lab",
  },
  {
    id: "full",
    line: "full         — t2000/auto router · best quality, may escalate to frontier labs",
  },
  {
    id: "confidential",
    line: "confidential — phala/* GPU-TEE only · attested, verifiable receipts (t2 verify)",
  },
] as const;

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
      style={{ padding: "92px 0 72px", borderBottomColor: "var(--border)" }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          left: "50%",
          top: "30%",
          width: 900,
          height: 600,
          transform: "translateX(-50%)",
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

        <div className="grid gap-y-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-end lg:gap-x-14">
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

          <div className="flex flex-col items-start gap-6 lg:items-end">
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
            <div className="flex flex-wrap gap-[22px]">
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

        <div className="mt-14">
          <WelcomeScreen />
        </div>
      </div>
    </section>
  );
}

function LogoArt() {
  return (
    <pre
      aria-label="t2 code"
      className="m-0 font-mono"
      style={{ fontSize: "clamp(8px, 1.4vw, 13px)", lineHeight: 1.25 }}
    >
      {LOGO_LINES.map((line, li) => (
        <div key={li}>
          {[...line].map((ch, ci) => (
            <span
              key={ci}
              style={{
                color: SHADOW.has(ch) ? "var(--t2k-accent)" : "var(--fg)",
              }}
            >
              {ch}
            </span>
          ))}
        </div>
      ))}
    </pre>
  );
}

function WelcomeScreen() {
  const [mode, setMode] = useState(0);

  return (
    <div
      className="t2k-card mx-auto max-w-[880px] overflow-hidden p-0"
      style={{ background: "var(--bg)", boxShadow: "var(--shadow-lg)" }}
    >
      <div
        className="relative flex items-center gap-2 border-b px-4 py-3"
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
          className="absolute left-1/2 -translate-x-1/2 font-mono text-[12px]"
          style={{ color: "var(--fg-subtle)" }}
        >
          t2code
        </span>
      </div>

      <div
        className="overflow-x-auto font-mono text-[12.5px]"
        style={{ padding: "26px 26px 20px", lineHeight: 1.75 }}
      >
        <LogoArt />

        <p className="m-0 mt-5" style={{ color: "var(--fg)" }}>
          t2 code will run commands on your behalf to help you build. Private
          inference, zero data retention.
        </p>
        <p className="m-0 mt-3" style={{ color: "var(--fg)" }}>
          Directory <span style={{ color: "var(--fg-muted)" }}>~/dev/private-agent</span>
        </p>

        <p className="m-0 mt-4" style={{ color: "var(--fg)" }}>
          Privacy mode
        </p>
        <div className="mt-1 flex flex-col">
          {MODES.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(i)}
              className="cursor-pointer whitespace-pre border-0 bg-transparent p-0 text-left font-mono text-[12.5px]"
              style={{
                lineHeight: 1.75,
                color: i === mode ? "var(--fg)" : "var(--fg-muted)",
              }}
            >
              {"  "}
              <span
                style={{
                  color: i === mode ? "var(--t2k-accent)" : "var(--fg-subtle)",
                }}
              >
                {i === mode ? "●" : "○"}
              </span>{" "}
              {m.line}
            </button>
          ))}
        </div>

        <p className="m-0 mt-4 whitespace-pre-wrap" style={{ color: "var(--fg-muted)" }}>
          {"  "}Active: <span style={{ color: "var(--fg)" }}>{MODES[mode].id}</span>{" "}
          — pinned by this repo (.t2000/config.json)
        </p>
        <p className="m-0 whitespace-pre-wrap" style={{ color: "var(--fg-muted)" }}>
          {"  "}Endpoint: api.t2000.ai/v1 (zero data retention)
        </p>
        <p
          className="m-0 mt-3 whitespace-pre-wrap text-[11.5px]"
          style={{ color: "var(--fg-subtle)" }}
        >
          {"  "}Switch globally: /privacy private | full | confidential — the
          repo pin wins over the global setting.
        </p>
      </div>

      <div className="px-4 pb-4">
        <div
          className="flex items-center gap-2 rounded-lg border px-4 py-3 font-mono text-[12.5px]"
          style={{ borderColor: "var(--ds-gray-alpha-500)" }}
        >
          <span
            className="inline-block"
            style={{
              width: 7,
              height: 15,
              background: "var(--t2k-accent)",
              animation: "t2k-blink 1s steps(1) infinite",
            }}
          />
          <span style={{ color: "var(--fg-subtle)" }}>
            Enter a coding task or / for commands
          </span>
          <span className="flex-1" />
          <span
            className="rounded border px-2 py-0.5 text-[10.5px]"
            style={{
              borderColor: "var(--ds-gray-alpha-400)",
              color: "var(--fg-subtle)",
            }}
          >
            &lt; DEFAULT
          </span>
        </div>
      </div>
    </div>
  );
}
