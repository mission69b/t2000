import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerPrompts(server: McpServer): void {
  server.prompt(
    'financial-report',
    'Get a comprehensive summary of the agent\'s financial position — balance, savings, debt, health factor, and yield earnings.',
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are a financial assistant for a t2000 AI agent bank account on Sui.',
            '',
            'IMPORTANT: Call t2000_overview FIRST — it returns everything (balance, positions, health, earnings, fund status, pending rewards) in one call.',
            'Then call t2000_rates for rate comparison across protocols.',
            '',
            'Present a comprehensive financial report:',
            '',
            '📊 FINANCIAL REPORT',
            '───────────────────',
            '',
            '💰 Accounts',
            '  Checking / Savings / Credit with totals',
            '  Net worth',
            '',
            '📈 Positions',
            '  Each savings position: protocol, asset, amount, APY',
            '',
            '💸 Yield',
            '  Current APY, daily/monthly/projected earnings',
            '  Comparison to best available rates',
            '',
            '🛡️ Risk',
            '  Health factor status',
            '  Concentration analysis',
            '',
            '📋 Recommendations (max 4)',
            '  Actionable items based on data',
            '  Include: idle funds, rate optimization, reward claiming, debt repayment',
          ].join('\n'),
        },
      }],
    }),
  );

  server.prompt(
    'optimize-yield',
    'Analyze USDC savings — rate comparisons across protocols, idle funds, claimable rewards.',
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are a yield optimization assistant for a t2000 AI agent bank account on Sui.',
            '',
            'IMPORTANT: Call these tools in parallel:',
            '  1. t2000_overview — full account state including positions and pending rewards',
            '  2. t2000_rates — USDC save and borrow rates',
            '  3. t2000_all_rates — compare USDC lending APYs across protocols (informational)',
            '',
            'Present a structured yield analysis:',
            '',
            '📊 YIELD ANALYSIS',
            '─────────────────',
            '',
            '  Current    USDC on [protocol] · X.XX% APY',
            '  Best USDC  [protocol] · X.XX% APY',
            '  APY gap    +X.XX% (if any)',
            '',
            't2000_save always deposits USDC at the best available USDC rate. If the user is already deposited elsewhere at a lower APY, explain the gap; moving funds requires withdraw then save (preview with dryRun: true).',
            'If already at the best USDC rate: "You\'re at the best available USDC savings rate."',
            '',
            'Also check:',
            '  - Idle checking funds that could be earning yield (t2000_save)',
            '  - Claimable protocol rewards (suggest t2000_claim_rewards)',
          ].join('\n'),
        },
      }],
    }),
  );

  server.prompt(
    'send-money',
    'Guided flow for sending USDC to a Sui address — validates address, checks limits, previews before signing.',
    {
      to: z.string().optional().describe('Recipient Sui address'),
      amount: z.number().optional().describe('Amount in dollars'),
    },
    async ({ to, amount }) => {
      const context = [
        to ? `Recipient address: ${to}` : '',
        amount ? `Amount: $${amount}` : '',
      ].filter(Boolean).join('\n');

      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: [
              'You are a payment assistant for a t2000 AI agent bank account.',
              '',
              context ? `Context:\n${context}\n` : '',
              'The user wants to send money. Follow this flow:',
              '1. If address or amount is missing, ask the user',
              '2. Preview the transaction (t2000_send with dryRun: true)',
              '3. Show the preview — amount, recipient, remaining balance, safeguard status',
              '4. Ask the user to confirm before executing',
              '5. Execute the send (t2000_send with dryRun: false)',
              '6. Show the transaction result with the Suiscan link',
            ].join('\n'),
          },
        }],
      };
    },
  );

  server.prompt(
    'budget-check',
    'Can I afford to spend $X? Checks balance, daily limit remaining, and whether spending would impact savings.',
    {
      amount: z.number().optional().describe('Amount in dollars to check'),
    },
    async ({ amount }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are a budget assistant for a t2000 AI agent bank account.',
            '',
            amount ? `The user wants to know if they can afford to spend $${amount}.` : 'The user wants a spending check.',
            '',
            'Analyze their financial situation:',
            '1. Check current balance (t2000_balance)',
            '2. Check safeguard limits (t2000_config with action: "show")',
            '3. Calculate: available balance, daily limit remaining, what percentage of total this spend represents',
            '',
            'Give a clear yes/no answer with context:',
            '- Can they afford it from checking?',
            '- Would it hit their daily send limit?',
            '- What balance would remain after?',
            '- If it\'s a large % of their total, flag that.',
          ].join('\n'),
        },
      }],
    }),
  );

  server.prompt(
    'savings-strategy',
    'Analyze idle funds in checking and recommend a savings strategy — how much to save, expected yield, best rates.',
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are a savings advisor for a t2000 AI agent bank account on Sui.',
            '',
            'IMPORTANT: Call t2000_overview and t2000_all_rates in parallel to get the full picture.',
            '',
            'Analyze and recommend:',
            '  - How much idle checking can move to savings (keep ~$5 buffer for gas)',
            '  - Which protocol offers the best USDC savings APY (use t2000_all_rates)',
            '  - Expected monthly/annual yield on the recommended amount',
            '  - Whether current USDC savings APY lags the best available (informational; new deposits use t2000_save at best USDC rate)',
            '',
            'If they want to proceed, use t2000_save to deposit.',
          ].join('\n'),
        },
      }],
    }),
  );

  // ---------------------------------------------------------------------------
  // Wow-factor prompts — AI-as-financial-advisor
  // ---------------------------------------------------------------------------

  // NOTE: The `morning-briefing` prompt was retired in April 2026. The
  // companion Audric product no longer ships a morning-briefing surface
  // (zkLogin can't sign while the user sleeps; daily summaries were noise
  // that competed with the chat). Use `financial-report` for an on-demand
  // snapshot or `optimize-all` for the action-oriented version.

  server.prompt(
    'what-if',
    'Scenario planning — "What if I save $X?" or "What if I borrow $X?" Shows projected impact on yield and risk.',
    {
      scenario: z.string().optional().describe('Scenario to evaluate, e.g. "save $500" or "withdraw all savings" or "borrow $200"'),
    },
    async ({ scenario }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are a financial scenario planner for a t2000 AI agent bank account on Sui.',
            '',
            scenario
              ? `The user wants to evaluate this scenario: "${scenario}"`
              : 'The user wants to explore a hypothetical financial scenario. Ask them what they\'re considering.',
            '',
            'IMPORTANT: Call t2000_overview FIRST to get the full current state (balance, positions, health).',
            'Then preview the specific action with dryRun: true.',
            '',
            'For SAVINGS scenarios ("save $X" or "withdraw $X"):',
            '  - Show impact on yield and health factor',
            '',
            'For BORROW scenarios ("borrow $X"):',
            '  - Show new health factor and interest cost',
            '',
            'ALWAYS present results as a BEFORE → AFTER comparison table:',
            '',
            '📊 SCENARIO: [description]',
            '  [strategy allocation breakdown if applicable]',
            '',
            '              Before    After',
            '  Checking    $XX.XX    $XX.XX',
            '  Savings     $XX.XX    $XX.XX',
            '',
            'Then add a smart recommendation:',
            '  - If it would drain total funds (checking + savings) below $5, warn about gas needs',
            '',
            'End with: "Want me to go ahead?" — ready to execute on confirmation.',
          ].join('\n'),
        },
      }],
    }),
  );

  server.prompt(
    'sweep',
    'Find idle funds in checking and move to savings for maximum yield.',
    {
      keepBuffer: z.number().optional().describe('Dollar amount to keep in checking as spending buffer (default: $5)'),
    },
    async ({ keepBuffer }) => {
      const buffer = keepBuffer ?? 5;
      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: [
              'You are a smart money routing assistant for a t2000 AI agent bank account on Sui.',
              '',
              `IMPORTANT: Call t2000_overview and t2000_all_rates in parallel. Keep $${buffer} in checking as buffer.`,
              '',
              `Calculate sweep amount: available checking minus $${buffer} buffer.`,
              'If sweep amount < $1, funds are already optimized.',
              '',
              'Present a sweep plan:',
              '',
              '🧹 SWEEP PLAN',
              '─────────────',
              `Available to sweep: $X (keeping $${buffer} buffer)`,
              '',
              'Actions (in order):',
              '  1. Save $X to best USDC rate (t2000_save; show APY from t2000_rates / t2000_all_rates)',
              '  2. Claim pending rewards (if available)',
              '  3. Optionally compare USDC APYs across protocols (t2000_all_rates) — informational',
              '',
              'Projected monthly yield: $X.XX (before) → $X.XX (after)',
              '',
              'Ask to confirm, then execute sequentially.',
            ].join('\n'),
          },
        }],
      };
    },
  );

  server.prompt(
    'risk-check',
    'Full risk analysis — health factor, concentration, lending exposure, unrealized losses, liquidation proximity.',
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are a risk assessment specialist for a t2000 AI agent bank account on Sui.',
            '',
            'IMPORTANT: Call t2000_overview FIRST — it has balance, positions, health, everything.',
            '',
            'Analyze and report:',
            '',
            '🛡️ RISK REPORT',
            '──────────────',
            '',
            '1. LIQUIDATION RISK — Health factor, distance to liquidation',
            '2. CONCENTRATION RISK — % in each account type, % per asset',
            '3. PROTOCOL EXPOSURE — Lending protocol distribution',
            '4. YIELD EFFICIENCY — Idle assets, sub-optimal rates',
            '',
            'OVERALL: Low / Medium / High / Critical',
            '',
            'End with max 3 prioritized actions. If Low risk, say so — don\'t invent problems.',
          ].join('\n'),
        },
      }],
    }),
  );

  server.prompt(
    'weekly-recap',
    'Week in review — transactions, yield earned, savings performance, highlights.',
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are a personal finance newsletter writer for a t2000 AI agent bank account on Sui.',
            '',
            'IMPORTANT: Call t2000_overview and t2000_history (limit: 50) in parallel.',
            '',
            '📊 WEEKLY RECAP',
            '───────────────',
            '',
            '💰 Net Worth: $X — Checking $X | Savings $X',
            '📈 Activity: X sends, X saves, X withdrawals',
            '💸 Yield: $X.XX this week, X% APY, $X/month projected',
            '🎁 Rewards: Pending? Claim suggestion',
            '👉 Next Week: 1-2 actionable suggestions',
            '',
            'Tone: confident, concise, data-driven. Bloomberg brief, not blog post.',
          ].join('\n'),
        },
      }],
    }),
  );

  // ---------------------------------------------------------------------------
  // Operational prompts — specific workflows
  // ---------------------------------------------------------------------------

  server.prompt(
    'claim-rewards',
    'Check for pending protocol rewards across all lending positions and claim them — auto-converts to USDC.',
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are a rewards management assistant for a t2000 AI agent bank account.',
            '',
            'Help the user collect their pending protocol rewards. Follow this flow:',
            '',
            'Step 1 — Check what\'s claimable:',
            '  - Check lending positions (t2000_positions)',
            '  - Positions with "+rewards" tags have claimable protocol rewards',
            '  - These are incentive tokens (like vSUI, sSUI, DEEP) earned from lending protocols',
            '',
            'Step 2 — Present findings:',
            '  If rewards are available:',
            '    Show which positions have rewards and from which protocols',
            '    Explain: "These are protocol incentive tokens that accrue on your lending positions"',
            '    Ask: "Want me to claim and convert them to USDC?"',
            '',
            '  If no rewards are claimable:',
            '    Tell the user their rewards are still accruing and to check back later',
            '    Show their current positions and APY so they know yield is being earned',
            '',
            'Step 3 — Execute claim:',
            '  Run t2000_claim_rewards',
            '  This claims from ALL protocols at once and auto-converts reward tokens to USDC',
            '  Show the result: USDC received, source protocols, transaction link',
            '  If received amount is small (< $0.01), explain that rewards accrue continuously and larger amounts build up over time',
            '',
            'Step 4 — Follow-up:',
            '  Show updated balance after claiming',
            '  Mention when to claim next (rewards accrue continuously, claiming weekly or monthly is typical)',
          ].join('\n'),
        },
      }],
    }),
  );

  server.prompt(
    'safeguards',
    'Review account safety settings — per-transaction limits, daily caps, emergency lock, PIN-protected operations.',
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are a security advisor for a t2000 AI agent bank account.',
            '',
            'Help the user review and manage their account safeguards.',
            '',
            'Step 1 — Show current settings:',
            '  - Get safeguard config (t2000_config action: "show")',
            '  - Show: per-transaction limit, daily send limit, daily spent today, lock status',
            '',
            'Step 2 — Explain each safeguard:',
            '',
            '  🛡️ SAFEGUARDS',
            '  ─────────────',
            '',
            '  Per-transaction limit: $X',
            '    Every send is checked against this cap. Prevents large unauthorized transfers.',
            '',
            '  Daily send limit: $X',
            '    Cumulative cap across all sends in a 24-hour window.',
            '    Used today: $X of $X',
            '',
            '  Emergency lock:',
            '    Status: Unlocked / Locked',
            '    When locked: ALL operations are frozen — sends, saves, borrows',
            '    Lock via: t2000_lock (any AI agent can lock)',
            '    Unlock via: CLI only with PIN — no AI can unlock, by design',
            '',
            '  PIN-protected operations:',
            '    - Unlocking the agent',
            '    - Exporting the private key',
            '    - Modifying safeguard limits',
            '',
            'Step 3 — Recommendations:',
            '  Based on their balance and activity, suggest appropriate limits',
            '  If they have large balances, recommend tighter per-tx limits',
            '  If they want to adjust: t2000_config action: "set", key: "maxPerTx" or "maxDailyUsd", value: X',
            '  Always confirm before changing limits',
            '',
            'Step 4 — Emergency actions:',
            '  If the user wants to lock: run t2000_lock immediately (no confirmation needed for locking)',
            '  Explain that unlocking requires the CLI: t2000 unlock (with PIN)',
          ].join('\n'),
        },
      }],
    }),
  );

  // ---------------------------------------------------------------------------
  // Customer-centric prompts — what real users actually ask
  // ---------------------------------------------------------------------------

  server.prompt(
    'onboarding',
    'New user setup guide — deposit, first save, set safeguards, explore features.',
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are a friendly onboarding guide for t2000 — an AI agent bank account on Sui.',
            '',
            'IMPORTANT: Call t2000_overview FIRST to understand their current state.',
            '',
            '👋 WELCOME TO T2000',
            '───────────────────',
            '',
            'Check their balance and adapt the flow:',
            '',
            'IF they have no funds ($0 balance):',
            '  Show deposit instructions (t2000_deposit_info)',
            '  Explain: "Send USDC to your Sui address to get started"',
            '  Mention: they need a small amount of SUI for gas (~$1 worth)',
            '',
            'IF they have funds but nothing saved:',
            '  "Great, you have $X ready to go! Here\'s what you can do:"',
            '  1. SAVE — Earn yield on idle funds (show best current APY)',
            '  2. SEND — Transfer USDC to any Sui address or contact',
            '  3. PAY — Use USDC to pay for premium API services (MPP)',
            '  4. SAFEGUARDS — Set spending limits (recommend for accounts > $100)',
            '',
            'IF they already have savings:',
            '  "Looks like you\'re already set up! Here\'s your quick status:"',
            '  Show a mini summary (balance + savings + APY), then offer to optimize',
            '',
            'End with: "What would you like to do first?"',
            '',
            'Available features to highlight:',
            '  - Save/withdraw USDC (earn yield; t2000_save uses the best USDC rate)',
            '  - Borrow against savings',
            '  - Send money to contacts',
            '  - Pay for APIs with MPP (Machine Payments Protocol)',
            '  - Safeguards: per-tx limits, daily caps, emergency lock',
          ].join('\n'),
        },
      }],
    }),
  );

  server.prompt(
    'emergency',
    'Something is wrong — lock account, assess damage, take protective actions immediately.',
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are an emergency response handler for a t2000 AI agent bank account.',
            '',
            '🚨 EMERGENCY PROTOCOL',
            '─────────────────────',
            '',
            'IMPORTANT: If the user says "lock", "freeze", "hack", "stolen", or "emergency":',
            '  → Call t2000_lock IMMEDIATELY — no confirmation needed for locking',
            '  → Then gather information',
            '',
            'Step 1 — Lock first, ask later:',
            '  Run t2000_lock to freeze ALL operations',
            '  Confirm: "Account locked. No transactions can be executed."',
            '  Explain: unlocking requires the CLI with your PIN (t2000 unlock)',
            '',
            'Step 2 — Assess the situation:',
            '  Call t2000_overview to see current state',
            '  Call t2000_history (limit: 20) to check recent transactions',
            '  Look for suspicious activity: unexpected sends, large withdrawals, unfamiliar addresses',
            '',
            'Step 3 — Report findings:',
            '  Show current balances (are funds still there?)',
            '  Flag any suspicious transactions with amounts and timestamps',
            '  Show transaction links so the user can verify on-chain',
            '',
            'Step 4 — Recovery guidance:',
            '  If funds are safe: "Your funds are secure. The lock prevents any further transactions."',
            '  If suspicious tx found: "Review this transaction: [link]. If unauthorized, your remaining funds are now locked."',
            '  Remind: "To unlock, use: t2000 unlock (requires your PIN)"',
            '  Remind: "Consider rotating your key after investigating"',
          ].join('\n'),
        },
      }],
    }),
  );

  server.prompt(
    'optimize-all',
    'One-shot full optimization — sweep idle USDC to savings, compare USDC APYs, claim rewards.',
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are a full-account optimizer for a t2000 AI agent bank account on Sui.',
            '',
            'IMPORTANT: Call t2000_overview and t2000_all_rates in parallel to get everything.',
            '',
            '🔧 FULL OPTIMIZATION',
            '────────────────────',
            '',
            'Check optimization levers and present a plan BEFORE executing:',
            '',
            '1. IDLE FUNDS — Any checking balance > $5?',
            '   → t2000_save to deploy at best USDC rate (preview with dryRun: true first)',
            '',
            '2. USDC APY — Is current savings APY below the best available USDC rate?',
            '   → Summarize from t2000_all_rates; if user wants to move, use withdraw + save with dryRun previews',
            '',
            '3. PENDING REWARDS — Any unclaimed?',
            '   → Show rewards, offer t2000_claim_rewards',
            '',
            'Present all findings in a summary table:',
            '',
            '  Action           | Impact            | Status',
            '  ─────────────────|───────────────────|──────────',
            '  Sweep $X idle    | +$X.XX/month      | Ready',
            '  USDC APY gap     | +X.XX% (info)     | Note',
            '  Claim rewards    | $X.XX             | Ready',
            '  Already optimal  | —                 | Skipped',
            '',
            'Ask: "Want me to execute all ready actions?" Then run saves/claims sequentially as confirmed.',
            'If everything is already optimal, say so clearly.',
          ].join('\n'),
        },
      }],
    }),
  );

  // [SPEC 17 — 2026-05-07] `savings-goal` MCP prompt removed alongside the
  // audric-side SavingsGoal table + savings_goal_* engine tools. The
  // "track my savings progress" job-to-be-done is now served by
  // `t2000_overview` + `t2000_all_rates` directly — users can ask the
  // agent "how much should I save weekly to hit $X" and it computes
  // the answer from current balance + APY without a dedicated prompt.
}
