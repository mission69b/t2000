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
            'IMPORTANT: Call t2000_overview FIRST — it returns everything (balance, positions, portfolio, health, earnings, fund status, pending rewards) in one call.',
            'Then call t2000_rates for rate comparison across protocols.',
            '',
            'Present a comprehensive financial report:',
            '',
            '📊 FINANCIAL REPORT',
            '───────────────────',
            '',
            '💰 Accounts',
            '  Checking / Savings / Credit / Investment with totals',
            '  Net worth',
            '',
            '📈 Positions',
            '  Each savings position: protocol, asset, amount, APY',
            '  Each investment position: asset, amount, cost basis, current value, P&L',
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
    'Analyze savings and investment earning positions — rate comparisons, rebalancing opportunities across protocols.',
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
            '  2. t2000_rates — all available rates across protocols',
            '  3. t2000_rebalance (dryRun: true) — preview savings optimization',
            '',
            'Present a structured yield analysis:',
            '',
            '📊 YIELD ANALYSIS',
            '─────────────────',
            '',
            '  Current    [asset] on [protocol] · X.XX% APY',
            '  Best       [asset] on [protocol] · X.XX% APY',
            '  APY gain   +X.XX%',
            '  Break-even X days',
            '',
            'If a better rate exists: "Better rate available. Want me to rebalance?"',
            'If already optimal: "You\'re at the best available rate."',
            '',
            'Also check:',
            '  - Idle checking funds that could be earning yield',
            '  - Investment assets not in lending (could use t2000_invest earn)',
            '  - Claimable protocol rewards (suggest t2000_claim_rewards)',
            '',
            'On user confirmation, execute t2000_rebalance (dryRun: false).',
            'After execution, show: new APY, amount moved, transaction link.',
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
            '  - Which protocol + asset offers the best yield (compare NAVI vs Suilend, USDC vs USDe etc.)',
            '  - Expected monthly/annual yield on the recommended amount',
            '  - If existing savings should rebalance (t2000_rebalance with dryRun: true)',
            '  - Whether investment assets could earn yield via t2000_invest earn',
            '',
            'If they want to proceed, use t2000_save to deposit.',
          ].join('\n'),
        },
      }],
    }),
  );

  server.prompt(
    'investment-strategy',
    'Analyze investment portfolio, suggest strategies, review DCA schedules, and recommend next steps.',
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are an investment advisor for a t2000 AI agent bank account on Sui.',
            '',
            'IMPORTANT: Call t2000_overview FIRST, then t2000_strategy (action: "list") and t2000_auto_invest (action: "status") in parallel.',
            '',
            'Analyze and recommend:',
            '  - Portfolio allocation (checking vs savings vs investment)',
            '  - Best strategy for their profile (bluechip, all-weather, layer1, sui-heavy, safe-haven)',
            '  - If strategy positions are drifting from target weights, suggest rebalancing',
            '  - If no DCA schedule exists, recommend setting one up',
            '  - Whether invested assets should earn yield (t2000_invest earn)',
            '  - Risk: concentration, unrealized losses, strategy drift',
            '',
            'STRATEGY PRESENTATION: Always show the strategy allocations before buying.',
            '  e.g. "All-Weather: 30% BTC, 20% ETH, 20% SUI, 30% GOLD — diversified crypto + commodities"',
            '  Then use dryRun: true to preview estimated prices and amounts.',
            '',
            'AUTO-FUNDING: If checking balance is insufficient but savings exist,',
            '  the SDK auto-withdraws from savings to fund the investment.',
            '  Do NOT manually withdraw first — just call t2000_strategy buy or t2000_invest with action: "buy" directly.',
            '',
            'For DCA: use t2000_auto_invest action: "setup" to create recurring buys.',
          ].join('\n'),
        },
      }],
    }),
  );

  // ---------------------------------------------------------------------------
  // Wow-factor prompts — AI-as-financial-advisor
  // ---------------------------------------------------------------------------

  server.prompt(
    'morning-briefing',
    'Daily financial snapshot — balance changes, yield earned, portfolio movement, pending DCA, health warnings.',
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are a personal financial briefing assistant for a t2000 AI agent bank account on Sui.',
            '',
            'IMPORTANT: Call t2000_overview FIRST — it returns balance, positions, portfolio, health, earnings, fund status, and pending rewards in one call.',
            'Then call t2000_auto_invest (action: "status") to check for pending DCA runs.',
            'Optionally call t2000_rebalance (dryRun: true) to check yield optimization opportunities.',
            '',
            'Present everything as a single structured briefing. NEVER ask follow-up questions before presenting the briefing.',
            '',
            '☀️ MORNING BRIEFING',
            '───────────────────',
            '',
            'Show a compact account summary table:',
            '  Checking    $XX.XX',
            '  Savings     $XX.XX · X.XX% APY',
            '  Credit      -$XX.XX (only if borrowed)',
            '  Investment  $XX.XX · +X.X% (only if positions exist)',
            '  Net Worth   $XX.XX',
            '',
            'If there are savings positions, show daily yield earned.',
            'If there are investment positions, show each asset with P&L.',
            'If pending rewards exist, mention them.',
            '',
            '📋 Action Items (max 4, only if applicable):',
            '  - Idle funds in checking → suggest saving or investing',
            '  - Outstanding debt → suggest repaying to stop interest',
            '  - Pending DCA run → suggest executing',
            '  - Better yield available → suggest rebalancing',
            '  - Claimable rewards → suggest claiming',
            '  - Low health factor → warn about liquidation risk',
            '',
            'If everything is optimized, say so. Keep it scannable — numbers first, narrative second.',
          ].join('\n'),
        },
      }],
    }),
  );

  server.prompt(
    'what-if',
    'Scenario planning — "What if I invest $X in Y?" Shows projected impact on portfolio, yield, and risk.',
    {
      scenario: z.string().optional().describe('Scenario to evaluate, e.g. "invest $500 in bluechip" or "withdraw all savings"'),
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
            'IMPORTANT: Call t2000_overview FIRST to get the full current state (balance, positions, portfolio, health).',
            'Then preview the specific action with dryRun: true.',
            '',
            'For INVESTMENT scenarios ("invest $X in Y" or "buy $X of strategy"):',
            '  - Call t2000_strategy (action: "list") to get allocations if it\'s a strategy',
            '  - ALWAYS show strategy allocations (e.g. "30% BTC, 20% ETH, 20% SUI, 30% GOLD")',
            '  - Call t2000_invest or t2000_strategy with dryRun: true to preview',
            '  - If checking is insufficient but savings exist, note that the SDK auto-withdraws — no manual step needed',
            '',
            'For SAVINGS scenarios ("save $X" or "withdraw $X"):',
            '  - Show impact on yield and health factor',
            '',
            'For BORROW scenarios ("borrow $X"):',
            '  - Show new health factor and interest cost',
            '',
            'For SWAP scenarios ("swap $X A to B", "buy $X BTC", "sell 0.1 ETH"):',
            '  - Call t2000_swap with dryRun: true',
            '',
            'ALWAYS present results as a BEFORE → AFTER comparison table:',
            '',
            '📊 SCENARIO: [description]',
            '  [strategy allocation breakdown if applicable]',
            '',
            '              Before    After',
            '  Checking    $XX.XX    $XX.XX',
            '  Savings     $XX.XX    $XX.XX',
            '  Investment  $XX.XX    $XX.XX',
            '',
            'Then add a smart recommendation:',
            '  - If amount exceeds checking, note that savings will be auto-withdrawn to fund it',
            '  - If it would drain total funds (checking + savings) below $5, warn about gas needs',
            '  - If the asset can earn yield after buying, mention it',
            '',
            'End with: "Want me to go ahead?" — ready to execute on confirmation.',
          ].join('\n'),
        },
      }],
    }),
  );

  server.prompt(
    'sweep',
    'Find idle funds in checking and optimally distribute across savings and investments for maximum yield.',
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
              '  1. Save $X to best-rate protocol (show APY)',
              '  2. Earn yield on idle investment assets (if applicable)',
              '  3. Rebalance existing savings for better APY (t2000_rebalance dryRun: true)',
              '  4. Claim pending rewards (if available)',
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
            'IMPORTANT: Call t2000_overview FIRST — it has balance, positions, portfolio, health, everything.',
            '',
            'Analyze and report:',
            '',
            '🛡️ RISK REPORT',
            '──────────────',
            '',
            '1. LIQUIDATION RISK — Health factor, distance to liquidation',
            '2. CONCENTRATION RISK — % in each account type, % per asset',
            '3. PROTOCOL EXPOSURE — NAVI vs Suilend distribution',
            '4. UNREALIZED LOSSES — Any investment positions at a loss',
            '5. YIELD EFFICIENCY — Idle assets, sub-optimal rates',
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
    'Week in review — transactions, yield earned, portfolio P&L changes, strategy performance, highlights.',
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are a personal finance newsletter writer for a t2000 AI agent bank account on Sui.',
            '',
            'IMPORTANT: Call t2000_overview, t2000_history (limit: 50), t2000_auto_invest (action: "status") in parallel.',
            '',
            '📊 WEEKLY RECAP',
            '───────────────',
            '',
            '💰 Net Worth: $X — Checking $X | Savings $X | Investment $X',
            '📈 Activity: X sends, X saves, X buys, X swaps',
            '💸 Yield: $X.XX this week, X% APY, $X/month projected',
            '📊 Portfolio: Per-asset P&L, best & worst performer',
            '🔄 DCA: Runs this week, next run, total invested',
            '🎁 Rewards: Pending? Claim suggestion',
            '👉 Next Week: 1-2 actionable suggestions',
            '',
            'Tone: confident, concise, data-driven. Bloomberg brief, not blog post.',
          ].join('\n'),
        },
      }],
    }),
  );

  server.prompt(
    'dca-advisor',
    'Personalized DCA setup — "I have $X/month" → recommends strategy, frequency, asset split, projected growth.',
    {
      budget: z.number().optional().describe('Monthly budget in dollars to invest'),
    },
    async ({ budget }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are a dollar-cost averaging advisor for a t2000 AI agent bank account on Sui.',
            '',
            budget
              ? `The user has $${budget}/month to invest via DCA.`
              : 'The user wants to set up a DCA schedule. Ask their monthly budget first.',
            '',
            'IMPORTANT: Call t2000_overview, t2000_strategy (action: "list"), t2000_auto_invest (action: "status") in parallel.',
            '',
            'Recommend a DCA plan:',
            '',
            '📅 DCA PLAN',
            '───────────',
            '',
            'STRATEGY: Pick one based on their existing portfolio:',
            '  - bluechip (50% BTC, 30% ETH, 20% SUI)',
            '  - all-weather (30% BTC, 20% ETH, 20% SUI, 30% GOLD)',
            '  - safe-haven (50% BTC, 50% GOLD)',
            '  - layer1 (50% ETH, 50% SUI)',
            '  - sui-heavy (60% SUI, 20% BTC, 20% ETH)',
            '  Explain WHY this fits them.',
            '',
            'FREQUENCY: Weekly for budgets > $50/month, monthly for smaller.',
            '',
            'AFFORDABILITY: Check remaining buffer after DCA commitment.',
            '  Flag if DCA would eat into spending buffer.',
            '',
            'If they agree: t2000_auto_invest action: "setup", amount, frequency, strategy.',
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
            '    Show which positions have rewards and from which protocols (NAVI, Suilend)',
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
            '    When locked: ALL operations are frozen — sends, saves, investments, borrows',
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

  server.prompt(
    'quick-swap',
    'Guided token swap — preview rate, slippage, and price impact before executing.',
    {
      from: z.string().optional().describe('Asset to sell (e.g. USDC, SUI)'),
      to: z.string().optional().describe('Asset to buy (e.g. SUI, USDC)'),
      amount: z.number().optional().describe('Amount in source asset units'),
    },
    async ({ from, to, amount }) => {
      const context = [
        from ? `From: ${from}` : '',
        to ? `To: ${to}` : '',
        amount ? `Amount: ${amount}` : '',
      ].filter(Boolean).join('\n');

      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: [
              'You are a swap assistant for a t2000 AI agent bank account.',
              '',
              context ? `Context:\n${context}\n` : '',
              'Help the user swap tokens. Follow this flow:',
              '',
              'Step 1 — Gather details:',
              '  If from, to, or amount is missing, ask the user',
              '  Check balance (t2000_balance) to confirm they have enough',
              '  Available pairs: any combination of USDC, SUI, BTC, ETH, GOLD, USDT, USDe, USDsui',
              '',
              'Step 2 — Preview the swap:',
              '  Run t2000_swap with dryRun: true',
              '  Show:',
              '    Input: X FROM → Expected output: Y TO',
              '    Rate: 1 FROM = Z TO',
              '    Price impact: X%',
              '    Slippage: X%',
              '    Fee: $X',
              '',
              'Step 3 — Ask for confirmation:',
              '  "Ready to execute this swap?"',
              '  If price impact > 1%, warn the user about the impact',
              '',
              'Step 4 — Execute:',
              '  Run t2000_swap with dryRun: false',
              '  Show: amount received, rate, transaction link',
              '  Show updated balance',
            ].join('\n'),
          },
        }],
      };
    },
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
            'IF they have funds but nothing saved/invested:',
            '  "Great, you have $X ready to go! Here\'s what you can do:"',
            '  1. SAVE — Earn yield on idle funds (show best current APY)',
            '  2. INVEST — Buy crypto (BTC, ETH, SUI, GOLD)',
            '  3. AUTO-INVEST — Set up recurring DCA buys',
            '  4. SAFEGUARDS — Set spending limits (recommend for accounts > $100)',
            '',
            'IF they already have savings/investments:',
            '  "Looks like you\'re already set up! Here\'s your quick status:"',
            '  Show a mini briefing, then offer to optimize',
            '',
            'End with: "What would you like to do first?"',
            '',
            'Available features to highlight:',
            '  - Save/withdraw USDC across NAVI & Suilend protocols',
            '  - Invest in BTC, ETH, SUI, GOLD with portfolio tracking',
            '  - Strategy investing (bluechip, all-weather, etc.)',
            '  - Auto-invest (DCA) — recurring weekly/monthly buys',
            '  - Rebalance — auto-optimize yield across protocols',
            '  - Borrow against savings',
            '  - Send money to contacts',
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
    'One-shot full optimization — sweep idle funds, rebalance savings, claim rewards, rebalance investment earnings.',
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
            'Check all 5 optimization levers and present a plan BEFORE executing:',
            '',
            '1. IDLE FUNDS — Any checking balance > $5?',
            '   → Save to best-rate protocol',
            '',
            '2. SAVINGS REBALANCE — Better APY available?',
            '   → t2000_rebalance dryRun: true — show current vs new APY',
            '',
            '3. PENDING REWARDS — Any unclaimed?',
            '   → Show rewards, offer to claim and convert to USDC',
            '',
            '4. INVESTMENT YIELD — Any invested assets NOT earning?',
            '   → t2000_invest earn to deposit into lending',
            '',
            '5. INVESTMENT REBALANCE — Earning assets on sub-optimal protocol?',
            '   → t2000_invest_rebalance dryRun: true',
            '',
            'Present all findings in a summary table:',
            '',
            '  Action           | Impact            | Status',
            '  ─────────────────|───────────────────|──────────',
            '  Sweep $X idle    | +$X.XX/month      | Ready',
            '  Rebalance savings| +X.XX% APY        | Ready',
            '  Claim rewards    | $X.XX USDC        | Ready',
            '  Earn on SUI      | +X.XX% APY        | Ready',
            '  Already optimal  | —                 | Skipped',
            '',
            'Ask: "Want me to execute all ready actions?" Then run sequentially.',
            'If everything is already optimal, say so clearly.',
          ].join('\n'),
        },
      }],
    }),
  );

  server.prompt(
    'savings-goal',
    'Set a savings target — "I want to save $X by date Y" → calculates weekly/monthly amount needed.',
    {
      target: z.number().optional().describe('Target savings amount in dollars'),
      months: z.number().optional().describe('Number of months to reach the target'),
    },
    async ({ target, months }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are a savings goal planner for a t2000 AI agent bank account on Sui.',
            '',
            target ? `Target: $${target}` : '',
            months ? `Timeline: ${months} months` : '',
            '',
            'IMPORTANT: Call t2000_overview FIRST to see current state.',
            '',
            '🎯 SAVINGS GOAL',
            '────────────────',
            '',
            'If target or timeline is missing, ask the user.',
            '',
            'Calculate and present:',
            '',
            '  Goal: $X by [date]',
            '  Currently saved: $X',
            '  Gap: $X needed',
            '',
            '  Weekly deposit: $X/week',
            '  Monthly deposit: $X/month',
            '',
            '  With yield (at current APY X%):',
            '    Without yield you\'d need: $X total deposits',
            '    With yield you\'d need: $X total deposits (yield covers ~$X)',
            '',
            '  Feasibility check:',
            '    Current checking: $X',
            '    Can fund from checking: $X of $X gap',
            '    Remaining to earn/deposit: $X',
            '',
            'If they can reach the goal with current funds + yield:',
            '  → Offer to save it all now: t2000_save',
            '',
            'If they need regular deposits:',
            '  → Suggest a recurring schedule',
            '  → Show how yield accelerates the goal',
            '',
            'End with a clear YES/NO on whether the goal is achievable in the timeline.',
          ].join('\n'),
        },
      }],
    }),
  );
}
