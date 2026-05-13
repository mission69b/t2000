import { describe, it, expect } from 'vitest';
import { classifyOpenAiImagesResponse } from './openai-images-classify';

/**
 * Unit tests for the SPEC 26 D-6 openai/v1/images/generations classifier.
 *
 * Three verdict paths from the spec:
 *   - `'refundable'` — upstream non-2xx OR all legs failed (charge gate
 *     blocks; client gets HTTP 402 with no Sui USDC delta).
 *   - `'deliverable'` — upstream 2xx AND every leg has a `url`. Charge
 *     for the full amount.
 *   - `'mixed'` — upstream 2xx AND some-but-not-all legs delivered.
 *     Charge `successCount / total × amount`.
 *
 * Plus defensive edge cases that catch the most likely "shape we
 * haven't seen yet" classes (body is `null`, body is a string, `data`
 * field missing, `data` is wrong type, individual entries are not
 * objects, etc.).
 */

function jsonResponse(status: number): Response {
  // The classifier ignores the response body — it reads from the
  // separate `body` arg (already-parsed). Status drives the first gate.
  return new Response('', {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// ─── Path 1: refundable (upstream non-2xx) ────────────────────────────

describe('classifyOpenAiImagesResponse — refundable verdict (upstream non-2xx)', () => {
  it('returns refundable for 400 (the canonical 256x256 paid-failure case)', async () => {
    const verdict = await classifyOpenAiImagesResponse(jsonResponse(400), {
      error: { code: 'invalid_request_error' },
    });

    expect(verdict.kind).toBe('refundable');
    expect(verdict).toMatchObject({ reason: 'OpenAI 400' });
  });

  it('returns refundable for 429 (rate limit)', async () => {
    const verdict = await classifyOpenAiImagesResponse(jsonResponse(429), {
      error: { code: 'rate_limit' },
    });

    expect(verdict.kind).toBe('refundable');
    expect(verdict).toMatchObject({ reason: 'OpenAI 429' });
  });

  it('returns refundable for 500 (vendor outage)', async () => {
    const verdict = await classifyOpenAiImagesResponse(jsonResponse(500), {});
    expect(verdict.kind).toBe('refundable');
  });

  it('returns refundable for 502 (transform threw, wrapped to 502 by chargeProxy)', async () => {
    // This is the spec § 5.4 path: transform crash → 502 body → classifier
    // sees res.ok === false → refundable. Pinned here so the contract
    // between the two doesn't drift.
    const verdict = await classifyOpenAiImagesResponse(jsonResponse(502), {
      error: 'Gateway response transform failed: Blob upload failed',
    });
    expect(verdict.kind).toBe('refundable');
  });
});

// ─── Path 2: deliverable (every leg has url) ─────────────────────────

describe('classifyOpenAiImagesResponse — deliverable verdict (every leg succeeded)', () => {
  it('returns deliverable when n=1 and the single leg has a url', async () => {
    const verdict = await classifyOpenAiImagesResponse(jsonResponse(200), {
      data: [{ url: 'https://blob.vercel/img-1.png' }],
    });

    expect(verdict.kind).toBe('deliverable');
  });

  it('returns deliverable when n=4 and all 4 legs have urls', async () => {
    const verdict = await classifyOpenAiImagesResponse(jsonResponse(200), {
      data: [
        { url: 'https://blob.vercel/img-1.png' },
        { url: 'https://blob.vercel/img-2.png' },
        { url: 'https://blob.vercel/img-3.png' },
        { url: 'https://blob.vercel/img-4.png' },
      ],
    });

    expect(verdict.kind).toBe('deliverable');
  });

  it('returns deliverable when entries carry extra fields alongside url', async () => {
    // OpenAI image gen also returns `revised_prompt` for some models.
    // Extra fields shouldn't disturb the classifier.
    const verdict = await classifyOpenAiImagesResponse(jsonResponse(200), {
      data: [
        {
          url: 'https://blob.vercel/img-1.png',
          revised_prompt: 'a frog in a pond, photorealistic',
        },
      ],
    });

    expect(verdict.kind).toBe('deliverable');
  });
});

// ─── Path 3: mixed (some legs succeeded, some failed) ─────────────────

describe('classifyOpenAiImagesResponse — mixed verdict (fractional charge)', () => {
  it('returns mixed with chargedFraction = 3/4 for the canonical D-6 case', async () => {
    const verdict = await classifyOpenAiImagesResponse(jsonResponse(200), {
      data: [
        { url: 'https://blob.vercel/img-1.png' },
        { url: 'https://blob.vercel/img-2.png' },
        { url: 'https://blob.vercel/img-3.png' },
        { error: { code: 'rate_limit_exceeded' } },
      ],
    });

    expect(verdict.kind).toBe('mixed');
    if (verdict.kind === 'mixed') {
      expect(verdict.chargedFraction).toBe(3 / 4);
      expect(verdict.reason).toBe('3/4 images delivered');
    }
  });

  it('returns mixed with chargedFraction = 1/2 for n=2 with 1 failure', async () => {
    const verdict = await classifyOpenAiImagesResponse(jsonResponse(200), {
      data: [
        { url: 'https://blob.vercel/img-1.png' },
        { error: { code: 'content_policy_violation' } },
      ],
    });

    expect(verdict.kind).toBe('mixed');
    if (verdict.kind === 'mixed') {
      expect(verdict.chargedFraction).toBe(0.5);
      expect(verdict.reason).toBe('1/2 images delivered');
    }
  });

  it('returns mixed with chargedFraction = 1/3 for n=3 with 2 failures', async () => {
    const verdict = await classifyOpenAiImagesResponse(jsonResponse(200), {
      data: [
        { url: 'https://blob.vercel/img-1.png' },
        { error: { code: 'rate_limit' } },
        { error: { code: 'rate_limit' } },
      ],
    });

    expect(verdict.kind).toBe('mixed');
    if (verdict.kind === 'mixed') {
      expect(verdict.chargedFraction).toBeCloseTo(1 / 3, 10);
      expect(verdict.reason).toBe('1/3 images delivered');
    }
  });
});

// ─── Path 1 revisited: refundable when 200 but all legs failed ───────

describe('classifyOpenAiImagesResponse — refundable verdict (200 OK but all legs failed)', () => {
  it('returns refundable with all-images-failed when every leg has no url', async () => {
    const verdict = await classifyOpenAiImagesResponse(jsonResponse(200), {
      data: [
        { error: { code: 'rate_limit' } },
        { error: { code: 'content_policy_violation' } },
      ],
    });

    expect(verdict.kind).toBe('refundable');
    if (verdict.kind === 'refundable') {
      expect(verdict.reason).toBe('all-images-failed');
    }
  });

  it('returns refundable with all-images-failed when data is an empty array', async () => {
    // Vendor returned 200 with no images at all — the user got nothing.
    const verdict = await classifyOpenAiImagesResponse(jsonResponse(200), {
      data: [],
    });

    expect(verdict.kind).toBe('refundable');
    if (verdict.kind === 'refundable') {
      expect(verdict.reason).toBe('all-images-failed');
    }
  });
});

// ─── Defensive: shapes we haven't seen yet → permissive deliverable ──

describe('classifyOpenAiImagesResponse — defensive (unrecognized shapes fall through to deliverable)', () => {
  it('returns deliverable when body has no data field at all', async () => {
    // A 200 with a totally unfamiliar shape — fall through to deliverable
    // (charge for what we did get) rather than refunding speculatively.
    const verdict = await classifyOpenAiImagesResponse(jsonResponse(200), {
      created: 12345,
    });

    expect(verdict.kind).toBe('deliverable');
  });

  it('returns deliverable when data is not an array (e.g. { data: { ... } })', async () => {
    const verdict = await classifyOpenAiImagesResponse(jsonResponse(200), {
      data: { url: 'https://blob.vercel/img-1.png' },
    });

    expect(verdict.kind).toBe('deliverable');
  });

  it('returns deliverable when body is null', async () => {
    const verdict = await classifyOpenAiImagesResponse(jsonResponse(200), null);
    expect(verdict.kind).toBe('deliverable');
  });

  it('returns deliverable when body is undefined', async () => {
    const verdict = await classifyOpenAiImagesResponse(jsonResponse(200), undefined);
    expect(verdict.kind).toBe('deliverable');
  });

  it('returns deliverable when body is a string', async () => {
    const verdict = await classifyOpenAiImagesResponse(jsonResponse(200), 'unexpected');
    expect(verdict.kind).toBe('deliverable');
  });
});

// ─── Defensive: malformed entries inside `data` ──────────────────────

describe('classifyOpenAiImagesResponse — defensive (malformed entries in data)', () => {
  it('treats null entries as failures (not counted as success)', async () => {
    const verdict = await classifyOpenAiImagesResponse(jsonResponse(200), {
      data: [{ url: 'https://blob.vercel/img-1.png' }, null],
    });

    expect(verdict.kind).toBe('mixed');
    if (verdict.kind === 'mixed') {
      expect(verdict.chargedFraction).toBe(0.5);
    }
  });

  it('treats string entries as failures (not counted as success)', async () => {
    const verdict = await classifyOpenAiImagesResponse(jsonResponse(200), {
      data: [{ url: 'https://blob.vercel/img-1.png' }, 'wat'],
    });

    expect(verdict.kind).toBe('mixed');
    if (verdict.kind === 'mixed') {
      expect(verdict.chargedFraction).toBe(0.5);
    }
  });

  it('treats entries with b64_json but no url as failures (transform must run first)', async () => {
    // Defensive: if someone removes the transform from the route, the
    // classifier here forces a fix by refunding. We don't try to
    // recover by serving b64 — audric-side rendering depends on URLs.
    const verdict = await classifyOpenAiImagesResponse(jsonResponse(200), {
      data: [{ b64_json: 'aGVsbG8=' }, { b64_json: 'aGVsbG8=' }],
    });

    expect(verdict.kind).toBe('refundable');
    if (verdict.kind === 'refundable') {
      expect(verdict.reason).toBe('all-images-failed');
    }
  });
});

// ─── Pricing math integration with computeChargeAmount ───────────────

describe('classifyOpenAiImagesResponse — pricing math sanity (integration with computeChargeAmount)', () => {
  it('the canonical D-6 charge math: $0.20 × 3/4 = $0.15', async () => {
    // This test pins the contract between this classifier and the
    // chargeProxy `computeChargeAmount` helper. The shipped flow is:
    //   classifier returns chargedFraction = 3/4
    //   chargeProxy floors `0.20 * 0.75 * 1_000_000 / 1_000_000` = '0.150000'
    // If anyone changes the classifier's chargedFraction calculation,
    // the gateway.settle-on-success.test.ts mixed-verdict assertion
    // ('amount: "0.150000"') will fail.
    const verdict = await classifyOpenAiImagesResponse(jsonResponse(200), {
      data: [
        { url: 'a' },
        { url: 'b' },
        { url: 'c' },
        { error: { code: 'fail' } },
      ],
    });

    expect(verdict.kind).toBe('mixed');
    if (verdict.kind === 'mixed') {
      expect(verdict.chargedFraction).toBe(0.75);
    }
  });
});
