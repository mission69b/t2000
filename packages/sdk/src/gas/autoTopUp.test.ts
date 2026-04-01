import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AUTO_TOPUP_THRESHOLD, GAS_RESERVE_TARGET, AUTO_TOPUP_MIN_USDC, SUPPORTED_ASSETS } from '../constants.js';

vi.mock('./gasStation.js', () => ({
  requestGasSponsorship: vi.fn(),
  reportGasUsage: vi.fn(),
}));

import { shouldAutoTopUp } from './autoTopUp.js';

function mockClient(suiBalance: bigint, usdcBalance: bigint) {
  return {
    getBalance: vi.fn().mockImplementation(({ coinType }: { coinType: string }) => {
      if (coinType === SUPPORTED_ASSETS.SUI.type) {
        return Promise.resolve({ totalBalance: suiBalance.toString() });
      }
      return Promise.resolve({ totalBalance: usdcBalance.toString() });
    }),
    getCoins: vi.fn().mockResolvedValue({ data: [] }),
  } as any;
}

describe('shouldAutoTopUp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false even when SUI < reserve target AND USDC >= min (swap disabled)', async () => {
    const client = mockClient(
      GAS_RESERVE_TARGET - 1n,    // just under 0.15 SUI
      AUTO_TOPUP_MIN_USDC,        // exactly $2 USDC
    );
    const result = await shouldAutoTopUp(client, '0x' + 'a'.repeat(64));
    expect(result).toBe(false);
  });

  it('returns false when SUI >= reserve target', async () => {
    const client = mockClient(
      GAS_RESERVE_TARGET,         // exactly 0.15 SUI
      10_000_000n,                // $10 USDC
    );
    const result = await shouldAutoTopUp(client, '0x' + 'a'.repeat(64));
    expect(result).toBe(false);
  });

  it('returns false when USDC < min', async () => {
    const client = mockClient(
      1_000_000n,                 // 0.001 SUI (low)
      AUTO_TOPUP_MIN_USDC - 1n,  // just under $2 USDC
    );
    const result = await shouldAutoTopUp(client, '0x' + 'a'.repeat(64));
    expect(result).toBe(false);
  });

  it('returns false when both SUI and USDC are sufficient', async () => {
    const client = mockClient(
      200_000_000n,               // 0.2 SUI (above reserve target)
      10_000_000n,                // $10 USDC
    );
    const result = await shouldAutoTopUp(client, '0x' + 'a'.repeat(64));
    expect(result).toBe(false);
  });

  it('returns false when both are zero', async () => {
    const client = mockClient(0n, 0n);
    const result = await shouldAutoTopUp(client, '0x' + 'a'.repeat(64));
    expect(result).toBe(false);
  });

  it('threshold constant is 0.05 SUI (50_000_000 MIST)', () => {
    expect(AUTO_TOPUP_THRESHOLD).toBe(50_000_000n);
  });

  it('min USDC constant is $2 (2_000_000 raw)', () => {
    expect(AUTO_TOPUP_MIN_USDC).toBe(2_000_000n);
  });
});
