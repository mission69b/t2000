"use client";

import { useEffect, useState, useRef } from "react";

interface TerminalLine {
  type: "command" | "output" | "success" | "info";
  text: string;
  delay: number;
}

const LINES: TerminalLine[] = [
  { type: "command", text: "❯ t2000 init", delay: 0 },
  {
    type: "success",
    text: "✓ Wallet created (sponsored · zero cost)",
    delay: 700,
  },
  { type: "info", text: "  ✓ Address: 0x4e12...480f", delay: 300 },

  { type: "command", text: "❯ t2000 send 10 USDC to 0x8b3e...d412", delay: 1200 },
  { type: "success", text: "✓ Sent $10.00 USDC → 0x8b3e...d412", delay: 500 },
  { type: "info", text: "  Gas: 0.002 SUI (self-funded)", delay: 200 },

  { type: "command", text: "❯ t2000 save 80 USDC", delay: 1200 },
  {
    type: "success",
    text: "✓ Deposited $80.00 USDC → NAVI Protocol",
    delay: 600,
  },
  { type: "info", text: "  APY: 3.79% · Earning ~$0.008/day", delay: 250 },

  { type: "command", text: "❯ t2000 borrow 20 USDC", delay: 1200 },
  { type: "success", text: "✓ Borrowed $20.00 USDC (same-asset)", delay: 600 },
  { type: "info", text: "  Health Factor: 3.39", delay: 250 },

  { type: "command", text: "❯ t2000 swap 5 USDC to SUI", delay: 1200 },
  { type: "success", text: "✓ 5.00 USDC → 5.83 SUI", delay: 500 },
  { type: "info", text: "  Impact: 0.05% · Fee: $0.005", delay: 200 },

  { type: "command", text: "❯ t2000 pay https://data.api.com/prices", delay: 1200 },
  { type: "info", text: "  402 Payment Required · $0.01 USDC", delay: 400 },
  { type: "success", text: "✓ Paid $0.01 USDC · 200 OK · 820ms", delay: 600 },

  { type: "command", text: "❯ t2000 balance", delay: 1200 },
  { type: "output", text: "  Available:  $85.00 USDC", delay: 400 },
  { type: "output", text: "  Savings:    $80.00", delay: 120 },
  { type: "output", text: "  Gas:        6.31 SUI ✓ auto-managed", delay: 120 },
  { type: "output", text: "  Total:      $168.91", delay: 120 },
];

export function TerminalDemo() {
  const [visibleLines, setVisibleLines] = useState(0);
  const [cycle, setCycle] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    const resetTimer = setTimeout(() => setVisibleLines(0), 0);
    timers.push(resetTimer);

    let totalDelay = 600;
    LINES.forEach((line, i) => {
      totalDelay += line.delay;
      timers.push(setTimeout(() => setVisibleLines(i + 1), totalDelay));
    });

    timers.push(
      setTimeout(() => setCycle((c: number) => c + 1), totalDelay + 4000)
    );

    return () => timers.forEach(clearTimeout);
  }, [cycle]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [visibleLines]);

  return (
    <div className="w-full max-w-[520px] bg-panel border border-border-bright rounded-md overflow-hidden shadow-[0_40px_80px_rgba(0,0,0,0.6),0_0_120px_rgba(0,214,143,0.05)]">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 bg-white/[0.03]">
        <div className="h-[10px] w-[10px] rounded-full bg-[#ff5f57]" />
        <div className="h-[10px] w-[10px] rounded-full bg-[#febc2e]" />
        <div className="h-[10px] w-[10px] rounded-full bg-[#28c840]" />
        <span className="ml-2 text-[11px] text-muted font-mono flex-1 text-center tracking-wide">
          agent.ts — terminal
        </span>
      </div>

      <div
        ref={scrollRef}
        className="p-6 font-mono text-sm leading-7 h-[360px] overflow-y-auto scrollbar-hide"
      >
        {LINES.slice(0, visibleLines).map((line, i) => (
          <div
            key={`${cycle}-${i}`}
            className={`animate-fade-in-up ${
              line.type === "command"
                ? "text-foreground mt-1 first:mt-0"
                : line.type === "success"
                  ? "text-accent"
                  : line.type === "info"
                    ? "text-muted pl-5"
                    : "text-warning"
            }`}
          >
            {line.text}
          </div>
        ))}
        {visibleLines >= LINES.length && (
          <div className="mt-1">
            <span className="text-accent">❯</span>{" "}
            <span className="inline-block w-2 h-[14px] bg-accent animate-blink align-text-bottom" />
          </div>
        )}
        {visibleLines > 0 && visibleLines < LINES.length && (
          <span className="inline-block w-2 h-[14px] bg-accent animate-blink ml-0.5 mt-1" />
        )}
      </div>
    </div>
  );
}
