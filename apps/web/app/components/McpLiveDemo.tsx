"use client";

import { DemoChat } from "./DemoChat";
import { chatDemos } from "../demo/chatDemoData";

const demo = chatDemos.find((d) => d.id === "chat-whatif") ?? chatDemos[0];

export function McpLiveDemo() {
  return (
    <div className="flex flex-col items-center">
      <DemoChat
        messages={demo.messages}
        title="Claude — t2000 MCP"
        height="380px"
      />
      <p className="text-[10px] text-muted/50 mt-3 text-center">
        Live demo — {demo.title}
      </p>
    </div>
  );
}
