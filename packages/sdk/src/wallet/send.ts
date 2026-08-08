import {
  Transaction,
  coinWithBalance,
  type TransactionObjectArgument,
} from '@mysten/sui/transactions';
import { normalizeStructTag } from '@mysten/sui/utils';
import {
  GASLESS_MIN_STABLE_AMOUNT,
  GASLESS_STABLE_TYPES,
  SUPPORTED_ASSETS,
} from '../constants.js';
import { T2000Error } from '../errors.js';
import { validateAddress, type SuiCoreClient } from '../utils/sui.js';
import { displayToRaw } from '../utils/format.js';
import {
  SUI_TYPE,
  resolveCoinDecimals,
  resolveSymbol,
  resolveTokenType,
} from '../token-registry.js';
import {
  type PreflightResult,
  PREFLIGHT_OK,
  preflightFail,
  checkPositiveAmount,
  checkSuiAddress,
} from '../preflight.js';

/**
 * [S.957 — 2026-08-08] What a send `asset` string resolves to. The rule:
 * **if it resolves to a Sui coin type, it's sendable** (given balance) —
 * registry symbol (`USDC`, `MANIFEST`) or full `0x…::module::TYPE` both
 * work. The kind decides the build path:
 * - `gasless-stable` — USDC / USDsui via `0x2::balance::send_funds`
 *   (Sui mainnet protocol allowlist; the ONLY gasless sends).
 * - `sui` — split from `tx.gas`, gas-paid.
 * - `coin` — any other coin type via `coinWithBalance` + transferObjects,
 *   gas-paid. `symbol` is display-only (registry or last `::` segment).
 */
export type SendAssetClass =
  | { kind: 'gasless-stable'; symbol: 'USDC' | 'USDsui'; coinType: string }
  | { kind: 'sui'; symbol: 'SUI'; coinType: string }
  | { kind: 'coin'; symbol: string; coinType: string };

/**
 * Pure, network-free asset resolution for `send`. Returns `null` for
 * anything that doesn't resolve to a coin type — unknown bare symbols
 * (`FOOBAR`) and malformed `::` strings stay hard errors upstream.
 */
export function classifySendAsset(asset: string): SendAssetClass | null {
  const coinType = resolveTokenType(asset.trim());
  if (!coinType) return null;
  let normalized: string;
  try {
    normalized = normalizeStructTag(coinType);
  } catch {
    return null;
  }
  if (normalized === normalizeStructTag(GASLESS_STABLE_TYPES.USDC)) {
    return { kind: 'gasless-stable', symbol: 'USDC', coinType: GASLESS_STABLE_TYPES.USDC };
  }
  if (normalized === normalizeStructTag(GASLESS_STABLE_TYPES.USDsui)) {
    return { kind: 'gasless-stable', symbol: 'USDsui', coinType: GASLESS_STABLE_TYPES.USDsui };
  }
  if (normalized === normalizeStructTag(SUI_TYPE)) {
    return { kind: 'sui', symbol: 'SUI', coinType: SUI_TYPE };
  }
  return { kind: 'coin', symbol: resolveSymbol(coinType), coinType };
}

/** The canonical INVALID_ASSET message for an unresolvable send asset. */
export function invalidSendAssetMessage(asset: string): string {
  return (
    `Unknown asset "${asset}". Use a registry symbol (USDC, USDsui, SUI, ` +
    `MANIFEST, …) or a full coin type (0x…::module::TYPE).`
  );
}

/**
 * Synchronous, network-free preflight for `send`. Validates asset
 * resolvability, amount sanity, the gasless stable floor, and recipient
 * address shape — the cheap checks the v3 host runs before the LLM
 * round-trip / tap-to-confirm. Returns a `PreflightResult`; never throws.
 * `buildSendTx` calls this first, then layers the network balance read on top.
 */
export function preflightSend(input: {
  to: string;
  amount: number;
  asset: string;
}): PreflightResult {
  // [S.957] Resolvability replaces the old 3-asset membership gate —
  // any coin type is sendable; nonsense symbols still fail here.
  const cls = classifySendAsset(input.asset);
  if (!cls) {
    return preflightFail('INVALID_ASSET', invalidSendAssetMessage(input.asset));
  }

  const amountCheck = checkPositiveAmount(input.amount);
  if (!amountCheck.valid) return amountCheck;

  // Gasless protocol allowlist enforces a 0.01 minimum on the stables.
  if (cls.kind === 'gasless-stable' && input.amount < GASLESS_MIN_STABLE_AMOUNT) {
    return preflightFail(
      'INVALID_AMOUNT',
      `Minimum gasless transfer is ${GASLESS_MIN_STABLE_AMOUNT} ${cls.symbol}. Got ${input.amount}.`,
    );
  }

  const addressCheck = checkSuiAddress(input.to);
  if (!addressCheck.valid) return addressCheck;

  return PREFLIGHT_OK;
}

