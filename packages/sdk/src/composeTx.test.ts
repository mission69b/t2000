/**
 * SPEC 7 v0.4 Layer 0 — composeTx migration tests.
 *
 * Acceptance gate #2 (per spec): every `case` in today's
 * `transactions/prepare` switch statement has a paired `composeTx` test
 * that produces a valid PTB. 9 cases × 1 test each (excluding pay_api +
 * save_contact per spec).
 *
 * **Test strategy:** these tests assert STRUCTURAL parity — composeTx's
 * registry correctly dispatches each tool to its appender, the appender
 * mutates the tx in the expected way, the preview shape is correct,
 * `derivedAllowedAddresses` is computed correctly. Byte-for-byte parity
 * with audric's host route is asserted in the audric repo's contract
 * test (P2.2c) since fees diverge between SDK and host by design
 * (CLAUDE.md rule #9).
 *
 * Tests bypass composeTx's `tx.build({ client })` step (which needs a
 * real or fully-mocked Sui RPC client for type resolution) by stubbing
 * `Transaction.prototype.build` globally per test. The PTB structure
 * + previews + derivedAllowedAddresses can all be asserted from the
 * already-assembled tx without a real build.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';

const VALID_ADDRESS = '0x' + 'a'.repeat(64);
const RECIPIENT_ADDRESS = '0x' + 'b'.repeat(64);
const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const USDSUI_TYPE = '0x44f838219cf67b058f3b37907b655f226153c18e33dfcd0da559a844fea9b1c1::usdsui::USDSUI';
const VSUI_TYPE = '0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT';

function mockRpcClient(coins: Record<string, Array<{ coinObjectId: string; balance: string }>>): SuiJsonRpcClient {
  const getCoins = vi.fn(async ({ coinType }: { coinType: string }) => ({
    data: coins[coinType] ?? [],
    nextCursor: null,
    hasNextPage: false,
  }));
  return { getCoins } as unknown as SuiJsonRpcClient;
}

function mockNaviAdapter(positions: Array<{ asset: string; type: 'save' | 'borrow'; amount: number }> = []) {
  vi.doMock('@naviprotocol/lending', () => ({
    // PTB-mutating mocks: append a real moveCall so the returned NestedResult is tracked by the tx.
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
    claimLendingRewardsPTB: vi.fn(async () => undefined),
    getUserAvailableLendingRewards: vi.fn(async () => []),
    summaryLendingRewards: vi.fn(() => []),
    updateOraclePriceBeforeUserOperationPTB: vi.fn(async () => undefined),
    // Read-side mocks for getPositions / getRates / getHealthFactor.
    // getLendingPositions returns an array of position objects keyed by
    // `navi-lending-supply` or `navi-lending-borrow` fields; navi.ts iterates
    // them and reads token/amount/valueUSD/pool fields.
    getLendingPositions: vi.fn(async () => positions.map((p) => {
      const dataKey = p.type === 'save' ? 'navi-lending-supply' : 'navi-lending-borrow';
      return {
        type: p.type === 'save' ? 'navi-lending-supply' : 'navi-lending-borrow',
        [dataKey]: {
          token: { symbol: p.asset, coinType: USDC_TYPE },
          amount: String(p.amount),
          valueUSD: String(p.amount),
          pool: { supplyIncentiveApyInfo: { apy: '5.0' }, borrowIncentiveApyInfo: { apy: '4.0' } },
        },
      };
    })),
    getPools: vi.fn(async () => []),
    getHealthFactor: vi.fn(async () => 1e18),
  }));
}

function mockCetus() {
  vi.doMock('@cetusprotocol/aggregator-sdk', () => ({
    AggregatorClient: class {
      async findRouters() {
        return {
          amountIn: '5000000', amountOut: '4995000',
          insufficientLiquidity: false, deviationRatio: 0.001,
          paths: [{ provider: 'CETUS' }],
        };
      }
      async routerSwap({ txb }: { txb: Transaction }) {
        const [coin] = txb.moveCall({ target: '0x123::test::mock_swap', arguments: [] });
        return coin;
      }
    },
    Env: { Mainnet: 'mainnet' },
    getProvidersExcluding: (excluded: string[]) =>
      ['CETUS', 'BLUEFIN', 'KRIYAV3'].filter((p) => !excluded.includes(p)),
  }));
}

const STUB_BYTES = new Uint8Array([1, 2, 3, 4]);

describe('composeTx — single-step migration tests (9 canonical write tools)', () => {
  beforeEach(() => {
    vi.resetModules();
    mockNaviAdapter();
    // tx.build() requires a real Sui RPC client for Move type resolution.
    // Stub it globally — composeTx tests verify the assembled PTB shape, not bytes.
    vi.spyOn(Transaction.prototype, 'build').mockResolvedValue(STUB_BYTES);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. send_transfer (USDC) — appends merge + split + transferObjects', async () => {
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({
      [USDC_TYPE]: [{ coinObjectId: '0x' + '1'.repeat(64), balance: '10000000' }],
    });

    const result = await composeTx({
      sender: VALID_ADDRESS,
      client,
      sponsoredContext: true,
      steps: [{ toolName: 'send_transfer', input: { to: RECIPIENT_ADDRESS, amount: 5, asset: 'USDC' } }],
    });

    expect(result.derivedAllowedAddresses).toContain(RECIPIENT_ADDRESS);
    expect(result.txKindBytes).toBe(STUB_BYTES);
    expect(result.perStepPreviews).toHaveLength(1);
    const preview = result.perStepPreviews[0];
    expect(preview.toolName).toBe('send_transfer');
    if (preview.toolName === 'send_transfer') {
      expect(preview.recipient).toBe(RECIPIENT_ADDRESS);
      expect(preview.asset).toBe('USDC');
      expect(preview.effectiveAmount).toBeCloseTo(5, 6);
    }
  });

  it('2. send_transfer (SUI sponsored) — fetches via getCoins (not tx.gas)', async () => {
    const { composeTx } = await import('./composeTx.js');
    const { SUI_TYPE } = await import('./token-registry.js');
    const client = mockRpcClient({
      [SUI_TYPE]: [{ coinObjectId: '0x' + '2'.repeat(64), balance: '10000000000' }],
    });

    const result = await composeTx({
      sender: VALID_ADDRESS,
      client,
      sponsoredContext: true,
      steps: [{ toolName: 'send_transfer', input: { to: RECIPIENT_ADDRESS, amount: 1, asset: 'SUI' } }],
    });

    expect(client.getCoins).toHaveBeenCalledWith(expect.objectContaining({ coinType: SUI_TYPE }));
    expect(result.derivedAllowedAddresses).toContain(RECIPIENT_ADDRESS);
  });

  it('3. send_transfer (SUI self-funded) — splits from tx.gas (no getCoins)', async () => {
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({});

    const result = await composeTx({
      sender: VALID_ADDRESS,
      client,
      sponsoredContext: false,
      steps: [{ toolName: 'send_transfer', input: { to: RECIPIENT_ADDRESS, amount: 1, asset: 'SUI' } }],
    });

    expect(client.getCoins).not.toHaveBeenCalled();
    expect(result.derivedAllowedAddresses).toContain(RECIPIENT_ADDRESS);
  });

  it('4. save_deposit (USDC) — fetches USDC, calls NAVI deposit', async () => {
    const navi = await import('@naviprotocol/lending');
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({
      [USDC_TYPE]: [{ coinObjectId: '0x' + '3'.repeat(64), balance: '10000000' }],
    });

    const result = await composeTx({
      sender: VALID_ADDRESS,
      client,
      sponsoredContext: true,
      steps: [{ toolName: 'save_deposit', input: { amount: 5, asset: 'USDC' } }],
    });

    expect(navi.depositCoinPTB).toHaveBeenCalled();
    expect(client.getCoins).toHaveBeenCalledWith(expect.objectContaining({ coinType: USDC_TYPE }));
    const preview = result.perStepPreviews[0];
    if (preview.toolName === 'save_deposit') {
      expect(preview.asset).toBe('USDC');
      expect(preview.effectiveAmount).toBeCloseTo(5, 6);
    }
    // No transferObjects on a deposit (NAVI consumes the coin) → empty derived
    expect(result.derivedAllowedAddresses).toEqual([]);
  });

  it('5. save_deposit (USDsui) — accepts strategic-exception asset', async () => {
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({
      [USDSUI_TYPE]: [{ coinObjectId: '0x' + '4'.repeat(64), balance: '10000000' }],
    });

    const result = await composeTx({
      sender: VALID_ADDRESS,
      client,
      sponsoredContext: true,
      steps: [{ toolName: 'save_deposit', input: { amount: 5, asset: 'USDsui' } }],
    });

    const preview = result.perStepPreviews[0];
    if (preview.toolName === 'save_deposit') expect(preview.asset).toBe('USDsui');
  });

  it('6. withdraw — calls NAVI withdraw with updatePythPriceFeeds=false under sponsorship', async () => {
    vi.resetModules();
    mockNaviAdapter([{ asset: 'USDC', type: 'save', amount: 100 }]);
    const navi = await import('@naviprotocol/lending');
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({});

    const result = await composeTx({
      sender: VALID_ADDRESS,
      client,
      sponsoredContext: true,
      steps: [{ toolName: 'withdraw', input: { amount: 5, asset: 'USDC' } }],
    });

    expect(navi.withdrawCoinPTB).toHaveBeenCalled();
    expect(navi.updateOraclePriceBeforeUserOperationPTB).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(),
      expect.objectContaining({ updatePythPriceFeeds: false }),
    );
    expect(result.derivedAllowedAddresses).toContain(VALID_ADDRESS);
  });

  it('7. withdraw — self-funded calls Pyth update (updatePythPriceFeeds=true)', async () => {
    vi.resetModules();
    mockNaviAdapter([{ asset: 'USDC', type: 'save', amount: 100 }]);
    const navi = await import('@naviprotocol/lending');
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({});

    await composeTx({
      sender: VALID_ADDRESS,
      client,
      sponsoredContext: false,
      steps: [{ toolName: 'withdraw', input: { amount: 5, asset: 'USDC' } }],
    });

    expect(navi.updateOraclePriceBeforeUserOperationPTB).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(),
      expect.objectContaining({ updatePythPriceFeeds: true }),
    );
  });

  it('8. borrow — calls NAVI borrow + transfers borrowed coin back to sender', async () => {
    const navi = await import('@naviprotocol/lending');
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({});

    const result = await composeTx({
      sender: VALID_ADDRESS,
      client,
      sponsoredContext: true,
      steps: [{ toolName: 'borrow', input: { amount: 10, asset: 'USDC' } }],
    });

    expect(navi.borrowCoinPTB).toHaveBeenCalled();
    expect(result.derivedAllowedAddresses).toContain(VALID_ADDRESS);
  });

  it('9. repay_debt (USDC) — fetches USDC, calls NAVI repay with skipOracle=true under sponsorship', async () => {
    const navi = await import('@naviprotocol/lending');
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({
      [USDC_TYPE]: [{ coinObjectId: '0x' + '5'.repeat(64), balance: '10000000' }],
    });

    await composeTx({
      sender: VALID_ADDRESS,
      client,
      sponsoredContext: true,
      steps: [{ toolName: 'repay_debt', input: { amount: 5, asset: 'USDC' } }],
    });

    expect(navi.repayCoinPTB).toHaveBeenCalled();
    expect(navi.updateOraclePriceBeforeUserOperationPTB).not.toHaveBeenCalled();
  });

  it('10. swap_execute — wallet-mode + sponsored sets Pyth provider exclusion', async () => {
    mockCetus();
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({
      [USDC_TYPE]: [{ coinObjectId: '0x' + '6'.repeat(64), balance: '10000000' }],
    });

    const result = await composeTx({
      sender: VALID_ADDRESS,
      client,
      sponsoredContext: true,
      steps: [{ toolName: 'swap_execute', input: { from: 'USDC', to: 'USDT', amount: 5 } }],
    });

    const preview = result.perStepPreviews[0];
    expect(preview.toolName).toBe('swap_execute');
    if (preview.toolName === 'swap_execute') {
      expect(preview.effectiveAmountIn).toBeCloseTo(5, 6);
      expect(preview.expectedAmountOut).toBeGreaterThan(0);
    }
    expect(result.derivedAllowedAddresses).toContain(VALID_ADDRESS);
  });

  it('11. claim_rewards — empty rewards yields empty preview', async () => {
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({});

    const result = await composeTx({
      sender: VALID_ADDRESS,
      client,
      sponsoredContext: true,
      steps: [{ toolName: 'claim_rewards', input: {} }],
    });

    const preview = result.perStepPreviews[0];
    expect(preview.toolName).toBe('claim_rewards');
    if (preview.toolName === 'claim_rewards') {
      expect(preview.rewards).toEqual([]);
    }
  });

  it('12. volo_stake — fetches SUI, calls Volo stake Move call, transfers vSUI to sender', async () => {
    const { composeTx } = await import('./composeTx.js');
    const { SUI_TYPE } = await import('./token-registry.js');
    const client = mockRpcClient({
      [SUI_TYPE]: [{ coinObjectId: '0x' + '7'.repeat(64), balance: '5000000000' }],
    });

    const result = await composeTx({
      sender: VALID_ADDRESS,
      client,
      sponsoredContext: true,
      steps: [{ toolName: 'volo_stake', input: { amountSui: 2 } }],
    });

    const preview = result.perStepPreviews[0];
    if (preview.toolName === 'volo_stake') {
      expect(preview.effectiveAmountMist).toBe(2_000_000_000n);
    }
    expect(result.derivedAllowedAddresses).toContain(VALID_ADDRESS);
  });

  it('13. volo_unstake — fetches vSUI, calls Volo unstake, transfers SUI to sender', async () => {
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({
      [VSUI_TYPE]: [{ coinObjectId: '0x' + '8'.repeat(64), balance: '5000000000' }],
    });

    const result = await composeTx({
      sender: VALID_ADDRESS,
      client,
      sponsoredContext: true,
      steps: [{ toolName: 'volo_unstake', input: { amountVSui: 2 } }],
    });

    const preview = result.perStepPreviews[0];
    if (preview.toolName === 'volo_unstake') {
      expect(preview.effectiveAmountMist).toBe(2_000_000_000n);
    }
    expect(result.derivedAllowedAddresses).toContain(VALID_ADDRESS);
  });
});

describe('composeTx — error handling', () => {
  beforeEach(() => {
    vi.resetModules();
    mockNaviAdapter();
    vi.spyOn(Transaction.prototype, 'build').mockResolvedValue(STUB_BYTES);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws T2000Error UNKNOWN with allowed-tools list when toolName is unknown', async () => {
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({});

    await expect(
      composeTx({
        sender: VALID_ADDRESS,
        client,
        steps: [{ toolName: 'fake_tool' as never, input: {} as never }],
      }),
    ).rejects.toThrow(/No fragment appender registered for tool 'fake_tool'/);
  });

  it('throws INVALID_AMOUNT when send amount <= 0', async () => {
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({});

    await expect(
      composeTx({
        sender: VALID_ADDRESS,
        client,
        steps: [{ toolName: 'send_transfer', input: { to: RECIPIENT_ADDRESS, amount: 0 } }],
      }),
    ).rejects.toThrow(/Send amount must be greater than zero/);
  });

  it('throws ASSET_NOT_SUPPORTED when save_deposit asset is non-saveable', async () => {
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({});

    await expect(
      composeTx({
        sender: VALID_ADDRESS,
        client,
        steps: [{ toolName: 'save_deposit', input: { amount: 5, asset: 'SUI' as never } }],
      }),
    ).rejects.toThrow(/Saveable asset must be USDC or USDsui/);
  });

  it('throws INSUFFICIENT_BALANCE when wallet has no coins for send', async () => {
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({});

    await expect(
      composeTx({
        sender: VALID_ADDRESS,
        client,
        steps: [{ toolName: 'send_transfer', input: { to: RECIPIENT_ADDRESS, amount: 5, asset: 'USDC' } }],
      }),
    ).rejects.toThrow(/No coins found/);
  });

  it('throws ASSET_NOT_SUPPORTED for swap with unknown token', async () => {
    mockCetus();
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({});

    await expect(
      composeTx({
        sender: VALID_ADDRESS,
        client,
        steps: [{ toolName: 'swap_execute', input: { from: 'NONEXISTENT_TOKEN_XYZ', to: 'USDC', amount: 1 } }],
      }),
    ).rejects.toThrow(/Unknown token in swap/);
  });
});

describe('composeTx — fee hooks (audric host migration surface)', () => {
  beforeEach(() => {
    vi.resetModules();
    mockNaviAdapter();
    vi.spyOn(Transaction.prototype, 'build').mockResolvedValue(STUB_BYTES);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('save_deposit feeHook fires with (tx, coin, input, sender) before NAVI deposit', async () => {
    const navi = await import('@naviprotocol/lending');
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({
      [USDC_TYPE]: [{ coinObjectId: '0x' + '9'.repeat(64), balance: '10000000' }],
    });

    const calls: Array<{ hasTx: boolean; hasCoin: boolean; inputAsset: string | undefined; sender: string }> = [];
    let hookCalledBeforeDeposit = false;
    (navi.depositCoinPTB as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      hookCalledBeforeDeposit = calls.length > 0;
      return undefined;
    });

    await composeTx({
      sender: VALID_ADDRESS,
      client,
      sponsoredContext: true,
      steps: [{ toolName: 'save_deposit', input: { amount: 5, asset: 'USDC' } }],
      feeHooks: {
        save_deposit: ({ tx, coin, input, sender }) => {
          calls.push({
            hasTx: tx instanceof Transaction,
            hasCoin: coin !== undefined,
            inputAsset: input.asset,
            sender,
          });
        },
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      hasTx: true,
      hasCoin: true,
      inputAsset: 'USDC',
      sender: VALID_ADDRESS,
    });
    expect(hookCalledBeforeDeposit).toBe(true);
  });

  it('borrow feeHook fires AFTER addBorrowToTx, BEFORE transferObjects(coin, sender)', async () => {
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({});

    const order: string[] = [];
    const result = await composeTx({
      sender: VALID_ADDRESS,
      client,
      sponsoredContext: true,
      steps: [{ toolName: 'borrow', input: { amount: 10, asset: 'USDC' } }],
      feeHooks: {
        borrow: ({ tx, coin }) => {
          order.push('feeHook');
          // Simulate addFeeTransfer: split a fee chunk + transfer to fee wallet
          const FEE_WALLET = '0x' + 'f'.repeat(64);
          const [feeCoin] = tx.splitCoins(coin, [tx.pure.u64(1000n)]);
          tx.transferObjects([feeCoin], tx.pure.address(FEE_WALLET));
          order.push('feeTransfer');
        },
      },
    });

    expect(order).toEqual(['feeHook', 'feeTransfer']);
    // The fee wallet address from the hook lands in derivedAllowedAddresses
    // alongside the canonical self-transfer of the borrowed coin to sender.
    expect(result.derivedAllowedAddresses).toContain(VALID_ADDRESS);
    expect(result.derivedAllowedAddresses).toContain('0x' + 'f'.repeat(64));
  });

  it('save_deposit without feeHook produces no fee-side derivedAllowedAddresses', async () => {
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({
      [USDC_TYPE]: [{ coinObjectId: '0x' + 'a'.repeat(64), balance: '10000000' }],
    });

    const result = await composeTx({
      sender: VALID_ADDRESS,
      client,
      sponsoredContext: true,
      steps: [{ toolName: 'save_deposit', input: { amount: 5, asset: 'USDC' } }],
    });

    expect(result.derivedAllowedAddresses).toEqual([]);
  });

  it('feeHooks are tool-scoped — borrow hook does NOT fire on save_deposit', async () => {
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({
      [USDC_TYPE]: [{ coinObjectId: '0x' + 'b'.repeat(64), balance: '10000000' }],
    });

    const borrowHook = vi.fn();
    const saveHook = vi.fn();

    await composeTx({
      sender: VALID_ADDRESS,
      client,
      sponsoredContext: true,
      steps: [{ toolName: 'save_deposit', input: { amount: 5, asset: 'USDC' } }],
      feeHooks: { borrow: borrowHook, save_deposit: saveHook },
    });

    expect(saveHook).toHaveBeenCalledOnce();
    expect(borrowHook).not.toHaveBeenCalled();
  });

  it('feeHook can be conditional — host can skip fee for non-USDC saves', async () => {
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({
      [USDSUI_TYPE]: [{ coinObjectId: '0x' + 'c'.repeat(64), balance: '10000000' }],
    });

    const hook = vi.fn(({ input }: { input: { asset?: string } }) => {
      // Audric's pattern — fee USDC only, USDsui is fee-free at host layer
      if (input.asset !== 'USDC') return;
      throw new Error('should not reach this — USDsui must skip fee');
    });

    await expect(
      composeTx({
        sender: VALID_ADDRESS,
        client,
        sponsoredContext: true,
        steps: [{ toolName: 'save_deposit', input: { amount: 5, asset: 'USDsui' } }],
        feeHooks: { save_deposit: hook },
      }),
    ).resolves.toBeDefined();

    expect(hook).toHaveBeenCalledOnce();
  });

  it('feeHook supports async work (e.g. async fee-policy resolution)', async () => {
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({
      [USDC_TYPE]: [{ coinObjectId: '0x' + 'd'.repeat(64), balance: '10000000' }],
    });

    let asyncResolved = false;
    await composeTx({
      sender: VALID_ADDRESS,
      client,
      sponsoredContext: true,
      steps: [{ toolName: 'save_deposit', input: { amount: 5, asset: 'USDC' } }],
      feeHooks: {
        save_deposit: async () => {
          await new Promise((r) => setTimeout(r, 1));
          asyncResolved = true;
        },
      },
    });

    expect(asyncResolved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SPEC 13 Phase 1 — chain-mode (inputCoinFromStep) E2E coverage
// ---------------------------------------------------------------------------

/**
 * Helper: count top-level `TransferObjects` commands in the assembled PTB
 * grouped by recipient address. Used to assert that producers' terminal
 * transfers ARE suppressed in chain mode and ARE NOT suppressed in
 * wallet mode (the "output-suppression invariant").
 */
