"use client";

import { Fragment, useEffect, useRef, useState } from "react";

type OutLine = { t: string; ok?: boolean; muted?: boolean };
type Step = { cmd: string; out: OutLine[] };

const SEQUENCE: Step[] = [
  {
    cmd: "t2 balance",
    out: [{ t: "  USDC      547.20" }, { t: "  USDsui     50.00" }],
  },
  {
    cmd: "t2 send 5 USDC alice.sui",
    out: [{ t: "✓ Sent · gasless · 0.41s", ok: true }],
  },
  {
    cmd: "t2 pay https://mpp.t2000.ai/coingecko/...",
    out: [
      { t: "✓ Paid $0.001 · gasless · 200 OK", ok: true },
      { t: "  { sui: { usd: 4.21 } }", muted: true },
    ],
  },
  {
    cmd: "t2 mcp install",
    out: [{ t: "✓ Claude Desktop · Cursor · Windsurf · ready", ok: true }],
  },
];

export function HeroTerminal() {
  const [step, setStep] = useState(0);
  const [chars, setChars] = useState(0);
  const [showOut, setShowOut] = useState(false);
  const [history, setHistory] = useState<Step[]>([]);
  const reduceMotion = useRef(false);

  useEffect(() => {
    reduceMotion.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
  }, []);

  useEffect(() => {
    const cur = SEQUENCE[step];
    if (chars < cur.cmd.length) {
      const delay = reduceMotion.current ? 0 : 38 + Math.random() * 40;
      const id = setTimeout(() => setChars(chars + 1), delay);
      return () => clearTimeout(id);
    }
    if (!showOut) {
      const id = setTimeout(
        () => setShowOut(true),
        reduceMotion.current ? 0 : 260,
      );
      return () => clearTimeout(id);
    }
    const id = setTimeout(
      () => {
        setHistory((h) => [...h, cur]);
        const next = (step + 1) % SEQUENCE.length;
        if (next === 0) setHistory([]);
        setStep(next);
        setChars(0);
        setShowOut(false);
      },
      reduceMotion.current ? 500 : 1600,
    );
    return () => clearTimeout(id);
  }, [step, chars, showOut]);

  const cur = SEQUENCE[step];

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
        className="flex items-center gap-2 border-b px-3.5 py-2.5"
        style={{
          borderBottomColor: "var(--ds-gray-alpha-300)",
          background: "var(--ds-gray-100)",
        }}
      >
        <span
          className="block h-2.5 w-2.5 rounded-full"
          style={{ background: "#FF5F57" }}
        />
        <span
          className="block h-2.5 w-2.5 rounded-full"
          style={{ background: "#FEBC2E" }}
        />
        <span
          className="block h-2.5 w-2.5 rounded-full"
          style={{ background: "#28C840" }}
        />
        <span
          className="ml-2.5 font-mono text-[12px] tracking-[0.01em]"
          style={{ color: "var(--fg-subtle)" }}
        >
          ~ /agent
        </span>
        <span className="flex-1" />
        <span
          className="inline-flex items-center gap-[7px] font-mono text-[11px]"
          style={{ color: "var(--fg-subtle)" }}
        >
          <span className="t2k-dot" />
          <span>0x7a3b…f29c</span>
        </span>
      </div>

      <pre
        className="m-0 whitespace-pre-wrap font-mono text-[13px] leading-[1.75]"
        style={{
          padding: "18px 16px 18px 18px",
          color: "var(--fg)",
          minHeight: 320,
        }}
      >
        {history.map((h, i) => (
          <Fragment key={i}>
            <div>
              <span style={{ color: "var(--fg-subtle)" }}>$ </span>
              {h.cmd}
            </div>
            {h.out.map((o, j) => (
              <div
                key={j}
                style={{
                  color: o.ok
                    ? "var(--t2k-success)"
                    : o.muted
                      ? "var(--fg-subtle)"
                      : "var(--fg-muted)",
                }}
              >
                {o.t}
              </div>
            ))}
            <div>{"\u00A0"}</div>
          </Fragment>
        ))}
        <div>
          <span style={{ color: "var(--fg-subtle)" }}>$ </span>
          {cur.cmd.slice(0, chars)}
          {!showOut && (
            <span
              className="inline-block align-[-2px]"
              style={{
                width: 8,
                height: 14,
                marginLeft: 1,
                background: "var(--fg)",
                animation: "t2k-cursor 1s steps(2) infinite",
              }}
            />
          )}
        </div>
        {showOut &&
          cur.out.map((o, j) => (
            <div
              key={j}
              style={{
                color: o.ok
                  ? "var(--t2k-success)"
                  : o.muted
                    ? "var(--fg-subtle)"
                    : "var(--fg-muted)",
              }}
            >
              {o.t}
            </div>
          ))}
      </pre>
    </div>
  );
}
