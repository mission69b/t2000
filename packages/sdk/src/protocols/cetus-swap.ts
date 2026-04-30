/**
 * Cetus Aggregator V3 SDK wrapper — the ONLY file that imports @cetusprotocol/aggregator-sdk.
 * Documented CLAUDE.md exception: multi-DEX routing cannot be feasibly replaced by thin tx builders.
 *
 * [B5 v2 / @t2000/sdk@1.1.0 / 2026-04-30]
 * Overlay fee config is now per-call instead of a module-level singleton. CLI / direct
 * SDK callers (`T2000.swap()`) DON'T pass `overlayFee` → fee-free swap. Audric's
 * prepare/route.ts ALWAYS passes `overlayFee = { rate: OVERLAY_FEE_RATE, receiver:
 * T2000_OVERLAY_FEE_WALLET }` → fee charged. Structural inclusion (Audric's code can't
 * forget to pass it because it IS the code), not a toggle that defaults to safe.
 *
 * Pre-1.1.0: a module-level `OVERLAY_FEE_RECEIVER` constant defaulted to a Move object
 * ID. USDC sent there became OwnedObjects keyed to the object and was inaccessible.
 * Fixed by making the receiver a regular wallet address (T2000_OVERLAY_FEE_WALLET) AND
 * by removing the singleton pattern that hid the misconfig.
 */
import { AggregatorClient, Env, type FindRouterParams, type RouterDataV3 } from '@cetusprotocol/aggregator-sdk';
import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';

export interface OverlayFeeConfig {
  /** Fee rate as a fraction (e.g. 0.001 = 0.1%). Pass 0 to disable. */
  rate: number;
  /** Wallet address that receives the overlay fee. */
  receiver: string;
}

export interface SwapRouteResult {
  routerData: RouterDataV3;
  amountIn: string;
  amountOut: string;
  byAmountIn: boolean;
  priceImpact: number;
  insufficientLiquidity: boolean;
}

/**
 * Default Audric swap overlay fee — 0.1%. Exported for consumers that want to use
 * the canonical Audric rate (the Audric prepare-route does this). Changing this
 * rate requires a coordinated SDK + audric release.
 */
export const OVERLAY_FEE_RATE = 0.001;

/**
 * Cache `AggregatorClient` instances by `(signer + overlay rate + overlay receiver)`.
 * Per-call instantiation is cheap (the client is mostly config), but caching avoids
 * pointless re-allocation when the same caller swaps multiple times in a loop.
 */
const clientCache = new Map<string, AggregatorClient>();

function getClient(walletAddress: string, overlayFee?: OverlayFeeConfig): AggregatorClient {
  const rate = overlayFee?.rate ?? 0;
  const receiver = overlayFee?.receiver ?? '';
  const key = `${walletAddress}|${rate}|${receiver}`;

  const cached = clientCache.get(key);
  if (cached) return cached;

  const client = new AggregatorClient({
    signer: walletAddress,
    env: Env.Mainnet,
    ...(rate > 0 && receiver
      ? { overlayFeeRate: rate, overlayFeeReceiver: receiver }
      : {}),
  });
  clientCache.set(key, client);
  return client;
}

/**
 * Find the optimal swap route via Cetus Aggregator REST API.
 *
 * Pass `overlayFee` to charge an overlay fee on the output (Audric's pattern).
 * Omit it for a fee-free swap (CLI / direct SDK pattern).
 */
export async function findSwapRoute(params: {
  walletAddress: string;
  from: string;
  to: string;
  amount: bigint;
  byAmountIn: boolean;
  overlayFee?: OverlayFeeConfig;
}): Promise<SwapRouteResult | null> {
  const client = getClient(params.walletAddress, params.overlayFee);

  const findParams: FindRouterParams = {
    from: params.from,
    target: params.to,
    amount: params.amount.toString(),
    byAmountIn: params.byAmountIn,
  };

  const routerData = await client.findRouters(findParams);
  if (!routerData) return null;

  if (routerData.insufficientLiquidity) {
    return {
      routerData,
      amountIn: routerData.amountIn.toString(),
      amountOut: routerData.amountOut.toString(),
      byAmountIn: params.byAmountIn,
      priceImpact: normalizePriceImpact(routerData.deviationRatio),
      insufficientLiquidity: true,
    };
  }

  if (routerData.error) {
    const { T2000Error } = await import('../errors.js');
    throw new T2000Error('SWAP_FAILED', `Cetus routing error: ${routerData.error.msg} (code ${routerData.error.code})`);
  }

  return {
    routerData,
    amountIn: routerData.amountIn.toString(),
    amountOut: routerData.amountOut.toString(),
    byAmountIn: params.byAmountIn,
    priceImpact: normalizePriceImpact(routerData.deviationRatio),
    insufficientLiquidity: false,
  };
}

/**
 * Cetus' aggregator types `deviationRatio` as `number`, but in some routes
 * the router actually returns a string ("0.001234"). The SDK type lies, so we
 * always coerce to a finite number here (NaN/null/undefined → 0). Without
 * this every downstream consumer that calls `priceImpact.toFixed(...)` will
 * crash at runtime — including the Audric SwapQuoteCard, which takes the
 * whole chat UI down through its error boundary.
 */
function normalizePriceImpact(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Build a swap PTB from a route result. The caller must provide an input coin
 * obtained by splitting/merging wallet coins.
 *
 * **Important:** Cetus's `routerSwap` reads the overlay-fee config from the
 * AggregatorClient instance. The `overlayFee` param here MUST match the one
 * passed to `findSwapRoute` for the same swap (otherwise you'll hit the cache
 * boundary and get a different client with different overlay config).
 */
export async function buildSwapTx(params: {
  walletAddress: string;
  route: SwapRouteResult;
  tx: Transaction;
  inputCoin: TransactionObjectArgument;
  slippage: number;
  overlayFee?: OverlayFeeConfig;
}): Promise<TransactionObjectArgument> {
  const client = getClient(params.walletAddress, params.overlayFee);
  const clampedSlippage = Math.max(0.001, Math.min(params.slippage, 0.05));

  const outputCoin = await client.routerSwap({
    router: params.route.routerData,
    inputCoin: params.inputCoin,
    slippage: clampedSlippage,
    txb: params.tx,
  });

  return outputCoin;
}

/**
 * Simulate a swap transaction without executing it.
 */
export async function simulateSwap(params: {
  walletAddress: string;
  tx: Transaction;
  overlayFee?: OverlayFeeConfig;
}): Promise<{ success: boolean; error?: string }> {
  const client = getClient(params.walletAddress, params.overlayFee);
  try {
    await client.devInspectTransactionBlock(params.tx);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Re-export from the canonical token registry for backward-compat.
export { TOKEN_MAP, resolveTokenType } from '../token-registry.js';
