import { z } from 'zod';
import { buildTool } from '../tool.js';
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

- activity_heatmap — on-chain transaction history as a GitHub-style heatmap (WORKS NOW — loads from wallet)
- portfolio_timeline — net worth over time, wallet/savings/debt breakdown (WORKS NOW — daily snapshots)
- yield_projector — compound yield simulator with amount/APY/period sliders (WORKS NOW — client-side)
- health_simulator — borrow health factor simulator with collateral/debt sliders (WORKS NOW — uses current position)
- dca_planner — savings plan curve for regular monthly deposits (WORKS NOW — client-side)
- spending_breakdown — spending by service category (WORKS NOW — from AppEvent + ServicePurchase)
- watch_address — portfolio overview for any public Sui address (WORKS NOW — pass address in params)
- full_portfolio — 4-panel overview: savings, health, activity, spending (WORKS NOW — aggregates all data)

Always prefer the canvas for visualisation requests. After rendering, offer to explain what the user sees.`,
  inputSchema: z.object({
    template: z.enum(CANVAS_TEMPLATES).describe('Which canvas template to render'),
    params: z
      .object({
        period: z.enum(['1m', '3m', '6m', '1y']).optional().describe('Time period for time-based templates'),
        address: z.string().optional().describe('Sui address for watch_address template'),
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

    // Full portfolio — 4-panel capstone with live position data
    if (template === 'full_portfolio') {
      const pos = context.serverPositions;
      const rate = normalizeSavingsRate(pos?.savingsRate);
      const savings = pos?.savings ?? 0;
      const borrows = pos?.borrows ?? 0;
      return {
        data: {
          __canvas: true,
          template,
          title,
          templateData: {
            available: true,
            address: context.walletAddress ?? '',
            currentSavings: savings,
            currentDebt: borrows,
            healthFactor: pos?.healthFactor ?? null,
            savingsRate: rate,
          },
        },
        displayText: `Opened Full Portfolio Overview.`,
      };
    }

    // Watch address — show balances for any public Sui address
    if (template === 'watch_address') {
      const targetAddress = params?.address ?? '';
      if (!targetAddress || !targetAddress.startsWith('0x')) {
        return {
          data: {
            __canvas: true,
            template,
            title,
            templateData: { available: false, message: 'Please provide a valid Sui address to watch.' },
          },
          displayText: 'No valid address provided. Ask the user for a Sui address.',
        };
      }
      return {
        data: {
          __canvas: true,
          template,
          title: `Watch ${targetAddress.slice(0, 6)}…${targetAddress.slice(-4)}`,
          templateData: { available: true, address: targetAddress },
        },
        displayText: `Opened Watch Address canvas for ${targetAddress.slice(0, 6)}…${targetAddress.slice(-4)}.`,
      };
    }

    // Portfolio timeline — fetches from /api/analytics/portfolio-history
    if (template === 'portfolio_timeline') {
      return {
        data: {
          __canvas: true,
          template,
          title,
          templateData: {
            available: true,
            address: context.walletAddress ?? '',
          },
        },
        displayText: `Opened Portfolio Timeline. Shows your net worth, savings, and debt over time.`,
      };
    }

    // Spending breakdown — fetches from /api/analytics/spending
    if (template === 'spending_breakdown') {
      return {
        data: {
          __canvas: true,
          template,
          title,
          templateData: {
            available: true,
            address: context.walletAddress ?? '',
          },
        },
        displayText: `Opened Spending Breakdown. Shows your service spending by category.`,
      };
    }

    // Activity heatmap — client-side fetches from /api/analytics/activity-heatmap
    if (template === 'activity_heatmap') {
      return {
        data: {
          __canvas: true,
          template,
          title,
          templateData: {
            available: true,
            address: context.walletAddress ?? '',
          },
        },
        displayText: `Opened Activity Heatmap for your wallet. Click any day to explore transactions.`,
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
      const roundedDebt = totalBorrows >= 1 ? Math.round(totalBorrows) : (totalBorrows > 0 ? parseFloat(totalBorrows.toFixed(4)) : 0);
      return {
        data: {
          __canvas: true,
          template,
          title,
          templateData: {
            available: true,
            initialCollateral: totalSavings > 0 ? Math.round(totalSavings) : 1500,
            initialDebt: roundedDebt > 0 ? roundedDebt : (totalSavings > 0 ? 0 : 500),
            currentHf: healthFactor,
          },
        },
        displayText: `Opened Health Factor Simulator. Current HF: ${healthFactor !== null ? healthFactor.toFixed(2) : 'no active position'}.`,
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
