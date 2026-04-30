import { z } from 'zod';
import { fetchHealthFactor } from '../navi-reads.js';
import { buildTool } from '../tool.js';
import { hasNaviMcpGlobal, getMcpManager, requireAgent } from './utils.js';
import { normalizeAddressInput } from '../sui-address.js';

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

function displayHfText(
  hf: number | null,
  borrowed: number,
  status: string,
  isSelfQuery: boolean = true,
  address?: string,
  suinsName?: string | null,
): string {
  const subjectLabel = suinsName ?? (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null);
  const subject = isSelfQuery || !subjectLabel
    ? 'Health Factor'
    : `Health Factor for ${subjectLabel}`;
  if (hf == null) {
    return `${subject}: ∞ (${status} — no debt)`;
  }
  return `${subject}: ${hf.toFixed(2)} (${status})`;
}

export const healthCheckTool = buildTool({
  name: 'health_check',
  description:
    'Check the lending health factor for the signed-in user OR any public Sui address or SuiNS name: current HF ratio, total supplied collateral, total borrowed, max additional borrow capacity, and liquidation threshold. HF < 1.5 is risky, < 1.2 is critical. When the address has no debt the tool returns healthFactor=null (semantically infinity) — render that as "Healthy" / ∞, never as 0 or "Critical". Pass `address` as a 0x address OR a SuiNS name (e.g. "alex.sui") to inspect a contact / watched / public wallet; defaults to the signed-in user when omitted.',
  inputSchema: z.object({
    address: z
      .string()
      .optional()
      .describe('Sui address (0x…) or SuiNS name (alex.sui). Defaults to the signed-in wallet when omitted.'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description: 'Sui address (0x…) or SuiNS name (e.g. alex.sui). The engine resolves the name to an on-chain address before querying. Omit to default to the signed-in wallet.',
      },
    },
    required: [],
  },
  isReadOnly: true,
  // [v1.5.1] Health factor changes on every borrow / repay / collateral
  // movement and even passively as oracle prices update. Never dedupe.
  cacheable: false,

  async call(input, context) {
    /**
     * [v0.49] Address-scope: tool now accepts an optional `address` param
     * so the LLM can inspect any public Sui wallet's NAVI lending
     * position. Pre-v0.49 the tool only ever queried
     * `context.walletAddress`, which silently returned the signed-in
     * user's HF for "How is funkii's account health?" type questions.
     * Falls back to `context.walletAddress` when the param is absent.
     * Stamps `address` + `isSelfQuery` on the result.
     */
    // [v1.2 SuiNS] Normalize the user-supplied address (0x or *.sui).
    let suinsName: string | null = null;
    let targetAddress: string | undefined;
    if (input.address) {
      const normalized = await normalizeAddressInput(input.address, {
        suiRpcUrl: context.suiRpcUrl,
        signal: context.signal,
      });
      targetAddress = normalized.address;
      suinsName = normalized.suinsName;
    } else {
      targetAddress = context.walletAddress;
    }
    const isSelfQuery =
      !!context.walletAddress &&
      !!targetAddress &&
      targetAddress.toLowerCase() === context.walletAddress.toLowerCase();

    if (context.positionFetcher && targetAddress) {
      const sp = await context.positionFetcher(targetAddress);
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
          address: targetAddress,
          isSelfQuery,
          suinsName,
        },
        displayText: displayHfText(transportHf, borrowed, status, isSelfQuery, targetAddress, suinsName),
      };
    }

    if (hasNaviMcpGlobal(context) && targetAddress) {
      const hf = await fetchHealthFactor(getMcpManager(context), targetAddress);
      const borrowed = hf.borrowed;
      const status = hfStatus(hf.healthFactor, borrowed);
      const transportHf = serializeHf(hf.healthFactor, borrowed);
      return {
        data: { ...hf, healthFactor: transportHf, status, address: targetAddress, isSelfQuery, suinsName },
        displayText: displayHfText(transportHf, borrowed, status, isSelfQuery, targetAddress, suinsName),
      };
    }

    // SDK agent fallback — only meaningful for the signed-in user (the
    // SDK's `healthFactor()` method is bound to the agent's own wallet).
    if (
      targetAddress &&
      context.walletAddress &&
      targetAddress.toLowerCase() !== context.walletAddress.toLowerCase()
    ) {
      throw new Error(
        `Cannot inspect ${targetAddress.slice(0, 8)}… without NAVI MCP or a positionFetcher. Configure NAVI MCP to enable third-party address reads.`,
      );
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
        address: targetAddress ?? '',
        isSelfQuery: true,
        suinsName,
      },
      displayText: displayHfText(transportHf, borrowed, status, true, undefined, suinsName),
    };
  },
});
