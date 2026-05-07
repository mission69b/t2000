import { z } from 'zod';
import { buildTool } from '../tool.js';
import { normalizeAddressInput } from '../sui/address.js';
import type { ToolResult } from '../types.js';

// ---------------------------------------------------------------------------
// Template catalogue
// ---------------------------------------------------------------------------

export const CANVAS_TEMPLATES = [
  'activity_heatmap',
  'portfolio_timeline',
  'yield_projector',
  'health_simulator',
  'dca_planner',
  'spending_breakdown',
  'watch_address',
  'full_portfolio',
] as const;

export type CanvasTemplate = (typeof CANVAS_TEMPLATES)[number];

/** Normalize savings rate: if < 1 treat as decimal → multiply by 100, else use as-is. Default 4.5%. */
function normalizeSavingsRate(raw: number | undefined | null, fallback = 4.5): number {
  const r = raw ?? 0;
  if (r > 0 && r < 1) return r * 100;
  if (r > 0) return r;
  return fallback;
}

const CANVAS_TITLES: Record<CanvasTemplate, string> = {
  activity_heatmap: 'On-Chain Activity',
  portfolio_timeline: 'Net Worth Over Time',
  yield_projector: 'Yield Projector',
  health_simulator: 'Health Factor Simulator',
  dca_planner: 'Savings Plan',
  spending_breakdown: 'Spending Breakdown',
  watch_address: 'Watch Address',
  full_portfolio: 'Full Portfolio Overview',
};

// ---------------------------------------------------------------------------
// render_canvas tool
// ---------------------------------------------------------------------------

