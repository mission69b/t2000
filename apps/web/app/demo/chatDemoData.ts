import type { ChatMessage } from "../components/DemoChat";

export interface ChatDemo {
  id: string;
  title: string;
  description: string;
  messages: ChatMessage[];
}

const tbl = (rows: [string, string, string?][]) =>
  `<table style="width:100%;border-collapse:collapse">${rows
    .map(
      ([k, v, cls]) =>
        `<tr><td style="padding:4px 0;font-size:11px;color:rgba(255,255,255,0.35);width:120px;border-bottom:1px solid rgba(255,255,255,0.04)">${k}</td><td style="padding:4px 0;font-size:11px;font-weight:500;border-bottom:1px solid rgba(255,255,255,0.04);${cls === "hi" ? "color:#00d68f;font-weight:600" : cls === "red" ? "color:#ff4757;font-weight:600" : ""}">${v}</td></tr>`,
    )
    .join("")}</table>`;

const note = (t: string) =>
  `<div style="margin-top:8px;color:rgba(255,255,255,0.3);font-size:10px;line-height:1.5">${t}</div>`;

export const chatDemos: ChatDemo[] = [
  {
    id: "chat-morning",
    title: "Morning Briefing",
    description:
      "Balances, yield, portfolio, and action items — one prompt.",
    messages: [
      { role: "user", text: "Good morning — how's my account?", delay: 0 },
      { role: "thinking", delay: 400 },
      {
        role: "ai",
        tools: ["t2000_balance", "t2000_earnings", "t2000_portfolio", "t2000_health"],
        html:
          `<div style="font-size:11px;font-weight:600;margin-bottom:10px">☀️ MORNING BRIEFING</div>` +
          tbl([
            ["Checking", "$69.60", ""],
            ["Savings", "$9.26 · 4.15% APY", ""],
            ["Credit", "-$1.00", "red"],
            ["Investment", "$5.01 · +0.1%", "hi"],
            ["Net Worth", "$82.87", "hi"],
          ]) +
          `<div style="margin-top:10px;font-size:11px;font-weight:600">📋 Action Items</div>` +
          note("1. $69.60 idle in checking — consider sweeping to savings<br>2. Repay $1.00 credit to stop accruing 7.67% interest<br>3. Pending DCA run — execute with <span style='color:#e8e6e0'>t2000 invest auto run</span>"),
        delay: 300,
      },
    ],
  },

  {
    id: "chat-payday",
    title: "I Just Got Paid",
    description:
      "AI allocates across savings, investments, and debt automatically.",
    messages: [
      { role: "user", text: "I just got paid $500. What should I do with it?", delay: 0 },
      { role: "thinking", delay: 400 },
      {
        role: "ai",
        tools: ["t2000_balance", "t2000_health", "t2000_rates", "t2000_portfolio"],
        html:
          `<div style="font-size:11px;font-weight:600;margin-bottom:10px">💰 ALLOCATION PLAN — $500</div>` +
          tbl([
            ["1. Repay credit", "$1.00 → eliminate 7.67% interest", "red"],
            ["2. Save", "$300.00 → NAVI · 4.86% APY", "hi"],
            ["3. Invest", "$150.00 → all-weather strategy", "hi"],
            ["4. Keep buffer", "$49.00 → checking", ""],
          ]) +
          note("• Repay first — debt costs more than savings earn<br>• 60% savings — stable yield<br>• 30% investment — diversified growth<br>• 10% buffer — spending money"),
        delay: 300,
      },
      { role: "user", text: "Perfect — execute all of it", delay: 800 },
      { role: "thinking", delay: 400 },
      {
        role: "ai",
        tools: ["t2000_repay", "t2000_save", "t2000_strategy"],
        html: tbl([
          ["✓ Repaid", "$1.00 — debt cleared", "hi"],
          ["✓ Saved", "$300.00 → NAVI · 4.86% APY", "hi"],
          ["✓ Invested", "$150.00 → all-weather (BTC/ETH/SUI/GOLD)", "hi"],
          ["Checking", "$49.00 remaining", ""],
        ]) + note("All done. Earning on $359 in savings + $155 in investments."),
        delay: 300,
      },
    ],
  },

  {
    id: "chat-send",
    title: "Send Money",
    description:
      "Send by name with preview and safeguard enforcement.",
    messages: [
      { role: "user", text: "Send $25 to alice", delay: 0 },
      { role: "thinking", delay: 400 },
      {
        role: "ai",
        tools: ["t2000_contacts", "t2000_send"],
        html:
          tbl([
            ["To", "alice → 0x8b3e…d412", ""],
            ["Amount", "$25.00 USDC", "hi"],
            ["Balance After", "$44.60", ""],
          ]) +
          note("Shall I send it?"),
        delay: 300,
      },
      { role: "user", text: "Yes", delay: 600 },
      { role: "thinking", delay: 400 },
      {
        role: "ai",
        tools: ["t2000_send"],
        html: tbl([
          ["Sent", "$25.00 USDC → alice", "hi"],
          ["Tx", '<span style="color:#4a90e2">suiscan.xyz/tx/Gd2n…</span>', ""],
        ]),
        delay: 300,
      },
      { role: "user", text: "Send $600 to bob", delay: 800 },
      { role: "thinking", delay: 300 },
      {
        role: "ai",
        tools: ["t2000_send"],
        html:
          `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span style="font-weight:600;font-size:12px;color:#ff4757">🛡️ Blocked by safeguard</span>
          </div>` +
          tbl([
            ["Reason", "Exceeds per-transaction limit", "red"],
            ["Requested", "$600.00", ""],
            ["Max per tx", "$500.00", "hi"],
          ]),
        delay: 300,
      },
    ],
  },

  {
    id: "chat-whatif",
    title: "What If — Scenarios",
    description:
      "Preview any financial decision before committing.",
    messages: [
      {
        role: "user",
        text: "What if I invest $200 in the all-weather strategy?",
        delay: 0,
      },
      { role: "thinking", delay: 400 },
      {
        role: "ai",
        tools: ["t2000_balance", "t2000_portfolio", "t2000_strategy"],
        html:
          `<div style="font-size:11px;font-weight:600;margin-bottom:10px">📊 SCENARIO: $200 in all-weather</div>` +
          `<div style="font-size:10px;color:rgba(255,255,255,0.35);margin-bottom:6px">BTC 30% · ETH 20% · SUI 20% · GOLD 30%</div>` +
          `<table style="width:100%;border-collapse:collapse">
            <tr style="border-bottom:1px solid rgba(255,255,255,0.06)">
              <td style="padding:4px 0;font-size:10px;color:rgba(255,255,255,0.3);width:100px"></td>
              <td style="padding:4px 0;font-size:10px;color:rgba(255,255,255,0.3);width:100px">Before</td>
              <td style="padding:4px 0;font-size:10px;color:rgba(255,255,255,0.3)">After</td>
            </tr>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
              <td style="padding:4px 0;font-size:11px;color:rgba(255,255,255,0.35)">Checking</td>
              <td style="padding:4px 0;font-size:11px">$69.60</td>
              <td style="padding:4px 0;font-size:11px;color:#ff4757">-$130.40</td>
            </tr>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
              <td style="padding:4px 0;font-size:11px;color:rgba(255,255,255,0.35)">Investment</td>
              <td style="padding:4px 0;font-size:11px">$5.01</td>
              <td style="padding:4px 0;font-size:11px;color:#00d68f">$205.01</td>
            </tr>
          </table>` +
          note("⚠️ You'd need to withdraw $130 from savings. Consider $50 instead — keeps savings intact."),
        delay: 300,
      },
      { role: "user", text: "Good point. Do $50 instead.", delay: 800 },
      { role: "thinking", delay: 400 },
      {
        role: "ai",
        tools: ["t2000_strategy"],
        html: tbl([
          ["Strategy", "all-weather · $50.00", "hi"],
          ["BTC", "0.00016 @ $96,420", ""],
          ["ETH", "0.00945 @ $2,119", ""],
          ["SUI", "9.71 @ $1.03", ""],
          ["Tx", '<span style="color:#4a90e2">suiscan.xyz/tx/BKYu…</span>', ""],
        ]),
        delay: 300,
      },
    ],
  },

  {
    id: "chat-optimize",
    title: "Optimize Yield",
    description:
      "Find a better rate and rebalance in one conversation.",
    messages: [
      { role: "user", text: "Am I getting the best yield?", delay: 0 },
      { role: "thinking", delay: 400 },
      {
        role: "ai",
        tools: ["t2000_positions", "t2000_rates", "t2000_rebalance"],
        html:
          `<div style="font-size:11px;font-weight:600;margin-bottom:10px">📊 YIELD ANALYSIS</div>` +
          tbl([
            ["Current", "USDC on NAVI · 4.86% APY", ""],
            ["Best available", "suiUSDT on NAVI · 5.37% APY", "hi"],
            ["APY gain", "+0.51%", "hi"],
            ["Break-even", "6 days", ""],
          ]) +
          note("Better rate available. Want me to rebalance?"),
        delay: 300,
      },
      { role: "user", text: "Do it", delay: 600 },
      { role: "thinking", delay: 400 },
      {
        role: "ai",
        tools: ["t2000_rebalance"],
        html: tbl([
          ["Rebalanced", "$9.26 USDC → suiUSDT", "hi"],
          ["New APY", "5.37%", "hi"],
          ["Tx", '<span style="color:#4a90e2">suiscan.xyz/tx/HgXg…</span>', ""],
        ]) + note("Now earning at the best available rate."),
        delay: 300,
      },
    ],
  },
];
