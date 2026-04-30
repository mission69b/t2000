import { describe, it, expect } from 'vitest';
import { renderCanvasTool } from '../tools/canvas.js';

/**
 * [v0.48 — bug 2] Regression suite for canvas address scoping.
 *
 * Pre-v0.48 only `watch_address` honored `params.address`. The other
 * three address-aware templates (activity_heatmap, portfolio_timeline,
 * spending_breakdown) hardcoded `context.walletAddress` — so when the
 * LLM correctly passed `params.address` for "show funkii's activity
 * heatmap", the canvas still rendered the user's own data.
 *
 * Fix: a single `resolveAddressTarget()` helper inside the tool that
 * prefers `params.address`, falls back to `context.walletAddress`, and
 * stamps `isSelfRender` so the frontend can render contextually
 * accurate cell-click targets (the React-side fix for bug 2 lives in
 * audric/.../ActivityHeatmapCanvas.tsx).
 */

const USER_ADDR = `0x${'a'.repeat(64)}`;
const FUNKII_ADDR = `0x${'b'.repeat(64)}`;

const baseCtx = {
  walletAddress: USER_ADDR,
} as Parameters<typeof renderCanvasTool.call>[1];

interface CanvasResult {
  data: {
    __canvas: boolean;
    template: string;
    title: string;
    templateData: { available: boolean; address?: string; isSelfRender?: boolean };
  };
  displayText: string;
}

describe('[v0.48 — bug 2] render_canvas address scope', () => {
  describe.each([
    'activity_heatmap',
    'portfolio_timeline',
    'spending_breakdown',
    'full_portfolio', // [v0.49] extended to multi-panel capstone
  ] as const)(
    'template=%s',
    (template) => {
      it('falls back to context.walletAddress when params.address is omitted', async () => {
        const res = (await renderCanvasTool.call({ template }, baseCtx)) as CanvasResult;
        expect(res.data.templateData.address).toBe(USER_ADDR);
        expect(res.data.templateData.isSelfRender).toBe(true);
      });

      it('honors explicit params.address (the fix)', async () => {
        const res = (await renderCanvasTool.call(
          { template, params: { address: FUNKII_ADDR } },
          baseCtx,
        )) as CanvasResult;
        expect(res.data.templateData.address).toBe(FUNKII_ADDR);
        expect(res.data.templateData.isSelfRender).toBe(false);
      });

      it('appends a truncated-address suffix to the title for non-self renders', async () => {
        const res = (await renderCanvasTool.call(
          { template, params: { address: FUNKII_ADDR } },
          baseCtx,
        )) as CanvasResult;
        expect(res.data.title).toContain(FUNKII_ADDR.slice(0, 6));
        expect(res.data.title).toContain(FUNKII_ADDR.slice(-4));
      });

      it('keeps the title clean (no suffix) for self renders', async () => {
        const res = (await renderCanvasTool.call(
          { template, params: { address: USER_ADDR } },
          baseCtx,
        )) as CanvasResult;
        expect(res.data.title).not.toContain('—');
      });

      it('returns an "address required" stub when no address is available anywhere', async () => {
        const res = (await renderCanvasTool.call(
          { template },
          { walletAddress: undefined } as Parameters<typeof renderCanvasTool.call>[1],
        )) as CanvasResult;
        expect(res.data.templateData.available).toBe(false);
      });

      it('case-insensitive equality decides isSelfRender', async () => {
        const res = (await renderCanvasTool.call(
          { template, params: { address: USER_ADDR.toUpperCase() } },
          baseCtx,
        )) as CanvasResult;
        expect(res.data.templateData.isSelfRender).toBe(true);
      });
    },
  );
});

/**
 * [v0.49] Extended address scope: full_portfolio (above) and
 * health_simulator (below).
 *
 * full_portfolio additionally must NOT seed templateData with the
 * signed-in user's `serverPositions` when rendering for a watched
 * address (those positions belong to the user, not the queried
 * wallet, and would mislead the four sub-panels).
 *
 * health_simulator additionally must seed neutral defaults when
 * targeting a watched address — the simulator is a "what-if" tool, so
 * starting from the user's own collateral/debt would render an
 * irrelevant baseline for an external wallet.
 */

interface FullPortfolioResult {
  data: {
    templateData: {
      available: boolean;
      address?: string;
      isSelfRender?: boolean;
      currentSavings?: number;
      currentDebt?: number;
      healthFactor?: number | null;
      savingsRate?: number;
    };
    title: string;
  };
}

interface HealthSimulatorResult {
  data: {
    templateData: {
      address?: string;
      isSelfRender?: boolean;
      initialCollateral: number;
      initialDebt: number;
      currentHf: number | null;
    };
    title: string;
  };
}

