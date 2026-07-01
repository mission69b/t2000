import { SuiGrpcClient } from '@mysten/sui/grpc';
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { DEFAULT_API_BASE } from './inference.js';

// Confidential receipt verifier (SPEC_CONFIDENTIAL_API v3.0, Phase D).
//
// Lets anyone CHECK — not just trust — a t2000 confidential response, by
// receipt id. The Sui-anchor check is FULLY TRUSTLESS: it reads the on-chain
// `ReceiptAnchored` event straight from a public Sui fullnode and confirms the
// committed `wire_hash` + `workload_id` match the signed receipt — t2000 can't
// forge that (a wrong/missing anchor → fails closed). The confidential-upstream
// check reads the attestation evidence embedded in the signed receipt
// (`upstream.verified`).
//
// All three core checks are trustless client-side: the Sui anchor (read from a
// fullnode), the receipt signature (recompute dstack ACI canonical bytes per
// `canonical.rs` + recover the secp256k1 signer, §9.4), and the TDX quote
// (@phala/dcap-qvl chains to Intel's root — removing the server-side-DCAP SPOF).
// The remaining hop is keyset_endorsement (tying the receipt key to the quote's
// identity key); the receipt-sig check already proves the receipt is signed by
// the published keyset key. Per the spec: a wrong "verifiable" claim is worse
// than honest ZDR — so each check states exactly what it proves.

const RECEIPT_ANCHORED_SUFFIX = '::anchor::ReceiptAnchored';

export type CheckStatus = 'pass' | 'fail' | 'skip';
export type TrustMode = 'trustless' | 'receipt-asserted' | 'roadmap';

export interface VerifyCheck {
  name: string;
  status: CheckStatus;
  detail: string;
  trust: TrustMode;
}

export interface VerifyAnchor {
  txDigest: string;
  anchoredAtMs?: string;
  anchoredBy?: string;
  explorer: string;
}

/** A typed TCB claim from the attested upstream (dstack ACI §tcb-and-claims). */
export interface UpstreamClaim {
  name: string;
  status: string;
  source?: string;
}

export interface VerifyUpstream {
  provider?: string;
  modelId?: string;
  result?: string;
  tcbStatus?: string;
  /** The attested-session id (`as_…`) — resolve at GET /v1/aci/sessions/{id}. */
  sessionId?: string;
  /** Typed TCB claims (tee_attested, tcb_up_to_date, gpu_attested, …). */
  claims?: UpstreamClaim[];
}

export interface VerifyResult {
  receiptId: string;
  /** True iff the receipt resolved AND its on-chain Sui anchor matches. */
  verified: boolean;
  /** The trustless core: an on-chain ReceiptAnchored event matches the receipt. */
  anchorVerified: boolean;
  checks: VerifyCheck[];
  wireHash?: string;
  workloadId?: string;
  upstream?: VerifyUpstream;
  anchor?: VerifyAnchor;
}

export interface VerifyOptions {
  /** Override the API base (default `api.t2000.ai/v1`). */
  apiBase?: string;
  /** Sui network for the trustless anchor read (default `mainnet`). */
  network?: 'mainnet' | 'testnet';
  /** Confidential model id for fetching the attested receipt-signing key
   *  (default `phala/glm-5.2`; the gateway key is workload-wide). */
  model?: string;
  /** Skip the local DCAP quote verification (the slower, network-bound check). */
  skipQuote?: boolean;
}

interface AciReceiptSignature {
  algo?: string;
  key_id?: string;
  value?: string;
}

interface AciReceipt {
  api_version?: string;
  receipt_id?: string;
  chat_id?: string | null;
  workload_id?: string;
  workload_keyset_digest?: string;
  endpoint?: string;
  method?: string;
  served_at?: number;
  signature?: AciReceiptSignature;
  event_log?: {
    type?: string;
    wire_hash?: string;
    result?: string;
    provider?: string;
    upstream_name?: string;
    model_id?: string;
    tcb_status?: string;
    session_id?: string;
    claims?:
      | Record<string, { status?: string; source?: string }>
      | { name?: string; status?: string; source?: string }[];
  }[];
}

