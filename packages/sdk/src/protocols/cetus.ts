import type { SuiClient } from '@mysten/sui/client';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { CetusClmmSDK } from '@cetusprotocol/sui-clmm-sdk';
import { SUPPORTED_ASSETS, CLOCK_ID, CETUS_USDC_SUI_POOL } from '../constants.js';
import { T2000Error } from '../errors.js';
import type { GasMethod } from '../types.js';

const DEFAULT_SLIPPAGE_BPS = 300; // 3%

export interface SwapParams {
  client: SuiClient;
  keypair: Ed25519Keypair;
  fromAsset: 'USDC' | 'SUI';
  toAsset: 'USDC' | 'SUI';
  amount: number;
  maxSlippageBps?: number;
}

export interface SwapTxResult {
  digest: string;
  fromAmount: number;
  fromAsset: string;
  toAmount: number;
  toAsset: string;
  priceImpact: number;
  gasCost: number;
}

function extractGasCost(
  effects: { gasUsed?: { computationCost: string; storageCost: string; storageRebate: string } } | undefined | null,
): number {
  if (!effects?.gasUsed) return 0;
  return (
    Number(effects.gasUsed.computationCost) +
    Number(effects.gasUsed.storageCost) -
    Number(effects.gasUsed.storageRebate)
  ) / 1e9;
}

/**
 * In the Cetus USDC/SUI pool, the type ordering is:
 * - coin_a = USDC (smaller type string)
 * - coin_b = SUI
 * So USDC → SUI = a2b, SUI → USDC = b2a
 */
function isA2B(from: string): boolean {
  return from === 'USDC';
}

let _cetusSDK: CetusClmmSDK | null = null;

function getCetusSDK(): CetusClmmSDK {
  if (!_cetusSDK) {
    _cetusSDK = CetusClmmSDK.createSDK({ env: 'mainnet' });
  }
  return _cetusSDK;
}

import type { Transaction } from '@mysten/sui/transactions';

export interface SwapBuildResult {
  tx: Transaction;
  estimatedOut: number;
  toDecimals: number;
}

export async function buildSwapTx(params: {
  client: SuiClient;
  address: string;
  fromAsset: 'USDC' | 'SUI';
  toAsset: 'USDC' | 'SUI';
  amount: number;
  maxSlippageBps?: number;
}): Promise<SwapBuildResult> {
  const { client, address, fromAsset, toAsset, amount, maxSlippageBps = DEFAULT_SLIPPAGE_BPS } = params;

  const a2b = isA2B(fromAsset);
  const fromInfo = SUPPORTED_ASSETS[fromAsset];
  const toInfo = SUPPORTED_ASSETS[toAsset];
  const rawAmount = BigInt(Math.floor(amount * 10 ** fromInfo.decimals));

  const sdk = getCetusSDK();
  sdk.setSenderAddress(address);

  const pool = await sdk.Pool.getPool(CETUS_USDC_SUI_POOL);

  const preSwapResult = await sdk.Swap.preSwap({
    pool,
    current_sqrt_price: pool.current_sqrt_price,
    coin_type_a: pool.coin_type_a,
    coin_type_b: pool.coin_type_b,
    decimals_a: 6,
    decimals_b: 9,
    a2b,
    by_amount_in: true,
    amount: rawAmount.toString(),
  });

  const estimatedOut = Number(preSwapResult.estimated_amount_out);
  const slippageFactor = (10000 - maxSlippageBps) / 10000;
  const amountLimit = Math.floor(estimatedOut * slippageFactor);

  const swapPayload = await sdk.Swap.createSwapPayload({
    pool_id: pool.id,
    coin_type_a: pool.coin_type_a,
    coin_type_b: pool.coin_type_b,
    a2b,
    by_amount_in: true,
    amount: preSwapResult.amount.toString(),
    amount_limit: amountLimit.toString(),
  });

  return {
    tx: swapPayload as unknown as Transaction,
    estimatedOut,
    toDecimals: toInfo.decimals,
  };
}

export async function executeSwap(params: SwapParams): Promise<SwapTxResult> {
  const { client, keypair, fromAsset, toAsset, amount, maxSlippageBps } = params;
  const address = keypair.getPublicKey().toSuiAddress();
  const toInfo = SUPPORTED_ASSETS[toAsset];

  const { tx, estimatedOut, toDecimals } = await buildSwapTx({
    client,
    address,
    fromAsset,
    toAsset,
    amount,
    maxSlippageBps,
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true, showBalanceChanges: true },
  });

  await client.waitForTransaction({ digest: result.digest });

  let actualReceived = 0;
  if (result.balanceChanges) {
    for (const change of result.balanceChanges) {
      if (
        change.coinType === toInfo.type &&
        change.owner &&
        typeof change.owner === 'object' &&
        'AddressOwner' in change.owner &&
        change.owner.AddressOwner === address
      ) {
        const amt = Number(change.amount) / 10 ** toInfo.decimals;
        if (amt > 0) actualReceived += amt;
      }
    }
  }

  const expectedOutput = estimatedOut / 10 ** toDecimals;
  if (actualReceived === 0) actualReceived = expectedOutput;

  const priceImpact = expectedOutput > 0
    ? Math.abs(actualReceived - expectedOutput) / expectedOutput
    : 0;

  return {
    digest: result.digest,
    fromAmount: amount,
    fromAsset,
    toAmount: actualReceived,
    toAsset,
    priceImpact,
    gasCost: extractGasCost(result.effects as Parameters<typeof extractGasCost>[0]),
  };
}

export async function getPoolPrice(client: SuiClient): Promise<number> {
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
        // rawPrice = SUI_smallest / USDC_smallest (token1 per token0 in raw units)
        // Human conversion: 1 USDC = rawPrice * 10^(6-9) SUI
        // SUI price in USD = 1 / (rawPrice * 10^(6-9)) = 10^3 / rawPrice
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
  client: SuiClient,
  fromAsset: 'USDC' | 'SUI',
  toAsset: 'USDC' | 'SUI',
  amount: number,
): Promise<{ expectedOutput: number; priceImpact: number; poolPrice: number }> {
  const a2b = isA2B(fromAsset);
  const fromInfo = SUPPORTED_ASSETS[fromAsset];
  const toInfo = SUPPORTED_ASSETS[toAsset];
  const rawAmount = BigInt(Math.floor(amount * 10 ** fromInfo.decimals));

  const poolPrice = await getPoolPrice(client);

  try {
    const sdk = getCetusSDK();
    const pool = await sdk.Pool.getPool(CETUS_USDC_SUI_POOL);

    const preSwapResult = await sdk.Swap.preSwap({
      pool,
      current_sqrt_price: pool.current_sqrt_price,
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      decimals_a: 6,
      decimals_b: 9,
      a2b,
      by_amount_in: true,
      amount: rawAmount.toString(),
    });

    const expectedOutput = Number(preSwapResult.estimated_amount_out) / 10 ** toInfo.decimals;

    return { expectedOutput, priceImpact: 0, poolPrice };
  } catch {
    let expectedOutput: number;
    if (fromAsset === 'USDC') {
      expectedOutput = amount / poolPrice;
    } else {
      expectedOutput = amount * poolPrice;
    }
    return { expectedOutput, priceImpact: 0, poolPrice };
  }
}
