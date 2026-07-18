import { describe, it, expect, vi } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';
import {
  A2A_ESCROW_PACKAGE_ID,
  MAX_JOB_USDC,
  MAX_REVIEW_WINDOW_MS,
  MAX_DELIVER_HORIZON_MS,
  buildCreateJobTx,
  buildDeliverJobTx,
  buildRefundJobTx,
  buildRejectJobTx,
  buildReleaseJobTx,
  getJob,
  jobActionsFor,
  preflightCreateJob,
  verifyJobForSeller,
  type Job,
  type JobTerms,
} from './job.js';

const BUYER = '0x' + 'a'.repeat(64);
const SELLER = '0x' + 'b'.repeat(64);
const STRANGER = '0x' + 'c'.repeat(64);
const JOB_ID = '0x' + 'd'.repeat(64);

const FUTURE = Date.now() + 3_600_000;

function terms(overrides: Partial<JobTerms> = {}): JobTerms {
  return {
    seller: SELLER,
    amountUsdc: 5,
    specHash: '0xdeadbeef',
    deliverByMs: FUTURE,
    reviewWindowMs: 600_000,
    rejectSplitBps: 8000,
    ...overrides,
  };
}

function mockClient(objectJson?: Record<string, unknown>, objectType?: string) {
  return {
    core: {
      getBalance: vi.fn().mockResolvedValue({
        balance: { balance: '100000000' },
      }),
      getObject: vi.fn().mockResolvedValue({
        object: {
          type:
            objectType ??
            `${A2A_ESCROW_PACKAGE_ID}::escrow::Job<0x…::usdc::USDC>`,
          json: objectJson ?? null,
        },
      }),
    },
  } as any;
}

function onChainJob(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    buyer: BUYER,
    seller: SELLER,
    amount: '5000000',
    escrow: '5000000',
    fee_bps: '250',
    spec_hash: [0xde, 0xad, 0xbe, 0xef],
    deliver_by_ms: String(FUTURE),
    review_window_ms: '600000',
    reject_split_bps: '8000',
    state: 0,
    delivery_hash: [],
    delivered_at_ms: '0',
    created_at_ms: '1000',
    ...overrides,
  };
}

describe('preflightCreateJob', () => {
  it('accepts sane terms', () => {
    expect(preflightCreateJob(terms()).valid).toBe(true);
  });

  it('rejects amounts over the v1 cap', () => {
    const r = preflightCreateJob(terms({ amountUsdc: MAX_JOB_USDC + 1 }));
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error).toMatch(/caps escrow jobs/);
  });

  it('rejects a past deadline', () => {
    expect(preflightCreateJob(terms({ deliverByMs: Date.now() - 1 })).valid).toBe(false);
  });

  it('rejects a deadline beyond the contract horizon', () => {
    const r = preflightCreateJob(
      terms({ deliverByMs: Date.now() + MAX_DELIVER_HORIZON_MS + 60_000 }),
    );
    expect(r.valid).toBe(false);
  });

  it('rejects a review window over the contract cap', () => {
    const r = preflightCreateJob(terms({ reviewWindowMs: MAX_REVIEW_WINDOW_MS + 1 }));
    expect(r.valid).toBe(false);
  });

  it('rejects a split over 10000 bps', () => {
    expect(preflightCreateJob(terms({ rejectSplitBps: 10_001 })).valid).toBe(false);
  });

  it('rejects a non-hex spec hash', () => {
    expect(preflightCreateJob(terms({ specHash: 'not hex' })).valid).toBe(false);
  });

  it('rejects an invalid seller address', () => {
    expect(preflightCreateJob(terms({ seller: 'not-an-address' })).valid).toBe(false);
  });
});

describe('buildCreateJobTx', () => {
  it('builds a create Move call with the escrow package target', async () => {
    const tx = await buildCreateJobTx({ client: mockClient(), buyer: BUYER, terms: terms() });
    expect(tx).toBeInstanceOf(Transaction);
    const calls = tx
      .getData()
      .commands.filter((c) => 'MoveCall' in (c as Record<string, unknown>)) as Array<{
      MoveCall: { package: string; module: string; function: string };
    }>;
    const create = calls.find((c) => c.MoveCall.function === 'create');
    expect(create).toBeDefined();
    expect(create?.MoveCall.package).toBe(A2A_ESCROW_PACKAGE_ID);
    expect(create?.MoveCall.module).toBe('escrow');
  });

  it('rejects buyer === seller', async () => {
    await expect(
      buildCreateJobTx({ client: mockClient(), buyer: SELLER, terms: terms() }),
    ).rejects.toThrow(/different wallets/);
  });

  it('throws INSUFFICIENT_BALANCE when the buyer cannot cover the job', async () => {
    const client = mockClient();
    client.core.getBalance = vi.fn().mockResolvedValue({ balance: { balance: '100' } });
    await expect(
      buildCreateJobTx({ client, buyer: BUYER, terms: terms() }),
    ).rejects.toThrow(/Insufficient balance/);
  });
});

describe('single-object verb builders', () => {
  it.each([
    ['deliver', () => buildDeliverJobTx(JOB_ID, '0xabcd')],
    ['release', () => buildReleaseJobTx(JOB_ID)],
    ['reject', () => buildRejectJobTx(JOB_ID)],
    ['refund', () => buildRefundJobTx(JOB_ID)],
  ])('%s targets the escrow module', (fn, build) => {
    const tx = build();
    const calls = tx
      .getData()
      .commands.filter((c) => 'MoveCall' in (c as Record<string, unknown>)) as Array<{
      MoveCall: { module: string; function: string };
    }>;
    expect(calls).toHaveLength(1);
    expect(calls[0].MoveCall.module).toBe('escrow');
    expect(calls[0].MoveCall.function).toBe(fn);
  });

  it('deliver rejects a malformed hash', () => {
    expect(() => buildDeliverJobTx(JOB_ID, 'nope')).toThrow(/hex hash/);
  });
});

