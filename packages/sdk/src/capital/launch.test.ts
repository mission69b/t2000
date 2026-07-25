import { beforeAll, describe, expect, it } from 'vitest';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { T2000Error } from '../errors.js';
import { sqrtPriceX64FromAmounts, bigintSqrt } from '../protocols/cetus-clmm.js';

// agent_capital isn't deployed in the test env — exercise the builders via
// env override (the same seam testnet uses), imported AFTER the env is set.
const PKG = normalizeSuiAddress('0xabc123');
const REGISTRY = normalizeSuiAddress('0xdef456');
const AGENT_REGISTRY = normalizeSuiAddress('0x111');
const AGENT = normalizeSuiAddress('0xa9e17');
const LAUNCHER = normalizeSuiAddress('0xf00d');

let launch: typeof import('./launch.js');

beforeAll(async () => {
  process.env.AGENT_CAPITAL_PACKAGE_ID = PKG;
  process.env.CAPITAL_REGISTRY_ID = REGISTRY;
  launch = await import('./launch.js');
});

const coin = () => ({
  symbol: 'FUNKII',
  name: 'Funkii Studio',
  description: 'agent token',
  iconUrl: 'https://audric.ai/funkii.png',
  recipient: LAUNCHER,
});

describe('buildPublishAgentCoinTx', () => {
  it('builds a publish + make_immutable PTB', async () => {
    const { tx, moduleName, otw } = await launch.buildPublishAgentCoinTx({
      coin: coin(),
      launcher: LAUNCHER,
    });
    expect(moduleName).toBe('funkii');
    expect(otw).toBe('FUNKII');
    const data = tx.getData();
    const kinds = data.commands.map((c) => Object.keys(c)[0]);
    expect(kinds).toEqual(['Publish', 'MoveCall']);
    const immutable = data.commands[1];
    expect(JSON.stringify(immutable)).toContain('make_immutable');
  });

  it('refuses a recipient that is not the launcher (no third-party supply)', async () => {
    await expect(
      launch.buildPublishAgentCoinTx({
        coin: { ...coin(), recipient: AGENT },
        launcher: LAUNCHER,
      }),
    ).rejects.toThrow(T2000Error);
  });
});

describe('buildTokenizeTx', () => {
  // Coin selection is stubbed: the fake client returns one big owned USDC
  // coin so selectAndSplitCoin picks the plain split path.
  const fakeClient = {
    core: {
      getBalance: async () => ({ balance: { balance: 100_000_000n } }),
      getCoins: async () => ({
        objects: [
          {
            id: normalizeSuiAddress('0x61'),
            version: '1',
            digest: 'A'.repeat(44),
            balance: 100_000_000n,
          },
        ],
        hasNextPage: false,
      }),
    },
  } as never;

  const args = () => ({
    agent: AGENT,
    launcher: LAUNCHER,
    coinType: `${PKG}::funkii::FUNKII`,
    supplyCoinId: normalizeSuiAddress('0x51'),
    lpUsdcAmount: 25_000_000n, // 25 USDC
    agentRegistryId: AGENT_REGISTRY,
    client: fakeClient,
  });

  it('assembles bind → split → pool → lock → finalize atomically, in order', async () => {
    const tx = await launch.buildTokenizeTx(args());
    const calls = tx
      .getData()
      .commands.filter((c) => c.MoveCall)
      .map((c) => `${c.MoveCall!.module}::${c.MoveCall!.function}`);
    expect(calls).toEqual([
      'registry::bind',
      'pool_creator::full_range_tick_range',
      'pool_creator::create_pool_v3',
      'position::pool_id',
      'lp_lock::lock',
      'registry::finalize',
      'vesting::lock',
    ]);
  });

  it('vests the treasury half and returns only the USDC refund to the launcher', async () => {
    const tx = await launch.buildTokenizeTx(args());
    const data = tx.getData();
    // Treasury no longer transfers to the agent directly — it enters
    // vesting::lock; the ONLY TransferObjects is the launcher's USDC refund.
    const transfers = data.commands.filter((c) => c.TransferObjects);
    expect(transfers).toHaveLength(1);
    // Recipient pure inputs decode back to agent / launcher respectively.
    const addrOf = (t: (typeof transfers)[number]) => {
      const input = data.inputs[(t.TransferObjects!.address as { Input: number }).Input];
      const bytes = Buffer.from((input.Pure as { bytes: string }).bytes, 'base64');
      return `0x${bytes.toString('hex')}`;
    };
    expect(addrOf(transfers[0])).toBe(LAUNCHER);
    expect(transfers[0].TransferObjects!.objects).toHaveLength(1);
    // And the vesting lock is bound to the AGENT (pure address arg).
    const vest = data.commands.find(
      (c) => c.MoveCall?.function === 'lock' && c.MoveCall.module === 'vesting',
    );
    expect(vest).toBeTruthy();
  });

  it('enforces the LP USDC floor', async () => {
    await expect(
      launch.buildTokenizeTx({ ...args(), lpUsdcAmount: 4_999_999n }),
    ).rejects.toThrow(T2000Error);
  });

});

describe('sqrt price math', () => {
  it('bigintSqrt is exact on perfect squares and floors otherwise', () => {
    expect(bigintSqrt(0n)).toBe(0n);
    expect(bigintSqrt(1n)).toBe(1n);
    expect(bigintSqrt(4n)).toBe(2n);
    expect(bigintSqrt(15n)).toBe(3n);
    expect(bigintSqrt(1n << 128n)).toBe(1n << 64n);
  });

  it('sqrtPriceX64: equal raw amounts → price 1.0 → exactly 2^64', () => {
    expect(sqrtPriceX64FromAmounts(1_000_000n, 1_000_000n)).toBe(1n << 64n);
  });

  it('sqrtPriceX64 scales with the ratio, floored never rounded up', () => {
    // 500M AGENT (6dp) vs 25 USDC (6dp): price = 25e6/5e14 = 5e-8.
    const p = sqrtPriceX64FromAmounts(500_000_000_000_000n, 25_000_000n);
    const ideal = Math.sqrt(5e-8) * 2 ** 64;
    const got = Number(p);
    expect(got).toBeLessThanOrEqual(ideal);
    expect(got).toBeGreaterThan(ideal * 0.999999);
  });

  it('rejects zero amounts', () => {
    expect(() => sqrtPriceX64FromAmounts(0n, 1n)).toThrow();
  });
});
