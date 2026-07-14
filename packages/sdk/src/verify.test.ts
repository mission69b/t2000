import { ed25519 } from '@noble/curves/ed25519';
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { describe, expect, it } from 'vitest';
import { verifyReceiptSignature } from './verify.js';

type Receipt = Parameters<typeof verifyReceiptSignature>[0];

// JCS mirror of verify.ts (sorted keys, integers only) — used to produce the
// exact bytes the gateway signs, so these tests exercise real signatures.
function jcs(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${jcs(obj[k])}`).join(',')}}`;
}

// A receipt in the CURRENT gateway shape — note the `model` field, which is
// NOT one of the 10 legacy protocol fields (the regression this file guards:
// the verifier must canonicalise the receipt AS SERVED, not a fixed field list).
function baseReceipt(): Record<string, unknown> {
  return {
    api_version: 'aci/1',
    receipt_id: 'rcpt-test',
    chat_id: 'chat-1',
    model: 'z-ai/glm-5.2',
    workload_id: 'sha256:workload',
    workload_keyset_digest: 'sha256:keyset',
    endpoint: '/v1/chat/completions',
    method: 'POST',
    served_at: 1784067123,
    event_log: [
      { seq: 0, type: 'request.received', body_hash: 'sha256:req' },
      { seq: 1, type: 'response.returned', wire_hash: 'sha256:wire' },
    ],
  };
}

describe('verifyReceiptSignature — ed25519 (current scheme)', () => {
  const priv = ed25519.utils.randomPrivateKey();
  const pubHex = bytesToHex(ed25519.getPublicKey(priv));

  function signed(): Receipt {
    const r = baseReceipt();
    r.signature = { algo: 'ed25519', key_id: 'dstack-kms-receipt-ed25519-v1' };
    const sig = ed25519.sign(new TextEncoder().encode(jcs(r)), priv);
    (r.signature as Record<string, unknown>).value = bytesToHex(sig);
    return r as Receipt;
  }

  it('verifies a signature over the raw JCS of the receipt as served', () => {
    expect(verifyReceiptSignature(signed(), pubHex)).toBe(true);
  });

  it('accepts a 0x-prefixed attested key', () => {
    expect(verifyReceiptSignature(signed(), `0x${pubHex}`)).toBe(true);
  });

  it('fails when any field is altered after signing', () => {
    const r = signed() as unknown as Record<string, unknown>;
    r.model = 'someone/else';
    expect(verifyReceiptSignature(r as unknown as Receipt, pubHex)).toBe(false);
  });

  it('fails against a different attested key', () => {
    const otherPub = bytesToHex(
      ed25519.getPublicKey(ed25519.utils.randomPrivateKey())
    );
    expect(verifyReceiptSignature(signed(), otherPub)).toBe(false);
  });
});

describe('verifyReceiptSignature — ecdsa-secp256k1 (legacy scheme)', () => {
  const priv = secp256k1.utils.randomPrivateKey();
  const pubHex = bytesToHex(secp256k1.getPublicKey(priv, false));

  function signedLegacy(): Receipt {
    const r = baseReceipt();
    // Legacy receipts predate `model` — the signed value is the fixed 10-field
    // canonical object.
    delete r.model;
    const canonical = {
      api_version: r.api_version,
      receipt_id: r.receipt_id,
      chat_id: r.chat_id,
      workload_id: r.workload_id,
      workload_keyset_digest: r.workload_keyset_digest,
      endpoint: r.endpoint,
      method: r.method,
      served_at: r.served_at,
      event_log: r.event_log,
      signature: { algo: 'ecdsa-secp256k1', key_id: 'k1' },
    };
    const prehash = sha256(new TextEncoder().encode(jcs(canonical)));
    const sig = secp256k1.sign(prehash, priv);
    const value = `${sig.toCompactHex()}${(sig.recovery ?? 0)
      .toString(16)
      .padStart(2, '0')}`;
    r.signature = { algo: 'ecdsa-secp256k1', key_id: 'k1', value };
    return r as Receipt;
  }

  it('recovers the signer and matches the attested key', () => {
    expect(verifyReceiptSignature(signedLegacy(), pubHex)).toBe(true);
  });

  it('fails against a different attested key', () => {
    const otherPub = bytesToHex(
      secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey(), false)
    );
    expect(verifyReceiptSignature(signedLegacy(), otherPub)).toBe(false);
  });

  it('fails when the receipt is altered after signing', () => {
    const r = signedLegacy() as unknown as Record<string, unknown>;
    r.served_at = 1;
    expect(verifyReceiptSignature(r as unknown as Receipt, pubHex)).toBe(false);
  });
});

describe('verifyReceiptSignature — malformed input', () => {
  it('fails on unknown algo / missing value', () => {
    const r = baseReceipt();
    r.signature = { algo: 'rsa', value: 'aa' };
    expect(verifyReceiptSignature(r as unknown as Receipt, 'aa')).toBe(false);
    r.signature = { algo: 'ed25519' };
    expect(verifyReceiptSignature(r as unknown as Receipt, 'aa')).toBe(false);
  });
});
