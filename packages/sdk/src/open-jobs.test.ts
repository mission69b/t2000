import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TransactionSigner } from './signer.js';
import {
  cancelOpenJob,
  claimOpenJob,
  getOpenJob,
  listOpenJobs,
  postOpenJob,
  refundOpenJob,
} from './open-jobs.js';

const BASE = 'https://api.example.test/v1';
const ADDRESS = `0x${'a'.repeat(64)}`;
const OPENING_ID = `0x${'f'.repeat(64)}`;
const ROW = {
  id: OPENING_ID,
  title: 'Logo sketch',
  brief: 'Three concepts, PNG',
  maxUsdc: 5,
  slaMinutes: 1440,
  status: 'open',
  openUntilMs: 1,
  seller: null,
  sellerAgent: null,
  buyerAgent: null,
  jobId: null,
  createdAtMs: 1,
  updatedAtMs: 1,
};

function stubSigner(): TransactionSigner & { signedTxBytes: Uint8Array[] } {
  const signedTxBytes: Uint8Array[] = [];
  return {
    signedTxBytes,
    getAddress: () => ADDRESS,
    signTransaction: async (txBytes) => {
      signedTxBytes.push(txBytes);
      return { signature: 'tx-sig' };
    },
    signPersonalMessage: async () => ({ signature: 'msg-sig' }),
  };
}

function mockFetchQueue(
  responses: { json: unknown; ok?: boolean; status?: number }[],
) {
  const calls: { url: string; body: Record<string, unknown> | null }[] = [];
  const fn = vi.fn(async (url: string, init?: { body?: string }) => {
    const next = responses.shift() ?? { json: {}, ok: true };
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : null });
    return {
      ok: next.ok ?? true,
      status: next.status ?? 200,
      json: async () => next.json,
    };
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listOpenJobs / getOpenJob — public board reads', () => {
  it('builds the query string from the filter', async () => {
    const calls = mockFetchQueue([{ json: { openJobs: [ROW] } }]);
    const rows = await listOpenJobs(BASE, {
      status: 'open',
      query: 'logo',
      limit: 10,
    });
    expect(rows).toEqual([ROW]);
    expect(calls[0]?.url).toBe(`${BASE}/open-jobs?status=open&q=logo&limit=10`);
  });

  it('getOpenJob unwraps the row', async () => {
    mockFetchQueue([{ json: { openJob: ROW } }]);
    await expect(getOpenJob(BASE, OPENING_ID)).resolves.toEqual(ROW);
  });

  it('surfaces the API error message', async () => {
    mockFetchQueue([
      { json: { error: 'Open job not found.' }, ok: false, status: 404 },
    ]);
    await expect(getOpenJob(BASE, 'missing')).rejects.toThrow(/not found/i);
  });
});

describe('on-chain verbs — prepare → sign → submit (sponsored rail)', () => {
  const TX_BYTES = Buffer.from('sponsored-tx').toString('base64');

  it('postOpenJob escrows at post via the open-create action', async () => {
    const signer = stubSigner();
    const calls = mockFetchQueue([
      { json: { nonce: 'n-1', txBytes: TX_BYTES } },
      { json: { digest: 'DIGEST' } },
    ]);
    await expect(
      postOpenJob(BASE, signer, {
        title: 'Logo sketch',
        brief: 'Three concepts, PNG',
        maxUsdc: 5,
      }),
    ).resolves.toBe('DIGEST');
    expect(calls[0]?.url).toBe(`${BASE}/job/prepare`);
    expect(calls[0]?.body).toMatchObject({
      address: ADDRESS,
      action: 'open-create',
      params: { title: 'Logo sketch', maxUsdc: 5 },
    });
    expect(new TextDecoder().decode(signer.signedTxBytes[0])).toBe(
      'sponsored-tx',
    );
    expect(calls[1]?.url).toBe(`${BASE}/job/submit`);
    expect(calls[1]?.body).toEqual({
      nonce: 'n-1',
      address: ADDRESS,
      signature: 'tx-sig',
    });
  });

  it.each([
    ['open-claim', claimOpenJob],
    ['open-cancel', cancelOpenJob],
    ['open-refund', refundOpenJob],
  ] as const)('%s targets the opening id', async (action, fn) => {
    const signer = stubSigner();
    const calls = mockFetchQueue([
      { json: { nonce: 'n-2', txBytes: TX_BYTES } },
      { json: { digest: 'DIGEST2' } },
    ]);
    await expect(fn(BASE, signer, OPENING_ID)).resolves.toBe('DIGEST2');
    expect(calls[0]?.body).toMatchObject({
      action,
      params: { openingId: OPENING_ID },
    });
  });

  it('fails when prepare omits the bytes', async () => {
    mockFetchQueue([{ json: { nonce: 'n' } }]);
    await expect(
      claimOpenJob(BASE, stubSigner(), OPENING_ID),
    ).rejects.toThrow(/prepare/i);
  });

  it('surfaces the prepare refusal (still-claimable check)', async () => {
    mockFetchQueue([
      {
        json: { error: { message: 'This opening is no longer claimable (claimed, cancelled, or refunded).' } },
        ok: false,
        status: 400,
      },
    ]);
    await expect(
      claimOpenJob(BASE, stubSigner(), OPENING_ID),
    ).rejects.toThrow(/no longer claimable/i);
  });

  it('throws when submit returns no digest', async () => {
    mockFetchQueue([
      { json: { nonce: 'n', txBytes: TX_BYTES } },
      { json: {} },
    ]);
    await expect(
      postOpenJob(BASE, stubSigner(), { title: 't', brief: 'b', maxUsdc: 1 }),
    ).rejects.toThrow(/did not go through/i);
  });
});
