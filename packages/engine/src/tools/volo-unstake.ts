import { z } from 'zod';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';

export const voloUnstakeTool = buildTool({
  name: 'volo_unstake',
  description:
    'Unstake vSUI back to SUI. Returns SUI including accumulated yield. Use amount in vSUI units or "all" to unstake entire position. ' +
    'Payment Intent: composable — when paired with another composable write in the same request (e.g. "unstake vSUI and send to Mom"), emit all calls in the same assistant turn so the engine compiles them into one atomic Payment Intent the user signs once.',
  inputSchema: z.object({
    amount: z.union([z.number().positive(), z.literal('all')]).describe('Amount of vSUI to unstake, or "all"'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      amount: { description: 'Amount of vSUI to unstake, or the string "all"' },
    },
    required: ['amount'],
  },
  isReadOnly: false,
  permissionLevel: 'confirm',
  flags: { mutating: true },
  preflight: (input) => {
    if (typeof input.amount === 'number') {
      if (!Number.isFinite(input.amount) || input.amount <= 0) {
        return { valid: false, error: 'Amount must be positive.' };
      }
      if (input.amount > 10_000_000) {
        return { valid: false, error: 'Amount unreasonable (max 10M vSUI).' };
      }
    } else if (input.amount !== 'all') {
      return {
        valid: false,
        error: 'amount must be a positive number of vSUI or the string "all".',
      };
    }
    return { valid: true };
  },

  async call(input, context) {
    const agent = requireAgent(context);
    const result = await agent.unstakeVSui({ amount: input.amount });

    return {
      data: {
        tx: result.tx,
        vSuiAmount: result.vSuiAmount,
        suiReceived: result.suiReceived,
        gasCost: result.gasCost,
      },
      displayText: `Unstaked ${result.vSuiAmount.toFixed(4)} vSUI, received ${result.suiReceived.toFixed(4)} SUI (tx: ${result.tx.slice(0, 8)}...)`,
    };
  },
});
