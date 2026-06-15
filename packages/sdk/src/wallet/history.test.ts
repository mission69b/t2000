/**
 * history.ts — GraphQL mapper tests (S.447 + S.450 gRPC migration).
 *
 * Verifies the GraphQL-node → TransactionRecord mapping, the move-call
 * classification wiring, and the error-surfacing contract. The node shape
 * mirrors the LIVE `graphql.mainnet.sui.io` schema confirmed S.450
 * (`transactions`/`transaction`, `ProgrammableTransaction` + `commands`,
 * `MoveCallCommand.function { name module { name package { address } } }`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../utils/sui.js', () => ({
  getSuiGraphQLClient: () => ({ query: mockQuery }),
}));

import { queryHistory, queryTransaction } from './history.js';

const SENDER = `0x${'a'.repeat(64)}`;
const USDC = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const SUI = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI';

// gas values come back as NUMBERS on the live schema (mapper tolerates both).
const GAS = { computationCost: 1000000, storageCost: 2000000, storageRebate: 500000 };

function sendNode(digest: string) {
  return {
    digest,
    effects: {
      timestamp: '2026-06-15T00:00:00.000Z',
      gasEffects: { gasSummary: GAS },
      balanceChanges: { nodes: [{ amount: '-5000000', coinType: { repr: USDC }, owner: { address: SENDER } }] },
    },
    kind: {
      __typename: 'ProgrammableTransaction',
      commands: {
        nodes: [
          { __typename: 'MoveCallCommand', function: { name: 'public_transfer', module: { name: 'transfer', package: { address: '0x2' } } } },
        ],
      },
    },
  };
}

function swapNode(digest: string) {
  return {
    digest,
    effects: {
      timestamp: '2026-06-15T00:00:00.000Z',
      gasEffects: { gasSummary: GAS },
      balanceChanges: {
        nodes: [
          { amount: '-200000000', coinType: { repr: SUI }, owner: { address: SENDER } },
          { amount: '161311', coinType: { repr: USDC }, owner: { address: SENDER } },
        ],
      },
    },
    kind: {
      __typename: 'ProgrammableTransaction',
      commands: {
        nodes: [
          { __typename: 'MoveCallCommand', function: { name: 'swap', module: { name: 'flowx_amm', package: { address: '0x66d7' } } } },
          { __typename: 'TransferObjectsCommand' },
        ],
      },
    },
  };
}

describe('queryHistory (GraphQL)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps transactions nodes → TransactionRecord[], newest-first', async () => {
    mockQuery.mockResolvedValue({ data: { transactions: { nodes: [sendNode('0xolder'), sendNode('0xnewer')] } } });

    const recs = await queryHistory(SENDER, 20);

    expect(recs).toHaveLength(2);
    // GraphQL `last` returns ascending; queryHistory reverses → newest first.
    expect(recs[0].digest).toBe('0xnewer');
    expect(recs[1].digest).toBe('0xolder');

    const r = recs[0];
    // gas = (1_000_000 + 2_000_000 - 500_000) / 1e9
    expect(r.gasCost).toBeCloseTo(0.0025, 9);
    expect(r.timestamp).toBe(Date.parse('2026-06-15T00:00:00.000Z'));
    expect(r.asset).toBe('USDC');
    expect(r.amount).toBeCloseTo(5, 6);
    expect(r.action).toBe('send'); // 0x2::transfer::public_transfer
    expect(r.legs.length).toBeGreaterThan(0);
  });

  it('classifies a Cetus swap via move-call targets', async () => {
    mockQuery.mockResolvedValue({ data: { transactions: { nodes: [swapNode('0xswap')] } } });
    const [r] = await queryHistory(SENDER, 20);
    expect(r.action).toBe('swap'); // flowx_amm::swap matches the DEX target patterns
    expect(r.legs.length).toBe(2); // SUI out + USDC in
  });

  it('passes the sender + limit through as GraphQL variables', async () => {
    mockQuery.mockResolvedValue({ data: { transactions: { nodes: [] } } });
    await queryHistory(SENDER, 7);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({ variables: { address: SENDER, last: 7 } }),
    );
  });

  it('returns [] when there are no nodes', async () => {
    mockQuery.mockResolvedValue({ data: { transactions: { nodes: [] } } });
    expect(await queryHistory(SENDER, 20)).toEqual([]);
  });

  it('THROWS on GraphQL errors (no longer swallowed as [])', async () => {
    mockQuery.mockResolvedValue({ data: null, errors: [{ message: 'Unknown field "transactionBlocks"' }] });
    await expect(queryHistory(SENDER, 20)).rejects.toThrow(/history query failed.*transactionBlocks/);
  });
});

describe('queryTransaction (GraphQL)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps a single transaction → record', async () => {
    mockQuery.mockResolvedValue({ data: { transaction: sendNode('0xone') } });
    const r = await queryTransaction('0xone', SENDER);
    expect(r?.digest).toBe('0xone');
    expect(r?.asset).toBe('USDC');
    expect(r?.amount).toBeCloseTo(5, 6);
  });

  it('returns null when the digest is not found', async () => {
    mockQuery.mockResolvedValue({ data: { transaction: null } });
    expect(await queryTransaction('0xmissing', SENDER)).toBeNull();
  });

  it('THROWS on GraphQL errors (not swallowed as null)', async () => {
    mockQuery.mockResolvedValue({ data: null, errors: [{ message: 'boom' }] });
    await expect(queryTransaction('0xboom', SENDER)).rejects.toThrow(/transaction query failed.*boom/);
  });
});
