"use client";

import { useState, useEffect, useRef } from "react";

interface TerminalTab {
  label: string;
  lines: TabLine[];
  disabled?: boolean;
}

interface TabLine {
  text: string;
  color?: "green" | "yellow" | "dim" | "white" | "cyan";
  delay: number;
}

const TABS: TerminalTab[] = [
  {
    label: "Init",
    lines: [
      { text: "$ t2000 init", color: "white", delay: 0 },
      { text: "", delay: 300 },
      { text: "  ┌─────────────────────────────────────────┐", color: "dim", delay: 100 },
      { text: "  │  Welcome to t2000                       │", color: "white", delay: 80 },
      { text: "  │  A bank account for AI agents           │", color: "dim", delay: 80 },
      { text: "  └─────────────────────────────────────────┘", color: "dim", delay: 80 },
      { text: "", delay: 300 },
      { text: "  Creating agent wallet...", color: "dim", delay: 400 },
      { text: "  ✓ Keypair generated", color: "green", delay: 250 },
      { text: "  ✓ Network Sui mainnet", color: "green", delay: 200 },
      { text: "  ✓ Gas sponsorship enabled", color: "green", delay: 200 },
      { text: "", delay: 200 },
      { text: "  Setting up accounts...", color: "dim", delay: 300 },
      { text: "  ✓ Checking  ✓ Savings  ✓ Credit", color: "green", delay: 300 },
      { text: "", delay: 200 },
      { text: "  🎉 Bank account created", color: "green", delay: 300 },
      { text: "  Address: 0x8b3e...d412", color: "yellow", delay: 200 },
      { text: "", delay: 300 },
      { text: "  Adding t2000 to your AI platforms...", color: "dim", delay: 300 },
      { text: "  ✓ Claude Desktop  configured", color: "green", delay: 250 },
      { text: "  ✓ Cursor  configured", color: "green", delay: 200 },
      { text: "", delay: 200 },
      { text: "  ✓ Safeguards configured", color: "green", delay: 300 },
    ],
  },
  {
    label: "Transact",
    lines: [
      { text: "$ t2000 save 80", color: "white", delay: 0 },
      { text: "", delay: 400 },
      { text: "  ✓ Saved $80.00 USDC to best rate", color: "green", delay: 500 },
      { text: "  ✓ Current APY: 5.57%", color: "green", delay: 200 },
      { text: "  ✓ Savings balance: $280.00 USDC", color: "green", delay: 200 },
      { text: "  Tx  suiscan.xyz/tx/3fgh...aTUF", color: "dim", delay: 200 },
      { text: "", delay: 600 },
      { text: "$ t2000 send 25 to alice", color: "white", delay: 800 },
      { text: "", delay: 400 },
      { text: "  ✓ Sent $25.00 USDC → alice (0x7f20...f6dc)", color: "green", delay: 500 },
      { text: "  Gas   0.0012 SUI (sponsored)", color: "dim", delay: 200 },
      { text: "  Balance  $175.00 USDC", color: "dim", delay: 200 },
      { text: "  Tx  suiscan.xyz/tx/9kLm...bR2z", color: "dim", delay: 200 },
    ],
  },
  {
    label: "Balance",
    lines: [
      { text: "$ t2000 balance", color: "white", delay: 0 },
      { text: "", delay: 400 },
      { text: "  Available   $175.00  (checking — USDC)", color: "white", delay: 300 },
      { text: "  Savings     $280.00  (earning 5.57% APY)", color: "white", delay: 150 },
      { text: "  ──────────────────────────────────", color: "dim", delay: 100 },
      { text: "  Total       $455.00", color: "white", delay: 150 },
      { text: "  Earning ~$0.04/day", color: "dim", delay: 200 },
      { text: "", delay: 600 },
      { text: "$ t2000 balance --show-limits", color: "white", delay: 800 },
      { text: "", delay: 400 },
      { text: "  Available   $175.00  (checking — USDC)", color: "white", delay: 300 },
      { text: "  Savings     $280.00  (earning 5.57% APY)", color: "white", delay: 150 },
      { text: "  ──────────────────────────────────", color: "dim", delay: 100 },
      { text: "  Total       $455.00", color: "white", delay: 150 },
      { text: "", delay: 200 },
      { text: "  Limits", color: "white", delay: 200 },
      { text: "    Max withdraw   $280.00 USDC", color: "dim", delay: 150 },
      { text: "    Max borrow     $196.00 USDC", color: "dim", delay: 150 },
      { text: "    Health factor  ∞  (no active loan)", color: "green", delay: 150 },
    ],
  },
  {
    label: "Pay",
    lines: [
      { text: "$ t2000 pay mpp.t2000.ai/openai/chat", color: "white", delay: 0 },
      { text: '  --data \'{"model":"gpt-4o","messages":[...]}\'', color: "dim", delay: 100 },
      { text: "", delay: 400 },
      { text: "  → POST mpp.t2000.ai/openai/chat", color: "dim", delay: 300 },
      { text: "  ✓ Paid via MPP (tx: 7xQm3kLp...)", color: "green", delay: 500 },
      { text: "  ← 200 OK  [342ms]", color: "white", delay: 300 },
      { text: "", delay: 500 },
      { text: "$ t2000 pay mpp.t2000.ai/elevenlabs/tts", color: "white", delay: 800 },
      { text: '  --data \'{"text":"Hello from t2000"}\'', color: "dim", delay: 100 },
      { text: "", delay: 400 },
      { text: "  → POST mpp.t2000.ai/elevenlabs/tts", color: "dim", delay: 300 },
      { text: "  ✓ Paid via MPP (tx: 2nRt8wZq...)", color: "green", delay: 500 },
      { text: "  ← 200 OK  [1204ms]", color: "white", delay: 300 },
      { text: "  Cost: $0.002 USDC", color: "dim", delay: 200 },
    ],
  },
  {
    label: "Receive",
    lines: [
      { text: "$ t2000 receive 25", color: "white", delay: 0 },
      { text: "", delay: 400 },
      { text: "  ✓ Payment link created", color: "green", delay: 500 },
      { text: "", delay: 200 },
      { text: "  Amount    $25.00 USDC", color: "white", delay: 200 },
      { text: "  Link      audric.ai/pay/t2k_8xNm...Qz3f", color: "cyan", delay: 200 },
      { text: "  QR code   saved to ./qr-t2k_8xNm.png", color: "dim", delay: 200 },
      { text: "  Expires   24h", color: "dim", delay: 200 },
      { text: "", delay: 600 },
      { text: "$ t2000 receive 10 --memo \"Coffee\"", color: "white", delay: 800 },
      { text: "", delay: 400 },
      { text: "  ✓ Payment link created", color: "green", delay: 500 },
      { text: "", delay: 200 },
      { text: "  Amount    $10.00 USDC", color: "white", delay: 200 },
      { text: "  Memo      Coffee", color: "white", delay: 150 },
      { text: "  Link      audric.ai/pay/t2k_3kRp...Lm7w", color: "cyan", delay: 200 },
      { text: "  QR code   saved to ./qr-t2k_3kRp.png", color: "dim", delay: 200 },
    ],
  },
];

