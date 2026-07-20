"use client";

import { Fragment, useState } from "react";
import { AGENTS_URL, DEVELOPERS_URL, GITHUB_URL, INSTALL_PROMPT } from "../../data/t2k";

const PROMPT = INSTALL_PROMPT;

export function CloserPrompt() {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    void navigator.clipboard?.writeText(PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section
      className="relative overflow-hidden"
      style={{ padding: "120px 24px 96px" }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2"
        style={{
          top: "55%",
          transform: "translate(-50%,-50%)",
          width: 820,
          height: 360,
          background:
            "radial-gradient(50% 50% at 50% 50%, rgba(0,114,245,0.10) 0%, transparent 70%)",
          filter: "blur(28px)",
        }}
      />

      <div
        className="relative mx-auto text-center"
        style={{ maxWidth: 820 }}
      >
        <h2
          className="t2k-display"
          style={{
            fontSize: "clamp(40px, 5.6vw, 68px)",
            letterSpacing: "-0.04em",
          }}
        >
          One sign-in.
          <br />
          <span style={{ color: "var(--t2k-accent)" }}>
            Wallet, ID, key.
          </span>
        </h2>
        <p
          className="mx-auto mt-[20px] max-w-[520px] text-[17px] leading-[1.5]"
          style={{ color: "var(--fg-muted)", letterSpacing: "-0.011em" }}
        >
          Google sign-in creates your Passport wallet, Agent ID, and API key —
          non-custodial, free.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-2.5">
          <a
            href={`${AGENTS_URL}/manage`}
            target="_blank"
            rel="noopener noreferrer"
            className="t2k-btn t2k-btn--blue t2k-btn--lg"
          >
            Start free&nbsp;↗
          </a>
        </div>

        <p
          className="mt-12 mb-0 font-mono text-[11px] uppercase"
          style={{ color: "var(--fg-subtle)", letterSpacing: "0.08em" }}
        >
          {"// Agent-native? Paste this into Claude Desktop"}
        </p>

        <div
          className="mt-4 overflow-hidden rounded-[10px] border text-left"
          style={{
            background: "var(--ds-background-200)",
            borderColor: "var(--ds-gray-alpha-400)",
            boxShadow:
              "0 0 0 1px rgba(0,114,245,0.10), 0 24px 60px -20px rgba(0,114,245,0.20)",
          }}
        >
          <div
            className="flex items-center justify-between border-b px-3.5 py-2.5"
            style={{
              borderBottomColor: "var(--ds-gray-alpha-300)",
              background: "var(--ds-gray-100)",
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: "#FF5F57" }}
              />
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: "#FEBC2E" }}
              />
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: "#28C840" }}
              />
              <span
                className="ml-2.5 font-mono text-[12px] tracking-[0.01em]"
                style={{ color: "var(--fg-subtle)" }}
              >
                setup-prompt
              </span>
            </div>
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded border-0 px-2.5 py-1.5 text-[12px] font-medium tracking-tight text-white transition-colors"
              style={{
                background: copied ? "var(--t2k-success)" : "var(--t2k-accent)",
              }}
            >
              {copied ? (
                <Fragment>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3.5 8.5l3 3 6-7"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Copied
                </Fragment>
              ) : (
                <Fragment>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <rect
                      x="5"
                      y="5"
                      width="8"
                      height="9"
                      rx="1.5"
                      stroke="currentColor"
                      strokeWidth="1.4"
                    />
                    <path
                      d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-5A1.5 1.5 0 0 0 3 3.5v7A1.5 1.5 0 0 0 4.5 12H5"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  </svg>
                  Copy prompt
                </Fragment>
              )}
            </button>
          </div>
          <pre
            className="m-0 whitespace-pre-wrap break-words font-mono text-[14.5px] leading-[1.75]"
            style={{
              padding: "22px 20px",
              color: "var(--fg)",
            }}
          >
            <span style={{ color: "var(--fg-subtle)" }}>$ </span>
            Run{" "}
            <span style={{ color: "var(--t2k-accent)" }}>
              `curl -sL https://t2000.ai/skills/t2000-setup`
            </span>
            {"\n"}
            {"  "}and use the returned instructions to set up{"\n"}
            {"  "}my Agent Wallet.
          </pre>
        </div>

        <div
          className="mt-7 text-[14px]"
          style={{ color: "var(--fg-muted)" }}
        >
          Prefer to read first?{" "}
          <a
            href={DEVELOPERS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="no-underline"
            style={{
              color: "var(--fg)",
              borderBottom: "1px solid var(--ds-gray-alpha-500)",
            }}
          >
            Read the docs
          </a>{" "}
          <span className="opacity-40">·</span>{" "}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="no-underline"
            style={{
              color: "var(--fg)",
              borderBottom: "1px solid var(--ds-gray-alpha-500)",
            }}
          >
            View on GitHub ↗
          </a>
        </div>
      </div>
    </section>
  );
}
