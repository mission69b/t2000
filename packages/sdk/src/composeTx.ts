/**
 * SPEC 7 v0.4 § Layer 0 — Canonical Write Architecture.
 *
 * `composeTx({ steps })` is the single canonical entry-point for every
 * Audric Enoki-sponsored write. The fragment-appender pattern (Layer 1)
 * is the implementation; this primitive dispatches each step to its
 * registered appender from the typed `WRITE_APPENDER_REGISTRY`.
 *
 * Single-write and multi-write go through the same code path. A 1-step
 * `composeTx([{ toolName: 'send_transfer', input: {...} }])` produces
 * the same shape of result as a 3-step bundle.
 *
 * **Why this exists**
 *
 * Pre-Layer-0, four parallel write stacks lived across the audric host:
 * `transactions/prepare` (fat ~600-line route), `services/prepare`
 * (hand-rolled), `debug-swap` (diagnostic), and PayButton (dapp-kit).
 * Each one re-implemented merge/split/transfer + hand-maintained the
 * `allowedAddresses` array Enoki requires. Two production bugs in the
 * past 60 days came from drift between them — PR-H1 (claim-rewards
 * self-transfer missing from allowedAddresses) and PR-H4 (borrow/
 * withdraw self-transfer same bug).
 *
 * Layer 0 collapses 3 of those stacks into one canonical primitive.
 * PayButton stays out by design (different signer, different trust
 * model — see `audric-canonical-write.mdc` for the rationale and the
 * `// CANONICAL-BYPASS:` escape-hatch contract).
 *
 * **What composeTx owns**
 *
 * - PTB assembly via per-tool wallet-mode appenders (the
 *   `WRITE_APPENDER_REGISTRY`).
 * - Pre-built `txKindBytes` (`tx.build({ onlyTransactionKind: true })`)
 *   ready for Enoki's `createSponsoredTransaction`.
 * - Auto-derived `derivedAllowedAddresses` from the assembled PTB's
 *   top-level `transferObjects` calls — eliminates the PR-H1/H4 bug
 *   class permanently. Hand-maintained arrays are now unreachable.
 * - S.38 Pyth flag plumbing — `sponsoredContext: true` automatically
 *   applies `skipPythUpdate` (borrow/withdraw) and `skipOracle` (repay)
 *   to NAVI appenders so Enoki doesn't reject `tx.gas`-as-argument.
 *
 * **What composeTx does NOT own**
 *
 * - **Fees** — Audric concern, not @t2000/sdk concern (CLAUDE.md
 *   rule #9). The SDK is fee-free by design as of @t2000/sdk@1.1.0
 *   (B5 v2). Audric host wraps composeTx with fee insertion in P2.2c.
 * - **Sponsorship** — caller's job. composeTx returns `txKindBytes`
 *   pre-built for Enoki; the caller calls `createSponsoredTransaction`
 *   with their JWT.
 * - **Chain-mode coin handoff between steps** — Layer 2 (engine
 *   bundling) ships this. P2.2b is wallet-mode-only: each step fetches
 *   coins independently. Layer 2 will extend by introducing
 *   `inputCoinFromStep: number` to thread upstream output coins.
 *
 * **Cross-references**
 *
 * - Spec → `spec/SPEC_7_MULTI_WRITE_PTB.md` § "Layer 0: Canonical
 *   Write Architecture"
 * - Read-side companion → `t2000/.cursor/rules/single-source-of-truth.mdc`
 *   + `audric/.cursor/rules/audric-canonical-portfolio.mdc`
 * - Write-side rule → `audric/.cursor/rules/audric-canonical-write.mdc`
 */

import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import {
  Transaction,
  type TransactionObjectArgument,
} from '@mysten/sui/transactions';
import type { OverlayFeeConfig } from './protocols/cetus-swap.js';
import {
  addSaveToTx,
  addWithdrawToTx,
  addBorrowToTx,
  addRepayToTx,
  addClaimRewardsToTx,
} from './protocols/navi.js';
import { addHarvestToTx } from './protocols/navi-harvest.js';
import type { PendingReward } from './adapters/types.js';
import { addSwapToTx, type SwapRouteResult } from './protocols/cetus-swap.js';
import { addSendToTx } from './wallet/send.js';
import { selectAndSplitCoin, selectSuiCoin } from './wallet/coinSelection.js';
import { resolveTokenType, getDecimalsForCoinType, SUI_TYPE } from './token-registry.js';
import {
  GASLESS_MIN_STABLE_AMOUNT,
  GASLESS_STABLE_TYPES,
  SUPPORTED_ASSETS,
  assertAllowedAsset,
  type SendableAsset,
  type SupportedAsset,
} from './constants.js';
import { T2000Error } from './errors.js';
import { validateAddress } from './utils/sui.js';

/**
 * Canonical write tools. The 8 tools that can be composed into a PTB.
 *
 * History:
 * - 2026-05-08 (Track B): added `harvest_rewards` (compound macro).
 * - 2026-05-25 (S.323): removed `volo_stake` / `volo_unstake` — full Volo
 *   cut across SDK/CLI/MCP after the engine cut Volo in S.277. vSUI
 *   remains as a passive token (NAVI reward, Cetus swap target).
 *
 * Excluded by design:
 * - `save_contact` — no on-chain leg (Prisma-only).
 */
