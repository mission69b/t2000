import { z } from 'zod';
import {
  getSwapQuote,
  getSponsoredSwapProviders,
  T2000Error,
  type SwapQuoteResult,
} from '@t2000/sdk';
import { defineTool } from '../v2/define-tool.js';
import { getTelemetrySink } from '../telemetry.js';
import { getWalletAddress } from './utils.js';

// [Bug A fix / 2026-05-10] Module-scoped one-shot cache for the sponsored
// providers list. The Cetus aggregator's `getProvidersExcluding` is a
// pure-function lookup against the SDK's static `getAllProviders()` — same
// inputs always yield the same outputs in a given process. Cache the
// promise (not the resolved value) so concurrent first-callers all await
// the same dynamic-import + resolve, instead of N parallel imports.
let sponsoredProvidersCache: Promise<string[]> | null = null;
function getCachedSponsoredProviders(): Promise<string[]> {
  if (!sponsoredProvidersCache) {
    sponsoredProvidersCache = getSponsoredSwapProviders();
  }
  return sponsoredProvidersCache;
}

// [S.123 v1.24.7] Recovery hints surfaced to the LLM when a swap quote fails
// with a known, recoverable error. Putting these in tool results (not
// re-thrown errors) makes the recovery path deterministic — the LLM ALWAYS
// knows what to call next, instead of guessing from a generic error string.
const RECOVERY_HINTS = {
  ASSET_NOT_SUPPORTED:
    'This token symbol is not in the standard registry. Call `navi_navi_search_tokens` with the symbol to find its full coin type, then retry `swap_quote` with the full type string (e.g. "0x83556...::spring_sui::SPRING_SUI").',
  SWAP_FAILED:
    'No route or insufficient liquidity for this pair. Try a different amount, a different intermediate token, or check `balance_check` to confirm the source token is held.',
} as const;

// [S.123 v1.24.7] Discriminated union return type — `swap_quote` either
// returns a successful quote or a structured recovery hint. The LLM sees
// `errorCode` + `hint` and follows the deterministic recovery path
// (`navi_navi_search_tokens` → retry with full coin type).
export type SwapQuoteToolResult =
  | SwapQuoteResult
  | { error: string; errorCode: 'ASSET_NOT_SUPPORTED' | 'SWAP_FAILED'; hint: string; recoverable: true };

export const swapQuoteTool = defineTool({
  name: 'swap_quote',
  description:
    'Get a swap quote without executing. Shows expected output amount, price impact, and route. Use before swap_execute to preview a trade.',
  inputSchema: z.object({
    from: z.string().describe('Source token (e.g. "SUI", "USDC", or full coin type)'),
    to: z.string().describe('Target token (e.g. "USDC", "CETUS", or full coin type)'),
    amount: z.number().positive().describe('Amount to swap'),
    byAmountIn: z.boolean().optional().describe('true = fixed input (default), false = fixed output'),
  }),
  isReadOnly: true,
  // [SPEC 20.2 / D-1 (a) follow-on, 2026-05-10] Quote results MUST NOT be
  // cross-turn deduped by microcompact. Every call legitimately produces a
  // new result — pool reserves move per block, slippage windows update, the
  // best route can shift if liquidity moves, and the result's `discoveredAt`
  // timestamp is different per call by definition.
  //
  // Pre-fix: microcompact's default `cacheable: true` replaced the second
  // identical-input swap_quote tool_result with a `[Same result as call #N
  // — swap_quote with identical inputs. Result unchanged.]` placeholder.
  // The placeholder lied — the route and `discoveredAt` had legitimately
  // updated. Audric's bundle fast-path (which reads quote results from the
  // persisted ledger to thread `step.cetusRoute`) lost the fresh route and
  // had to fall back to whichever earlier same-input call WAS preserved
  // (the "first-seen" anchor, often >30s old → rejected by audric's
  // `isCetusRouteFresh` 30s gate → fast path missed → bundle paid full
  // ~400-500ms `findSwapRoute()` round-trip at confirm time).
  //
  // Production smoke trace (2026-05-10, session s_1778362657811_c0ed9009a5fb):
  //   T0     swap_quote(USDC,SUI,0.5)              → route X discovered
  //   T0+34s swap_quote(USDC,SUI,0.5) [bundle]     → route Y discovered (FRESH)
  //   T0+50s "Confirm" → fast-path walks history   → walker sees placeholder
  //                                                   on route Y, falls back
  //                                                   to route X (52s old)
  //   T0+52s prepare → cetusRoute STALE → fallback → no perf win
  //
  // With `cacheable: false`: route Y stays as full content in the ledger,
  // walker finds it (~18s old), passes the freshness gate, fast path fires.
  cacheable: false,

  async call(input, context): Promise<{ data: SwapQuoteToolResult; displayText: string }> {
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
      // [Bug A fix / 2026-05-10] Always discover routes against the
      // sponsor-safe provider set. The engine has no `ToolContext` flag
      // distinguishing sponsored vs non-sponsored callers — and even
      // non-sponsored callers (CLI direct swap) are correctly served by
      // this list because the excluded providers are Pyth-dependent
      // pools that the CLI's `tx.gas` pattern doesn't actually need
      // either (CLI users sign their own gas, but Cetus's `routerSwap`
      // still inserts the `tx.splitCoins(tx.gas, ...)` Pyth fee — fine
      // for direct signers, fatal for sponsored).
      //
      // The narrower "always exclude" stance gives up access to ~7 of
      // the 30+ Cetus providers. Smoke-tested 2026-05-10 across
      // USDC↔SUI, USDC↔GOLD, USDC↔USDsui — every pair still routes.
      // If a future pair degrades unacceptably, gate on
      // `context.sponsoredContext` instead (mirror composeTx.ts:663).
      const result = await getSwapQuote({
        walletAddress,
        from: input.from,
        to: input.to,
        amount: input.amount,
        byAmountIn: input.byAmountIn,
        providers: await getCachedSponsoredProviders(),
      });
      sink.histogram('cetus.find_route_ms', Date.now() - start);
      sink.counter('cetus.find_route_count', { outcome: 'success' });
      return {
        data: result,
        displayText: `${result.fromAmount} ${result.fromToken} → ${result.toAmount.toFixed(4)} ${result.toToken} (impact: ${(result.priceImpact * 100).toFixed(2)}%, via ${result.route})`,
      };
    } catch (err) {
      sink.counter('cetus.find_route_count', { outcome: 'error' });

      // [S.123 v1.24.7] Convert known T2000Error categories into structured
      // tool results with recovery hints, instead of re-throwing. Re-throws
      // here used to bubble all the way up to the EarlyToolDispatcher
      // promise — and before the dispatcher's `.catch` fix, that was the
      // exact path that crashed the Vercel function (process.exit(128))
      // when sSUI was queried as a symbol.
      //
      // Even with the dispatcher fix in place, returning a structured error
      // is still strictly better UX: the LLM gets a deterministic recovery
      // path (call the named tool below) instead of guessing from a
      // stringified error.
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
              ? `Token "${input.from === input.to ? input.from : `${input.from}/${input.to}`}" not in standard registry — searching for full coin type.`
              : `No swap route available for ${input.from} → ${input.to}.`,
        };
      }

      // Unknown errors still re-throw — the dispatcher's `.catch` plus the
      // process-level handler in audric/web `instrumentation.ts` ensures
      // the process survives, and `collectResults()` converts the rejection
      // into an `isError: true` tool_result. We only soft-handle errors we
      // know how to give a useful recovery hint for.
      throw err;
    }
  },
});
