/// A2A Escrow — non-custodial job escrow for agent-to-agent deliverable work
/// (SPEC_A2A_ESCROW, t2 Agents Phase 3).
///
/// One shared `Job<T>` per engagement. The funds live IN the object
/// (`Balance<T>`) — no treasury, no pool, no admin key. Every transition is a
/// pure function of (state, clock, caller):
///
///   FUNDED ──deliver (seller, before deadline)──▶ DELIVERED
///   FUNDED ──release (buyer: goodwill/late-accept)──▶ RELEASED
///   FUNDED ──refund (ANYONE, after deadline)──▶ REFUNDED      → buyer
///   DELIVERED ──release (buyer accept)──▶ RELEASED            → seller
///   DELIVERED ──release (ANYONE, review window lapsed)──▶ RELEASED
///   DELIVERED ──reject (buyer, within review window)──▶ REJECTED
///                → split per `reject_split_bps` agreed at create
///
/// The two timeout paths are permissionless cranks: a ghosting buyer can't
/// strand a delivering seller (timeout-release), and a broken seller can never
/// keep committed funds (deadline-refund). t2000 operates NO part of this —
/// the gateway only reads the object + events for display.
///
/// The x402 tie-in: a job-class 402 advertises `intent: "escrow"`; the
/// X-PAYMENT credential carries the Job object id, which the seller verifies
/// on-chain (funded, my address, right amount) before starting work —
/// chain-verified, so it works for every signer including zkLogin.
///
/// Generic over the coin type `T` (USDC in practice — the client caps job
/// value; the contract stays value-neutral). No version gate / migrate: a Job
/// is a short-lived standalone object with no shared registry to migrate, and
/// settled Jobs persist as on-chain receipts for the reputation feed.
module a2a_escrow::escrow;

use sui::balance::Balance;
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;

// === States ===
const STATE_FUNDED: u8 = 0;
const STATE_DELIVERED: u8 = 1;
const STATE_RELEASED: u8 = 2;
const STATE_REFUNDED: u8 = 3;
const STATE_REJECTED: u8 = 4;

const BPS_DENOMINATOR: u64 = 10_000;

// === Errors ===
const ENotAuthorized: u64 = 0;
const EWrongState: u64 = 1;
const EZeroAmount: u64 = 2;
const EDeadlineInPast: u64 = 3;
const EBadSplit: u64 = 4;
const EPastDeadline: u64 = 5;
const EReviewWindowOpen: u64 = 6;
const EReviewWindowClosed: u64 = 7;
const EDeadlineNotReached: u64 = 8;
const EBuyerIsSeller: u64 = 9;

// === Objects ===

/// One escrowed job. Shared so buyer, seller, and cranks can all touch it;
/// the escrow balance is inside the object.
public struct Job<phantom T> has key {
    id: UID,
    buyer: address,
    seller: address,
    escrow: Balance<T>,
    /// Amount locked at create (immutable record for receipts — `escrow`
    /// drains to zero on settlement).
    amount: u64,
    /// Hash of the job spec (the A2A Task message / offer terms).
    spec_hash: vector<u8>,
    /// Seller must deliver by this ms timestamp, else refund opens.
    deliver_by_ms: u64,
    /// Buyer's accept/reject window (ms) after delivery; lapse = release.
    review_window_ms: u64,
    /// Buyer's share in basis points if they reject — agreed AT CREATE so
    /// neither side can move the goalposts later. Seller gets the rest.
    reject_split_bps: u64,
    state: u8,
    /// Seller's proof-of-delivery commitment (e.g. Walrus blob hash).
    delivery_hash: vector<u8>,
    delivered_at_ms: u64,
    created_at_ms: u64,
}

