import { tool } from 'ai';
import { z } from 'zod';
import { getPendingRewardsByAddress, type PendingReward } from '@t2000/sdk';
// [SPEC AI SDK HARDENING P4.1 Batch 3 / 2026-05-25] Native AI SDK shape.
import {
  wrapEngineExecute,
  buildNeedsApproval,
} from '../v2/tool-helpers.js';
import type { ToolContext, ToolResult } from '../types.js';

interface PendingRewardsResult {
  rewards: PendingReward[];
  totalValueUsd: number;
  degraded: boolean;
  degradationReason: string | null;
}

/**
 * [S18-F20] `pending_rewards` — read-only inspector for unclaimed protocol
 * rewards. Companion to the existing `claim_rewards` write tool, designed
 * for two purposes:
 *
 * 1. **Pre-claim disclosure.** Lets the LLM tell the user what's
 *    sitting in their lending position waiting to be claimed
 *    ("you have 0.0165 vSUI ≈ $0.04 + 12.4 NAVX ≈ $1.20 unclaimed")
 *    before they reach for the chip. Pre-S18-F20 the agent had to
 *    speculatively call `claim_rewards` (a write) just to check —
 *    which would either silently say "no rewards" during NAVI
 *    degradation or burn a confirm card.
 *
 * 2. **Harvest planning input.** When `harvest_rewards` (the compound
 *    tool that bundles claim → swap → save) ships, it reads from
 *    here to know which reward coins exist and whether each one
 *    clears the dust threshold for the auto-swap leg.
 *
 * Surfaces the same NAVI degradation as `claim_rewards` — when the
 * underlying `agent.getPendingRewards()` throws PROTOCOL_UNAVAILABLE,
 * we narrate "NAVI is degraded right now" instead of silently
 * returning an empty list (which would be a false negative).
 */
function formatAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '0';
  if (amount >= 1) return amount.toFixed(4).replace(/\.?0+$/, '');
  if (amount >= 0.0001) return amount.toFixed(6).replace(/\.?0+$/, '');
  return amount.toExponential(2);
}

// ---------------------------------------------------------------------------
// Shared business logic — same body backs the native + legacy exports
// ---------------------------------------------------------------------------
const pendingRewardsDescription =
  "Inspect unclaimed protocol rewards for the signed-in user without claiming them. Returns a per-asset breakdown — symbol, amount, USD value (when oracle prices are known) — plus the total claimable USD. Use BEFORE calling claim_rewards or harvest_rewards so you can tell the user exactly what's claimable; if zero rewards or NAVI is degraded, surface that truthfully instead of jumping to a write. Read-only, never opens a confirm card.";

const pendingRewardsInputSchema = z.object({});

type PendingRewardsInput = z.infer<typeof pendingRewardsInputSchema>;

async function pendingRewardsCallBody(
  _input: PendingRewardsInput,
  context: ToolContext,
): Promise<ToolResult<PendingRewardsResult>> {
    // [Track B follow-up / 2026-05-08] Two equally-valid paths:
    //   - Agent path (CLI / standalone): `context.agent.getPendingRewards()`.
    //   - Stateless path (audric): `getPendingRewardsByAddress(walletAddress, suiRpcUrl)`.
    // Audric NEVER instantiates a T2000 agent (it uses the sponsored-tx
    // flow), so the pre-fix `requireAgent` jump was a hard fail — caught
    // by live mainnet smoke 2026-05-08 when the LLM correctly called
    // pending_rewards as a precursor to harvest. Prefer the agent when
    // present (back-compat with CLI tests), fall back to the stateless
    // helper otherwise (audric path). Both call into the same underlying
    // `getPendingRewards(client, address)` so degradation behavior is
    // identical (PROTOCOL_UNAVAILABLE flows through unchanged).
    let rewards;
    try {
      const agent = context.agent as
        | { getPendingRewards: () => Promise<PendingReward[]> }
        | undefined;
      if (agent && typeof agent.getPendingRewards === 'function') {
        rewards = await agent.getPendingRewards();
      } else if (context.walletAddress) {
        rewards = await getPendingRewardsByAddress(
          context.walletAddress,
          context.suiRpcUrl,
        );
      } else {
        throw new Error(
          'pending_rewards requires either context.agent (CLI path) or context.walletAddress + context.suiRpcUrl (audric path).',
        );
      }
    } catch (err) {
      const errAny = err as { code?: string; message?: string };
      const isProtocolDown = errAny?.code === 'PROTOCOL_UNAVAILABLE';
      const detail =
        typeof errAny?.message === 'string' ? errAny.message.replace(/^[^:]*:\s*/, '') : '';
      const displayText = isProtocolDown
        ? `Could not check pending rewards — NAVI is degraded right now${detail ? ` (${detail.slice(0, 80)})` : ''}. Try again in a moment.`
        : 'Could not check pending rewards — protocol error. Try again in a moment.';
      const data: PendingRewardsResult = {
        rewards: [],
        totalValueUsd: 0,
        degraded: true,
        degradationReason: errAny?.code ?? 'UNKNOWN',
      };
      return { data, displayText };
    }

    // Same priceCache enrichment pattern as `claim_rewards` — the SDK
    // adapter has no oracle, so estimatedValueUsd is always 0 from
    // upstream. The engine's priceCache (populated by the harness) lets
    // us narrate "0.0165 vSUI ≈ $0.04" instead of "0.0165 vSUI" alone.
    const priceCache = context.priceCache;
    const enriched = rewards.map((r) => {
      if (r.estimatedValueUsd > 0) return r;
      const price = priceCache?.get(r.symbol.toUpperCase());
      if (!price || !Number.isFinite(price) || price <= 0) return r;
      return { ...r, estimatedValueUsd: r.amount * price };
    });

    const totalValueUsd = enriched.reduce(
      (s, r) => s + (Number.isFinite(r.estimatedValueUsd) ? r.estimatedValueUsd : 0),
      0,
    );

    let displayText: string;
    if (enriched.length === 0) {
      displayText = 'No pending rewards.';
    } else {
      const breakdown = enriched
        .map((r) => {
          const usd =
            Number.isFinite(r.estimatedValueUsd) && r.estimatedValueUsd > 0
              ? ` (~$${r.estimatedValueUsd.toFixed(r.estimatedValueUsd >= 1 ? 2 : 4)})`
              : '';
          return `${formatAmount(r.amount)} ${r.symbol}${usd}`;
        })
        .join(', ');
      const totalSuffix = totalValueUsd > 0 ? ` — total ~$${totalValueUsd.toFixed(2)}` : '';
      displayText = `Pending rewards: ${breakdown}${totalSuffix}`;
    }

    const data: PendingRewardsResult = {
      rewards: enriched,
      totalValueUsd,
      degraded: false,
      degradationReason: null,
    };
    return { data, displayText };
}

export const pendingRewardsTool = tool({
  description: pendingRewardsDescription,
  inputSchema: pendingRewardsInputSchema,
  needsApproval: buildNeedsApproval('pending_rewards'),
  execute: wrapEngineExecute<PendingRewardsInput, PendingRewardsResult>(
    'pending_rewards',
    {
      call: pendingRewardsCallBody,
    },
  ),
});
