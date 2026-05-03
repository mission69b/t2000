/**
 * [Backlog 2a / 2026-05-04] Tests for the Cetus swap-telemetry baseline.
 *
 * Goal: prove that `swap_quote` and `swap_execute` emit the right shape
 * of telemetry on both success and error paths. The metrics drive the
 * Backlog 2b decision (build a per-request route cache) — if these
 * counters/histograms regress silently, we lose the signal and would
 * be forced to ship 2b on intuition.
 *
 * Tag-shape contract (binding):
 *   - `cetus.find_route_ms`           histogram, no tags
 *   - `cetus.find_route_count`        counter, tag `outcome=success|error`
 *   - `cetus.swap_execute_total_ms`   histogram, no tags
 *   - `cetus.swap_execute_count`      counter, tag `outcome=success|error`
 *
 * If a future refactor changes any of those names or tag keys, the
 * downstream Vercel Observability dashboard breaks silently. These
 * tests fail-fast on that drift.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resetTelemetrySink,
  setTelemetrySink,
  type TelemetrySink,
  type TelemetryTags,
} from '../telemetry.js';

vi.mock('@t2000/sdk', () => ({
  getSwapQuote: vi.fn(),
}));

import { getSwapQuote } from '@t2000/sdk';
import { swapQuoteTool } from '../tools/swap-quote.js';
import { swapExecuteTool } from '../tools/swap.js';
import type { ToolContext } from '../types.js';

interface SpySink {
  counter: ReturnType<typeof vi.fn>;
  histogram: ReturnType<typeof vi.fn>;
  gauge: ReturnType<typeof vi.fn>;
}

function installSpySink(): SpySink {
  const spy: SpySink = {
    counter: vi.fn<(name: string, tags?: TelemetryTags, value?: number) => void>(),
    histogram: vi.fn<(name: string, value: number, tags?: TelemetryTags) => void>(),
    gauge: vi.fn<(name: string, value: number, tags?: TelemetryTags) => void>(),
  };
  const sink: TelemetrySink = {
    counter: spy.counter,
    gauge: spy.gauge,
    histogram: spy.histogram,
  };
  setTelemetrySink(sink);
  return spy;
}

const FAKE_QUOTE = {
  fromAmount: 5,
  fromToken: 'USDC',
  toToken: 'USDsui',
  toAmount: 4.997059,
  priceImpact: 0.0001,
  route: 'CETUS',
};

const FAKE_SWAP_RESULT = {
  tx: '0xdeadbeef0000000000000000000000000000000000000000000000000000abcd',
  fromToken: 'USDC',
  toToken: 'USDsui',
  fromAmount: 5,
  toAmount: 4.997059,
  priceImpact: 0.0001,
  route: 'CETUS',
  gasCost: 0.01,
};

function makeQuoteContext(): ToolContext {
  return {
    walletAddress: '0xa11ce',
  } as ToolContext;
}

function makeExecuteContext(swapImpl: () => Promise<typeof FAKE_SWAP_RESULT>): ToolContext {
  return {
    walletAddress: '0xa11ce',
    agent: {
      address: () => '0xa11ce',
      swap: swapImpl,
    } as unknown as ToolContext['agent'],
  } as ToolContext;
}

describe('swap_quote telemetry (Backlog 2a)', () => {
  let spy: SpySink;
  const mockedGetSwapQuote = vi.mocked(getSwapQuote);

  beforeEach(() => {
    spy = installSpySink();
    mockedGetSwapQuote.mockReset();
  });

  afterEach(() => {
    resetTelemetrySink();
  });

  it('emits cetus.find_route_ms histogram and {outcome=success} counter on success', async () => {
    mockedGetSwapQuote.mockResolvedValueOnce(FAKE_QUOTE);

    const result = await swapQuoteTool.call(
      { from: 'USDC', to: 'USDsui', amount: 5 },
      makeQuoteContext(),
    );

    expect(result.data).toEqual(FAKE_QUOTE);

    expect(spy.histogram).toHaveBeenCalledTimes(1);
    const [histogramName, histogramValue, histogramTags] = spy.histogram.mock.calls[0]!;
    expect(histogramName).toBe('cetus.find_route_ms');
    expect(typeof histogramValue).toBe('number');
    expect(histogramValue).toBeGreaterThanOrEqual(0);
    expect(histogramTags).toBeUndefined();

    expect(spy.counter).toHaveBeenCalledTimes(1);
    expect(spy.counter).toHaveBeenCalledWith('cetus.find_route_count', {
      outcome: 'success',
    });
  });

  it('emits {outcome=error} counter and NO histogram when getSwapQuote throws', async () => {
    const boom = new Error('cetus 503');
    mockedGetSwapQuote.mockRejectedValueOnce(boom);

    await expect(
      swapQuoteTool.call(
        { from: 'USDC', to: 'USDsui', amount: 5 },
        makeQuoteContext(),
      ),
    ).rejects.toBe(boom);

    expect(spy.histogram).not.toHaveBeenCalled();
    expect(spy.counter).toHaveBeenCalledTimes(1);
    expect(spy.counter).toHaveBeenCalledWith('cetus.find_route_count', {
      outcome: 'error',
    });
  });

  it('measures wall-clock time of the SDK call (not zero on a deferred promise)', async () => {
    mockedGetSwapQuote.mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      return FAKE_QUOTE;
    });

    await swapQuoteTool.call(
      { from: 'USDC', to: 'USDsui', amount: 5 },
      makeQuoteContext(),
    );

    expect(spy.histogram).toHaveBeenCalledTimes(1);
    const [, value] = spy.histogram.mock.calls[0]!;
    expect(value).toBeGreaterThanOrEqual(10);
  });
});

describe('swap_execute telemetry (Backlog 2a)', () => {
  let spy: SpySink;

  beforeEach(() => {
    spy = installSpySink();
  });

  afterEach(() => {
    resetTelemetrySink();
  });

  it('emits cetus.swap_execute_total_ms histogram and {outcome=success} counter on success', async () => {
    const ctx = makeExecuteContext(async () => FAKE_SWAP_RESULT);

    const result = await swapExecuteTool.call(
      { from: 'USDC', to: 'USDsui', amount: 5 },
      ctx,
    );

    expect(result.data.tx).toBe(FAKE_SWAP_RESULT.tx);

    expect(spy.histogram).toHaveBeenCalledTimes(1);
    const [histogramName, histogramValue, histogramTags] = spy.histogram.mock.calls[0]!;
    expect(histogramName).toBe('cetus.swap_execute_total_ms');
    expect(typeof histogramValue).toBe('number');
    expect(histogramValue).toBeGreaterThanOrEqual(0);
    expect(histogramTags).toBeUndefined();

    expect(spy.counter).toHaveBeenCalledTimes(1);
    expect(spy.counter).toHaveBeenCalledWith('cetus.swap_execute_count', {
      outcome: 'success',
    });
  });

  it('emits {outcome=error} counter and NO histogram when agent.swap throws', async () => {
    const boom = new Error('SUI_RPC_TIMEOUT');
    const ctx = makeExecuteContext(async () => {
      throw boom;
    });

    await expect(
      swapExecuteTool.call(
        { from: 'USDC', to: 'USDsui', amount: 5 },
        ctx,
      ),
    ).rejects.toBe(boom);

    expect(spy.histogram).not.toHaveBeenCalled();
    expect(spy.counter).toHaveBeenCalledTimes(1);
    expect(spy.counter).toHaveBeenCalledWith('cetus.swap_execute_count', {
      outcome: 'error',
    });
  });
});
