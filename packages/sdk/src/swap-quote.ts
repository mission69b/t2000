/**
 * Standalone swap quote — no T2000 agent instance required.
 * Only needs a wallet address for Cetus Aggregator routing.
 */
import { getDecimalsForCoinType } from './token-registry.js';
import type { SwapQuoteResult } from './types.js';

export async function getSwapQuote(params: {
  walletAddress: string;
  from: string;
  to: string;
  amount: number;
  byAmountIn?: boolean;
}): Promise<SwapQuoteResult> {
  const { findSwapRoute, resolveTokenType, TOKEN_MAP } = await import('./protocols/cetus-swap.js');

  const fromType = resolveTokenType(params.from);
  const toType = resolveTokenType(params.to);
  if (!fromType) throw new Error(`Unknown token: ${params.from}. Provide the full coin type.`);
  if (!toType) throw new Error(`Unknown token: ${params.to}. Provide the full coin type.`);

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

  if (!route) throw new Error(`No swap route found for ${params.from} -> ${params.to}.`);
  if (route.insufficientLiquidity) throw new Error(`Insufficient liquidity for ${params.from} -> ${params.to}.`);

  const toDecimals = getDecimalsForCoinType(toType);
  const fromAmount = Number(route.amountIn) / 10 ** fromDecimals;
  const toAmount = Number(route.amountOut) / 10 ** toDecimals;

  const routeDesc = route.routerData.paths
    ?.map((p: { provider?: string }) => p.provider)
    .filter(Boolean)
    .slice(0, 3)
    .join(' + ') ?? 'Cetus Aggregator';

  return {
    fromToken: params.from,
    toToken: params.to,
    fromAmount,
    toAmount,
    priceImpact: route.priceImpact,
    route: routeDesc,
  };
}