export type WriteToolName =
  | 'save_deposit'
  | 'withdraw'
  | 'borrow'
  | 'repay_debt'
  | 'send_transfer'
  | 'swap_execute'
  | 'claim_rewards'
  | 'harvest_rewards';

// Per-tool input contracts. Match the engine tool input schemas, not the
// audric host's loosely-typed `params` blob — the registry is the typed
// surface that lets the host shed the `any`-typed switch statement.

export interface SaveDepositInput {
  amount: number;
  asset?: 'USDC' | 'USDsui';
}

export interface WithdrawInput {
  amount: number;
  asset?: 'USDC' | 'USDsui';
}

export interface BorrowInput {
  amount: number;
  asset?: 'USDC' | 'USDsui';
}

export interface RepayDebtInput {
  amount: number;
  asset?: 'USDC' | 'USDsui';
}

/**
 * [v4.0 Phase A Day 2 — SPEC_AGENT_WALLET_GREENFIELD §A]
 * `asset` is now REQUIRED (no more silent USDC default). The parameter
 * type is the wider `SupportedAsset` rather than the narrower
 * `SendableAsset` so callers that thread a wide-typed asset through
 * (primarily the engine LLM tool surface) compile without modification.
 * Runtime narrowing happens via `assertAllowedAsset('send', asset)`,
 * which throws `INVALID_ASSET` for anything outside the
 * `['USDC', 'USDsui', 'SUI']` whitelist. USDC + USDsui route through
 * the gasless `0x2::balance::send_funds` Move call; SUI uses the
 * standard `transferObjects` path.
 *
 * Audric hosts: the audric chat client (`audric-chat-client.tsx`)
 * already defaults asset to `'USDC'` at the marker layer before
 * calling `sponsoredTx({ type: 'send' })`, so this signature change
 * doesn't break the LLM flow. LLM intents like "send 5 WAL" now
 * surface a clear error instead of silently building a non-gasless
 * tx.
 */
export interface SendTransferInput {
  to: string;
  amount: number;
  asset: SupportedAsset;
}

export interface SwapExecuteInput {
  from: string;
  to: string;
  amount: number;
  slippage?: number;
  byAmountIn?: boolean;
  /** Cetus provider allow-list. Sponsored callers MUST pass an exclusion list
   *  to remove Pyth-dependent providers — see addSwapToTx JSDoc. composeTx
   *  derives this automatically from `sponsoredContext` if omitted. */
  providers?: string[];
  /**
   * [SPEC 20.2 / D-1 (a)] Optional precomputed Cetus route discovered at
   * `swap_quote` time. Bypasses `findSwapRoute()` (-400-500ms) inside
   * `addSwapToTx`. Caller (audric prepare-route) is responsible for
   * coin-type verification (D-2) + freshness check (D-3) before passing.
   * `addSwapToTx` performs an additional sanity check on `amountIn` +
   * `byAmountIn` and falls back to fresh discovery on mismatch.
   */
  precomputedRoute?: SwapRouteResult;
}

export type ClaimRewardsInput = Record<string, never>;

/**
 * [Track B] `harvest_rewards` accepts only optional tunables — no required
 * inputs, since the user's choice is binary ("harvest now" or not). Default
 * slippage 1%, default dust floor $0.01. The audric host's HARVEST chip
 * passes literal `{}` and gets sensible defaults.
 */
export interface HarvestRewardsInput {
  /** Per-swap slippage tolerance (0.001–0.05). Default 0.01 (1%). */
  slippage?: number;
  /** USD floor for "is this worth swapping?" — dust below transfers to wallet. Default $0.01. */
  minRewardUsd?: number;
}

/**
 * Discriminated union mapping `toolName` → `input`. Used to type
 * `WriteStep` so consumers get autocomplete + compile-time validation
 * that the input matches the tool.
 *
 * **[SPEC 13 Phase 1] `inputCoinFromStep`** — consumer steps may
 * reference an earlier step's output coin handle by index. When set,
 * `composeTx`'s orchestration loop threads the producer's
 * `outputCoin` into this step's appender as the `inputCoin` arg,
 * bypassing the wallet pre-fetch path. The producer's terminal
 * `tx.transferObjects([coin], sender)` is suppressed automatically so
 * the same handle isn't double-consumed.
 *
 * Producer-only tools (`withdraw`, `borrow`, `claim_rewards`) don't
 * accept the field — they have no input coin slot. Consumer +
 * dual-mode tools all accept it.
 */
export type WriteStep =
  | { toolName: 'save_deposit'; input: SaveDepositInput; inputCoinFromStep?: number }
  | { toolName: 'withdraw'; input: WithdrawInput }
  | { toolName: 'borrow'; input: BorrowInput }
  | { toolName: 'repay_debt'; input: RepayDebtInput; inputCoinFromStep?: number }
  | { toolName: 'send_transfer'; input: SendTransferInput; inputCoinFromStep?: number }
  | { toolName: 'swap_execute'; input: SwapExecuteInput; inputCoinFromStep?: number }
  | { toolName: 'claim_rewards'; input: ClaimRewardsInput }
  // Self-contained compound — internally claims, swaps, and deposits in
  // one PTB. Doesn't accept `inputCoinFromStep` because it's the only
  // step in the bundle (it's a "macro" appender, not a chainable producer
  // or consumer).
  | { toolName: 'harvest_rewards'; input: HarvestRewardsInput };