// === Events (the activity feed / reputation read these) ===
public struct JobCreated has copy, drop {
    job_id: ID,
    buyer: address,
    seller: address,
    amount: u64,
    deliver_by_ms: u64,
    review_window_ms: u64,
    reject_split_bps: u64,
    timestamp_ms: u64,
}
public struct JobDelivered has copy, drop {
    job_id: ID,
    seller: address,
    delivery_hash: vector<u8>,
    timestamp_ms: u64,
}
public struct JobReleased has copy, drop {
    job_id: ID,
    buyer: address,
    seller: address,
    amount: u64,
    /// True when the review window lapsed and a crank released (vs buyer accept).
    by_timeout: bool,
    timestamp_ms: u64,
}
public struct JobRejected has copy, drop {
    job_id: ID,
    buyer: address,
    seller: address,
    buyer_amount: u64,
    seller_amount: u64,
    timestamp_ms: u64,
}
public struct JobRefunded has copy, drop {
    job_id: ID,
    buyer: address,
    seller: address,
    amount: u64,
    timestamp_ms: u64,
}

// === Create (buyer locks funds + terms in one call — one-PTB create+fund) ===

/// Buyer creates and funds a job in one step. Returns the job id so PTB
/// callers can reference it (e.g. to print / hand to the seller as the
/// X-PAYMENT credential).
public fun create<T>(
    seller: address,
    payment: Coin<T>,
    spec_hash: vector<u8>,
    deliver_by_ms: u64,
    review_window_ms: u64,
    reject_split_bps: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    let buyer = ctx.sender();
    assert!(buyer != seller, EBuyerIsSeller);
    let amount = payment.value();
    assert!(amount > 0, EZeroAmount);
    let now = clock.timestamp_ms();
    assert!(deliver_by_ms > now, EDeadlineInPast);
    assert!(reject_split_bps <= BPS_DENOMINATOR, EBadSplit);
    let job = Job<T> {
        id: object::new(ctx),
        buyer,
        seller,
        escrow: payment.into_balance(),
        amount,
        spec_hash,
        deliver_by_ms,
        review_window_ms,
        reject_split_bps,
        state: STATE_FUNDED,
        delivery_hash: vector[],
        delivered_at_ms: 0,
        created_at_ms: now,
    };
    let job_id = job.id.to_inner();
    event::emit(JobCreated {
        job_id,
        buyer,
        seller,
        amount,
        deliver_by_ms,
        review_window_ms,
        reject_split_bps,
        timestamp_ms: now,
    });
    transfer::share_object(job);
    job_id
}

// === Deliver (seller posts proof before the deadline) ===
public fun deliver<T>(
    job: &mut Job<T>,
    delivery_hash: vector<u8>,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(ctx.sender() == job.seller, ENotAuthorized);
    assert!(job.state == STATE_FUNDED, EWrongState);
    let now = clock.timestamp_ms();
    assert!(now <= job.deliver_by_ms, EPastDeadline);
    job.delivery_hash = delivery_hash;
    job.delivered_at_ms = now;
    job.state = STATE_DELIVERED;
    event::emit(JobDelivered {
        job_id: job.id.to_inner(),
        seller: job.seller,
        delivery_hash: job.delivery_hash,
        timestamp_ms: now,
    });
}

// === Release (funds → seller) ===
/// Three legitimate callers:
/// 1. The buyer accepting a DELIVERED job.
/// 2. The buyer voluntarily paying a FUNDED job (goodwill / late-accept after
///    an off-band delivery) — it's the buyer's own money moving to the agreed
///    seller, always safe.
/// 3. ANYONE, once a DELIVERED job's review window has lapsed — the
///    permissionless crank that stops a ghosting buyer stranding the seller.
public fun release<T>(job: &mut Job<T>, clock: &Clock, ctx: &mut TxContext) {
    let sender = ctx.sender();
    let now = clock.timestamp_ms();
    let is_buyer = sender == job.buyer;
    let by_timeout = if (job.state == STATE_DELIVERED) {
        let window_lapsed = now > job.delivered_at_ms + job.review_window_ms;
        assert!(is_buyer || window_lapsed, EReviewWindowOpen);
        !is_buyer && window_lapsed
    } else if (job.state == STATE_FUNDED) {
        assert!(is_buyer, ENotAuthorized);
        false
    } else {
        abort EWrongState
    };
    job.state = STATE_RELEASED;
    let amount = job.escrow.value();
    let payout = coin::from_balance(job.escrow.withdraw_all(), ctx);
    transfer::public_transfer(payout, job.seller);
    event::emit(JobReleased {
        job_id: job.id.to_inner(),
        buyer: job.buyer,
        seller: job.seller,
        amount,
        by_timeout,
        timestamp_ms: now,
    });
}

