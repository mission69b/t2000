import { DEVELOPERS_URL } from "../../data/t2k";

const FEATURES = [
  {
    tag: "t2code exec",
    name: "Headless, delegable",
    desc: "Runs one task, prints one answer. Delegate the grunt work from Cursor, Claude Code, or CI — at open-model prices.",
  },
  {
    tag: "/skill:improve",
    name: "Skills built in",
    desc: "11 playbooks in the binary — audits, Move security, payment flows. Each one is a slash command.",
  },
  {
    tag: "auto-detect",
    name: "Sui out of the box",
    desc: "Detects a Sui repo, adds the ground rules, and offers Mysten's official skills — with your consent.",
  },
  {
    tag: "MCP preinstalled",
    name: "A wallet in-session",
    desc: "Check balances, send USDC, and pay per-call APIs without leaving the session.",
  },
  {
    tag: "stripped at source",
    name: "Nothing phones home",
    desc: "Telemetry is deleted from the code, not toggled off. The binary talks to api.t2000.ai — nothing else.",
  },
  {
    tag: "t2000/auto",
    name: "Routing cuts the bill",
    desc: "Cheap models for routine steps, escalation for hard ones. The free allowance covers everyday coding.",
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
                t2 connect claude-code
              </code>{" "}
              points it at the same account and models. Also: grok, aider,
              codex, cline.
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
