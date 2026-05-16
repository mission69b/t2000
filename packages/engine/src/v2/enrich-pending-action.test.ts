// ---------------------------------------------------------------------------
// v2/enrich-pending-action.test.ts — regression tests for Week 4 cleanup
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Week 4 cleanup — Day 14a (2026-05-16).
//
// Pins the contract for `enrichPendingActionWithLiveData`:
//   - borrow / repay_debt → populates borrowApyBps + currentHF
//   - withdraw / save_deposit → populates currentHF only
//   - send_transfer / swap_execute / pay_api → returns {} (out of scope)
//   - asset='USDsui' picks the USDsui pool's borrowApy
//   - case-insensitive asset lookup ('usdc' matches 'USDC')
//   - fail-soft: missing mcpManager / wallet / rates / HF → no throw
//
// Strategy: mock `fetchRates` + `fetchHealthFactor` from navi/reads via
// vi.mock. This decouples the unit test from the full McpClientManager
// + in-memory MCP server stack used by navi-reads.test.ts, keeping the
// turnaround fast (~50ms vs ~500ms).
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ToolContext } from '../types.js';
import { enrichPendingActionWithLiveData } from './enrich-pending-action.js';

vi.mock('../navi/reads.js', () => ({
  fetchRates: vi.fn(),
  fetchHealthFactor: vi.fn(),
}));

import { fetchRates, fetchHealthFactor } from '../navi/reads.js';

const FAKE_MCP_MANAGER = { __mock: 'mcp' } as unknown as ToolContext['mcpManager'];

function ctx(over: Partial<ToolContext> = {}): ToolContext {
  return {
    mcpManager: FAKE_MCP_MANAGER,
    walletAddress: '0xtest',
    retryStats: { attemptCount: 1 },
    portfolioCache: new Map(),
    ...over,
  } as ToolContext;
}

const HAPPY_RATES = {
  USDC: { saveApy: 0.0439, borrowApy: 0.0467, ltv: 0.8, price: 1 },
  USDsui: { saveApy: 0.0828, borrowApy: 0.0319, ltv: 0.85, price: 1 },
  SUI: { saveApy: 0.0325, borrowApy: 0.051, ltv: 0.65, price: 3.5 },
};

const HAPPY_HF = {
  healthFactor: 3.8,
  supplied: 100,
  borrowed: 20,
  maxBorrow: 80,
  liquidationThreshold: 0.85,
};

beforeEach(() => {
  vi.mocked(fetchRates).mockReset();
  vi.mocked(fetchHealthFactor).mockReset();
  vi.mocked(fetchRates).mockResolvedValue(HAPPY_RATES);
  vi.mocked(fetchHealthFactor).mockResolvedValue(HAPPY_HF);
});