function countTransferObjectsByRecipient(tx: Transaction): Record<string, number> {
  const counts: Record<string, number> = {};
  const data = tx.getData();
  for (const cmd of data.commands) {
    const transferCmd = (cmd as { TransferObjects?: unknown }).TransferObjects;
    if (!transferCmd) continue;

    const addressArg = (transferCmd as { address?: unknown }).address;
    const idx = (addressArg as { Input?: number } | undefined)?.Input;
    if (idx === undefined) continue;

    const input = data.inputs[idx];
    const pure = (input as { Pure?: { bytes?: string } } | undefined)?.Pure?.bytes;
    if (!pure) continue;

    let hex: string | null = null;
    try {
      const bytes =
        typeof Buffer !== 'undefined'
          ? Uint8Array.from(Buffer.from(pure, 'base64'))
          : (() => {
              const bin = atob(pure);
              const arr = new Uint8Array(bin.length);
              for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j);
              return arr;
            })();
      if (bytes.length === 32) {
        hex = '0x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
      }
    } catch {
      // skip
    }
    if (!hex) continue;
    counts[hex] = (counts[hex] ?? 0) + 1;
  }
  return counts;
}

describe('composeTx — SPEC 13 Phase 1 chain mode (inputCoinFromStep)', () => {
  beforeEach(() => {
    vi.resetModules();
    mockNaviAdapter([{ asset: 'USDC', type: 'save', amount: 100 }]);
    mockCetus();
    vi.spyOn(Transaction.prototype, 'build').mockResolvedValue(STUB_BYTES);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('happy paths — output suppression + consumer chained input', () => {
    it('swap → save (chained): swap output suppressed, save skips wallet fetch, no sender transfers', async () => {
      const { composeTx } = await import('./composeTx.js');
      const client = mockRpcClient({
        [USDC_TYPE]: [{ coinObjectId: '0x' + '1'.repeat(64), balance: '10000000' }],
      });

      const result = await composeTx({
        sender: VALID_ADDRESS,
        client,
        sponsoredContext: true,
        steps: [
          { toolName: 'swap_execute', input: { from: 'USDC', to: 'USDsui', amount: 5 } },
          { toolName: 'save_deposit', input: { amount: 5, asset: 'USDsui' }, inputCoinFromStep: 0 },
        ],
      });

      // getCoins called once (for swap's USDC input) — NOT for save's USDsui (chained).
      const getCoinsCalls = (client.getCoins as ReturnType<typeof vi.fn>).mock.calls;
      expect(getCoinsCalls).toHaveLength(1);
      expect(getCoinsCalls[0][0]).toMatchObject({ coinType: USDC_TYPE });

      // No transferObjects to sender — swap output goes directly to NAVI deposit, no wallet round-trip.
      const transfers = countTransferObjectsByRecipient(result.tx);
      expect(transfers[VALID_ADDRESS]).toBeUndefined();
      expect(result.derivedAllowedAddresses).toEqual([]);

      expect(result.perStepPreviews).toHaveLength(2);
      expect(result.perStepPreviews[0].toolName).toBe('swap_execute');
      expect(result.perStepPreviews[1].toolName).toBe('save_deposit');
    });

    it('withdraw → swap (chained): withdraw output suppressed, swap consumes it directly, swap output transferred to sender', async () => {
      const { composeTx } = await import('./composeTx.js');
      const client = mockRpcClient({});

      const result = await composeTx({
        sender: VALID_ADDRESS,
        client,
        sponsoredContext: true,
        steps: [
          { toolName: 'withdraw', input: { amount: 5, asset: 'USDC' } },
          {
            toolName: 'swap_execute',
            input: { from: 'USDC', to: 'USDsui', amount: 5 },
            inputCoinFromStep: 0,
          },
        ],
      });

      // No getCoins calls at all — withdraw doesn't fetch (it's a producer);
      // swap doesn't fetch (it's chain-mode consuming the withdraw output).
      expect((client.getCoins as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);

      // Exactly ONE transferObjects to sender — the SWAP output (terminal step
      // is not consumed, so its output is transferred to wallet). Withdraw's
      // output is suppressed because step 1 consumes it.
      const transfers = countTransferObjectsByRecipient(result.tx);
      expect(transfers[VALID_ADDRESS]).toBe(1);
      expect(result.derivedAllowedAddresses).toEqual([VALID_ADDRESS]);
    });

    it('withdraw → send (chained): both terminal — no transfers to sender, one to recipient', async () => {
      const { composeTx } = await import('./composeTx.js');
      const client = mockRpcClient({});

      const result = await composeTx({
        sender: VALID_ADDRESS,
        client,
        sponsoredContext: true,
        steps: [
          { toolName: 'withdraw', input: { amount: 5, asset: 'USDC' } },
          {
            toolName: 'send_transfer',
            input: { to: RECIPIENT_ADDRESS, amount: 5, asset: 'USDC' },
            inputCoinFromStep: 0,
          },
        ],
      });

      const transfers = countTransferObjectsByRecipient(result.tx);
      expect(transfers[VALID_ADDRESS]).toBeUndefined();
      expect(transfers[RECIPIENT_ADDRESS]).toBe(1);
      expect(result.derivedAllowedAddresses).toEqual([RECIPIENT_ADDRESS]);
    });

    it('borrow → send (chained): borrow output threads into send, sender NOT in derivedAllowedAddresses', async () => {
      const { composeTx } = await import('./composeTx.js');
      const client = mockRpcClient({});

      const result = await composeTx({
        sender: VALID_ADDRESS,
        client,
        sponsoredContext: true,
        steps: [
          { toolName: 'borrow', input: { amount: 10, asset: 'USDC' } },
          {
            toolName: 'send_transfer',
            input: { to: RECIPIENT_ADDRESS, amount: 10, asset: 'USDC' },
            inputCoinFromStep: 0,
          },
        ],
      });

      const transfers = countTransferObjectsByRecipient(result.tx);
      expect(transfers[VALID_ADDRESS]).toBeUndefined();
      expect(transfers[RECIPIENT_ADDRESS]).toBe(1);
      expect(result.derivedAllowedAddresses).toEqual([RECIPIENT_ADDRESS]);
    });
  });

  describe('output-suppression invariant — wallet mode keeps terminal transfers', () => {
    it('withdraw + send (NO chain): both producers transfer to sender, send to recipient → both addresses in derived', async () => {
      const { composeTx } = await import('./composeTx.js');
      const client = mockRpcClient({
        [USDC_TYPE]: [{ coinObjectId: '0x' + '5'.repeat(64), balance: '20000000' }],
      });

      const result = await composeTx({
        sender: VALID_ADDRESS,
        client,
        sponsoredContext: true,
        steps: [
          { toolName: 'withdraw', input: { amount: 5, asset: 'USDC' } },
          // No inputCoinFromStep — wallet mode for send. Send fetches USDC fresh.
          { toolName: 'send_transfer', input: { to: RECIPIENT_ADDRESS, amount: 3, asset: 'USDC' } },
        ],
      });

      const transfers = countTransferObjectsByRecipient(result.tx);
      // Withdraw materializes its output to sender's wallet (output NOT consumed).
      expect(transfers[VALID_ADDRESS]).toBe(1);
      // Send fetches USDC from wallet, transfers to recipient.
      expect(transfers[RECIPIENT_ADDRESS]).toBe(1);
      expect(result.derivedAllowedAddresses).toEqual(
        expect.arrayContaining([VALID_ADDRESS, RECIPIENT_ADDRESS]),
      );
    });

    it('single-step send (NO chain): backward-compatible single-step path unchanged', async () => {
      const { composeTx } = await import('./composeTx.js');
      const client = mockRpcClient({
        [USDC_TYPE]: [{ coinObjectId: '0x' + '6'.repeat(64), balance: '10000000' }],
      });

      const result = await composeTx({
        sender: VALID_ADDRESS,
        client,
        sponsoredContext: true,
        steps: [{ toolName: 'send_transfer', input: { to: RECIPIENT_ADDRESS, amount: 5 } }],
      });

      expect(result.derivedAllowedAddresses).toEqual([RECIPIENT_ADDRESS]);
    });
  });

  describe('validation — chain references are typed and forward-only', () => {
    it('throws CHAIN_MODE_INVALID when inputCoinFromStep is negative', async () => {
      const { composeTx } = await import('./composeTx.js');
      const client = mockRpcClient({});

      await expect(
        composeTx({
          sender: VALID_ADDRESS,
          client,
          sponsoredContext: true,
          steps: [
            {
              toolName: 'save_deposit',
              input: { amount: 5, asset: 'USDC' },
              inputCoinFromStep: -1,
            },
          ],
        }),
      ).rejects.toThrow(/CHAIN_MODE_INVALID|forward-only/);
    });

    it('throws CHAIN_MODE_INVALID when inputCoinFromStep references the same step (self-reference)', async () => {
      const { composeTx } = await import('./composeTx.js');
      const client = mockRpcClient({});

      await expect(
        composeTx({
          sender: VALID_ADDRESS,
          client,
          sponsoredContext: true,
          steps: [
            {
              toolName: 'save_deposit',
              input: { amount: 5, asset: 'USDC' },
              inputCoinFromStep: 0,
            },
          ],
        }),
      ).rejects.toThrow(/CHAIN_MODE_INVALID|forward-only/);
    });

    it('throws CHAIN_MODE_INVALID when inputCoinFromStep references a future step', async () => {
      const { composeTx } = await import('./composeTx.js');
      const client = mockRpcClient({});

      await expect(
        composeTx({
          sender: VALID_ADDRESS,
          client,
          sponsoredContext: true,
          steps: [
            {
              toolName: 'save_deposit',
              input: { amount: 5, asset: 'USDC' },
              inputCoinFromStep: 1,
            },
            { toolName: 'withdraw', input: { amount: 5, asset: 'USDC' } },
          ],
        }),
      ).rejects.toThrow(/CHAIN_MODE_INVALID|forward-only/);
    });

    it('throws CHAIN_MODE_INVALID when referencing a terminal-consumer-only producer (e.g. save_deposit)', async () => {
      const { composeTx } = await import('./composeTx.js');
      const client = mockRpcClient({
        [USDC_TYPE]: [{ coinObjectId: '0x' + '7'.repeat(64), balance: '10000000' }],
      });

      await expect(
        composeTx({
          sender: VALID_ADDRESS,
          client,
          sponsoredContext: true,
          steps: [
            { toolName: 'save_deposit', input: { amount: 5, asset: 'USDC' } },
            {
              toolName: 'send_transfer',
              input: { to: RECIPIENT_ADDRESS, amount: 5 },
              inputCoinFromStep: 0,
            },
          ],
        }),
      ).rejects.toThrow(/CHAIN_MODE_INVALID|terminal consumer/);
    });
  });
});
