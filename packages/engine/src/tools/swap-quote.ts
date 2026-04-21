import { z } from 'zod';
import { getSwapQuote, isStakingReceipt, stakingReceiptProtocol } from '@t2000/sdk';
import { buildTool } from '../tool.js';
import { getWalletAddress } from './utils.js';

export const swapQuoteTool = buildTool({
  name: 'swap_quote',
  description:
    'Get a swap quote without executing. Shows expected output amount, price impact, and route. Use before swap_execute to preview a trade.',
  inputSchema: z.object({
    from: z.string().describe('Source token (e.g. "SUI", "USDC", or full coin type)'),
    to: z.string().describe('Target token (e.g. "USDC", "CETUS", or full coin type)'),
    amount: z.number().positive().describe('Amount to swap'),
    byAmountIn: z.boolean().optional().describe('true = fixed input (default), false = fixed output'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'Source token name or coin type' },
      to: { type: 'string', description: 'Target token name or coin type' },
      amount: { type: 'number', description: 'Amount to swap' },
      byAmountIn: { type: 'boolean', description: 'true = fixed input (default), false = fixed output' },
    },
    required: ['from', 'to', 'amount'],
  },
  isReadOnly: true,
  preflight: (input) => {
    if (isStakingReceipt(input.from)) {
      const protocol = stakingReceiptProtocol(input.from);
      return {
        valid: false,
        error: `${input.from} is a liquid staking receipt — no DEX quote available. Unstake via ${protocol} first to receive SUI, then Audric can quote a swap.`,
      };
    }
    return { valid: true };
  },

  async call(input, context) {
    const walletAddress = context.agent
      ? (context.agent as { address(): string }).address()
      : getWalletAddress(context);

    const result = await getSwapQuote({
      walletAddress,
      from: input.from,
      to: input.to,
      amount: input.amount,
      byAmountIn: input.byAmountIn,
    });

    return {
      data: result,
      displayText: `${result.fromAmount} ${result.fromToken} → ${result.toAmount.toFixed(4)} ${result.toToken} (impact: ${(result.priceImpact * 100).toFixed(2)}%, via ${result.route})`,
    };
  },
});
