import { z } from 'zod';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';

export const saveDepositTool = buildTool({
  name: 'save_deposit',
  description:
    'Deposit into NAVI lending to earn yield. Supports USDC (default), USDT, SUI, and other NAVI-supported assets. Always call balance_check first to know the available amount.',
  inputSchema: z.object({
    amount: z.number().positive(),
    asset: z.string().optional().describe('Asset to deposit (default: USDC). Options: USDC, USDT, SUI, USDe, USDsui'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      amount: {
        description: 'Exact amount to save (call balance_check first to get available amount)',
      },
      asset: {
        type: 'string',
        description: 'Asset to deposit (default: USDC). Options: USDC, USDT, SUI, USDe, USDsui',
      },
    },
    required: ['amount'],
  },
  isReadOnly: false,
  permissionLevel: 'confirm',

  async call(input, context) {
    const agent = requireAgent(context);
    const asset = (input.asset as 'USDC' | 'USDT' | 'SUI' | 'USDe' | 'USDsui') ?? 'USDC';
    const result = await agent.save({ amount: input.amount, asset });

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
      displayText: `Saved ${result.amount.toFixed(2)} ${asset} at ${(result.apy * 100).toFixed(2)}% APY (tx: ${result.tx.slice(0, 8)}…)`,
    };
  },
});
