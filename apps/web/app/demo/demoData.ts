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
    id: "invest",
    title: "Invest — Buy, Earn & Sell",
    description:
      "Buy crypto, earn yield while holding, track P&L, sell. Four commands.",
    tweet: "t2000 invest — buy, earn yield, track P&L, sell.",
    lines: [
      { type: "command", text: "❯ t2000 buy 5 SUI", delay: 0 },
      { type: "success", text: "  ✓ Bought 4.8500 SUI at $1.03", delay: 600 },
      { type: "info", text: "  Invested:  $5.00", delay: 200 },
      { type: "info", text: "  Tx:  suiscan.xyz/mainnet/tx/Kx9fVw3nRt...", delay: 200 },

      { type: "command", text: "❯ t2000 invest earn SUI", delay: 1200 },
      { type: "success", text: "  ✓ SUI deposited into Suilend (2.61% APY)", delay: 600 },
      { type: "info", text: "  Amount:  4.8500 SUI", delay: 200 },
      { type: "info", text: "  Tx:  suiscan.xyz/mainnet/tx/7CAugsDaPvMM...", delay: 200 },

      { type: "command", text: "❯ t2000 portfolio", delay: 1200 },
      { type: "output", text: "  Investment Portfolio", delay: 400 },
      { type: "info", text: "  ─────────────────────────────────────────────────────────────────", delay: 80 },
      { type: "output", text: "  SUI:  4.8500    Avg: $1.03    Now: $1.05    +$0.10 (+2.0%)    2.61% APY (Suilend)", delay: 200 },
      { type: "info", text: "", delay: 80 },
      { type: "success", text: "  Unrealized P&L:  +$0.10 (+2.0%)", delay: 150 },

      { type: "command", text: "❯ t2000 sell all SUI", delay: 1200 },
      { type: "success", text: "  ✓ Sold 4.8500 SUI at $1.05", delay: 600 },
      { type: "success", text: "  Realized P&L:  +$0.10", delay: 150 },
      { type: "info", text: "  Tx:  suiscan.xyz/mainnet/tx/Mv2pRs8kLw...", delay: 200 },
    ],
  },

  {
    id: "save",
    title: "Savings — Earn Yield",
    description:
      "Deposit USDC, auto-select the best rate, earn APY.",
    tweet: "t2000 save — idle money, now earning.",
    lines: [
      { type: "command", text: "❯ t2000 rates", delay: 0 },
      { type: "success", text: "  Best yield: 4.86% APY (USDC on NAVI)", delay: 400 },
      { type: "output", text: "", delay: 80 },
      { type: "output", text: "  USDC", delay: 150 },
      { type: "info", text: "  ─────────────────────────────────────────────────────", delay: 80 },
      { type: "info", text: "  NAVI:  Save 4.86%  Borrow 7.67%", delay: 150 },
      { type: "info", text: "  Suilend:  Save 2.61%  Borrow 5.58%", delay: 150 },

      { type: "command", text: "❯ t2000 save 80", delay: 1200 },
      { type: "success", text: "  ✓ Saved $80.00 USDC to best rate", delay: 600 },
      { type: "success", text: "  ✓ Current APY: 4.86%", delay: 200 },
      { type: "info", text: "  Tx:  suiscan.xyz/mainnet/tx/7CAugsDaPvMMXpitDaSDsP...", delay: 200 },

      { type: "command", text: "❯ t2000 balance", delay: 1200 },
      { type: "output", text: "  Available:  $20.00  (checking — spendable)", delay: 400 },
      { type: "output", text: "  Savings:  $79.92  (earning 4.86% APY)", delay: 120 },
      { type: "info", text: "  ──────────────────────────────────────", delay: 80 },
      { type: "output", text: "  Total:  $99.92", delay: 120 },
      { type: "info", text: "  Earning ~$0.01/day", delay: 120 },
    ],
  },

  {
    id: "safeguards",
    title: "Safeguards — Spending Controls",
    description:
      "Per-tx limits, daily caps, emergency lock. Enforced before chain.",
    tweet: "t2000 safeguards — spending limits for autonomous agents.",
    lines: [
      { type: "command", text: "❯ t2000 config set maxPerTx 500", delay: 0 },
      { type: "success", text: "  ✓ Set maxPerTx = 500", delay: 400 },

      { type: "command", text: "❯ t2000 config set maxDailySend 1000", delay: 800 },
      { type: "success", text: "  ✓ Set maxDailySend = 1000", delay: 400 },

      { type: "command", text: "❯ t2000 send 1000 USDC to 0x40cd...3e62", delay: 1200 },
      { type: "output", text: "  ✗ Amount $1000.00 exceeds per-transaction limit ($500.00)", delay: 500 },

      { type: "command", text: "❯ t2000 lock", delay: 1200 },
      { type: "success", text: "  ✓ Agent locked. All operations frozen.", delay: 400 },
      { type: "info", text: "  Run: t2000 unlock  (requires PIN)", delay: 200 },

      { type: "command", text: "❯ t2000 save 100", delay: 1000 },
      { type: "output", text: "  ✗ Agent is locked. All operations are frozen.", delay: 500 },

      { type: "command", text: "❯ t2000 unlock", delay: 1200 },
      { type: "success", text: "  ✓ Agent unlocked. Operations resumed.", delay: 400 },
    ],
  },

  {
    id: "pay",
    title: "Pay — MPP Payments",
    description:
      "Pay for any MPP-protected API. 402 challenge, Sui USDC payment, content delivered.",
    tweet: "t2000 pay — your agent pays for APIs with USDC on Sui.",
    lines: [
      { type: "command", text: "❯ t2000 pay https://mpp.t2000.ai/openai/v1/chat/completions --data '{\"model\":\"gpt-4o\",...}' --max-price 0.10", delay: 0 },
      { type: "info", text: "  → POST https://mpp.t2000.ai/openai/v1/chat/completions", delay: 400 },
      { type: "info", text: "  ← 402 Payment Required", delay: 600 },
      { type: "info", text: "  Amount: $0.01 USDC · Recipient: 0x7a2f…c1b8", delay: 300 },
      { type: "info", text: "  $0.01 ≤ $0.10 max — paying...", delay: 400 },
      { type: "info", text: "  Building Sui USDC transfer...", delay: 300 },
      { type: "success", text: "  ✓ Paid $0.01 USDC", delay: 600 },
      { type: "info", text: "  Tx: suiscan.xyz/mainnet/tx/7xK2m9fQ3...", delay: 200 },
      { type: "info", text: "  → Retrying with x-payment-credential...", delay: 400 },
      { type: "success", text: "  ← 200 OK (1.2s)", delay: 500 },
      { type: "output", text: "", delay: 80 },
      { type: "output", text: "  {", delay: 100 },
      { type: "output", text: '    "choices": [{"message":{"content":"Hello! ..."}}],', delay: 100 },
      { type: "output", text: '    "model": "gpt-4o",', delay: 100 },
      { type: "output", text: '    "usage": {"total_tokens": 42}', delay: 100 },
      { type: "output", text: "  }", delay: 100 },
    ],
  },

  {
    id: "init",
    title: "Init — Setup in 30 Seconds",
    description:
      "Wallet, MCP, safeguards — one wizard. Your AI has a bank account.",
    tweet: "t2000 init — zero to bank account in 30 seconds.",
    lines: [
      { type: "command", text: "❯ t2000 init", delay: 0 },

      { type: "output", text: "  Step 1 of 3 — Create wallet", delay: 400 },
      { type: "info", text: "  Creating agent wallet...", delay: 400 },
      { type: "success", text: "  ✓ Keypair generated", delay: 300 },
      { type: "success", text: "  ✓ Network  Sui mainnet", delay: 200 },
      { type: "success", text: "  ✓ Gas sponsorship  enabled", delay: 200 },
      { type: "success", text: "  ✓ Checking  ✓ Savings  ✓ Credit  ✓ Swap  ✓ Invest", delay: 300 },
      { type: "output", text: "  🎉 Bank account created", delay: 300 },
      { type: "output", text: "  Address: 0x8b3e...d412", delay: 200 },

      { type: "info", text: "", delay: 400 },
      { type: "output", text: "  Step 2 of 3 — Connect AI platforms", delay: 400 },
      { type: "info", text: "  Adding t2000 to your AI platforms...", delay: 300 },
      { type: "success", text: "  ✓ Claude Desktop  configured", delay: 400 },
      { type: "success", text: "  ✓ Cursor  configured", delay: 300 },

      { type: "info", text: "", delay: 400 },
      { type: "output", text: "  Step 3 of 3 — Set safeguards", delay: 400 },
      { type: "success", text: "  ✓ Safeguards configured", delay: 300 },

      { type: "info", text: "", delay: 300 },
      { type: "success", text: "  ✓ You're all set", delay: 300 },
      { type: "info", text: "  Restart Claude Desktop / Cursor to activate", delay: 200 },
    ],
  },
];
