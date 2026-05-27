"use client";

import { useState } from "react";
import type { StoryItem } from "../../data/t2k";

export function StoryCard({ s }: { s: StoryItem }) {
  const [copied, setCopied] = useState(false);
  const onCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard?.writeText(s.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const isAudric = s.tag.startsWith("AUDRIC");

  return (
    <div className="t2k-card flex flex-col">
      <header
        className="flex items-center justify-between border-b px-[18px] py-3"
        style={{ borderBottomColor: "var(--ds-gray-alpha-300)" }}
      >
        <span
          className="font-mono text-[11px]"
          style={{ color: "var(--fg-subtle)", letterSpacing: "0.06em" }}
        >
          {s.n}
        </span>
        <span
          className={"t2k-mono-tag" + (isAudric ? " t2k-mono-tag--blue" : "")}
          style={{ fontSize: 10, padding: "2px 8px" }}
        >
          {s.tag}
        </span>
      </header>

      <div className="relative px-[18px] pb-3 pt-[18px]">
        <h3
          className="m-0 mb-2 pr-16 text-[18px] font-semibold leading-[1.25]"
          style={{
            letterSpacing: "-0.022em",
            color: "var(--fg)",
          }}
        >
          {s.title}
        </h3>
        <p
          className="m-0 pr-16 text-[13px] leading-[1.5]"
          style={{ color: "var(--fg-muted)" }}
        >
          &ldquo;{s.prompt}&rdquo;
        </p>
        <button
          type="button"
          onClick={onCopy}
          className="absolute right-[18px] top-[18px] cursor-pointer rounded border px-[9px] py-1 font-mono text-[10px] font-medium uppercase tracking-[0.06em] transition-colors"
          style={{
            background: "var(--ds-gray-alpha-100)",
            color: copied ? "var(--t2k-success)" : "var(--fg-muted)",
            borderColor: copied
              ? "var(--t2k-success)"
              : "var(--ds-gray-alpha-400)",
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div
        className="mx-[18px] mb-3 rounded font-mono text-[11.5px] leading-[1.5]"
        style={{
          padding: "10px 12px",
          background: "var(--ds-background-200)",
          border: "1px solid var(--ds-gray-alpha-300)",
          borderLeft: "2px solid var(--t2k-accent)",
          color: "var(--fg-muted)",
        }}
      >
        <span style={{ color: "var(--fg-subtle)", marginRight: 6 }}>▸</span>
        {s.steps[0]}
      </div>

      <div className="flex-1" />

      <footer
        className="flex flex-col gap-1 border-t border-dashed px-[18px] py-3"
        style={{ borderTopColor: "var(--ds-gray-alpha-300)" }}
      >
        <div
          className="text-[12.5px] leading-[1.5]"
          style={{ color: "var(--fg)" }}
        >
          <span style={{ color: "var(--t2k-success)", marginRight: 6 }}>✓</span>
          {s.done}
        </div>
        <span
          className="t2k-tabular font-mono text-[10.5px]"
          style={{ color: "var(--fg-subtle)", letterSpacing: "0.02em" }}
        >
          {s.total}
        </span>
      </footer>
    </div>
  );
}
