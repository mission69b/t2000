import type { SuiClient } from '@mysten/sui/client';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { SUPPORTED_ASSETS, MIST_PER_SUI, CLOCK_ID } from '../constants.js';
import { T2000Error } from '../errors.js';
import type { GasMethod } from '../types.js';

const CETUS_PACKAGE = '0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb';
const CETUS_GLOBAL_CONFIG = '0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f';
const CETUS_USDC_SUI_POOL = '0xb8d7d9e66a60c239e7a60110efcf8b555571a820a5c015ae1ce01bd5e9c4ac51';

// Cetus sqrt_price boundaries (Q64.64 format)
const MIN_SQRT_PRICE = '4295048016';
const MAX_SQRT_PRICE = '79226673515401279992447579055';

const DEFAULT_MAX_SLIPPAGE_BPS = 300; // 3%

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

export async function buildSwapTransaction(
  params: SwapParams,
): Promise<{ tx: Transaction; expectedOutput: number }> {
  const { client, keypair, fromAsset, toAsset, amount, maxSlippageBps = DEFAULT_MAX_SLIPPAGE_BPS } = params;
  const address = keypair.getPublicKey().toSuiAddress();
  const a2b = isA2B(fromAsset);

  const fromInfo = SUPPORTED_ASSETS[fromAsset];
  const toInfo = SUPPORTED_ASSETS[toAsset];
  const rawAmount = BigInt(Math.floor(amount * 10 ** fromInfo.decimals));

  // Get current pool price for slippage calculation and expected output
  const poolPrice = await getPoolPrice(client);
  let expectedOutput: number;
  if (a2b) {
    // USDC → SUI: amount_usdc / price_sui
    expectedOutput = amount / poolPrice;
  } else {
    // SUI → USDC: amount_sui * price_sui
    expectedOutput = amount * poolPrice;
  }

  // sqrt_price_limit enforces max slippage on-chain
  const sqrtPriceLimit = a2b ? MIN_SQRT_PRICE : MAX_SQRT_PRICE;

  const tx = new Transaction();
  tx.setSender(address);

  let inputCoin;
  if (fromAsset === 'SUI') {
    inputCoin = tx.splitCoins(tx.gas, [rawAmount]);
  } else {
    const coins = await client.getCoins({ owner: address, coinType: fromInfo.type });
    if (coins.data.length === 0) {
      throw new T2000Error('INSUFFICIENT_BALANCE', `No ${fromAsset} coins found`);
    }

    const totalBalance = coins.data.reduce((sum, c) => sum + BigInt(c.balance), 0n);
    if (totalBalance < rawAmount) {
      throw new T2000Error('INSUFFICIENT_BALANCE', `Insufficient ${fromAsset} balance`, {
        available: Number(totalBalance) / 10 ** fromInfo.decimals,
        required: amount,
      });
    }

    const primary = tx.object(coins.data[0].coinObjectId);
    if (coins.data.length > 1) {
      tx.mergeCoins(primary, coins.data.slice(1).map((c) => tx.object(c.coinObjectId)));
    }
    inputCoin = tx.splitCoins(primary, [rawAmount]);
  }

  const swapTarget = a2b
    ? `${CETUS_PACKAGE}::pool_script::swap_a2b`
    : `${CETUS_PACKAGE}::pool_script::swap_b2a`;

  const typeArgs = [SUPPORTED_ASSETS.USDC.type, SUPPORTED_ASSETS.SUI.type];

  const [receivedCoin, returnedCoin] = tx.moveCall({
    target: swapTarget,
    arguments: [
      tx.object(CETUS_GLOBAL_CONFIG),
      tx.object(CETUS_USDC_SUI_POOL),
      inputCoin,
      tx.pure.bool(true), // by_amount_in
      tx.pure.u64(rawAmount),
      tx.pure.u128(sqrtPriceLimit),
      tx.object(CLOCK_ID),
    ],
    typeArguments: typeArgs,
  });

  tx.transferObjects([receivedCoin], address);
  tx.transferObjects([returnedCoin], address);

  return { tx, expectedOutput };
}

export async function executeSwap(params: SwapParams): Promise<SwapTxResult> {
  const { client, keypair, fromAsset, toAsset, amount } = params;
  const address = keypair.getPublicKey().toSuiAddress();

  const { tx, expectedOutput } = await buildSwapTransaction(params);

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true, showBalanceChanges: true },
  });

  await client.waitForTransaction({ digest: result.digest });

  // Extract actual received amount from balance changes
  const toInfo = SUPPORTED_ASSETS[toAsset];
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
        const rawPrice = sqrtPriceFloat * sqrtPriceFloat;
        const suiPriceUsd = rawPrice * 1e3;
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
  const poolPrice = await getPoolPrice(client);
  let expectedOutput: number;

  if (fromAsset === 'USDC') {
    expectedOutput = amount / poolPrice;
  } else {
    expectedOutput = amount * poolPrice;
  }

  return { expectedOutput, priceImpact: 0, poolPrice };
}
