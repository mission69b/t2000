import { z } from 'zod';
import { fetchHealthFactor } from '../navi-reads.js';
import { buildTool } from '../tool.js';
import { hasNaviMcp, getMcpManager, getWalletAddress, requireAgent } from './utils.js';

/**
 * Anything below this threshold is treated as "no real debt" — NAVI can
 * accrue dust between blocks (sub-cent) even after a full repay, and we
 * don't want a $0.000018 phantom borrow flipping the user from "Healthy"
 * to "Warning" or worse.
 */
const DEBT_DUST_USD = 0.01;

function hfStatus(hf: number, borrowed: number): string {
  // Zero (or dust-only) debt accounts are maximally safe — math says HF=∞,
  // but the SDK sometimes returns 0 as a sentinel for that case. Treating
  // it as "critical" is a pure UI bug (the user has no liquidation risk).
  if (borrowed <= DEBT_DUST_USD) return 'healthy';
  if (hf >= 2.0) return 'healthy';
  if (hf >= 1.5) return 'moderate';
  if (hf >= 1.2) return 'warning';
  return 'critical';
}

/**
 * Normalise a health factor for transport. JSON.stringify(Infinity) ===
 * "null", and the LLM / UI both end up coercing that null to 0, which
 * then renders as the misleading "Critical 0.00" status. We therefore
 * collapse any non-finite (or no-debt) value to `null` deliberately so
 * that consumers can branch on `borrowed <= dust || healthFactor == null`
 * to render "∞" / "Healthy" rather than a misleading numeric value.
 */
function serializeHf(hf: number | null | undefined, borrowed: number): number | null {
  if (borrowed <= DEBT_DUST_USD) return null;
  if (hf == null || !Number.isFinite(hf)) return null;
  return hf;
}

function displayHfText(hf: number | null, borrowed: number, status: string): string {
  if (hf == null) {
    return `Health Factor: ∞ (${status} — no debt)`;
  }
  return `Health Factor: ${hf.toFixed(2)} (${status})`;
}

export const healthCheckTool = buildTool({
  name: 'health_check',
  description:
    'Check the lending health factor: current HF ratio, total supplied collateral, total borrowed, max additional borrow capacity, and liquidation threshold. HF < 1.5 is risky, < 1.2 is critical. When the user has no debt the tool returns healthFactor=null (semantically infinity) — render that as "Healthy" / ∞, never as 0 or "Critical".',
  inputSchema: z.object({}),
  jsonSchema: { type: 'object', properties: {}, required: [] },
  isReadOnly: true,
  // [v1.5.1] Health factor changes on every borrow / repay / collateral
  // movement and even passively as oracle prices update. Never dedupe.
  cacheable: false,

  async call(_input, context) {
    if (context.positionFetcher && context.walletAddress) {
      const sp = await context.positionFetcher(context.walletAddress);
      const borrowed = sp.borrows;
      const rawHf = sp.healthFactor ?? (borrowed > 0 ? 0 : Infinity);
      const status = hfStatus(rawHf, borrowed);
      const transportHf = serializeHf(rawHf, borrowed);
      return {
        data: {
          healthFactor: transportHf,
          supplied: sp.savings,
          borrowed,
          maxBorrow: sp.maxBorrow,
          liquidationThreshold: 0,
          status,
        },
        displayText: displayHfText(transportHf, borrowed, status),
      };
    }

    if (hasNaviMcp(context)) {
      const hf = await fetchHealthFactor(
        getMcpManager(context),
        getWalletAddress(context),
      );
      const borrowed = hf.borrowed;
      const status = hfStatus(hf.healthFactor, borrowed);
      const transportHf = serializeHf(hf.healthFactor, borrowed);
      return {
        data: { ...hf, healthFactor: transportHf, status },
        displayText: displayHfText(transportHf, borrowed, status),
      };
    }

    const agent = requireAgent(context);
    const hf = await agent.healthFactor();
    const borrowed = hf.borrowed;
    const status = hfStatus(hf.healthFactor, borrowed);
    const transportHf = serializeHf(hf.healthFactor, borrowed);

    return {
      data: {
        healthFactor: transportHf,
        supplied: hf.supplied,
        borrowed,
        maxBorrow: hf.maxBorrow,
        liquidationThreshold: hf.liquidationThreshold,
        status,
      },
      displayText: displayHfText(transportHf, borrowed, status),
    };
  },
});
