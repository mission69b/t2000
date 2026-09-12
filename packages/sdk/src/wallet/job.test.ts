import { describe, it, expect, vi } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';
import { A2A_ESCROW_LATEST_PACKAGE_ID } from './opening.js';
import {
  A2A_ESCROW_PACKAGE_ID,
  MAX_JOB_USDC,
  MIN_JOB_USDC,
  MAX_REVIEW_WINDOW_MS,
  MAX_DELIVER_HORIZON_MS,
  buildCreateJobTx,
  buildDeclineJobTx,
  buildDeliverJobTx,
  buildRefundJobTx,
  buildRejectJobTx,
  buildReleaseJobTx,
  addReleaseJobToTx,
  buildReleaseJobsTx,
  addRefundJobToTx,
  buildRefundJobsTx,
  MAX_RELEASES_PER_TX,
  getJob,
  getJobBatchOrigin,
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

  it('rejects amounts under the contract minimum with a human message (S.981)', () => {
    const pf = preflightCreateJob(terms({ amountUsdc: MIN_JOB_USDC - 0.000001 }));
    expect(pf.valid).toBe(false);
    expect(pf.valid === false && pf.error).toContain(`${MIN_JOB_USDC}`);
  });

  it('accepts the exact minimum', () => {
    expect(preflightCreateJob(terms({ amountUsdc: MIN_JOB_USDC })).valid).toBe(true);
  });

  it('rejects amounts over the cap', () => {
    const r = preflightCreateJob(terms({ amountUsdc: MAX_JOB_USDC + 1 }));
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error).toMatch(/cap at/);
  });

  // S.1191 (reputation v2 Phase B): the cap is $100 — pinned to the literal
  // so a silent regression to 50 (or a drive-by raise) fails a test, not a
  // founder dogfood. 100 exactly passes; the first cent above refuses.
  it('cap is exactly $100: accepts 100, refuses 100.01', () => {
    expect(MAX_JOB_USDC).toBe(100);
    expect(preflightCreateJob(terms({ amountUsdc: 100 })).valid).toBe(true);
    expect(preflightCreateJob(terms({ amountUsdc: 100.01 })).valid).toBe(false);
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
  it('builds a create Move call targeting the LATEST escrow package (S.981)', async () => {
    const tx = await buildCreateJobTx({ client: mockClient(), buyer: BUYER, terms: terms() });
    expect(tx).toBeInstanceOf(Transaction);
    const calls = tx
      .getData()
      .commands.filter((c) => 'MoveCall' in (c as Record<string, unknown>)) as Array<{
      MoveCall: { package: string; module: string; function: string };
    }>;
    const create = calls.find((c) => c.MoveCall.function === 'create');
    expect(create).toBeDefined();
    // Version-gated verbs ride the latest published id so an upgrade +
    // migrate cutover is a one-value change; the original id stays the
    // type/event anchor only.
    expect(create?.MoveCall.package).toBe(A2A_ESCROW_LATEST_PACKAGE_ID);
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
    // S.1194: money errors speak symbol + human amounts, never the raw
    // coin type (terms() is a $5 job; the mock wallet holds 100 raw =
    // $0.0001, floored to "0.0001").
    ).rejects.toThrow(/Insufficient USDC: need 5, the wallet holds 0\.0001\./);
  });
});

const SCORE_ID = `0x${'e'.repeat(64)}`;
const REGISTRY_ID = `0x${'f'.repeat(64)}`;

