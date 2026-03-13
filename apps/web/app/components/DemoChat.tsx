"use client";

import { useEffect, useState, useRef } from "react";

export interface ChatMessage {
  role: "user" | "ai" | "thinking";
  text?: string;
  html?: string;
  tools?: string[];
  error?: boolean;
  delay: number;
}

interface DemoChatProps {
  messages: ChatMessage[];
  title?: string;
  height?: string;
  autoplay?: boolean;
}

export function DemoChat({
  messages,
  title = "Claude — t2000 MCP",
  height = "440px",
  autoplay = true,
}: DemoChatProps) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [paused, setPaused] = useState(!autoplay);
  const [showThinking, setShowThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paused) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setVisibleCount(0), 0));

    let total = 600;
    messages.forEach((msg, i) => {
      total += msg.delay;

      if (msg.role === "thinking") {
        const thinkStart = total;
        timers.push(setTimeout(() => setShowThinking(true), thinkStart));
        total += 1200;
        timers.push(setTimeout(() => setShowThinking(false), total));
      } else {
        timers.push(setTimeout(() => setVisibleCount(i + 1), total));
      }
    });

    timers.push(
      setTimeout(() => setCycle((c) => c + 1), total + 5000),
    );

    return () => timers.forEach(clearTimeout);
  }, [cycle, messages, paused]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [visibleCount, showThinking]);

  const handleClick = () => {
    if (paused) {
      setPaused(false);
      setCycle((c) => c + 1);
    }
  };

  const rendered = messages.slice(0, visibleCount).filter((m) => m.role !== "thinking");

  return (
    <div
      className="w-full max-w-[580px] bg-[#080a0f] border border-border-bright rounded-xl overflow-hidden shadow-[0_40px_80px_rgba(0,0,0,0.6),0_0_80px_rgba(0,214,143,0.03)] cursor-pointer"
      onClick={handleClick}
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 bg-white/[0.02]">
        <div className="h-[10px] w-[10px] rounded-full bg-[#ff5f57]" />
        <div className="h-[10px] w-[10px] rounded-full bg-[#febc2e]" />
        <div className="h-[10px] w-[10px] rounded-full bg-[#28c840]" />
        <span className="ml-2 text-[11px] text-muted font-mono flex-1 text-center tracking-wide">
          {title}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="p-5 overflow-y-auto scrollbar-hide flex flex-col gap-4"
        style={{ height }}
      >
        {rendered.map((msg, i) => (
          <div
            key={`${cycle}-${i}`}
            className={`animate-fade-in-up flex gap-2.5 ${
              msg.role === "user" ? "justify-end" : "items-start"
            }`}
          >
            {msg.role === "ai" && (
              <div className="w-7 h-7 rounded-lg bg-panel border border-border-bright flex items-center justify-center text-accent text-xs font-semibold flex-shrink-0 mt-0.5">
                t
              </div>
            )}

            <div className={msg.role === "user" ? "max-w-[72%]" : "max-w-[80%] flex flex-col gap-1.5"}>
              {msg.role === "ai" && msg.tools && msg.tools.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {msg.tools.map((tool, j) => {
                    const failed = tool.startsWith("✕");
                    return (
                      <span
                        key={j}
                        className={`font-mono text-[10px] px-2 py-0.5 rounded ${
                          failed
                            ? "bg-danger/10 text-danger"
                            : "bg-accent/10 text-accent"
                        }`}
                      >
                        {failed ? tool.slice(2) : tool}
                      </span>
                    );
                  })}
                </div>
              )}

              <div
                className={
                  msg.role === "user"
                    ? "bg-accent text-black rounded-2xl rounded-br-sm px-4 py-2.5 text-[13px] font-mono font-medium shadow-[0_2px_16px_rgba(0,214,143,0.12)]"
                    : `bg-panel border rounded-2xl rounded-tl-sm px-4 py-3 text-[12px] font-mono leading-[1.7] ${
                        msg.error
                          ? "border-danger/20 bg-danger/[0.04]"
                          : "border-border"
                      }`
                }
              >
                {msg.html ? (
                  <div dangerouslySetInnerHTML={{ __html: msg.html }} />
                ) : (
                  msg.text
                )}
              </div>
            </div>
          </div>
        ))}

        {showThinking && (
          <div className="animate-fade-in-up flex gap-2.5 items-start">
            <div className="w-7 h-7 rounded-lg bg-panel border border-border-bright flex items-center justify-center text-accent text-xs font-semibold flex-shrink-0 mt-0.5">
              t
            </div>
            <div className="flex gap-1 py-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}

        {paused && visibleCount === 0 && (
          <div className="flex items-center justify-center h-full text-muted text-xs">
            Click to play
          </div>
        )}
      </div>
    </div>
  );
}
