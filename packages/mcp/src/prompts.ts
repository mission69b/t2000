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
}
