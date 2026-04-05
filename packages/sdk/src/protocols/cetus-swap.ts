/**
 * Cetus Aggregator V3 SDK wrapper — the ONLY file that imports @cetusprotocol/aggregator-sdk.
 * Documented CLAUDE.md exception: multi-DEX routing cannot be feasibly replaced by thin tx builders.
 */
import { AggregatorClient, Env, type FindRouterParams, type RouterDataV3 } from '@cetusprotocol/aggregator-sdk';
import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';

export interface SwapRouteResult {
  routerData: RouterDataV3;
  amountIn: string;
  amountOut: string;
  byAmountIn: boolean;
  priceImpact: number;
  insufficientLiquidity: boolean;
}

let clientInstance: AggregatorClient | null = null;

function getClient(walletAddress: string): AggregatorClient {
  if (clientInstance) return clientInstance;
  clientInstance = new AggregatorClient({
    signer: walletAddress,
    env: Env.Mainnet,
  });
  return clientInstance;
}

/**
 * Find the optimal swap route via Cetus Aggregator REST API.
 */
export async function findSwapRoute(params: {
  walletAddress: string;
  from: string;
  to: string;
  amount: bigint;
  byAmountIn: boolean;
}): Promise<SwapRouteResult | null> {
  const client = getClient(params.walletAddress);

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
      priceImpact: routerData.deviationRatio,
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
    priceImpact: routerData.deviationRatio,
    insufficientLiquidity: false,
  };
}

/**
 * Build a swap PTB from a route result. The caller must provide an input coin
 * obtained by splitting/merging wallet coins.
 */
export async function buildSwapTx(params: {
  walletAddress: string;
  route: SwapRouteResult;
  tx: Transaction;
  inputCoin: TransactionObjectArgument;
  slippage: number;
}): Promise<TransactionObjectArgument> {
  const client = getClient(params.walletAddress);
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
}): Promise<{ success: boolean; error?: string }> {
  const client = getClient(params.walletAddress);
  try {
    await client.devInspectTransactionBlock(params.tx);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Well-known Sui token types for user-friendly name resolution
export const TOKEN_MAP: Record<string, string> = {
  SUI: '0x2::sui::SUI',
  USDC: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
  USDT: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT',
  CETUS: '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS',
  DEEP: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP',
  NAVX: '0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX',
  vSUI: '0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT',
  haSUI: '0xbde4ba4c2e274a60ce15c1cfff9e5c42e136a8bc::hasui::HASUI',
  afSUI: '0xf325ce1300e8dac124071d3152c5c5ee6174914f8bc2161e88329cf579246efc::afsui::AFSUI',
  WAL: '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL',
  ETH: '0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH',
  wBTC: '0x0041f9f9344cac094454cd574e333c4fdb132d7bcc9379bcd4aab485b2a63942::wbtc::WBTC',
  FDUSD: '0xf16e6b723f242ec745dfd7634ad072c42d5c1d9ac9d62a39c381303eaa57693a::fdusd::FDUSD',
  AUSD: '0x2053d08c1e2bd02791056171aab0fd12bd7cd7efad2ab8f6b9c8902f14df2ff2::ausd::AUSD',
  BUCK: '0xce7ff77a83ea0cb6fd39bd8748e2ec89a3f41e8efdc3f4eb123e0ca37b184db2::buck::BUCK',
  USDe: '0x41d587e5336f1c86cad50d38a7136db99333bb9bda91cea4ba69115defeb1402::sui_usde::SUI_USDE',
  USDSUI: '0x44f838219cf67b058f3b37907b655f226153c18e33dfcd0da559a844fea9b1c1::usdsui::USDSUI',
  MANIFEST: '0xc466c28d87b3d5cd34f3d5c088751532d71a38d93a8aae4551dd56272cfb4355::manifest::MANIFEST',
  NS: '0x5145494a5f5100e645e4b0aa950fa6b68f614e8c59e17bc5ded3495123a79178::ns::NS',
  BLUB: '0xfa7ac3951fdca12c1b6d18eb19e1aa2fbc31e4d45773c8e45b4ded3ef8d83f8a::blub::BLUB',
  SCA: '0x7016aae72cfc67f2fadf55769c0a7dd54291a583b63051a5ed71081cce836ac6::sca::SCA',
  TURBOS: '0x5d1f47ea69bb0de31c313d7acf89b890dbb8991ea8e03c6c355171f84bb1ba4a::turbos::TURBOS',
};

/**
 * Resolve a user-friendly token name ("SUI", "USDC") to its full coin type string.
 * Returns the input unchanged if already a full coin type (contains "::").
 */
export function resolveTokenType(nameOrType: string): string | null {
  if (nameOrType.includes('::')) return nameOrType;
  return TOKEN_MAP[nameOrType.toUpperCase()] ?? null;
}
