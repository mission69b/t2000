import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TransactionSigner } from './signer.js';
import {
  cancelOpenJob,
  claimOpenJob,
  createOpenJob,
  fundOpenJob,
  getOpenJob,
  listOpenJobs,
  unclaimOpenJob,
} from './open-jobs.js';

const BASE = 'https://api.example.test/v1';
const ADDRESS = `0x${'a'.repeat(64)}`;
const ROW = {
  id: 'f0a4d3e2-0000-0000-0000-000000000001',
  title: 'Logo sketch',
  brief: 'Three concepts, PNG',
  maxUsdc: 5,
  slaMinutes: 1440,
  status: 'open',
  openUntilMs: 1,
  claimExpiresAtMs: null,
  seller: null,
  sellerAgent: null,
  buyerAgent: null,
  jobId: null,
  createdAtMs: 1,
  updatedAtMs: 1,
};

/** A signer that records what it signed — enough to assert the
 *  action-bound challenge message construction. */
function stubSigner(): TransactionSigner & {
  signedMessages: string[];
  signedTxBytes: Uint8Array[];
} {
  const signedMessages: string[] = [];
  const signedTxBytes: Uint8Array[] = [];
  return {
    signedMessages,
    signedTxBytes,
    getAddress: () => ADDRESS,
    signTransaction: async (txBytes) => {
      signedTxBytes.push(txBytes);
      return { signature: 'tx-sig' };
    },
    signPersonalMessage: async (messageBytes) => {
      signedMessages.push(new TextDecoder().decode(messageBytes));
      return { signature: 'msg-sig' };
    },
  };
}

/** Queue one JSON response per expected fetch call, and capture requests. */
function mockFetchQueue(
  responses: { json: unknown; ok?: boolean; status?: number }[],
) {
  const calls: { url: string; body: Record<string, unknown> | null }[] = [];
  const fn = vi.fn(async (url: string, init?: { body?: string }) => {
    const next = responses.shift() ?? { json: {}, ok: true };
    calls.push({
      url,
      body: init?.body ? JSON.parse(init.body) : null,
    });
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

  it('hits the bare endpoint with no filter', async () => {
    const calls = mockFetchQueue([{ json: { openJobs: [] } }]);
    await expect(listOpenJobs(BASE)).resolves.toEqual([]);
    expect(calls[0]?.url).toBe(`${BASE}/open-jobs`);
  });

  it('getOpenJob unwraps the row', async () => {
    mockFetchQueue([{ json: { openJob: ROW } }]);
    await expect(getOpenJob(BASE, ROW.id)).resolves.toEqual(ROW);
  });

  it('surfaces the API error message', async () => {
    mockFetchQueue([
      { json: { error: 'Open job not found.' }, ok: false, status: 404 },
    ]);
    await expect(getOpenJob(BASE, 'missing')).rejects.toThrow(/not found/i);
  });
});

describe('signed mutations — action-bound challenge construction', () => {
  it('create signs `t2000-open-create:<nonce>` (no id) and posts auth + input', async () => {
    const signer = stubSigner();
    const calls = mockFetchQueue([
      { json: { nonce: 'n-1' } },
      { json: { openJob: ROW } },
    ]);
    const row = await createOpenJob(BASE, signer, {
      title: 'Logo sketch',
      brief: 'Three concepts, PNG',
      maxUsdc: 5,
    });
    expect(row).toEqual(ROW);
    expect(calls[0]?.url).toBe(`${BASE}/agent/challenge`);
    expect(signer.signedMessages).toEqual(['t2000-open-create:n-1']);
    expect(calls[1]?.url).toBe(`${BASE}/open-jobs`);
    expect(calls[1]?.body).toMatchObject({
      address: ADDRESS,
      nonce: 'n-1',
      signature: 'msg-sig',
      title: 'Logo sketch',
      maxUsdc: 5,
    });
  });

  it.each([
    ['claim', claimOpenJob],
    ['unclaim', unclaimOpenJob],
    ['cancel', cancelOpenJob],
  ] as const)(
    '%s binds the challenge to the row id',
    async (action, fn) => {
      const signer = stubSigner();
      const calls = mockFetchQueue([
        { json: { nonce: 'n-2' } },
        { json: { openJob: ROW } },
      ]);
      await fn(BASE, signer, ROW.id);
      expect(signer.signedMessages).toEqual([
        `t2000-open-${action}:n-2:${ROW.id}`,
      ]);
      expect(calls[1]?.url).toBe(`${BASE}/open-jobs/${ROW.id}/${action}`);
    },
  );

  it('fails when the challenge endpoint returns no nonce', async () => {
    mockFetchQueue([{ json: {} }]);
    await expect(
      claimOpenJob(BASE, stubSigner(), ROW.id),
    ).rejects.toThrow(/challenge nonce/i);
  });
});

describe('fundOpenJob — prepare → sign → submit', () => {
  it('signs the prepared bytes and returns digest + jobId', async () => {
    const signer = stubSigner();
    const txBytes = Buffer.from('sponsored-tx').toString('base64');
    const calls = mockFetchQueue([
      { json: { nonce: 'n-3', txBytes } },
      { json: { digest: 'DIGEST', jobId: '0xjob' } },
    ]);
    await expect(fundOpenJob(BASE, signer, ROW.id)).resolves.toEqual({
      digest: 'DIGEST',
      jobId: '0xjob',
    });
    expect(calls[0]?.url).toBe(`${BASE}/open-jobs/${ROW.id}/fund-prepare`);
    expect(calls[0]?.body).toEqual({ address: ADDRESS });
    expect(new TextDecoder().decode(signer.signedTxBytes[0])).toBe(
      'sponsored-tx',
    );
    expect(calls[1]?.body).toEqual({
      nonce: 'n-3',
      address: ADDRESS,
      signature: 'tx-sig',
    });
  });

  it('jobId degrades to null when the server could not resolve it', async () => {
    const txBytes = Buffer.from('x').toString('base64');
    mockFetchQueue([
      { json: { nonce: 'n', txBytes } },
      { json: { digest: 'DIGEST' } },
    ]);
    await expect(fundOpenJob(BASE, stubSigner(), ROW.id)).resolves.toEqual({
      digest: 'DIGEST',
      jobId: null,
    });
  });

  it('throws when prepare omits the bytes', async () => {
    mockFetchQueue([{ json: { nonce: 'n' } }]);
    await expect(fundOpenJob(BASE, stubSigner(), ROW.id)).rejects.toThrow(
      /prepare/i,
    );
  });

  it('throws when submit returns no digest', async () => {
    const txBytes = Buffer.from('x').toString('base64');
    mockFetchQueue([{ json: { nonce: 'n', txBytes } }, { json: {} }]);
    await expect(fundOpenJob(BASE, stubSigner(), ROW.id)).rejects.toThrow(
      /did not go through/i,
    );
  });
});
