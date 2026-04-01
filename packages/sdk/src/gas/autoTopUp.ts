import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import {
  SUPPORTED_ASSETS,
  GAS_RESERVE_TARGET,
  AUTO_TOPUP_MIN_USDC,
} from '../constants.js';
import type { TransactionSigner } from '../signer.js';

export interface AutoTopUpResult {
  success: boolean;
  tx: string;
  usdcSpent: number;
  suiReceived: number;
}

export async function shouldAutoTopUp(
  client: SuiJsonRpcClient,
  address: string,
): Promise<boolean> {
  const [suiBalance, usdcBalance] = await Promise.all([
    client.getBalance({ owner: address, coinType: SUPPORTED_ASSETS.SUI.type }),
    client.getBalance({ owner: address, coinType: SUPPORTED_ASSETS.USDC.type }),
  ]);

  const suiRaw = BigInt(suiBalance.totalBalance);
  const usdcRaw = BigInt(usdcBalance.totalBalance);

  // Auto top-up requires a DEX swap (USDC→SUI) which is not available
  // without a swap adapter. Gas station sponsorship is the fallback.
  if (suiRaw < GAS_RESERVE_TARGET && usdcRaw >= AUTO_TOPUP_MIN_USDC) {
    return false;
  }
  return false;
}

export async function executeAutoTopUp(
  _client: SuiJsonRpcClient,
  _signer: TransactionSigner,
): Promise<AutoTopUpResult> {
  // Auto top-up requires USDC→SUI swap via DEX. Currently unavailable —
  // gas station sponsorship handles gas funding instead.
  return { success: false, tx: '', usdcSpent: 0, suiReceived: 0 };
}
