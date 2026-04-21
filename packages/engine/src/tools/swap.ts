import { z } from 'zod';
import { isStakingReceipt, stakingReceiptProtocol } from '@t2000/sdk';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';

export const swapExecuteTool = buildTool({
  name: 'swap_execute',
  description:
    'Swap tokens on Sui via Cetus Aggregator (20+ DEXs). Supports any token pair with liquidity. Use user-friendly names (SUI, USDC, CETUS, DEEP, etc.) or full coin types.',
  inputSchema: z.object({
    from: z.string().describe('Source token (e.g. "SUI", "USDC", or full coin type)'),
    to: z.string().describe('Target token (e.g. "USDC", "CETUS", or full coin type)'),
    amount: z.number().positive().describe('Amount to swap'),
    byAmountIn: z.boolean().optional().describe('true = fixed input amount (default), false = fixed output amount'),
    slippage: z.number().min(0.001).max(0.05).optional().describe('Max slippage (default 0.01 = 1%, max 5%)'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'Source token name or coin type' },
      to: { type: 'string', description: 'Target token name or coin type' },
      amount: { type: 'number', description: 'Amount to swap' },
      byAmountIn: { type: 'boolean', description: 'true = fixed input (default), false = fixed output' },
      slippage: { type: 'number', description: 'Max slippage (0.01 = 1%)' },
    },
    required: ['from', 'to', 'amount'],
  },
  isReadOnly: false,
  permissionLevel: 'confirm',
  flags: { mutating: true, requiresBalance: true },
  preflight: (input) => {
    if (input.from.toLowerCase() === input.to.toLowerCase()) {
      return { valid: false, error: `Cannot swap ${input.from} to itself.` };
    }
    if (isStakingReceipt(input.from)) {
      const protocol = stakingReceiptProtocol(input.from);
      return {
        valid: false,
        error: `${input.from} is a liquid staking receipt — it can't be swapped through a DEX. You need to unstake it directly via ${protocol} first. Once unstaked, Audric can swap the resulting SUI for you.`,
      };
    }
    return { valid: true };
  },

  async call(input, context) {
    const agent = requireAgent(context);
    const result = await agent.swap({
      from: input.from,
      to: input.to,
      amount: input.amount,
      byAmountIn: input.byAmountIn,
      slippage: input.slippage,
    });

    return {
      data: {
        tx: result.tx,
        fromToken: result.fromToken,
        toToken: result.toToken,
        fromAmount: result.fromAmount,
        toAmount: result.toAmount,
        priceImpact: result.priceImpact,
        route: result.route,
        gasCost: result.gasCost,
      },
      displayText: `Swapped ${result.fromAmount} ${result.fromToken} for ${result.toAmount.toFixed(4)} ${result.toToken} (tx: ${result.tx.slice(0, 8)}...)`,
    };
  },
});