export interface ComposeTxOptions {
  sender: string;
  steps: WriteStep[];
  client: SuiJsonRpcClient;
  /**
   * S.38 Pyth flag (sponsorship-critical). When true:
   * - NAVI borrow/withdraw appenders apply `skipPythUpdate: true`
   *   (preserves on-chain price-feed updates, skips the tx.gas-using
   *   Pyth fee payment that Enoki rejects).
   * - NAVI repay appender applies `skipOracle: true` (debt reduction
   *   has no health-factor risk, full oracle bypass is safe).
   * - Cetus swap appender applies `getProvidersExcluding([HAEDALPMM,
   *   METASTABLE, OBRIC, STEAMM_OMM, STEAMM_OMM_V2, SEVENK,
   *   HAEDALHMMV2])` — Pyth-dependent providers reference `tx.gas` for
   *   oracle fees, also rejected by Enoki.
   * - SUI sends fetch coins via `getCoins` (tx.gas belongs to sponsor,
   *   not user) instead of splitting from `tx.gas`.
   *
   * Self-funded callers (CLI, MCP, server tasks) leave this `false` /
   * omit — they pay all oracle/Pyth fees from their own SUI gas.
   */
  sponsoredContext?: boolean;
  /**
   * Per-call overlay fee config for Cetus swaps. Audric host passes
   * `{ rate: 0.001, receiver: T2000_OVERLAY_FEE_WALLET }` to charge the
   * 0.1% swap overlay. CLI / direct SDK callers omit. Forwarded to
   * `addSwapToTx`'s `input.overlayFee`.
   */
  overlayFee?: OverlayFeeConfig;
  /**
   * Optional fee-injection hooks for save_deposit + borrow. Fires inside
   * the appender at the exact moment the user's coin is in hand and BEFORE
   * the protocol step consumes (save) or the canonical transferObjects
   * finalizes (borrow). Audric host uses this to inline `addFeeTransfer`
   * for USDC SAVE_FEE_BPS / BORROW_FEE_BPS without ever leaving the
   * canonical write contract — keeps the SDK fee-free per CLAUDE.md
   * rule #9 while letting hosts charge their own overlay fees.
   *
   * Hooks are fire-and-forget (no return value). They mutate `tx` directly
   * (e.g., `addFeeTransfer(tx, coin, ...)` splits the fee chunk off and
   * appends a top-level `transferObjects` to the host's fee wallet — that
   * recipient automatically appears in `derivedAllowedAddresses`).
   */
  feeHooks?: ComposeTxFeeHooks;
}

/**
 * Per-tool fee-injection callbacks. Each hook fires at a tool-specific
 * moment in the appender flow (see field JSDoc). Currently scoped to
 * the 2 fee-eligible tools — extend if/when new ones land.
 */
export interface ComposeTxFeeHooks {
  /**
   * Fires inside the `save_deposit` appender AFTER the user's USDC/USDsui
   * coin is split into the deposit amount, BEFORE NAVI's `deposit` move
   * call consumes the coin. Order matters: the `coin` reference passed in
   * is the SAME `TransactionObjectArgument` that flows into the deposit,
   * so any `splitCoins(coin, [feeAmount])` inside the hook reduces the
   * deposit by exactly that fee.
   */
  save_deposit?: (ctx: ComposeTxFeeHookContext<SaveDepositInput>) => void | Promise<void>;
  /**
   * Fires inside the `borrow` appender AFTER NAVI returns the borrowed
   * coin, BEFORE the canonical `transferObjects(coin, sender)` finalizes.
   * The `coin` reference is the borrowed-and-not-yet-transferred output;
   * splitting a fee here means the user receives the remainder.
   */
  borrow?: (ctx: ComposeTxFeeHookContext<BorrowInput>) => void | Promise<void>;
}

/**
 * Context object passed to every fee hook. Carries the `tx` (mutate it),
 * the in-flight `coin` (split fees off it), the resolved tool input
 * (asset/amount for fee-policy decisions), and the sender (rarely needed
 * but kept for symmetry with `AppenderContext`).
 */
export interface ComposeTxFeeHookContext<TInput> {
  tx: Transaction;
  coin: TransactionObjectArgument;
  input: TInput;
  sender: string;
}

/** Per-step preview returned by each registry appender. Tool-specific shape. */
export type StepPreview =
  | { toolName: 'save_deposit'; effectiveAmount: number; asset: 'USDC' | 'USDsui' }
  | { toolName: 'withdraw'; effectiveAmount: number; asset: 'USDC' | 'USDsui' }
  | { toolName: 'borrow'; effectiveAmount: number; asset: 'USDC' | 'USDsui' }
  | { toolName: 'repay_debt'; effectiveAmount: number; asset: 'USDC' | 'USDsui' }
  | { toolName: 'send_transfer'; effectiveAmount: number; recipient: string; asset: SendableAsset }
  | { toolName: 'swap_execute'; effectiveAmountIn: number; expectedAmountOut: number; route: SwapRouteResult }
  | { toolName: 'claim_rewards'; rewards: PendingReward[] }
  // Compact: the audric host renders a multi-line "Claim → Swap → Save"
  // breakdown card from this preview (claimed[], swaps[], skipped[],
  // expectedUsdcDeposited). One signature, one settlement.
  | {
      toolName: 'harvest_rewards';
      claimed: PendingReward[];
      swaps: Array<{
        fromSymbol: string;
        fromCoinType: string;
        toSymbol: 'USDC';
        inputAmount: number;
        expectedOutputUsdc: number;
      }>;
      skipped: Array<{
        symbol: string;
        coinType: string;
        amount: number;
        reason: 'untradeable' | 'dust' | 'no-route';
      }>;
      expectedUsdcDeposited: number;
    };

