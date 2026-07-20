"use client";

import { useState } from "react";
import { AGENTS_URL, INSTALL_PROMPT } from "../../data/t2k";

// The hero path picker — one card, two doors (S.718 setup unification).
// Console is the no-code door for humans; Prompt is the one-prompt setup
// for agents/devs (it installs the CLI, so a separate CLI tab is redundant).

const TABS = ["Console", "Prompt"] as const;
type Tab = (typeof TABS)[number];

export function HeroPaths() {
  const [tab, setTab] = useState<Tab>("Console");

  return (
    <div>
      <div className="t2k-hp-tabs" role="tablist" aria-label="Pick a path">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={"t2k-hp-tab" + (tab === t ? " is-active" : "")}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Console" ? (
        <PanelCard title="agents.t2000.ai/manage">
          <ol className="t2k-hp-steps">
            <li>
              <span className="t2k-hp-n">1</span>
              <div>
                <div className="t2k-hp-step-t">Sign in with Google</div>
                <div className="t2k-hp-step-s">
                  Your account is a non-custodial Sui wallet.
                </div>
              </div>
            </li>
            <li>
              <span className="t2k-hp-n">2</span>
              <div>
                <div className="t2k-hp-step-t">Create your Agent ID</div>
                <div className="t2k-hp-step-s">One tap — on-chain, gasless.</div>
              </div>
            </li>
            <li>
              <span className="t2k-hp-n">3</span>
              <div>
                <div className="t2k-hp-step-t">Create an API key</div>
                <div className="t2k-hp-step-s">
                  Free, with a daily coding allowance.
                </div>
              </div>
            </li>
          </ol>
          <a
            href={`${AGENTS_URL}/manage`}
            target="_blank"
            rel="noopener noreferrer"
            className="t2k-btn t2k-btn--blue"
          >
            Open Console&nbsp;↗
          </a>
        </PanelCard>
      ) : (
        <PromptPanel />
      )}
    </div>
  );
}

function PromptPanel() {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(INSTALL_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <PanelCard title="paste into your agent">
      <p className="t2k-hp-blurb">
        One prompt sets the agent up — it installs the CLI, creates the wallet
        + on-chain Agent ID, and reports the address back.
      </p>
      <div className="t2k-hp-prompt">
        <span className="t2k-hp-prompt-mark">&gt;</span> {INSTALL_PROMPT}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="t2k-btn t2k-btn--blue" onClick={copy}>
          {copied ? "Copied ✓" : "Copy the prompt"}
        </button>
        <span className="t2k-hp-step-s">
          Works in Claude, Cursor, Codex — any agent with a shell.
        </span>
      </div>
    </PanelCard>
  );
}

function PanelCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="t2k-hp-card">
      <div className="t2k-hp-card-head">
        <span className="block h-2.5 w-2.5 rounded-full" style={{ background: "#FF5F57" }} />
        <span className="block h-2.5 w-2.5 rounded-full" style={{ background: "#FEBC2E" }} />
        <span className="block h-2.5 w-2.5 rounded-full" style={{ background: "#28C840" }} />
        <span className="ml-2.5 font-mono text-[12px] tracking-[0.01em]" style={{ color: "var(--fg-subtle)" }}>
          {title}
        </span>
      </div>
      <div className="t2k-hp-card-body">{children}</div>
    </div>
  );
}
