import { z } from 'zod';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';

export const borrowTool = buildTool({
  name: 'borrow',
  description:
    'Borrow USDC against savings collateral. ONLY USDC borrows are supported. Requires existing savings deposits. Checks max safe borrow and health factor. Returns tx hash, fee, and post-borrow health factor.',
  inputSchema: z.object({
    amount: z.number().positive(),
    asset: z.string().optional().describe('Must be USDC or omitted. Any other asset is rejected.'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      amount: {
        type: 'number',
        description: 'Amount in USDC to borrow',
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
      throw new Error(`Only USDC borrows are supported. Cannot borrow ${input.asset}.`);
    }

    const agent = requireAgent(context);
    const result = await agent.borrow({ amount: input.amount });

    return {
      data: {
        success: result.success,
        tx: result.tx,
        amount: result.amount,
        fee: result.fee,
        healthFactor: result.healthFactor,
        gasCost: result.gasCost,
      },
      displayText: `Borrowed $${result.amount.toFixed(2)} — HF: ${result.healthFactor.toFixed(2)} (tx: ${result.tx.slice(0, 8)}…)`,
    };
  },
});