describe('single-object verb builders', () => {
  // S.1210 (v13): deliver rides reputation::deliver_v2 — the seller's
  // score frees the active seat the moment the work ships; batch-origin
  // Jobs route to batch::deliver_v2 (the wave hold frees too). Never the
  // bare escrow::deliver door.
  it('deliver targets reputation::deliver_v2 with the seller score', () => {
    const tx = buildDeliverJobTx(JOB_ID, '0xabcd', { sellerScoreId: SCORE_ID });
    const calls = tx
      .getData()
      .commands.filter((c) => 'MoveCall' in (c as Record<string, unknown>)) as Array<{
      MoveCall: { module: string; function: string };
    }>;
    expect(calls).toHaveLength(1);
    expect(calls[0].MoveCall.module).toBe('reputation');
    expect(calls[0].MoveCall.function).toBe('deliver_v2');
  });

  it('deliver with a batchId targets batch::deliver_v2 (S.1210)', () => {
    const tx = buildDeliverJobTx(JOB_ID, '0xabcd', {
      sellerScoreId: SCORE_ID,
      batchId: `0x${'9'.repeat(64)}`,
    });
    const calls = tx
      .getData()
      .commands.filter((c) => 'MoveCall' in (c as Record<string, unknown>)) as Array<{
      MoveCall: { module: string; function: string };
    }>;
    expect(calls).toHaveLength(1);
    expect(calls[0].MoveCall.module).toBe('batch');
    expect(calls[0].MoveCall.function).toBe('deliver_v2');
  });

  // S.1063: reject/refund settle through the reputation module (outcome
  // counters); S.1192 adds release_v2 (the active counter rides the
  // money) — never the deprecated escrow doors.
  it.each([
    [
      'reject_v2',
      () => buildRejectJobTx(JOB_ID, { sellerScoreId: SCORE_ID, registryId: REGISTRY_ID }),
    ],
    [
      'reject_v2_agent_buyer',
      () =>
        buildRejectJobTx(JOB_ID, {
          sellerScoreId: SCORE_ID,
          registryId: REGISTRY_ID,
          buyerScoreId: `0x${'d'.repeat(64)}`,
        }),
    ],
    ['refund_v2', () => buildRefundJobTx(JOB_ID, { sellerScoreId: SCORE_ID })],
    ['release_v2', () => buildReleaseJobTx(JOB_ID, { sellerScoreId: SCORE_ID })],
    // S.1255: decline frees the global seat with the money — one door for
    // batch-origin too (the builder deliberately has no batchId variant:
    // the per-wave hold must stay burned, so no wave object rides along).
    ['decline_v2', () => buildDeclineJobTx(JOB_ID, { sellerScoreId: SCORE_ID })],
  ])('%s targets the reputation module (S.1063/S.1192)', (fn, build) => {
    const tx = build();
    const calls = tx
      .getData()
      .commands.filter((c) => 'MoveCall' in (c as Record<string, unknown>)) as Array<{
      MoveCall: { module: string; function: string };
    }>;
    expect(calls).toHaveLength(1);
    expect(calls[0].MoveCall.module).toBe('reputation');
    expect(calls[0].MoveCall.function).toBe(fn);
  });

  it('deliver rejects a malformed hash', () => {
    expect(() =>
      buildDeliverJobTx(JOB_ID, 'nope', { sellerScoreId: SCORE_ID }),
    ).toThrow(/hex hash/);
  });

  // S.1202: a batch-origin Job (batchId passed) settles through the batch
  // module's doors — the wave hold frees with the money; bare v2 doors
  // abort EUseBatchSettle on-chain, so building them would be a wedge.
  const BATCH_ID = `0x${'9'.repeat(64)}`;
  it.each([
    [
      'batch_release',
      () => buildReleaseJobTx(JOB_ID, { sellerScoreId: SCORE_ID, batchId: BATCH_ID }),
    ],
    [
      'batch_reject',
      () =>
        buildRejectJobTx(JOB_ID, {
          sellerScoreId: SCORE_ID,
          registryId: REGISTRY_ID,
          batchId: BATCH_ID,
        }),
    ],
    [
      'batch_reject_agent_buyer',
      () =>
        buildRejectJobTx(JOB_ID, {
          sellerScoreId: SCORE_ID,
          registryId: REGISTRY_ID,
          buyerScoreId: `0x${'d'.repeat(64)}`,
          batchId: BATCH_ID,
        }),
    ],
    [
      'batch_refund',
      () => buildRefundJobTx(JOB_ID, { sellerScoreId: SCORE_ID, batchId: BATCH_ID }),
    ],
  ])('%s targets the batch module for origin Jobs (S.1202)', (fn, build) => {
    const tx = build();
    const calls = tx
      .getData()
      .commands.filter((c) => 'MoveCall' in (c as Record<string, unknown>)) as Array<{
      MoveCall: { package: string; module: string; function: string };
    }>;
    expect(calls).toHaveLength(1);
    expect(calls[0].MoveCall.package).toBe(A2A_ESCROW_LATEST_PACKAGE_ID);
    expect(calls[0].MoveCall.module).toBe('batch');
    expect(calls[0].MoveCall.function).toBe(fn);
  });
});

