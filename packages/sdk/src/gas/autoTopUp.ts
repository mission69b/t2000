import type { SuiClient } from '@mysten/sui/client';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import {
  SUPPORTED_ASSETS,
  AUTO_TOPUP_THRESHOLD,
  AUTO_TOPUP_AMOUNT,
  AUTO_TOPUP_MIN_USDC,
  MIST_PER_SUI,
  CLOCK_ID,
} from '../constants.js';
import { T2000Error } from '../errors.js';
import { requestGasSponsorship, reportGasUsage } from './gasStation.js';

// Cetus USDC/SUI pool on mainnet
const CETUS_USDC_SUI_POOL = '0xb8d7d9e66a60c239e7a60110efcf8b555571a820a5c015ae1ce01bd5e9c4ac51';
const CETUS_GLOBAL_CONFIG = '0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f';
const CETUS_PACKAGE = '0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb';

// Max slippage: 3% enforced on-chain via sqrt_price_limit
const MAX_SLIPPAGE_BPS = 300;

export interface AutoTopUpResult {
  success: boolean;
  tx: string;
  usdcSpent: number;
  suiReceived: number;
}

export async function shouldAutoTopUp(
  client: SuiClient,
  address: string,
): Promise<boolean> {
  const [suiBalance, usdcBalance] = await Promise.all([
    client.getBalance({ owner: address, coinType: SUPPORTED_ASSETS.SUI.type }),
    client.getBalance({ owner: address, coinType: SUPPORTED_ASSETS.USDC.type }),
  ]);

  const suiRaw = BigInt(suiBalance.totalBalance);
  const usdcRaw = BigInt(usdcBalance.totalBalance);

  return suiRaw < AUTO_TOPUP_THRESHOLD && usdcRaw >= AUTO_TOPUP_MIN_USDC;
}

export async function executeAutoTopUp(
  client: SuiClient,
  keypair: Ed25519Keypair,
): Promise<AutoTopUpResult> {
  const address = keypair.getPublicKey().toSuiAddress();

  // Build the USDC → SUI swap transaction
  const tx = new Transaction();
  tx.setSender(address);

  const usdcCoins = await client.getCoins({
    owner: address,
    coinType: SUPPORTED_ASSETS.USDC.type,
  });

  if (usdcCoins.data.length === 0) {
    throw new T2000Error('AUTO_TOPUP_FAILED', 'No USDC coins available for auto-topup');
  }

  // Merge USDC coins if needed, then split the topup amount
  const coinIds = usdcCoins.data.map((c) => c.coinObjectId);
  let usdcCoin;
  if (coinIds.length === 1) {
    usdcCoin = tx.splitCoins(tx.object(coinIds[0]), [AUTO_TOPUP_AMOUNT]);
  } else {
    const primary = tx.object(coinIds[0]);
    if (coinIds.length > 1) {
      tx.mergeCoins(primary, coinIds.slice(1).map((id) => tx.object(id)));
    }
    usdcCoin = tx.splitCoins(primary, [AUTO_TOPUP_AMOUNT]);
  }

  // Cetus swap: USDC → SUI (a2b = true since USDC < SUI in type ordering)
  // sqrt_price_limit for a2b swap = MIN_SQRT_PRICE (going down)
  // This is the Cetus minimum sqrt_price for a2b swaps
  const MIN_SQRT_PRICE = '4295048016';

  const [receivedCoin, returnedCoin] = tx.moveCall({
    target: `${CETUS_PACKAGE}::pool_script::swap_a2b`,
    arguments: [
      tx.object(CETUS_GLOBAL_CONFIG),
      tx.object(CETUS_USDC_SUI_POOL),
      usdcCoin,
      tx.pure.bool(true), // by_amount_in
      tx.pure.u64(AUTO_TOPUP_AMOUNT),
      tx.pure.u128(MIN_SQRT_PRICE),
      tx.object(CLOCK_ID),
    ],
    typeArguments: [SUPPORTED_ASSETS.USDC.type, SUPPORTED_ASSETS.SUI.type],
  });

  // Transfer received SUI and return any remaining USDC
  tx.transferObjects([receivedCoin], address);
  tx.transferObjects([returnedCoin], address);

  // Serialize for gas station sponsorship (auto-topup gas is always sponsored)
  const txBytes = await tx.build({ client, onlyTransactionKind: true });
  const txBytesBase64 = Buffer.from(txBytes).toString('base64');

  let sponsoredResult;
  try {
    sponsoredResult = await requestGasSponsorship(txBytesBase64, address, 'auto-topup');
  } catch {
    throw new T2000Error('AUTO_TOPUP_FAILED', 'Gas station unavailable for auto-topup sponsorship');
  }

  // Sign with agent key and submit
  const sponsoredTxBytes = Buffer.from(sponsoredResult.txBytes, 'base64');
  const { signature: agentSig } = await keypair.signTransaction(sponsoredTxBytes);

  const result = await client.executeTransactionBlock({
    transactionBlock: sponsoredResult.txBytes,
    signature: [agentSig, sponsoredResult.sponsorSignature],
    options: { showEffects: true, showBalanceChanges: true },
  });

  await client.waitForTransaction({ digest: result.digest });

  // Calculate SUI received from balance changes
  let suiReceived = 0;
  if (result.balanceChanges) {
    for (const change of result.balanceChanges) {
      if (
        change.coinType === SUPPORTED_ASSETS.SUI.type &&
        change.owner &&
        typeof change.owner === 'object' &&
        'AddressOwner' in change.owner &&
        change.owner.AddressOwner === address
      ) {
        suiReceived += Number(change.amount) / Number(MIST_PER_SUI);
      }
    }
  }

  // Best-effort: report gas usage
  reportGasUsage(address, result.digest, 0, 0, 'auto-topup');

  return {
    success: true,
    tx: result.digest,
    usdcSpent: Number(AUTO_TOPUP_AMOUNT) / 1e6,
    suiReceived: Math.abs(suiReceived),
  };
}
