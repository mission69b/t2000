/// Batch openings — wave post (SPEC_MARKETPLACE_BATCH_OPENINGS, Phase D /
/// S.1193). ONE post = N homogeneous slots on the open board, backed by a
/// SINGLE escrow balance of `amount × slots_total`. Each claimed slot
/// splits `amount` out and mints a normal `escrow::Job` (ClaimedJobKey
/// stamped by `create_claimed`, exactly like a single-opening claim), so
/// settle / reject / refund / decline are unchanged downstream.
///
///   create_batch_open ──batch_claim × N (sellers, FCFS)──▶ N normal Jobs
///   create_batch_open ──cancel_batch_open (buyer)──▶ refund remainder, fee-free
///   create_batch_open ──refund_batch_expired (ANYONE, past open_until)──▶ same
///
/// Design notes (annex + Build risk control, locked):
/// - **Additive upgrade (S.1064-style).** A NEW module + NEW shared type +
///   NEW entries only — no live signature changes, so no FeeConfig VERSION
///   bump and no migrate. Entries still gate on the live VERSION via
///   `escrow::assert_version_pkg` like every sibling.
/// - **Escrow invariant** — `escrow.value() == amount * slots_remaining`,
///   asserted after every mutation (claim / cancel / refund). The last
///   claim drains the balance to zero.
/// - **Filled batches are NOT deleted in v1.** `claims_by_agent` is a
///   `Table` that cannot be dropped while non-empty; a drained batch stays
///   shared with `slots_remaining == 0` and an empty balance (the
///   invariant holds at 0 × amount). The indexer derives `filled`.
/// - **Phase C gates reused verbatim at claim**: claimer's OWN
///   `&mut AgentScore` (ownership asserted), claim policy 0/1/2,
///   `min_seller_level` on the EFFECTIVE level, and the per-level active
///   cap — a batch slot occupies a seat exactly like a single claim. On
///   top, `max_claims_per_agent` bounds slots PER WAVE (default 1): one
///   hunter cannot hoard a wave even below their global cap.
/// - **One claim per tx (v1 lock, founder 2026-08-25)** — no multi-claim
///   PTBs; `max_claims_per_agent > 1` means sequential claim txs.
/// - **Per-slot amount bounds only.** `amount` obeys the live min/max job
///   bounds; the TOTAL (`amount × slots`) is deliberately unbounded here —
///   the wallet balance and the desk's own budget bound it.
module a2a_escrow::batch;

use a2a_escrow::escrow::{Self, FeeConfig};
use a2a_escrow::reputation::{Self, AgentScore};
use agent_id::registry::{Self, Registry};
use sui::balance::Balance;
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;
use sui::table::{Self, Table};

/// Claim policies mirror `opening` (0 Anyone · 1 Proven · 2 Proven·4★+).
const CLAIM_POLICY_ANY_ACTIVE: u8 = 0;
const CLAIM_POLICY_MIN_AVG: u8 = 2;
/// Board TTL cap — same 30 days as single openings.
const MAX_OPEN_WINDOW_MS: u64 = 2_592_000_000;

// === Errors ===
const EBadSlots: u64 = 0;
const EBadClaimPolicy: u64 = 1;
const EBadMinSellerLevel: u64 = 2;
const EBadMaxClaims: u64 = 3;
/// Payment must be an EXACT multiple of a non-zero per-slot amount.
const EBadPayment: u64 = 4;
const EOpenWindowInPast: u64 = 5;
const EOpenWindowTooFar: u64 = 6;
const ESlaOutOfRange: u64 = 7;
const EReviewWindowTooLong: u64 = 8;
/// Open-board rule (S.1019): reject pays the buyer in full — batches too.
const EOpenRejectMustBeFullBuyer: u64 = 9;
const EBatchExpired: u64 = 10;
const ENoSlotsRemaining: u64 = 11;
/// This agent already holds `max_claims_per_agent` slots of THIS batch.
const EMaxClaimsReached: u64 = 12;
const EClaimerIsBuyer: u64 = 13;
const ENotActiveAgent: u64 = 14;
/// The passed `AgentScore` is not the claimer's own.
const EScoreNotClaimer: u64 = 15;
const EClaimPolicyUnmet: u64 = 16;
const EMinSellerLevelUnmet: u64 = 17;
/// The claimer is at their Level's global active-job cap (Phase C).
const EActiveJobCap: u64 = 18;
const ENotBuyer: u64 = 19;
const ENotExpired: u64 = 20;
/// Defensive: the escrow invariant broke (should be unreachable).
const EEscrowInvariant: u64 = 21;