describe('getJob', () => {
  it('parses the on-chain shape', async () => {
    const job = await getJob(mockClient(onChainJob()), JOB_ID);
    expect(job.buyer).toBe(BUYER);
    expect(job.seller).toBe(SELLER);
    expect(job.amountUsdc).toBe(5);
    expect(job.escrowUsdc).toBe(5);
    expect(job.feeBps).toBe(250);
    expect(job.state).toBe('funded');
    expect(job.specHash).toBe('0xdeadbeef');
    expect(job.deliveryHash).toBeNull();
    expect(job.deliveredAtMs).toBeNull();
  });

  it('parses a delivered job', async () => {
    const job = await getJob(
      mockClient(
        onChainJob({ state: 1, delivery_hash: [0xab], delivered_at_ms: '5000' }),
      ),
      JOB_ID,
    );
    expect(job.state).toBe('delivered');
    expect(job.deliveryHash).toBe('0xab');
    expect(job.deliveredAtMs).toBe(5000);
  });

  it('parses base64 vector<u8> fields (live gRPC json shape)', async () => {
    // gRPC's `json` include serializes vector<u8> as base64 — caught on the
    // S.753 mainnet round-trip when the delivery hash printed as garbage.
    const job = await getJob(
      mockClient(
        onChainJob({
          state: 1,
          spec_hash: Buffer.from([0xde, 0xad, 0xbe, 0xef]).toString('base64'),
          delivery_hash: Buffer.from([0xab, 0xcd]).toString('base64'),
          delivered_at_ms: '5000',
        }),
      ),
      JOB_ID,
    );
    expect(job.specHash).toBe('0xdeadbeef');
    expect(job.deliveryHash).toBe('0xabcd');
  });

  it('rejects a non-Job object', async () => {
    await expect(
      getJob(mockClient(onChainJob(), '0x2::coin::Coin<0x2::sui::SUI>'), JOB_ID),
    ).rejects.toThrow(/not an a2a_escrow Job/);
  });
});

describe('jobActionsFor', () => {
  const base: Job = {
    id: JOB_ID,
    buyer: BUYER,
    seller: SELLER,
    amountUsdc: 5,
    escrowUsdc: 5,
    feeBps: 250,
    specHash: '0xde',
    deliverByMs: 10_000,
    reviewWindowMs: 1_000,
    rejectSplitBps: 8000,
    state: 'funded',
    deliveryHash: null,
    deliveredAtMs: null,
    createdAtMs: 0,
  };

  it('funded: seller can deliver before the deadline', () => {
    expect(jobActionsFor(base, SELLER, 5_000)).toEqual(['deliver']);
  });

  it('funded: buyer can voluntarily release', () => {
    expect(jobActionsFor(base, BUYER, 5_000)).toEqual(['release']);
  });

  it('funded past deadline: anyone can refund, seller cannot deliver', () => {
    expect(jobActionsFor(base, STRANGER, 20_000)).toEqual(['refund']);
    expect(jobActionsFor(base, SELLER, 20_000)).toEqual(['refund']);
  });

  it('delivered in-window: buyer can release or reject; stranger nothing', () => {
    const job: Job = { ...base, state: 'delivered', deliveredAtMs: 11_000 };
    expect(jobActionsFor(job, BUYER, 11_500)).toEqual(['release', 'reject']);
    expect(jobActionsFor(job, STRANGER, 11_500)).toEqual([]);
  });

  it('delivered past window: anyone can crank release', () => {
    const job: Job = { ...base, state: 'delivered', deliveredAtMs: 11_000 };
    expect(jobActionsFor(job, STRANGER, 13_000)).toEqual(['release']);
  });

  it('settled: nothing', () => {
    expect(jobActionsFor({ ...base, state: 'released' }, BUYER, 5_000)).toEqual([]);
  });
});

describe('verifyJobForSeller', () => {
  it('accepts a funded job paying this seller', async () => {
    const v = await verifyJobForSeller({
      client: mockClient(onChainJob()),
      jobId: JOB_ID,
      seller: SELLER,
      minAmountUsdc: 5,
    });
    expect(v.ok).toBe(true);
    expect(v.problems).toEqual([]);
  });

  it('flags wrong seller, short escrow, and non-funded state', async () => {
    const v = await verifyJobForSeller({
      client: mockClient(onChainJob({ state: 2, escrow: '0' })),
      jobId: JOB_ID,
      seller: STRANGER,
      minAmountUsdc: 5,
    });
    expect(v.ok).toBe(false);
    expect(v.problems.join(' ')).toMatch(/state is "released"/);
    expect(v.problems.join(' ')).toMatch(/not this seller/);
    expect(v.problems.join(' ')).toMatch(/escrow holds 0/);
  });

  it('flags a deadline too close to accept', async () => {
    const v = await verifyJobForSeller({
      client: mockClient(onChainJob({ deliver_by_ms: String(Date.now() + 1_000) })),
      jobId: JOB_ID,
      seller: SELLER,
      minAmountUsdc: 5,
      minRunwayMs: 60_000,
    });
    expect(v.ok).toBe(false);
    expect(v.problems.join(' ')).toMatch(/deadline too close/);
  });
});