describe('[v0.49] full_portfolio does not bleed user positions into watched-address renders', () => {
  const userPositions = {
    savings: 9999,
    borrows: 1234,
    pendingRewards: 0,
    healthFactor: 1.8,
    maxBorrow: 100,
    supplies: [],
    borrows_detail: [],
    savingsRate: 0.045,
  };
  const ctxWithPos = {
    walletAddress: USER_ADDR,
    serverPositions: userPositions,
  } as Parameters<typeof renderCanvasTool.call>[1];

  it('seeds user positions when rendering for the signed-in user', async () => {
    const res = (await renderCanvasTool.call(
      { template: 'full_portfolio' },
      ctxWithPos,
    )) as FullPortfolioResult;
    expect(res.data.templateData.currentSavings).toBe(9999);
    expect(res.data.templateData.currentDebt).toBe(1234);
    expect(res.data.templateData.healthFactor).toBe(1.8);
    expect(res.data.templateData.isSelfRender).toBe(true);
  });

  it('zeroes out positions when rendering for a watched address (the v0.49 fix)', async () => {
    const res = (await renderCanvasTool.call(
      { template: 'full_portfolio', params: { address: FUNKII_ADDR } },
      ctxWithPos,
    )) as FullPortfolioResult;
    expect(res.data.templateData.currentSavings).toBe(0);
    expect(res.data.templateData.currentDebt).toBe(0);
    expect(res.data.templateData.healthFactor).toBe(null);
    expect(res.data.templateData.isSelfRender).toBe(false);
  });
});

describe('[v0.49] health_simulator seeds neutral defaults for watched addresses', () => {
  const userPositions = {
    savings: 5000,
    borrows: 1000,
    pendingRewards: 0,
    healthFactor: 1.6,
    maxBorrow: 0,
    supplies: [],
    borrows_detail: [],
    savingsRate: 0.045,
  };
  const ctxWithPos = {
    walletAddress: USER_ADDR,
    serverPositions: userPositions,
  } as Parameters<typeof renderCanvasTool.call>[1];

  it('seeds the simulator with the signed-in user\'s position for self renders', async () => {
    const res = (await renderCanvasTool.call(
      { template: 'health_simulator' },
      ctxWithPos,
    )) as HealthSimulatorResult;
    expect(res.data.templateData.initialCollateral).toBe(5000);
    expect(res.data.templateData.initialDebt).toBe(1000);
    expect(res.data.templateData.currentHf).toBe(1.6);
    expect(res.data.templateData.isSelfRender).toBe(true);
  });

  it('seeds neutral defaults when a watched-address override is passed', async () => {
    const res = (await renderCanvasTool.call(
      { template: 'health_simulator', params: { address: FUNKII_ADDR } },
      ctxWithPos,
    )) as HealthSimulatorResult;
    expect(res.data.templateData.address).toBe(FUNKII_ADDR);
    expect(res.data.templateData.isSelfRender).toBe(false);
    // Neutral defaults — NOT the user's $5000/$1000/1.6
    expect(res.data.templateData.initialCollateral).toBe(1500);
    expect(res.data.templateData.initialDebt).toBe(500);
    expect(res.data.templateData.currentHf).toBe(null);
  });

  it('appends a truncated-address suffix to the simulator title for non-self renders', async () => {
    const res = (await renderCanvasTool.call(
      { template: 'health_simulator', params: { address: FUNKII_ADDR } },
      ctxWithPos,
    )) as HealthSimulatorResult;
    expect(res.data.title).toContain(FUNKII_ADDR.slice(0, 6));
    expect(res.data.title).toContain(FUNKII_ADDR.slice(-4));
  });
});

/**
 * [v1.2.1 — bug fix] Non-address-aware templates must NOT trigger
 * address normalization, even when the LLM accidentally passes a
 * `params.address`. Pre-fix, `yield_projector` and `dca_planner` would
 * crash with `InvalidAddressError` if the LLM passed a malformed
 * address to them — even though those templates ignore the address
 * entirely.
 *
 * The canvas tool now scopes the normalization to the six
 * address-aware templates only.
 */
describe('[v1.2.1 — bug fix] non-address-aware templates ignore params.address', () => {
  it('yield_projector does NOT throw on malformed params.address', async () => {
    const res = (await renderCanvasTool.call(
      { template: 'yield_projector', params: { address: 'not-an-address-at-all' } },
      baseCtx,
    )) as CanvasResult;
    expect(res.data.template).toBe('yield_projector');
    expect(res.data.templateData.available).toBe(true);
  });

  it('dca_planner does NOT throw on a SuiNS name (no RPC round-trip)', async () => {
    // Even if the SuiNS RPC would succeed, dca_planner doesn't use
    // the address — it should never be called.
    const res = (await renderCanvasTool.call(
      { template: 'dca_planner', params: { address: 'some.sui' } },
      baseCtx,
    )) as CanvasResult;
    expect(res.data.template).toBe('dca_planner');
    expect(res.data.templateData.available).toBe(true);
  });
});