describe('getJobBatchOrigin (S.1202)', () => {
  const BATCH_ID = `0x${'9'.repeat(64)}`;
  const originField = {
    fieldId: `0x${'1'.repeat(64)}`,
    type: 'DynamicField',
    name: {
      type: `0x${'5'.repeat(64)}::escrow::BatchOriginKey`,
      bcs: new Uint8Array(),
    },
    valueType: '0x2::object::ID',
    $kind: 'DynamicField' as const,
  };

  function dfClient(fields: unknown[], valueBcs?: Uint8Array) {
    return {
      core: {
        listDynamicFields: vi
          .fn()
          .mockResolvedValue({ hasNextPage: false, cursor: null, dynamicFields: fields }),
        getDynamicField: vi.fn().mockResolvedValue({
          dynamicField: { value: { type: '0x2::object::ID', bcs: valueBcs } },
        }),
      },
    } as any;
  }

  it('returns the wave id from the BatchOriginKey DF (any defining pkg)', async () => {
    const valueBcs = Uint8Array.from(
      { length: 32 },
      () => 0x99, // BCS of the 0x99…99 address
    );
    const origin = await getJobBatchOrigin(dfClient([originField], valueBcs), JOB_ID);
    expect(origin).toBe(BATCH_ID);
  });

  it('returns null when the Job has no origin DF (single/hire)', async () => {
    const claimedOnly = {
      ...originField,
      name: { type: `0x${'5'.repeat(64)}::escrow::ClaimedJobKey`, bcs: new Uint8Array() },
    };
    const client = dfClient([claimedOnly]);
    expect(await getJobBatchOrigin(client, JOB_ID)).toBeNull();
    expect(client.core.getDynamicField).not.toHaveBeenCalled();
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

  it('funded: buyer is NEVER steered to release before delivery (S.1015)', () => {
    // Zero deliveries → releasing pays the full escrow to a no-show,
    // terminally. Goodwill funded→release stays on-chain but is opt-in via
    // `t2 job release --pay-without-delivery`, never a suggested action.
    expect(jobActionsFor(base, BUYER, 5_000)).toEqual([]);
  });

  it('funded past deadline: anyone (incl. buyer) can refund, seller cannot deliver', () => {
    expect(jobActionsFor(base, STRANGER, 20_000)).toEqual(['refund']);
    expect(jobActionsFor(base, SELLER, 20_000)).toEqual(['refund']);
    expect(jobActionsFor(base, BUYER, 20_000)).toEqual(['refund']);
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

  // S.1226 — the escrow amount is already on-chain: price omitted =
  // funded-state + seller verification only, no price compare.
  it('verifies without minAmountUsdc (price optional)', async () => {
    const v = await verifyJobForSeller({
      client: mockClient(onChainJob()),
      jobId: JOB_ID,
      seller: SELLER,
    });
    expect(v.ok).toBe(true);
    // And a zero-escrow job still fails on state/parties, never a price
    // compare that was never asked for.
    const stranger = await verifyJobForSeller({
      client: mockClient(onChainJob({ escrow: '0' })),
      jobId: JOB_ID,
      seller: STRANGER,
    });
    expect(stranger.ok).toBe(false);
    expect(stranger.problems.join(' ')).not.toMatch(/price/);
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

// S.1302 spike — "settle selected": N release doors in ONE PTB, composed
// from the exact single-release builders (no new Move). Shape only; the
// live dry-run is the founder's paste of Delivered job ids.
describe('buildReleaseJobsTx (S.1302 settle selected)', () => {
  const JOB_A = `0x${'1'.repeat(64)}`;
  const JOB_B = `0x${'2'.repeat(64)}`;
  const SCORE_A = `0x${'3'.repeat(64)}`;
  const SCORE_B = `0x${'4'.repeat(64)}`;
  const BATCH = `0x${'9'.repeat(64)}`;
  const SCORE_ID = `0x${'e'.repeat(64)}`;

  type Call = {
    MoveCall: { package: string; module: string; function: string; arguments: unknown[] };
  };
  const moveCalls = (tx: Transaction): Call[] =>
    tx
      .getData()
      .commands.filter((c) => 'MoveCall' in (c as Record<string, unknown>)) as Call[];

  it('buildReleaseJobTx is unchanged: one call, same door, built via addReleaseJobToTx', () => {
    const single = moveCalls(buildReleaseJobTx(JOB_A, { sellerScoreId: SCORE_A }));
    const added = moveCalls(addReleaseJobToTx(new Transaction(), JOB_A, { sellerScoreId: SCORE_A }));
    expect(single).toHaveLength(1);
    expect(single[0].MoveCall.function).toBe('release_v2');
    expect(JSON.stringify(single)).toBe(JSON.stringify(added));
  });

  it('two independent jobs (distinct sellers) → 2× release_v2', () => {
    const calls = moveCalls(
      buildReleaseJobsTx([
        { jobId: JOB_A, sellerScoreId: SCORE_A },
        { jobId: JOB_B, sellerScoreId: SCORE_B },
      ]),
    );
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.MoveCall.package).toBe(A2A_ESCROW_LATEST_PACKAGE_ID);
      expect(c.MoveCall.module).toBe('reputation');
      expect(c.MoveCall.function).toBe('release_v2');
    }
  });

  it('mix: wave-origin + plain → batch_release then release_v2, in input order', () => {
    const calls = moveCalls(
      buildReleaseJobsTx([
        { jobId: JOB_A, sellerScoreId: SCORE_A, batchId: BATCH },
        { jobId: JOB_B, sellerScoreId: SCORE_B },
      ]),
    );
    expect(calls.map((c) => `${c.MoveCall.module}::${c.MoveCall.function}`)).toEqual([
      'batch::batch_release',
      'reputation::release_v2',
    ]);
    // reverse the input → reverse the commands (order is the caller's)
    const rev = moveCalls(
      buildReleaseJobsTx([
        { jobId: JOB_B, sellerScoreId: SCORE_B },
        { jobId: JOB_A, sellerScoreId: SCORE_A, batchId: BATCH },
      ]),
    );
    expect(rev.map((c) => c.MoveCall.function)).toEqual(['release_v2', 'batch_release']);
  });

  it('same seller twice (shared AgentScore) → 2 calls sharing ONE score input', () => {
    const tx = buildReleaseJobsTx([
      { jobId: JOB_A, sellerScoreId: SCORE_ID },
      { jobId: JOB_B, sellerScoreId: SCORE_ID },
    ]);
    const calls = moveCalls(tx);
    expect(calls).toHaveLength(2);
    // release_v2(job, score, fee, clock): arg[1] is the score — same input.
    expect(JSON.stringify(calls[0].MoveCall.arguments[1])).toBe(
      JSON.stringify(calls[1].MoveCall.arguments[1]),
    );
    // and the two jobs are distinct inputs
    expect(JSON.stringify(calls[0].MoveCall.arguments[0])).not.toBe(
      JSON.stringify(calls[1].MoveCall.arguments[0]),
    );
    // inputs: 2 jobs + 1 score + fee config + clock = 5 (dedupe proven)
    expect(tx.getData().inputs).toHaveLength(5);
  });

  it('same wave twice (shared BatchOpening) → 2× batch_release sharing ONE batch input', () => {
    const tx = buildReleaseJobsTx([
      { jobId: JOB_A, sellerScoreId: SCORE_A, batchId: BATCH },
      { jobId: JOB_B, sellerScoreId: SCORE_B, batchId: BATCH },
    ]);
    const calls = moveCalls(tx);
    expect(calls.map((c) => c.MoveCall.function)).toEqual(['batch_release', 'batch_release']);
    // batch_release(batch, job, score, fee, clock): arg[0] is the wave.
    expect(JSON.stringify(calls[0].MoveCall.arguments[0])).toBe(
      JSON.stringify(calls[1].MoveCall.arguments[0]),
    );
    // inputs: 1 batch + 2 jobs + 2 scores + fee config + clock = 7
    expect(tx.getData().inputs).toHaveLength(7);
  });

  it('empty selection throws; a duplicate jobId throws (case-insensitive)', () => {
    expect(() => buildReleaseJobsTx([])).toThrow(/Settle selected: pick at least one job/);
    expect(() =>
      buildReleaseJobsTx([
        { jobId: JOB_A, sellerScoreId: SCORE_A },
        { jobId: JOB_A.toUpperCase().replace('0X', '0x'), sellerScoreId: SCORE_A },
      ]),
    ).toThrow(/listed twice/);
  });

  it('N=10 → 10 calls; N=26 refuses at the spike ceiling', () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({
      jobId: `0x${String(i).padStart(64, '5')}`,
      sellerScoreId: SCORE_ID,
    }));
    expect(moveCalls(buildReleaseJobsTx(ten))).toHaveLength(10);
    const over = Array.from({ length: MAX_RELEASES_PER_TX + 1 }, (_, i) => ({
      jobId: `0x${String(i).padStart(64, '6')}`,
      sellerScoreId: SCORE_ID,
    }));
    expect(() => buildReleaseJobsTx(over)).toThrow(/ceiling/);
  });
});

// S.1310 — "Refund all lapsed": the exact mirror of settle-selected on the
// refund doors (refund_v2 / batch_refund), same composer.
describe('buildRefundJobsTx (S.1310 refund all lapsed)', () => {
  const JOB_A = `0x${'1'.repeat(64)}`;
  const JOB_B = `0x${'2'.repeat(64)}`;
  const SCORE_A = `0x${'3'.repeat(64)}`;
  const SCORE_B = `0x${'4'.repeat(64)}`;
  const BATCH = `0x${'9'.repeat(64)}`;
  type Call = {
    MoveCall: { package: string; module: string; function: string; arguments: unknown[] };
  };
  const moveCalls = (tx: Transaction): Call[] =>
    tx
      .getData()
      .commands.filter((c) => 'MoveCall' in (c as Record<string, unknown>)) as Call[];

  it('buildRefundJobTx is unchanged: one call, same door, via addRefundJobToTx', () => {
    const single = moveCalls(buildRefundJobTx(JOB_A, { sellerScoreId: SCORE_A }));
    const added = moveCalls(addRefundJobToTx(new Transaction(), JOB_A, { sellerScoreId: SCORE_A }));
    expect(single).toHaveLength(1);
    expect(single[0].MoveCall.function).toBe('refund_v2');
    expect(JSON.stringify(single)).toBe(JSON.stringify(added));
  });

  it('mix: wave-origin + plain → batch_refund then refund_v2, input order', () => {
    const calls = moveCalls(
      buildRefundJobsTx([
        { jobId: JOB_A, sellerScoreId: SCORE_A, batchId: BATCH },
        { jobId: JOB_B, sellerScoreId: SCORE_B },
      ]),
    );
    expect(calls.map((c) => `${c.MoveCall.module}::${c.MoveCall.function}`)).toEqual([
      'batch::batch_refund',
      'reputation::refund_v2',
    ]);
    for (const c of calls) expect(c.MoveCall.package).toBe(A2A_ESCROW_LATEST_PACKAGE_ID);
  });

  it('same seller twice shares ONE score input; same wave twice shares ONE batch input', () => {
    const sameSeller = buildRefundJobsTx([
      { jobId: JOB_A, sellerScoreId: SCORE_A },
      { jobId: JOB_B, sellerScoreId: SCORE_A },
    ]);
    expect(sameSeller.getData().inputs).toHaveLength(5);
    const sameWave = buildRefundJobsTx([
      { jobId: JOB_A, sellerScoreId: SCORE_A, batchId: BATCH },
      { jobId: JOB_B, sellerScoreId: SCORE_B, batchId: BATCH },
    ]);
    expect(sameWave.getData().inputs).toHaveLength(7);
    expect(moveCalls(sameWave).map((c) => c.MoveCall.function)).toEqual([
      'batch_refund',
      'batch_refund',
    ]);
  });

  it('empty / duplicate / ceiling refuse with the refund label', () => {
    expect(() => buildRefundJobsTx([])).toThrow(/Refund all lapsed: pick at least one job/);
    expect(() =>
      buildRefundJobsTx([
        { jobId: JOB_A, sellerScoreId: SCORE_A },
        { jobId: JOB_A, sellerScoreId: SCORE_A },
      ]),
    ).toThrow(/listed twice/);
    const over = Array.from({ length: MAX_RELEASES_PER_TX + 1 }, (_, i) => ({
      jobId: `0x${String(i).padStart(64, '7')}`,
      sellerScoreId: SCORE_A,
    }));
    expect(() => buildRefundJobsTx(over)).toThrow(/ceiling/);
  });
});
