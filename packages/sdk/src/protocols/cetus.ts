import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import { AggregatorClient, Env } from '@cetusprotocol/aggregator-sdk';
import { SUPPORTED_ASSETS, CETUS_USDC_SUI_POOL } from '../constants.js';
import { T2000Error } from '../errors.js';
import type { GasMethod } from '../types.js';

const DEFAULT_SLIPPAGE_BPS = 300; // 3%

export interface SwapBuildResult {
  tx: Transaction;
  estimatedOut: number;
  toDecimals: number;
}

function createAggregatorClient(client: SuiJsonRpcClient, signer?: string): AggregatorClient {
  // Cetus SDK bundles @mysten/sui v1 internally — the runtime API is
  // identical to SuiJsonRpcClient, so the cast is safe.
  return new AggregatorClient({
    client: client as never,
    signer,
    env: Env.Mainnet,
  });
}

export async function buildSwapTx(params: {
  client: SuiJsonRpcClient;
  address: string;
  fromAsset: string;
  toAsset: string;
  amount: number;
  maxSlippageBps?: number;
}): Promise<SwapBuildResult> {
  const { client, address, fromAsset, toAsset, amount, maxSlippageBps = DEFAULT_SLIPPAGE_BPS } = params;

  const fromInfo = SUPPORTED_ASSETS[fromAsset as keyof typeof SUPPORTED_ASSETS];
  const toInfo = SUPPORTED_ASSETS[toAsset as keyof typeof SUPPORTED_ASSETS];

  if (!fromInfo || !toInfo) {
    throw new T2000Error('ASSET_NOT_SUPPORTED', `Swap pair ${fromAsset}/${toAsset} is not supported`);
  }
  const rawAmount = BigInt(Math.floor(amount * 10 ** fromInfo.decimals));

  const aggClient = createAggregatorClient(client, address);

  const _origLog = console.log;
  console.log = () => {};
  let result;
  try {
    result = await aggClient.findRouters({
      from: fromInfo.type,
      target: toInfo.type,
      amount: rawAmount,
      byAmountIn: true,
    });
  } finally {
    console.log = _origLog;
  }

  if (!result || result.insufficientLiquidity) {
    throw new T2000Error(
      'ASSET_NOT_SUPPORTED',
      `No swap route found for ${fromAsset} → ${toAsset}`,
    );
  }

  const tx = new Transaction();
  const slippage = maxSlippageBps / 10000;

  console.log = () => {};
  try {
    await aggClient.fastRouterSwap({
      router: result,
      txb: tx as never,
      slippage,
    });
  } finally {
    console.log = _origLog;
  }

  const estimatedOut = Number(result.amountOut.toString());

  return {
    tx,
    estimatedOut,
    toDecimals: toInfo.decimals,
  };
}

/**
 * Composable variant: adds swap commands to an existing PTB using
 * routerSwap (accepts inputCoin, returns targetCoin).
 */
export async function addSwapToTx(params: {
  tx: Transaction;
  client: SuiJsonRpcClient;
  address: string;
  inputCoin: TransactionObjectArgument;
  fromAsset: string;
  toAsset: string;
  amount: number;
  maxSlippageBps?: number;
}): Promise<{ outputCoin: TransactionObjectArgument; estimatedOut: number; toDecimals: number }> {
  const { tx, client, address, inputCoin, fromAsset, toAsset, amount, maxSlippageBps = DEFAULT_SLIPPAGE_BPS } = params;

  const fromInfo = SUPPORTED_ASSETS[fromAsset as keyof typeof SUPPORTED_ASSETS];
  const toInfo = SUPPORTED_ASSETS[toAsset as keyof typeof SUPPORTED_ASSETS];

  if (!fromInfo || !toInfo) {
    throw new T2000Error('ASSET_NOT_SUPPORTED', `Swap pair ${fromAsset}/${toAsset} is not supported`);
  }
  const rawAmount = BigInt(Math.floor(amount * 10 ** fromInfo.decimals));

  const aggClient = createAggregatorClient(client, address);

  const _origLog = console.log;
  console.log = () => {};
  let result;
  try {
    result = await aggClient.findRouters({
      from: fromInfo.type,
      target: toInfo.type,
      amount: rawAmount,
      byAmountIn: true,
    });
  } finally {
    console.log = _origLog;
  }

  if (!result || result.insufficientLiquidity) {
    throw new T2000Error(
      'ASSET_NOT_SUPPORTED',
      `No swap route found for ${fromAsset} → ${toAsset}`,
    );
  }

  const slippage = maxSlippageBps / 10000;

  console.log = () => {};
  let outputCoin;
  try {
    outputCoin = await aggClient.routerSwap({
      router: result,
      txb: tx as never,
      inputCoin: inputCoin as never,
      slippage,
    });
  } finally {
    console.log = _origLog;
  }

  const estimatedOut = Number(result.amountOut.toString());

  return {
    outputCoin: outputCoin as unknown as TransactionObjectArgument,
    estimatedOut,
    toDecimals: toInfo.decimals,
  };
}

