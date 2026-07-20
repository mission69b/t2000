import type { DigestStore } from '@suimpp/mpp/server';

export { InMemoryDigestStore } from '@suimpp/mpp/server';
export type { DigestStore } from '@suimpp/mpp/server';

// ---------------------------------------------------------------------------
// Upstash-REST digest store — the production replay store for serverless
// hosts. Mirrors the gateway's upstash-digest-store.ts but speaks the
// Upstash REST API over plain fetch (no @upstash/redis dependency).
//
// TTL: 72h. x402 payments are chain-valid for the whole ValidDuring window
// ([minEpoch, minEpoch+1] ≈ up to ~48h on mainnet). Sui resubmission of an
// executed tx is idempotent, so if the digest/challenge keys expired BEFORE
// the window closed, a replayed X-PAYMENT would re-settle "successfully"
// and serve again on a single payment. 72h > max window + drift.
// ---------------------------------------------------------------------------

const DEFAULT_TTL_SECONDS = 72 * 60 * 60;
const PREFIX = 'serve:digest:';

export interface UpstashDigestStoreOptions {
  url: string;
  token: string;
  /** Key TTL in seconds. Default 72h — do not lower below ~50h (see above). */
  ttlSeconds?: number;
}

export class UpstashDigestStore implements DigestStore {
  private readonly url: string;
  private readonly token: string;
  private readonly ttlSeconds: number;

  constructor(options: UpstashDigestStoreOptions) {
    this.url = options.url.replace(/\/$/, '');
    this.token = options.token;
    this.ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  }

  private async command(segments: string[]): Promise<unknown> {
    const res = await fetch(`${this.url}/${segments.map(encodeURIComponent).join('/')}`, {
      headers: { authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) {
      throw new Error(`Upstash command failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { result?: unknown; error?: string };
    if (body.error) throw new Error(`Upstash error: ${body.error}`);
    return body.result;
  }

  async has(digest: string): Promise<boolean> {
    const result = await this.command(['GET', PREFIX + digest]);
    return result !== null && result !== undefined;
  }

  async set(digest: string): Promise<void> {
    // SET key 1 EX <ttl> NX — atomic set-if-absent. A null result means the
    // key already existed: the digest (or challenge) was already consumed.
    const result = await this.command([
      'SET',
      PREFIX + digest,
      '1',
      'EX',
      String(this.ttlSeconds),
      'NX',
    ]);
    if (result === null || result === undefined) {
      throw new Error(`Digest already used: ${digest}`);
    }
  }
}
