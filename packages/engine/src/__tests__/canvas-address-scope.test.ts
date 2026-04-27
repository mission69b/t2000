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
  describe.each(['activity_heatmap', 'portfolio_timeline', 'spending_breakdown'] as const)(
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
