import { z } from 'zod';
import type { PendingReward } from '@t2000/sdk';
import { defineTool } from '../v2/define-tool.js';

/**
 * [Track B / 2026-05-08] `harvest_rewards` — single-PTB compound flow.
 *
 * **What it does (and why it's its own tool, not a multi-step skill).**
 *
 * Many users want the same closed loop on their NAVI rewards every time:
 * claim → swap (everything that isn't already USDC) → save (deposit the
 * USDC into the NAVI USDC pool to keep earning yield). Pre–Track B, the
 * agent had to issue THREE separate writes — three confirm cards, three
 * Enoki sponsorships, three tx digests, plus the orchestration risk of
 * a partial failure (claimed but didn't swap; or claimed + swapped but
 * the deposit never went out).
 *
 * `harvest_rewards` collapses all of that into ONE Programmable Transaction
 * Block via the SDK's `buildHarvestRewardsTx` builder. The user signs once;
 * either every leg settles or none of them do (atomic). The audric host
 * surfaces this as the "🌾 HARVEST" chip under Save (Track B.3).
 *
 * **Compared to `claim_rewards`.** `claim_rewards` is the bare claim — it
 * leaves rewards as wallet assets (vSUI, NAVX, etc.). It's the right call
 * when the user wants to RECEIVE the reward token (e.g. they're trading
 * NAVX manually). `harvest_rewards` is the right call when the user wants
 * the reward to flow back into their savings stack (the much more common
 * case).
 *
 * **What gets swapped, what gets transferred to wallet.**
 *
 *   - If the reward IS USDC, it skips the swap leg and goes straight into
 *     the deposit.
 *   - If the reward is in `COIN_REGISTRY` AND tradeable on Cetus (every
 *     tier-2 token effectively — vSUI, NAVX, NS, etc.), it gets swapped
 *     to USDC inline (chain mode) and added to the deposit.
 *   - If the reward is untradeable (no Cetus liquidity, no `COIN_REGISTRY`
 *     entry, OR `SWAP_NO_ROUTE` at quote time), it gets transferred back
 *     to the user's wallet — preserving the claim, just skipping the
 *     auto-deposit.
 *   - If `priceCache` knows the symbol AND `amount * price < minRewardUsd`
 *     ($0.01 default), the reward is treated as dust and transferred to
 *     the wallet — not worth the swap fee + slippage.
 *
 * **Failure modes (truthful surfacing — see `single-source-of-truth.mdc`).**
 *
 *   - PROTOCOL_UNAVAILABLE — NAVI rewards lookup failed, NAVI claim PTB
 *     build failed, OR the deposit step failed. The card narrates "NAVI
 *     is degraded right now."
 *   - INVALID_AMOUNT — no rewards to harvest. Card narrates "Nothing to
 *     harvest right now."
 *
 * **Permission posture.** `confirm` always — even sub-$1 harvests deserve
 * a confirm card because the bundle includes a swap (slippage) AND a
 * deposit (commits funds to NAVI's pool). The user's preset can downgrade
 * `claim_rewards` to `auto`, but harvest stays a confirm by design.
 */

interface HarvestRewardsResult {
  success: boolean;
  tx: string | null;
  /** Pre-flight plan from the SDK builder. The host fills `tx` after execution. */
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
  totalClaimedValueUsd: number;
  gasCost: number;
  degraded: boolean;
  degradationReason: string | null;
}

/**
 * Adaptive precision so a 0.0165 vSUI claim renders cleanly in the
 * narration even when USD pricing is unavailable. Same scheme as
 * `claim_rewards` and `pending_rewards`.
 */
function formatAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '0';
  if (amount >= 1) return amount.toFixed(4).replace(/\.?0+$/, '');
  if (amount >= 0.0001) return amount.toFixed(6).replace(/\.?0+$/, '');
  return amount.toExponential(2);
}

