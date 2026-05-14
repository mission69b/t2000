// ---------------------------------------------------------------------------
// Tests for the bounded poll-on-balance-delta replacement for the fixed
// 1500ms post-write sleep. SPEC 19 Phase A — see post-write-poll.ts header
// for the design rationale.
//
// Coverage matrix (9 cases):
//   1. detected_change on first poll       — fast-path success
//   2. detected_change on later poll       — slow indexer catchup
//   3. ceiling reached without delta       — defensive fallback
//   4. aborted before first poll           — signal pre-aborted
//   5. aborted mid-poll                    — signal aborted between polls
//   6. fallback_no_baseline (RPC throws)   — baseline fetch failure
//   7. fallback_no_address                 — missing walletAddress
//   8. fallback_no_rpc                     — missing rpcUrl
//   9. poll RPC failure recovers           — fail-open inside the loop
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pollForIndexerCatchup } from './post-write-poll.js';

const mockFetchWalletCoins = vi.hoisted(() => vi.fn());

vi.mock('./sui/rpc.js', () => ({
  fetchWalletCoins: mockFetchWalletCoins,
}));

const ADDRESS = `0x${'a'.repeat(64)}`;
const RPC_URL = 'https://fullnode.mainnet.sui.io:443';
const USDC = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const SUI = '0x2::sui::SUI';

function coin(coinType: string, totalBalance: string) {
  return { coinType, symbol: '', decimals: 0, totalBalance, coinObjectCount: 1 };
}

beforeEach(() => {
  mockFetchWalletCoins.mockReset();
});

