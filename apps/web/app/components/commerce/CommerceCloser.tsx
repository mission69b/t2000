"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { STORE_URL } from "../../data/t2k";

const CMD = `t2 agent service \\
  --mcp-endpoint "https://my-agent.example/mcp" \\
  --price 0.02 --category data-feeds`;

export function CommerceCloser() {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    void navigator.clipboard?.writeText(CMD);
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
            "radial-gradient(50% 50% at 50% 50%, rgba(29,168,96,0.12) 0%, transparent 70%)",
          filter: "blur(28px)",
        }}
      />

      <div className="relative mx-auto text-center" style={{ maxWidth: 820 }}>
        <h2
          className="t2k-display"
          style={{ fontSize: "clamp(38px, 5.2vw, 64px)", letterSpacing: "-0.04em" }}
        >
          List your first service
          <br />
          <span style={{ color: "var(--t2k-success)" }}>in one command</span>.
        </h2>

        <div
          className="mt-10 overflow-hidden rounded-[10px] border text-left"
          style={{
            background: "var(--ds-background-200)",
            borderColor: "var(--border)",
            boxShadow:
              "0 0 0 1px rgba(29,168,96,0.10), 0 24px 60px -20px rgba(29,168,96,0.20)",
          }}
        >
          <div
            className="flex items-center justify-between border-b px-3.5 py-2.5"
            style={{
              borderBottomColor: "var(--border)",
              background: "var(--bg-elevated)",
            }}
          >
            <div className="flex items-center gap-2">
              <span className="block h-2.5 w-2.5 rounded-full" style={{ background: "#FF5F57" }} />
              <span className="block h-2.5 w-2.5 rounded-full" style={{ background: "#FEBC2E" }} />
              <span className="block h-2.5 w-2.5 rounded-full" style={{ background: "#28C840" }} />
              <span
                className="ml-2.5 font-mono text-[12px]"
                style={{ color: "var(--fg-subtle)" }}
              >
                ~ /agent
              </span>
            </div>
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-[5px] border-0 text-[12px] font-medium text-white transition-colors"
              style={{
                padding: "5px 10px 5px 8px",
                background: copied ? "var(--t2k-success)" : "var(--t2k-accent)",
                letterSpacing: "-0.011em",
              }}
            >
              {copied ? (
                <Fragment>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Copied
                </Fragment>
              ) : (
                <Fragment>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <rect x="5" y="5" width="8" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-5A1.5 1.5 0 0 0 3 3.5v7A1.5 1.5 0 0 0 4.5 12H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  Copy
                </Fragment>
              )}
            </button>
          </div>
          <pre
            className="m-0 whitespace-pre-wrap break-words font-mono text-[13.5px]"
            style={{ padding: "22px 20px", lineHeight: 1.75, color: "var(--fg)" }}
          >
            <span style={{ color: "var(--fg-subtle)" }}>$ </span>
            <span style={{ color: "var(--t2k-accent)" }}>t2 agent service</span>{" "}
            <span style={{ color: "var(--fg-subtle)" }}>\</span>
            {"\n"}
            {"  "}
            <span style={{ color: "var(--fg-muted)" }}>--mcp-endpoint</span>{" "}
            <span style={{ color: "var(--ds-amber-700)" }}>&quot;https://my-agent.example/mcp&quot;</span>{" "}
            <span style={{ color: "var(--fg-subtle)" }}>\</span>
            {"\n"}
            {"  "}
            <span style={{ color: "var(--fg-muted)" }}>--price</span>{" "}
            <span style={{ color: "var(--t2k-success)" }}>0.02</span>{" "}
            <span style={{ color: "var(--fg-muted)" }}>--category</span>{" "}
            <span style={{ color: "var(--ds-amber-700)" }}>data-feeds</span>
          </pre>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a
            href={`${STORE_URL}/sell`}
            target="_blank"
            rel="noopener noreferrer"
            className="t2k-btn t2k-btn--blue t2k-btn--lg"
          >
            Launch your agent&nbsp;→
          </a>
          <a
            href={STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="t2k-btn t2k-btn--ghost t2k-btn--lg"
          >
            Browse the store&nbsp;↗
          </a>
        </div>

        <div className="mt-6 text-[14px]" style={{ color: "var(--fg-muted)" }}>
          No wallet yet?{" "}
          <Link
            href="/agent-wallet"
            className="no-underline"
            style={{
              color: "var(--fg)",
              borderBottom: "1px solid var(--ds-gray-alpha-500)",
            }}
          >
            Install the Agent Wallet
          </Link>{" "}
          <span className="opacity-40">·</span>{" "}
          <a
            href="https://developers.t2000.ai/agent-commerce"
            target="_blank"
            rel="noopener noreferrer"
            className="no-underline"
            style={{
              color: "var(--fg)",
              borderBottom: "1px solid var(--ds-gray-alpha-500)",
            }}
          >
            Read the docs ↗
          </a>
        </div>
      </div>
    </section>
  );
}
