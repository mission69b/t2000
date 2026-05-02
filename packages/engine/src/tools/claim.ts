import { z } from 'zod';
import { buildTool } from '../tool.js';
import { requireAgent } from './utils.js';

/**
 * Format an amount with adaptive precision so a 0.0165 vSUI claim
 * doesn't get stringified as "0.02" and the LLM can narrate the
 * actual on-chain credit accurately.
 */
function formatAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '0';
  if (amount >= 1) return amount.toFixed(4).replace(/\.?0+$/, '');
  if (amount >= 0.0001) return amount.toFixed(6).replace(/\.?0+$/, '');
  return amount.toExponential(2);
}

export const claimRewardsTool = buildTool({
  name: 'claim_rewards',
  description:
    'Claim all pending protocol rewards across lending adapters. Returns the claimed reward breakdown (per-asset symbol + amount), total USD value (best effort — may be 0 when oracle prices are unavailable), and the on-chain tx hash. When the rewards list is empty the response will explicitly say "no pending rewards"; when it is non-empty narrate the per-symbol amounts even if totalValueUsd is 0 (the on-chain credit still happened). ' +
    'Payment Stream: bundleable — when paired with another bundleable write in the same request (e.g. "claim rewards and stake them"), emit all calls in the same assistant turn so the engine collapses them into one atomic PTB the user signs once.',
  inputSchema: z.object({}),
  jsonSchema: { type: 'object', properties: {}, required: [] },
  isReadOnly: false,
  permissionLevel: 'confirm',
  flags: { mutating: true },

  async call(_input, context) {
    const agent = requireAgent(context);
    const result = await agent.claimRewards();

    // The SDK adapter doesn't have access to a price oracle, so
    // `estimatedValueUsd` is always 0 from upstream. The engine, however,
    // has a `priceCache` populated by the harness (symbol → USD), so we
    // enrich here. This means the card / LLM can report "$0.04 vSUI"
    // instead of "$0.00" whenever a price is known, while still gracefully
    // degrading to per-symbol amounts when it isn't.
    const priceCache = context.priceCache;
    const enrichedRewards = result.rewards.map((r) => {
      if (r.estimatedValueUsd > 0) return r;
      const price = priceCache?.get(r.symbol.toUpperCase());
      if (!price || !Number.isFinite(price) || price <= 0) return r;
      return { ...r, estimatedValueUsd: r.amount * price };
    });

    const totalValueUsd = enrichedRewards.reduce(
      (s, r) => s + (Number.isFinite(r.estimatedValueUsd) ? r.estimatedValueUsd : 0),
      0,
    );

    const txShort = result.tx ? `${result.tx.slice(0, 8)}…` : '';
    let displayText: string;

    if (enrichedRewards.length === 0) {
      displayText = 'No pending rewards to claim.';
    } else {
      // Always include per-symbol amounts so the narration is grounded
      // in the actual on-chain credit even when USD pricing is missing.
      const breakdown = enrichedRewards
        .map((r) => `${formatAmount(r.amount)} ${r.symbol}`)
        .join(', ');
      const usdSuffix = totalValueUsd > 0 ? ` (~$${totalValueUsd.toFixed(2)})` : '';
      const txSuffix = txShort ? ` (tx: ${txShort})` : '';
      displayText = `Claimed ${breakdown}${usdSuffix}${txSuffix}`;
    }

    return {
      data: {
        success: result.success,
        tx: result.tx || null,
        rewards: enrichedRewards,
        totalValueUsd,
        gasCost: result.gasCost,
      },
      displayText,
    };
  },
});