/**
 * Build a swap TX from an arbitrary coin type to USDC (or another
 * SUPPORTED_ASSET). Used for converting reward tokens after claiming.
 */
export async function buildRawSwapTx(params: {
  client: SuiJsonRpcClient;
  address: string;
  fromCoinType: string;
  fromDecimals: number;
  toCoinType: string;
  toDecimals: number;
  amount: bigint;
  maxSlippageBps?: number;
}): Promise<SwapBuildResult> {
  const { client, address, fromCoinType, toCoinType, amount, toDecimals, maxSlippageBps = 500 } = params;

  const aggClient = createAggregatorClient(client, address);

  const _origLog = console.log;
  console.log = () => {};
  let result;
  try {
    result = await aggClient.findRouters({
      from: fromCoinType,
      target: toCoinType,
      amount,
      byAmountIn: true,
    });
  } finally {
    console.log = _origLog;
  }

  if (!result || result.insufficientLiquidity) {
    throw new T2000Error('ASSET_NOT_SUPPORTED', `No swap route for reward token → USDC`);
  }

  const tx = new Transaction();
  const slippage = maxSlippageBps / 10000;

  console.log = () => {};
  try {
    await aggClient.fastRouterSwap({
      router: result,
      txb: tx as never,
      slippage,
    });
  } finally {
    console.log = _origLog;
  }

  return {
    tx,
    estimatedOut: Number(result.amountOut.toString()),
    toDecimals,
  };
}

export async function getPoolPrice(client: SuiJsonRpcClient): Promise<number> {
  try {
    const pool = await client.getObject({
      id: CETUS_USDC_SUI_POOL,
      options: { showContent: true },
    });

    if (pool.data?.content?.dataType === 'moveObject') {
      const fields = pool.data.content.fields as Record<string, unknown>;
      const currentSqrtPrice = BigInt(String(fields.current_sqrt_price ?? '0'));

      if (currentSqrtPrice > 0n) {
        const Q64 = 2n ** 64n;
        const sqrtPriceFloat = Number(currentSqrtPrice) / Number(Q64);
        const rawPrice = sqrtPriceFloat * sqrtPriceFloat;
        const suiPriceUsd = 1e3 / rawPrice;
        if (suiPriceUsd > 0.01 && suiPriceUsd < 1000) return suiPriceUsd;
      }
    }
  } catch {
    // Fallback
  }

  return 3.5;
}

export async function getSwapQuote(
  client: SuiJsonRpcClient,
  fromAsset: string,
  toAsset: string,
  amount: number,
): Promise<{ expectedOutput: number; priceImpact: number; poolPrice: number }> {
  const fromInfo = SUPPORTED_ASSETS[fromAsset as keyof typeof SUPPORTED_ASSETS];
  const toInfo = SUPPORTED_ASSETS[toAsset as keyof typeof SUPPORTED_ASSETS];

  if (!fromInfo || !toInfo) {
    throw new T2000Error('ASSET_NOT_SUPPORTED', `Swap pair ${fromAsset}/${toAsset} is not supported`);
  }
  const rawAmount = BigInt(Math.floor(amount * 10 ** fromInfo.decimals));

  const poolPrice = await getPoolPrice(client);

  try {
    const aggClient = createAggregatorClient(client);

    const result = await aggClient.findRouters({
      from: fromInfo.type,
      target: toInfo.type,
      amount: rawAmount,
      byAmountIn: true,
    });

    if (!result || result.insufficientLiquidity) {
      return fallbackQuote(fromAsset, amount, poolPrice);
    }

    const expectedOutput = Number(result.amountOut.toString()) / 10 ** toInfo.decimals;
    const priceImpact = result.deviationRatio ?? 0;

    return { expectedOutput, priceImpact, poolPrice };
  } catch {
    return fallbackQuote(fromAsset, amount, poolPrice);
  }
}

function fallbackQuote(
  fromAsset: string,
  amount: number,
  poolPrice: number,
): { expectedOutput: number; priceImpact: number; poolPrice: number } {
  const expectedOutput = fromAsset === 'USDC'
    ? amount / poolPrice
    : amount * poolPrice;
  return { expectedOutput, priceImpact: 0, poolPrice };
}
