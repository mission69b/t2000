"use client";

import { DemoTerminal } from "./DemoTerminal";
import type { TerminalLine } from "./DemoTerminal";

const LINES: TerminalLine[] = [
  { type: "command", text: "❯ t2000 init", delay: 0 },
  { type: "output", text: "  ┌─────────────────────────────────────────┐", delay: 400 },
  { type: "output", text: "  │  Welcome to t2000                       │", delay: 80 },
  { type: "output", text: "  │  Your personal AI financial advisor     │", delay: 80 },
  { type: "output", text: "  └─────────────────────────────────────────┘", delay: 80 },
  { type: "success", text: "  ✓ Wallet created · 5 accounts", delay: 400 },
  { type: "success", text: "  ✓ Claude connected", delay: 300 },
  { type: "success", text: "  ✓ Telegram connected", delay: 300 },
  { type: "success", text: "  ✓ Safeguards set", delay: 300 },

  { type: "command", text: "❯ t2000 gateway", delay: 1000 },
  { type: "success", text: "  ✓ WebChat at localhost:2000", delay: 400 },
  { type: "success", text: "  ✓ Heartbeat started (4 tasks)", delay: 300 },
  { type: "success", text: "  ✓ Ready — talk to your agent", delay: 300 },

  { type: "command", text: "❯ t2000 balance", delay: 1200 },
  { type: "output", text: "  Available:   $60.00  (checking)", delay: 400 },
  { type: "output", text: "  Savings:     $80.00  (earning 5.57% APY)", delay: 120 },
  { type: "output", text: "  Investment:  $5.01   (+0.2%)", delay: 120 },
  { type: "output", text: "  ──────────────────────", delay: 80 },
  { type: "output", text: "  Total:       $145.01", delay: 120 },
];

export function TerminalDemo() {
  return <DemoTerminal lines={LINES} height="360px" title="t2000 — terminal" />;
}