export const renderCanvasTool = buildTool({
  name: 'render_canvas',
  description: `Renders an interactive financial canvas inline in the chat.

Use when the user asks for a visual chart, simulator, or financial overview. Pick the most relevant template:

- activity_heatmap — on-chain transaction history as a GitHub-style heatmap (WORKS NOW — accepts \`params.address\` to inspect any public Sui wallet; defaults to the signed-in user)
- portfolio_timeline — net worth over time, wallet/savings/debt breakdown (WORKS NOW — accepts \`params.address\` for any public wallet; defaults to the signed-in user)
- yield_projector — compound yield simulator with amount/APY/period sliders (WORKS NOW — client-side, no address needed)
- health_simulator — borrow health factor simulator with collateral/debt sliders (WORKS NOW — accepts \`params.address\` for any public wallet; defaults to the signed-in user's current position)
- dca_planner — savings plan curve for regular monthly deposits (WORKS NOW — client-side, no address needed)
- spending_breakdown — spending by service category (WORKS NOW — accepts \`params.address\` for any public wallet; defaults to the signed-in user)
- watch_address — portfolio overview for any public Sui address (WORKS NOW — pass \`params.address\`)
- full_portfolio — 4-panel overview: savings, health, activity, spending (WORKS NOW — accepts \`params.address\` for any public wallet; defaults to the signed-in user)

When the user asks to inspect a saved contact or watched address — e.g. "show funkii's activity heatmap", "what's funkii's portfolio look like", "spending breakdown for 0x40cd…", "give me a full portfolio overview of 0x40cd…" — pass that wallet's address as \`params.address\`. Six of the eight templates (activity_heatmap, portfolio_timeline, spending_breakdown, watch_address, health_simulator, full_portfolio) will scope their data fetch to that address; only the pure client-side simulators (yield_projector, dca_planner) ignore params.address.

Always prefer the canvas for visualisation requests. After rendering, offer to explain what the user sees.`,
  inputSchema: z.object({
    template: z.enum(CANVAS_TEMPLATES).describe('Which canvas template to render'),
    params: z
      .object({
        period: z.enum(['1m', '3m', '6m', '1y']).optional().describe('Time period for time-based templates'),
        address: z
          .string()
          .optional()
          .describe(
            'Sui address for the six address-aware templates (activity_heatmap, portfolio_timeline, spending_breakdown, watch_address, health_simulator, full_portfolio). Defaults to the signed-in user; pass an explicit address to inspect a contact, watched wallet, or any other public address.',
          ),
      })
      .optional(),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      template: {
        type: 'string',
        enum: CANVAS_TEMPLATES,
        description: 'Which canvas template to render',
      },
      params: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['1m', '3m', '6m', '1y'] },
          address: { type: 'string' },
        },
      },
    },
    required: ['template'],
  },
  isReadOnly: true,

  async call(input, context): Promise<ToolResult<unknown>> {
    const { template, params } = input;
    const title = CANVAS_TITLES[template];

    /**
     * [v1.2 SuiNS] Pre-resolve `params.address` once at the top of
     * `call()` (instead of inside the per-template branches) so that
     * SuiNS names like \`alex.sui\` work for every address-aware
     * template without each branch having to thread normalization
     * through. Templates already index the resolved 0x for any
     * downstream API call; the original SuiNS name is preserved in
     * `suinsName` so the canvas can title itself with the human-readable
     * name (e.g. "Activity for alex.sui").
     *
     * SCOPE. Only normalize for the six address-aware templates. The
     * pure simulators (`yield_projector`, `dca_planner`) ignore
     * `params.address` entirely — running the normalizer for them would
     * regress to "transient SuiNS RPC failure crashes a yield-projector
     * canvas the user didn't even ask to be address-scoped".
     */
    const ADDRESS_AWARE_TEMPLATES = new Set<CanvasTemplate>([
      'full_portfolio',
      'watch_address',
      'portfolio_timeline',
      'spending_breakdown',
      'activity_heatmap',
      'health_simulator',
    ]);
    let suinsName: string | null = null;
    let resolvedParamAddress: string | null = null;
    if (params?.address && ADDRESS_AWARE_TEMPLATES.has(template)) {
      const normalized = await normalizeAddressInput(params.address, {
        suiRpcUrl: context.suiRpcUrl,
        signal: context.signal,
      });
      resolvedParamAddress = normalized.address;
      suinsName = normalized.suinsName;
    }

    /**
     * [v0.48] Address resolution for the four address-aware templates
     * (activity_heatmap, portfolio_timeline, spending_breakdown,
     * watch_address). Pre-v0.48 only `watch_address` consulted
     * `params.address`; the other three hardcoded `context.walletAddress`
     * which silently masked the watched-address case (the LLM passed
     * the right param, the canvas rendered the user's own data).
     *
     * Falls back to `context.walletAddress` when `params.address` is
     * absent. Returns `null` when neither is present so callers can
     * surface a "needs an address" error state.
     *
     * `isSelfRender` lets the result advertise whether the canvas
     * targets the signed-in user — the frontend ActivityHeatmapCanvas
     * uses it so cell clicks produce contextually correct chat prompts
     * ("Show transactions for 0x40cd…" vs "Show my transactions
     * from…"). Without this flag, a heatmap cell click on a watched
     * address routes back into the user's own transaction history.
     */
    const resolveAddressTarget = (): { address: string | null; isSelfRender: boolean; suinsName: string | null } => {
      const fromParams = resolvedParamAddress;
      const fromContext = context.walletAddress;
      const target = fromParams ?? fromContext ?? null;
      const isSelfRender = !!target && !!fromContext && target.toLowerCase() === fromContext.toLowerCase();
      return { address: target, isSelfRender, suinsName };
    };

    /**
     * [v1.2 SuiNS] Prefer the human-readable SuiNS name in titles +
     * narration when present; fall back to the truncated 0x address.
     * Used by every address-aware template's titleSuffix + displayText.
     */
    const formatAddrLabel = (address: string, suins: string | null): string =>
      suins ?? `${address.slice(0, 6)}…${address.slice(-4)}`;

    // Full portfolio — 4-panel capstone with live position data
    if (template === 'full_portfolio') {
      /**
       * [v0.49] When `params.address` is present and points to a wallet
       * other than the signed-in user, do NOT seed templateData with
       * `context.serverPositions` (those are the user's own positions
       * and would be misleading for a watched-address overview). The
       * frontend re-fetches per-panel data via the address-aware API
       * routes (`/api/balances`, `/api/savings`, etc.), so we just hand
       * it the address + isSelfRender flag.
       */
      const { address, isSelfRender, suinsName: resolvedSuins } = resolveAddressTarget();
      if (!address) {
        return {
          data: {
            __canvas: true,
            template,
            title,
            templateData: { available: false, message: 'Full Portfolio needs an address.' },
          },
          displayText: 'Full Portfolio requires an address.',
        };
      }
      const addrLabel = formatAddrLabel(address, resolvedSuins);
      const titleSuffix = isSelfRender ? '' : ` — ${addrLabel}`;
      const pos = isSelfRender ? context.serverPositions : null;
      const rate = normalizeSavingsRate(pos?.savingsRate);
      const savings = pos?.savings ?? 0;
      const borrows = pos?.borrows ?? 0;
      return {
        data: {
          __canvas: true,
          template,
          title: `${title}${titleSuffix}`,
          templateData: {
            available: true,
            address,
            isSelfRender,
            suinsName: resolvedSuins,
            currentSavings: savings,
            currentDebt: borrows,
            healthFactor: pos?.healthFactor ?? null,
            savingsRate: rate,
          },
        },
        displayText: isSelfRender
          ? `Opened Full Portfolio Overview.`
          : `Opened Full Portfolio Overview for ${addrLabel}.`,
      };
    }

    // Watch address — show balances for any public Sui address (or SuiNS name).
    if (template === 'watch_address') {
      // [v1.2 SuiNS] resolvedParamAddress comes from the top-of-call
      // normalization, so a SuiNS name like "alex.sui" resolves here.
      const targetAddress = resolvedParamAddress ?? '';
      if (!targetAddress) {
        return {
          data: {
            __canvas: true,
            template,
            title,
            templateData: { available: false, message: 'Please provide a valid Sui address or SuiNS name to watch.' },
          },
          displayText: 'No valid address provided. Ask the user for a Sui address or SuiNS name.',
        };
      }
      const addrLabel = formatAddrLabel(targetAddress, suinsName);
      return {
        data: {
          __canvas: true,
          template,
          title: `Watch ${addrLabel}`,
          templateData: { available: true, address: targetAddress, suinsName },
        },
        displayText: `Opened Watch Address canvas for ${addrLabel}.`,
      };
    }

    // Portfolio timeline — fetches from /api/analytics/portfolio-history
    if (template === 'portfolio_timeline') {
      const { address, isSelfRender, suinsName: resolvedSuins } = resolveAddressTarget();
      if (!address) {
        return {
          data: {
            __canvas: true,
            template,
            title,
            templateData: { available: false, message: 'Portfolio Timeline needs an address.' },
          },
          displayText: 'Portfolio Timeline requires an address.',
        };
      }
      const addrLabel = formatAddrLabel(address, resolvedSuins);
      const titleSuffix = isSelfRender ? '' : ` — ${addrLabel}`;
      return {
        data: {
          __canvas: true,
          template,
          title: `${title}${titleSuffix}`,
          templateData: {
            available: true,
            address,
            isSelfRender,
            suinsName: resolvedSuins,
          },
        },
        displayText: isSelfRender
          ? `Opened Portfolio Timeline. Shows your net worth, savings, and debt over time.`
          : `Opened Portfolio Timeline for ${addrLabel}.`,
      };
    }

    // Spending breakdown — fetches from /api/analytics/spending
    if (template === 'spending_breakdown') {
      const { address, isSelfRender, suinsName: resolvedSuins } = resolveAddressTarget();
      if (!address) {
        return {
          data: {
            __canvas: true,
            template,
            title,
            templateData: { available: false, message: 'Spending Breakdown needs an address.' },
          },
          displayText: 'Spending Breakdown requires an address.',
        };
      }
      const addrLabel = formatAddrLabel(address, resolvedSuins);
      const titleSuffix = isSelfRender ? '' : ` — ${addrLabel}`;
      return {
        data: {
          __canvas: true,
          template,
          title: `${title}${titleSuffix}`,
          templateData: {
            available: true,
            address,
            isSelfRender,
            suinsName: resolvedSuins,
          },
        },
        displayText: isSelfRender
          ? `Opened Spending Breakdown. Shows your service spending by category.`
          : `Opened Spending Breakdown for ${addrLabel}.`,
      };
    }

    // Activity heatmap — client-side fetches from /api/analytics/activity-heatmap
    if (template === 'activity_heatmap') {
      const { address, isSelfRender, suinsName: resolvedSuins } = resolveAddressTarget();
      if (!address) {
        return {
          data: {
            __canvas: true,
            template,
            title,
            templateData: { available: false, message: 'Activity Heatmap needs an address.' },
          },
          displayText: 'Activity Heatmap requires an address.',
        };
      }
      const addrLabel = formatAddrLabel(address, resolvedSuins);
      const titleSuffix = isSelfRender ? '' : ` — ${addrLabel}`;
      return {
        data: {
          __canvas: true,
          template,
          title: `${title}${titleSuffix}`,
          templateData: {
            available: true,
            address,
            isSelfRender,
            suinsName: resolvedSuins,
          },
        },
        displayText: isSelfRender
          ? `Opened Activity Heatmap for your wallet. Click any day to explore transactions.`
          : `Opened Activity Heatmap for ${addrLabel}. Click any day to explore that address's transactions.`,
      };
    }

    // Strategy simulators — client-side, seed with live position data
    const positions = context.serverPositions;
    const savingsRate = normalizeSavingsRate(positions?.savingsRate);
    const healthFactor = positions?.healthFactor ?? null;
    const totalSavings = positions?.savings ?? 0;
    const totalBorrows = positions?.borrows ?? 0;

    if (template === 'yield_projector') {
      return {
        data: {
          __canvas: true,
          template,
          title,
          templateData: {
            available: true,
            initialAmount: totalSavings > 0 ? Math.round(totalSavings) : 1000,
            initialApy: savingsRate,
          },
        },
        displayText: `Opened Yield Projector. Current USDC deposit rate: ${savingsRate.toFixed(2)}% APY.`,
      };
    }

    if (template === 'health_simulator') {
      /**
       * [v0.49] When the user passes `params.address` for a watched
       * wallet, seed the simulator with neutral defaults instead of the
       * signed-in user's own position. The frontend re-fetches per
       * `address` via `/api/health` to populate the live HF readout,
       * so seeding here is just for the slider initial state.
       */
      const { address: targetAddress, isSelfRender, suinsName: resolvedSuins } = resolveAddressTarget();
      const seedFromPos = isSelfRender;
      const seedSavings = seedFromPos ? totalSavings : 0;
      const seedBorrows = seedFromPos ? totalBorrows : 0;
      const seedHf = seedFromPos ? healthFactor : null;
      const roundedDebt = seedBorrows >= 1
        ? Math.round(seedBorrows)
        : (seedBorrows > 0 ? parseFloat(seedBorrows.toFixed(4)) : 0);
      const titleSuffix = !targetAddress || isSelfRender
        ? ''
        : ` — ${formatAddrLabel(targetAddress, resolvedSuins)}`;
      return {
        data: {
          __canvas: true,
          template,
          title: `${title}${titleSuffix}`,
          templateData: {
            available: true,
            address: targetAddress ?? '',
            isSelfRender,
            suinsName: resolvedSuins,
            initialCollateral: seedSavings > 0 ? Math.round(seedSavings) : 1500,
            initialDebt: roundedDebt > 0 ? roundedDebt : (seedSavings > 0 ? 0 : 500),
            currentHf: seedHf,
          },
        },
        displayText: isSelfRender
          ? `Opened Health Factor Simulator. Current HF: ${healthFactor !== null ? healthFactor.toFixed(2) : 'no active position'}.`
          : `Opened Health Factor Simulator${titleSuffix}. The simulator will fetch the current health factor for that wallet.`,
      };
    }

    if (template === 'dca_planner') {
      return {
        data: {
          __canvas: true,
          template,
          title,
          templateData: {
            available: true,
            initialMonthly: 200,
            initialApy: savingsRate,
          },
        },
        displayText: `Opened Savings Plan. Current USDC deposit rate: ${savingsRate.toFixed(2)}% APY.`,
      };
    }

    // Fallback — should not reach here given exhaustive template enum
    return {
      data: {
        __canvas: true,
        template,
        title,
        templateData: { available: false, message: 'Unknown template.' },
      },
      displayText: `Canvas template "${template}" is not yet available.`,
    };
  },
});
