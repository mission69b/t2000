import { z } from 'zod';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';

export const withdrawTool = buildTool({
  name: 'withdraw',
  description:
    'Withdraw from NAVI lending back to wallet. Supports any deposited asset (USDC, USDT, SUI, WAL, ETH, NAVX, GOLD, etc). Always call savings_info first. Checks health factor to prevent liquidation if there is outstanding debt.',
  inputSchema: z.object({
    amount: z.number().positive(),
    asset: z.string().optional().describe('Asset to withdraw (default: picks largest position). Supports: USDC, USDT, SUI, WAL, ETH, NAVX, GOLD, USDe, USDsui'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      amount: {
        description: 'Exact amount to withdraw (call savings_info first to get deposited amount)',
      },
      asset: {
        type: 'string',
        description: 'Asset to withdraw (default: picks largest position). Supports: USDC, USDT, SUI, WAL, ETH, NAVX, GOLD, USDe, USDsui',
      },
    },
    required: ['amount'],
  },
  isReadOnly: false,
  permissionLevel: 'confirm',

  async call(input, context) {
    const agent = requireAgent(context);
    const result = await agent.withdraw({
      amount: input.amount,
      asset: input.asset,
    });

    const withdrawnAsset = (result as { asset?: string }).asset ?? input.asset ?? '';
    return {
      data: {
        success: result.success,
        tx: result.tx,
        amount: result.amount,
        asset: withdrawnAsset,
        gasCost: result.gasCost,
      },
      displayText: `Withdrew ${result.amount.toFixed(result.amount < 1 ? 6 : 2)}${withdrawnAsset ? ' ' + withdrawnAsset : ''} (tx: ${result.tx.slice(0, 8)}…)`,
    };
  },
});