export const harvestRewardsTool = defineTool({
  name: 'harvest_rewards',
  description:
    'Compound write: claim all NAVI rewards, swap each non-USDC reward to USDC inline, deposit the merged USDC into NAVI savings. ONE confirm card, atomic settlement (every leg lands or none of them do). Use when the user wants their rewards to keep earning yield (the common case). Prefer `claim_rewards` instead when the user explicitly wants to RECEIVE the reward token (e.g. "I want my NAVX in my wallet"). Untradeable rewards get transferred back to wallet automatically — they don\'t block the harvest. Dust rewards (< $0.01) likewise. ' +
    'Returns a plan: claimed[], swaps[] (with expected USDC out per leg), skipped[] (with reason), expectedUsdcDeposited, plus the on-chain tx hash. ' +
    'Permission: always `confirm` — never auto-executes regardless of preset, because the bundle includes a swap + deposit and the user should see the breakdown.',
  inputSchema: z.object({
    slippage: z
      .number()
      .min(0.001)
      .max(0.05)
      .optional()
      .describe('Per-swap slippage tolerance (0.001–0.05). Defaults to 0.01 (1%).'),
    minRewardUsd: z
      .number()
      .min(0)
      .optional()
      .describe(
        'USD floor for "is this worth swapping?". Rewards below this transfer to wallet instead of being swapped. Default $0.01. Pass 0 to disable.',
      ),
  }),
  isReadOnly: false,
  permissionLevel: 'confirm',
  flags: { mutating: true },
  preflight: (input) => {
    if (input.slippage !== undefined) {
      if (input.slippage < 0.001 || input.slippage > 0.05) {
        return {
          valid: false,
          error: 'Slippage must be between 0.001 (0.1%) and 0.05 (5%).',
        };
      }
    }
    if (input.minRewardUsd !== undefined && input.minRewardUsd < 0) {
      return { valid: false, error: 'minRewardUsd cannot be negative.' };
    }
    return { valid: true };
  },

  async call(input, context) {
    // The actual on-chain execution happens host-side via composeTx +
    // sponsored-tx flow. The engine tool's job is to:
    //   1. Validate input.
    //   2. Yield as a `pending_action` (the engine's permission gate
    //      handles this automatically because permissionLevel is
    //      'confirm').
    //   3. Surface the SDK's HarvestPlan in the result so the LLM can
    //      narrate "you claimed X, swapped Y to Z USDC, deposited W."
    //
    // The HarvestPlan fields are populated by the host's prepare route
    // (via `composeTx({ steps: [{ toolName: 'harvest_rewards', input }] })`)
    // and threaded back into the resume flow's result. At pre-execute
    // time (the path this `call` actually runs), we return an empty
    // shell — the harness uses input + the tool's permission level
    // to drive the confirm card. After confirmation + on-chain
    // settlement, the host writes the populated plan back via the
    // resume route's `pendingActionOutcome` field.
    //
    // The display text below is the PRE-confirm narration the LLM uses
    // to introduce the harvest to the user. Post-confirm narration
    // (with actual claimed amounts + tx hash) is built from
    // `pendingActionOutcome.result` by the resume narration step.
    void input; // input is forwarded via pending_action; not used here directly
    void context;

    const data: HarvestRewardsResult = {
      success: false,
      tx: null,
      claimed: [],
      swaps: [],
      skipped: [],
      expectedUsdcDeposited: 0,
      totalClaimedValueUsd: 0,
      gasCost: 0,
      degraded: false,
      degradationReason: null,
    };

    // Pre-confirm narration. The LLM uses this to ask the user if they
    // want to proceed BEFORE the confirm card opens. After execution,
    // the resume narration overrides this with the actual outcome.
    const displayText =
      'Ready to harvest your NAVI rewards: I will claim everything that\'s pending, ' +
      'swap any non-USDC rewards into USDC, and deposit the total back into your NAVI ' +
      'savings — all in one transaction. Untradeable or tiny rewards transfer to your ' +
      'wallet so nothing is lost.';

    return { data, displayText };
  },
});

/**
 * Helper to format a HarvestRewardsResult into a post-execution narration
 * line. Exposed so the audric host's resume route can call this when
 * stitching the executed plan back into the LLM's context.
 *
 * Example outputs:
 *   - "Harvested 0.0165 vSUI + 12.4 NAVX → ~$1.22 USDC deposited (tx: 0xabc…)"
 *   - "Claimed 0.5 USDC and deposited it (tx: 0xabc…)"
 *   - "Claimed 0.0001 WEIRD — untradeable, sent to your wallet (tx: 0xabc…)"
 */
export function narrateHarvestResult(result: HarvestRewardsResult): string {
  if (result.degraded) {
    return result.degradationReason === 'PROTOCOL_UNAVAILABLE'
      ? 'Harvest failed — NAVI is degraded right now. Try again in a moment.'
      : 'Harvest failed — protocol error. Try again in a moment.';
  }
  if (result.claimed.length === 0) {
    return 'Nothing to harvest right now — no pending rewards.';
  }
  const claimedSummary = result.claimed
    .map((r) => `${formatAmount(r.amount)} ${r.symbol}`)
    .join(', ');
  const txShort = result.tx ? ` (tx: ${result.tx.slice(0, 8)}…)` : '';

  if (result.expectedUsdcDeposited > 0) {
    const depositedFmt = result.expectedUsdcDeposited.toFixed(
      result.expectedUsdcDeposited >= 1 ? 2 : 4,
    );
    const skippedNote = result.skipped.length > 0
      ? ` (${result.skipped.length} reward${result.skipped.length === 1 ? '' : 's'} sent to wallet — untradeable or below dust floor)`
      : '';
    return `Harvested ${claimedSummary} → ~$${depositedFmt} USDC deposited to savings${skippedNote}${txShort}`;
  }
  // All-skipped case (every reward was untradeable / dust / no-route).
  return `Claimed ${claimedSummary} — all rewards transferred to your wallet (no auto-deposit; nothing was tradeable)${txShort}`;
}
