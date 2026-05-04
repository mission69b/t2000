import { z } from 'zod';
import { buildTool } from '../tool.js';
import { getTelemetrySink } from '../telemetry.js';
import { requireAgent } from './utils.js';

export const swapExecuteTool = buildTool({
  name: 'swap_execute',
  description:
    'Swap tokens on Sui via Cetus Aggregator (20+ DEXs). Supports any token pair with liquidity. Use user-friendly names (SUI, USDC, CETUS, DEEP, etc.) or full coin types. ' +
    'Payment Intent: composable — when paired with another composable write in the same request (e.g. "swap to USDC and save", "swap and send to Mom"), emit all calls in the same assistant turn so the engine compiles them into one atomic Payment Intent the user signs once.',
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
    return { valid: true };
  },

  async call(input, context) {
    const agent = requireAgent(context);
    // [Backlog 2a / 2026-05-04] swap_execute end-to-end timing baseline.
    // Times the SDK `agent.swap()` call which wraps findSwapRoute +
    // buildSwapTx + sign + waitForTransaction. The headline ratio
    // `cetus.find_route_ms / cetus.swap_execute_total_ms` tells us what
    // fraction of swap_execute latency is route fetching — i.e. the
    // upper bound on what a per-request route cache would save. Backlog
    // 2b is gated on this ratio + the % of swap_execute calls that land
    // within 30s of a swap_quote (TTL window).
    const sink = getTelemetrySink();
    const start = Date.now();
    try {
      const result = await agent.swap({
        from: input.from,
        to: input.to,
        amount: input.amount,
        byAmountIn: input.byAmountIn,
        slippage: input.slippage,
      });
      sink.histogram('cetus.swap_execute_total_ms', Date.now() - start);
      sink.counter('cetus.swap_execute_count', { outcome: 'success' });
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
    } catch (err) {
      sink.counter('cetus.swap_execute_count', { outcome: 'error' });
      throw err;
    }
  },
});
