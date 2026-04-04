import { z } from 'zod';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';

export const saveDepositTool = buildTool({
  name: 'save_deposit',
  description:
    'Deposit into NAVI lending to earn yield. Supports any NAVI-listed asset: USDC, USDT, SUI, WAL, ETH, NAVX, GOLD, USDe, USDsui. Amount is in token units (not USD).',
  inputSchema: z.object({
    amount: z.number().positive(),
    asset: z.string().optional().describe('Asset to deposit (default: USDC). Supports: USDC, USDT, SUI, WAL, ETH, NAVX, GOLD, USDe, USDsui'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      amount: {
        description: 'Exact amount to save in token units (call balance_check first)',
      },
      asset: {
        type: 'string',
        description: 'Asset to deposit (default: USDC). Supports: USDC, USDT, SUI, WAL, ETH, NAVX, GOLD, USDe, USDsui',
      },
    },
    required: ['amount'],
  },
  isReadOnly: false,
  permissionLevel: 'confirm',

  async call(input, context) {
    const agent = requireAgent(context);
    const asset = input.asset ?? 'USDC';
    const result = await agent.save({ amount: input.amount, asset: asset as Parameters<typeof agent.save>[0]['asset'] });

    return {
      data: {
        success: result.success,
        tx: result.tx,
        amount: result.amount,
        asset,
        apy: result.apy,
        fee: result.fee,
        gasCost: result.gasCost,
        savingsBalance: result.savingsBalance,
      },
      displayText: `Saved ${result.amount.toFixed(result.amount < 1 ? 6 : 2)} ${asset} at ${(result.apy * 100).toFixed(2)}% APY (tx: ${result.tx.slice(0, 8)}…)`,
    };
  },
});