/** Normalize ACI claims (object-map or array) into a typed list. */
function normalizeClaims(
  claims:
    | Record<string, { status?: string; source?: string }>
    | { name?: string; status?: string; source?: string }[]
    | undefined
): UpstreamClaim[] {
  if (!claims) {
    return [];
  }
  if (Array.isArray(claims)) {
    return claims
      .filter((c) => c.name)
      .map((c) => ({
        name: c.name as string,
        status: c.status ?? 'unknown',
        source: c.source,
      }));
  }
  return Object.entries(claims).map(([name, v]) => ({
    name,
    status: v?.status ?? 'unknown',
    source: v?.source,
  }));
}

function fullnodeUrl(network: 'mainnet' | 'testnet'): string {
  return network === 'testnet'
    ? 'https://fullnode.testnet.sui.io'
    : 'https://fullnode.mainnet.sui.io';
}

type Jsonish = string | number | boolean | null | Jsonish[] | { [k: string]: Jsonish };

// JCS (RFC 8785 subset) matching the dstack ACI gateway's `canonical.rs`:
// object keys sorted by UTF-16 code units (JS default string order on the BMP),
// integers only, no whitespace. JSON.stringify's string-escaping already matches
// the gateway's (\b \t \n \f \r, \u00xx for other controls, non-ASCII verbatim).
function jcs(value: Jsonish): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new Error('JCS: non-integer number');
    }
    return String(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(jcs).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${jcs(value[k])}`).join(',')}}`;
}

// Verify the ACI receipt signature per dstack §9.4: ecdsa-secp256k1, a 65-byte
// `r‖s‖v` signature over `sha256(JCS(receipt with signature.value omitted))`;
// recover the public key and require it to equal the attested receipt-signing
// key. Returns true only on a genuine match (any error → false).
function verifyReceiptSignature(receipt: AciReceipt, signingKeyHex: string): boolean {
  try {
    const sig = receipt.signature;
    if (sig?.algo !== 'ecdsa-secp256k1' || !sig.value) {
      return false;
    }
    // Reconstruct the exact canonical value: the 10 protocol fields, with the
    // signature object stripped of `value` (event_log entries are already the
    // flat {seq,type,...fields} shape the gateway canonicalises).
    const canonical: Jsonish = {
      api_version: receipt.api_version ?? '',
      receipt_id: receipt.receipt_id ?? '',
      chat_id: receipt.chat_id ?? null,
      workload_id: receipt.workload_id ?? '',
      workload_keyset_digest: receipt.workload_keyset_digest ?? '',
      endpoint: receipt.endpoint ?? '',
      method: receipt.method ?? '',
      served_at: receipt.served_at ?? 0,
      event_log: (receipt.event_log ?? []) as unknown as Jsonish,
      signature: { algo: sig.algo, key_id: sig.key_id ?? '' },
    };
    const prehash = sha256(new TextEncoder().encode(jcs(canonical)));

    const sigBytes = hexToBytes(sig.value);
    if (sigBytes.length !== 65) {
      return false;
    }
    let v = sigBytes[64];
    if (v >= 27 && v <= 30) {
      v -= 27;
    }
    if (v > 3) {
      return false;
    }
    const recovered = secp256k1.Signature.fromCompact(sigBytes.slice(0, 64))
      .addRecoveryBit(v)
      .recoverPublicKey(prehash)
      .toHex(false);
    const endorsed = bytesToHex(hexToBytes(signingKeyHex.replace(/^0x/, '')));
    return recovered.toLowerCase() === endorsed.toLowerCase();
  } catch {
    return false;
  }
}

interface QuoteCheck {
  status: CheckStatus;
  detail: string;
  /** Definitively bad (verify the chain failed) — flips overall `verified`. */
  forged: boolean;
  tcbStatus?: string;
}

