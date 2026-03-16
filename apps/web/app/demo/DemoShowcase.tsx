"use client";

import { useState } from "react";
import { DemoTerminal } from "../components/DemoTerminal";
import { DemoChat } from "../components/DemoChat";
import { demos } from "./demoData";
import { chatDemos } from "./chatDemoData";

type DemoMode = "cli" | "chat";

export function DemoShowcase() {
  const [mode, setMode] = useState<DemoMode>("chat");
  const [activeCliId, setActiveCliId] = useState(demos[0].id);
  const [activeChatId, setActiveChatId] = useState(chatDemos[0].id);

  const activeCliDemo = demos.find((d) => d.id === activeCliId) ?? demos[0];
  const activeChatDemo =
    chatDemos.find((d) => d.id === activeChatId) ?? chatDemos[0];

  return (
    <div>
      <div className="flex gap-3 mb-8">
        <button
          onClick={() => setMode("chat")}
          className={`px-4 py-2 rounded-lg text-xs font-mono transition-all border ${
            mode === "chat"
              ? "bg-accent/10 text-accent border-accent/30 shadow-[0_0_20px_rgba(0,214,143,0.08)]"
              : "bg-panel text-muted border-border hover:border-border-bright hover:text-foreground"
          }`}
        >
          💬 AI Conversations
        </button>
        <button
          onClick={() => setMode("cli")}
          className={`px-4 py-2 rounded-lg text-xs font-mono transition-all border ${
            mode === "cli"
              ? "bg-accent/10 text-accent border-accent/30 shadow-[0_0_20px_rgba(0,214,143,0.08)]"
              : "bg-panel text-muted border-border hover:border-border-bright hover:text-foreground"
          }`}
        >
          ▸ CLI Commands
        </button>
      </div>

      {mode === "chat" ? (
        <>
          <nav className="flex flex-wrap gap-2 mb-8">
            {chatDemos.map((demo) => (
              <button
                key={demo.id}
                onClick={() => setActiveChatId(demo.id)}
                className={`px-3 py-1.5 rounded text-xs font-mono transition-all border ${
                  activeChatId === demo.id
                    ? "bg-accent/10 text-accent border-accent/30"
                    : "bg-panel text-muted border-border hover:border-border-bright hover:text-foreground"
                }`}
              >
                {demo.title}
              </button>
            ))}
          </nav>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8 items-start">
            <div className="flex justify-center">
              <DemoChat
                key={activeChatId}
                messages={activeChatDemo.messages}
                title="Claude — t2000 MCP"
                height="440px"
              />
            </div>
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-mono text-foreground mb-2">
                  {activeChatDemo.title}
                </h2>
                <p className="text-muted text-sm leading-relaxed">
                  {activeChatDemo.description}
                </p>
              </div>
              <div className="space-y-2">
                <div className="text-[10px] text-muted uppercase tracking-widest">
                  MCP Tools Used
                </div>
                <div className="flex flex-col gap-1.5">
                  {[
                    ...new Set(
                      activeChatDemo.messages
                        .filter((m) => m.tools)
                        .flatMap((m) => m.tools!),
                    ),
                  ].map((tool, i) => (
                    <code
                      key={i}
                      className="text-xs font-mono text-accent/80 bg-accent/5 px-2 py-1 rounded border border-accent/10"
                    >
                      {tool}
                    </code>
                  ))}
                </div>
              </div>
              <div className="text-[10px] text-muted leading-relaxed border-t border-border pt-4">
                Works with Claude Desktop, Cursor, Windsurf, or any MCP-compatible AI.
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <nav className="flex flex-wrap gap-2 mb-8">
            {demos.map((demo) => (
              <button
                key={demo.id}
                onClick={() => setActiveCliId(demo.id)}
                className={`px-3 py-1.5 rounded text-xs font-mono transition-all border ${
                  activeCliId === demo.id
                    ? "bg-accent/10 text-accent border-accent/30"
                    : "bg-panel text-muted border-border hover:border-border-bright hover:text-foreground"
                }`}
              >
                {demo.title}
              </button>
            ))}
          </nav>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8 items-start">
            <div className="flex justify-center">
              <DemoTerminal
                key={activeCliId}
                lines={activeCliDemo.lines}
                title={`${activeCliDemo.title.split("—")[0].trim().toLowerCase()} — terminal`}
                height="440px"
              />
            </div>
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-mono text-foreground mb-2">
                  {activeCliDemo.title}
                </h2>
                <p className="text-muted text-sm leading-relaxed">
                  {activeCliDemo.description}
                </p>
              </div>
              <div className="space-y-2">
                <div className="text-[10px] text-muted uppercase tracking-widest">
                  Commands used
                </div>
                <div className="flex flex-col gap-1.5">
                  {activeCliDemo.lines
                    .filter((l) => l.type === "command")
                    .map((l, i) => (
                      <code
                        key={i}
                        className="text-xs font-mono text-accent/80 bg-accent/5 px-2 py-1 rounded border border-accent/10"
                      >
                        {l.text.replace("❯ ", "")}
                      </code>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
