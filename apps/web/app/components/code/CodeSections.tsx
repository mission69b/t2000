import { DEVELOPERS_URL } from "../../data/t2k";

const FEATURES = [
  {
    tag: "t2code exec",
    name: "Headless, delegable",
    desc: "One-shot mode with a strict contract: stdout is the answer, progress goes to stderr. Delegate mechanical work from Cursor, Claude Code, or CI — and pay open-model prices for it.",
  },
  {
    tag: "/skill:improve",
    name: "Skills built in",
    desc: "11 playbooks ship in the binary — codebase audits, secure Move review, wallet and payment flows. Project skills load from .agents/skills/; every one is a slash command.",
  },
  {
    tag: "auto-detect",
    name: "Sui out of the box",
    desc: "Move.toml or @mysten/sui in the repo? init appends the ground rules to AGENTS.md and offers the official Sui Agent Skills by Mysten Labs — with your consent, never silently.",
  },
  {
    tag: "MCP preinstalled",
    name: "A wallet in-session",
    desc: "The t2000 wallet tools come wired: check balances, send USDC, pay per-call APIs (search, image gen, TTS) without leaving the session.",
  },
  {
    tag: "stripped at source",
    name: "Nothing phones home",
    desc: "Analytics and log shipping are deleted from the code, not toggled off. The binary talks to api.t2000.ai and nothing else — no session uploads, no crash reports, no tracking.",
  },
  {
    tag: "t2000/auto",
    name: "Routing cuts the bill",
    desc: "Routine steps run on cheap open models; hard steps escalate. Every response names the model that served it, and the free daily allowance covers everyday coding.",
  },
] as const;

export function CodeFeatures() {
  return (
    <section
      className="t2k-section"
      style={{ background: "var(--ds-background-200)" }}
    >
      <div className="t2k-container">
        <header className="mb-10">
          <span className="t2k-eyebrow">{"// WHAT SHIPS IN THE BOX"}</span>
          <h2 className="t2k-section-title mt-3">
            An agent that can code,
            <br />
            and pay its own way.
          </h2>
        </header>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.name}
              className="t2k-card flex flex-col gap-3"
              style={{ padding: 24, background: "var(--bg)" }}
            >
              <span className="t2k-mono-tag t2k-mono-tag--blue">{f.tag}</span>
              <h3
                className="m-0 text-[17px] font-semibold"
                style={{ letterSpacing: "-0.017em", color: "var(--fg)" }}
              >
                {f.name}
              </h3>
              <p
                className="m-0 text-[13.5px] leading-[1.6]"
                style={{ color: "var(--fg-muted)" }}
              >
                {f.desc}
              </p>
            </div>
          ))}
        </div>

        <div
          className="mt-4 flex flex-wrap items-center justify-between gap-3.5 rounded-lg border"
          style={{
            padding: "18px 22px",
            borderColor: "var(--border)",
            background: "var(--bg)",
          }}
        >
          <div className="flex flex-col gap-1">
            <span
              className="text-[15px] font-semibold"
              style={{ color: "var(--fg)", letterSpacing: "-0.014em" }}
            >
              Love your current tool? Keep it.
            </span>
            <span className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
              <code className="font-mono" style={{ color: "var(--fg)" }}>
                t2 connect claude-code · grok · aider · codex · cline
              </code>{" "}
              points it at the same account and models — one command.
            </span>
          </div>
          <a
            href={`${DEVELOPERS_URL}/use-with-your-tools`}
            target="_blank"
            rel="noopener noreferrer"
            className="t2k-btn t2k-btn--ghost"
          >
            See t2 connect&nbsp;↗
          </a>
        </div>
      </div>
    </section>
  );
}
