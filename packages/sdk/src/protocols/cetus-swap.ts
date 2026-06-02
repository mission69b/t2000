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
import BN from 'bn.js';
import { resolveTokenType, getDecimalsForCoinType } from '../token-registry.js';
import type { SponsoredCoinMergeCache } from '../wallet/coinSelection.js';

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

// [SPEC 20.2 / D-1 (a)] Typed JSON-friendly representation of a Cetus
// `RouterDataV3` for cross-process / cross-network transport. The native
// shape contains `BN` instances (`bn.js`) and a `Map<string, string>`
// (`packages`) that don't survive JSON.stringify / JSON.parse cleanly:
// - `BN.toJSON()` returns the internal `{negative,words,length,red}` blob
// - `Map.toJSON()` returns `{}`
// Round-tripping via `serializeCetusRoute` + `deserializeCetusRoute`
// converts BN ↔ decimal string and Map ↔ Record. Engine + audric both
// reference fields by path (`route.routerData.paths[i].provider`) without
// needing to know about the underlying BN/Map types.
export interface SerializedCetusRoutePath {
  id: string;
  direction: boolean;
  provider: string;
  from: string;
  target: string;
  feeRate: number;
  amountIn: string;
  amountOut: string;
  version?: string;
  publishedAt?: string;
  extendedDetails?: Record<string, unknown>;
}

export interface SerializedRouterDataV3 {
  quoteID?: string;
  /** RouterDataV3.amountIn (BN) → decimal string */
  amountIn: string;
  /** RouterDataV3.amountOut (BN) → decimal string */
  amountOut: string;
  byAmountIn: boolean;
  paths: SerializedCetusRoutePath[];
  insufficientLiquidity: boolean;
  deviationRatio: number;
  /** RouterDataV3.packages (Map) → Record */
  packages?: Record<string, string>;
  totalDeepFee?: number;
  error?: { code: number; msg: string };
  overlayFee?: number;
}

export interface SerializedCetusRoute {
  routerData: SerializedRouterDataV3;
  amountIn: string;
  amountOut: string;
  byAmountIn: boolean;
  priceImpact: number;
  insufficientLiquidity: boolean;
  /**
   * Wall-clock timestamp (ms since epoch) at which the route was discovered.
   * Used by audric's prepare-route for SPEC 20.2 D-3 TTL re-validation: if
   * the route is older than the threshold AND price impact has shifted
   * beyond tolerance, fall back to a fresh `findSwapRoute()` call.
   */
  discoveredAt: number;
  /**
   * Snapshot of the input/output coin types the route was discovered for.
   * SPEC 20.2 D-2 (b) structural verification: prepare-route asserts
   * input/output coins match before using the fast-path; mismatch falls
   * back to fresh discovery (defense against client-side tampering and
   * against legitimate token-type drift in the request).
   */
  fromCoinType: string;
  toCoinType: string;
}

export function serializeCetusRoute(
  route: SwapRouteResult,
  context: { fromCoinType: string; toCoinType: string },
): SerializedCetusRoute {
  return {
    routerData: serializeRouterDataV3(route.routerData),
    amountIn: route.amountIn,
    amountOut: route.amountOut,
    byAmountIn: route.byAmountIn,
    priceImpact: route.priceImpact,
    insufficientLiquidity: route.insufficientLiquidity,
    discoveredAt: Date.now(),
    fromCoinType: context.fromCoinType,
    toCoinType: context.toCoinType,
  };
}

export function deserializeCetusRoute(serialized: SerializedCetusRoute): SwapRouteResult {
  return {
    routerData: deserializeRouterDataV3(serialized.routerData),
    amountIn: serialized.amountIn,
    amountOut: serialized.amountOut,
    byAmountIn: serialized.byAmountIn,
    priceImpact: serialized.priceImpact,
    insufficientLiquidity: serialized.insufficientLiquidity,
  };
}

function serializeRouterDataV3(rd: RouterDataV3): SerializedRouterDataV3 {
  const out: SerializedRouterDataV3 = {
    amountIn: rd.amountIn.toString(),
    amountOut: rd.amountOut.toString(),
    byAmountIn: rd.byAmountIn,
    paths: rd.paths.map(serializeCetusRoutePath),
    insufficientLiquidity: rd.insufficientLiquidity,
    deviationRatio: rd.deviationRatio,
  };
  if (rd.quoteID !== undefined) out.quoteID = rd.quoteID;
  if (rd.packages) {
    const obj: Record<string, string> = {};
    for (const [k, v] of rd.packages) obj[k] = v;
    out.packages = obj;
  }
  if (rd.totalDeepFee !== undefined) out.totalDeepFee = rd.totalDeepFee;
  if (rd.error) out.error = { code: rd.error.code, msg: rd.error.msg };
  if (rd.overlayFee !== undefined) out.overlayFee = rd.overlayFee;
  return out;
}

