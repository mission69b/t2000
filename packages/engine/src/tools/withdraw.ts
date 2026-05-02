import { z } from 'zod';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';

export const withdrawTool = buildTool({
  name: 'withdraw',
  description:
    'Withdraw USDC or USDsui from NAVI lending back to wallet. Defaults to USDC. ' +
    'Audric supports ONLY USDC and USDsui — these are the same two stables save_deposit accepts. ' +
    'NAVI may also surface legacy positions (USDe, SUI, etc.) in savings_info / balance_check; those are READ-ONLY through Audric. ' +
    'For non-canonical positions, direct the user to NAVI\'s app (https://app.naviprotocol.io) — Audric will not withdraw them. ' +
    'Payment Stream: bundleable — when paired with another bundleable write in the same request (e.g. "withdraw and send to Mom"), emit all calls in the same assistant turn so the engine collapses them into one atomic PTB the user signs once.',
  inputSchema: z.object({
    amount: z.number().positive(),
    asset: z.string().optional().describe('Asset to withdraw — must be USDC (default) or USDsui. Other assets surfaced in savings_info are read-only via Audric.'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      amount: {
        description: 'Exact amount to withdraw in token units',
      },
      asset: {
        type: 'string',
        description: 'Asset to withdraw — USDC (default) or USDsui only. Other assets surfaced in savings_info are read-only via Audric; direct the user to https://app.naviprotocol.io for those.',
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