describe('pollForIndexerCatchup', () => {
  it('returns detected_change on the FIRST poll when delta is present', async () => {
    // baseline = pre-write USDC=100; first poll = post-write USDC=90
    mockFetchWalletCoins
      .mockResolvedValueOnce([coin(USDC, '100')])
      .mockResolvedValueOnce([coin(USDC, '90')]);

    const result = await pollForIndexerCatchup({
      suiRpcUrl: RPC_URL,
      address: ADDRESS,
      ceilingMs: 1500,
      pollIntervalMs: 50,
      signal: new AbortController().signal,
    });

    expect(result.outcome).toBe('detected_change');
    expect(result.attempts).toBe(1);
    expect(mockFetchWalletCoins).toHaveBeenCalledTimes(2);
  });

  it('returns detected_change on a LATER poll when indexer is slow', async () => {
    // baseline = USDC=100; first 2 polls return baseline (stale); third returns delta
    mockFetchWalletCoins
      .mockResolvedValueOnce([coin(USDC, '100')])  // baseline
      .mockResolvedValueOnce([coin(USDC, '100')])  // poll 1: still stale
      .mockResolvedValueOnce([coin(USDC, '100')])  // poll 2: still stale
      .mockResolvedValueOnce([coin(USDC, '90')]);  // poll 3: delta

    const result = await pollForIndexerCatchup({
      suiRpcUrl: RPC_URL,
      address: ADDRESS,
      ceilingMs: 1500,
      pollIntervalMs: 25,
      signal: new AbortController().signal,
    });

    expect(result.outcome).toBe('detected_change');
    expect(result.attempts).toBe(3);
  });

  it('detects new coin appearing (e.g. SUI received from a swap)', async () => {
    mockFetchWalletCoins
      .mockResolvedValueOnce([coin(USDC, '100')])               // baseline
      .mockResolvedValueOnce([coin(USDC, '100'), coin(SUI, '47')]); // SUI appeared

    const result = await pollForIndexerCatchup({
      suiRpcUrl: RPC_URL,
      address: ADDRESS,
      ceilingMs: 1500,
      pollIntervalMs: 25,
      signal: new AbortController().signal,
    });

    expect(result.outcome).toBe('detected_change');
    expect(result.attempts).toBe(1);
  });

  it('detects coin disappearing (e.g. coin object fully consumed)', async () => {
    mockFetchWalletCoins
      .mockResolvedValueOnce([coin(USDC, '100'), coin(SUI, '50')]) // baseline
      .mockResolvedValueOnce([coin(USDC, '100')]);                  // SUI gone

    const result = await pollForIndexerCatchup({
      suiRpcUrl: RPC_URL,
      address: ADDRESS,
      ceilingMs: 1500,
      pollIntervalMs: 25,
      signal: new AbortController().signal,
    });

    expect(result.outcome).toBe('detected_change');
    expect(result.attempts).toBe(1);
  });

  it('returns ceiling when no delta detected within ceilingMs', async () => {
    // baseline + every poll returns the same balance — indexer never catches up
    mockFetchWalletCoins.mockResolvedValue([coin(USDC, '100')]);

    const result = await pollForIndexerCatchup({
      suiRpcUrl: RPC_URL,
      address: ADDRESS,
      ceilingMs: 100,         // tight ceiling for fast test
      pollIntervalMs: 25,     // 4 attempts
      signal: new AbortController().signal,
    });

    expect(result.outcome).toBe('ceiling');
    expect(result.attempts).toBe(4); // floor(100/25) = 4
    // Slack of 5ms absorbs scheduler / clock-resolution jitter — 4×setTimeout(25)
    // is theoretically ≥100ms but Date.now() in CI can round to 99ms. The
    // assertion is here to confirm the ceiling was actually awaited (i.e. we
    // didn't bail early); millisecond-exactness is not what we're testing.
    expect(result.resolvedAtMs).toBeGreaterThanOrEqual(95);
  });

  it('returns aborted when signal is pre-aborted', async () => {
    mockFetchWalletCoins.mockResolvedValueOnce([coin(USDC, '100')]); // baseline succeeds

    const controller = new AbortController();
    controller.abort();

    const result = await pollForIndexerCatchup({
      suiRpcUrl: RPC_URL,
      address: ADDRESS,
      ceilingMs: 1500,
      pollIntervalMs: 25,
      signal: controller.signal,
    });

    expect(result.outcome).toBe('aborted');
    expect(result.attempts).toBe(0);
    // baseline fetch IS allowed before abort check, so it ran once
    expect(mockFetchWalletCoins).toHaveBeenCalledTimes(1);
  });

  it('returns aborted when signal aborts mid-poll', async () => {
    mockFetchWalletCoins
      .mockResolvedValueOnce([coin(USDC, '100')])  // baseline
      .mockResolvedValueOnce([coin(USDC, '100')]); // poll 1 stale

    const controller = new AbortController();

    // Abort after a short delay — should land between polls
    setTimeout(() => controller.abort(), 40);

    const result = await pollForIndexerCatchup({
      suiRpcUrl: RPC_URL,
      address: ADDRESS,
      ceilingMs: 1500,
      pollIntervalMs: 25,
      signal: controller.signal,
    });

    expect(result.outcome).toBe('aborted');
    expect(result.attempts).toBeGreaterThanOrEqual(0);
  });

  it('falls back to fixed sleep when baseline fetch throws', async () => {
    mockFetchWalletCoins.mockRejectedValueOnce(new Error('Sui RPC down'));

    const start = Date.now();
    const result = await pollForIndexerCatchup({
      suiRpcUrl: RPC_URL,
      address: ADDRESS,
      ceilingMs: 100,
      pollIntervalMs: 25,
      signal: new AbortController().signal,
    });
    const elapsed = Date.now() - start;

    expect(result.outcome).toBe('fallback_no_baseline');
    expect(result.attempts).toBe(0);
    // 5ms slack — same scheduler/clock-resolution rationale as the 'ceiling'
    // test above. This is testing "we waited the fixed-sleep fallback, didn't
    // bail early" — not millisecond-exact wall-clock.
    expect(elapsed).toBeGreaterThanOrEqual(95);
    expect(mockFetchWalletCoins).toHaveBeenCalledTimes(1); // only baseline
  });

  it('falls back to fixed sleep when address is missing', async () => {
    const result = await pollForIndexerCatchup({
      suiRpcUrl: RPC_URL,
      address: undefined,
      ceilingMs: 100,
      pollIntervalMs: 25,
      signal: new AbortController().signal,
    });

    expect(result.outcome).toBe('fallback_no_address');
    expect(result.attempts).toBe(0);
    expect(mockFetchWalletCoins).not.toHaveBeenCalled();
  });

  it('falls back to fixed sleep when rpcUrl is missing', async () => {
    const result = await pollForIndexerCatchup({
      suiRpcUrl: undefined,
      address: ADDRESS,
      ceilingMs: 100,
      pollIntervalMs: 25,
      signal: new AbortController().signal,
    });

    expect(result.outcome).toBe('fallback_no_rpc');
    expect(result.attempts).toBe(0);
    expect(mockFetchWalletCoins).not.toHaveBeenCalled();
  });

  it('continues polling when a single poll attempt fails (fail-open)', async () => {
    // baseline ok; poll 1 throws; poll 2 returns delta
    mockFetchWalletCoins
      .mockResolvedValueOnce([coin(USDC, '100')])     // baseline
      .mockRejectedValueOnce(new Error('transient'))  // poll 1 fails
      .mockResolvedValueOnce([coin(USDC, '90')]);     // poll 2 succeeds with delta

    const result = await pollForIndexerCatchup({
      suiRpcUrl: RPC_URL,
      address: ADDRESS,
      ceilingMs: 1500,
      pollIntervalMs: 25,
      signal: new AbortController().signal,
    });

    expect(result.outcome).toBe('detected_change');
    expect(result.attempts).toBe(2); // failed attempt counted, recovered on attempt 2
    expect(mockFetchWalletCoins).toHaveBeenCalledTimes(3); // baseline + 2 polls
  });
});