export interface ComposeTxResult {
  tx: Transaction;
  /**
   * Pre-built bytes for Enoki's `createSponsoredTransaction`. Built
   * with `onlyTransactionKind: true` so the gas coin can be supplied
   * by the sponsor.
   */
  txKindBytes: Uint8Array;
  /**
   * Auto-derived from the assembled PTB's top-level `transferObjects`
   * commands. Replaces hand-maintained `allowedAddresses` arrays in
   * audric host's `transactions/prepare` + `services/prepare` —
   * eliminates the PR-H1/H4 bug class permanently.
   */
  derivedAllowedAddresses: string[];
  perStepPreviews: StepPreview[];
}

/**
 * Per-appender context passed into every registry entry. Carries the
 * RPC client, sender, sponsorship flag, optional per-call overlay
 * fee config (Cetus swaps), and SPEC 13 Phase 1 chain-mode fields.
 */
export interface AppenderContext {
  client: SuiJsonRpcClient;
  sender: string;
  sponsoredContext: boolean;
  overlayFee?: OverlayFeeConfig;
  feeHooks?: ComposeTxFeeHooks;
  /**
   * [SPEC 13 Phase 1] When set, the consumer appender consumes this
   * coin handle directly instead of pre-fetching from the wallet via
   * `selectAndSplitCoin` / `selectSuiCoin`. Provided by the
   * orchestration loop when the step has `inputCoinFromStep` set; the
   * loop looks up `priorOutputs[step.inputCoinFromStep]` and threads
   * it through here.
   *
   * In chain mode, the consumer consumes the handle IN FULL — the
   * `input.amount` field is treated as informational (used for preview
   * math). This matches Cetus's `routerSwap`, NAVI's `deposit`/`repay`,
   * and the Sui `transferObjects` semantics: each takes a coin object
   * and consumes its entire balance.
   */
  chainedCoin?: TransactionObjectArgument;
  /**
   * [SPEC 13 Phase 1] True when this step's output coin will be
   * consumed by a downstream step (some later step has
   * `inputCoinFromStep === currentStepIndex`). Producer appenders MUST
   * skip their terminal `tx.transferObjects([coin], ctx.sender)` call
   * when this is true — otherwise the same `TransactionObjectArgument`
   * gets used twice (once by the consumer, once by the transfer) and
   * the PTB build fails or the on-chain leg reverts.
   */
  isOutputConsumed?: boolean;
}

/**
 * [SPEC 13 Phase 1] Appender return shape. Producers populate
 * `outputCoin` so the orchestration loop can thread it into a
 * downstream consumer's `chainedCoin`. Terminal consumers
 * (`save_deposit`, `repay_debt`, `send_transfer`) omit it.
 *
 * `swap_execute` is the only dual-mode tool — it accepts `chainedCoin`
 * AND populates `outputCoin`. (`volo_stake` / `volo_unstake` were also
 * dual-mode prior to S.323 / 2026-05-25; cut with the full Volo removal.)
 */
export interface AppenderResult<TPreview extends StepPreview> {
  preview: TPreview;
  outputCoin?: TransactionObjectArgument;
}

type AppenderFn<TInput, TPreview extends StepPreview> = (
  tx: Transaction,
  input: TInput,
  ctx: AppenderContext,
) => Promise<AppenderResult<TPreview>>;

/**
 * Cetus provider exclusion list for sponsored flows. Mirrors the
 * audric host's `SPONSORED_TX_PROVIDERS` constant — these 7 providers
 * reference `tx.gas` for Pyth oracle fee payments, which Enoki rejects.
 *
 * NOTE: keeping this hardcoded means `findSwapRoute` doesn't need a
 * dependency on `@cetusprotocol/aggregator-sdk`'s `getProvidersExcluding`
 * helper — composeTx forwards the literal list to Cetus, Cetus does the
 * inverse lookup. Result is identical.
 */
export const SPONSORED_PYTH_DEPENDENT_PROVIDERS = [
  'HAEDALPMM',
  'METASTABLE',
  'OBRIC',
  'STEAMM_OMM',
  'STEAMM_OMM_V2',
  'SEVENK',
  'HAEDALHMMV2',
] as const;

/**
 * Get all eligible Cetus provider names except the Pyth-dependent ones,
 * for sponsored swap context. Computed from the Cetus SDK's
 * `getAllProviders()` minus the exclusion list.
 *
 * [Bug A fix / 2026-05-10] Exported so the engine's `swap_quote` tool can
 * call this when discovering routes for sponsored hosts. Previously the
 * engine only exclude these providers at COMPOSE time; now it excludes
 * at QUOTE time too, so the precomputed route stashed on
 * `pending_action.cetusRoute` is always sponsor-safe.
 */
export async function getSponsoredSwapProviders(): Promise<string[]> {
  const { getProvidersExcluding } = await import('@cetusprotocol/aggregator-sdk');
  return getProvidersExcluding([...SPONSORED_PYTH_DEPENDENT_PROVIDERS]);
}

