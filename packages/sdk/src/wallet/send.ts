import {
  Transaction,
  type TransactionObjectArgument,
} from '@mysten/sui/transactions';
import {
  GASLESS_MIN_STABLE_AMOUNT,
  GASLESS_STABLE_TYPES,
  SUPPORTED_ASSETS,
  assertAllowedAsset,
  type SendableAsset,
} from '../constants.js';
import { T2000Error } from '../errors.js';
import { validateAddress, type SuiCoreClient } from '../utils/sui.js';
import { displayToRaw } from '../utils/format.js';
import {
  type PreflightResult,
  PREFLIGHT_OK,
  preflightFail,
  checkPositiveAmount,
  checkSuiAddress,
} from '../preflight.js';

/**
 * Synchronous, network-free preflight for `send`. Validates asset membership,
 * amount sanity, the gasless stable floor, and recipient address shape — the
 * cheap checks the v3 host runs before the LLM round-trip / tap-to-confirm.
 * Returns a `PreflightResult`; never throws. `buildSendTx` calls this first,
 * then layers the network balance read on top.
 */
export function preflightSend(input: {
  to: string;
  amount: number;
  asset: string;
}): PreflightResult {
  // Asset membership — reuse the canonical message (single source of truth).
  try {
    assertAllowedAsset('send', input.asset);
  } catch (e) {
    return preflightFail('INVALID_ASSET', (e as T2000Error).message);
  }

  const amountCheck = checkPositiveAmount(input.amount);
  if (!amountCheck.valid) return amountCheck;

  // Gasless protocol allowlist enforces a 0.01 minimum on the stables.
  if (
    (input.asset === 'USDC' || input.asset === 'USDsui') &&
    input.amount < GASLESS_MIN_STABLE_AMOUNT
  ) {
    return preflightFail(
      'INVALID_AMOUNT',
      `Minimum gasless transfer is ${GASLESS_MIN_STABLE_AMOUNT} ${input.asset}. Got ${input.amount}.`,
    );
  }

  const addressCheck = checkSuiAddress(input.to);
  if (!addressCheck.valid) return addressCheck;

  return PREFLIGHT_OK;
}

/**
 * Build a PTB that sends `amount` of `asset` from `address` to `to`.
 *
 * [v4.0 Phase A Day 2 — SPEC_AGENT_WALLET_GREENFIELD §A]
 *
 * Asset constraint: `'USDC' | 'USDsui' | 'SUI'` only. Other assets throw
 * `INVALID_ASSET` via `assertAllowedAsset('send', asset)`. The constrained
 * set matches Sui mainnet's gasless allowlist (USDC + USDsui) plus SUI
 * for users who want a gas-native transfer.
 *
 * Build paths:
 * - **USDC / USDsui** — `0x2::balance::send_funds` Move call with a
 *   `tx.balance({ type, balance })` input. When built via `SuiGrpcClient`,
 *   the gRPC resolver auto-detects gasless eligibility and zeros gas.
 *   When built via `SuiJsonRpcClient`, the same PTB still executes but
 *   the caller pays normal gas. Minimum 0.01 (protocol allowlist floor).
 * - **SUI** — `tx.splitCoins(tx.gas, [amount]) → tx.transferObjects()`.
 *   Standard gas-native transfer. No minimum.
 *
 * Pre-flight balance check stays on JSON-RPC (`client.getBalance`) — it
 * sums coin objects + address balance so the legacy `getCoins` page miss
 * doesn't break for users whose stables landed via gasless deposits.
 *
 * `asset` is REQUIRED (no implicit USDC default — pre-v4 hid LLM intent
 * errors). Callers passing the wrong asset get an explicit error rather
 * than a silent currency substitution.
 */
