"use client";

import { useEffect, useState, useRef, useCallback } from "react";

interface TerminalLine {
  type: "command" | "output" | "success" | "info";
  text: string;
  delay: number;
}

const LINES: TerminalLine[] = [
  { type: "command", text: "$ npx t2000 init", delay: 0 },
  { type: "success", text: "  ✓ Wallet created (sponsored · zero cost)", delay: 700 },
  { type: "info", text: "  Address: 0x4e12...480f", delay: 300 },

  { type: "command", text: "$ t2000 send 10 USDC to 0x8b3e...d412", delay: 1200 },
  { type: "success", text: "  ✓ Sent $10.00 USDC → 0x8b3e...d412", delay: 500 },
  { type: "info", text: "  Gas: 0.002 SUI (self-funded)", delay: 200 },

  { type: "command", text: "$ t2000 save 80 USDC", delay: 1200 },
  { type: "success", text: "  ✓ Deposited $80.00 USDC → NAVI Protocol", delay: 600 },
  { type: "info", text: "  APY: 3.79% · Earning ~$0.008/day", delay: 250 },

  { type: "command", text: "$ t2000 borrow 20 USDC", delay: 1200 },
  { type: "success", text: "  ✓ Borrowed $20.00 USDC (same-asset)", delay: 600 },
  { type: "info", text: "  Health Factor: 3.39", delay: 250 },

  { type: "command", text: "$ t2000 swap 5 USDC to SUI", delay: 1200 },
  { type: "success", text: "  ✓ 5.00 USDC → 5.83 SUI", delay: 500 },
  { type: "info", text: "  Impact: 0.05% · Fee: $0.005", delay: 200 },

  { type: "command", text: "$ t2000 repay 20 USDC", delay: 1200 },
  { type: "success", text: "  ✓ Repaid $20.00 USDC · Debt: $0.00", delay: 500 },

  { type: "command", text: "$ t2000 withdraw all", delay: 1200 },
  { type: "success", text: "  ✓ Withdrew $80.00 USDC from NAVI", delay: 500 },

  { type: "command", text: "$ t2000 balance", delay: 1200 },
  { type: "output", text: "  Available:  $85.00 USDC", delay: 400 },
  { type: "output", text: "  Savings:    $0.00", delay: 120 },
  { type: "output", text: "  Gas:        6.31 SUI ✓ auto-managed", delay: 120 },
  { type: "output", text: "  Total:      $107.09", delay: 120 },
];

export function TerminalDemo() {
  const [visibleLines, setVisibleLines] = useState(0);
  const [cycle, setCycle] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const startAnimation = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setVisibleLines(0);

    let totalDelay = 600;
    LINES.forEach((line, i) => {
      totalDelay += line.delay;
      const t = setTimeout(() => setVisibleLines(i + 1), totalDelay);
      timersRef.current.push(t);
    });

    const t = setTimeout(() => setCycle((c: number) => c + 1), totalDelay + 4000);
    timersRef.current.push(t);
  }, []);

  useEffect(() => {
    startAnimation();
    return () => timersRef.current.forEach(clearTimeout);
  }, [cycle, startAnimation]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [visibleLines]);

  return (
    <div className="w-full max-w-2xl mx-auto rounded-xl border border-border bg-[#0D1117] overflow-hidden shadow-2xl shadow-accent/5">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className="h-3 w-3 rounded-full bg-[#FF5F57]" />
        <div className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
        <div className="h-3 w-3 rounded-full bg-[#28C840]" />
        <span className="ml-2 text-xs text-muted font-mono">Terminal</span>
      </div>

      <div
        ref={scrollRef}
        className="p-5 font-mono text-sm leading-7 h-[400px] overflow-y-auto scrollbar-hide"
      >
        {LINES.slice(0, visibleLines).map((line, i) => (
          <div
            key={`${cycle}-${i}`}
            className={`animate-fade-in-up ${
              line.type === "command"
                ? "text-foreground font-semibold mt-3 first:mt-0"
                : line.type === "success"
                ? "text-success"
                : line.type === "info"
                ? "text-muted"
                : "text-foreground/80"
            }`}
          >
            {line.text}
          </div>
        ))}
        {visibleLines < LINES.length && (
          <span className="inline-block w-2 h-5 bg-accent animate-blink ml-0.5 mt-3" />
        )}
      </div>
    </div>
  );
}
