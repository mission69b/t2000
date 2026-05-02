import { z } from 'zod';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';

export const voloUnstakeTool = buildTool({
  name: 'volo_unstake',
  description:
    'Unstake vSUI back to SUI. Returns SUI including accumulated yield. Use amount in vSUI units or "all" to unstake entire position. ' +
    'Payment Stream: bundleable — when paired with another bundleable write in the same request (e.g. "unstake vSUI and send to Mom"), emit all calls in the same assistant turn so the engine collapses them into one atomic PTB the user signs once.',
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
