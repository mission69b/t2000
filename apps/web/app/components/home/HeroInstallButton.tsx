"use client";

import { useState } from "react";

const INSTALL_PROMPT =
  "Run `curl -sL https://t2000.ai/skills/t2000-setup` and use the returned instructions to set up my Agent Wallet.";

export function HeroInstallButton() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard?.writeText(INSTALL_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Copied" : "Copy install prompt"}
      className={
        "t2k-btn t2k-btn--blue t2k-btn--lg t2k-install-btn" +
        (copied ? " is-copied" : "")
      }
    >
      <span className="prompt">$</span>
      <span>{copied ? "copied — paste into Claude Desktop" : "install with one prompt"}</span>
      <span className="copy-icon" aria-hidden="true">
        {copied ? (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path
              d="M3.5 8.5l3 3 6-7"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
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
        )}
      </span>
    </button>
  );
}
