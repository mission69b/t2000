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
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { resolveTokenType, getDecimalsForCoinType } from '../token-registry.js';

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
  /**
   * Optional Cetus provider allow-list. When omitted, all 30+ DEXes
   * are eligible. Sponsored flows (Enoki) MUST pass an exclusion list
   * computed via `getProvidersExcluding([...])` from the Cetus SDK to
   * remove Pyth-dependent providers (HAEDALPMM, METASTABLE, OBRIC,
   * STEAMM_OMM, STEAMM_OMM_V2, SEVENK, HAEDALHMMV2) — those reference
   * `tx.gas` for oracle fees, which Enoki rejects in sponsored txs.
   * Non-sponsored callers (CLI, direct SDK) leave this undefined.
   */
  providers?: string[];
}): Promise<SwapRouteResult | null> {
  const client = getClient(params.walletAddress, params.overlayFee);

  const findParams: FindRouterParams = {
    from: params.from,
    target: params.to,
    amount: params.amount.toString(),
    byAmountIn: params.byAmountIn,
    ...(params.providers ? { providers: params.providers } : {}),
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
 * Append a swap fragment to an existing PTB. SPEC 7 § "Layer 1" Cetus
 * appender. Two modes, dispatched by the presence of `input.inputCoin`:
 *
 * - **Wallet mode** (`inputCoin` omitted) — fetches `from`-asset coins
 *   from the sender's wallet (paginated), merges/splits to the
 *   requested amount, runs the swap. Mirrors the audric host's
 *   `transactions/prepare/route.ts` swap branch (P2.2c will retire that
 *   branch in favor of this appender via `composeTx`).
 *
 * - **Chain mode** (`inputCoin` provided) — consumes the passed-in coin
 *   reference (typically produced by an upstream appender like
 *   `addWithdrawToTx`) directly, no wallet fetch / no merge / no
 *   split. This is the SPEC 7 multi-write enabler ("withdraw → swap →
 *   save" without intermediate wallet materialization).
 *
 * **SUI in wallet mode:** uses `client.getCoins` like every other
 * token. This works for sponsored flows (Enoki — `tx.gas` belongs to
 * the sponsor, swap input comes from the user's separate SUI coin
 * objects). For non-sponsored flows where `tx.gas` IS the user's SUI,
 * the caller should pre-build the inputCoin via
 * `tx.splitCoins(tx.gas, [rawAmount])[0]` and pass it via chain mode
 * instead. (`T2000.swap()` already handles this internally — direct SDK
 * users go through the high-level class, not through this appender.)
 *
 * **`swapAll` semantics (wallet mode):** if the requested raw amount
 * is >= the wallet's total `from` balance, the appender consumes the
 * entire merged primary coin (not a split), matching audric's host
 * route's `swapAll` clipping. The returned `effectiveAmountIn` reflects
 * the actual consumed amount in display units.
 *
 * **Slippage:** clamped to [0.001, 0.05] (0.1% – 5%). Defaults to 0.01.
 *
 * @returns
 * - `coin` — output coin reference, ready for downstream consumption
 *   (e.g. `addSaveToTx`) or wallet transfer (`tx.transferObjects`).
 * - `effectiveAmountIn` — display-units input amount the swap actually
 *   consumes (handles `swapAll` clipping in wallet mode; in chain mode
 *   echoes the requested `input.amount`).
 * - `expectedAmountOut` — display-units output amount per the route
 *   quote. Actual on-chain output may differ within slippage.
 * - `route` — raw `SwapRouteResult` for downstream telemetry / logging.
 */
export async function addSwapToTx(
  tx: Transaction,
  client: SuiJsonRpcClient,
  address: string,
  input: {
    from: string;
    to: string;
    amount: number;
    slippage?: number;
    byAmountIn?: boolean;
    overlayFee?: OverlayFeeConfig;
    inputCoin?: TransactionObjectArgument;
    /**
     * Optional Cetus provider allow-list. Forwarded to `findSwapRoute`.
     * Sponsored flows (Enoki) MUST pass `getProvidersExcluding([...])`
     * to remove Pyth-dependent providers — see `findSwapRoute`'s JSDoc
     * for the exclusion list. Non-sponsored callers omit this.
     */
    providers?: string[];
  },
): Promise<{
  coin: TransactionObjectArgument;
  effectiveAmountIn: number;
  expectedAmountOut: number;
  route: SwapRouteResult;
}> {
  const { T2000Error } = await import('../errors.js');

  const fromType = resolveTokenType(input.from);
  const toType = resolveTokenType(input.to);
  if (!fromType) throw new T2000Error('ASSET_NOT_SUPPORTED', `Unknown token: ${input.from}. Provide the symbol (USDC, SUI, ...) or full coin type.`);
  if (!toType) throw new T2000Error('ASSET_NOT_SUPPORTED', `Unknown token: ${input.to}. Provide the symbol (USDC, SUI, ...) or full coin type.`);
  if (fromType === toType) throw new T2000Error('SWAP_FAILED', 'Cannot swap a token to itself');
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new T2000Error('INVALID_AMOUNT', 'Amount must be greater than zero');
  }

  const fromDecimals = getDecimalsForCoinType(fromType);
  const toDecimals = getDecimalsForCoinType(toType);
  const requestedRaw = BigInt(Math.floor(input.amount * 10 ** fromDecimals));

  const slippage = Math.max(0.001, Math.min(input.slippage ?? 0.01, 0.05));
  const byAmountIn = input.byAmountIn ?? true;

  let inputCoin: TransactionObjectArgument;
  let effectiveRaw: bigint;

  if (input.inputCoin) {
    inputCoin = input.inputCoin;
    effectiveRaw = requestedRaw;
  } else {
    const { ids, totalBalance } = await fetchAllCoinsForSwap(client, address, fromType);
    if (ids.length === 0) {
      throw new T2000Error('INSUFFICIENT_BALANCE', `No ${input.from} coins found in wallet`);
    }

    const swapAll = requestedRaw >= totalBalance;
    effectiveRaw = swapAll ? totalBalance : requestedRaw;

    const primary = tx.object(ids[0]);
    if (ids.length > 1) {
      tx.mergeCoins(primary, ids.slice(1).map((id) => tx.object(id)));
    }
    inputCoin = swapAll ? primary : tx.splitCoins(primary, [effectiveRaw])[0];
  }

  const route = await findSwapRoute({
    walletAddress: address,
    from: fromType,
    to: toType,
    amount: effectiveRaw,
    byAmountIn,
    overlayFee: input.overlayFee,
    providers: input.providers,
  });

  if (!route) {
    throw new T2000Error('SWAP_NO_ROUTE', `No swap route found for ${input.from} → ${input.to}`);
  }
  if (route.insufficientLiquidity) {
    throw new T2000Error('SWAP_NO_ROUTE', `Insufficient liquidity for ${input.from} → ${input.to}`);
  }

  const outputCoin = await buildSwapTx({
    walletAddress: address,
    route,
    tx,
    inputCoin,
    slippage,
    overlayFee: input.overlayFee,
  });

  return {
    coin: outputCoin,
    effectiveAmountIn: Number(effectiveRaw) / 10 ** fromDecimals,
    expectedAmountOut: Number(route.amountOut) / 10 ** toDecimals,
    route,
  };
}

/**
 * Paginated coin lookup for swap input selection. Local helper kept
 * inline so `cetus-swap.ts` stays self-contained — P2.2c may extract a
 * shared `wallet/coinSelection.ts` once `addStakeVSuiToTx` and the
 * future `addSendToTxFromWallet` need the same prelude.
 */
async function fetchAllCoinsForSwap(
  client: SuiJsonRpcClient,
  owner: string,
  coinType: string,
): Promise<{ ids: string[]; totalBalance: bigint }> {
  const ids: string[] = [];
  let totalBalance = 0n;
  let cursor: string | null | undefined;
  let hasNext = true;
  while (hasNext) {
    const page = await client.getCoins({ owner, coinType, cursor: cursor ?? undefined });
    for (const c of page.data) {
      ids.push(c.coinObjectId);
      totalBalance += BigInt(c.balance);
    }
    cursor = page.nextCursor;
    hasNext = page.hasNextPage;
  }
  return { ids, totalBalance };
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
