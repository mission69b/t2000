/**
 * Smoke tests — hit mainnet RPC (read-only, no transactions).
 *
 * Run with:  SMOKE=1 pnpm --filter @t2000/sdk test -- src/__smoke__
 *
 * Skipped by default so CI and normal `pnpm test` are fast.
 * These catch SDK-breaking changes that mocks can never detect.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { NaviAdapter } from '../adapters/navi.js';

const SMOKE = !!process.env.SMOKE;

// A known mainnet address with NAVI positions.
const TEST_ADDRESS = '0x54af76a0fec0bf4a1c02bb00ed498b4c06f5b6e21268e888fb18543f0e8fe8fa';

let suiClient: SuiJsonRpcClient;

beforeAll(() => {
  if (!SMOKE) return;
  suiClient = new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl('mainnet'),
    network: 'mainnet',
  });
});

// ─── NAVI ────────────────────────────────────────────────────────

describe.skipIf(!SMOKE)('Smoke: NAVI adapter (mainnet)', () => {
  let adapter: NaviAdapter;

  beforeAll(async () => {
    adapter = new NaviAdapter();
    await adapter.init(suiClient);
  });

  it('fetches rates for USDC', async () => {
    const rates = await adapter.getRates('USDC');
    expect(rates.asset).toBe('USDC');
    expect(rates.saveApy).toBeGreaterThan(0);
    expect(rates.borrowApy).toBeGreaterThan(0);
  });

  it('fetches rates for SUI', async () => {
    const rates = await adapter.getRates('SUI');
    expect(rates.asset).toBe('SUI');
    expect(rates.saveApy).toBeGreaterThanOrEqual(0);
  });

  it('fetches positions for a known address', async () => {
    const positions = await adapter.getPositions(TEST_ADDRESS);
    for (const supply of positions.supplies) {
      expect(supply.asset).toBeTruthy();
      expect(supply.amount).toBeGreaterThanOrEqual(0);
      expect(supply.amountUsd).toBeDefined();
      expect(supply.amountUsd).toBeGreaterThanOrEqual(0);
      expect(supply.apy).toBeGreaterThanOrEqual(0);
    }
    for (const borrow of positions.borrows) {
      expect(borrow.asset).toBeTruthy();
      expect(borrow.amountUsd).toBeDefined();
    }
  });

  it('fetches health factor', async () => {
    const health = await adapter.getHealth(TEST_ADDRESS);
    expect(health.healthFactor).toBeGreaterThan(0);
    expect(typeof health.supplied).toBe('number');
    expect(typeof health.borrowed).toBe('number');
  });

  it('returns empty positions for a fresh address', async () => {
    const freshAddr = '0x0000000000000000000000000000000000000000000000000000000000000001';
    const positions = await adapter.getPositions(freshAddr);
    expect(positions.supplies).toHaveLength(0);
    expect(positions.borrows).toHaveLength(0);
  });
});