/**
 * Build a PTB that sends `amount` of `asset` from `address` to `to`.
 *
 * [S.957 — 2026-08-08] Widened from the v4 3-asset whitelist to **any held
 * coin type**: `asset` is a registry symbol (`USDC`, `MANIFEST`) or a full
 * `0x…::module::TYPE`. Unresolvable strings throw `INVALID_ASSET`.
 *
 * Build paths (`classifySendAsset`):
 * - **USDC / USDsui** — `0x2::balance::send_funds` Move call with a
 *   `tx.balance({ type, balance })` input. When built via `SuiGrpcClient`,
 *   the gRPC resolver auto-detects gasless eligibility and zeros gas.
 *   Minimum 0.01 (protocol allowlist floor). Still the ONLY gasless sends.
 * - **SUI** — `tx.splitCoins(tx.gas, [amount]) → tx.transferObjects()`.
 *   Standard gas-native transfer. No minimum.
 * - **Any other coin type** — `coinWithBalance({ type, balance })` +
 *   `transferObjects`. Gas-paid (sender needs SUI). The resolver sources
 *   coins + address balance together, so post-swap alts held either way
 *   move. Decimals resolve via the registry or on-chain coin metadata
 *   (`resolveCoinDecimals`) — never a silent 9-default guess.
 *
 * Pre-flight balance check uses `core.getBalance` (sums coin objects +
 * address balance) for every path.
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
  asset: string;
}): Promise<Transaction> {
  // Layer 2 — cheap synchronous preflight (asset / amount / gasless floor /
  // recipient shape). Rethrow the precise code+message verbatim.
  const pf = preflightSend({ to, amount, asset });
  if (!pf.valid) throw new T2000Error(pf.code, pf.error);

  const recipient = validateAddress(to);
  // Preflight passed, so the asset classifies — TS just can't see it.
  const cls = classifySendAsset(asset) as SendAssetClass;

  // Decimals: registry / gasless stables are known offline; a coin type
  // outside the registry is read from on-chain metadata (financial-amounts
  // rule — a wrong decimal corrupts the raw amount).
  const decimals =
    cls.kind === 'gasless-stable' || cls.kind === 'sui'
      ? SUPPORTED_ASSETS[cls.symbol].decimals
      : await resolveCoinDecimals(client, cls.coinType);

  const rawAmount = displayToRaw(amount, decimals);
  const tx = new Transaction();
  tx.setSender(address);

  // Balance pre-flight against `core.getBalance().balance.balance` (sums
  // coins + address balance). The legacy `getCoins` page miss broke for
  // users whose stables had drifted into address balance via earlier pay flows.
  const balanceResp = await client.core.getBalance({ owner: address, coinType: cls.coinType });
  const totalBalance = BigInt(balanceResp.balance.balance);
  if (totalBalance < rawAmount) {
    throw new T2000Error('INSUFFICIENT_BALANCE', `Insufficient ${cls.symbol} balance`, {
      available: Number(totalBalance) / 10 ** decimals,
      required: amount,
    });
  }

  if (cls.kind === 'sui') {
    // Standard gas-native transfer — split from the gas coin, transfer
    // the resulting object. NOT gasless (SUI is not on the protocol
    // allowlist for `balance::send_funds`).
    const [sendCoin] = tx.splitCoins(tx.gas, [rawAmount]);
    tx.transferObjects([sendCoin], recipient);
    return tx;
  }

  if (cls.kind === 'coin') {
    // [S.957] Generic held-token transfer — gas-paid. `coinWithBalance`
    // resolves coins + address balance at build time (same helper as the
    // wallet-mode appenders), so no hand-rolled getCoins-only selection.
    const sendCoin = coinWithBalance({ type: cls.coinType, balance: rawAmount })(tx);
    tx.transferObjects([sendCoin], recipient);
    return tx;
  }

  // Gasless dust floor — the protocol validator rejects a gasless stable
  // withdrawal that leaves a remainder BELOW the 0.01 floor (it must either
  // consume the entire balance or leave >= 0.01). Without this check the
  // build surfaces a cryptic node error ("Invalid withdraw reservation" /
  // "Unable to perform gas selection") — verified live 2026-07-19. Auto-clip
  // is intentionally NOT done here: silently sending more than asked is
  // worse than a clear error (financial-amounts discipline).
  const rawFloor = displayToRaw(GASLESS_MIN_STABLE_AMOUNT, decimals);
  const remainder = totalBalance - rawAmount;
  if (remainder > 0n && remainder < rawFloor) {
    const total = Number(totalBalance) / 10 ** decimals;
    throw new T2000Error(
      'INVALID_AMOUNT',
      `Gasless ${cls.symbol} transfers must send the entire balance or leave at least ${GASLESS_MIN_STABLE_AMOUNT} ${cls.symbol}. ` +
        `Sending ${amount} of ${total} leaves ${(total - amount).toFixed(decimals)}. ` +
        `Send ${total} (everything) or at most ${(total - GASLESS_MIN_STABLE_AMOUNT).toFixed(decimals)}.`,
      { available: total, required: amount },
    );
  }

  // USDC / USDsui — gasless via `0x2::balance::send_funds`. The gRPC
  // build resolver inspects this PTB shape at `tx.build()` time and,
  // when it matches the protocol allowlist, sets gasPrice=0/gasBudget=0
  // automatically. The Move signature is:
  //   public fun send_funds<T>(balance: Balance<T>, recipient: address)
  // `tx.balance({ type, balance })` produces a Balance<T> input sourced
  // from the sender's address balance + coin objects (auto-merged).
  tx.moveCall({
    target: '0x2::balance::send_funds',
    typeArguments: [cls.coinType],
    arguments: [
      tx.balance({ type: cls.coinType, balance: rawAmount }),
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
