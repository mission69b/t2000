/**
 * Track B (2026-05-08) — `buildHarvestRewardsTx` unit tests.
 *
 * Coverage focus is on the OBSERVABLE plan output (what the engine tool
 * narrates to the user) + the failure-mode contracts (when does the
 * harvest throw vs. silently degrade) + the dust filter logic. We don't
 * assert PTB byte structure — that's covered indirectly by the
 * underlying `addSwapToTx` + `addSaveToTx` tests, plus the mainnet
 * smoke. Mocks for `getUserAvailableLendingRewards`, `claimLendingRewardsPTB`,
 * and Cetus's `findSwapRoute` keep the tests deterministic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildHarvestRewardsTx } from './navi-harvest.js';
import { T2000Error } from '../errors.js';
import { USDC_TYPE } from '../token-registry.js';

vi.mock('@naviprotocol/lending', async (importActual) => {
  const actual = await importActual<typeof import('@naviprotocol/lending')>();
  return {
    ...actual,
    getUserAvailableLendingRewards: vi.fn(),
    claimLendingRewardsPTB: vi.fn(),
  };
});

vi.mock('./cetus-swap.js', async (importActual) => {
  const actual = await importActual<typeof import('./cetus-swap.js')>();
  return {
    ...actual,
    addSwapToTx: vi.fn(),
  };
});

vi.mock('./navi.js', async (importActual) => {
  const actual = await importActual<typeof import('./navi.js')>();
  return {
    ...actual,
    addSaveToTx: vi.fn().mockResolvedValue(undefined),
  };
});

import {
  getUserAvailableLendingRewards,
  claimLendingRewardsPTB,
} from '@naviprotocol/lending';
import { addSwapToTx } from './cetus-swap.js';
import { addSaveToTx } from './navi.js';

const VALID_ADDRESS = '0x' + 'a'.repeat(64);
const VSUI_TYPE =
  '0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT';
const NAVX_TYPE =
  '0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX';
const UNKNOWN_TYPE = '0x' + '9'.repeat(64) + '::weird::WEIRD';

const fakeClient = {} as Parameters<typeof buildHarvestRewardsTx>[0];

function mockClaimEmits(coinTypeToCount: Record<string, number>) {
  // NAVI's `claimLendingRewardsPTB` emits LendingClaimedReward[] — each
  // entry has { coin: TransactionResult, identifier: Pool, owner, isEMode }.
  // We need REAL coin handles tied to the test `tx` (mergeCoins validates
  // that handles are real results from this tx). Build them inside the
  // mock implementation by appending no-op move calls to the same `tx`
  // the builder passed in — each `tx.moveCall` returns a handle that's
  // valid for `mergeCoins` / `transferObjects` downstream.
  vi.mocked(claimLendingRewardsPTB).mockImplementation(async (tx) => {
    const out: Array<{ coin: unknown; identifier: { suiCoinType: string }; owner: string; isEMode: boolean }> = [];
    for (const [ct, count] of Object.entries(coinTypeToCount)) {
      for (let i = 0; i < count; i++) {
        // Manufacture a real result handle by adding a placeholder move call.
        // The handle structure ($kind: 'NestedResult' with the right tx
        // membership) is what matters for downstream tx.mergeCoins /
        // tx.transferObjects validation.
        const handle = tx.moveCall({
          target: '0x2::coin::zero',
          typeArguments: [ct],
        });
        out.push({ coin: handle, identifier: { suiCoinType: ct }, owner: VALID_ADDRESS, isEMode: false });
      }
    }
    return out as never;
  });
}

function mockSwapReturns(expectedOutputUsdc: number, effectiveAmountIn?: number) {
  // Same handle-realism pattern as `mockClaimEmits` — the swap output coin
  // gets merged with USDC reward handles before deposit, so the handle MUST
  // be a real result tied to the test `tx`. Manufacture via `tx.moveCall`
  // pointing at `coin::zero` (a no-op placeholder; we never simulate or
  // execute this PTB).
  vi.mocked(addSwapToTx).mockImplementation(
    async (tx, _client, _addr, input) => {
      const coin = tx.moveCall({
        target: '0x2::coin::zero',
        typeArguments: [USDC_TYPE],
      });
      return {
        coin,
        effectiveAmountIn: effectiveAmountIn ?? input.amount,
        expectedAmountOut: expectedOutputUsdc,
        route: {} as never,
      };
    },
  );
}

beforeEach(() => {
  vi.mocked(getUserAvailableLendingRewards).mockReset();
  vi.mocked(claimLendingRewardsPTB).mockReset();
  vi.mocked(addSwapToTx).mockReset();
  vi.mocked(addSaveToTx).mockReset().mockResolvedValue(undefined);
});

describe('buildHarvestRewardsTx', () => {
  describe('happy paths', () => {
    it('claims a single vSUI reward, swaps to USDC, deposits to NAVI', async () => {
      vi.mocked(getUserAvailableLendingRewards).mockResolvedValue([
        { userClaimableReward: 0.0165, rewardCoinType: VSUI_TYPE, assetId: 5 },
      ] as never);
      mockClaimEmits({ [VSUI_TYPE]: 1 });
      mockSwapReturns(0.0162);

      const { plan } = await buildHarvestRewardsTx(fakeClient, VALID_ADDRESS);

      expect(plan.claimed).toHaveLength(1);
      expect(plan.claimed[0]?.symbol).toBe('vSUI');
      expect(plan.swaps).toHaveLength(1);
      expect(plan.swaps[0]?.fromSymbol).toBe('vSUI');
      expect(plan.swaps[0]?.toSymbol).toBe('USDC');
      expect(plan.swaps[0]?.expectedOutputUsdc).toBeCloseTo(0.0162, 4);
      expect(plan.skipped).toEqual([]);
      expect(plan.expectedUsdcDeposited).toBeCloseTo(0.0162, 4);

      // Swap fired with chain-mode inputCoin from NAVI claim.
      expect(addSwapToTx).toHaveBeenCalledTimes(1);
      const swapCall = vi.mocked(addSwapToTx).mock.calls[0];
      expect(swapCall?.[3].inputCoin).toBeDefined();
      expect(swapCall?.[3].from).toBe('vSUI');
      expect(swapCall?.[3].to).toBe('USDC');

      // Deposit fired exactly once, with the swap output handle.
      expect(addSaveToTx).toHaveBeenCalledTimes(1);
      expect(addSaveToTx).toHaveBeenCalledWith(
        expect.anything(),
        fakeClient,
        VALID_ADDRESS,
        expect.anything(),
        { asset: 'USDC' },
      );

      // Claim was set to 'skip' so handles stay consumable for chaining.
      expect(claimLendingRewardsPTB).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(Array),
        expect.objectContaining({
          customCoinReceive: { type: 'skip' },
        }),
      );
    });

    it('claims a single USDC reward (skips swap, deposits directly)', async () => {
      vi.mocked(getUserAvailableLendingRewards).mockResolvedValue([
        { userClaimableReward: 0.5, rewardCoinType: USDC_TYPE, assetId: 0 },
      ] as never);
      mockClaimEmits({ [USDC_TYPE]: 1 });

      const { plan } = await buildHarvestRewardsTx(fakeClient, VALID_ADDRESS);

      expect(plan.claimed).toHaveLength(1);
      expect(plan.claimed[0]?.symbol).toBe('USDC');
      expect(plan.swaps).toEqual([]);
      expect(plan.skipped).toEqual([]);
      expect(plan.expectedUsdcDeposited).toBeCloseTo(0.5, 4);

      // No swap appended; deposit fired exactly once.
      expect(addSwapToTx).not.toHaveBeenCalled();
      expect(addSaveToTx).toHaveBeenCalledTimes(1);
    });

    it('claims mixed rewards (vSUI + USDC + NAVX): swaps non-USDC, merges, deposits once', async () => {
      vi.mocked(getUserAvailableLendingRewards).mockResolvedValue([
        { userClaimableReward: 0.0165, rewardCoinType: VSUI_TYPE, assetId: 5 },
        { userClaimableReward: 0.5, rewardCoinType: USDC_TYPE, assetId: 0 },
        { userClaimableReward: 12.4, rewardCoinType: NAVX_TYPE, assetId: 7 },
      ] as never);
      mockClaimEmits({
        [VSUI_TYPE]: 1,
        [USDC_TYPE]: 1,
        [NAVX_TYPE]: 1,
      });
      // First swap (vSUI → USDC): 0.0162; second (NAVX → USDC): 1.18.
      let swapCallIdx = 0;
      const expectedOutputs = [0.0162, 1.18];
      vi.mocked(addSwapToTx).mockImplementation(async (tx, _client, _addr, input) => ({
        coin: tx.moveCall({ target: '0x2::coin::zero', typeArguments: [USDC_TYPE] }),
        effectiveAmountIn: input.amount,
        expectedAmountOut: expectedOutputs[swapCallIdx++] ?? 0,
        route: {} as never,
      }));

      const { plan } = await buildHarvestRewardsTx(fakeClient, VALID_ADDRESS);

      expect(plan.claimed).toHaveLength(3);
      expect(plan.swaps).toHaveLength(2);
      expect(plan.swaps.map((s) => s.fromSymbol).sort()).toEqual(['NAVX', 'vSUI']);
      // Total deposited = USDC reward (0.5) + vSUI swap output (0.0162) + NAVX swap output (1.18)
      expect(plan.expectedUsdcDeposited).toBeCloseTo(0.5 + 0.0162 + 1.18, 4);

      expect(addSwapToTx).toHaveBeenCalledTimes(2);
      expect(addSaveToTx).toHaveBeenCalledTimes(1);
    });

    it('aggregates multi-pool same-coin rewards into ONE swap leg', async () => {
      vi.mocked(getUserAvailableLendingRewards).mockResolvedValue([
        { userClaimableReward: 0.01, rewardCoinType: VSUI_TYPE, assetId: 0 },
        { userClaimableReward: 0.0065, rewardCoinType: VSUI_TYPE, assetId: 5 },
      ] as never);
      // NAVI emits TWO handles for two pools (one per pool group).
      mockClaimEmits({ [VSUI_TYPE]: 2 });
      mockSwapReturns(0.0162);

      const { plan } = await buildHarvestRewardsTx(fakeClient, VALID_ADDRESS);

      // Aggregated: ONE row, ONE swap leg, the `inputAmount` is the sum.
      expect(plan.claimed).toHaveLength(1);
      expect(plan.claimed[0]?.amount).toBeCloseTo(0.0165, 6);
      expect(plan.swaps).toHaveLength(1);
      // The swap input is the post-merge full balance.
      expect(addSwapToTx).toHaveBeenCalledTimes(1);
    });
  });

  describe('skip cases (transferred to wallet, not deposited)', () => {
    it('claims an untradeable reward and transfers to wallet (skipped, no deposit)', async () => {
      vi.mocked(getUserAvailableLendingRewards).mockResolvedValue([
        { userClaimableReward: 5, rewardCoinType: UNKNOWN_TYPE, assetId: 99 },
      ] as never);
      mockClaimEmits({ [UNKNOWN_TYPE]: 1 });

      const { plan } = await buildHarvestRewardsTx(fakeClient, VALID_ADDRESS);

      expect(plan.claimed).toHaveLength(1);
      expect(plan.swaps).toEqual([]);
      expect(plan.skipped).toHaveLength(1);
      expect(plan.skipped[0]?.reason).toBe('untradeable');
      expect(plan.expectedUsdcDeposited).toBe(0);

      // No swap, no deposit — the reward is back in the wallet via tx.transferObjects.
      expect(addSwapToTx).not.toHaveBeenCalled();
      expect(addSaveToTx).not.toHaveBeenCalled();
    });

    it('skips dust rewards (priced < minRewardUsd) — transfers to wallet', async () => {
      vi.mocked(getUserAvailableLendingRewards).mockResolvedValue([
        { userClaimableReward: 0.001, rewardCoinType: VSUI_TYPE, assetId: 5 }, // 0.001 * 1.5 = $0.0015
      ] as never);
      mockClaimEmits({ [VSUI_TYPE]: 1 });
      const priceCache = new Map<string, number>([['VSUI', 1.5]]);

      const { plan } = await buildHarvestRewardsTx(fakeClient, VALID_ADDRESS, {
        priceCache,
        minRewardUsd: 0.01, // explicit floor
      });

      expect(plan.skipped).toHaveLength(1);
      expect(plan.skipped[0]?.reason).toBe('dust');
      expect(plan.swaps).toEqual([]);
      expect(plan.expectedUsdcDeposited).toBe(0);
      expect(addSwapToTx).not.toHaveBeenCalled();
      expect(addSaveToTx).not.toHaveBeenCalled();
    });

    it('does NOT skip when priceCache is missing (degrades to "swap everything")', async () => {
      vi.mocked(getUserAvailableLendingRewards).mockResolvedValue([
        { userClaimableReward: 0.001, rewardCoinType: VSUI_TYPE, assetId: 5 },
      ] as never);
      mockClaimEmits({ [VSUI_TYPE]: 1 });
      mockSwapReturns(0.0009);

      // No priceCache → dust filter is bypassed → swap fires.
      const { plan } = await buildHarvestRewardsTx(fakeClient, VALID_ADDRESS, {});

      expect(plan.skipped).toEqual([]);
      expect(plan.swaps).toHaveLength(1);
      expect(addSwapToTx).toHaveBeenCalledTimes(1);
    });

    it('skips legs with no Cetus route (transfers reward, continues)', async () => {
      vi.mocked(getUserAvailableLendingRewards).mockResolvedValue([
        { userClaimableReward: 5, rewardCoinType: VSUI_TYPE, assetId: 5 },
        { userClaimableReward: 10, rewardCoinType: NAVX_TYPE, assetId: 7 },
      ] as never);
      mockClaimEmits({
        [VSUI_TYPE]: 1,
        [NAVX_TYPE]: 1,
      });
      // First swap fails with SWAP_NO_ROUTE; second succeeds.
      let callIdx = 0;
      vi.mocked(addSwapToTx).mockImplementation(async (tx, _client, _addr, input) => {
        if (callIdx++ === 0) {
          throw new T2000Error('SWAP_NO_ROUTE', 'No swap route');
        }
        return {
          coin: tx.moveCall({ target: '0x2::coin::zero', typeArguments: [USDC_TYPE] }),
          effectiveAmountIn: input.amount,
          expectedAmountOut: 1.0,
          route: {} as never,
        };
      });

      const { plan } = await buildHarvestRewardsTx(fakeClient, VALID_ADDRESS);

      // One reward swapped, one skipped — deposit still fires for the swapped output.
      expect(plan.swaps).toHaveLength(1);
      expect(plan.skipped).toHaveLength(1);
      expect(plan.skipped[0]?.reason).toBe('no-route');
      expect(plan.expectedUsdcDeposited).toBeCloseTo(1.0, 4);
      expect(addSaveToTx).toHaveBeenCalledTimes(1);
    });

    it('all rewards skipped → no deposit, plan is non-empty (claimed > 0, deposited = 0)', async () => {
      vi.mocked(getUserAvailableLendingRewards).mockResolvedValue([
        { userClaimableReward: 5, rewardCoinType: UNKNOWN_TYPE, assetId: 99 },
      ] as never);
      mockClaimEmits({ [UNKNOWN_TYPE]: 1 });

      const { plan } = await buildHarvestRewardsTx(fakeClient, VALID_ADDRESS);

      expect(plan.claimed).toHaveLength(1);
      expect(plan.expectedUsdcDeposited).toBe(0);
      expect(addSaveToTx).not.toHaveBeenCalled();
    });
  });

  describe('failure modes', () => {
    it('throws PROTOCOL_UNAVAILABLE when NAVI rewards lookup fails', async () => {
      vi.mocked(getUserAvailableLendingRewards).mockRejectedValue(
        new Error('NAVI 503'),
      );

      await expect(buildHarvestRewardsTx(fakeClient, VALID_ADDRESS)).rejects.toMatchObject({
        code: 'PROTOCOL_UNAVAILABLE',
      });
    });

    it('throws INVALID_AMOUNT when no rewards are claimable (nothing to harvest)', async () => {
      vi.mocked(getUserAvailableLendingRewards).mockResolvedValue([]);

      await expect(buildHarvestRewardsTx(fakeClient, VALID_ADDRESS)).rejects.toMatchObject({
        code: 'INVALID_AMOUNT',
      });
    });

    it('throws PROTOCOL_UNAVAILABLE when NAVI claim PTB build fails', async () => {
      vi.mocked(getUserAvailableLendingRewards).mockResolvedValue([
        { userClaimableReward: 0.0165, rewardCoinType: VSUI_TYPE, assetId: 5 },
      ] as never);
      vi.mocked(claimLendingRewardsPTB).mockRejectedValue(
        new Error('reward fund missing'),
      );

      await expect(buildHarvestRewardsTx(fakeClient, VALID_ADDRESS)).rejects.toMatchObject({
        code: 'PROTOCOL_UNAVAILABLE',
      });
    });

    it('re-throws non-route swap errors (e.g. provider down) — does not silently degrade', async () => {
      vi.mocked(getUserAvailableLendingRewards).mockResolvedValue([
        { userClaimableReward: 5, rewardCoinType: VSUI_TYPE, assetId: 5 },
      ] as never);
      mockClaimEmits({ [VSUI_TYPE]: 1 });
      vi.mocked(addSwapToTx).mockRejectedValue(
        new T2000Error('SWAP_FAILED', 'simulated provider crash, but as a non-route error'),
      );

      // SWAP_NO_ROUTE / SWAP_FAILED are both swallowed → reward transferred,
      // continue. Per builder JSDoc: only NON-route swap failures re-throw.
      // Both SWAP_FAILED and SWAP_NO_ROUTE are in the swallow-list.
      // Test the inverse: a non-T2000 error MUST re-throw.
      vi.mocked(addSwapToTx).mockRejectedValue(new Error('unexpected RPC crash'));
      await expect(buildHarvestRewardsTx(fakeClient, VALID_ADDRESS)).rejects.toThrow();
    });

    it('throws PROTOCOL_UNAVAILABLE when the NAVI deposit step fails', async () => {
      vi.mocked(getUserAvailableLendingRewards).mockResolvedValue([
        { userClaimableReward: 0.5, rewardCoinType: USDC_TYPE, assetId: 0 },
      ] as never);
      mockClaimEmits({ [USDC_TYPE]: 1 });
      vi.mocked(addSaveToTx).mockRejectedValue(new Error('depositCoinPTB exploded'));

      await expect(buildHarvestRewardsTx(fakeClient, VALID_ADDRESS)).rejects.toMatchObject({
        code: 'PROTOCOL_UNAVAILABLE',
      });
    });
  });

  /**
   * [v1.24.2 — S.120] Fee wiring contract: harvest must charge per-leg
   * fees when the host opts in. Confirms both halves of the gap that
   * shipped in v1.24.0 (overlay fee bypassed on swap legs + save fee
   * hook bypassed on deposit). The mainnet-observed harvest on
   * 2026-05-08 settled with $0 fees because both wires were missing —
   * these tests are the regression net.
   */
  describe('fee wiring (v1.24.2)', () => {
    const FEE_WALLET = '0x' + 'b'.repeat(64);

    it('forwards overlayFee to every internal addSwapToTx call', async () => {
      vi.mocked(getUserAvailableLendingRewards).mockResolvedValue([
        { userClaimableReward: 0.0165, rewardCoinType: VSUI_TYPE, assetId: 5 },
        { userClaimableReward: 12.4, rewardCoinType: NAVX_TYPE, assetId: 7 },
      ] as never);
      mockClaimEmits({ [VSUI_TYPE]: 1, [NAVX_TYPE]: 1 });
      mockSwapReturns(0.5);

      await buildHarvestRewardsTx(fakeClient, VALID_ADDRESS, {
        overlayFee: { rate: 0.001, receiver: FEE_WALLET },
      });

      expect(addSwapToTx).toHaveBeenCalledTimes(2);
      for (const call of vi.mocked(addSwapToTx).mock.calls) {
        expect(call?.[3].overlayFee).toEqual({ rate: 0.001, receiver: FEE_WALLET });
      }
    });

    it('does NOT forward overlayFee when omitted (CLI / direct SDK path stays fee-free)', async () => {
      vi.mocked(getUserAvailableLendingRewards).mockResolvedValue([
        { userClaimableReward: 0.0165, rewardCoinType: VSUI_TYPE, assetId: 5 },
      ] as never);
      mockClaimEmits({ [VSUI_TYPE]: 1 });
      mockSwapReturns(0.0162);

      await buildHarvestRewardsTx(fakeClient, VALID_ADDRESS);

      expect(addSwapToTx).toHaveBeenCalledTimes(1);
      expect(vi.mocked(addSwapToTx).mock.calls[0]?.[3].overlayFee).toBeUndefined();
    });

    it('invokes saveFeeHook with the deposit coin handle BEFORE addSaveToTx', async () => {
      vi.mocked(getUserAvailableLendingRewards).mockResolvedValue([
        { userClaimableReward: 0.5, rewardCoinType: USDC_TYPE, assetId: 0 },
        { userClaimableReward: 0.0165, rewardCoinType: VSUI_TYPE, assetId: 5 },
      ] as never);
      mockClaimEmits({ [USDC_TYPE]: 1, [VSUI_TYPE]: 1 });
      mockSwapReturns(0.0162);

      const callOrder: string[] = [];
      vi.mocked(addSaveToTx).mockImplementation(async () => {
        callOrder.push('save');
      });
      const saveFeeHook = vi.fn().mockImplementation(() => {
        callOrder.push('feeHook');
      });

      await buildHarvestRewardsTx(fakeClient, VALID_ADDRESS, {
        saveFeeHook,
      });

      expect(saveFeeHook).toHaveBeenCalledTimes(1);
      // Deterministic ordering: hook always fires BEFORE deposit.
      expect(callOrder).toEqual(['feeHook', 'save']);

      const hookCtx = saveFeeHook.mock.calls[0]?.[0];
      expect(hookCtx).toBeDefined();
      expect(hookCtx.input.asset).toBe('USDC');
      // Total = 0.5 USDC reward + 0.0162 swap output.
      expect(hookCtx.input.amount).toBeCloseTo(0.5162, 4);
      expect(hookCtx.sender).toBe(VALID_ADDRESS);
      expect(hookCtx.coin).toBeDefined();
      expect(hookCtx.tx).toBeDefined();
    });

    it('does NOT invoke saveFeeHook when there is nothing to deposit (all skipped)', async () => {
      vi.mocked(getUserAvailableLendingRewards).mockResolvedValue([
        { userClaimableReward: 5, rewardCoinType: UNKNOWN_TYPE, assetId: 99 },
      ] as never);
      mockClaimEmits({ [UNKNOWN_TYPE]: 1 });
      const saveFeeHook = vi.fn();

      const { plan } = await buildHarvestRewardsTx(fakeClient, VALID_ADDRESS, { saveFeeHook });

      expect(plan.expectedUsdcDeposited).toBe(0);
      expect(addSaveToTx).not.toHaveBeenCalled();
      expect(saveFeeHook).not.toHaveBeenCalled();
    });

    it('does NOT invoke saveFeeHook when the hook is omitted (CLI / direct SDK path stays fee-free)', async () => {
      vi.mocked(getUserAvailableLendingRewards).mockResolvedValue([
        { userClaimableReward: 0.5, rewardCoinType: USDC_TYPE, assetId: 0 },
      ] as never);
      mockClaimEmits({ [USDC_TYPE]: 1 });

      // No saveFeeHook in options — deposit fires, no fee skim.
      await buildHarvestRewardsTx(fakeClient, VALID_ADDRESS);

      expect(addSaveToTx).toHaveBeenCalledTimes(1);
    });
  });
});
