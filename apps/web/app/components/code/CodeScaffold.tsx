"use client";

import { useState } from "react";

// The eve.dev "your agent/ is a directory" move, with OUR real output:
// everything below is what `t2code init` actually writes into a repo.
interface ScaffoldFile {
  name: string;
  tag: string;
  blurb: string;
  lines: { c?: "dim" | "accent" | "ok"; s: string }[];
}

const FILES: ScaffoldFile[] = [
  {
    name: "AGENTS.md",
    tag: "context",
    blurb:
      "Repo context every agent reads. Sui repos get the ground rules added automatically.",
    lines: [
      { c: "accent", s: "# Project" },
      { s: "" },
      { s: "Next.js app — pnpm, vitest." },
      { s: "" },
      { c: "accent", s: "## Ground rules" },
      { s: "- Trace the code path before fixing." },
      { s: "- Small diffs; match existing style." },
      { s: "" },
      { c: "accent", s: "## Sui — added when detected" },
      { s: "- gRPC only; JSON-RPC is retired." },
      { s: "- Never hardcode token decimals." },
      { s: "- Floor amounts, never round up." },
    ],
  },
  {
    name: ".agents/skills/",
    tag: "11 skills",
    blurb:
      "11 playbooks ship built in; drop your own in as folders. Each one is a /skill: command.",
    lines: [
      { c: "accent", s: "improve/" },
      { c: "dim", s: "  plan-expensive, execute-cheap audits" },
      { c: "accent", s: "sui-move-security/" },
      { c: "dim", s: "  OpenZeppelin rules for value-path Move" },
      { c: "accent", s: "t2000-pay/" },
      { c: "dim", s: "  pay APIs per call from the session" },
      { c: "accent", s: "t2000-wallet/" },
      { c: "dim", s: "  balances · send · receive" },
      { s: "…" },
      { c: "dim", s: "add your own: any SKILL.md folder" },
    ],
  },
  {
    name: "plans/",
    tag: "workflows",
    blurb:
      "A strong model writes the plan, a cheap headless run executes it, you review the diff.",
    lines: [
      { c: "dim", s: "# plans/README.md" },
      { s: "" },
      { s: "1. A strong model writes the plan" },
      { c: "dim", s: "   /skill:improve → plans/fix-auth.md" },
      { s: "2. A cheap executor runs it" },
      { c: "accent", s: "   git worktree add ../fix-auth" },
      { c: "accent", s: '   t2code exec "execute plans/fix-auth.md"' },
      { s: "3. You review the diff." },
    ],
  },
  {
    name: ".t2000/config.json",
    tag: "privacy pin",
    blurb:
      "Pins the privacy mode for the repo. Commit it and every contributor inherits it.",
    lines: [
      { s: "{" },
      { c: "accent", s: '  "privacy": "private"' },
      { s: "}" },
      { s: "" },
      { c: "dim", s: "// private — open models only" },
      { c: "dim", s: "// full    — router may escalate" },
      { c: "dim", s: "// confidential — GPU-TEE only" },
    ],
  },
];

export function CodeScaffold() {
  const [active, setActive] = useState(0);
  const file = FILES[active];

  return (
    <section
      className="t2k-section"
      style={{ background: "var(--ds-background-200)" }}
    >
      <div className="t2k-container">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="t2k-eyebrow">{"// T2CODE INIT"}</span>
            <h2 className="t2k-section-title mt-3">
              One command
              <br />
              readies any repo.
            </h2>
          </div>
          <p
            className="m-0 max-w-[400px] text-[15px] leading-[1.6]"
            style={{ color: "var(--fg-muted)", letterSpacing: "-0.011em" }}
          >
            <code className="font-mono" style={{ color: "var(--fg)" }}>
              t2code init
            </code>{" "}
            writes context, skills, workflows, and a privacy pin into your
            repo. One command — the repo is agent-ready.
          </p>
        </header>

        <div
          className="t2k-card overflow-hidden p-0"
          style={{ background: "var(--bg)" }}
        >
          <div
            className="border-b px-5 py-3 font-mono text-[12px]"
            style={{
              borderBottomColor: "var(--border)",
              color: "var(--fg-subtle)",
            }}
          >
            <span style={{ color: "var(--fg-subtle)" }}>$ </span>
            <span style={{ color: "var(--fg)" }}>t2code init</span>
            <span className="ml-3" style={{ color: "var(--t2k-success)" }}>
              ✓ 4 pieces scaffolded
            </span>
          </div>
          <div className="grid md:grid-cols-[240px_minmax(0,1fr)]">
            <div
              className="flex flex-row overflow-x-auto border-b md:flex-col md:border-r md:border-b-0"
              style={{ borderColor: "var(--border)" }}
            >
              {FILES.map((f, i) => (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => setActive(i)}
                  className="flex cursor-pointer items-center justify-between gap-3 whitespace-nowrap border-0 px-5 py-3.5 text-left font-mono text-[12.5px]"
                  style={{
                    background:
                      i === active ? "var(--ds-gray-alpha-100)" : "transparent",
                    color: i === active ? "var(--fg)" : "var(--fg-muted)",
                    borderLeft:
                      i === active
                        ? "2px solid var(--t2k-accent)"
                        : "2px solid transparent",
                  }}
                >
                  {f.name}
                  <span
                    className="text-[10px] uppercase"
                    style={{
                      letterSpacing: "0.06em",
                      color:
                        i === active ? "var(--t2k-accent)" : "var(--fg-subtle)",
                    }}
                  >
                    {f.tag}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex flex-col">
              <div
                className="border-b px-6 py-4 text-[13.5px] leading-[1.55]"
                style={{
                  borderBottomColor: "var(--border)",
                  color: "var(--fg-muted)",
                }}
              >
                {file.blurb}
              </div>
              <pre
                className="m-0 flex-1 overflow-x-auto font-mono text-[12.5px]"
                style={{ padding: "20px 24px", lineHeight: 1.8, minHeight: 264 }}
              >
                {file.lines.map((l, i) => (
                  <div
                    key={i}
                    style={{
                      color:
                        l.c === "dim"
                          ? "var(--fg-subtle)"
                          : l.c === "accent"
                            ? "var(--t2k-accent)"
                            : l.c === "ok"
                              ? "var(--t2k-success)"
                              : "var(--fg)",
                      minHeight: l.s === "" ? 10 : undefined,
                    }}
                  >
                    {l.s}
                  </div>
                ))}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
