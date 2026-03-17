"use client";

import { useState } from "react";
import { DemoTerminal } from "./DemoTerminal";
import { DemoChat } from "./DemoChat";
import { demos } from "../demo/demoData";
import { chatDemos } from "../demo/chatDemoData";
import Link from "next/link";

const cliIds = ["save", "invest"];
const chatIds = ["chat-morning", "chat-send", "chat-optimize", "chat-whatif"];

const cliDemos = demos.filter((d) => cliIds.includes(d.id));
const chatList = chatDemos.filter((d) => chatIds.includes(d.id));

type Mode = "chat" | "cli";

export function HomeShowcase() {
  const [mode, setMode] = useState<Mode>("chat");
  const [activeCliId, setActiveCliId] = useState(cliDemos[0]?.id ?? "");
  const [activeChatId, setActiveChatId] = useState(chatList[0]?.id ?? "");

  const activeCli = cliDemos.find((d) => d.id === activeCliId) ?? cliDemos[0];
  const activeChat = chatList.find((d) => d.id === activeChatId) ?? chatList[0];

  return (
    <section className="relative z-1 px-6 sm:px-8 lg:px-20 py-16 sm:py-20 lg:py-24 border-t border-border">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-10 items-end mb-10 sm:mb-14">
        <div>
          <div className="text-[10px] tracking-[0.2em] uppercase text-accent mb-4">
            See it in action
          </div>
          <h2 className="font-serif text-[32px] sm:text-[clamp(32px,4vw,52px)] font-normal leading-[1.1] text-foreground">
            Talk to your money.
            <br />
            <em className="italic text-accent">Watch it work.</em>
          </h2>
        </div>
        <p className="text-muted text-[12px] sm:text-[13px] leading-[1.8] max-w-[400px]">
          Natural language or CLI. Every interaction mirrors the real product.
        </p>
      </div>

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
            {chatList.map((demo) => (
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
                messages={activeChat.messages}
                title="Claude — t2000 MCP"
                height="440px"
              />
            </div>
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-mono text-foreground mb-2">
                  {activeChat.title}
                </h3>
                <p className="text-muted text-sm leading-relaxed">
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

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8 items-start">
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
                <h3 className="text-lg font-mono text-foreground mb-2">
                  {activeCli.title}
                </h3>
                <p className="text-muted text-sm leading-relaxed">
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

      <div className="mt-10 text-center">
        <Link
          href="/demo"
          className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-mono text-accent border border-accent/30 rounded transition-all hover:bg-accent-dim hover:shadow-[0_0_20px_rgba(0,214,143,0.08)]"
        >
          View all demos →
          <span className="text-[10px] text-muted/60">5 AI chats + 5 CLI demos</span>
        </Link>
      </div>
    </section>
  );
}
