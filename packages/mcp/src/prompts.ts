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
}
