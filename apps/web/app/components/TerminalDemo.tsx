"use client";

import { DemoTerminal } from "./DemoTerminal";
import type { TerminalLine } from "./DemoTerminal";

const LINES: TerminalLine[] = [
  { type: "command", text: "❯ t2000 init", delay: 0 },
  { type: "output", text: "", delay: 400 },
  { type: "output", text: "  Welcome to t2000", delay: 80 },
  { type: "info", text: "  Your personal AI financial advisor", delay: 80 },
  { type: "output", text: "", delay: 80 },
  { type: "info", text: "  Creating agent wallet...", delay: 400 },
  { type: "success", text: "  ✓ Keypair generated", delay: 300 },
  { type: "success", text: "  ✓ Gas sponsorship enabled", delay: 200 },
  { type: "success", text: "  ✓ Checking ✓ Savings ✓ Credit ✓ Exchange ✓ Investment", delay: 300 },
  { type: "info", text: "  🎉 Bank account created", delay: 300 },
  { type: "output", text: "  Address: 0x8b3e...d412", delay: 200 },
  { type: "success", text: "  ✓ Claude connected", delay: 400 },
  { type: "success", text: "  ✓ Telegram connected", delay: 300 },
  { type: "success", text: "  ✓ Safeguards set", delay: 300 },

  { type: "command", text: "❯ t2000 save 80", delay: 1000 },
  { type: "success", text: "  ✓ Saved $80.00 — earning 5.57% APY", delay: 600 },

  { type: "command", text: "❯ t2000 invest buy 5 SUI", delay: 1000 },
  { type: "success", text: "  ✓ Bought 4.85 SUI at $1.03", delay: 600 },

  { type: "command", text: "❯ t2000 balance", delay: 1000 },
  { type: "output", text: "  Available:  $60.00  (checking)", delay: 400 },
  { type: "output", text: "  Savings:    $80.00  (earning 5.57% APY)", delay: 120 },
  { type: "output", text: "  Investment: $5.01   (+0.2%)", delay: 120 },
  { type: "output", text: "  ──────────────────────", delay: 80 },
  { type: "output", text: "  Total:      $145.01", delay: 120 },
];

export function TerminalDemo() {
  return <DemoTerminal lines={LINES} height="420px" title="t2000 — terminal" />;
}
