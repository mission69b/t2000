"use client";

import { useState } from "react";
import { CodeTokens, type CodeToken } from "./CodeTokens";

const TABS = [
  { id: "wallet", label: "wallet.ts", sub: "Send · Swap" },
  { id: "payments", label: "payments.ts", sub: "Pay any API" },
  { id: "engine", label: "engine.ts", sub: "Orchestrate" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const SAMPLES: Record<TabId, { file: string; lines: CodeToken[] }> = {
  wallet: {
    file: "wallet.ts",
    lines: [
      { p: "import", c: " { T2000 } from " },
      { s: "'@t2000/sdk'" },
      { p: ";\n" },
      { c: "\n" },
      { p: "const", c: " t = " },
      { p: "new", c: " " },
      { type: "T2000", c: "();\n\n" },
      { co: "// gasless USDC + USDsui sends\n" },
      { p: "await", c: " t.send({\n" },
      { c: "  to: " },
      { s: "'alice.sui'" },
      { c: ",\n  amount: " },
      { n: "10" },
      { c: ",\n  asset: " },
      { s: "'USDC'" },
      { c: ",\n});\n\n" },
      { co: "// route through Cetus\n" },
      { p: "await", c: " t.swap({\n" },
      { c: "  from: " },
      { s: "'SUI'" },
      { c: ", to: " },
      { s: "'USDC'" },
      { c: ", amount: " },
      { n: "50" },
      { c: " });" },
    ],
  },
  payments: {
    file: "payments.ts",
    lines: [
      { p: "import", c: " { T2000 } from " },
      { s: "'@t2000/sdk'" },
      { p: ";\n" },
      { c: "\n" },
      { p: "const", c: " t = " },
      { p: "new", c: " " },
      { type: "T2000", c: "();\n\n" },
      { co: "// hit any MPP endpoint — no API key\n" },
      { p: "const", c: " r = " },
      { p: "await", c: " t.pay({\n" },
      { c: "  url: " },
      { s: "'mpp.t2000.ai/openai/v1/chat/completions'" },
      { c: ",\n  body: { model: " },
      { s: "'gpt-4o'" },
      { c: ", messages },\n" },
      { c: "});\n\n" },
      { co: "// quote.amount = $0.01\n" },
      { co: "// settled gasless · ~400ms\n" },
      { p: "return", c: " r.json();" },
    ],
  },
  engine: {
    file: "engine.ts",
    lines: [
      { p: "import", c: " { T2000 } from " },
      { s: "'@t2000/sdk'" },
      { p: ";\n" },
      { p: "import", c: " { WRITE_TOOL_SET, buildInternalContext } from " },
      { s: "'@t2000/engine'" },
      { p: ";\n" },
      { p: "import", c: " { Experimental_Agent as Agent } from " },
      { s: "'ai'" },
      { p: ";\n\n" },
      { p: "const", c: " agent = " },
      { p: "new", c: " " },
      { type: "Agent", c: "({\n" },
      { c: "  tools: " },
      { type: "WRITE_TOOL_SET", c: ",\n" },
      { c: "  experimental_context: " },
      { fn: "buildInternalContext", c: "({ wallet: " },
      { p: "new", c: " " },
      { type: "T2000", c: "() }),\n});\n\n" },
      { co: "// 26 tools · 12 safety guards\n" },
      { p: "await", c: " agent." },
      { fn: "stream", c: "({ prompt: " },
      { s: "'Compound my NAVI rewards.'" },
      { c: " });" },
    ],
  },
};

export function SdkHeroCode() {
  const [tab, setTab] = useState<TabId>("wallet");
  const current = SAMPLES[tab];

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
        className="flex border-b"
        style={{
          borderBottomColor: "var(--ds-gray-alpha-300)",
          background: "var(--ds-gray-100)",
        }}
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="relative cursor-pointer border-0 font-mono text-[12px] tracking-[0.01em] transition-colors"
              style={{
                appearance: "none",
                borderRight: "1px solid var(--ds-gray-alpha-300)",
                background: active ? "var(--ds-background-200)" : "transparent",
                color: active ? "var(--fg)" : "var(--fg-subtle)",
                padding: "10px 18px",
              }}
            >
              {active && (
                <span
                  className="absolute left-0 right-0"
                  style={{
                    bottom: -1,
                    height: 2,
                    background: "var(--t2k-accent)",
                  }}
                />
              )}
              {t.label}
              <span
                className="ml-2 text-[11px]"
                style={{ color: "var(--fg-faint)" }}
              >
                · {t.sub}
              </span>
            </button>
          );
        })}
        <span className="flex-1" />
      </div>

      <pre
        className="m-0 whitespace-pre-wrap font-mono text-[12.5px] leading-[1.75]"
        style={{
          padding: "18px 18px 22px",
          color: "var(--fg)",
          minHeight: 400,
        }}
      >
        <CodeTokens tokens={current.lines} />
      </pre>
    </div>
  );
}
