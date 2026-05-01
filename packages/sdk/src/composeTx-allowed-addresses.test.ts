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
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { deriveAllowedAddressesFromPtb } from './composeTx.js';

const SENDER = '0x' + 'a'.repeat(64);
const RECIPIENT_1 = '0x' + 'b'.repeat(64);
const RECIPIENT_2 = '0x' + 'c'.repeat(64);
const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

function mockRpcClient(coins: Record<string, Array<{ coinObjectId: string; balance: string }>>): SuiJsonRpcClient {
  return {
    getCoins: vi.fn(async ({ coinType }: { coinType: string }) => ({
      data: coins[coinType] ?? [],
      nextCursor: null,
      hasNextPage: false,
    })),
  } as unknown as SuiJsonRpcClient;
}

function mockNaviAdapter() {
  vi.doMock('@naviprotocol/lending', () => ({
    depositCoinPTB: vi.fn(async () => undefined),
    withdrawCoinPTB: vi.fn(async (tx: Transaction) => {
      const [coin] = tx.moveCall({ target: '0x123::test::mock_withdraw', arguments: [] });
      return coin;
    }),
    borrowCoinPTB: vi.fn(async (tx: Transaction) => {
      const [coin] = tx.moveCall({ target: '0x123::test::mock_borrow', arguments: [] });
      return coin;
    }),
    repayCoinPTB: vi.fn(async () => undefined),
    claimLendingRewardsPTB: vi.fn(async (tx: Transaction) => {
      // claim_rewards transfers reward coins to the sender at top-level —
      // this is the PR-H1 bug class (audric host forgot to add sender to
      // allowedAddresses pre-fix).
      const [rewardCoin] = tx.moveCall({ target: '0x123::test::mock_claim', arguments: [] });
      tx.transferObjects([rewardCoin], SENDER);
    }),
    getUserAvailableLendingRewards: vi.fn(async () => [{
      asset: { coinType: USDC_TYPE, decimals: 6, symbol: 'USDC' },
      amount: '1000000',
      userClaimableReward: '1000000',
    }]),
    summaryLendingRewards: vi.fn((rewards: unknown[]) => rewards),
    updateOraclePriceBeforeUserOperationPTB: vi.fn(async () => undefined),
    getLendingPositions: vi.fn(async () => [{
      type: 'navi-lending-supply',
      'navi-lending-supply': {
        token: { symbol: 'USDC', coinType: USDC_TYPE },
        amount: '100',
        valueUSD: '100',
        pool: { supplyIncentiveApyInfo: { apy: '5.0' }, borrowIncentiveApyInfo: { apy: '4.0' } },
      },
    }]),
    getPools: vi.fn(async () => []),
    getHealthFactor: vi.fn(async () => 1e18),
  }));
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
    mockNaviAdapter();
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

  it('save_deposit — derives empty (deposit consumes coin, no transferObjects)', async () => {
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({
      [USDC_TYPE]: [{ coinObjectId: '0x' + '2'.repeat(64), balance: '10000000' }],
    });

    const result = await composeTx({
      sender: SENDER, client, sponsoredContext: true,
      steps: [{ toolName: 'save_deposit', input: { amount: 5, asset: 'USDC' } }],
    });

    expect(result.derivedAllowedAddresses).toEqual([]);
  });

  it('withdraw — derives sender (output coin transferred back) — fixes PR-H4', async () => {
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({});

    const result = await composeTx({
      sender: SENDER, client, sponsoredContext: true,
      steps: [{ toolName: 'withdraw', input: { amount: 5, asset: 'USDC' } }],
    });

    expect(result.derivedAllowedAddresses).toEqual([SENDER]);
  });

  it('borrow — derives sender (borrowed coin transferred back) — fixes PR-H4', async () => {
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({});

    const result = await composeTx({
      sender: SENDER, client, sponsoredContext: true,
      steps: [{ toolName: 'borrow', input: { amount: 10, asset: 'USDC' } }],
    });

    expect(result.derivedAllowedAddresses).toEqual([SENDER]);
  });

  it('claim_rewards (with claimable rewards) — derives sender — fixes PR-H1', async () => {
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({});

    const result = await composeTx({
      sender: SENDER, client, sponsoredContext: true,
      steps: [{ toolName: 'claim_rewards', input: {} }],
    });

    // claim_rewards's mocked PTB does a top-level transferObjects to sender,
    // which is the exact pattern that PR-H1 missed in the hand-rolled array.
    expect(result.derivedAllowedAddresses).toEqual([SENDER]);
  });

  it('claim_rewards (no claimable rewards) — derives empty', async () => {
    vi.resetModules();
    vi.doMock('@naviprotocol/lending', () => ({
      depositCoinPTB: vi.fn(async () => undefined),
      withdrawCoinPTB: vi.fn(),
      borrowCoinPTB: vi.fn(),
      repayCoinPTB: vi.fn(),
      claimLendingRewardsPTB: vi.fn(),
      getUserAvailableLendingRewards: vi.fn(async () => []),
      summaryLendingRewards: vi.fn(() => []),
      updateOraclePriceBeforeUserOperationPTB: vi.fn(),
      getLendingPositions: vi.fn(async () => []),
      getPools: vi.fn(async () => []),
      getHealthFactor: vi.fn(async () => 1e18),
    }));
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({});

    const result = await composeTx({
      sender: SENDER, client, sponsoredContext: true,
      steps: [{ toolName: 'claim_rewards', input: {} }],
    });

    expect(result.derivedAllowedAddresses).toEqual([]);
  });
});
