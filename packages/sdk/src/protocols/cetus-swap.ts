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

const OVERLAY_FEE_RATE = 0.001; // 0.1% swap fee
const OVERLAY_FEE_RECEIVER = process.env.T2000_TREASURY_ADDRESS
  ?? '0x3bb501b8300125dca59019247941a42af6b292a150ce3cfcce9449456be2ec91';

let clientInstance: AggregatorClient | null = null;

function getClient(walletAddress: string): AggregatorClient {
  if (clientInstance) return clientInstance;
  clientInstance = new AggregatorClient({
    signer: walletAddress,
    env: Env.Mainnet,
    overlayFeeRate: OVERLAY_FEE_RATE,
    overlayFeeReceiver: OVERLAY_FEE_RECEIVER,
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

// Re-export from the canonical token registry for backward-compat.
export { TOKEN_MAP, resolveTokenType } from '../token-registry.js';
