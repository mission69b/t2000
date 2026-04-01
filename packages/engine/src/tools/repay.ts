import { z } from 'zod';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';

export const repayDebtTool = buildTool({
  name: 'repay_debt',
  description:
    'Repay outstanding USDC debt. Specify an amount or "all" to repay everything. Prioritises the highest-APY borrow first. Returns tx hash, amount repaid, and remaining debt.',
  inputSchema: z.object({
    amount: z.union([z.number().positive(), z.literal('all')]),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      amount: {
        description: 'Amount in USD to repay, or "all" to repay everything',
      },
    },
    required: ['amount'],
  },
  isReadOnly: false,
  permissionLevel: 'confirm',

  async call(input, context) {
    const agent = requireAgent(context);
    const result = await agent.repay({ amount: input.amount });

    return {
      data: {
        success: result.success,
        tx: result.tx,
        amount: result.amount,
        remainingDebt: result.remainingDebt,
        gasCost: result.gasCost,
      },
      displayText: `Repaid $${result.amount.toFixed(2)} — remaining debt: $${result.remainingDebt.toFixed(2)} (tx: ${result.tx.slice(0, 8)}…)`,
    };
  },
});
