"use client";

import { DemoTerminal } from "./DemoTerminal";
import type { TerminalLine } from "./DemoTerminal";

const LINES: TerminalLine[] = [
  { type: "command", text: "❯ t2000 init", delay: 0 },
  { type: "output", text: "  ┌─────────────────────────────────────────┐", delay: 400 },
  { type: "output", text: "  │  Welcome to t2000                       │", delay: 80 },
  { type: "output", text: "  │  Your personal AI financial advisor     │", delay: 80 },
  { type: "output", text: "  └─────────────────────────────────────────┘", delay: 80 },
  { type: "info", text: "  Creating agent wallet...", delay: 400 },
  { type: "success", text: "  ✓ Keypair generated", delay: 300 },
  { type: "success", text: "  ✓ Gas sponsorship enabled", delay: 200 },
  { type: "success", text: "  ✓ Checking  ✓ Savings  ✓ Credit  ✓ Exchange  ✓ Investment", delay: 300 },
  { type: "info", text: "  🎉 Bank account created", delay: 300 },
  { type: "output", text: "  Address: 0x8b3e...d412", delay: 200 },
  { type: "success", text: "  ✓ Claude connected", delay: 400 },
  { type: "success", text: "  ✓ Telegram connected", delay: 300 },
  { type: "success", text: "  ✓ Safeguards set", delay: 300 },

  { type: "command", text: "❯ t2000 gateway", delay: 1000 },
  { type: "success", text: "  ✓ WebChat at localhost:2000", delay: 400 },
  { type: "success", text: "  ✓ Heartbeat started (4 tasks)", delay: 300 },
  { type: "success", text: "  ✓ Ready — talk to your agent", delay: 300 },
];

export function TerminalDemo() {
  return <DemoTerminal lines={LINES} height="380px" title="t2000 — terminal" />;
}
