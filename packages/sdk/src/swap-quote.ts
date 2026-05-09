/**
 * Standalone swap quote — no T2000 agent instance required.
 * Only needs a wallet address for Cetus Aggregator routing.
 */
import { T2000Error } from './errors.js';
import { getDecimalsForCoinType } from './token-registry.js';
import type { SwapQuoteResult } from './types.js';

export async function getSwapQuote(params: {
  walletAddress: string;
  from: string;
  to: string;
  amount: number;
  byAmountIn?: boolean;
}): Promise<SwapQuoteResult> {
  const { findSwapRoute, resolveTokenType } = await import('./protocols/cetus-swap.js');

  const fromType = resolveTokenType(params.from);
  const toType = resolveTokenType(params.to);
  // [S.123 v1.24.7] Use T2000Error('ASSET_NOT_SUPPORTED') consistently with the
  // other 4 throw sites in t2000.ts / cetus-swap.ts. Allows tools to branch
  // on `err.code === 'ASSET_NOT_SUPPORTED'` and return a structured recovery
  // hint to the LLM instead of re-throwing a generic error string.
  if (!fromType) {
    throw new T2000Error(
      'ASSET_NOT_SUPPORTED',
      `Unknown token: ${params.from}. Provide the symbol (USDC, SUI, ...) or full coin type.`,
    );
  }
  if (!toType) {
    throw new T2000Error(
      'ASSET_NOT_SUPPORTED',
      `Unknown token: ${params.to}. Provide the symbol (USDC, SUI, ...) or full coin type.`,
    );
  }

  const byAmountIn = params.byAmountIn ?? true;

  const fromDecimals = getDecimalsForCoinType(fromType);
  const rawAmount = BigInt(Math.floor(params.amount * 10 ** fromDecimals));

  const route = await findSwapRoute({
    walletAddress: params.walletAddress,
    from: fromType,
    to: toType,
    amount: rawAmount,
    byAmountIn,
  });

  if (!route) throw new T2000Error('SWAP_FAILED', `No swap route found for ${params.from} -> ${params.to}.`);
  if (route.insufficientLiquidity) {
    throw new T2000Error('SWAP_FAILED', `Insufficient liquidity for ${params.from} -> ${params.to}.`);
  }

  const toDecimals = getDecimalsForCoinType(toType);
  const fromAmount = Number(route.amountIn) / 10 ** fromDecimals;
  const toAmount = Number(route.amountOut) / 10 ** toDecimals;

  const routeDesc = route.routerData.paths
    ?.map((p: { provider?: string }) => p.provider)
    .filter(Boolean)
    .slice(0, 3)
    .join(' + ') ?? 'Cetus Aggregator';

  // [SPEC 20.2 / D-1 (a)] Serialize the Cetus route at quote time so the
  // engine can attach it to `pending_action.cetusRoute`. The serialized
  // form survives the SSE → client → POST → prepare-route hop without losing
  // BN/Map fidelity (raw RouterDataV3 doesn't JSON-stringify cleanly).
  const { serializeCetusRoute } = await import('./protocols/cetus-swap.js');
  const serializedRoute = serializeCetusRoute(route, { fromCoinType: fromType, toCoinType: toType });

  return {
    fromToken: params.from,
    toToken: params.to,
    fromAmount,
    toAmount,
    priceImpact: route.priceImpact,
    route: routeDesc,
    serializedRoute,
  };
}
