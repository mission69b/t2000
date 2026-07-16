"use client";

import { useState } from "react";
import { AGENTS_URL, DEVELOPERS_URL } from "../../data/t2k";

const SNIPPET = "npm install -g @t2000/code";

export function CodeCloser() {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    void navigator.clipboard?.writeText(SNIPPET);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <section className="t2k-section">
      <div className="t2k-container text-center" style={{ maxWidth: 720 }}>
        <span className="t2k-eyebrow">{"// ONE INSTALL"}</span>
        <h2
          className="t2k-display mt-3.5"
          style={{ fontSize: "clamp(38px, 5vw, 62px)", color: "var(--fg)" }}
        >
          Code privately.
          <br />
          <span style={{ color: "var(--t2k-accent)" }}>Starting now.</span>
        </h2>
        <p
          className="mx-auto mb-0 mt-5 max-w-[520px]"
          style={{
            fontSize: 17,
            lineHeight: 1.55,
            color: "var(--fg-muted)",
            letterSpacing: "-0.011em",
          }}
        >
          Install, sign in, build. The free daily allowance on{" "}
          <code className="font-mono" style={{ color: "var(--fg)" }}>
            kimi-k2.7-code
          </code>{" "}
          means your first sessions cost nothing.
        </p>
        <button
          type="button"
          onClick={onCopy}
          className="mx-auto mt-[30px] inline-flex cursor-pointer items-center gap-3 rounded-lg border font-mono text-[14px]"
          style={{
            padding: "14px 20px",
            background: "var(--ds-background-200)",
            borderColor: "var(--border)",
            color: "var(--fg)",
          }}
        >
          <span style={{ color: "var(--fg-subtle)" }}>$</span>
          <span>{SNIPPET}</span>
          <span
            className="ml-1 text-[12px]"
            style={{ color: copied ? "var(--t2k-accent)" : "var(--fg-subtle)" }}
          >
            {copied ? "copied" : "copy"}
          </span>
        </button>
        <div className="mt-[26px] flex flex-wrap justify-center gap-2.5">
          <a
            href={`${DEVELOPERS_URL}/t2-code`}
            target="_blank"
            rel="noopener noreferrer"
            className="t2k-btn t2k-btn--blue t2k-btn--lg"
          >
            Get started&nbsp;↗
          </a>
          <a
            href={`${AGENTS_URL}/manage`}
            target="_blank"
            rel="noopener noreferrer"
            className="t2k-btn t2k-btn--ghost t2k-btn--lg"
          >
            Mint a key&nbsp;↗
          </a>
        </div>
      </div>
    </section>
  );
}
