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

// [S.123 v1.24.7] Mock partial — keep T2000Error real so the
// `instanceof T2000Error` branch in swap_quote / swap_execute fires
// correctly. Mocking the whole module would replace T2000Error with a
// vi.fn() that doesn't satisfy instanceof checks.
//
// [Bug A fix / 2026-05-10] Also mock `getSponsoredSwapProviders` so the
// `providers-forwarded` test below has a deterministic value to assert
// against. The real implementation does a dynamic import of
// `@cetusprotocol/aggregator-sdk` which is fine in production but
// adds noise to focused unit tests.
vi.mock('@t2000/sdk', async () => {
  const actual = await vi.importActual<typeof import('@t2000/sdk')>('@t2000/sdk');
  return {
    ...actual,
    getSwapQuote: vi.fn(),
    getSponsoredSwapProviders: vi.fn().mockResolvedValue(['CETUS', 'BLUEFIN', 'TURBOS', 'KRIYAV3']),
  };
});

import { getSwapQuote, T2000Error } from '@t2000/sdk';
import { swapQuoteTool } from '../tools/swap-quote.js';
import { swapExecuteTool } from '../tools/swap.js';
import type { ToolContext } from '../types.js';

import { callToolBody } from './_helpers/call-tool-body.js';
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
  } as unknown as ToolContext;
}