// TDX quote verification — TRUSTLESS, client-side (SPEC_CONFIDENTIAL_API Phase D
// hardening). This is what removes the server-side-DCAP SPOF: instead of
// trusting the gateway's `verified:true`, the client re-verifies the quote.
//  1. @phala/dcap-qvl verifies the TDX quote, chaining to Intel's root CA via
//     PCCS collateral (Intel-signed, so the PCCS is a cache, not a trust point)
//     → genuine enclave + TCB status.
//  2. confirm the genuine quote's `report_data` commits the report's
//     `signing_address` (the attested gateway identity) — so the report's TEE
//     binding is quote-backed, not fabricated — and that the quote is for the
//     same `workload_id` as the receipt.
// (Tying the receipt-signing key to the identity key via keyset_endorsement is a
//  further hop; the receipt-signature check already proves the receipt is signed
//  by the published keyset key.)
interface AttReport {
  workload_id?: string;
  signing_address?: string;
  attestation?: { evidence?: { quote?: string } };
}

async function verifyTdxQuote(
  base: string,
  model: string,
  receiptWorkloadId: string
): Promise<QuoteCheck> {
  let nonce: string;
  try {
    nonce = bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(32)));
  } catch {
    return { status: 'skip', detail: 'no secure RNG available', forged: false };
  }

  let report: AttReport | undefined;
  try {
    const res = await fetch(
      `${base}/aci/attestation?model=${encodeURIComponent(model)}&nonce=${nonce}`
    );
    if (res.ok) {
      report = ((await res.json()) as { report?: AttReport }).report;
    }
  } catch {
    // network — fall through to skip
  }
  const quoteHex = report?.attestation?.evidence?.quote;
  if (!quoteHex) {
    return {
      status: 'skip',
      detail: 'attestation report (with quote) unavailable — pass --model?',
      forged: false,
    };
  }

  try {
    // `@phala/dcap-qvl` is CJS. When the SDK is bundled (e.g. into the CLI) and
    // hit via dynamic import, its named exports land under `.default`; unbundled
    // Node hoists them to the top level. Resolve both so it works either way.
    const dcap = await import('@phala/dcap-qvl');
    const getCollateralAndVerify =
      dcap.getCollateralAndVerify ?? dcap.default?.getCollateralAndVerify;
    if (typeof getCollateralAndVerify !== 'function') {
      return {
        status: 'fail',
        forged: false,
        detail: 'DCAP verifier unavailable in this build',
      };
    }
    const quoteBytes = hexToBytes(quoteHex.replace(/^0x/, ''));
    // Throws if the quote isn't a genuine TDX quote chaining to Intel's root.
    const vr = await getCollateralAndVerify(quoteBytes);
    const td = vr.report.asTd10() ?? vr.report.asTd15()?.base ?? null;
    const reportData = td?.reportData;
    const signingAddr = report?.signing_address?.replace(/^0x/, '').toLowerCase();
    const addrBound = Boolean(
      reportData &&
        signingAddr &&
        bytesToHex(reportData.slice(0, 20)) === signingAddr
    );
    const workloadMatch = report?.workload_id === receiptWorkloadId;
    const tcb = vr.status;
    const tcbBad = tcb === 'Revoked' || tcb === 'Unknown';
    const forged = !(addrBound && workloadMatch) || tcbBad;
    let detail: string;
    if (forged && tcbBad) {
      detail = `genuine TDX but TCB ${tcb}`;
    } else if (!addrBound) {
      detail = "report_data does NOT commit the report's signing address";
    } else if (!workloadMatch) {
      detail = "quote workload_id does not match the receipt's";
    } else {
      detail = `genuine Intel TDX (verified vs Intel collateral), TCB ${tcb}; report_data commits the attested signing address`;
    }
    return { status: forged ? 'fail' : 'pass', forged, tcbStatus: tcb, detail };
  } catch (e) {
    // A thrown verify is usually a PCCS/collateral/network issue, not a real
    // forgery from our own gateway — surface it but don't claim "forged".
    return {
      status: 'fail',
      forged: false,
      detail: `could not verify the quote: ${e instanceof Error ? e.message : 'error'}`,
    };
  }
}

