"use client";

import { useEffect, useState } from "react";

type TraceRow =
  | { kind: "user"; text: string }
  | { kind: "model"; text: string }
  | { kind: "guard"; ok: boolean; text: string }
  | { kind: "tool"; text: string; out?: string };

const TRACE: TraceRow[] = [
  { kind: "user", text: "Compound my NAVI rewards and send $20 to sam.sui." },
  { kind: "model", text: "Planning 2 steps. Checking guards…" },
  { kind: "guard", ok: true, text: "spending_limits · within $200/day" },
  { kind: "guard", ok: true, text: "recipient_whitelist · sam.sui resolved" },
  { kind: "tool", text: "pending_rewards()", out: "$42.10 across 3 markets" },
  { kind: "tool", text: "harvest_rewards()", out: "✓ 1 transaction · gasless" },
  { kind: "tool", text: "swap → USDC", out: "merged to $42.10" },
  { kind: "tool", text: "save_to_navi()", out: "deposited $42.10" },
  { kind: "tool", text: "send({ to: 'sam.sui', $20 })", out: "✓ sent · 0.41s" },
  { kind: "model", text: "Compounded $42 · sent $20 · 12s total." },
];

export function EngineHeroTrace() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step >= TRACE.length) {
      const id = setTimeout(() => setStep(0), 2400);
      return () => clearTimeout(id);
    }
    const delay = TRACE[step].kind === "tool" ? 700 : 500;
    const id = setTimeout(() => setStep(step + 1), delay);
    return () => clearTimeout(id);
  }, [step]);

  const visible = TRACE.slice(0, step);

  return (
    <div
      className="overflow-hidden rounded-[10px] border"
      style={{
        background: "var(--ds-background-200)",
        borderColor: "var(--ds-gray-alpha-400)",
        boxShadow:
          "0 0 0 1px rgba(0,114,245,0.10), 0 24px 60px -20px rgba(0,114,245,0.20)",
      }}
    >
      <div
        className="flex items-center gap-2.5 border-b px-3.5 py-2.5"
        style={{
          borderBottomColor: "var(--ds-gray-alpha-300)",
          background: "var(--ds-gray-100)",
        }}
      >
        <span className="t2k-dot" />
        <span
          className="font-mono text-[12px]"
          style={{
            color: "var(--fg)",
            letterSpacing: "0.01em",
          }}
        >
          AISDKEngine
        </span>
        <span
          className="font-mono text-[11px]"
          style={{ color: "var(--fg-subtle)" }}
        >
          · session #4f2a
        </span>
        <span className="flex-1" />
        <span
          className="font-mono text-[10px]"
          style={{
            color: "var(--fg-subtle)",
            letterSpacing: "0.08em",
          }}
        >
          LIVE TRACE
        </span>
      </div>

      <div
        className="flex flex-col gap-2 font-mono text-[12px] leading-[1.55]"
        style={{ padding: "16px 18px", minHeight: 380 }}
      >
        {visible.map((row, i) => (
          <EngineTraceRow key={i} row={row} />
        ))}
        {step < TRACE.length && (
          <span
            className="inline-block"
            style={{
              width: 7,
              height: 13,
              background: "var(--fg-muted)",
              animation: "t2k-cursor 1s steps(2) infinite",
              verticalAlign: "-2px",
            }}
          />
        )}
      </div>
    </div>
  );
}

function EngineTraceRow({ row }: { row: TraceRow }) {
  if (row.kind === "user") {
    return (
      <div
        className="self-end rounded-lg border text-[13.5px]"
        style={{
          padding: "9px 12px",
          background: "var(--ds-gray-200)",
          borderColor: "var(--ds-gray-alpha-300)",
          color: "var(--fg)",
          fontFamily: "var(--font-sans)",
          letterSpacing: "-0.011em",
          maxWidth: "92%",
        }}
      >
        {row.text}
      </div>
    );
  }
  if (row.kind === "model") {
    return (
      <div
        className="text-[13.5px]"
        style={{
          padding: "8px 12px",
          color: "var(--fg)",
          fontFamily: "var(--font-sans)",
          letterSpacing: "-0.011em",
        }}
      >
        <span
          className="mr-1.5 font-mono text-[11px]"
          style={{ color: "var(--t2k-accent)" }}
        >
          model
        </span>
        {row.text}
      </div>
    );
  }
  if (row.kind === "guard") {
    return (
      <div
        className="flex items-center gap-2"
        style={{
          padding: "4px 12px",
          color: "var(--fg-muted)",
        }}
      >
        <span
          style={{
            color: row.ok ? "var(--t2k-success)" : "var(--ds-red-700)",
          }}
        >
          {row.ok ? "✓" : "✗"}
        </span>
        <span
          className="font-mono text-[10.5px]"
          style={{
            color: "var(--ds-amber-700)",
            letterSpacing: "0.06em",
          }}
        >
          GUARD
        </span>
        <span>{row.text}</span>
      </div>
    );
  }
  return (
    <div
      className="flex justify-between gap-3"
      style={{
        padding: "4px 12px",
        color: "var(--fg-muted)",
      }}
    >
      <span>
        <span
          className="mr-1.5"
          style={{ color: "var(--t2k-accent)" }}
        >
          ▸
        </span>
        {row.text}
      </span>
      {row.out && (
        <span
          className="text-[11px]"
          style={{ color: "var(--fg-subtle)" }}
        >
          {row.out}
        </span>
      )}
    </div>
  );
}
