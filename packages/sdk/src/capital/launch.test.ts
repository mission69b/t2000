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
    const { tx, moduleName, otw } = launch.buildPublishAgentCoinTx({
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

  it('refuses a recipient that is not the launcher (no third-party supply)', () => {
    expect(() =>
      launch.buildPublishAgentCoinTx({
        coin: { ...coin(), recipient: AGENT },
        launcher: LAUNCHER,
      }),
    ).toThrow(T2000Error);
  });
});

describe('buildTokenizeTx', () => {
  const args = () => ({
    agent: AGENT,
    launcher: LAUNCHER,
    coinType: `${PKG}::funkii::FUNKII`,
    supplyCoinId: normalizeSuiAddress('0x51'),
    coinMetadataId: normalizeSuiAddress('0x52'),
    lpSuiAmount: 5_000_000_000n, // 5 SUI
    agentRegistryId: AGENT_REGISTRY,
  });

  it('assembles bind → split → pool → lock → finalize atomically, in order', () => {
    const tx = launch.buildTokenizeTx(args());
    const calls = tx
      .getData()
      .commands.filter((c) => c.MoveCall)
      .map((c) => `${c.MoveCall!.module}::${c.MoveCall!.function}`);
    expect(calls).toEqual([
      'registry::bind',
      'pool_creator::full_range_tick_range',
      'pool_creator::create_pool_v2',
      'position::pool_id',
      'lp_lock::lock',
      'registry::finalize',
    ]);
  });

  it('routes treasury+refund to the agent and SUI refund to the launcher', () => {
    const tx = launch.buildTokenizeTx(args());
    const data = tx.getData();
    const transfers = data.commands.filter((c) => c.TransferObjects);
    expect(transfers).toHaveLength(2);
    // Recipient pure inputs decode back to agent / launcher respectively.
    const addrOf = (t: (typeof transfers)[number]) => {
      const input = data.inputs[(t.TransferObjects!.address as { Input: number }).Input];
      const bytes = Buffer.from((input.Pure as { bytes: string }).bytes, 'base64');
      return `0x${bytes.toString('hex')}`;
    };
    expect(addrOf(transfers[0])).toBe(AGENT);
    expect(addrOf(transfers[1])).toBe(LAUNCHER);
    // The agent-bound transfer carries TWO objects: the treasury half (the
    // split remainder, input-referenced supply coin) + the AGENT-side refund.
    expect(transfers[0].TransferObjects!.objects).toHaveLength(2);
    expect(transfers[1].TransferObjects!.objects).toHaveLength(1);
  });

  it('enforces the LP SUI floor', () => {
    expect(() =>
      launch.buildTokenizeTx({ ...args(), lpSuiAmount: 999_999_999n }),
    ).toThrow(T2000Error);
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
    // 500M AGENT (6dp) vs 5 SUI (9dp): price = 5e9/5e14 = 1e-5.
    const p = sqrtPriceX64FromAmounts(500_000_000_000_000n, 5_000_000_000n);
    const ideal = Math.sqrt(1e-5) * 2 ** 64;
    const got = Number(p);
    expect(got).toBeLessThanOrEqual(ideal);
    expect(got).toBeGreaterThan(ideal * 0.999999);
  });

  it('rejects zero amounts', () => {
    expect(() => sqrtPriceX64FromAmounts(0n, 1n)).toThrow();
  });
});