function deserializeRouterDataV3(s: SerializedRouterDataV3): RouterDataV3 {
  const out: RouterDataV3 = {
    amountIn: new BN(s.amountIn),
    amountOut: new BN(s.amountOut),
    byAmountIn: s.byAmountIn,
    paths: s.paths.map(deserializeCetusRoutePath),
    insufficientLiquidity: s.insufficientLiquidity,
    deviationRatio: s.deviationRatio,
  };
  if (s.quoteID !== undefined) out.quoteID = s.quoteID;
  if (s.packages) out.packages = new Map(Object.entries(s.packages));
  if (s.totalDeepFee !== undefined) out.totalDeepFee = s.totalDeepFee;
  if (s.error) out.error = { code: s.error.code, msg: s.error.msg };
  if (s.overlayFee !== undefined) out.overlayFee = s.overlayFee;
  return out;
}

function serializeCetusRoutePath(p: RouterDataV3['paths'][number]): SerializedCetusRoutePath {
  const out: SerializedCetusRoutePath = {
    id: p.id,
    direction: p.direction,
    provider: p.provider,
    from: p.from,
    target: p.target,
    feeRate: p.feeRate,
    amountIn: p.amountIn,
    amountOut: p.amountOut,
  };
  if (p.version !== undefined) out.version = p.version;
  if (p.publishedAt !== undefined) out.publishedAt = p.publishedAt;
  if (p.extendedDetails) out.extendedDetails = { ...p.extendedDetails };
  return out;
}

function deserializeCetusRoutePath(p: SerializedCetusRoutePath): RouterDataV3['paths'][number] {
  const out: RouterDataV3['paths'][number] = {
    id: p.id,
    direction: p.direction,
    provider: p.provider,
    from: p.from,
    target: p.target,
    feeRate: p.feeRate,
    amountIn: p.amountIn,
    amountOut: p.amountOut,
  };
  if (p.version !== undefined) out.version = p.version;
  if (p.publishedAt !== undefined) out.publishedAt = p.publishedAt;
  if (p.extendedDetails) out.extendedDetails = { ...p.extendedDetails };
  return out;
}

/**
 * SPEC 20.2 D-2 (b) structural verification helper. Returns true when the
 * serialized route matches the requested coin types (i.e. it's safe to use
 * as the prepare-route fast-path), false otherwise (tampered, or input
 * mismatch from a legitimate but stale pending action). Caller falls back
 * to a fresh `findSwapRoute()` call when verification fails.
 */
export function verifyCetusRouteCoinMatch(
  serialized: SerializedCetusRoute,
  expected: { fromCoinType: string; toCoinType: string },
): boolean {
  return serialized.fromCoinType === expected.fromCoinType && serialized.toCoinType === expected.toCoinType;
}

/**
 * SPEC 20.2 D-3 (b) TTL helper. Returns true when the serialized route is
 * fresh enough to use as the fast-path (< `maxAgeMs` old). Returns false
 * for stale routes — caller falls back to fresh `findSwapRoute()` to pick
 * up any pool-price drift since route discovery.
 *
 * Default 30s aligns with the existing quote-freshness contract surfaced
 * to users via `pending_action.quoteAge` (the PermissionCard "QUOTE Ns OLD"
 * badge starts warning the user past 30s).
 */