// === Objects ===

/// One wave posting. Shared so any seller can race per slot; the whole
/// wave's escrow lives inside from the moment of posting. Unlike
/// `Opening`, existence is NOT the state — `slots_remaining` is (the
/// object persists after fill/cancel; see the module note).
public struct BatchOpening<phantom T> has key {
    id: UID,
    buyer: address,
    escrow: Balance<T>,
    /// Per-slot escrow (raw units) — immutable once posted.
    amount: u64,
    slots_total: u64,
    slots_remaining: u64,
    /// Protocol fee bps snapshotted at post — travels into every Job.
    fee_bps: u64,
    /// One spec envelope for every slot (homogeneous wave).
    spec_hash: vector<u8>,
    open_until_ms: u64,
    sla_ms: u64,
    review_window_ms: u64,
    reject_split_bps: u64,
    claim_policy: u8,
    /// 0 = no floor · 1..4 = minimum EFFECTIVE seller level (Phase C).
    min_seller_level: u8,
    /// Slots one agent may claim of THIS batch (≥1; default posture 1).
    max_claims_per_agent: u8,
    claims_by_agent: Table<address, u8>,
    created_at_ms: u64,
}

// === Events (defining id = the S.1193 upgrade package — V11 pin) ===

public struct BatchOpeningCreated has copy, drop {
    batch_id: ID,
    buyer: address,
    amount: u64,
    slots_total: u64,
    fee_bps: u64,
    spec_hash: vector<u8>,
    open_until_ms: u64,
    sla_ms: u64,
    review_window_ms: u64,
    reject_split_bps: u64,
    claim_policy: u8,
    min_seller_level: u8,
    max_claims_per_agent: u8,
    timestamp_ms: u64,
}
/// One slot claimed → one normal Job. `slots_remaining` is the POST-claim
/// value — the indexer sets its column from THIS, never a SQL decrement.
public struct BatchSlotClaimed has copy, drop {
    batch_id: ID,
    job_id: ID,
    buyer: address,
    claimer: address,
    amount: u64,
    slots_remaining: u64,
    timestamp_ms: u64,
}
public struct BatchOpeningCancelled has copy, drop {
    batch_id: ID,
    buyer: address,
    refunded: u64,
    slots_cancelled: u64,
    timestamp_ms: u64,
}
public struct BatchOpeningRefunded has copy, drop {
    batch_id: ID,
    buyer: address,
    refunded: u64,
    slots_refunded: u64,
    timestamp_ms: u64,
}

// === Create (buyer locks amount × slots in ONE tx) ===

/// Post a wave: `payment` must be an exact multiple of `slots_total`; the
/// per-slot `amount` derives from the division and must satisfy the SAME
/// live min/max job bounds as a single post. Returns the batch id.
public fun create_batch_open<T>(
    payment: Coin<T>,
    slots_total: u64,
    spec_hash: vector<u8>,
    open_until_ms: u64,
    sla_ms: u64,
    review_window_ms: u64,
    reject_split_bps: u64,
    claim_policy: u8,
    min_seller_level: u8,
    max_claims_per_agent: u8,
    cfg: &FeeConfig,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    escrow::assert_version_pkg(cfg);
    assert!(
        slots_total >= 1 && slots_total <= escrow::config_max_batch_slots(cfg),
        EBadSlots,
    );
    assert!(claim_policy <= CLAIM_POLICY_MIN_AVG, EBadClaimPolicy);
    assert!(min_seller_level <= 4, EBadMinSellerLevel);
    assert!(max_claims_per_agent >= 1, EBadMaxClaims);
    let total = payment.value();
    let amount = total / slots_total;
    assert!(amount > 0 && amount * slots_total == total, EBadPayment);
    // Per-slot bounds only — the wave total is bounded by the wallet.
    escrow::assert_amount_in_bounds_pkg(cfg, amount);
    let now = clock.timestamp_ms();
    assert!(open_until_ms > now, EOpenWindowInPast);
    assert!(open_until_ms <= now + MAX_OPEN_WINDOW_MS, EOpenWindowTooFar);
    assert!(
        sla_ms > 0 && sla_ms <= escrow::max_deliver_horizon_ms_pkg(),
        ESlaOutOfRange,
    );
    assert!(
        review_window_ms <= escrow::max_review_window_ms_pkg(),
        EReviewWindowTooLong,
    );
    assert!(
        reject_split_bps == escrow::bps_denominator_pkg(),
        EOpenRejectMustBeFullBuyer,
    );
    let batch = BatchOpening<T> {
        id: object::new(ctx),
        buyer: ctx.sender(),
        escrow: payment.into_balance(),
        amount,
        slots_total,
        slots_remaining: slots_total,
        fee_bps: escrow::config_fee_bps(cfg),
        spec_hash,
        open_until_ms,
        sla_ms,
        review_window_ms,
        reject_split_bps,
        claim_policy,
        min_seller_level,
        max_claims_per_agent,
        claims_by_agent: table::new(ctx),
        created_at_ms: now,
    };
    let batch_id = batch.id.to_inner();
    event::emit(BatchOpeningCreated {
        batch_id,
        buyer: batch.buyer,
        amount,
        slots_total,
        fee_bps: batch.fee_bps,
        spec_hash: batch.spec_hash,
        open_until_ms,
        sla_ms,
        review_window_ms,
        reject_split_bps,
        claim_policy,
        min_seller_level,
        max_claims_per_agent,
        timestamp_ms: now,
    });
    transfer::share_object(batch);
    batch_id
}

