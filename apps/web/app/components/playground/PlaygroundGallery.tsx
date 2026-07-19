"use client";

// Playground gallery — motionsites-style prompt library (founder direction
// 2026-07-19): filter pills, preview cards, and a modal with the full
// copyable build prompt. Every prompt targets t2 code / t2000-auto.
import { useEffect, useState } from "react";
import {
  CATEGORY_LABELS,
  PLAYGROUND,
  T2CODE_CMD,
  type PlaygroundCategory,
  type PlaygroundEntry,
} from "../../data/playground";
import { CopyButton } from "../ui/CopyButton";
import { PlaygroundPreview } from "./PlaygroundPreview";

const FILTERS: Array<{ id: PlaygroundCategory | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "site", label: CATEGORY_LABELS.site },
  { id: "app", label: CATEGORY_LABELS.app },
  { id: "agent", label: CATEGORY_LABELS.agent },
  { id: "component", label: CATEGORY_LABELS.component },
];

function PromptModal({
  entry,
  onClose,
}: {
  entry: PlaygroundEntry;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${entry.name} — full prompt`}
    >
      <div
        className="flex max-h-[86vh] w-full max-w-[860px] flex-col overflow-hidden rounded-xl border"
        style={{ background: "#0B0C0D", borderColor: "var(--ds-gray-alpha-400)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-start justify-between gap-4 border-b px-6 py-5"
          style={{ borderBottomColor: "var(--ds-gray-alpha-300)" }}
        >
          <div>
            <div className="flex items-center gap-2.5">
              <h2
                className="m-0 text-[18px] font-semibold tracking-tight"
                style={{ color: "var(--fg)" }}
              >
                {entry.name}
              </h2>
              <span
                className="rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em]"
                style={{
                  borderColor: "var(--ds-gray-alpha-400)",
                  color: "var(--fg-subtle)",
                }}
              >
                {CATEGORY_LABELS[entry.category]}
              </span>
            </div>
            <p
              className="m-0 mt-1 text-[13px] leading-relaxed"
              style={{ color: "var(--fg-muted)" }}
            >
              {entry.oneLiner}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <CopyButton payload={entry.prompt} label="Copy full prompt" />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex cursor-pointer items-center justify-center rounded border-0 transition-opacity hover:opacity-70"
              style={{
                width: 28,
                height: 28,
                background: "var(--ds-gray-alpha-200)",
                color: "var(--fg-muted)",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2 2l8 8M10 2l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        <pre
          className="m-0 flex-1 overflow-y-auto whitespace-pre-wrap px-6 py-5 font-mono text-[12.5px] leading-[1.7]"
          style={{ color: "var(--fg-muted)" }}
        >
          {entry.prompt}
        </pre>

        <div
          className="flex flex-col gap-2.5 border-t px-6 py-4"
          style={{
            borderTopColor: "var(--ds-gray-alpha-300)",
            background: "var(--ds-gray-alpha-100)",
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[12px]" style={{ color: "var(--fg-subtle)" }}>
              Paste it into <span style={{ color: "var(--fg)" }}>t2 code</span> — the
              free private coding agent — or any agent on t2000/auto.
            </span>
            <div
              className="inline-flex items-center gap-2.5 rounded-md border py-1.5 pr-1.5 pl-3"
              style={{
                background: "#0B0C0D",
                borderColor: "var(--ds-gray-alpha-300)",
              }}
            >
              <code
                className="font-mono text-[12px]"
                style={{ color: "var(--fg)" }}
              >
                <span style={{ color: "var(--fg-subtle)" }}>$ </span>
                {T2CODE_CMD}
              </code>
              <CopyButton payload={T2CODE_CMD} variant="outlined" />
            </div>
          </div>
          {entry.scaffold && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[12px]" style={{ color: "var(--fg-subtle)" }}>
                Prefer a pre-built starter? This one ships as a template:
              </span>
              <div
                className="inline-flex items-center gap-2.5 rounded-md border py-1.5 pr-1.5 pl-3"
                style={{
                  background: "#0B0C0D",
                  borderColor: "var(--ds-gray-alpha-300)",
                }}
              >
                <code className="font-mono text-[12px]" style={{ color: "var(--fg)" }}>
                  <span style={{ color: "var(--fg-subtle)" }}>$ </span>
                  {entry.scaffold}
                </code>
                <CopyButton payload={entry.scaffold} variant="outlined" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PlaygroundGallery() {
  const [filter, setFilter] = useState<PlaygroundCategory | "all">("all");
  const [open, setOpen] = useState<PlaygroundEntry | null>(null);

  const entries =
    filter === "all" ? PLAYGROUND : PLAYGROUND.filter((e) => e.category === filter);

  return (
    <>
      <div className="mt-10 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className="cursor-pointer rounded-full border text-[13px] font-medium transition-colors"
              style={{
                padding: "6px 14px",
                background: active ? "var(--fg)" : "transparent",
                borderColor: active ? "var(--fg)" : "var(--ds-gray-alpha-400)",
                color: active ? "var(--bg)" : "var(--fg-muted)",
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {entries.map((e) => (
          <button
            key={e.slug}
            type="button"
            onClick={() => setOpen(e)}
            className="t2k-card t2k-card-hover group flex cursor-pointer flex-col border text-left"
            style={{ appearance: "none", padding: 0, background: "var(--ds-background-100, transparent)" }}
          >
            <div className="p-5 pb-4">
              <div className="flex items-center justify-between gap-3">
                <span
                  className="text-[17px] font-semibold tracking-tight"
                  style={{ color: "var(--fg)" }}
                >
                  {e.name}
                </span>
                <span
                  className="shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.06em]"
                  style={{
                    borderColor: "var(--ds-gray-alpha-400)",
                    color: "var(--fg-subtle)",
                  }}
                >
                  {CATEGORY_LABELS[e.category]}
                </span>
              </div>
              <p
                className="m-0 mt-1.5 text-[13px] leading-relaxed"
                style={{ color: "var(--fg-muted)" }}
              >
                {e.oneLiner}
              </p>
            </div>
            <div className="mt-auto px-5" style={{ height: 200 }}>
              <PlaygroundPreview slug={e.slug} />
            </div>
            <div
              className="flex items-center justify-between px-5 py-3.5 text-[12px]"
              style={{ color: "var(--fg-subtle)" }}
            >
              <span>
                {e.prompt.length.toLocaleString()} chars ·{" "}
                {e.scaffold ? "prompt + template" : "prompt"}
              </span>
              <span
                className="font-medium transition-colors group-hover:text-[var(--fg)]"
                style={{ color: "var(--fg-muted)" }}
              >
                Copy prompt →
              </span>
            </div>
          </button>
        ))}
      </div>

      {open && <PromptModal entry={open} onClose={() => setOpen(null)} />}
    </>
  );
}