describe('enrichPendingActionWithLiveData', () => {
  it('borrow populates BOTH borrowApyBps and currentHF', async () => {
    const result = await enrichPendingActionWithLiveData(
      'borrow',
      { amount: 5, asset: 'USDC' },
      ctx(),
    );
    expect(result.borrowApyBps).toBe(467);
    expect(result.currentHF).toBeCloseTo(3.8, 5);
  });

  it('repay_debt populates BOTH borrowApyBps and currentHF', async () => {
    const result = await enrichPendingActionWithLiveData(
      'repay_debt',
      { amount: 10, asset: 'USDC' },
      ctx(),
    );
    expect(result.borrowApyBps).toBe(467);
    expect(result.currentHF).toBeCloseTo(3.8, 5);
  });

  it('withdraw populates currentHF ONLY (no borrow APY relevance)', async () => {
    const result = await enrichPendingActionWithLiveData(
      'withdraw',
      { amount: 50, asset: 'USDC' },
      ctx(),
    );
    expect(result.borrowApyBps).toBeUndefined();
    expect(result.currentHF).toBeCloseTo(3.8, 5);
  });

  it('save_deposit populates currentHF ONLY', async () => {
    const result = await enrichPendingActionWithLiveData(
      'save_deposit',
      { amount: 25, asset: 'USDC' },
      ctx(),
    );
    expect(result.borrowApyBps).toBeUndefined();
    expect(result.currentHF).toBeCloseTo(3.8, 5);
  });

  it('send_transfer returns {} (out of scope — does not touch NAVI)', async () => {
    const result = await enrichPendingActionWithLiveData(
      'send_transfer',
      { amount: 1, to: '0xrecipient' },
      ctx(),
    );
    expect(result).toEqual({});
    expect(fetchRates).not.toHaveBeenCalled();
    expect(fetchHealthFactor).not.toHaveBeenCalled();
  });

  it('swap_execute returns {} (out of scope)', async () => {
    const result = await enrichPendingActionWithLiveData(
      'swap_execute',
      { from: 'USDC', to: 'SUI', amount: 10 },
      ctx(),
    );
    expect(result).toEqual({});
  });

  it("borrow with asset='USDsui' picks the USDsui pool's borrowApy (3.19%)", async () => {
    const result = await enrichPendingActionWithLiveData(
      'borrow',
      { amount: 5, asset: 'USDsui' },
      ctx(),
    );
    expect(result.borrowApyBps).toBe(319);
  });

  it('case-insensitive asset lookup — input "usdc" matches NAVI pool "USDC"', async () => {
    const result = await enrichPendingActionWithLiveData(
      'borrow',
      { amount: 5, asset: 'usdc' },
      ctx(),
    );
    expect(result.borrowApyBps).toBe(467);
  });

  it('defaults to USDC when input.asset is omitted', async () => {
    const result = await enrichPendingActionWithLiveData('borrow', { amount: 5 }, ctx());
    expect(result.borrowApyBps).toBe(467);
  });

  it('returns {} when mcpManager is absent (audric host did not thread MCP)', async () => {
    const result = await enrichPendingActionWithLiveData(
      'borrow',
      { amount: 5, asset: 'USDC' },
      ctx({ mcpManager: undefined }),
    );
    expect(result).toEqual({});
    expect(fetchRates).not.toHaveBeenCalled();
  });

  it('skips currentHF when walletAddress is absent (read-only session)', async () => {
    const result = await enrichPendingActionWithLiveData(
      'borrow',
      { amount: 5, asset: 'USDC' },
      ctx({ walletAddress: undefined }),
    );
    expect(result.borrowApyBps).toBe(467);
    expect(result.currentHF).toBeUndefined();
    expect(fetchHealthFactor).not.toHaveBeenCalled();
  });

  it('graceful: fetchRates throws → borrowApyBps undefined, currentHF still populated', async () => {
    vi.mocked(fetchRates).mockRejectedValueOnce(new Error('NAVI circuit breaker open'));
    const result = await enrichPendingActionWithLiveData(
      'borrow',
      { amount: 5, asset: 'USDC' },
      ctx(),
    );
    expect(result.borrowApyBps).toBeUndefined();
    expect(result.currentHF).toBeCloseTo(3.8, 5);
  });

  it('graceful: fetchHealthFactor throws → currentHF undefined, borrowApyBps still populated', async () => {
    vi.mocked(fetchHealthFactor).mockRejectedValueOnce(new Error('NAVI MCP timeout'));
    const result = await enrichPendingActionWithLiveData(
      'borrow',
      { amount: 5, asset: 'USDC' },
      ctx(),
    );
    expect(result.borrowApyBps).toBe(467);
    expect(result.currentHF).toBeUndefined();
  });

  it('graceful: unknown asset returns no borrowApyBps without throwing', async () => {
    const result = await enrichPendingActionWithLiveData(
      'borrow',
      { amount: 5, asset: 'UNKNOWN' },
      ctx(),
    );
    expect(result.borrowApyBps).toBeUndefined();
    expect(result.currentHF).toBeCloseTo(3.8, 5);
  });

  it('Day 14c: non-finite healthFactor (Infinity) → currentHF=null (∞ sentinel)', async () => {
    // [Day 14c] Pre-14c the engine dropped the field when HF was
    // Infinity (no debt). 14c-shipped consumers need to distinguish
    // "∞ before borrow" (render "∞ → 4.5") from "no data" (hide row).
    // Splits those by sending `null` for ∞ vs `undefined` for missing.
    vi.mocked(fetchHealthFactor).mockResolvedValueOnce({
      ...HAPPY_HF,
      borrowed: 0,
      healthFactor: Infinity,
    });
    const result = await enrichPendingActionWithLiveData(
      'borrow',
      { amount: 5, asset: 'USDC' },
      ctx(),
    );
    expect(result.borrowApyBps).toBe(467);
    expect(result.currentHF).toBeNull();
    // Projected: $5 debt against $100 supplied × 0.85 LT = 17.0
    expect(result.projectedHF).toBeCloseTo(17, 5);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Day 14c — projectedHF
  //
  // Formula: HF = (supplied × liquidationThreshold) / borrowed.
  // - borrow X        → newBorrowed = borrowed + X
  // - repay_debt X    → newBorrowed = max(0, borrowed - X)
  // - withdraw X      → newSupplied = max(0, supplied - X)
  // - save_deposit X  → newSupplied = supplied + X
  //
  // HAPPY_HF baseline: supplied=100, borrowed=20, LT=0.85 → HF=4.25
  // (mock baseline says 3.8 but math is 100×0.85/20 = 4.25 — the
  // projection uses the LIVE supplied/borrowed/LT, not the mock's
  // pre-computed HF value).
  // ─────────────────────────────────────────────────────────────────────

  it('Day 14c: borrow $5 USDC projects newBorrowed=$25 → HF=3.4', async () => {
    const result = await enrichPendingActionWithLiveData(
      'borrow',
      { amount: 5, asset: 'USDC' },
      ctx(),
    );
    // (100 × 0.85) / (20 + 5) = 85 / 25 = 3.4
    expect(result.projectedHF).toBeCloseTo(3.4, 5);
  });

  it('Day 14c: repay_debt $20 clears all debt → projectedHF=null (∞)', async () => {
    const result = await enrichPendingActionWithLiveData(
      'repay_debt',
      { amount: 20, asset: 'USDC' },
      ctx(),
    );
    // newBorrowed = 20 - 20 = 0 → sub-dust → ∞ sentinel
    expect(result.projectedHF).toBeNull();
  });

  it('Day 14c: repay_debt $10 partial → newBorrowed=$10 → HF=8.5', async () => {
    const result = await enrichPendingActionWithLiveData(
      'repay_debt',
      { amount: 10, asset: 'USDC' },
      ctx(),
    );
    // (100 × 0.85) / (20 - 10) = 85 / 10 = 8.5
    expect(result.projectedHF).toBeCloseTo(8.5, 5);
  });

  it('Day 14c: withdraw $25 USDC → newSupplied=$75 → HF=3.1875', async () => {
    const result = await enrichPendingActionWithLiveData(
      'withdraw',
      { amount: 25, asset: 'USDC' },
      ctx(),
    );
    // ((100 - 25) × 0.85) / 20 = 63.75 / 20 = 3.1875
    expect(result.projectedHF).toBeCloseTo(3.1875, 5);
  });

  it('Day 14c: save_deposit $50 USDC → newSupplied=$150 → HF=6.375', async () => {
    const result = await enrichPendingActionWithLiveData(
      'save_deposit',
      { amount: 50, asset: 'USDC' },
      ctx(),
    );
    // ((100 + 50) × 0.85) / 20 = 127.5 / 20 = 6.375
    expect(result.projectedHF).toBeCloseTo(6.375, 5);
  });

  it('Day 14c: save_deposit when no debt → projectedHF=null (∞ stays ∞)', async () => {
    vi.mocked(fetchHealthFactor).mockResolvedValueOnce({
      ...HAPPY_HF,
      borrowed: 0,
      healthFactor: Infinity,
    });
    const result = await enrichPendingActionWithLiveData(
      'save_deposit',
      { amount: 50, asset: 'USDC' },
      ctx(),
    );
    // No debt before, no debt after → still ∞
    expect(result.projectedHF).toBeNull();
  });

  it('Day 14c: withdraw all collateral but no debt → projectedHF=null (∞)', async () => {
    vi.mocked(fetchHealthFactor).mockResolvedValueOnce({
      ...HAPPY_HF,
      borrowed: 0,
      healthFactor: Infinity,
    });
    const result = await enrichPendingActionWithLiveData(
      'withdraw',
      { amount: 100, asset: 'USDC' },
      ctx(),
    );
    // Withdrawing collateral when no debt has no HF impact
    expect(result.projectedHF).toBeNull();
  });

  it('Day 14c: liquidationThreshold=0 (unknown) → projectedHF undefined', async () => {
    vi.mocked(fetchHealthFactor).mockResolvedValueOnce({
      ...HAPPY_HF,
      liquidationThreshold: 0,
    });
    const result = await enrichPendingActionWithLiveData(
      'borrow',
      { amount: 5, asset: 'USDC' },
      ctx(),
    );
    // currentHF still populated (was already finite in mock)
    expect(result.currentHF).toBeCloseTo(3.8, 5);
    // But projectedHF skipped — without a valid LT we can't compute it
    expect(result.projectedHF).toBeUndefined();
  });

  it('Day 14c: amount=0 → projectedHF undefined (degenerate input)', async () => {
    const result = await enrichPendingActionWithLiveData(
      'borrow',
      { amount: 0, asset: 'USDC' },
      ctx(),
    );
    expect(result.projectedHF).toBeUndefined();
  });

  it('Day 14c: send_transfer is out of scope → no projectedHF', async () => {
    const result = await enrichPendingActionWithLiveData(
      'send_transfer',
      { amount: 1, to: '0xrecipient' },
      ctx(),
    );
    expect(result.projectedHF).toBeUndefined();
  });

  it('Day 14c: fetchHealthFactor throws → projectedHF undefined too', async () => {
    vi.mocked(fetchHealthFactor).mockRejectedValueOnce(new Error('NAVI MCP timeout'));
    const result = await enrichPendingActionWithLiveData(
      'borrow',
      { amount: 5, asset: 'USDC' },
      ctx(),
    );
    expect(result.currentHF).toBeUndefined();
    expect(result.projectedHF).toBeUndefined();
  });

  it('Day 14c: borrow large enough to push HF below 1.0 — projection reports the danger', async () => {
    // supplied=$100, LT=0.85 → max safe borrow = $85. Borrowing $100 puts
    // HF = 85 / 120 = 0.708. Below 1.0 = critical / liquidation territory.
    // The projection just reports the math; the guards (separate code
    // path) are what BLOCK the write before it reaches the user.
    const result = await enrichPendingActionWithLiveData(
      'borrow',
      { amount: 100, asset: 'USDC' },
      ctx(),
    );
    expect(result.projectedHF).toBeCloseTo(0.7083333, 5);
  });

  // Pre-Day-14c: currentHF was `number | undefined`. Day 14c widens to
  // `number | null | undefined`. The standard happy-path tests above
  // (borrow / repay / withdraw / save) verify the `number` case implicitly
  // by asserting `toBeCloseTo`. This block pins the `null` and
  // `undefined` semantics explicitly.

  it('parallel fetch — both NAVI calls fire concurrently for borrow', async () => {
    let ratesResolveAt = 0;
    let hfResolveAt = 0;
    let startedAt = 0;

    vi.mocked(fetchRates).mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 30));
      ratesResolveAt = Date.now();
      return HAPPY_RATES;
    });
    vi.mocked(fetchHealthFactor).mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 30));
      hfResolveAt = Date.now();
      return HAPPY_HF;
    });

    startedAt = Date.now();
    await enrichPendingActionWithLiveData('borrow', { amount: 5 }, ctx());
    const elapsed = Math.max(ratesResolveAt, hfResolveAt) - startedAt;

    // Sequential would be ~60ms; parallel is ~30ms. Allow generous slack
    // for CI scheduler jitter while still failing if execution serialised.
    expect(elapsed).toBeLessThan(55);
  });
});
