"use client";

import { useEffect, useState, useRef, useCallback } from "react";

interface TerminalLine {
  type: "command" | "output" | "success" | "info";
  text: string;
  delay: number;
}

const LINES: TerminalLine[] = [
  { type: "command", text: "$ npx t2000 init", delay: 0 },
  { type: "success", text: "  ✓ Wallet created (sponsored)", delay: 700 },
  { type: "info", text: "  ✓ Address: 0x4a7f...c291", delay: 300 },
  { type: "command", text: "$ t2000 send 10 USDC to 0x8b3e...d412", delay: 1400 },
  { type: "success", text: "  ✓ Auto-topped up gas reserve ($1 USDC → SUI)", delay: 600 },
  { type: "success", text: "  ✓ Sent $10.00 USDC → 0x8b3e...d412", delay: 400 },
  { type: "info", text: "  ✓ Gas: 0.002 SUI (self-funded)", delay: 200 },
  { type: "command", text: "$ t2000 save 79 USDC", delay: 1400 },
  { type: "success", text: "  ✓ $79.00 USDC → savings (8.2% APY)", delay: 700 },
  { type: "info", text: "  ✓ Earning ~$0.018/day", delay: 300 },
  { type: "command", text: "$ t2000 balance", delay: 1400 },
  { type: "output", text: "  Available:    $9.92 USDC", delay: 500 },
  { type: "output", text: "  Savings:      $79.00 USDC (8.2% APY)", delay: 150 },
  { type: "output", text: "  Gas reserve:  0.28 SUI ✓ auto-managed", delay: 150 },
  { type: "output", text: "  Total:        $89.90", delay: 150 },
];

export function TerminalDemo() {
  const [visibleLines, setVisibleLines] = useState(0);
  const [cycle, setCycle] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

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

  return (
    <div className="w-full max-w-2xl mx-auto rounded-xl border border-border bg-[#0D1117] overflow-hidden shadow-2xl shadow-accent/5">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className="h-3 w-3 rounded-full bg-[#FF5F57]" />
        <div className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
        <div className="h-3 w-3 rounded-full bg-[#28C840]" />
        <span className="ml-2 text-xs text-muted font-mono">Terminal</span>
      </div>

      <div className="p-5 font-mono text-sm leading-7 min-h-[440px]">
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