export async function buildSendTx({
  client,
  address,
  to,
  amount,
  asset,
}: {
  client: SuiCoreClient;
  address: string;
  to: string;
  amount: number;
  asset: SendableAsset;
}): Promise<Transaction> {
  // Layer 2 — cheap synchronous preflight (asset / amount / gasless floor /
  // recipient shape). Rethrow the precise code+message verbatim.
  const pf = preflightSend({ to, amount, asset });
  if (!pf.valid) throw new T2000Error(pf.code, pf.error);

  const recipient = validateAddress(to);
  const assetInfo = SUPPORTED_ASSETS[asset];
  if (!assetInfo) throw new T2000Error('ASSET_NOT_SUPPORTED', `Asset ${asset} is not supported`);

  const rawAmount = displayToRaw(amount, assetInfo.decimals);
  const tx = new Transaction();
  tx.setSender(address);

  // Balance pre-flight against `core.getBalance().balance.balance` (sums
  // coins + address balance). The legacy `getCoins` page miss broke for
  // users whose stables had drifted into address balance via @suimpp/mpp 0.7+.
  const balanceResp = await client.core.getBalance({ owner: address, coinType: assetInfo.type });
  const totalBalance = BigInt(balanceResp.balance.balance);
  if (totalBalance < rawAmount) {
    throw new T2000Error('INSUFFICIENT_BALANCE', `Insufficient ${asset} balance`, {
      available: Number(totalBalance) / 10 ** assetInfo.decimals,
      required: amount,
    });
  }

  // Gasless dust floor — the protocol validator rejects a gasless stable
  // withdrawal that leaves a remainder BELOW the 0.01 floor (it must either
  // consume the entire balance or leave >= 0.01). Without this check the
  // build surfaces a cryptic node error ("Invalid withdraw reservation" /
  // "Unable to perform gas selection") — verified live 2026-07-19. Auto-clip
  // is intentionally NOT done here: silently sending more than asked is
  // worse than a clear error (financial-amounts discipline).
  if (asset === 'USDC' || asset === 'USDsui') {
    const rawFloor = displayToRaw(GASLESS_MIN_STABLE_AMOUNT, assetInfo.decimals);
    const remainder = totalBalance - rawAmount;
    if (remainder > 0n && remainder < rawFloor) {
      const total = Number(totalBalance) / 10 ** assetInfo.decimals;
      throw new T2000Error(
        'INVALID_AMOUNT',
        `Gasless ${asset} transfers must send the entire balance or leave at least ${GASLESS_MIN_STABLE_AMOUNT} ${asset}. ` +
          `Sending ${amount} of ${total} leaves ${(total - amount).toFixed(assetInfo.decimals)}. ` +
          `Send ${total} (everything) or at most ${(total - GASLESS_MIN_STABLE_AMOUNT).toFixed(assetInfo.decimals)}.`,
        { available: total, required: amount },
      );
    }
  }

  if (asset === 'SUI') {
    // Standard gas-native transfer — split from the gas coin, transfer
    // the resulting object. NOT gasless (SUI is not on the protocol
    // allowlist for `balance::send_funds`).
    const [sendCoin] = tx.splitCoins(tx.gas, [rawAmount]);
    tx.transferObjects([sendCoin], recipient);
    return tx;
  }

  // USDC / USDsui — gasless via `0x2::balance::send_funds`. The gRPC
  // build resolver inspects this PTB shape at `tx.build()` time and,
  // when it matches the protocol allowlist, sets gasPrice=0/gasBudget=0
  // automatically. The Move signature is:
  //   public fun send_funds<T>(balance: Balance<T>, recipient: address)
  // `tx.balance({ type, balance })` produces a Balance<T> input sourced
  // from the sender's address balance + coin objects (auto-merged).
  const coinType = GASLESS_STABLE_TYPES[asset];
  tx.moveCall({
    target: '0x2::balance::send_funds',
    typeArguments: [coinType],
    arguments: [
      tx.balance({ type: coinType, balance: rawAmount }),
      tx.pure.address(recipient),
    ],
  });
  return tx;
}

/**
 * Fragment-appender for the chain-mode send leg of SPEC 7 multi-write
 * Payment Intents. Consumes a coin reference produced by a previous
 * appender (e.g. `addWithdrawToTx`, `addSwapToTx`) and transfers it to
 * `recipient` within the same Payment Intent — no intermediate wallet
 * materialization.
 *
 * Codifies the hand-built send leg from
 * `scripts/smoke-spec7-withdraw-then-send.ts` (P2.1) into a typed
 * appender. SPEC 7 § "Layer 1" — P2.2b will register this in the
 * `WRITE_APPENDER_REGISTRY` under `send_transfer` for chain-mode
 * dispatch; the registry adapter will handle the wallet-fetch fallback
 * by delegating to `buildSendTx` when no upstream coin is available.
 *
 * For single-step send_transfer flows (no chained predecessor), use
 * `buildSendTx` directly — it builds a complete tx including the
 * wallet-coin selection / merge / split prelude.
 *
 * [v4.0 Phase A Day 2] Stays on the legacy `transferObjects` path
 * because chain-mode bundles are NEVER gasless — by definition they
 * combine multiple Move calls (`withdraw → send`, `swap → send`) which
 * fail the protocol allowlist check (only `balance::send_funds` and
 * a few related helpers are eligible). The bundled flow still works,
 * the user just pays gas (or has it sponsored by audric via Enoki).
 *
 * @returns void — the coin is consumed by `tx.transferObjects`. Callers
 *   that need the post-transfer "effective amount" should rely on the
 *   upstream appender's `effectiveAmount` (e.g. `addWithdrawToTx`'s
 *   return), not on this appender.
 */
export function addSendToTx(
  tx: Transaction,
  coin: TransactionObjectArgument,
  recipient: string,
): void {
  const validRecipient = validateAddress(recipient);
  tx.transferObjects([coin], validRecipient);
}
