import type { TerminalLine } from "../components/DemoTerminal";

export interface Demo {
  id: string;
  title: string;
  description: string;
  tweet: string;
  lines: TerminalLine[];
}

export const demos: Demo[] = [
  {
    id: "save",
    title: "Savings — Earn Yield",
    description: "Deposit idle USDC into savings, earn APY via NAVI Protocol, check earnings.",
    tweet: "Week 2 Monday — Savings feature",
    lines: [
      { type: "command", text: "❯ t2000 rates", delay: 0 },
      { type: "output", text: "  USDC Save APY:    3.31%", delay: 400 },
      { type: "output", text: "  USDC Borrow APY:  5.84%", delay: 150 },

      { type: "command", text: "❯ t2000 balance", delay: 1200 },
      { type: "output", text: "  Available:  $4.00 USDC  (checking — spendable)", delay: 400 },
      { type: "output", text: "  Savings:    $0.00 USDC  (earning 3.31% APY)", delay: 120 },
      { type: "output", text: "  Gas:        1.05 SUI    (~$0.99)", delay: 120 },
      { type: "output", text: "  ──────────────────────────────────────", delay: 80 },
      { type: "output", text: "  Total:      $4.99 USDC", delay: 120 },

      { type: "command", text: "❯ t2000 save 1", delay: 1200 },
      { type: "success", text: "✓ Saved $1.00 USDC to NAVI", delay: 600 },
      { type: "success", text: "✓ Protocol fee: $0.00 USDC (0.1%)", delay: 200 },
      { type: "success", text: "✓ Current APY: 3.31%", delay: 200 },
      { type: "success", text: "✓ Savings balance: $1.00 USDC", delay: 200 },
      { type: "info", text: "  Tx: suiscan.xyz/mainnet/tx/7CAugsDaPvMMXpitDaSDsP...", delay: 200 },

      { type: "command", text: "❯ t2000 earnings", delay: 1200 },
      { type: "output", text: "  Supplied:      $1.00 USDC", delay: 400 },
      { type: "output", text: "  Current APY:   3.31%", delay: 150 },
      { type: "output", text: "  Daily earning: $0.00009", delay: 150 },

      { type: "command", text: "❯ t2000 balance", delay: 1200 },
      { type: "output", text: "  Available:  $3.00 USDC  (checking — spendable)", delay: 400 },
      { type: "output", text: "  Savings:    $1.00 USDC  (earning 3.31% APY)", delay: 120 },
      { type: "output", text: "  Gas:        1.04 SUI    (~$0.98)", delay: 120 },
      { type: "output", text: "  ──────────────────────────────────────", delay: 80 },
      { type: "output", text: "  Total:      $4.98 USDC", delay: 120 },
      { type: "output", text: "  Earning ~$0.00/day", delay: 120 },
    ],
  },
  {
    id: "borrow",
    title: "Credit — Borrow Against Savings",
    description: "Borrow USDC against savings collateral. Health factor enforced on-chain.",
    tweet: "Week 3 Monday — Credit feature",
    lines: [
      { type: "command", text: "❯ t2000 balance", delay: 0 },
      { type: "output", text: "  Available:  $3.00 USDC  (checking — spendable)", delay: 400 },
      { type: "output", text: "  Savings:    $1.00 USDC  (earning 3.31% APY)", delay: 120 },
      { type: "output", text: "  Gas:        1.04 SUI    (~$0.98)", delay: 120 },
      { type: "output", text: "  ──────────────────────────────────────", delay: 80 },
      { type: "output", text: "  Total:      $4.98 USDC", delay: 120 },

      { type: "command", text: "❯ t2000 borrow 0.2", delay: 1200 },
      { type: "success", text: "✓ Borrowed $0.20 USDC", delay: 600 },
      { type: "info", text: "  Health Factor:  4.24", delay: 250 },
      { type: "info", text: "  Tx: suiscan.xyz/mainnet/tx/46MX3cMyF4f8TPKHzs9ZFy...", delay: 200 },

      { type: "command", text: "❯ t2000 health", delay: 1200 },
      { type: "output", text: "  Health Factor:  4.24", delay: 400 },
      { type: "output", text: "  Supplied:       $1.00 USDC", delay: 150 },
      { type: "output", text: "  Borrowed:       $0.20 USDC", delay: 150 },

      { type: "command", text: "❯ t2000 repay all", delay: 1200 },
      { type: "success", text: "✓ Repaid $0.20 USDC", delay: 600 },
      { type: "info", text: "  Remaining Debt:  $0.00", delay: 250 },
      { type: "info", text: "  Tx: suiscan.xyz/mainnet/tx/4sKw22wL3mS27Vt64jaGBY...", delay: 200 },
    ],
  },
  {
    id: "swap",
    title: "Exchange — Swap Tokens",
    description: "Swap between USDC and SUI on Cetus DEX. Free — no protocol fee.",
    tweet: "Week 3 Friday — Exchange feature",
    lines: [
      { type: "command", text: "❯ t2000 balance", delay: 0 },
      { type: "output", text: "  Available:  $4.00 USDC  (checking — spendable)", delay: 400 },
      { type: "output", text: "  Savings:    $1.00 USDC  (earning 3.31% APY)", delay: 120 },
      { type: "output", text: "  Gas:        1.04 SUI    (~$0.98)", delay: 120 },
      { type: "output", text: "  ──────────────────────────────────────", delay: 80 },
      { type: "output", text: "  Total:      $5.98 USDC", delay: 120 },

      { type: "command", text: "❯ t2000 swap 1 USDC SUI", delay: 1200 },
      { type: "info", text: "  Swap:        1 USDC → 1.0610 SUI", delay: 400 },
      { type: "info", text: "  Pool Price:  1 SUI = $0.94", delay: 200 },
      { type: "success", text: "✓ Swapped 1 USDC → 1.0610 SUI", delay: 600 },
      { type: "info", text: "  Tx: suiscan.xyz/mainnet/tx/Gxdkrthd7RdE2SepgwAvr5...", delay: 200 },

      { type: "command", text: "❯ t2000 balance", delay: 1200 },
      { type: "output", text: "  Available:  $3.00 USDC  (checking — spendable)", delay: 400 },
      { type: "output", text: "  Savings:    $1.00 USDC  (earning 3.31% APY)", delay: 120 },
      { type: "output", text: "  Gas:        2.10 SUI    (~$1.97)", delay: 120 },
      { type: "output", text: "  ──────────────────────────────────────", delay: 80 },
      { type: "output", text: "  Total:      $5.97 USDC", delay: 120 },
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard — Full Financial View",
    description: "Balance, rates, earnings, and fund status — your agent's financial dashboard.",
    tweet: "Recurring — Dashboard overview",
    lines: [
      { type: "command", text: "❯ t2000 balance --show-limits", delay: 0 },
      { type: "output", text: "  Available:  $3.00 USDC  (checking — spendable)", delay: 400 },
      { type: "output", text: "  Savings:    $1.00 USDC  (earning 3.31% APY)", delay: 120 },
      { type: "output", text: "  Gas:        1.04 SUI    (~$0.98)", delay: 120 },
      { type: "output", text: "  ──────────────────────────────────────", delay: 80 },
      { type: "output", text: "  Total:      $4.98 USDC", delay: 120 },
      { type: "output", text: "  Earning ~$0.00/day", delay: 120 },
      { type: "output", text: "", delay: 80 },
      { type: "info", text: "  Limits", delay: 200 },
      { type: "output", text: "    Max withdraw:   $1.00 USDC", delay: 150 },
      { type: "output", text: "    Max borrow:     $0.67 USDC", delay: 150 },
      { type: "output", text: "    Health factor:  ∞  (no active loan)", delay: 150 },

      { type: "command", text: "❯ t2000 rates", delay: 1200 },
      { type: "output", text: "  USDC Save APY:    3.31%", delay: 400 },
      { type: "output", text: "  USDC Borrow APY:  5.84%", delay: 150 },

      { type: "command", text: "❯ t2000 earnings", delay: 1200 },
      { type: "output", text: "  Supplied:      $1.00 USDC", delay: 400 },
      { type: "output", text: "  Current APY:   3.31%", delay: 150 },
      { type: "output", text: "  Daily earning: $0.00009", delay: 150 },

      { type: "command", text: "❯ t2000 fund-status", delay: 1200 },
      { type: "output", text: "  Supplied:           $1.00 USDC", delay: 400 },
      { type: "output", text: "  APY:                3.31%", delay: 150 },
      { type: "output", text: "  Earned today:       $0.00", delay: 150 },
      { type: "output", text: "  Earned all time:    $0.00", delay: 150 },
      { type: "output", text: "  Projected monthly:  $0.00", delay: 150 },
    ],
  },
  {
    id: "x402",
    title: "x402 Pay — Machine Payments",
    description: "Pay for API resources with USDC. No API key. No subscription. No human.",
    tweet: "Week 2 Friday — x402 payments",
    lines: [
      { type: "command", text: "❯ t2000 pay https://api.marketdata.dev/prices", delay: 0 },
      { type: "info", text: "  → GET https://api.marketdata.dev/prices", delay: 500 },
      { type: "info", text: "  ← 402 Payment Required: $0.01 USDC (Sui)", delay: 600 },
      { type: "success", text: "✓ Paid $0.01 USDC (tx: 8kPq3RvN...)", delay: 700 },
      { type: "info", text: "  ← 200 OK  [820ms]", delay: 400 },
      { type: "output", text: "", delay: 200 },
      { type: "output", text: '  { "BTC": 97421.50, "ETH": 3201.80, "SUI": 0.94 }', delay: 300 },

      { type: "command", text: "❯ t2000 pay https://api.marketdata.dev/prices --dry-run", delay: 1500 },
      { type: "info", text: "  → GET https://api.marketdata.dev/prices", delay: 500 },
      { type: "info", text: "  ← 402 Payment Required: $0.01 USDC (Sui)", delay: 600 },
      { type: "info", text: "  [dry-run] Would pay $0.01 USDC — skipped", delay: 400 },

      { type: "command", text: "❯ t2000 balance", delay: 1200 },
      { type: "output", text: "  Available:  $3.99 USDC  (checking — spendable)", delay: 400 },
      { type: "output", text: "  Savings:    $1.00 USDC  (earning 3.31% APY)", delay: 120 },
      { type: "output", text: "  Gas:        1.03 SUI    (~$0.97)", delay: 120 },
      { type: "output", text: "  ──────────────────────────────────────", delay: 80 },
      { type: "output", text: "  Total:      $4.96 USDC", delay: 120 },
    ],
  },
];
