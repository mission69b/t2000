"use client";

import { useEffect, useState, useRef } from "react";

export interface TerminalLine {
  type: "command" | "output" | "success" | "info";
  text: string;
  delay: number;
}

interface DemoTerminalProps {
  lines: TerminalLine[];
  title?: string;
  height?: string;
  autoplay?: boolean;
}

export function DemoTerminal({ lines, title = "agent.ts — terminal", height = "360px", autoplay = true }: DemoTerminalProps) {
  const [visibleLines, setVisibleLines] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [paused, setPaused] = useState(!autoplay);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paused) return;

    const timers: ReturnType<typeof setTimeout>[] = [];

    const resetTimer = setTimeout(() => setVisibleLines(0), 0);
    timers.push(resetTimer);

    let totalDelay = 600;
    lines.forEach((_, i) => {
      totalDelay += lines[i].delay;
      timers.push(setTimeout(() => setVisibleLines(i + 1), totalDelay));
    });

    timers.push(
      setTimeout(() => setCycle((c: number) => c + 1), totalDelay + 4000)
    );

    return () => timers.forEach(clearTimeout);
  }, [cycle, lines, paused]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [visibleLines]);

  const handleClick = () => {
    if (paused) {
      setPaused(false);
      setCycle((c) => c + 1);
    }
  };

  return (
    <div
      className="w-full max-w-[580px] bg-panel border border-border-bright rounded-md overflow-hidden shadow-[0_40px_80px_rgba(0,0,0,0.6),0_0_120px_rgba(0,214,143,0.05)] cursor-pointer"
      onClick={handleClick}
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 bg-white/[0.03]">
        <div className="h-[10px] w-[10px] rounded-full bg-[#ff5f57]" />
        <div className="h-[10px] w-[10px] rounded-full bg-[#febc2e]" />
        <div className="h-[10px] w-[10px] rounded-full bg-[#28c840]" />
        <span className="ml-2 text-[11px] text-muted font-mono flex-1 text-center tracking-wide">
          {title}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="p-6 font-mono text-sm leading-7 overflow-y-auto scrollbar-hide"
        style={{ height }}
      >
        {lines.slice(0, visibleLines).map((line, i) => (
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
        {visibleLines >= lines.length && (
          <div className="mt-1">
            <span className="text-accent">❯</span>{" "}
            <span className="inline-block w-2 h-[14px] bg-accent animate-blink align-text-bottom" />
          </div>
        )}
        {visibleLines > 0 && visibleLines < lines.length && (
          <span className="inline-block w-2 h-[14px] bg-accent animate-blink ml-0.5 mt-1" />
        )}
        {paused && visibleLines === 0 && (
          <div className="flex items-center justify-center h-full text-muted text-xs">
            Click to play
          </div>
        )}
      </div>
    </div>
  );
}
