/// Confidential-inference receipt anchor — SPEC_CONFIDENTIAL_API v3.0, Phase C.
///
/// Anchors a t2000 Private API *confidential* response receipt on Sui:
/// tamper-evident, publicly timestamped, on-chain. It emits one event
/// committing the receipt id + the response wire-hash + the attested ACI
/// workload id. The FULL signed receipt lives off-chain (the Phala/RedPill ACI
/// gateway, fetchable at `/v1/aci/receipts/{id}`; Walrus later) — this is the
/// minimal on-chain COMMITMENT that makes it Sui-verifiable.
///
/// Wedge: RedPill anchors confidential proofs on Ethereum / Automata-DCAP. This
/// is the only Sui-native anchor — the verifier (Phase D) reads the emitted
/// event (via the anchoring tx digest recorded alongside the receipt) and
/// confirms the held receipt's `wire_hash` + `workload_id` match what's on Sui.
///
/// Design: EVENT-ONLY (no shared object) — cheapest, no state growth, no
/// registry contention, queryable by the indexer/verifier. PERMISSIONLESS to
/// call (anyone can anchor a receipt they hold; the event records `anchored_by`)
/// — the value is the public, timestamped record, not gated write access.
module confidential_anchor::anchor;

use std::string::String;
use sui::clock::Clock;
use sui::event;

/// Emitted once per anchored confidential receipt.
public struct ReceiptAnchored has copy, drop {
    /// The ACI receipt id (`rcpt-…`) — links to the off-chain signed receipt.
    receipt_id: String,
    /// sha256 of the returned response wire bytes (from the receipt's
    /// `response.returned.wire_hash`) — what the verifier matches.
    wire_hash: String,
    /// The attested ACI workload id (ties the anchor to the attestation report
    /// at `/v1/aci/attestation`).
    workload_id: String,
    /// The receipt's `served_at` (epoch ms) — the off-chain CLAIM from the
    /// signed receipt (cross-check, not the trust anchor).
    served_at_ms: u64,
    /// On-chain time of THIS anchoring tx (`Clock`) — the trustless,
    /// consensus-stamped record time. The verifier can assert
    /// `anchored_at_ms >= served_at_ms` (can't anchor before it was served).
    anchored_at_ms: u64,
    /// Who submitted the anchor (t2000's anchor signer, in normal operation).
    anchored_by: address,
}

/// Anchor a confidential receipt commitment on Sui. Permissionless by design.
public fun anchor_receipt(
    receipt_id: String,
    wire_hash: String,
    workload_id: String,
    served_at_ms: u64,
    clock: &Clock,
    ctx: &TxContext,
) {
    event::emit(ReceiptAnchored {
        receipt_id,
        wire_hash,
        workload_id,
        served_at_ms,
        anchored_at_ms: clock.timestamp_ms(),
        anchored_by: ctx.sender(),
    });
}