// === Claim (one slot per tx — v1 lock) ===

/// Claim ONE slot: every Phase C single-claim gate, plus the wave's own
/// slot + per-agent limits. Mints a normal funded Job (ClaimedJobKey
/// stamped inside `create_claimed`) and seats the claimer's global
/// active counter. FCFS per slot — losers of a same-slot race abort on
/// the shared-object version, exactly like single openings.
public fun batch_claim<T>(
    batch: &mut BatchOpening<T>,
    registry: &Registry,
    score: &mut AgentScore,
    cfg: &FeeConfig,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    escrow::assert_version_pkg(cfg);
    let now = clock.timestamp_ms();
    let claimer = ctx.sender();
    // Locked check order (annex §batch_claim).
    assert!(now <= batch.open_until_ms, EBatchExpired);
    assert!(batch.slots_remaining > 0, ENoSlotsRemaining);
    let already = claims_of(batch, claimer);
    assert!(already < batch.max_claims_per_agent, EMaxClaimsReached);
    assert!(claimer != batch.buyer, EClaimerIsBuyer);
    assert!(registry::is_registered(registry, claimer), ENotActiveAgent);
    let record = registry::borrow_record(registry, claimer);
    assert!(registry::is_active(record), ENotActiveAgent);
    // Phase C gates, same order as opening::do_claim.
    assert!(reputation::agent(score) == claimer, EScoreNotClaimer);
    let policy = batch.claim_policy;
    if (policy != CLAIM_POLICY_ANY_ACTIVE) {
        if (policy == CLAIM_POLICY_MIN_AVG) {
            assert!(reputation::meets_min_avg(score), EClaimPolicyUnmet);
        } else {
            assert!(reputation::meets_proven(score), EClaimPolicyUnmet);
        };
    };
    let level = reputation::effective_seller_level(score, cfg);
    let cap = reputation::active_cap_for_level(cfg, level);
    assert!(reputation::active_seller_jobs(score) < cap, EActiveJobCap);
    if (batch.min_seller_level > 0) {
        assert!(
            reputation::meets_min_seller_level(score, cfg, batch.min_seller_level),
            EMinSellerLevelUnmet,
        );
    };
    // Split ONE slot's escrow → normal Job (ClaimedJobKey inside).
    let slot_escrow = batch.escrow.split(batch.amount);
    let job_id = escrow::create_claimed(
        batch.buyer,
        claimer,
        slot_escrow,
        batch.fee_bps,
        batch.spec_hash,
        now + batch.sla_ms,
        batch.review_window_ms,
        batch.reject_split_bps,
        cfg,
        clock,
        ctx,
    );
    if (table::contains(&batch.claims_by_agent, claimer)) {
        let count = table::borrow_mut(&mut batch.claims_by_agent, claimer);
        *count = *count + 1;
    } else {
        table::add(&mut batch.claims_by_agent, claimer, 1);
    };
    batch.slots_remaining = batch.slots_remaining - 1;
    assert_invariant(batch);
    reputation::increment_active(score, job_id, now);
    event::emit(BatchSlotClaimed {
        batch_id: batch.id.to_inner(),
        job_id,
        buyer: batch.buyer,
        claimer,
        amount: batch.amount,
        slots_remaining: batch.slots_remaining,
        timestamp_ms: now,
    });
    job_id
}

