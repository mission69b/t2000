import { z } from 'zod';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';

export const withdrawTool = buildTool({
  name: 'withdraw',
  description:
    'Withdraw USDC from savings back to wallet. Always call savings_info first to know the deposited amount, then pass the exact number here. Checks health factor to prevent liquidation if there is outstanding debt.',
  inputSchema: z.object({
    amount: z.number().positive(),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      amount: {
        description: 'Exact amount in USD to withdraw (call savings_info first to get deposited amount)',
      },
    },
    required: ['amount'],
  },
  isReadOnly: false,
  permissionLevel: 'confirm',

  async call(input, context) {
    const agent = requireAgent(context);
    const result = await agent.withdraw({ amount: input.amount });

    return {
      data: {
        success: result.success,
        tx: result.tx,
        amount: result.amount,
        gasCost: result.gasCost,
      },
      displayText: `Withdrew $${result.amount.toFixed(2)} (tx: ${result.tx.slice(0, 8)}…)`,
    };
  },
});
