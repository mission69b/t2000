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
      className="w-full max-w-[580px] rounded-md overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.2),0_0_80px_rgba(0,214,143,0.04)] cursor-pointer"
      style={{ background: 'var(--terminal-bg)', border: '1px solid var(--terminal-border)' }}
      onClick={handleClick}
    >
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--terminal-border)', background: 'rgba(255,255,255,0.03)' }}>
        <div className="h-[10px] w-[10px] rounded-full bg-[#ff5f57]" />
        <div className="h-[10px] w-[10px] rounded-full bg-[#febc2e]" />
        <div className="h-[10px] w-[10px] rounded-full bg-[#28c840]" />
        <span className="ml-2 text-[11px] font-mono flex-1 text-center tracking-wide" style={{ color: 'var(--n500)' }}>
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
            className="animate-fade-in-up"
            style={{
              color: line.type === "command"
                ? 'var(--terminal-text)'
                : line.type === "success"
                  ? 'var(--accent)'
                  : line.type === "info"
                    ? 'var(--n500)'
                    : 'var(--color-warning)',
              marginTop: line.type === "command" && i > 0 ? '0.25rem' : undefined,
              paddingLeft: line.type === "info" ? '1.25rem' : undefined,
            }}
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
          <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--n500)' }}>
            Click to play
          </div>
        )}
      </div>
    </div>
  );
}
