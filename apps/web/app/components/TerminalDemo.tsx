"use client";

import { DemoTerminal } from "./DemoTerminal";
import type { TerminalLine } from "./DemoTerminal";

const LINES: TerminalLine[] = [
  { type: "command", text: "❯ t2000 init", delay: 0 },
  { type: "output", text: "  Create PIN: ****", delay: 400 },
  { type: "info", text: "  Creating agent wallet...", delay: 500 },
  { type: "success", text: "✓ Bank account created", delay: 400 },
  { type: "output", text: "  Address: 0x8b3e...d412", delay: 200 },

  { type: "command", text: "❯ t2000 save 80", delay: 1200 },
  { type: "success", text: "✓ Saved $80.00 — earning 5.57% APY", delay: 600 },

  { type: "command", text: "❯ t2000 invest buy 5 SUI", delay: 1200 },
  { type: "success", text: "✓ Bought 4.85 SUI at $1.03", delay: 600 },

  { type: "command", text: "❯ t2000 send 25 to alice", delay: 1200 },
  { type: "success", text: "✓ Sent $25.00 USDC → alice", delay: 600 },

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