export function isCetusRouteFresh(serialized: SerializedCetusRoute, maxAgeMs: number = 30_000): boolean {
  return Date.now() - serialized.discoveredAt < maxAgeMs;
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
 * [Bug A defense-in-depth / 2026-05-10] Returns true when every path
 * provider in `route.routerData.paths` is present in the active
 * `providers` allow-list. Cetus's `getProvidersExcluding(...)` returns
 * an inclusion list (the complement of the exclusion), so when a caller
 * passes `providers`, every walked provider must be IN that list to be
 * compatible.
 *
 * When `providers` is undefined (non-sponsored caller, e.g. CLI) every
 * route is compatible — same semantics as `findSwapRoute` itself.
 *
 * Why per-path: a Cetus aggregator route can split across multiple DEXes
 * (e.g. 60% Cetus + 40% Bluefin). A single excluded provider in any path
 * triggers `tx.gas` usage in `routerSwap`. Reject the whole route if any
 * leg is excluded.
 */
export function isPrecomputedRouteCompatibleWithProviders(
  route: SwapRouteResult,
  providers: string[] | undefined,
): boolean {
  if (!providers || providers.length === 0) return true;
  const allowed = new Set(providers);
  for (const path of route.routerData.paths) {
    if (!allowed.has(path.provider)) return false;
  }
  return true;
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
 * - **Wallet mode** (`inputCoin` omitted) — sources `from`-asset funds
 *   via `coinWithBalance({ type, balance })` (resolves coin objects +
 *   address balance at build time), runs the swap. Mirrors the audric
 *   host's `transactions/prepare/route.ts` swap branch (P2.2c will
 *   retire that branch in favor of this appender via `composeTx`).
 *
 * - **Chain mode** (`inputCoin` provided) — consumes the passed-in coin
 *   reference (typically produced by an upstream appender like
 *   `addWithdrawToTx`) directly, no wallet fetch / no merge / no
 *   split. This is the SPEC 7 multi-write enabler ("withdraw → swap →
 *   save" without intermediate wallet materialization).
 *
 * **SUI in wallet mode:** ALWAYS sources through `selectSuiCoin` (which
 * routes via `coinWithBalance({ type: SUI, useGasCoin: false })` under
 * sponsored flows, OR `tx.splitCoins(tx.gas, ...)` under self-funded
 * flows). The caller MUST set `sponsoredContext` correctly — otherwise
 * sponsored swaps with SUI source fail with `Cannot use GasCoin as a
 * transaction argument` (Enoki owns `tx.gas`, the PTB body referencing
 * it as an argument is invalid for sponsorship). 2.14.0 shipped without
 * this branch and broke audric/web-v2 SUI→USDC swaps; restored in 2.14.1
 * (S.260). For non-sponsored flows (CLI), `T2000.swap()` pre-builds the
 * inputCoin via `tx.splitCoins(tx.gas, [rawAmount])[0]` and uses chain
 * mode, sidestepping wallet-mode entirely — this branch is a defensive
 * safety net for future direct SDK users who pass SUI in wallet mode.
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
    /**
     * [SPEC 20.2 D-3 (b)] Precomputed route from a prior `findSwapRoute()`
     * call (typically captured by `swap_quote` and threaded through
     * `pending_action.cetusRoute`). When present AND not stale (per
     * `isCetusRouteFresh`) AND the input/output coins match, this skips
     * the ~400-500ms `findSwapRoute()` discovery call. Stale routes are
     * silently ignored (caller falls back to fresh discovery).
     *
     * Caller responsibility: pass the SAME `overlayFee` / `providers` /
     * `byAmountIn` that produced the precomputed route. Mismatch will
     * still produce a working swap but may use the wrong overlay-fee
     * config (the route data already encodes the chosen DEX path).
     */
    precomputedRoute?: SwapRouteResult;
    /**
     * Whether this swap is being built inside a sponsored-tx flow (Enoki)
     * vs self-funded (CLI / direct sign). Load-bearing for SUI-source
     * swaps in wallet mode: under sponsored flows, `tx.gas` belongs to
     * the sponsor and CANNOT be referenced as a transaction argument
     * (Sui protocol rejects with `Cannot use GasCoin as a transaction
     * argument`). When `true`, SUI source routes through `selectSuiCoin`
     * with `useGasCoin: false` so the resolver sources from the user's
     * SUI coin objects + address balance instead. Defaults to `false`
     * (back-compat — pre-2.14.1 behavior). Audric/web-v2's compose path
     * threads this through via `composeTx({ sponsoredContext: true })`.
     */
    sponsoredContext?: boolean;
    /**
     * Per-PTB merge cache for sponsored coin-object sourcing (any coin
     * type — SUI in the dedicated branch, USDC/USDsui/etc. in the wallet
     * branch). Provided by `composeTx`'s orchestration loop so multiple
     * legs sourcing the same coin in one bundle share a single merged
     * primary coin instead of each emitting its own `mergeCoins` (the
     * second of which references already-consumed coins → Enoki dry-run
     * `ArgumentWithoutValue`). Single swaps don't need it; omit. See
     * `SponsoredCoinMergeCache` JSDoc.
     */
    coinMergeCache?: SponsoredCoinMergeCache;
  },
): Promise<{
  coin: TransactionObjectArgument;
  effectiveAmountIn: number;
  expectedAmountOut: number;
  route: SwapRouteResult;
  /** True when `precomputedRoute` was used (no `findSwapRoute()` call). */
  usedPrecomputedRoute: boolean;
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
  } else if (fromType === '0x2::sui::SUI') {
    // SUI source needs special handling: under sponsored flows (Enoki),
    // referencing `tx.gas` as a transaction argument is forbidden (sponsor
    // owns the gas coin). `selectSuiCoin` does the right thing for both
    // sponsored (uses `coinWithBalance({ useGasCoin: false })`) and
    // self-funded (splits from `tx.gas` directly). The 2.14.0 release
    // shipped without this branch and broke audric/web-v2 SUI→USDC swaps
    // ("Cannot use GasCoin as a transaction argument" from Enoki); fixed
    // in 2.14.1 (S.260).
    const { selectSuiCoin } = await import('../wallet/coinSelection.js');
    const result = await selectSuiCoin(
      tx,
      client,
      address,
      requestedRaw,
      input.sponsoredContext ?? false,
      input.coinMergeCache,
    );
    inputCoin = result.coin;
    effectiveRaw = result.effectiveAmount;
  } else {
    // Non-SUI wallet-mode source — delegate to the canonical prelude.
    // NON-sponsored: pre-flights against `getBalance().totalBalance` and
    // returns a `coinWithBalance({ type, balance })` arg, whose `@mysten/sui`
    // resolver batches all intents for a coin type into a single build-time
    // merge — so same-asset multi-leg bundles dedup automatically.
    //
    // SPONSORED: routes through `selectCoinObjectsOnly` instead (coinWithBalance's
    // address-balance `FundsWithdrawal` reservation is what Enoki can't
    // deserialize, issue #93). That manual path has NO build-time batching, so
    // two legs sourcing the same coin would each emit their own `mergeCoins`
    // over the SAME objects → second merge references consumed coins → Enoki
    // dry-run `ArgumentWithoutValue`. The `coinMergeCache` supplies the dedup:
    // first leg merges once + caches the primary, later legs split from it.
    const { selectAndSplitCoin } = await import('../wallet/coinSelection.js');
    const result = await selectAndSplitCoin(tx, client, address, fromType, requestedRaw, {
      sponsoredContext: input.sponsoredContext ?? false,
      mergeCache: input.coinMergeCache,
    });
    inputCoin = result.coin;
    effectiveRaw = result.effectiveAmount;
  }

  // [SPEC 20.2 D-3 (b)] Use the precomputed route when available + valid.
  // Validity = same input/output coin types AND the requested raw amount
  // matches what the route was discovered for (mismatch indicates the user
  // edited the amount post-quote, in which case we must re-discover at the
  // new amount because price impact is amount-dependent). The caller
  // (`audric prepare-route`) owns the staleness check (`isCetusRouteFresh`)
  // and only forwards `precomputedRoute` when fresh.
  //
  // [Bug A defense-in-depth / 2026-05-10] Even with the engine fix that
  // makes `swap_quote` discover sponsor-safe routes, this layer also
  // validates the precomputed route against the active providers
  // allow-list. If the route walks any excluded provider (e.g. a stale
  // `pending_action.cetusRoute` from before the engine fix shipped, or a
  // provider list that drifted between quote and execute), fall back to
  // fresh discovery. Better to eat 400ms than to let a Pyth-dependent
  // route reach Enoki and revert with HTTP 400.
  let route: SwapRouteResult | null;
  let usedPrecomputedRoute = false;
  if (
    input.precomputedRoute &&
    input.precomputedRoute.amountIn === effectiveRaw.toString() &&
    input.precomputedRoute.byAmountIn === byAmountIn &&
    isPrecomputedRouteCompatibleWithProviders(input.precomputedRoute, input.providers)
  ) {
    route = input.precomputedRoute;
    usedPrecomputedRoute = true;
  } else {
    route = await findSwapRoute({
      walletAddress: address,
      from: fromType,
      to: toType,
      amount: effectiveRaw,
      byAmountIn,
      overlayFee: input.overlayFee,
      providers: input.providers,
    });
  }

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
    usedPrecomputedRoute,
  };
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
