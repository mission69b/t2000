import { z } from 'zod';
import { T2000Error } from '@t2000/sdk';
import { defineTool } from '../v2/define-tool.js';
import { getTelemetrySink } from '../telemetry.js';
import { requireAgent } from './utils.js';

// [S.123 v1.24.7] Mirrors the swap_quote recovery hints. Even though
// swap_execute is a `confirm` write tool that audric/web typically dispatches
// via the sponsored-transaction flow (not the engine's `call`), this branch
// still fires for CLI / server-side / future direct-execute paths and gives
// the LLM a deterministic recovery path when the user-facing SDK rejects.
const RECOVERY_HINTS = {
  ASSET_NOT_SUPPORTED:
    'This token symbol is not in the standard registry. Call `navi_navi_search_tokens` with the symbol to find its full coin type, then retry `swap_execute` with the full type string.',
  SWAP_FAILED:
    'No route or insufficient liquidity for this pair. Try a different amount, a different intermediate token, or check `balance_check` to confirm the source token is held.',
} as const;

interface SwapExecuteSuccessData {
  tx: string;
  fromToken: string;
  toToken: string;
  fromAmount: number;
  toAmount: number;
  priceImpact: number;
  route: string;
  gasCost: number;
}

// [S.123 v1.24.7] Discriminated union return type for swap_execute.
export type SwapExecuteToolResult =
  | SwapExecuteSuccessData
  | { error: string; errorCode: 'ASSET_NOT_SUPPORTED' | 'SWAP_FAILED'; hint: string; recoverable: true };

export const swapExecuteTool = defineTool({
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
  isReadOnly: false,
  permissionLevel: 'confirm',
  flags: { mutating: true, requiresBalance: true },
  preflight: (input) => {
    if (input.from.toLowerCase() === input.to.toLowerCase()) {
      return { valid: false, error: `Cannot swap ${input.from} to itself.` };
    }
    return { valid: true };
  },

  async call(input, context): Promise<{ data: SwapExecuteToolResult; displayText: string }> {
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

      if (err instanceof T2000Error && (err.code === 'ASSET_NOT_SUPPORTED' || err.code === 'SWAP_FAILED')) {
        const hint = RECOVERY_HINTS[err.code];
        return {
          data: {
            error: err.message,
            errorCode: err.code,
            hint,
            recoverable: true,
          },
          displayText:
            err.code === 'ASSET_NOT_SUPPORTED'
              ? `Token "${input.from}" not in standard registry — searching for full coin type.`
              : `No swap route available for ${input.from} → ${input.to}.`,
        };
      }

      throw err;
    }
  },
});