/** Resolve canonical asset symbol or throw `INVALID_ASSET`. */
function resolveSaveableAsset(asset: 'USDC' | 'USDsui' | undefined): 'USDC' | 'USDsui' {
  if (!asset) return 'USDC';
  if (asset !== 'USDC' && asset !== 'USDsui') {
    throw new T2000Error('ASSET_NOT_SUPPORTED', `Saveable asset must be USDC or USDsui, got ${asset}`);
  }
  return asset;
}

/**
 * The typed registry. Each entry is a wallet-mode dispatcher that takes
 * (tx, input, ctx) and returns a per-step preview. Compile-time check
 * that all 8 `WriteToolName` values have an entry — TypeScript will
 * fail the build if a tool is missing.
 */
export const WRITE_APPENDER_REGISTRY: {
  save_deposit: AppenderFn<SaveDepositInput, Extract<StepPreview, { toolName: 'save_deposit' }>>;
  withdraw: AppenderFn<WithdrawInput, Extract<StepPreview, { toolName: 'withdraw' }>>;
  borrow: AppenderFn<BorrowInput, Extract<StepPreview, { toolName: 'borrow' }>>;
  repay_debt: AppenderFn<RepayDebtInput, Extract<StepPreview, { toolName: 'repay_debt' }>>;
  send_transfer: AppenderFn<SendTransferInput, Extract<StepPreview, { toolName: 'send_transfer' }>>;
  swap_execute: AppenderFn<SwapExecuteInput, Extract<StepPreview, { toolName: 'swap_execute' }>>;
  claim_rewards: AppenderFn<ClaimRewardsInput, Extract<StepPreview, { toolName: 'claim_rewards' }>>;
  harvest_rewards: AppenderFn<HarvestRewardsInput, Extract<StepPreview, { toolName: 'harvest_rewards' }>>;
} = {
  save_deposit: async (tx, input, ctx) => {
    const asset = resolveSaveableAsset(input.asset);
    const assetInfo = SUPPORTED_ASSETS[asset];
    if (input.amount <= 0) {
      throw new T2000Error('INVALID_AMOUNT', 'Save amount must be greater than zero');
    }
    const rawAmount = BigInt(Math.floor(input.amount * 10 ** assetInfo.decimals));

    let coin: TransactionObjectArgument;
    let effectiveAmount: bigint;
    if (ctx.chainedCoin) {
      coin = ctx.chainedCoin;
      effectiveAmount = rawAmount;
    } else {
      const r = await selectAndSplitCoin(tx, ctx.client, ctx.sender, assetInfo.type, rawAmount);
      coin = r.coin;
      effectiveAmount = r.effectiveAmount;
    }

    if (ctx.feeHooks?.save_deposit) {
      await ctx.feeHooks.save_deposit({ tx, coin, input, sender: ctx.sender });
    }
    await addSaveToTx(tx, ctx.client, ctx.sender, coin, { asset });
    return {
      preview: {
        toolName: 'save_deposit',
        effectiveAmount: Number(effectiveAmount) / 10 ** assetInfo.decimals,
        asset,
      },
    };
  },

  withdraw: async (tx, input, ctx) => {
    const asset = resolveSaveableAsset(input.asset);
    if (input.amount <= 0) {
      throw new T2000Error('INVALID_AMOUNT', 'Withdraw amount must be greater than zero');
    }
    const { coin, effectiveAmount } = await addWithdrawToTx(
      tx, ctx.client, ctx.sender, input.amount,
      { asset, skipPythUpdate: ctx.sponsoredContext },
    );
    if (!ctx.isOutputConsumed) {
      tx.transferObjects([coin], ctx.sender);
    }
    return {
      preview: { toolName: 'withdraw', effectiveAmount, asset },
      outputCoin: coin,
    };
  },

  borrow: async (tx, input, ctx) => {
    const asset = resolveSaveableAsset(input.asset);
    if (input.amount <= 0) {
      throw new T2000Error('INVALID_AMOUNT', 'Borrow amount must be greater than zero');
    }
    const coin = await addBorrowToTx(
      tx, ctx.client, ctx.sender, input.amount,
      { asset, skipPythUpdate: ctx.sponsoredContext },
    );
    if (ctx.feeHooks?.borrow) {
      await ctx.feeHooks.borrow({ tx, coin, input, sender: ctx.sender });
    }
    if (!ctx.isOutputConsumed) {
      tx.transferObjects([coin], ctx.sender);
    }
    return {
      preview: { toolName: 'borrow', effectiveAmount: input.amount, asset },
      outputCoin: coin,
    };
  },

  repay_debt: async (tx, input, ctx) => {
    const asset = resolveSaveableAsset(input.asset);
    const assetInfo = SUPPORTED_ASSETS[asset];
    if (input.amount <= 0) {
      throw new T2000Error('INVALID_AMOUNT', 'Repay amount must be greater than zero');
    }
    const rawAmount = BigInt(Math.floor(input.amount * 10 ** assetInfo.decimals));

    let coin: TransactionObjectArgument;
    let effectiveAmount: bigint;
    if (ctx.chainedCoin) {
      coin = ctx.chainedCoin;
      effectiveAmount = rawAmount;
    } else {
      const r = await selectAndSplitCoin(tx, ctx.client, ctx.sender, assetInfo.type, rawAmount);
      coin = r.coin;
      effectiveAmount = r.effectiveAmount;
    }

    await addRepayToTx(tx, ctx.client, ctx.sender, coin, {
      asset,
      skipOracle: ctx.sponsoredContext,
    });
    return {
      preview: {
        toolName: 'repay_debt',
        effectiveAmount: Number(effectiveAmount) / 10 ** assetInfo.decimals,
        asset,
      },
    };
  },

  send_transfer: async (tx, input, ctx) => {
    const recipient = validateAddress(input.to);
    // [v4.0 Phase A Day 2] Asset is required (no `?? 'USDC'` default).
    // assertAllowedAsset narrows the runtime value to
    // `'USDC' | 'USDsui' | 'SUI'` and throws INVALID_ASSET otherwise.
    // The TypeScript shape is `SupportedAsset` (wider, accommodates
    // engine LLM tool callers that pass wide-typed assets through);
    // the runtime assertion is the canonical gate.
    if (!input.asset) {
      throw new T2000Error(
        'INVALID_ASSET',
        "send_transfer requires an explicit asset. Use one of: USDC, USDsui, SUI.",
      );
    }
    assertAllowedAsset('send', input.asset);
    const asset: SendableAsset = input.asset as SendableAsset;
    const assetInfo = SUPPORTED_ASSETS[asset];
    if (input.amount <= 0) {
      throw new T2000Error('INVALID_AMOUNT', 'Send amount must be greater than zero');
    }

    const rawAmount = BigInt(Math.floor(input.amount * 10 ** assetInfo.decimals));

    // [v4.0 Phase A Day 2] Chain-mode (`chainedCoin` from a previous
    // appender) ALWAYS uses the legacy `transferObjects` path —
    // bundles never qualify for gasless because the protocol allowlist
    // only accepts PTBs whose ops are `balance::send_funds` /
    // `balance::redeem_funds` / `coin::send_funds` etc. A withdraw →
    // send bundle has the withdraw Move call, so the whole tx pays gas.
    if (ctx.chainedCoin) {
      addSendToTx(tx, ctx.chainedCoin, recipient);
      return {
        preview: {
          toolName: 'send_transfer',
          effectiveAmount: Number(rawAmount) / 10 ** assetInfo.decimals,
          recipient,
          asset,
        },
      };
    }

    if (asset === 'SUI') {
      // Standard gas-native SUI transfer — NOT gasless (SUI is not on
      // the protocol `balance::send_funds` allowlist).
      const result = await selectSuiCoin(tx, ctx.client, ctx.sender, rawAmount, ctx.sponsoredContext);
      addSendToTx(tx, result.coin, recipient);
      return {
        preview: {
          toolName: 'send_transfer',
          effectiveAmount: Number(result.effectiveAmount) / 10 ** assetInfo.decimals,
          recipient,
          asset,
        },
      };
    }

    // USDC / USDsui — gasless single-step send via `0x2::balance::send_funds`.
    // Surfaces the protocol's 0.01 minimum BEFORE building so we don't
    // burn a sponsorship slot on a tx that will revert on-chain.
    if (input.amount < GASLESS_MIN_STABLE_AMOUNT) {
      throw new T2000Error(
        'INVALID_AMOUNT',
        `Minimum gasless transfer is ${GASLESS_MIN_STABLE_AMOUNT} ${asset}. Got ${input.amount}.`,
      );
    }
    // Pre-flight balance check (composeTx's selectAndSplitCoin used to
    // do this; we lose the coin-selection but keep the balance gate so
    // build-time errors stay actionable for audric's prepare route).
    const balanceResp = await ctx.client.getBalance({ owner: ctx.sender, coinType: assetInfo.type });
    if (BigInt(balanceResp.totalBalance) < rawAmount) {
      throw new T2000Error('INSUFFICIENT_BALANCE', `Insufficient ${asset} balance`, {
        available: Number(balanceResp.totalBalance) / 10 ** assetInfo.decimals,
        required: input.amount,
      });
    }
    const coinType = GASLESS_STABLE_TYPES[asset];
    tx.moveCall({
      target: '0x2::balance::send_funds',
      typeArguments: [coinType],
      arguments: [
        tx.balance({ type: coinType, balance: rawAmount }),
        tx.pure.address(recipient),
      ],
    });
    return {
      preview: {
        toolName: 'send_transfer',
        effectiveAmount: Number(rawAmount) / 10 ** assetInfo.decimals,
        recipient,
        asset,
      },
    };
  },

  swap_execute: async (tx, input, ctx) => {
    const fromType = resolveTokenType(input.from);
    const toType = resolveTokenType(input.to);
    if (!fromType || !toType) {
      throw new T2000Error(
        'ASSET_NOT_SUPPORTED',
        `Unknown token in swap: from=${input.from}, to=${input.to}`,
      );
    }

    const providers = input.providers
      ?? (ctx.sponsoredContext ? await getSponsoredSwapProviders() : undefined);

    const result = await addSwapToTx(tx, ctx.client, ctx.sender, {
      from: input.from,
      to: input.to,
      amount: input.amount,
      slippage: input.slippage,
      byAmountIn: input.byAmountIn,
      overlayFee: ctx.overlayFee,
      providers,
      inputCoin: ctx.chainedCoin,
      precomputedRoute: input.precomputedRoute,
      sponsoredContext: ctx.sponsoredContext,
    });
    if (!ctx.isOutputConsumed) {
      tx.transferObjects([result.coin], ctx.sender);
    }
    return {
      preview: {
        toolName: 'swap_execute',
        effectiveAmountIn: result.effectiveAmountIn,
        expectedAmountOut: result.expectedAmountOut,
        route: result.route,
      },
      outputCoin: result.coin,
    };
  },

  claim_rewards: async (tx, _input, ctx) => {
    const rewards = await addClaimRewardsToTx(tx, ctx.client, ctx.sender);
    return { preview: { toolName: 'claim_rewards', rewards } };
  },

  // [Track B / 2026-05-08] Macro appender — assembles claim → swap(s) →
  // save inline. The audric host wires `getSponsoredSwapProviders()` into
  // `options.providers` automatically when `ctx.sponsoredContext === true`
  // (parity with `swap_execute` below). Slippage + dust-floor pulled from
  // the input; price cache is forwarded from the host so the dust filter
  // can compare claimed amounts to USD.
  harvest_rewards: async (tx, input, ctx) => {
    const providers = ctx.sponsoredContext ? await getSponsoredSwapProviders() : undefined;
    // [v1.24.2 fee wiring] Forward host fee config into the harvest macro
    // so each internal swap leg charges the overlay AND the deposit leg
    // skims the save fee. Without this, harvest_rewards bypassed both
    // mechanisms (live-prod regression observed 2026-05-08 — see S.120).
    // The save_deposit hook is reused as-is; the harvest macro calls it
    // with `input.asset === 'USDC'` and the merged USDC deposit coin,
    // matching what the audric host's hook already expects.
    const plan = await addHarvestToTx(tx, ctx.client, ctx.sender, {
      slippage: input.slippage,
      minRewardUsd: input.minRewardUsd,
      providers,
      overlayFee: ctx.overlayFee,
      saveFeeHook: ctx.feeHooks?.save_deposit,
    });
    return {
      preview: {
        toolName: 'harvest_rewards',
        claimed: plan.claimed,
        swaps: plan.swaps,
        skipped: plan.skipped,
        expectedUsdcDeposited: plan.expectedUsdcDeposited,
      },
    };
  },

  // [S.323 / 2026-05-25] volo_stake / volo_unstake appenders removed.
};

