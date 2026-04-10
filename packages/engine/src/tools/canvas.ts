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
// Templates that need Phase 3 analytics APIs — return available: false for now
// ---------------------------------------------------------------------------

const PHASE_3_TEMPLATES = new Set<CanvasTemplate>([
  'activity_heatmap',
  'portfolio_timeline',
  'spending_breakdown',
  'full_portfolio',
]);

// ---------------------------------------------------------------------------
// render_canvas tool
// ---------------------------------------------------------------------------

export const renderCanvasTool = buildTool({
  name: 'render_canvas',
  description: `Renders an interactive financial canvas inline in the chat.

Use when the user asks for a visual chart, simulator, or financial overview. Pick the most relevant template:

- activity_heatmap — on-chain transaction history as a GitHub-style heatmap (coming soon — needs Phase 3 data)
- portfolio_timeline — net worth over time, wallet/savings/debt breakdown (coming soon — needs Phase 3 data)
- yield_projector — compound yield simulator with amount/APY/period sliders (WORKS NOW — client-side)
- health_simulator — borrow health factor simulator with collateral/debt sliders (WORKS NOW — uses current position)
- dca_planner — savings plan curve for regular monthly deposits (WORKS NOW — client-side)
- spending_breakdown — spending by service category (coming soon — needs Phase 3 data)
- watch_address — portfolio overview for any public Sui address (coming soon — CA-6)
- full_portfolio — 4-panel overview: heatmap, timeline, yield, HF (coming soon — CA-7)

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

    // Phase 3 templates — analytics APIs not yet built
    if (PHASE_3_TEMPLATES.has(template)) {
      return {
        data: {
          __canvas: true,
          template,
          title,
          templateData: { available: false, message: 'This canvas will be available in Phase 3 when analytics APIs are ready.' },
        },
        displayText: `Canvas template "${title}" is coming soon.`,
      };
    }

    // watch_address — CA-6 (not yet built)
    if (template === 'watch_address') {
      return {
        data: {
          __canvas: true,
          template,
          title,
          templateData: { available: false, address: params?.address ?? null, message: 'Watch Address canvas is coming soon.' },
        },
        displayText: `Canvas template "${title}" is coming soon.`,
      };
    }

    // Strategy simulators — client-side, seed with live position data
    const positions = context.serverPositions;
    // savingsRate is stored as a decimal (0.051 = 5.1%), convert to percentage for display
    const rawRate = positions?.savingsRate ?? 0;
    const savingsRate = rawRate > 0 && rawRate < 1 ? rawRate * 100 : rawRate > 0 ? rawRate : 4.5;
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
      return {
        data: {
          __canvas: true,
          template,
          title,
          templateData: {
            available: true,
            initialCollateral: totalSavings > 0 ? Math.round(totalSavings) : 1500,
            initialDebt: totalBorrows > 0 ? Math.round(totalBorrows) : 500,
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
