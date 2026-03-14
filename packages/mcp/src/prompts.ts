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
            'You are a financial assistant for a t2000 AI agent bank account.',
            '',
            'Please provide a comprehensive financial report by:',
            '1. Check the current balance (t2000_balance)',
            '2. Review lending positions (t2000_positions)',
            '3. Check the health factor (t2000_health)',
            '4. Show yield earnings (t2000_earnings)',
            '5. Review current interest rates (t2000_rates)',
            '6. Check investment portfolio (t2000_portfolio)',
            '',
            'Summarize the agent\'s financial health in a clear, concise format with actionable recommendations.',
          ].join('\n'),
        },
      }],
    }),
  );

  server.prompt(
    'optimize-yield',
    'Analyze savings positions and suggest yield optimizations — rate comparisons, rebalancing opportunities.',
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are a yield optimization assistant for a t2000 AI agent bank account.',
            '',
            'Please analyze the current yield strategy:',
            '1. Check current positions (t2000_positions)',
            '2. Compare rates across protocols (t2000_rates)',
            '3. Run a dry-run rebalance to see if optimization is available (t2000_rebalance with dryRun: true)',
            '',
            'If a rebalance would improve yield, explain the trade-off (gas cost vs yield gain, break-even period) and ask if the user wants to proceed.',
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
            'You are a savings advisor for a t2000 AI agent bank account.',
            '',
            'Analyze the user\'s funds and recommend a savings strategy:',
            '1. Check current balance (t2000_balance) — how much is idle in checking?',
            '2. Check current positions (t2000_positions) — what\'s already in savings?',
            '3. Compare rates across protocols (t2000_rates) — where\'s the best yield?',
            '',
            'Recommend:',
            '- How much to move from checking to savings (keep a reasonable buffer for gas + daily spending)',
            '- Which protocol offers the best rate right now',
            '- Expected annual yield on the recommended amount',
            '- If they should rebalance existing savings (t2000_rebalance with dryRun: true)',
            '- Whether investing in SUI or other assets could complement their savings strategy',
            '- Note: investment assets (SUI, ETH) can also earn yield via t2000_invest action: "earn"',
            '',
            'If they want to proceed, use t2000_save to deposit. Always preview first.',
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
            'You are an investment advisor for a t2000 AI agent bank account.',
            '',
            'Analyze the user\'s investment position:',
            '1. Check current balance (t2000_balance) — available checking, savings, investment value',
            '2. Check investment portfolio (t2000_portfolio) — positions, cost basis, P&L, strategy grouping',
            '3. List available strategies (t2000_strategy action: "list") — predefined and custom',
            '4. Check DCA schedules (t2000_auto_invest action: "status") — any active recurring buys',
            '5. Compare current rates (t2000_rates) — yield alternatives',
            '',
            'Recommend:',
            '- Portfolio allocation assessment (checking vs savings vs investment)',
            '- Whether a predefined strategy (bluechip, layer1, sui-heavy) suits them better than picking individual assets',
            '- If strategy positions are drifting from target weights, suggest rebalancing',
            '- If they have no DCA schedule, recommend setting one up for dollar-cost averaging',
            '- Whether invested assets should earn yield (t2000_invest action: "earn")',
            '- Risk assessment — concentration, unrealized losses, strategy drift',
            '',
            'For strategies: use t2000_strategy with dryRun: true to preview before buying.',
            'For DCA: use t2000_auto_invest action: "setup" to create recurring buys.',
            'For direct investments: use t2000_invest with dryRun: true to preview.',
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
            'You are a personal financial briefing assistant for a t2000 AI agent bank account.',
            '',
            'Deliver a concise morning briefing. Gather all data first, then present a single unified report.',
            '',
            'Data to collect:',
            '1. Current balance breakdown (t2000_balance)',
            '2. Yield earnings — daily rate, total earned (t2000_earnings)',
            '3. Investment portfolio — positions, P&L movement (t2000_portfolio)',
            '4. Health factor — any borrow risk (t2000_health)',
            '5. Pending DCA runs (t2000_auto_invest action: "status")',
            '6. Recent transactions since yesterday (t2000_history with limit: 10)',
            '',
            'Present the briefing in this structure:',
            '',
            '☀️ MORNING BRIEFING',
            '───────────────────',
            '',
            '💰 Accounts',
            '  Checking / Savings / Credit / Investment totals',
            '  Net worth and change from yesterday if estimable',
            '',
            '📈 Portfolio',
            '  Each position: asset, amount, current price, unrealized P&L',
            '  Overall portfolio performance',
            '',
            '💸 Yield',
            '  What you earned overnight (daily rate × time)',
            '  Current APY across savings and investment lending',
            '',
            '⚠️ Alerts (only if applicable)',
            '  Low health factor, pending DCA runs, strategy drift, large unrealized losses',
            '',
            '📋 Action Items',
            '  Specific, actionable next steps (max 3)',
            '  e.g. "Run pending DCA", "Rebalance savings for +0.5% APY", "Health factor dropping — consider repaying"',
            '',
            'Keep it scannable. No fluff. Numbers first, narrative second.',
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
            'You are a financial scenario planner for a t2000 AI agent bank account.',
            '',
            scenario
              ? `The user wants to evaluate this scenario: "${scenario}"`
              : 'The user wants to explore a hypothetical financial scenario. Ask them what they\'re considering.',
            '',
            'Gather current state first:',
            '1. Current balance (t2000_balance)',
            '2. Current portfolio (t2000_portfolio)',
            '3. Current positions and rates (t2000_positions, t2000_rates)',
            '4. Health factor if they have borrows (t2000_health)',
            '',
            'Then model the scenario. For each scenario type:',
            '',
            'INVESTMENT scenario ("invest $X in Y"):',
            '  - Preview the trade (t2000_invest or t2000_strategy with dryRun: true)',
            '  - Show: checking balance after, new portfolio allocation %, concentration risk',
            '  - If the asset can earn yield, show projected annual yield',
            '  - Compare: "keeping $X in savings at Y% vs investing at historical volatility"',
            '',
            'SAVINGS scenario ("save $X" or "withdraw $X"):',
            '  - Show: new savings balance, new yield rate, impact on available spending',
            '  - If withdrawing: impact on health factor if they have borrows',
            '',
            'BORROW scenario ("borrow $X"):',
            '  - Show: new health factor, liquidation price, interest cost',
            '  - Compare: cost of borrowing vs withdrawing from savings',
            '',
            'EXCHANGE scenario ("swap $X of A to B"):',
            '  - Preview the swap (t2000_exchange with dryRun: true)',
            '  - Show: expected output, price impact, slippage',
            '',
            'Present results as:',
            '  BEFORE → AFTER comparison table',
            '  Risk assessment (better/worse/neutral)',
            '  Clear recommendation with reasoning',
            '',
            'Always end with: "Want me to execute this?" and the exact command that would run.',
          ].join('\n'),
        },
      }],
    }),
  );

  server.prompt(
    'sweep',
    'Find idle funds in checking and optimally distribute across savings and investments for maximum yield.',
    {
      keepBuffer: z.number().optional().describe('Dollar amount to keep in checking as spending buffer (default: $20)'),
    },
    async ({ keepBuffer }) => {
      const buffer = keepBuffer ?? 20;
      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: [
              'You are a smart money routing assistant for a t2000 AI agent bank account.',
              '',
              `Sweep idle checking funds into optimal earning positions. Keep $${buffer} in checking as a spending buffer.`,
              '',
              'Step 1 — Assess current state:',
              '  - Check balance (t2000_balance) — how much is idle in checking?',
              '  - Check positions (t2000_positions) — what\'s already earning?',
              '  - Check rates (t2000_rates) — where are the best yields?',
              '  - Check portfolio (t2000_portfolio) — any uninvested assets not earning yield?',
              '',
              `Step 2 — Calculate sweep amount: available checking minus $${buffer} buffer.`,
              '  If sweep amount is < $1, tell the user their funds are already optimized.',
              '',
              'Step 3 — Recommend allocation of the sweep amount:',
              '  - Savings: stable yield, no price risk — good for majority of idle funds',
              '  - Pick the highest-rate stablecoin protocol',
              '  - If they have investment assets not earning yield, recommend t2000_invest earn',
              '  - Check if rebalancing existing savings would help (t2000_rebalance dryRun: true)',
              '',
              'Step 4 — Present the sweep plan:',
              '',
              '  🧹 SWEEP PLAN',
              '  ─────────────',
              `  Available to sweep: $X (keeping $${buffer} buffer)`,
              '',
              '  Action 1: Save $X USDC → Protocol (Y% APY)',
              '    Expected: ~$X.XX/month',
              '  Action 2: Earn yield on X SUI → Protocol (Y% APY)  [if applicable]',
              '  Action 3: Rebalance savings → +Y% APY  [if applicable]',
              '',
              '  Projected monthly yield: $X.XX (before) → $X.XX (after)',
              '',
              'Ask: "Want me to execute this sweep?" Then run each action sequentially.',
              'Use dryRun: true first for any action over $50.',
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
            'You are a risk assessment specialist for a t2000 AI agent bank account.',
            '',
            'Perform a comprehensive risk analysis. Gather all data first:',
            '1. Balance breakdown (t2000_balance)',
            '2. Health factor (t2000_health)',
            '3. All lending positions (t2000_positions)',
            '4. Investment portfolio (t2000_portfolio)',
            '5. Current rates (t2000_rates)',
            '',
            'Analyze and report on each risk dimension:',
            '',
            '🛡️ RISK REPORT',
            '──────────────',
            '',
            '1. LIQUIDATION RISK',
            '   Health factor value and status (safe / moderate / warning / critical)',
            '   How much the collateral can drop before liquidation',
            '   If HF < 2.0: specific repayment recommendation to reach safe zone',
            '',
            '2. CONCENTRATION RISK',
            '   % of total net worth in each account type (checking, savings, investment)',
            '   % of investments in each asset (SUI, BTC, ETH, GOLD)',
            '   Flag if any single position is >50% of portfolio',
            '',
            '3. PROTOCOL EXPOSURE',
            '   Which protocols hold funds (NAVI, Suilend)',
            '   Total exposure per protocol',
            '   Flag if >80% of savings is in one protocol',
            '',
            '4. UNREALIZED LOSSES',
            '   Any investment positions currently at a loss',
            '   Total unrealized P&L',
            '   Cost basis vs current price per position',
            '',
            '5. YIELD EFFICIENCY',
            '   Any assets sitting idle (not earning yield)',
            '   Checking balance vs recommended buffer',
            '   Investment assets not in lending (could earn via invest earn)',
            '',
            'OVERALL RISK SCORE: Low / Medium / High / Critical',
            'Based on weighted combination of all factors above.',
            '',
            'End with max 3 specific, prioritized actions to reduce risk.',
            'If overall risk is Low, say so clearly — don\'t invent problems.',
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
            'You are a personal finance newsletter writer for a t2000 AI agent bank account.',
            '',
            'Compile a weekly financial recap. Gather all data:',
            '1. Current balance (t2000_balance)',
            '2. Recent transactions (t2000_history with limit: 50)',
            '3. Yield earnings (t2000_earnings)',
            '4. Investment portfolio with P&L (t2000_portfolio)',
            '5. Strategy statuses (t2000_strategy action: "list")',
            '6. DCA schedule status (t2000_auto_invest action: "status")',
            '',
            'Present as a weekly newsletter:',
            '',
            '📊 WEEKLY RECAP',
            '───────────────',
            '',
            '💰 Net Worth: $X.XX',
            '   Checking: $X | Savings: $X | Investment: $X | Credit: -$X',
            '',
            '📈 This Week\'s Activity',
            '   Summarize transactions by type:',
            '   - X sends totaling $X',
            '   - X saves/withdrawals',
            '   - X investment trades',
            '   - X exchanges',
            '   Highlight the largest transaction',
            '',
            '💸 Yield Earned',
            '   Total yield this week (daily rate × 7)',
            '   Breakdown by position',
            '   Annualized projection',
            '',
            '📊 Portfolio Performance',
            '   Each position: asset, P&L this week, total unrealized P&L',
            '   Best performer and worst performer',
            '   Strategy performance if applicable',
            '',
            '🔄 DCA Status',
            '   Runs completed this week',
            '   Next scheduled run',
            '   Total invested via DCA to date',
            '',
            '🏆 Highlight of the Week',
            '   One standout metric (best trade, highest yield day, milestone reached)',
            '',
            '👉 Next Week\'s Focus',
            '   1-2 actionable suggestions based on trends',
            '',
            'Tone: confident, concise, data-driven. Like a Bloomberg brief, not a blog post.',
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
            'You are a dollar-cost averaging advisor for a t2000 AI agent bank account.',
            '',
            budget
              ? `The user has $${budget}/month to invest via DCA.`
              : 'The user wants to set up a DCA (dollar-cost averaging) schedule. Ask them their monthly budget.',
            '',
            'Gather context:',
            '1. Current balance (t2000_balance) — can they afford this monthly commitment?',
            '2. Current portfolio (t2000_portfolio) — what do they already hold?',
            '3. Existing DCA schedules (t2000_auto_invest action: "status")',
            '4. Available strategies (t2000_strategy action: "list")',
            '',
            'Recommend a DCA plan:',
            '',
            '📅 DCA PLAN',
            '───────────',
            '',
            'STRATEGY SELECTION:',
            '  Based on their existing portfolio, recommend one of:',
            '  - bluechip (50% BTC, 30% ETH, 20% SUI) — large-cap crypto index',
            '  - all-weather (30% BTC, 20% ETH, 20% SUI, 30% GOLD) — crypto + commodities',
            '  - safe-haven (50% BTC, 50% GOLD) — store-of-value assets',
            '  - layer1 (50% ETH, 50% SUI) — smart contract platforms',
            '  - sui-heavy (60% SUI, 20% BTC, 20% ETH) — Sui-weighted portfolio',
            '  - single asset (100% SUI/BTC/ETH/GOLD) — concentrated conviction play',
            '  Explain WHY this strategy fits their situation.',
            '',
            'FREQUENCY:',
            '  - Weekly ($X/week) — smoothest averaging, best for volatile markets',
            '  - Monthly ($X/month) — simpler, lower gas costs',
            '  Recommend weekly for budgets > $50/month, monthly for smaller amounts.',
            '',
            'PROJECTION (12 months):',
            '  Total invested: $X',
            '  If prices stay flat: $X (just accumulation)',
            '  Note: past performance doesn\'t predict future results',
            '  Key benefit: removes emotion and timing risk from investing',
            '',
            'AFFORDABILITY CHECK:',
            '  Monthly income vs this commitment',
            '  Remaining checking buffer after DCA',
            '  Flag if DCA would eat into emergency buffer',
            '',
            'If they want to proceed:',
            '  Show the exact setup command:',
            '  t2000_auto_invest action: "setup", amount: X, frequency: "weekly", strategy: "name"',
            '  Preview first, then confirm.',
          ].join('\n'),
        },
      }],
    }),
  );
}