// Reference unused import to suppress noUnusedLocals; SUI_TYPE is used
// by selectSuiCoin internally and re-export from index.ts.
void SUI_TYPE;
void getDecimalsForCoinType;

/**
 * Walks the assembled PTB's command list and extracts every recipient
 * address from top-level `TransferObjects` commands. Top-level only —
 * recipients inside nested Move calls are NOT inspected (Enoki only
 * cross-checks top-level commands).
 *
 * Replaces hand-maintained `allowedAddresses` arrays. Two production
 * bugs in 60 days came from drift between the array and the actual
 * PTB recipients (PR-H1 + PR-H4). Computing this from the PTB makes
 * drift impossible by construction.
 */
export function deriveAllowedAddressesFromPtb(tx: Transaction): string[] {
  const addresses = new Set<string>();
  const data = tx.getData();

  const addAddressFromInput = (inputIndex: number | undefined): void => {
    if (inputIndex === undefined) return;
    const input = data.inputs[inputIndex];
    if (!input) return;
    const pureBytes = (input as { Pure?: { bytes?: string } }).Pure?.bytes;
    if (!pureBytes) return;
    // Pure bytes are base64-encoded BCS for Sui addresses (32 bytes →
    // 44-char base64). Decode + format as 0x-prefixed hex.
    try {
      const bytes = base64ToBytes(pureBytes);
      if (bytes.length !== 32) return; // not an address
      const hex = '0x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
      addresses.add(hex);
    } catch {
      // not a parseable address — skip
    }
  };

  for (const cmd of data.commands) {
    // Path 1 — `TransferObjects.address` (the legacy send/withdraw/
    // claim/fee-transfer recipient surface). The Sui transaction-builder
    // stores each top-level command as a tagged object:
    //   { TransferObjects: { objects, address: { Input: <index> } } }.
    const transferCmd = (cmd as { TransferObjects?: unknown }).TransferObjects;
    if (transferCmd) {
      const addressArg = (transferCmd as { address?: unknown }).address;
      const addressInputIndex = (addressArg as { Input?: number } | undefined)?.Input;
      addAddressFromInput(addressInputIndex);
      continue;
    }

    // Path 2 — `0x2::balance::send_funds(balance, recipient)` (gasless
    // stablecoin transfer, v4.0 Phase A Day 2). Recipient is arg[1],
    // not a TransferObjects.address. The Move call shape:
    //   { MoveCall: { package, module, function, arguments: [...] } }
    //   target = `0x2::balance::send_funds`, arguments[1] = recipient.
    const moveCall = (cmd as { MoveCall?: unknown }).MoveCall;
    if (moveCall) {
      const mc = moveCall as {
        package?: string;
        module?: string;
        function?: string;
        arguments?: Array<{ Input?: number } | unknown>;
      };
      // The `package` field is the normalized framework address. For
      // `0x2::balance::send_funds` it's `0x0000…0002` (`SUI_FRAMEWORK_ADDRESS`).
      // Match on module + function defensively; the recipient extraction
      // only fires when the signature matches.
      const isBalanceSendFunds =
        mc.module === 'balance' && mc.function === 'send_funds';
      const isCoinSendFunds =
        mc.module === 'coin' && mc.function === 'send_funds';
      if (isBalanceSendFunds || isCoinSendFunds) {
        const args = mc.arguments ?? [];
        const recipientArg = args[1] as { Input?: number } | undefined;
        addAddressFromInput(recipientArg?.Input);
      }
      continue;
    }
  }

  return Array.from(addresses);
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(b64, 'base64'));
  }
  // Browser fallback (in case this ever runs in a worker)
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Compose a PTB from a list of canonical write steps. Each step
 * dispatches to its registered fragment-appender; the assembled PTB is
 * returned alongside pre-built `txKindBytes` ready for Enoki sponsorship
 * + auto-derived `derivedAllowedAddresses`.
 *
 * Single-step: `composeTx({ steps: [{ toolName: 'send_transfer', input: {...} }], ... })`
 * Multi-step (Layer 2): `composeTx({ steps: [{...}, {...}, {...}], ... })`
 *
 * Throws:
 * - `T2000Error('NO_APPENDER')` — unknown `toolName`
 * - Any error thrown by the per-step appender (insufficient balance,
 *   asset not supported, route not found, etc.) — propagates as-is.
 */