// === Cancel (buyer withdraws the unclaimed remainder — fee-free) ===

/// Buyer-only, any time while slots remain. Claimed slots are already
/// normal Jobs and are untouched; the batch object persists at 0 slots.
public fun cancel_batch_open<T>(
    batch: &mut BatchOpening<T>,
    cfg: &FeeConfig,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    escrow::assert_version_pkg(cfg);
    assert!(ctx.sender() == batch.buyer, ENotBuyer);
    let (refunded, slots) = drain_remainder(batch, ctx);
    event::emit(BatchOpeningCancelled {
        batch_id: batch.id.to_inner(),
        buyer: batch.buyer,
        refunded,
        slots_cancelled: slots,
        timestamp_ms: clock.timestamp_ms(),
    });
}

// === Refund (ANYONE, after open_until — fee-free crank) ===

/// Permissionless: the remainder can only ever go back to the buyer.
public fun refund_batch_expired<T>(
    batch: &mut BatchOpening<T>,
    cfg: &FeeConfig,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    escrow::assert_version_pkg(cfg);
    let now = clock.timestamp_ms();
    assert!(now > batch.open_until_ms, ENotExpired);
    let (refunded, slots) = drain_remainder(batch, ctx);
    event::emit(BatchOpeningRefunded {
        batch_id: batch.id.to_inner(),
        buyer: batch.buyer,
        refunded,
        slots_refunded: slots,
        timestamp_ms: now,
    });
}

/// Return the whole unclaimed remainder to the buyer and zero the slots.
/// Aborts when nothing remains (already filled / cancelled / refunded) so
/// replays and double-cancels fail loudly instead of minting empty events.
fun drain_remainder<T>(batch: &mut BatchOpening<T>, ctx: &mut TxContext): (u64, u64) {
    let slots = batch.slots_remaining;
    assert!(slots > 0, ENoSlotsRemaining);
    batch.slots_remaining = 0;
    let refunded = batch.escrow.value();
    let payout = coin::from_balance(batch.escrow.withdraw_all(), ctx);
    transfer::public_transfer(payout, batch.buyer);
    assert_invariant(batch);
    (refunded, slots)
}

/// `escrow.value() == amount * slots_remaining` — after every mutation.
fun assert_invariant<T>(batch: &BatchOpening<T>) {
    assert!(
        batch.escrow.value() == batch.amount * batch.slots_remaining,
        EEscrowInvariant,
    );
}

fun claims_of<T>(batch: &BatchOpening<T>, agent: address): u8 {
    if (table::contains(&batch.claims_by_agent, agent)) {
        *table::borrow(&batch.claims_by_agent, agent)
    } else {
        0
    }
}

// === Read accessors (clients, indexer, prepare preflight) ===
public fun buyer<T>(batch: &BatchOpening<T>): address { batch.buyer }
public fun amount<T>(batch: &BatchOpening<T>): u64 { batch.amount }
public fun slots_total<T>(batch: &BatchOpening<T>): u64 { batch.slots_total }
public fun slots_remaining<T>(batch: &BatchOpening<T>): u64 {
    batch.slots_remaining
}
public fun fee_bps<T>(batch: &BatchOpening<T>): u64 { batch.fee_bps }
public fun spec_hash<T>(batch: &BatchOpening<T>): vector<u8> { batch.spec_hash }
public fun open_until_ms<T>(batch: &BatchOpening<T>): u64 { batch.open_until_ms }
public fun sla_ms<T>(batch: &BatchOpening<T>): u64 { batch.sla_ms }
public fun review_window_ms<T>(batch: &BatchOpening<T>): u64 {
    batch.review_window_ms
}
public fun reject_split_bps<T>(batch: &BatchOpening<T>): u64 {
    batch.reject_split_bps
}
public fun claim_policy<T>(batch: &BatchOpening<T>): u8 { batch.claim_policy }
public fun min_seller_level<T>(batch: &BatchOpening<T>): u8 {
    batch.min_seller_level
}
public fun max_claims_per_agent<T>(batch: &BatchOpening<T>): u8 {
    batch.max_claims_per_agent
}
/// Slots `agent` already claimed of this batch (0 when never claimed).
public fun claims_by_agent<T>(batch: &BatchOpening<T>, agent: address): u8 {
    claims_of(batch, agent)
}
public fun created_at_ms<T>(batch: &BatchOpening<T>): u64 { batch.created_at_ms }
public fun escrow_value<T>(batch: &BatchOpening<T>): u64 { batch.escrow.value() }