function makeExecuteContext(swapImpl: () => Promise<typeof FAKE_SWAP_RESULT>): ToolContext {
  return {
    walletAddress: '0xa11ce',
    agent: {
      address: () => '0xa11ce',
      swap: swapImpl,
    } as unknown as ToolContext['agent'],
  } as unknown as ToolContext;
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

    const result = await callToolBody(swapQuoteTool, 
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

  // [Bug A fix / 2026-05-10] Pin the contract: the engine `swap_quote`
  // tool MUST forward a sponsor-safe `providers` allow-list to the SDK's
  // `getSwapQuote`. Without this, `getSwapQuote` discovers routes against
  // the FULL provider set, which can include Pyth-dependent providers
  // (HAEDALPMM, METASTABLE, OBRIC, STEAMM_OMM[_V2], SEVENK, HAEDALHMMV2).
  // Routes walking those providers cause Cetus's `routerSwap` to insert
  // `tx.splitCoins(tx.gas, ...)` for the Pyth oracle update fee, which
  // Enoki rejects with HTTP 400 "Cannot use GasCoin as a transaction
  // argument". Production smoke evidence: 3-step bundle 2026-05-10.
  //
  // The exact list `['CETUS','BLUEFIN','TURBOS','KRIYAV3']` is an
  // arbitrary fixture from the mock above — what matters is that the
  // tool calls the SDK with the resolved value of
  // `getSponsoredSwapProviders()`, NOT undefined.
  it('forwards sponsor-safe providers allow-list to SDK getSwapQuote (Bug A fix)', async () => {
    mockedGetSwapQuote.mockResolvedValueOnce(FAKE_QUOTE);

    await callToolBody(swapQuoteTool, 
      { from: 'USDC', to: 'GOLD', amount: 1 },
      makeQuoteContext(),
    );

    expect(mockedGetSwapQuote).toHaveBeenCalledTimes(1);
    expect(mockedGetSwapQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'USDC',
        to: 'GOLD',
        amount: 1,
        providers: ['CETUS', 'BLUEFIN', 'TURBOS', 'KRIYAV3'],
      }),
    );
  });

  it('emits {outcome=error} counter and NO histogram when getSwapQuote throws', async () => {
    const boom = new Error('cetus 503');
    mockedGetSwapQuote.mockRejectedValueOnce(boom);

    await expect(
      callToolBody(swapQuoteTool, 
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

  // [S.123 v1.24.7] Structured-error recovery for ASSET_NOT_SUPPORTED.
  // Before this fix, an unsupported symbol (sSUI, AFSUI, BLUE, etc.) caused
  // the SDK to throw a generic Error which propagated up through the
  // EarlyToolDispatcher's promise — and Node's unhandled-rejection
  // detector crashed the Vercel function (process.exit(128)). The fix
  // converts T2000Error('ASSET_NOT_SUPPORTED') into a structured tool
  // result with a recovery hint, giving the LLM a deterministic path:
  // call `navi_navi_search_tokens` to find the full coin type, then retry.
  it('returns structured error with hint when SDK throws T2000Error("ASSET_NOT_SUPPORTED") (NOT just SSUI)', async () => {
    const errors = [
      new T2000Error('ASSET_NOT_SUPPORTED', 'Unknown token: SSUI. Provide the symbol or full coin type.'),
      new T2000Error('ASSET_NOT_SUPPORTED', 'Unknown token: AFSUI. Provide the symbol or full coin type.'),
      new T2000Error('ASSET_NOT_SUPPORTED', 'Unknown token: BLUE. Provide the symbol or full coin type.'),
    ];

    for (const err of errors) {
      mockedGetSwapQuote.mockRejectedValueOnce(err);
      const result = await callToolBody(swapQuoteTool, 
        { from: err.message.split(': ')[1].split('.')[0], to: 'USDC', amount: 1 },
        makeQuoteContext(),
      );

      expect(result.data).toMatchObject({
        errorCode: 'ASSET_NOT_SUPPORTED',
        recoverable: true,
      });
      expect((result.data as { hint: string }).hint).toContain('navi_navi_search_tokens');
      expect((result.data as { hint: string }).hint).toContain('full coin type');
    }
  });

  it('returns structured error with hint when SDK throws T2000Error("SWAP_FAILED") (no route)', async () => {
    const noRoute = new T2000Error('SWAP_FAILED', 'No swap route found for OBSCURE -> USDC.');
    mockedGetSwapQuote.mockRejectedValueOnce(noRoute);

    const result = await callToolBody(swapQuoteTool, 
      { from: 'OBSCURE', to: 'USDC', amount: 1 },
      makeQuoteContext(),
    );

    expect(result.data).toMatchObject({
      errorCode: 'SWAP_FAILED',
      recoverable: true,
    });
    expect((result.data as { hint: string }).hint).toContain('balance_check');
  });

  it('still re-throws unknown errors (lets dispatcher convert via collectResults try/catch)', async () => {
    const unknownErr = new Error('cetus 503 internal error');
    mockedGetSwapQuote.mockRejectedValueOnce(unknownErr);

    // Generic errors aren't soft-handled — they re-throw. The dispatcher's
    // `.catch` plus the audric process handler keep the process alive.
    await expect(
      callToolBody(swapQuoteTool, 
        { from: 'USDC', to: 'USDsui', amount: 1 },
        makeQuoteContext(),
      ),
    ).rejects.toBe(unknownErr);
  });

  it('measures wall-clock time of the SDK call (not zero on a deferred promise)', async () => {
    mockedGetSwapQuote.mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      return FAKE_QUOTE;
    });

    await callToolBody(swapQuoteTool, 
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

    const result = await callToolBody(swapExecuteTool, 
      { from: 'USDC', to: 'USDsui', amount: 5 },
      ctx,
    );

    // [S.123 v1.24.7] Result is a discriminated union — narrow to the success
    // branch by checking for the `tx` property's presence.
    expect('tx' in result.data ? result.data.tx : null).toBe(FAKE_SWAP_RESULT.tx);

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
      callToolBody(swapExecuteTool, 
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

  // [S.123 v1.24.7] swap_execute mirrors swap_quote for symmetry. Audric/web
  // typically dispatches via sponsored-tx path (not engine.call), but the CLI
  // and any future direct-execute consumer benefit from the same recovery
  // hint pattern.
  it('returns structured error with hint when agent.swap throws T2000Error("ASSET_NOT_SUPPORTED")', async () => {
    const err = new T2000Error('ASSET_NOT_SUPPORTED', 'Unknown token: SSUI. Provide the symbol or full coin type.');
    const ctx = makeExecuteContext(async () => {
      throw err;
    });

    const result = await callToolBody(swapExecuteTool, 
      { from: 'SSUI', to: 'USDC', amount: 1 },
      ctx,
    );

    expect(result.data).toMatchObject({
      errorCode: 'ASSET_NOT_SUPPORTED',
      recoverable: true,
    });
    expect((result.data as { hint: string }).hint).toContain('navi_navi_search_tokens');
  });
});
