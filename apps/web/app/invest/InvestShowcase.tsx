"use client";

import { useState } from "react";
import { DemoTerminal } from "../components/DemoTerminal";
import { DemoChat } from "../components/DemoChat";
import { demos } from "../demo/demoData";
import { chatDemos } from "../demo/chatDemoData";

const investCliIds = ["invest", "strategy"];
const investChatIds = ["chat-whatif", "chat-dca", "chat-payday", "chat-morning"];

const cliDemos = demos.filter((d) => investCliIds.includes(d.id));
const chatDemoList = chatDemos.filter((d) => investChatIds.includes(d.id));

type DemoMode = "chat" | "cli";

export function InvestShowcase() {
  const [mode, setMode] = useState<DemoMode>("chat");
  const [activeCliId, setActiveCliId] = useState(cliDemos[0]?.id ?? "");
  const [activeChatId, setActiveChatId] = useState(chatDemoList[0]?.id ?? "");

  const activeCli = cliDemos.find((d) => d.id === activeCliId) ?? cliDemos[0];
  const activeChat =
    chatDemoList.find((d) => d.id === activeChatId) ?? chatDemoList[0];

  return (
    <section className="py-16 sm:py-24 border-b border-border">
      <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
        See it in action
      </div>
      <h2 className="font-serif text-[28px] sm:text-[clamp(28px,3.5vw,42px)] font-normal leading-[1.1] text-foreground mb-3 tracking-tight">
        Try it. <em className="italic text-accent">Live.</em>
      </h2>
      <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[520px] mb-8">
        Natural language or CLI. Every demo mirrors the real product.
      </p>

      <div className="flex gap-3 mb-6">
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
            {chatDemoList.map((demo) => (
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

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8 items-start">
            <div className="flex justify-center">
              <DemoChat
                key={activeChatId}
                messages={activeChat.messages}
                title="Claude — t2000 MCP"
                height="440px"
              />
            </div>
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-mono text-foreground mb-2">
                  {activeChat.title}
                </h3>
                <p className="text-muted text-xs leading-relaxed">
                  {activeChat.description}
                </p>
              </div>
              <div className="space-y-2">
                <div className="text-[10px] text-muted uppercase tracking-widest">
                  MCP Tools Used
                </div>
                <div className="flex flex-col gap-1.5">
                  {[
                    ...new Set(
                      activeChat.messages
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
            </div>
          </div>
        </>
      ) : (
        <>
          <nav className="flex flex-wrap gap-2 mb-8">
            {cliDemos.map((demo) => (
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

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8 items-start">
            <div className="flex justify-center">
              <DemoTerminal
                key={activeCliId}
                lines={activeCli.lines}
                title={`${activeCli.title.split("—")[0].trim().toLowerCase()} — terminal`}
                height="440px"
              />
            </div>
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-mono text-foreground mb-2">
                  {activeCli.title}
                </h3>
                <p className="text-muted text-xs leading-relaxed">
                  {activeCli.description}
                </p>
              </div>
              <div className="space-y-2">
                <div className="text-[10px] text-muted uppercase tracking-widest">
                  Commands used
                </div>
                <div className="flex flex-col gap-1.5">
                  {activeCli.lines
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
    </section>
  );
}