const COLOR_MAP: Record<string, string> = {
  green: "var(--accent)",
  yellow: "#FEBC2E",
  dim: "var(--n500)",
  white: "var(--foreground)",
  cyan: "#60A5FA",
};

export function TabbedTerminal() {
  const [activeTab, setActiveTab] = useState(0);
  const [visibleLines, setVisibleLines] = useState(0);
  const [cycle, setCycle] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const lines = TABS[activeTab].lines;

  useEffect(() => {
    setVisibleLines(0);
    const timers: ReturnType<typeof setTimeout>[] = [];

    let total = 400;
    lines.forEach((_, i) => {
      total += lines[i].delay;
      timers.push(setTimeout(() => setVisibleLines(i + 1), total));
    });

    timers.push(setTimeout(() => setCycle((c) => c + 1), total + 3500));

    return () => timers.forEach(clearTimeout);
  }, [activeTab, cycle, lines]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [visibleLines]);

  return (
    <div
      className="w-full max-w-[580px] rounded-lg overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      {/* Tab bar */}
      <div
        className="flex items-center gap-0 px-4 py-2.5"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-1.5 mr-4">
          <div className="h-[10px] w-[10px] rounded-full bg-[#ff5f57]" />
          <div className="h-[10px] w-[10px] rounded-full bg-[#febc2e]" />
          <div className="h-[10px] w-[10px] rounded-full bg-[#28c840]" />
        </div>

        <div className="flex gap-1">
          {TABS.map((tab, i) => (
            <button
              key={tab.label}
              onClick={() => { if (!tab.disabled) { setActiveTab(i); setCycle((c) => c + 1); } }}
              className={`px-3.5 py-1 font-mono text-[11px] tracking-wide rounded-sm transition-all ${tab.disabled ? 'cursor-default opacity-40' : 'cursor-pointer'}`}
              style={{
                background: !tab.disabled && i === activeTab ? "var(--n700)" : "transparent",
                color: !tab.disabled && i === activeTab ? "var(--n100)" : "var(--n500)",
                fontWeight: !tab.disabled && i === activeTab ? 600 : 400,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Terminal content */}
      <div
        ref={scrollRef}
        className="p-5 font-mono text-[13px] leading-[1.85] overflow-y-auto scrollbar-hide"
        style={{ height: "380px" }}
      >
        {lines.slice(0, visibleLines).map((line, i) => (
          <div
            key={`${activeTab}-${cycle}-${i}`}
            className="animate-fade-in-up"
            style={{ color: COLOR_MAP[line.color ?? "white"] }}
          >
            {line.text || "\u00A0"}
          </div>
        ))}
        {visibleLines >= lines.length && (
          <div className="mt-0.5">
            <span style={{ color: "var(--accent)" }}>$</span>{" "}
            <span
              className="inline-block w-2 h-[14px] animate-blink align-text-bottom"
              style={{ background: "var(--accent)" }}
            />
          </div>
        )}
      </div>

      {/* Caption */}
      <div
        className="px-5 py-2.5 font-mono text-[10px] tracking-wide text-center"
        style={{ color: "var(--n500)", borderTop: "1px solid var(--border)" }}
      >
        {activeTab === 0 && "One command sets up wallet, MCP, and safeguards"}
        {activeTab === 1 && "Save, send, borrow — all from the terminal"}
        {activeTab === 2 && "Full portfolio view with DeFi positions and limits"}
        {activeTab === 3 && "Pay for any API with USDC — no keys, no signup"}
        {activeTab === 4 && "Generate payment links and QR codes from the CLI"}
      </div>
    </div>
  );
}
