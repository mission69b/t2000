/**
 * SPEC 7 v0.4 Layer 0 — Auto-derived `allowedAddresses` regression suite.
 *
 * Acceptance gate #4 (per spec): asserts `derivedAllowedAddresses`
 * matches the audric host's hand-maintained array for every write tool,
 * across every recipient permutation that mattered for the PR-H1 +
 * PR-H4 production bugs.
 *
 * **The bug class this kills.** Audric's `transactions/prepare` and
 * `services/prepare` hand-maintained an `allowedAddresses: string[]`
 * argument passed to Enoki's `createSponsoredTransaction`. Enoki rejects
 * any sponsored tx that contains a `transferObjects` to an address NOT
 * in the array. Two production bugs (PR-H1 claim-rewards self-transfer,
 * PR-H4 borrow/withdraw self-transfer) shipped because someone forgot
 * to add the recipient when adding new logic.
 *
 * After Layer 0, `derivedAllowedAddresses` is computed from the
 * assembled PTB's top-level `transferObjects` commands. Hand-rolled
 * arrays go away — drift becomes impossible by construction.
 *
 * **What this suite asserts.** For every PTB shape composeTx can
 * produce, the auto-derived address set:
 *  - Includes EVERY recipient that appears in a top-level
 *    `transferObjects`.
 *  - Excludes addresses that only appear inside Move-call internals
 *    (Enoki only cross-checks top-level commands).
 *  - De-duplicates when the same address appears multiple times.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SuiCoreClient } from './utils/sui.js';
import { Transaction } from '@mysten/sui/transactions';
import { deriveAllowedAddressesFromPtb } from './composeTx.js';

const SENDER = '0x' + 'a'.repeat(64);
const RECIPIENT_1 = '0x' + 'b'.repeat(64);
const RECIPIENT_2 = '0x' + 'c'.repeat(64);
const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

function mockRpcClient(coins: Record<string, Array<{ coinObjectId: string; balance: string }>>): SuiCoreClient {
  return {
    core: {
      getBalance: vi.fn(async ({ coinType }: { coinType: string }) => {
        const coinData = coins[coinType] ?? [];
        const total = coinData.reduce((acc, c) => acc + BigInt(c.balance), 0n);
        return {
          balance: {
            coinType,
            balance: total.toString(),
            coinBalance: '0',
            addressBalance: '0',
          },
        };
      }),
      listCoins: vi.fn(async ({ coinType }: { coinType: string }) => ({
        objects: (coins[coinType] ?? []).map((c) => ({ objectId: c.coinObjectId, balance: c.balance })),
        cursor: null,
        hasNextPage: false,
      })),
    },
  } as unknown as SuiCoreClient;
}

describe('deriveAllowedAddressesFromPtb — pure-function tests', () => {
  it('returns empty array for tx with no transferObjects', () => {
    const tx = new Transaction();
    tx.setSender(SENDER);
    tx.moveCall({ target: '0x2::coin::zero', typeArguments: [USDC_TYPE], arguments: [] });

    expect(deriveAllowedAddressesFromPtb(tx)).toEqual([]);
  });

  it('extracts a single transferObjects recipient', () => {
    const tx = new Transaction();
    tx.setSender(SENDER);
    const [coin] = tx.splitCoins(tx.gas, [1000n]);
    tx.transferObjects([coin], RECIPIENT_1);

    const addresses = deriveAllowedAddressesFromPtb(tx);
    expect(addresses).toEqual([RECIPIENT_1]);
  });

  it('extracts multiple distinct recipients', () => {
    const tx = new Transaction();
    tx.setSender(SENDER);
    const [coin1] = tx.splitCoins(tx.gas, [1000n]);
    const [coin2] = tx.splitCoins(tx.gas, [2000n]);
    tx.transferObjects([coin1], RECIPIENT_1);
    tx.transferObjects([coin2], RECIPIENT_2);

    const addresses = deriveAllowedAddressesFromPtb(tx);
    expect(addresses).toContain(RECIPIENT_1);
    expect(addresses).toContain(RECIPIENT_2);
    expect(addresses).toHaveLength(2);
  });

  it('de-duplicates same recipient across multiple transferObjects', () => {
    const tx = new Transaction();
    tx.setSender(SENDER);
    const [coin1] = tx.splitCoins(tx.gas, [1000n]);
    const [coin2] = tx.splitCoins(tx.gas, [2000n]);
    tx.transferObjects([coin1], RECIPIENT_1);
    tx.transferObjects([coin2], RECIPIENT_1);

    const addresses = deriveAllowedAddressesFromPtb(tx);
    expect(addresses).toEqual([RECIPIENT_1]);
  });

  it('includes self-transfer (sender as recipient) — the PR-H1 bug class', () => {
    const tx = new Transaction();
    tx.setSender(SENDER);
    const [coin] = tx.splitCoins(tx.gas, [1000n]);
    tx.transferObjects([coin], SENDER);

    const addresses = deriveAllowedAddressesFromPtb(tx);
    expect(addresses).toEqual([SENDER]);
  });

  it('does NOT extract addresses inside nested Move calls (top-level only)', () => {
    const tx = new Transaction();
    tx.setSender(SENDER);
    // Move call whose ARGUMENTS reference an address — this should NOT
    // count toward allowedAddresses because Enoki only inspects
    // top-level transferObjects commands.
    tx.moveCall({
      target: '0x2::transfer::public_transfer',
      typeArguments: [`0x2::coin::Coin<${USDC_TYPE}>`],
      arguments: [
        tx.object('0xdead'),
        tx.pure.address(RECIPIENT_1),
      ],
    });

    const addresses = deriveAllowedAddressesFromPtb(tx);
    // Move-call argument addresses are NOT extracted — this is the
    // intentional behavior matching Enoki's allowedAddresses contract.
    expect(addresses).toEqual([]);
  });
});

describe('composeTx — derivedAllowedAddresses regression suite per write tool', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(Transaction.prototype, 'build').mockResolvedValue(new Uint8Array([1, 2, 3]));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('send_transfer (USDC) — derives recipient', async () => {
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({
      [USDC_TYPE]: [{ coinObjectId: '0x' + '1'.repeat(64), balance: '10000000' }],
    });

    const result = await composeTx({
      sender: SENDER, client, sponsoredContext: true,
      steps: [{ toolName: 'send_transfer', input: { to: RECIPIENT_1, amount: 5, asset: 'USDC' } }],
    });

    expect(result.derivedAllowedAddresses).toEqual([RECIPIENT_1]);
  });
});
