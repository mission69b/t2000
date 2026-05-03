import { z } from 'zod';
import { getSwapQuote } from '@t2000/sdk';
import { buildTool } from '../tool.js';
import { getTelemetrySink } from '../telemetry.js';
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

  async call(input, context) {
    const walletAddress = context.agent
      ? (context.agent as { address(): string }).address()
      : getWalletAddress(context);

    // [Backlog 2a / 2026-05-04] Cetus route-fetch baseline. Times the
    // SDK call end-to-end (`getSwapQuote` is a thin wrapper over
    // `findSwapRoute`, so this is effectively pure route-fetch latency).
    // Pairs with `cetus.swap_execute_total_ms` in the swap_execute tool
    // — together they let us compute the % of swap_execute latency that
    // route fetching represents, which gates the Backlog 2b decision
    // (build a per-request route cache keyed on (from, to, amount)) on
    // real production data instead of guesses.
    const sink = getTelemetrySink();
    const start = Date.now();
    try {
      const result = await getSwapQuote({
        walletAddress,
        from: input.from,
        to: input.to,
        amount: input.amount,
        byAmountIn: input.byAmountIn,
      });
      sink.histogram('cetus.find_route_ms', Date.now() - start);
      sink.counter('cetus.find_route_count', { outcome: 'success' });
      return {
        data: result,
        displayText: `${result.fromAmount} ${result.fromToken} → ${result.toAmount.toFixed(4)} ${result.toToken} (impact: ${(result.priceImpact * 100).toFixed(2)}%, via ${result.route})`,
      };
    } catch (err) {
      sink.counter('cetus.find_route_count', { outcome: 'error' });
      throw err;
    }
  },
});
