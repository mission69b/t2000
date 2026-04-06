import { z } from 'zod';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';

export const saveDepositTool = buildTool({
  name: 'save_deposit',
  description:
    'Deposit USDC into NAVI savings to earn yield. ONLY USDC is accepted — if the user asks to save any other token (USDT, SUI, USDe, etc.), do NOT call this tool. Instead tell them to swap to USDC first, then deposit.',
  inputSchema: z.object({
    amount: z.number().positive(),
    asset: z.string().optional().describe('Must be USDC or omitted. Any other asset is rejected.'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      amount: {
        description: 'Exact amount of USDC to deposit',
      },
      asset: {
        type: 'string',
        description: 'Must be USDC or omitted. Any other asset is rejected.',
      },
    },
    required: ['amount'],
  },
  isReadOnly: false,
  permissionLevel: 'confirm',

  async call(input, context) {
    if (input.asset && input.asset.toUpperCase() !== 'USDC') {
      throw new Error(`Only USDC deposits are supported. Cannot deposit ${input.asset}. Swap to USDC first, then deposit.`);
    }

    const agent = requireAgent(context);
    const result = await agent.save({ amount: input.amount });

    return {
      data: {
        success: result.success,
        tx: result.tx,
        amount: result.amount,
        asset: 'USDC',
        apy: result.apy,
        fee: result.fee,
        gasCost: result.gasCost,
        savingsBalance: result.savingsBalance,
      },
      displayText: `Saved ${result.amount.toFixed(result.amount < 1 ? 6 : 2)} USDC at ${(result.apy * 100).toFixed(2)}% APY (tx: ${result.tx.slice(0, 8)}…)`,
    };
  },
});
