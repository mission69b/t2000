"use client";

// Templates gallery — motionsites-style prompt library (founder direction
// 2026-07-19): image-forward cards with a Copy button on the card, filter
// pills, and a preview modal (left: info + copy full prompt, right: the
// full-page capture of the built result). Every prompt targets t2 code.
import { useEffect, useState } from "react";
import {
  CATEGORY_LABELS,
  T2CODE_CMD,
  TEMPLATES,
  type TemplateEntry,
} from "../../data/templates";
import { CopyButton } from "../ui/CopyButton";

function CardCopy({ payload }: { payload: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label="Copy full prompt"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard?.writeText(payload);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.stopPropagation();
          void navigator.clipboard?.writeText(payload);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }
      }}
      className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12.5px] font-medium transition-colors"
      style={{
        borderColor: copied ? "var(--t2k-success)" : "var(--ds-gray-alpha-400)",
        color: copied ? "var(--t2k-success)" : "var(--fg)",
        background: "var(--ds-gray-alpha-100)",
      }}
    >
      {copied ? (
        "Copied ✓"
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <rect x="5" y="5" width="8" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
            <path
              d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-5A1.5 1.5 0 0 0 3 3.5v7A1.5 1.5 0 0 0 4.5 12H5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
          Copy
        </>
      )}
    </span>
  );
}

function PreviewModal({
  entry,
  onClose,
}: {
  entry: TemplateEntry;
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-10"
      style={{ background: "rgba(0,0,0,0.74)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${entry.name} — preview and prompt`}
    >
      <div
        className="grid h-[82vh] w-full max-w-[980px] overflow-hidden rounded-xl border md:grid-cols-[300px_1fr]"
        style={{ background: "#0B0C0D", borderColor: "var(--ds-gray-alpha-400)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: info panel (motionsites shape) */}
        <div
          className="flex flex-col gap-4 border-b p-6 md:border-r md:border-b-0"
          style={{ borderColor: "var(--ds-gray-alpha-300)" }}
        >
          <div>
            <h2
              className="m-0 text-[19px] font-semibold tracking-tight"
              style={{ color: "var(--fg)" }}
            >
              {entry.name}
            </h2>
            <div className="mt-1 text-[13px]" style={{ color: "var(--fg-subtle)" }}>
              {CATEGORY_LABELS[entry.category]}
            </div>
          </div>
          <p
            className="m-0 text-[13px] leading-relaxed"
            style={{ color: "var(--fg-muted)" }}
          >
            {entry.oneLiner}
          </p>
          <CopyButton payload={entry.prompt} label="Copy full prompt" />
          {entry.deployUrl ? (
            <div className="mt-auto flex flex-col gap-2.5">
              <span className="text-[12px]" style={{ color: "var(--fg-subtle)" }}>
                Paste it into your coding agent to wrap <span style={{ color: "var(--fg)" }}>your</span> API
                — or start from the working template:
              </span>
              <a
                href={entry.deployUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-[12.5px] font-medium no-underline transition-colors"
                style={{
                  borderColor: "var(--ds-gray-alpha-400)",
                  color: "var(--fg)",
                  background: "var(--ds-gray-alpha-100)",
                }}
              >
                <svg width="11" height="11" viewBox="0 0 76 65" fill="currentColor" aria-hidden>
                  <path d="M37.59.25l36.95 64H.64l36.95-64z" />
                </svg>
                Deploy with Vercel
              </a>
            </div>
          ) : (
            <div className="mt-auto flex flex-col gap-2.5">
              <span className="text-[12px]" style={{ color: "var(--fg-subtle)" }}>
                Paste it into <span style={{ color: "var(--fg)" }}>t2 code</span> and it
                builds:
              </span>
              <div
                className="flex items-center justify-between gap-2 rounded-md border py-1.5 pr-1.5 pl-3"
                style={{ background: "var(--ds-gray-alpha-100)", borderColor: "var(--ds-gray-alpha-300)" }}
              >
                <code
                  className="min-w-0 truncate font-mono text-[11.5px]"
                  style={{ color: "var(--fg)" }}
                >
                  <span style={{ color: "var(--fg-subtle)" }}>$ </span>
                  {T2CODE_CMD}
                </code>
                <CopyButton payload={T2CODE_CMD} variant="outlined" />
              </div>
            </div>
          )}
        </div>

        {/* Right: full-page capture (scrolls) or the prompt as fallback */}
        <div className="relative overflow-y-auto" style={{ background: "#0E0F11" }}>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="sticky top-3 z-10 float-right mr-3 flex cursor-pointer items-center justify-center rounded-full border-0 transition-opacity hover:opacity-80"
            style={{ width: 30, height: 30, background: "rgba(0,0,0,0.55)", color: "#fff" }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={entry.image}
            alt={`${entry.name} — full-page preview`}
            className="block w-full"
          />
        </div>
      </div>
    </div>
  );
}

export function TemplatesGallery() {
  const [open, setOpen] = useState<TemplateEntry | null>(null);

  // Small curated set (founder pass 2026-07-20) — no filter pills until the
  // catalog grows enough to need them.
  return (
    <>
      <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {TEMPLATES.map((e) => (
          <div
            key={e.slug}
            role="button"
            tabIndex={0}
            onClick={() => setOpen(e)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") setOpen(e);
            }}
            className="t2k-card t2k-card-hover group flex cursor-pointer flex-col overflow-hidden p-0"
          >
            {/* Preview on top, motionsites-style */}
            <div
              className="relative w-full overflow-hidden"
              style={{ aspectRatio: "4 / 2.9", background: "#0E0F11" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={e.image}
                alt={`${e.name} preview`}
                className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
              />
            </div>
            {/* Bottom bar: name + category left, Copy right */}
            <div className="flex items-center justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0">
                <div
                  className="truncate text-[15px] font-semibold tracking-tight"
                  style={{ color: "var(--fg)" }}
                >
                  {e.name}
                </div>
                <div className="mt-0.5 text-[12px]" style={{ color: "var(--fg-subtle)" }}>
                  {CATEGORY_LABELS[e.category]}
                </div>
              </div>
              <CardCopy payload={e.prompt} />
            </div>
          </div>
        ))}
      </div>

      {open && <PreviewModal entry={open} onClose={() => setOpen(null)} />}
    </>
  );
}
