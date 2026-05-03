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
import type { PendingReward } from './adapters/types.js';
import { addSwapToTx, type SwapRouteResult } from './protocols/cetus-swap.js';
import {
  addStakeVSuiToTx,
  addUnstakeVSuiToTx,
} from './protocols/volo.js';
import { addSendToTx } from './wallet/send.js';
import { selectAndSplitCoin, selectSuiCoin } from './wallet/coinSelection.js';
import { resolveTokenType, getDecimalsForCoinType, SUI_TYPE } from './token-registry.js';
import { SUPPORTED_ASSETS, type SupportedAsset } from './constants.js';
import { T2000Error } from './errors.js';
import { validateAddress } from './utils/sui.js';

/**
 * Canonical write tools. The 9 tools that can be composed into a PTB.
 *
 * Excluded by design:
 * - `pay_api` — recipient/amount unknown at compose time; the on-chain
 *   leg uses `send_transfer` after the gateway 402 challenge resolves.
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
  | 'volo_stake'
  | 'volo_unstake';

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

export interface SendTransferInput {
  to: string;
  amount: number;
  asset?: SupportedAsset;
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
}

export type ClaimRewardsInput = Record<string, never>;

export interface VoloStakeInput {
  amountSui: number;
}

export interface VoloUnstakeInput {
  amountVSui: number | 'all';
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
  | { toolName: 'volo_stake'; input: VoloStakeInput; inputCoinFromStep?: number }
  | { toolName: 'volo_unstake'; input: VoloUnstakeInput; inputCoinFromStep?: number };

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
  | { toolName: 'send_transfer'; effectiveAmount: number; recipient: string; asset: SupportedAsset }
  | { toolName: 'swap_execute'; effectiveAmountIn: number; expectedAmountOut: number; route: SwapRouteResult }
  | { toolName: 'claim_rewards'; rewards: PendingReward[] }
  | { toolName: 'volo_stake'; effectiveAmountMist: bigint }
  | { toolName: 'volo_unstake'; effectiveAmountMist: bigint | 'all' };

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
 * `swap_execute`, `volo_stake`, and `volo_unstake` are dual-mode —
 * they accept `chainedCoin` AND populate `outputCoin`.
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
const SPONSORED_PYTH_DEPENDENT_PROVIDERS = [
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
 */
async function getSponsoredSwapProviders(): Promise<string[]> {
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
 * that all 9 `WriteToolName` values have an entry — TypeScript will
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
  volo_stake: AppenderFn<VoloStakeInput, Extract<StepPreview, { toolName: 'volo_stake' }>>;
  volo_unstake: AppenderFn<VoloUnstakeInput, Extract<StepPreview, { toolName: 'volo_unstake' }>>;
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
    const asset: SupportedAsset = input.asset ?? 'USDC';
    const assetInfo = SUPPORTED_ASSETS[asset];
    if (!assetInfo) {
      throw new T2000Error('ASSET_NOT_SUPPORTED', `Asset ${asset} is not supported`);
    }
    if (input.amount <= 0) {
      throw new T2000Error('INVALID_AMOUNT', 'Send amount must be greater than zero');
    }

    const rawAmount = BigInt(Math.floor(input.amount * 10 ** assetInfo.decimals));

    let coin: TransactionObjectArgument;
    let effectiveRaw: bigint;

    if (ctx.chainedCoin) {
      coin = ctx.chainedCoin;
      effectiveRaw = rawAmount;
    } else if (asset === 'SUI') {
      const result = await selectSuiCoin(tx, ctx.client, ctx.sender, rawAmount, ctx.sponsoredContext);
      coin = result.coin;
      effectiveRaw = result.effectiveAmount;
    } else {
      const result = await selectAndSplitCoin(tx, ctx.client, ctx.sender, assetInfo.type, rawAmount);
      coin = result.coin;
      effectiveRaw = result.effectiveAmount;
    }

    addSendToTx(tx, coin, recipient);
    return {
      preview: {
        toolName: 'send_transfer',
        effectiveAmount: Number(effectiveRaw) / 10 ** assetInfo.decimals,
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

  volo_stake: async (tx, input, ctx) => {
    if (input.amountSui <= 0) {
      throw new T2000Error('INVALID_AMOUNT', 'Stake amount must be greater than zero');
    }
    const amountMist = BigInt(Math.floor(input.amountSui * 1e9));
    const result = await addStakeVSuiToTx(tx, ctx.client, ctx.sender, {
      amountMist,
      inputCoin: ctx.chainedCoin,
    });
    if (!ctx.isOutputConsumed) {
      tx.transferObjects([result.coin], ctx.sender);
    }
    return {
      preview: { toolName: 'volo_stake', effectiveAmountMist: result.effectiveAmountMist },
      outputCoin: result.coin,
    };
  },

  volo_unstake: async (tx, input, ctx) => {
    const amountMist =
      input.amountVSui === 'all' ? 'all' : BigInt(Math.floor(input.amountVSui * 1e9));
    if (amountMist !== 'all' && amountMist <= 0n) {
      throw new T2000Error('INVALID_AMOUNT', 'Unstake amount must be greater than zero');
    }
    const result = await addUnstakeVSuiToTx(tx, ctx.client, ctx.sender, {
      amountMist,
      inputCoin: ctx.chainedCoin,
    });
    if (!ctx.isOutputConsumed) {
      tx.transferObjects([result.coin], ctx.sender);
    }
    return {
      preview: { toolName: 'volo_unstake', effectiveAmountMist: result.effectiveAmountMist },
      outputCoin: result.coin,
    };
  },
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

  for (const cmd of data.commands) {
    // The Sui transaction-builder stores each top-level command as a
    // tagged object: { TransferObjects: { objects, address } }.
    // Inspect the `TransferObjects.address` field — it's a typed input
    // reference that resolves to a literal `Pure` input holding the
    // recipient bytes.
    const transferCmd = (cmd as { TransferObjects?: unknown }).TransferObjects;
    if (!transferCmd) continue;

    const addressArg = (transferCmd as { address?: unknown }).address;
    if (!addressArg) continue;

    const addressInputIndex = (addressArg as { Input?: number }).Input;
    if (addressInputIndex === undefined) continue;

    const input = data.inputs[addressInputIndex];
    if (!input) continue;

    const pureBytes = (input as { Pure?: { bytes?: string } }).Pure?.bytes;
    if (!pureBytes) continue;

    // Pure bytes are base64-encoded BCS for Sui addresses (32 bytes →
    // 44-char base64). Decode + format as 0x-prefixed hex.
    try {
      const bytes = base64ToBytes(pureBytes);
      if (bytes.length !== 32) continue; // not an address
      const hex = '0x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
      addresses.add(hex);
    } catch {
      // not a parseable address — skip
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
        `swap_execute, volo_stake, volo_unstake.`,
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
