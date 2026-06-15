/**
 * history.ts — GraphQL mapper tests (S.447 gRPC migration).
 *
 * These verify the GraphQL-node → TransactionRecord mapping + the wiring
 * into the shared classifier — i.e. everything EXCEPT whether the GraphQL
 * query STRING matches the live Sui schema (that's the founder's live smoke,
 * since the build env can't egress to Sui RPC). The mocked node shape mirrors
 * `transactionBlocks.nodes[*]` / `transactionBlock` per the beta schema.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../utils/sui.js', () => ({
  getSuiGraphQLClient: () => ({ query: mockQuery }),
}));

import { queryHistory, queryTransaction } from './history.js';

const SENDER = `0x${'a'.repeat(64)}`;
const USDC = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

function sendNode(digest: string) {
  return {
    digest,
    effects: {
      timestamp: '2026-06-15T00:00:00.000Z',
      gasEffects: { gasSummary: { computationCost: '1000000', storageCost: '2000000', storageRebate: '500000' } },
      balanceChanges: { nodes: [{ amount: '-5000000', coinType: { repr: USDC }, owner: { address: SENDER } }] },
    },
    kind: {
      __typename: 'ProgrammableTransactionBlock',
      transactions: { nodes: [{ __typename: 'MoveCallTransaction', package: '0x2', module: 'balance', functionName: 'send_funds' }] },
    },
  };
}

describe('queryHistory (GraphQL)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps transactionBlocks nodes → TransactionRecord[], newest-first', async () => {
    mockQuery.mockResolvedValue({ data: { transactionBlocks: { nodes: [sendNode('0xolder'), sendNode('0xnewer')] } } });

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
    expect(typeof r.action).toBe('string');
    expect(r.legs.length).toBeGreaterThan(0);
  });

  it('passes the sender + limit through as GraphQL variables', async () => {
    mockQuery.mockResolvedValue({ data: { transactionBlocks: { nodes: [] } } });
    await queryHistory(SENDER, 7);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({ variables: { address: SENDER, last: 7 } }),
    );
  });

  it('returns [] when there are no nodes', async () => {
    mockQuery.mockResolvedValue({ data: { transactionBlocks: { nodes: [] } } });
    expect(await queryHistory(SENDER, 20)).toEqual([]);
  });
});

describe('queryTransaction (GraphQL)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps a single transactionBlock → record', async () => {
    mockQuery.mockResolvedValue({ data: { transactionBlock: sendNode('0xone') } });
    const r = await queryTransaction('0xone', SENDER);
    expect(r?.digest).toBe('0xone');
    expect(r?.asset).toBe('USDC');
    expect(r?.amount).toBeCloseTo(5, 6);
  });

  it('returns null when the digest is not found', async () => {
    mockQuery.mockResolvedValue({ data: { transactionBlock: null } });
    expect(await queryTransaction('0xmissing', SENDER)).toBeNull();
  });

  it('returns null on query error (swallowed)', async () => {
    mockQuery.mockRejectedValue(new Error('graphql down'));
    expect(await queryTransaction('0xboom', SENDER)).toBeNull();
  });
});
