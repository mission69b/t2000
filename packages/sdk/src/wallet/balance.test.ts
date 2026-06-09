/**
 * queryBalance — Core API shape coverage (gRPC migration Stage 1).
 *
 * balance.ts was rewritten off the legacy JSON-RPC `client.getBalance` /
 * `client.getObject` onto the transport-agnostic `client.core.*`. These tests
 * lock in the Core API response shapes so the eventual JSON-RPC → gRPC flip is
 * a no-op:
 *   - `core.getBalance` → `{ balance: { balance, coinType, coinBalance, addressBalance } }`
 *     (was `{ totalBalance }`)
 *   - `core.getObject({ include: { json: true } })` → `{ object: { json } }`
 *     (was `{ data: { content: { fields } } }`)
 * Both transports' `.core` return these shapes, so a single mock covers both.
 */
import type { ClientWithCoreApi } from '@mysten/sui/client';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_ASSETS } from '../constants.js';
import { queryBalance } from './balance.js';

const OWNER = `0x${'a'.repeat(64)}`;

// sqrt_price = 2 * 2^64 → raw_price = 4 → SUI price = 1000 / 4 = 250 USD.
// (A deliberately round, in-band value; the impl's guard accepts 0.01–1000.)
const SQRT_PRICE_FOR_250 = (2n ** 65n).toString();

function mockCoreClient(opts: {
  balances?: Record<string, string>; // coinType → Core `.balance.balance`
  sqrtPrice?: string | null;
  rejectCoinTypes?: string[];
}): ClientWithCoreApi {
  const balances = opts.balances ?? {};
  return {
    core: {
      getBalance: async ({ owner, coinType }: { owner: string; coinType: string }) => {
        if (opts.rejectCoinTypes?.includes(coinType)) {
          throw new Error(`mock rpc failure for ${coinType}`);
        }
        const balance = balances[coinType] ?? '0';
        return { balance: { coinType, balance, coinBalance: balance, addressBalance: '0', owner } };
      },
      getObject: async () => ({
        object: {
          json: opts.sqrtPrice == null ? null : { current_sqrt_price: opts.sqrtPrice },
        },
      }),
    },
  } as unknown as ClientWithCoreApi;
}

describe('queryBalance — Core API shapes', () => {
  it('reads stable balances off `.balance.balance` and sums them (SUI = 0)', async () => {
    const client = mockCoreClient({
      balances: {
        [SUPPORTED_ASSETS.USDC.type]: '5000000', // 5 USDC
        [SUPPORTED_ASSETS.USDsui.type]: '2000000', // 2 USDsui
        [SUPPORTED_ASSETS.SUI.type]: '0',
      },
      sqrtPrice: SQRT_PRICE_FOR_250,
    });

    const r = await queryBalance(client, OWNER);

    expect(r.stables.USDC).toBe(5);
    expect(r.stables.USDsui).toBe(2);
    expect(r.available).toBe(7);
    expect(r.gasReserve.sui).toBe(0);
    expect(r.gasReserve.usdEquiv).toBe(0);
    expect(r.total).toBe(7);
  });

  it('derives the SUI gas-reserve USD value from the Cetus pool `json` field', async () => {
    const client = mockCoreClient({
      balances: {
        [SUPPORTED_ASSETS.USDC.type]: '10000000', // 10 USDC
        [SUPPORTED_ASSETS.USDsui.type]: '0',
        [SUPPORTED_ASSETS.SUI.type]: '3000000000', // 3 SUI (9 decimals)
      },
      sqrtPrice: SQRT_PRICE_FOR_250,
    });

    const r = await queryBalance(client, OWNER);

    expect(r.gasReserve.sui).toBe(3);
    expect(r.gasReserve.usdEquiv).toBeCloseTo(750, 6); // 3 SUI × $250
    expect(r.total).toBeCloseTo(760, 6); // 10 USDC + $750
  });

  it('degrades a failed per-coin balance read to 0 (the `.catch` path)', async () => {
    const client = mockCoreClient({
      balances: {
        [SUPPORTED_ASSETS.USDsui.type]: '1000000', // 1 USDsui
        [SUPPORTED_ASSETS.SUI.type]: '0',
      },
      rejectCoinTypes: [SUPPORTED_ASSETS.USDC.type],
      sqrtPrice: SQRT_PRICE_FOR_250,
    });

    const r = await queryBalance(client, OWNER);

    expect(r.stables.USDC).toBe(0);
    expect(r.stables.USDsui).toBe(1);
    expect(r.available).toBe(1);
  });
});
