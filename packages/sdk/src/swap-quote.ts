/**
 * Standalone swap quote — no T2000 agent instance required.
 * Only needs a wallet address for Cetus Aggregator routing.
 */
import { SUPPORTED_ASSETS } from './constants.js';
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

  const fromEntry = Object.values(TOKEN_MAP).includes(fromType)
    ? Object.entries(SUPPORTED_ASSETS).find(([, v]) => v.type === fromType)
    : null;
  const fromDecimals = fromEntry ? fromEntry[1].decimals : (fromType === '0x2::sui::SUI' ? 9 : 6);
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

  const toEntry = Object.entries(SUPPORTED_ASSETS).find(([, v]) => v.type === toType);
  const toDecimals = toEntry ? toEntry[1].decimals : (toType === '0x2::sui::SUI' ? 9 : 6);
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
