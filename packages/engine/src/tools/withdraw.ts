import { z } from 'zod';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';

export const withdrawTool = buildTool({
  name: 'withdraw',
  description:
    'Withdraw from NAVI lending back to wallet. Supported assets: USDC, USDT, SUI, USDe, USDsui. Checks health factor to prevent liquidation if there is outstanding debt.',
  inputSchema: z.object({
    amount: z.number().positive(),
    asset: z.string().optional().describe('Asset to withdraw (default: picks largest position). Supported: USDC, USDT, SUI, USDe, USDsui'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      amount: {
        description: 'Exact amount to withdraw in token units',
      },
      asset: {
        type: 'string',
        description: 'Asset to withdraw (default: picks largest position). Supported: USDC, USDT, SUI, USDe, USDsui',
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