export async function composeTx(opts: ComposeTxOptions): Promise<ComposeTxResult> {
  const tx = new Transaction();
  tx.setSender(opts.sender);

  const baseCtx = {
    client: opts.client,
    sender: opts.sender,
    sponsoredContext: opts.sponsoredContext ?? false,
    overlayFee: opts.overlayFee,
    feeHooks: opts.feeHooks,
  };

  // [SPEC 13 Phase 1] First pass: validate every `inputCoinFromStep`
  // reference and build the `consumedSteps` set. Forward-only
  // references; producer-only tools can't be consumers.
  const consumedSteps = new Set<number>();
  for (let i = 0; i < opts.steps.length; i++) {
    const step = opts.steps[i];
    const stepWithChain = step as { inputCoinFromStep?: number };
    const idx = stepWithChain.inputCoinFromStep;
    if (idx === undefined) continue;

    if (!Number.isInteger(idx) || idx < 0 || idx >= i) {
      throw new T2000Error(
        'CHAIN_MODE_INVALID',
        `Step ${i} (${step.toolName}) has inputCoinFromStep=${idx}, ` +
        `which must be a non-negative integer < ${i} (forward-only references).`,
      );
    }

    const producer = opts.steps[idx];
    if (
      producer.toolName === 'save_deposit' ||
      producer.toolName === 'repay_debt' ||
      producer.toolName === 'send_transfer' ||
      producer.toolName === 'claim_rewards'
    ) {
      throw new T2000Error(
        'CHAIN_MODE_INVALID',
        `Step ${i} (${step.toolName}) references step ${idx} (${producer.toolName}) as ` +
        `producer, but '${producer.toolName}' is a terminal consumer that does not ` +
        `produce a chainable coin handle. Allowed producers: withdraw, borrow, ` +
        `swap_execute.`,
      );
    }

    consumedSteps.add(idx);
  }

  // [SPEC 13 Phase 1] Second pass: dispatch each step in order,
  // capturing producers' output handles in `priorOutputs` and threading
  // them into consumers' `chainedCoin`.
  const priorOutputs: (TransactionObjectArgument | null)[] = [];
  const previews: StepPreview[] = [];
  for (let i = 0; i < opts.steps.length; i++) {
    const step = opts.steps[i];
    const appender = (WRITE_APPENDER_REGISTRY as Record<string, AppenderFn<unknown, StepPreview>>)[step.toolName];
    if (!appender) {
      throw new T2000Error(
        'UNKNOWN',
        `No fragment appender registered for tool '${step.toolName}'. ` +
        `Allowed: ${(Object.keys(WRITE_APPENDER_REGISTRY) as WriteToolName[]).join(', ')}`,
      );
    }

    const stepWithChain = step as { inputCoinFromStep?: number };
    let chainedCoin: TransactionObjectArgument | undefined;
    if (stepWithChain.inputCoinFromStep !== undefined) {
      const upstream = priorOutputs[stepWithChain.inputCoinFromStep];
      if (!upstream) {
        // Producer didn't return an outputCoin (shouldn't happen given the
        // first-pass guard, but defends against future appender bugs).
        throw new T2000Error(
          'CHAIN_MODE_INVALID',
          `Step ${i} (${step.toolName}) expected a coin handle from step ` +
          `${stepWithChain.inputCoinFromStep}, but the producer did not return one.`,
        );
      }
      chainedCoin = upstream;
    }

    const stepCtx: AppenderContext = {
      ...baseCtx,
      chainedCoin,
      isOutputConsumed: consumedSteps.has(i),
    };

    const result = await appender(tx, step.input, stepCtx);
    priorOutputs.push(result.outputCoin ?? null);
    previews.push(result.preview);
  }

  const txKindBytes = await tx.build({ client: opts.client, onlyTransactionKind: true });
  const derivedAllowedAddresses = deriveAllowedAddressesFromPtb(tx);

  return {
    tx,
    txKindBytes,
    derivedAllowedAddresses,
    perStepPreviews: previews,
  };
}
