/// A2A Escrow — non-custodial job escrow for agent-to-agent deliverable
/// work (SPEC_A2A_ESCROW + SPEC_ACP_SUI Phase 1).
///
/// One shared `Job<T>` per engagement. The funds live IN the object
/// (`Balance<T>`) — no treasury, no pool. Every transition is a pure function
/// of (state, clock, caller):
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
/// Design notes (contract review + D-1, 2026-07-18):
/// - **Protocol fee (D-1):** `fee_bps` (2.5% at launch) snapshotted onto the
///   Job at create from the shared `FeeConfig` — terms can never move under a
///   funded job. Charged ONLY on seller-bound funds at settlement (release
///   payout AND the seller's share of a reject split — so a 0-split reject
///   can't dodge it). Refunds to the buyer are always fee-free. The receiver
///   is read from `FeeConfig` at settle time; only the `AdminCap` holder can
///   rotate it or change the bps (hard-capped at `MAX_FEE_BPS`).
/// - **Versioning:** shared `FeeConfig` carries a `version` + every entry
///   gates on it — the standard Sui upgrade pattern, so a future in-place
///   upgrade can invalidate stale package flows via `migrate`.
/// - **Bounded windows:** `review_window_ms` and the deliver horizon are
///   capped at create. Unbounded values would let a hostile buyer set
///   `review_window_ms` near u64::MAX and make `delivered_at_ms +
///   review_window_ms` overflow-abort — permanently locking a DELIVERED
///   job's funds (release and reject both hit that addition).
/// - **u128 bps math:** split/fee arithmetic widens to u128 before the
///   multiply, removing the theoretical `amount * bps` u64 overflow.
///
/// The x402 tie-in: a job-class 402 advertises `intent: "escrow"`; the
/// X-PAYMENT credential carries the Job object id, which the seller verifies
/// on-chain (funded, my address, right amount) before starting work —
/// chain-verified, so it works for every signer including zkLogin.
///
/// Generic over the coin type `T` (USDC in practice — the client caps job
/// value; the contract stays value-neutral).
module a2a_escrow::escrow;

use sui::balance::Balance;
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;

/// Package flow version — bump on upgrades that must invalidate old flows.
const VERSION: u64 = 1;

// === States ===
const STATE_FUNDED: u8 = 0;
const STATE_DELIVERED: u8 = 1;
const STATE_RELEASED: u8 = 2;
const STATE_REFUNDED: u8 = 3;
const STATE_REJECTED: u8 = 4;

const BPS_DENOMINATOR: u64 = 10_000;
/// Protocol fee at launch (D-1, SPEC_ACP_SUI §7): 2.5%.
const FEE_BPS_DEFAULT: u64 = 250;
/// Hard ceiling on what the admin can ever set — 10%.
const MAX_FEE_BPS: u64 = 1_000;
/// Review window cap: 30 days. Bounds the overflow surface AND the worst-case
/// seller wait on a ghosting buyer.
const MAX_REVIEW_WINDOW_MS: u64 = 2_592_000_000;
/// Deliver deadline horizon cap: 365 days out from create.
const MAX_DELIVER_HORIZON_MS: u64 = 31_536_000_000;

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
const EReviewWindowTooLong: u64 = 10;
const EDeadlineTooFar: u64 = 11;
const EFeeTooHigh: u64 = 12;
const EWrongVersion: u64 = 13;
const ENotUpgrade: u64 = 14;

// === Objects ===

/// Capability to administer `FeeConfig` (rotate receiver, adjust bps within
/// `MAX_FEE_BPS`, run version migrations). Held by the deployer wallet.
public struct AdminCap has key, store { id: UID }

/// Shared protocol-fee configuration. `version` is the upgrade gate: every
/// entry function asserts it matches the package `VERSION`, so a future
/// in-place upgrade + `migrate` call cuts old package flows over atomically.
public struct FeeConfig has key {
    id: UID,
    version: u64,
    /// Fee in basis points applied to seller-bound funds at settlement.
    /// Snapshotted onto each Job at create — never applied retroactively.
    fee_bps: u64,
    /// Where fees settle. Read at settle time (rotatable by AdminCap).
    fee_receiver: address,
}

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
    /// Protocol fee bps agreed at create (snapshot of FeeConfig.fee_bps).
    fee_bps: u64,
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
    fee_bps: u64,
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
    /// Protocol fee taken out of `amount` (seller received amount - fee).
    fee_amount: u64,
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
    /// Protocol fee taken out of the seller-bound share.
    fee_amount: u64,
    timestamp_ms: u64,
}
public struct JobRefunded has copy, drop {
    job_id: ID,
    buyer: address,
    seller: address,
    amount: u64,
    timestamp_ms: u64,
}

