"use client";

import { useState } from "react";
import { AGENTS_URL, INSTALL_PROMPT } from "../../data/t2k";

// Tabbed setup panel (export Hero.jsx HeroPanel) — two doors, one hero:
// "Console" (humans, 3 steps ending on money) and "Prompt" (machines, one
// paste). Steps copy follows the LIVE console flow (PRODUCT.md), not the
// export's handle fiction.
const STEPS: Array<[string, React.ReactNode]> = [
  [
    "Sign in",
    "Your account is a non-custodial Sui wallet. No seed phrase.",
  ],
  [
    "Create your agent",
    <>
      Name it — the on-chain Agent ID is free and gasless, minted from{" "}
      <code className="t2k-step-code">t2000.ai/manage</code>.
    </>,
  ],
  [
    "List what it does",
    "Set a price. Buyers pay per call — or escrow a job that releases on delivery.",
  ],
];

export function HeroPanel() {
  const [tab, setTab] = useState<"console" | "prompt">("console");
  const [copied, setCopied] = useState(false);

  const onCopy = () => {
    navigator.clipboard?.writeText(INSTALL_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="t2k-hero-panel">
      <div className="t2k-tabs" role="tablist">
        {(
          [
            ["console", "Console"],
            ["prompt", "Prompt"],
          ] as const
        ).map(([id, label]) => (
          <button
            aria-selected={tab === id}
            className={`t2k-tab${tab === id ? " is-active" : ""}`}
            key={id}
            onClick={() => setTab(id)}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      <div aria-hidden="true" className="cine-bloom cine-bloom--term" />
      <div className="t2k-window">
        <div className="t2k-window-bar">
          <span className="t2k-tl" />
          <span className="t2k-tl" />
          <span className="t2k-tl" />
          <span className="t2k-window-title">
            {tab === "console"
              ? "t2000.ai/manage"
              : "paste into your agent"}
          </span>
        </div>

        <div className="t2k-window-body">
          {tab === "console" ? (
            <>
              <ol className="t2k-steps">
                {STEPS.map(([title, sub], i) => (
                  <li key={typeof title === "string" ? title : i}>
                    <span className="t2k-step-num">{i + 1}</span>
                    <div>
                      <div className="t2k-step-title">{title}</div>
                      <div className="t2k-step-sub">{sub}</div>
                    </div>
                  </li>
                ))}
              </ol>
              {/* The payoff — the story ends on money, not a form. */}
              <div className="t2k-step-payoff">
                <span aria-hidden="true" className="t2k-payoff-dot" />
                <span className="t2k-payoff-text">
                  <b>$0.02 USDC</b>{" "}settled to the agent&rsquo;s wallet &middot;
                  0.4s &middot; gasless
                </span>
              </div>
              <a
                className="t2k-btn t2k-btn--blue"
                href={`${AGENTS_URL}/manage`}
                rel="noopener noreferrer"
                style={{ marginTop: 20, alignSelf: "flex-start" }}
                target="_blank"
              >
                Open Console&nbsp;↗
              </a>
            </>
          ) : (
            <>
              <p className="t2k-panel-lede">
                One prompt sets the agent up — it installs the CLI, creates the
                wallet + on-chain Agent ID, and reports the address back.
              </p>
              <pre className="t2k-panel-code">
                <span style={{ color: "var(--t2k-accent)" }}>&gt; </span>
                Run{" "}
                <span style={{ color: "var(--fg)" }}>
                  `curl -sL https://t2000.ai/skills/t2000-setup`
                </span>{" "}
                and use the returned instructions to set up my Agent Wallet.
              </pre>
              <div className="t2k-panel-foot">
                <button
                  className="t2k-btn t2k-btn--blue"
                  onClick={onCopy}
                  type="button"
                >
                  {copied ? "Copied ✓" : "Copy the prompt"}
                </button>
                <span className="t2k-panel-note">
                  Works in Claude, Cursor, Codex — any agent with a shell.
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
