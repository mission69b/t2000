"use client";
import { useState, type MouseEvent } from "react";

export function CopyChip({
  label,
  payload,
  muted = false,
}: {
  label: string;
  payload: string;
  muted?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = (ev: MouseEvent<HTMLButtonElement>) => {
    ev.stopPropagation();
    void navigator.clipboard.writeText(payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      type="button"
      className={"mpp-ep-chip" + (muted ? " mpp-ep-chip--muted" : "")}
      data-copied={copied ? "true" : "false"}
      onClick={onCopy}
      aria-label={copied ? `Copied ${label} command` : `Copy ${label} command`}
      title={copied ? "Copied" : `Copy ${label}`}
    >
      {copied && (
        <svg className="icon" viewBox="0 0 12 12" fill="none">
          <path
            d="M2.5 6.5 L5 9 L9.5 3.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {label}
    </button>
  );
}
