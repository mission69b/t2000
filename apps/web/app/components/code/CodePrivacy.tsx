"use client";

import { useState } from "react";

// The moat section — eve.dev's managed/self-hosted toggle, but for privacy.
// Three modes, chosen at first run, switched with /privacy, pinned per repo.
const MODES = [
  {
    id: "private",
    label: "Private",
    model: "t2000/auto-open",
    headline: "Open models only.",
    green: false,
    points: [
      "Routine steps on GLM / DeepSeek; hard steps escalate to Kimi K2.7 Code.",
      "Your prompts never reach a closed-model provider.",
      "Zero data retention on every model — nothing stored, nothing trained on.",
    ],
    footer: "The default. Most coding runs at open-model prices.",
  },
  {
    id: "full",
    label: "Full router",
    model: "t2000/auto",
    headline: "Best quality per dollar.",
    green: false,
    points: [
      "Bulk steps stay on cheap open models.",
      "Long context, planning, and retries-after-failure escalate to Claude or GPT.",
      "Still zero data retention everywhere — you pay for the model that served.",
    ],
    footer: "For when you want frontier quality on the hard 10%.",
  },
  {
    id: "confidential",
    label: "Confidential",
    model: "phala/*",
    headline: "Hardware-attested inference.",
    green: true,
    points: [
      "Every call runs inside a verified GPU enclave (TEE).",
      "Every response carries a signed receipt anchored on Sui.",
      "t2 verify checks the proof on your machine — no trust in our servers required.",
    ],
    footer: "For code that must never be seen — provably.",
  },
] as const;

export function CodePrivacy() {
  const [active, setActive] = useState(0);
  const mode = MODES[active];

  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="t2k-eyebrow">{"// THREE PRIVACY MODES"}</span>
            <h2 className="t2k-section-title mt-3">
              You decide what
              <br />
              your code touches.
            </h2>
          </div>
          <p
            className="m-0 max-w-[400px] text-[15px] leading-[1.6]"
            style={{ color: "var(--fg-muted)", letterSpacing: "-0.011em" }}
          >
            Chosen at first run, switched any time with{" "}
            <code className="font-mono" style={{ color: "var(--fg)" }}>
              /privacy
            </code>
            , pinned per repo with{" "}
            <code className="font-mono" style={{ color: "var(--fg)" }}>
              .t2000/config.json
            </code>
            .
          </p>
        </header>

        <div
          className="mb-4 inline-flex rounded-lg border p-1"
          style={{
            borderColor: "var(--border)",
            background: "var(--ds-background-200)",
          }}
        >
          {MODES.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setActive(i)}
              className="cursor-pointer rounded-md border-0 px-4 py-2 font-mono text-[12.5px] transition-colors"
              style={{
                background: i === active ? "var(--ds-gray-alpha-200)" : "transparent",
                color:
                  i === active
                    ? m.green
                      ? "var(--t2k-success)"
                      : "var(--t2k-accent)"
                    : "var(--fg-muted)",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div
          className="t2k-card"
          style={{
            padding: 28,
            borderColor: mode.green ? "rgba(29,168,96,0.35)" : undefined,
            background: mode.green ? "rgba(29,168,96,0.04)" : undefined,
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3
              className="m-0 text-[22px] font-semibold"
              style={{ letterSpacing: "-0.02em", color: "var(--fg)" }}
            >
              {mode.headline}
            </h3>
            <span
              className="t2k-mono-tag"
              style={{
                color: mode.green ? "var(--t2k-success)" : "var(--t2k-accent)",
              }}
            >
              {mode.model}
            </span>
          </div>
          <ul
            className="m-0 mt-5 flex list-none flex-col gap-3 p-0 text-[14.5px] leading-[1.55]"
            style={{ color: "var(--fg-muted)" }}
          >
            {mode.points.map((p) => (
              <li key={p} className="flex gap-3">
                <span
                  className="mt-[9px] h-[5px] w-[5px] flex-none rounded-full"
                  style={{
                    background: mode.green
                      ? "var(--t2k-success)"
                      : "var(--t2k-accent)",
                  }}
                />
                {p}
              </li>
            ))}
          </ul>
          <div
            className="mt-6 border-t pt-4 text-[13px]"
            style={{ borderTopColor: "var(--border)", color: "var(--fg-subtle)" }}
          >
            {mode.footer}
          </div>
        </div>
      </div>
    </section>
  );
}
