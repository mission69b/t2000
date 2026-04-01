import { z } from 'zod';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';

export const saveDepositTool = buildTool({
  name: 'save_deposit',
  description:
    'Deposit USDC into savings to earn yield. Specify an amount in USD or "all" to save everything except a $1 gas reserve. Returns tx hash, APY, fee, and updated savings balance.',
  inputSchema: z.object({
    amount: z.union([z.number().positive(), z.literal('all')]),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      amount: {
        description: 'Amount in USD to save, or "all" for maximum deposit',
      },
    },
    required: ['amount'],
  },
  isReadOnly: false,
  permissionLevel: 'confirm',

  async call(input, context) {
    const agent = requireAgent(context);
    const result = await agent.save({ amount: input.amount });

    return {
      data: {
        success: result.success,
        tx: result.tx,
        amount: result.amount,
        apy: result.apy,
        fee: result.fee,
        gasCost: result.gasCost,
        savingsBalance: result.savingsBalance,
      },
      displayText: `Saved $${result.amount.toFixed(2)} at ${(result.apy * 100).toFixed(2)}% APY (tx: ${result.tx.slice(0, 8)}…)`,
    };
  },
});
