"use client";

import { DemoTerminal } from "./DemoTerminal";
import type { TerminalLine } from "./DemoTerminal";

const LINES: TerminalLine[] = [
  { type: "command", text: "❯ t2000 init", delay: 0 },
  { type: "output", text: "", delay: 400 },
  { type: "output", text: "  Welcome to t2000", delay: 80 },
  { type: "info", text: "  A bank account for AI agents", delay: 80 },
  { type: "output", text: "", delay: 80 },
  { type: "info", text: "  Creating agent wallet...", delay: 400 },
  { type: "success", text: "  ✓ Keypair generated", delay: 300 },
  { type: "success", text: "  ✓ Gas sponsorship enabled", delay: 200 },
  { type: "success", text: "  ✓ Savings ✓ Pay ✓ Send ✓ Credit ✓ Receive", delay: 300 },
  { type: "info", text: "  🎉 Bank account created", delay: 300 },
  { type: "output", text: "  Address: 0x8b3e...d412", delay: 200 },
  { type: "success", text: "  ✓ Claude connected", delay: 400 },
  { type: "success", text: "  ✓ MCP server ready", delay: 300 },
  { type: "success", text: "  ✓ Safeguards set", delay: 300 },

  { type: "command", text: "❯ t2000 save 80", delay: 1000 },
  { type: "success", text: "  ✓ Saved $80.00 — earning 5.57% APY", delay: 600 },

  { type: "command", text: "❯ t2000 send 10 to alice", delay: 1000 },
  { type: "success", text: "  ✓ Sent $10.00 USDC → alice", delay: 600 },

  { type: "command", text: "❯ t2000 balance", delay: 1000 },
  { type: "output", text: "  Available:  $10.00  (checking)", delay: 400 },
  { type: "output", text: "  Savings:    $80.00  (earning 5.57% APY)", delay: 120 },
  { type: "output", text: "  ──────────────────────", delay: 80 },
  { type: "output", text: "  Total:      $90.00", delay: 120 },
];

export function TerminalDemo() {
  return <DemoTerminal lines={LINES} height="420px" title="t2000 — terminal" />;
}