/**
 * Verify a confidential response by its receipt id. Reads the signed receipt
 * (public), its on-chain Sui anchor (trustless), and reports a per-check result
 * that FAILS CLOSED on any forgery or mismatch.
 */
export async function verifyReceipt(
  receiptId: string,
  opts: VerifyOptions = {},
): Promise<VerifyResult> {
  const base = opts.apiBase ?? DEFAULT_API_BASE;
  const network = opts.network ?? 'mainnet';
  const checks: VerifyCheck[] = [];

  // === 1. Receipt — fetch + structural soundness (public, no key) ===
  let receipt: AciReceipt | null = null;
  try {
    const res = await fetch(`${base}/aci/receipts/${encodeURIComponent(receiptId)}`);
    if (res.ok) {
      receipt = (await res.json()) as AciReceipt;
    }
  } catch {
    // network error → receipt stays null → fails closed below
  }
  if (!receipt?.event_log) {
    checks.push({
      name: 'Receipt',
      status: 'fail',
      detail: 'receipt not found or malformed',
      trust: 'receipt-asserted',
    });
    return { receiptId, verified: false, anchorVerified: false, checks };
  }
  const wireHash = receipt.event_log.find((e) => e.type === 'response.returned')
    ?.wire_hash;
  const workloadId = receipt.workload_id;
  checks.push({
    name: 'Receipt',
    status: wireHash && workloadId ? 'pass' : 'fail',
    detail: wireHash
      ? `well-formed (${receipt.event_log.length} log entries, workload ${workloadId})`
      : 'missing response wire_hash / workload_id',
    trust: 'receipt-asserted',
  });

  // === 2. Confidential upstream — attestation evidence in the signed receipt ===
  const upstreamEv = receipt.event_log.find((e) => e.type === 'upstream.verified');
  const upstreamOk = upstreamEv?.result === 'verified';
  const claims = normalizeClaims(upstreamEv?.claims);
  checks.push({
    name: 'Confidential upstream',
    status: upstreamEv ? (upstreamOk ? 'pass' : 'fail') : 'skip',
    detail: upstreamEv
      ? `${upstreamEv.provider ?? upstreamEv.upstream_name ?? 'upstream'}: ${upstreamEv.result ?? 'unknown'}${upstreamEv.tcb_status ? ` (TCB ${upstreamEv.tcb_status})` : ''}`
      : 'no upstream.verified event (routed/non-confidential?)',
    trust: 'receipt-asserted',
  });

  // === 3. Sui anchor — TRUSTLESS: read the on-chain event from a fullnode ===
  let anchorVerified = false;
  let anchor: VerifyAnchor | undefined;
  let digest: string | undefined;
  try {
    const res = await fetch(`${base}/aci/anchor/${encodeURIComponent(receiptId)}`);
    if (res.ok) {
      const j = (await res.json()) as { txDigest?: string };
      digest = j.txDigest;
    }
  } catch {
    // no anchor lookup → fails the anchor check below
  }
  if (!digest) {
    checks.push({
      name: 'Sui anchor',
      status: 'fail',
      detail: `no anchor on record — POST ${base}/aci/anchor/${receiptId} to create one`,
      trust: 'trustless',
    });
  } else {
    try {
      const client = new SuiGrpcClient({ baseUrl: fullnodeUrl(network), network });
      const tx = await client.core.getTransaction({
        digest,
        include: { events: true },
      });
      const txn = tx.$kind === 'Transaction' ? tx.Transaction : tx.FailedTransaction;
      const ev = (txn.events ?? []).find((e) =>
        e.eventType.endsWith(RECEIPT_ANCHORED_SUFFIX),
      );
      const data = (ev?.json ?? {}) as Record<string, unknown>;
      const onChainReceipt = String(data.receipt_id ?? '');
      const onChainWire = String(data.wire_hash ?? '');
      const onChainWorkload = String(data.workload_id ?? '');
      const matches =
        onChainReceipt === receiptId &&
        onChainWire === wireHash &&
        onChainWorkload === workloadId;
      anchorVerified = matches;
      anchor = {
        txDigest: digest,
        anchoredAtMs: data.anchored_at_ms ? String(data.anchored_at_ms) : undefined,
        anchoredBy: data.anchored_by ? String(data.anchored_by) : undefined,
        explorer: `https://suiscan.xyz/${network}/tx/${digest}`,
      };
      checks.push({
        name: 'Sui anchor',
        status: matches ? 'pass' : 'fail',
        detail: matches
          ? `on-chain ReceiptAnchored matches (wire_hash + workload_id), tx ${digest}`
          : `on-chain event does NOT match the receipt (wire ${onChainWire || 'absent'})`,
        trust: 'trustless',
      });
    } catch (e) {
      checks.push({
        name: 'Sui anchor',
        status: 'fail',
        detail: `could not read anchor tx ${digest}: ${e instanceof Error ? e.message : 'error'}`,
        trust: 'trustless',
      });
    }
  }

  // === 4. Receipt signature — recover the signer + match the attested key ===
  // The signing key (gateway receipt key) is workload-wide; fetch the attested
  // keyset and confirm its workload matches this receipt before trusting it.
  let sigStatus: CheckStatus = 'skip';
  let sigDetail = 'no signature on receipt';
  if (receipt.signature?.value) {
    try {
      const model = opts.model ?? 'phala/glm-5.2';
      const res = await fetch(
        `${base}/aci/attestation?model=${encodeURIComponent(model)}`,
      );
      const att = res.ok
        ? ((await res.json()) as { signingKey?: string; workloadId?: string })
        : null;
      if (!att?.signingKey) {
        sigDetail = 'could not fetch the attested keyset to check the signature';
      } else if (att.workloadId && att.workloadId !== workloadId) {
        sigDetail = `attested keyset is for a different workload — pass --model for ${workloadId}`;
      } else {
        const ok = verifyReceiptSignature(receipt, att.signingKey);
        sigStatus = ok ? 'pass' : 'fail';
        sigDetail = ok
          ? `signed by the attested receipt key (${receipt.signature.key_id ?? 'key'})`
          : 'signature does NOT recover the attested receipt key — forged/altered';
      }
    } catch {
      sigDetail = 'signature check errored';
    }
  }
  checks.push({
    name: 'Receipt signature',
    status: sigStatus,
    detail: sigDetail,
    trust: sigStatus === 'skip' ? 'roadmap' : 'trustless',
  });

  // === 5. TDX quote (DCAP) — verify the quote genuine + fresh, client-side ===
  if (opts.skipQuote) {
    checks.push({
      name: 'TDX quote (DCAP)',
      status: 'skip',
      detail: 'skipped (--quick)',
      trust: 'trustless',
    });
  } else {
    const q = await verifyTdxQuote(
      base,
      opts.model ?? 'phala/glm-5.2',
      workloadId ?? ''
    );
    checks.push({
      name: 'TDX quote (DCAP)',
      status: q.status,
      detail: q.detail,
      trust: 'trustless',
    });
  }

  // FAIL CLOSED: a sound receipt AND no trustless check left in `fail`. A DCAP
  // (or anchor/signature) check that errored counts as fail — "couldn't prove"
  // is "not verified"; we never report verified on an unchecked/failed quote.
  const trustlessFailed = checks.some(
    (c) => c.trust === 'trustless' && c.status === 'fail'
  );
  return {
    receiptId,
    verified: Boolean(wireHash && workloadId) && !trustlessFailed,
    anchorVerified,
    checks,
    wireHash,
    workloadId,
    upstream: upstreamEv
      ? {
          provider: upstreamEv.provider ?? upstreamEv.upstream_name,
          modelId: upstreamEv.model_id,
          result: upstreamEv.result,
          tcbStatus: upstreamEv.tcb_status,
          sessionId: upstreamEv.session_id,
          claims: claims.length > 0 ? claims : undefined,
        }
      : undefined,
    anchor,
  };
}
