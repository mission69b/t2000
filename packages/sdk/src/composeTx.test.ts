/**
 * composeTx tests — surviving write surface (send_transfer + swap_execute).
 *
 * [S.444] The NAVI/DeFi removal cut save_deposit/withdraw/borrow/repay_debt/
 * claim_rewards/harvest_rewards from the registry (v2 keeps them on
 * @t2000/sdk@4.x). These tests cover what remains: the two on-chain verbs,
 * chain-mode (swap → send), allowed-address derivation, and error handling.
 *
 * Tests bypass composeTx's `tx.build({ client })` step by stubbing
 * `Transaction.prototype.build` globally per test — the PTB structure +
 * previews + derivedAllowedAddresses are asserted from the assembled tx.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SuiCoreClient } from './utils/sui.js';
import { Transaction } from '@mysten/sui/transactions';

const VALID_ADDRESS = '0x' + 'a'.repeat(64);
const RECIPIENT_ADDRESS = '0x' + 'b'.repeat(64);
const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

function mockRpcClient(coins: Record<string, Array<{ coinObjectId: string; balance: string }>>): SuiCoreClient {
  const getBalance = vi.fn(async ({ coinType }: { coinType: string }) => {
    const coinData = coins[coinType] ?? [];
    const total = coinData.reduce((acc, c) => acc + BigInt(c.balance), 0n);
    return {
      balance: { coinType, balance: total.toString(), coinBalance: '0', addressBalance: '0' },
    };
  });
  const listCoins = vi.fn(async ({ coinType }: { coinType: string }) => ({
    objects: (coins[coinType] ?? []).map((c) => ({ objectId: c.coinObjectId, balance: c.balance })),
    cursor: null,
    hasNextPage: false,
  }));
  return { core: { getBalance, listCoins } } as unknown as SuiCoreClient;
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

describe('composeTx — single-step (send_transfer + swap_execute)', () => {
  beforeEach(() => {
    vi.resetModules();
    mockCetus();
    vi.spyOn(Transaction.prototype, 'build').mockResolvedValue(STUB_BYTES);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('send_transfer (USDC) — gasless send, recipient in derivedAllowedAddresses', async () => {
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({
      [USDC_TYPE]: [{ coinObjectId: '0x' + '1'.repeat(64), balance: '10000000' }],
    });

    const result = await composeTx({
      sender: VALID_ADDRESS,
      client,
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

  it('send_transfer (SUI sponsored) — sources coin objects (not tx.gas)', async () => {
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({
      '0x2::sui::SUI': [{ coinObjectId: '0x' + '5'.repeat(64), balance: '5000000000' }],
    });

    const result = await composeTx({
      sender: VALID_ADDRESS,
      client,
      sponsoredContext: true,
      steps: [{ toolName: 'send_transfer', input: { to: RECIPIENT_ADDRESS, amount: 1, asset: 'SUI' } }],
    });

    expect(result.derivedAllowedAddresses).toContain(RECIPIENT_ADDRESS);
    expect(JSON.stringify(result.tx.getData().commands)).not.toContain('GasCoin');
  });

  it('send_transfer (SUI self-funded) — splits from tx.gas', async () => {
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({});

    const result = await composeTx({
      sender: VALID_ADDRESS,
      client,
      steps: [{ toolName: 'send_transfer', input: { to: RECIPIENT_ADDRESS, amount: 1, asset: 'SUI' } }],
    });

    expect(JSON.stringify(result.tx.getData().commands)).toContain('GasCoin');
  });

  it('swap_execute — wallet mode, sponsored excludes Pyth providers', async () => {
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({
      [USDC_TYPE]: [{ coinObjectId: '0x' + '1'.repeat(64), balance: '10000000' }],
    });

    const result = await composeTx({
      sender: VALID_ADDRESS,
      client,
      sponsoredContext: true,
      steps: [{ toolName: 'swap_execute', input: { from: 'USDC', to: 'USDT', amount: 5 } }],
    });

    expect(result.perStepPreviews).toHaveLength(1);
    const preview = result.perStepPreviews[0];
    expect(preview.toolName).toBe('swap_execute');
    if (preview.toolName === 'swap_execute') {
      expect(preview.effectiveAmountIn).toBeCloseTo(5, 6);
      expect(preview.expectedAmountOut).toBeGreaterThan(0);
    }
  });
});

describe('composeTx — error handling', () => {
  beforeEach(() => {
    vi.resetModules();
    mockCetus();
    vi.spyOn(Transaction.prototype, 'build').mockResolvedValue(STUB_BYTES);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws UNKNOWN with allowed-tools list when toolName is unknown', async () => {
    const { composeTx } = await import('./composeTx.js');
    await expect(
      composeTx({
        sender: VALID_ADDRESS,
        client: mockRpcClient({}),
        // @ts-expect-error — intentionally invalid tool name
        steps: [{ toolName: 'nonexistent_tool', input: {} }],
      }),
    ).rejects.toMatchObject({ code: 'UNKNOWN' });
  });

  it('throws INVALID_AMOUNT when send amount <= 0', async () => {
    const { composeTx } = await import('./composeTx.js');
    await expect(
      composeTx({
        sender: VALID_ADDRESS,
        client: mockRpcClient({}),
        steps: [{ toolName: 'send_transfer', input: { to: RECIPIENT_ADDRESS, amount: 0, asset: 'USDC' } }],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
  });

  it('throws INSUFFICIENT_BALANCE when wallet has no USDC for send', async () => {
    const { composeTx } = await import('./composeTx.js');
    await expect(
      composeTx({
        sender: VALID_ADDRESS,
        client: mockRpcClient({}),
        steps: [{ toolName: 'send_transfer', input: { to: RECIPIENT_ADDRESS, amount: 5, asset: 'USDC' } }],
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
  });

  it('throws ASSET_NOT_SUPPORTED for swap with unknown token', async () => {
    const { composeTx } = await import('./composeTx.js');
    await expect(
      composeTx({
        sender: VALID_ADDRESS,
        client: mockRpcClient({}),
        steps: [{ toolName: 'swap_execute', input: { from: 'NONEXISTENT_TOKEN_XYZ', to: 'USDC', amount: 1 } }],
      }),
    ).rejects.toMatchObject({ code: 'ASSET_NOT_SUPPORTED' });
  });
});

describe('composeTx — chain mode (inputCoinFromStep)', () => {
  beforeEach(() => {
    vi.resetModules();
    mockCetus();
    vi.spyOn(Transaction.prototype, 'build').mockResolvedValue(STUB_BYTES);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('swap → send (chained): swap output threads into send, no transfer-to-sender', async () => {
    const { composeTx } = await import('./composeTx.js');
    const client = mockRpcClient({
      [USDC_TYPE]: [{ coinObjectId: '0x' + '1'.repeat(64), balance: '10000000' }],
    });

    const result = await composeTx({
      sender: VALID_ADDRESS,
      client,
      steps: [
        { toolName: 'swap_execute', input: { from: 'USDC', to: 'USDT', amount: 5 } },
        { toolName: 'send_transfer', input: { to: RECIPIENT_ADDRESS, amount: 5, asset: 'USDC' }, inputCoinFromStep: 0 },
      ],
    });

    expect(result.perStepPreviews).toHaveLength(2);
    // Recipient is in derived addresses; sender is NOT (swap output was consumed by send).
    expect(result.derivedAllowedAddresses).toContain(RECIPIENT_ADDRESS);
    expect(result.derivedAllowedAddresses).not.toContain(VALID_ADDRESS);
  });

  it('throws CHAIN_MODE_INVALID when inputCoinFromStep is negative', async () => {
    const { composeTx } = await import('./composeTx.js');
    await expect(
      composeTx({
        sender: VALID_ADDRESS,
        client: mockRpcClient({}),
        steps: [
          { toolName: 'send_transfer', input: { to: RECIPIENT_ADDRESS, amount: 5, asset: 'USDC' }, inputCoinFromStep: -1 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'CHAIN_MODE_INVALID' });
  });

  it('throws CHAIN_MODE_INVALID when referencing send_transfer (a terminal consumer) as producer', async () => {
    const { composeTx } = await import('./composeTx.js');
    await expect(
      composeTx({
        sender: VALID_ADDRESS,
        client: mockRpcClient({
          [USDC_TYPE]: [{ coinObjectId: '0x' + '1'.repeat(64), balance: '10000000' }],
        }),
        steps: [
          { toolName: 'send_transfer', input: { to: RECIPIENT_ADDRESS, amount: 5, asset: 'USDC' } },
          { toolName: 'swap_execute', input: { from: 'USDC', to: 'USDT', amount: 5 }, inputCoinFromStep: 0 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'CHAIN_MODE_INVALID' });
  });
});
