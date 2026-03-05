"use client";

import { DemoTerminal } from "./DemoTerminal";
import type { TerminalLine } from "./DemoTerminal";

const LINES: TerminalLine[] = [
  { type: "command", text: "❯ t2000 init", delay: 0 },
  { type: "output", text: "  Create PIN: ****", delay: 400 },
  { type: "info", text: "  Creating agent wallet...", delay: 500 },
  { type: "success", text: "✓ Keypair generated", delay: 400 },
  { type: "success", text: "✓ Network  Sui mainnet", delay: 200 },
  { type: "success", text: "✓ Gas sponsorship  enabled", delay: 200 },
  { type: "info", text: "  Setting up accounts...", delay: 400 },
  { type: "success", text: "✓ Checking  ✓ Savings  ✓ Credit  ✓ Exchange  ✓ 402 Pay", delay: 300 },
  { type: "info", text: "  🎉 Bank account created", delay: 300 },
  { type: "output", text: "  Address: 0x8b3e...d412", delay: 200 },

  { type: "command", text: "❯ t2000 save 80", delay: 1200 },
  { type: "success", text: "✓ Saved $80.00 USDC to best rate", delay: 600 },
  { type: "success", text: "✓ Protocol fee: $0.08 USDC (0.1%)", delay: 200 },
  { type: "success", text: "✓ Current APY: 5.57%", delay: 200 },
  { type: "success", text: "✓ Savings balance: $80.00 USDC", delay: 200 },
  { type: "info", text: "  Tx: suiscan.xyz/mainnet/tx/7CAugsDaPvM...", delay: 200 },

  { type: "command", text: "❯ t2000 borrow 20", delay: 1200 },
  { type: "success", text: "✓ Borrowed $20.00 USDC", delay: 600 },
  { type: "info", text: "  Health Factor:  3.39", delay: 250 },
  { type: "info", text: "  Tx: suiscan.xyz/mainnet/tx/46MX3cMyF4f...", delay: 200 },

  { type: "command", text: "❯ t2000 repay 20", delay: 1200 },
  { type: "success", text: "✓ Repaid $20.00 USDC", delay: 600 },
  { type: "info", text: "  Remaining Debt:  $0.00", delay: 250 },
  { type: "info", text: "  Tx: suiscan.xyz/mainnet/tx/4sKw22wL3mS...", delay: 200 },

  { type: "command", text: "❯ t2000 swap 5 USDC SUI", delay: 1200 },
  { type: "success", text: "✓ Swapped 5 USDC → 5.8300 SUI", delay: 500 },
  { type: "info", text: "  Tx: suiscan.xyz/mainnet/tx/Gxdkrthd7Rd...", delay: 200 },

  { type: "command", text: "❯ t2000 pay https://api.marketdata.dev/prices", delay: 1200 },
  { type: "info", text: "  → GET https://api.marketdata.dev/prices", delay: 300 },
  { type: "info", text: "  ← 402 Payment Required: $0.01 USDC (Sui)", delay: 400 },
  { type: "success", text: "✓ Paid $0.01 USDC (tx: 8kPq3RvN...)", delay: 500 },
  { type: "info", text: "  ← 200 OK  [820ms]", delay: 300 },

  { type: "command", text: "❯ t2000 balance", delay: 1200 },
  { type: "output", text: "  Available:  $85.00 USDC  (checking — spendable)", delay: 400 },
  { type: "output", text: "  Savings:    $80.00 USDC  (earning 5.57% APY)", delay: 120 },
  { type: "output", text: "  Gas:        0.31 SUI     (~$0.28)", delay: 120 },
  { type: "output", text: "  ──────────────────────", delay: 80 },
  { type: "output", text: "  Total:      $165.28 USDC", delay: 120 },
];

export function TerminalDemo() {
  return <DemoTerminal lines={LINES} height="360px" title="t2000 — terminal" />;
}
