"use client";

import { useState } from "react";

interface CopyButtonProps {
  payload: string;
  variant?: "filled" | "outlined";
  label?: string;
  ariaLabel?: string;
}

export function CopyButton({
  payload,
  variant = "filled",
  label = "Copy",
  ariaLabel,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked — silently no-op
    }
  };

  if (variant === "outlined") {
    return (
      <button
        type="button"
        onClick={onCopy}
        aria-label={ariaLabel ?? (copied ? "Copied" : "Copy")}
        className="cursor-pointer rounded font-mono text-[10.5px] uppercase tracking-[0.06em] transition-colors"
        style={{
          appearance: "none",
          background: "transparent",
          border: `1px solid ${copied ? "var(--t2k-success)" : "var(--ds-gray-alpha-400)"}`,
          padding: "4px 9px",
          color: copied ? "var(--t2k-success)" : "var(--fg-muted)",
        }}
      >
        {copied ? "Copied" : label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={ariaLabel ?? (copied ? "Copied" : "Copy")}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-[5px] border-0 text-[12px] font-medium tracking-tight text-white transition-colors"
      style={{
        padding: "5px 10px 5px 8px",
        background: copied ? "var(--t2k-success)" : "var(--t2k-accent)",
      }}
    >
      {copied ? (
        <>
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
        </>
      ) : (
        <>
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
          {label}
        </>
      )}
    </button>
  );
}