// === Reject (buyer, within the review window — split per create terms) ===
public fun reject<T>(job: &mut Job<T>, clock: &Clock, ctx: &mut TxContext) {
    assert!(ctx.sender() == job.buyer, ENotAuthorized);
    assert!(job.state == STATE_DELIVERED, EWrongState);
    let now = clock.timestamp_ms();
    assert!(now <= job.delivered_at_ms + job.review_window_ms, EReviewWindowClosed);
    job.state = STATE_REJECTED;
    let total = job.escrow.value();
    let buyer_amount = total * job.reject_split_bps / BPS_DENOMINATOR;
    let seller_amount = total - buyer_amount;
    if (buyer_amount > 0) {
        let to_buyer = coin::from_balance(job.escrow.split(buyer_amount), ctx);
        transfer::public_transfer(to_buyer, job.buyer);
    };
    if (seller_amount > 0) {
        let to_seller = coin::from_balance(job.escrow.withdraw_all(), ctx);
        transfer::public_transfer(to_seller, job.seller);
    };
    event::emit(JobRejected {
        job_id: job.id.to_inner(),
        buyer: job.buyer,
        seller: job.seller,
        buyer_amount,
        seller_amount,
        timestamp_ms: now,
    });
}

// === Refund (ANYONE, after the deadline with no delivery — funds → buyer) ===
/// Permissionless crank: funds can only ever go back to the buyer, so open
/// authorship is safe. A broken/absent seller can never keep committed funds.
public fun refund<T>(job: &mut Job<T>, clock: &Clock, ctx: &mut TxContext) {
    assert!(job.state == STATE_FUNDED, EWrongState);
    let now = clock.timestamp_ms();
    assert!(now > job.deliver_by_ms, EDeadlineNotReached);
    job.state = STATE_REFUNDED;
    let amount = job.escrow.value();
    let payout = coin::from_balance(job.escrow.withdraw_all(), ctx);
    transfer::public_transfer(payout, job.buyer);
    event::emit(JobRefunded {
        job_id: job.id.to_inner(),
        buyer: job.buyer,
        seller: job.seller,
        amount,
        timestamp_ms: now,
    });
}

// === Read accessors (seller verification + composing contracts) ===
public fun buyer<T>(job: &Job<T>): address { job.buyer }
public fun seller<T>(job: &Job<T>): address { job.seller }
public fun amount<T>(job: &Job<T>): u64 { job.amount }
public fun escrow_value<T>(job: &Job<T>): u64 { job.escrow.value() }
public fun spec_hash<T>(job: &Job<T>): vector<u8> { job.spec_hash }
public fun deliver_by_ms<T>(job: &Job<T>): u64 { job.deliver_by_ms }
public fun review_window_ms<T>(job: &Job<T>): u64 { job.review_window_ms }
public fun reject_split_bps<T>(job: &Job<T>): u64 { job.reject_split_bps }
public fun state<T>(job: &Job<T>): u8 { job.state }
public fun delivery_hash<T>(job: &Job<T>): vector<u8> { job.delivery_hash }
public fun delivered_at_ms<T>(job: &Job<T>): u64 { job.delivered_at_ms }
public fun created_at_ms<T>(job: &Job<T>): u64 { job.created_at_ms }

public fun state_funded(): u8 { STATE_FUNDED }
public fun state_delivered(): u8 { STATE_DELIVERED }
public fun state_released(): u8 { STATE_RELEASED }
public fun state_refunded(): u8 { STATE_REFUNDED }
public fun state_rejected(): u8 { STATE_REJECTED }
