import { z } from 'zod';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';

export const withdrawTool = buildTool({
  name: 'withdraw',
  description:
    'Withdraw USDC from savings back to wallet. Specify an amount in USD or "all" to withdraw everything safely. Checks health factor to prevent liquidation if there is outstanding debt.',
  inputSchema: z.object({
    amount: z.union([z.number().positive(), z.literal('all')]),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      amount: {
        description: 'Amount in USD to withdraw, or "all" for full withdrawal',
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
