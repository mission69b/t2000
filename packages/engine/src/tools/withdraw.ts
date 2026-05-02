import { z } from 'zod';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';

export const withdrawTool = buildTool({
  name: 'withdraw',
  description:
    'Withdraw from NAVI lending back to wallet. Defaults to USDC; also withdraws USDsui (the second active saveable stable). Legacy positions in other assets (USDe, SUI) can still be withdrawn if the user has them — but only USDC and USDsui are eligible to be re-deposited via save_deposit. ' +
    'Payment Stream: bundleable — when paired with another bundleable write in the same request (e.g. "withdraw and send to Mom"), emit all calls in the same assistant turn so the engine collapses them into one atomic PTB the user signs once.',
  inputSchema: z.object({
    amount: z.number().positive(),
    asset: z.string().optional().describe('Asset to withdraw (default: USDC). Active: USDsui. Legacy positions: USDe, SUI.'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      amount: {
        description: 'Exact amount to withdraw in token units',
      },
      asset: {
        type: 'string',
        description: 'Asset to withdraw (default: USDC). Active: USDsui. Legacy positions: USDe, SUI.',
      },
    },
    required: ['amount'],
  },
  isReadOnly: false,
  permissionLevel: 'confirm',
  flags: { mutating: true, affectsHealth: true },

  async call(input, context) {
    const agent = requireAgent(context);
    const result = await agent.withdraw({
      amount: input.amount,
      asset: input.asset,
    });

    const withdrawnAsset = (result as { asset?: string }).asset ?? input.asset ?? 'USDC';
    return {
      data: {
        success: result.success,
        tx: result.tx,
        amount: result.amount,
        asset: withdrawnAsset,
        gasCost: result.gasCost,
      },
      displayText: `Withdrew ${result.amount.toFixed(result.amount < 1 ? 6 : 2)} ${withdrawnAsset} (tx: ${result.tx.slice(0, 8)}…)`,
    };
  },
});
