"use client";

import { useEffect, useState } from "react";

interface TerminalLine {
  type: "command" | "output" | "success" | "info";
  text: string;
  delay: number;
}

const LINES: TerminalLine[] = [
  { type: "command", text: "$ t2000 init", delay: 0 },
  { type: "success", text: "  ✓ Wallet created", delay: 600 },
  { type: "info", text: "  Address: 0x4e12...480f", delay: 200 },
  { type: "command", text: "$ t2000 balance", delay: 1200 },
  { type: "output", text: "  Available:  $500.00 USDC", delay: 500 },
  { type: "output", text: "  Savings:    $0.00 USDC", delay: 100 },
  { type: "output", text: "  Gas:        0.12 SUI (~$0.42)", delay: 100 },
  { type: "command", text: "$ t2000 save 200", delay: 1200 },
  { type: "success", text: "  ✓ Saved $200.00 USDC @ 8.2% APY", delay: 800 },
  { type: "command", text: "$ t2000 swap 5 USDC SUI", delay: 1200 },
  { type: "success", text: "  ✓ Swapped $5.00 USDC → 1.43 SUI", delay: 800 },
  { type: "info", text: "  Fee: $0.005 (0.1%)", delay: 200 },
  { type: "command", text: "$ t2000 earnings", delay: 1200 },
  { type: "output", text: "  Saved:       $200.00 USDC", delay: 500 },
  { type: "output", text: "  APY:         8.2%", delay: 100 },
  { type: "output", text: "  Daily Yield: ~$0.0449/day", delay: 100 },
];

export function TerminalDemo() {
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    let totalDelay = 800;
    const timers: ReturnType<typeof setTimeout>[] = [];

    LINES.forEach((line, i) => {
      totalDelay += line.delay;
      timers.push(
        setTimeout(() => setVisibleLines(i + 1), totalDelay)
      );
    });

    // Loop
    timers.push(
      setTimeout(() => setVisibleLines(0), totalDelay + 3000)
    );
    timers.push(
      setTimeout(() => {
        // Reset and replay
        setVisibleLines(0);
      }, totalDelay + 3200)
    );

    return () => timers.forEach(clearTimeout);
  }, [visibleLines === 0 ? Date.now() : 0]);

  return (
    <div className="w-full max-w-2xl rounded-xl border border-border bg-card overflow-hidden shadow-2xl shadow-accent/5">
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className="h-3 w-3 rounded-full bg-red-500/80" />
        <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
        <div className="h-3 w-3 rounded-full bg-green-500/80" />
        <span className="ml-2 text-xs text-muted font-mono">t2000</span>
      </div>

      {/* Terminal content */}
      <div className="p-5 font-mono text-sm leading-7 min-h-[420px]">
        {LINES.slice(0, visibleLines).map((line, i) => (
          <div
            key={i}
            className={`animate-fade-in-up ${
              line.type === "command"
                ? "text-foreground font-semibold mt-2 first:mt-0"
                : line.type === "success"
                ? "text-emerald-400"
                : line.type === "info"
                ? "text-muted"
                : "text-zinc-300"
            }`}
          >
            {line.text}
          </div>
        ))}
        {visibleLines < LINES.length && (
          <span className="inline-block w-2 h-5 bg-accent animate-blink ml-0.5 mt-2" />
        )}
      </div>
    </div>
  );
}
