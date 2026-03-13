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
      "Start your day with a personalized financial snapshot — balances, overnight yield, portfolio performance, and action items. The AI gathers data from 6 tools and delivers a concise briefing.",
    messages: [
      { role: "user", text: "Good morning — how's my account?", delay: 0 },
      { role: "thinking", delay: 400 },
      {
        role: "ai",
        tools: ["t2000_balance", "t2000_earnings", "t2000_portfolio", "t2000_health", "t2000_auto_invest"],
        html:
          `<div style="font-size:11px;font-weight:600;margin-bottom:10px">☀️ MORNING BRIEFING</div>` +
          tbl([
            ["Checking", "$69.60", ""],
            ["Savings", "$9.26 · 4.15% APY", ""],
            ["Credit", "-$1.00", "red"],
            ["Investment", "$5.01 · +0.1%", "hi"],
            ["Net Worth", "$82.87", "hi"],
          ]) +
          `<div style="margin-top:10px;font-size:11px;font-weight:600">📈 Portfolio</div>` +
          tbl([
            ["SUI", "4.85 tokens · +$0.02 (+0.4%)", "hi"],
            ["Yield", "2.61% APY via Suilend", ""],
          ]) +
          `<div style="margin-top:10px;font-size:11px;font-weight:600">📋 Action Items</div>` +
          note("1. $69.60 idle in checking — consider sweeping to savings<br>2. Pending DCA run — execute with <span style='color:#e8e6e0'>t2000 invest auto run</span><br>3. Repay $1.00 credit to stop accruing 7.67% interest"),
        delay: 300,
      },
    ],
  },

  {
    id: "chat-sweep",
    title: "Sweep — Idle Fund Optimizer",
    description:
      "AI finds money sitting idle in checking and routes it to the highest-earning positions — keeping a spending buffer. Like a financial autopilot.",
    messages: [
      { role: "user", text: "Sweep my idle funds — keep $20 buffer", delay: 0 },
      { role: "thinking", delay: 400 },
      {
        role: "ai",
        tools: ["t2000_balance", "t2000_rates", "t2000_portfolio"],
        html:
          `<div style="font-size:11px;font-weight:600;margin-bottom:10px">🧹 SWEEP PLAN</div>` +
          tbl([
            ["Idle in checking", "$69.60", ""],
            ["Keep buffer", "$20.00", ""],
            ["Available to sweep", "$49.60", "hi"],
          ]) +
          `<div style="margin-top:10px;font-size:11px;font-weight:500">Recommended moves:</div>` +
          tbl([
            ["1. Save $49.60", "→ NAVI · 4.86% APY", "hi"],
            ["Projected", "+$2.41/year · ~$0.20/month", ""],
            ["2. Earn on SUI", "→ already earning 2.61%", "hi"],
          ]) +
          note("Monthly yield jumps from $0.03 → $0.23. Want me to execute?"),
        delay: 300,
      },
      { role: "user", text: "Yes, do it", delay: 800 },
      { role: "thinking", delay: 400 },
      {
        role: "ai",
        tools: ["t2000_save"],
        html: tbl([
          ["Saved", "$49.60 USDC → NAVI", "hi"],
          ["APY", "4.86%", ""],
          ["Tx", '<span style="color:#4a90e2">suiscan.xyz/tx/7CAu…</span>', ""],
        ]) + note("Done. You're now earning on $58.86 total savings."),
        delay: 300,
      },
    ],
  },

  {
    id: "chat-whatif",
    title: "What If — Scenario Planning",
    description:
      "Model the impact of any financial decision before committing. The AI previews allocation changes, risk exposure, and projected outcomes.",
    messages: [
      {
        role: "user",
        text: "What if I invest $200 in the bluechip strategy?",
        delay: 0,
      },
      { role: "thinking", delay: 400 },
      {
        role: "ai",
        tools: ["t2000_balance", "t2000_portfolio", "t2000_strategy"],
        html:
          `<div style="font-size:11px;font-weight:600;margin-bottom:10px">📊 SCENARIO: Invest $200 in bluechip</div>` +
          `<div style="font-size:10px;color:rgba(255,255,255,0.35);margin-bottom:6px">BTC 40% · ETH 40% · SUI 20%</div>` +
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
            <tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
              <td style="padding:4px 0;font-size:11px;color:rgba(255,255,255,0.35)">Allocation</td>
              <td style="padding:4px 0;font-size:11px">6% invested</td>
              <td style="padding:4px 0;font-size:11px">71% invested</td>
            </tr>
          </table>` +
          note("⚠️ You'd need to withdraw $130.40 from savings to cover this. That drops your savings buffer and earning capacity. Consider $50 instead — keeps savings intact."),
        delay: 300,
      },
      { role: "user", text: "Good point. Do $50 in bluechip instead.", delay: 800 },
      { role: "thinking", delay: 400 },
      {
        role: "ai",
        tools: ["t2000_strategy"],
        html: tbl([
          ["Strategy", "bluechip · $50.00", "hi"],
          ["BTC", "0.00028 @ $71,326", ""],
          ["ETH", "0.00945 @ $2,119", ""],
          ["SUI", "9.71 @ $1.03", ""],
          ["Tx", '<span style="color:#4a90e2">suiscan.xyz/tx/BKYu…</span>', ""],
        ]) + note("Invested. Enable yield with: t2000 invest earn SUI"),
        delay: 300,
      },
    ],
  },

  {
    id: "chat-risk",
    title: "Risk Check",
    description:
      "Full risk analysis — liquidation proximity, concentration risk, protocol exposure, unrealized losses. The AI rates your overall risk and suggests fixes.",
    messages: [
      { role: "user", text: "Am I at risk? Run a full check.", delay: 0 },
      { role: "thinking", delay: 400 },
      {
        role: "ai",
        tools: ["t2000_balance", "t2000_health", "t2000_positions", "t2000_portfolio"],
        html:
          `<div style="font-size:11px;font-weight:600;margin-bottom:10px">🛡️ RISK REPORT</div>` +
          tbl([
            ["Health Factor", "7.85 (healthy)", "hi"],
            ["Liquidation Risk", "Very low — collateral 8× debt", "hi"],
            ["Concentration", "93% stablecoins · 7% SUI", ""],
            ["Protocol Exposure", "NAVI 55% · Suilend 45%", ""],
            ["Unrealized P&L", "+$0.02 on SUI position", "hi"],
          ]) +
          `<div style="margin-top:10px;font-size:11px;font-weight:600;color:#00d68f">Overall: LOW RISK ✓</div>` +
          note("Portfolio is conservative and well-distributed across protocols. Only suggestion: repay the $1.00 credit line to eliminate interest accrual."),
        delay: 300,
      },
    ],
  },

  {
    id: "chat-send",
    title: "Send Money — Natural Language",
    description:
      "Send money by just saying who and how much. The AI resolves contacts, previews the transaction, and asks for confirmation before executing.",
    messages: [
      { role: "user", text: "Send $25 to alice", delay: 0 },
      { role: "thinking", delay: 400 },
      {
        role: "ai",
        tools: ["t2000_contacts", "t2000_send"],
        html:
          `<div style="font-size:10px;color:rgba(255,255,255,0.3);margin-bottom:8px">Preview — not yet sent</div>` +
          tbl([
            ["To", "alice → 0x8b3e…d412", ""],
            ["Amount", "$25.00 USDC", "hi"],
            ["Balance After", "$44.60", ""],
            ["Daily Limit", "$25 of $1,000 used", ""],
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
          ["Balance", "$44.60 USDC", ""],
          ["Tx", '<span style="color:#4a90e2">suiscan.xyz/tx/Gd2n…</span>', ""],
        ]),
        delay: 300,
      },
    ],
  },

  {
    id: "chat-dca",
    title: "DCA Advisor",
    description:
      "Tell the AI your monthly budget and it recommends the optimal DCA strategy — frequency, asset allocation, and projected accumulation.",
    messages: [
      {
        role: "user",
        text: "I want to invest $100/month. What do you recommend?",
        delay: 0,
      },
      { role: "thinking", delay: 400 },
      {
        role: "ai",
        tools: ["t2000_balance", "t2000_portfolio", "t2000_strategy", "t2000_auto_invest"],
        html:
          `<div style="font-size:11px;font-weight:600;margin-bottom:10px">📅 DCA RECOMMENDATION</div>` +
          `<div style="font-size:10px;color:rgba(255,255,255,0.3);margin-bottom:8px">Based on your $100/month budget and current portfolio</div>` +
          tbl([
            ["Strategy", "bluechip (BTC 40%, ETH 40%, SUI 20%)", "hi"],
            ["Frequency", "Weekly · $25/week", ""],
            ["Why weekly?", "Smoother averaging in volatile markets", ""],
          ]) +
          `<div style="margin-top:10px;font-size:11px;font-weight:500">12-month projection:</div>` +
          tbl([
            ["Total invested", "$1,200", ""],
            ["Weekly buys", "48 trades, fully automated", "hi"],
            ["If prices flat", "$1,200 accumulated", ""],
            ["Benefit", "Removes timing risk and emotion", ""],
          ]) +
          note("You can afford this — $100/month leaves $69+ in checking. Want me to set it up?"),
        delay: 300,
      },
      { role: "user", text: "Set it up", delay: 800 },
      { role: "thinking", delay: 400 },
      {
        role: "ai",
        tools: ["t2000_auto_invest"],
        html: tbl([
          ["Created", "$25/week → bluechip", "hi"],
          ["First run", "Feb 24, 2026", ""],
          ["Status", "Active ✓", "hi"],
        ]) + note("DCA is live. Runs automatically every Monday. Check anytime with: t2000 invest auto status"),
        delay: 300,
      },
    ],
  },
];