// === Init ===

fun init(ctx: &mut TxContext) {
    let deployer = ctx.sender();
    transfer::public_transfer(AdminCap { id: object::new(ctx) }, deployer);
    transfer::share_object(FeeConfig {
        id: object::new(ctx),
        version: VERSION,
        fee_bps: FEE_BPS_DEFAULT,
        fee_receiver: deployer,
    });
}

fun assert_version(cfg: &FeeConfig) {
    assert!(cfg.version == VERSION, EWrongVersion);
}

/// Floor(amount * bps / 10_000) with u128 intermediate — no overflow.
fun mul_bps(amount: u64, bps: u64): u64 {
    (((amount as u128) * (bps as u128)) / (BPS_DENOMINATOR as u128)) as u64
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
    cfg: &FeeConfig,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    assert_version(cfg);
    let buyer = ctx.sender();
    assert!(buyer != seller, EBuyerIsSeller);
    let amount = payment.value();
    assert!(amount > 0, EZeroAmount);
    let now = clock.timestamp_ms();
    assert!(deliver_by_ms > now, EDeadlineInPast);
    assert!(deliver_by_ms <= now + MAX_DELIVER_HORIZON_MS, EDeadlineTooFar);
    assert!(review_window_ms <= MAX_REVIEW_WINDOW_MS, EReviewWindowTooLong);
    assert!(reject_split_bps <= BPS_DENOMINATOR, EBadSplit);
    let job = Job<T> {
        id: object::new(ctx),
        buyer,
        seller,
        escrow: payment.into_balance(),
        amount,
        fee_bps: cfg.fee_bps,
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
        fee_bps: cfg.fee_bps,
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
    cfg: &FeeConfig,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert_version(cfg);
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

// === Release (funds → seller, minus the protocol fee) ===
/// Three legitimate callers:
/// 1. The buyer accepting a DELIVERED job.
/// 2. The buyer voluntarily paying a FUNDED job (goodwill / late-accept after
///    an off-band delivery) — it's the buyer's own money moving to the agreed
///    seller, always safe.
/// 3. ANYONE, once a DELIVERED job's review window has lapsed — the
///    permissionless crank that stops a ghosting buyer stranding the seller.
public fun release<T>(
    job: &mut Job<T>,
    cfg: &FeeConfig,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_version(cfg);
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
    let fee_amount = mul_bps(amount, job.fee_bps);
    if (fee_amount > 0) {
        let fee = coin::from_balance(job.escrow.split(fee_amount), ctx);
        transfer::public_transfer(fee, cfg.fee_receiver);
    };
    let payout = coin::from_balance(job.escrow.withdraw_all(), ctx);
    transfer::public_transfer(payout, job.seller);
    event::emit(JobReleased {
        job_id: job.id.to_inner(),
        buyer: job.buyer,
        seller: job.seller,
        amount,
        fee_amount,
        by_timeout,
        timestamp_ms: now,
    });
}

// === Reject (buyer, within the review window — split per create terms) ===
/// The buyer's share is fee-free; the protocol fee applies to the
/// seller-bound share only (so a 0-split reject can't dodge the fee).
public fun reject<T>(
    job: &mut Job<T>,
    cfg: &FeeConfig,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_version(cfg);
    assert!(ctx.sender() == job.buyer, ENotAuthorized);
    assert!(job.state == STATE_DELIVERED, EWrongState);
    let now = clock.timestamp_ms();
    assert!(now <= job.delivered_at_ms + job.review_window_ms, EReviewWindowClosed);
    job.state = STATE_REJECTED;
    let total = job.escrow.value();
    let buyer_amount = mul_bps(total, job.reject_split_bps);
    let seller_gross = total - buyer_amount;
    let fee_amount = mul_bps(seller_gross, job.fee_bps);
    let seller_amount = seller_gross - fee_amount;
    if (buyer_amount > 0) {
        let to_buyer = coin::from_balance(job.escrow.split(buyer_amount), ctx);
        transfer::public_transfer(to_buyer, job.buyer);
    };
    if (fee_amount > 0) {
        let fee = coin::from_balance(job.escrow.split(fee_amount), ctx);
        transfer::public_transfer(fee, cfg.fee_receiver);
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
        fee_amount,
        timestamp_ms: now,
    });
}

// === Refund (ANYONE, after the deadline with no delivery — funds → buyer) ===
/// Permissionless crank: funds can only ever go back to the buyer, so open
/// authorship is safe. A broken/absent seller can never keep committed funds.
/// Always fee-free — the protocol never earns on a failed job.
public fun refund<T>(
    job: &mut Job<T>,
    cfg: &FeeConfig,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_version(cfg);
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

// === Admin (AdminCap-gated fee administration) ===

public fun set_fee_bps(_: &AdminCap, cfg: &mut FeeConfig, fee_bps: u64) {
    assert_version(cfg);
    assert!(fee_bps <= MAX_FEE_BPS, EFeeTooHigh);
    cfg.fee_bps = fee_bps;
}

public fun set_fee_receiver(_: &AdminCap, cfg: &mut FeeConfig, receiver: address) {
    assert_version(cfg);
    cfg.fee_receiver = receiver;
}

/// Version cutover after an in-place package upgrade: bumps the shared
/// config to the new package's VERSION, which makes every entry in the OLD
/// package abort with EWrongVersion.
public fun migrate(_: &AdminCap, cfg: &mut FeeConfig) {
    assert!(cfg.version < VERSION, ENotUpgrade);
    cfg.version = VERSION;
}

// === Read accessors (seller verification + composing contracts) ===
public fun buyer<T>(job: &Job<T>): address { job.buyer }
public fun seller<T>(job: &Job<T>): address { job.seller }
public fun amount<T>(job: &Job<T>): u64 { job.amount }
public fun fee_bps<T>(job: &Job<T>): u64 { job.fee_bps }
public fun escrow_value<T>(job: &Job<T>): u64 { job.escrow.value() }
public fun spec_hash<T>(job: &Job<T>): vector<u8> { job.spec_hash }
public fun deliver_by_ms<T>(job: &Job<T>): u64 { job.deliver_by_ms }
public fun review_window_ms<T>(job: &Job<T>): u64 { job.review_window_ms }
public fun reject_split_bps<T>(job: &Job<T>): u64 { job.reject_split_bps }
public fun state<T>(job: &Job<T>): u8 { job.state }
public fun delivery_hash<T>(job: &Job<T>): vector<u8> { job.delivery_hash }
public fun delivered_at_ms<T>(job: &Job<T>): u64 { job.delivered_at_ms }
public fun created_at_ms<T>(job: &Job<T>): u64 { job.created_at_ms }

public fun config_version(cfg: &FeeConfig): u64 { cfg.version }
public fun config_fee_bps(cfg: &FeeConfig): u64 { cfg.fee_bps }
public fun config_fee_receiver(cfg: &FeeConfig): address { cfg.fee_receiver }

public fun state_funded(): u8 { STATE_FUNDED }
public fun state_delivered(): u8 { STATE_DELIVERED }
public fun state_released(): u8 { STATE_RELEASED }
public fun state_refunded(): u8 { STATE_REFUNDED }
public fun state_rejected(): u8 { STATE_REJECTED }

// === Test hooks ===

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) { init(ctx) }

#[test_only]
public fun set_version_for_testing(cfg: &mut FeeConfig, version: u64) {
    cfg.version = version;
}

#[test_only]
public fun current_version(): u64 { VERSION }

#[test_only]
public fun max_fee_bps(): u64 { MAX_FEE_BPS }
#[test_only]
public fun max_review_window_ms(): u64 { MAX_REVIEW_WINDOW_MS }
#[test_only]
public fun max_deliver_horizon_ms(): u64 { MAX_DELIVER_HORIZON_MS }
#[test_only]
public fun default_fee_bps(): u64 { FEE_BPS_DEFAULT }
