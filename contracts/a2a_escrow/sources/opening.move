/// Open jobs — escrow-at-post (SPEC_T2_AGENTS_OPEN_ONCHAIN, Phase 3).
///
/// The second buyer door of ONE JOB, TWO DOORS. `Hire` picks the ASP up
/// front (`escrow::create`). `Open` posts the job with NO ASP picked: the
/// buyer's USDC locks in a shared `Opening<T>` immediately, and the first
/// active registered ASP to `claim` mints a normal `escrow::Job<T>` — from
/// there the existing deliver / release / reject / refund verbs are the only
/// lifecycle. An Opening holds money but NEVER settles work itself.
///
///   create_open ──claim (first active ASP, before open_until)──▶ Job (FUNDED)
///   create_open ──cancel_open (buyer, while unclaimed)──▶ refund, fee-free
///   create_open ──refund_unclaimed (ANYONE, after open_until)──▶ refund, fee-free
///
/// Design notes (build review folded into SPEC rev 2):
/// - **Terms fix at post.** `fee_bps` snapshots from `FeeConfig` at
///   `create_open` and travels into the Job via `escrow::create_claimed` —
///   a fee change between post and claim cannot move terms (D-1).
/// - **First claim wins by consensus.** `claim` takes the shared Opening BY
///   VALUE and deletes it — object versioning serializes racers; the second
///   claim tx aborts at the object layer. No claim state machine needed:
///   an Opening exists ⟺ it is claimable (subject to `open_until`).
/// - **Expired openings are not claimable** (`now <= open_until_ms`): after
///   expiry the only paths are the permissionless refund crank and the
///   buyer's own cancel — a claim can never race a refund the buyer already
///   considers dead.
/// - **Who may claim** composes `agent_id::registry` (read accessors are
///   not version-gated, so a future agent_id migrate cannot brick claims):
///   registered AND active, and never the buyer.
/// - **`claim_policy` gates WHO MAY RACE, never how a claim works** (S.1054):
///   `0` ANY_ACTIVE (default — any active Agent ID, $0 claim, FCFS),
///   `1` Proven (≥ `reputation::proven_min_reviews()` on-chain reviews),
///   `2` Proven · 4★+ (policy 1 AND average ≥ 4.0). Policies `1`/`2` claim
///   through `claim_proven`, which reads the claimer's OWN `AgentScore` by
///   immutable reference — still instant, still $0, no bond, no
///   buyer-confirm. `3+` aborts at create AND claim until defined.
/// - **Bounds mirror `escrow` via package-visible accessors** (no duplicated
///   constants): `sla_ms` ≤ the deliver horizon (an unbounded SLA would make
///   `now + sla_ms` overflow-abort at claim and wedge the Opening),
///   `review_window_ms` ≤ the review cap, split ≤ 10_000. `open_until` is
///   capped at 30 days (the board TTL). The $50 job cap stays client-side —
///   the contract is value-neutral, same as Job.
module a2a_escrow::opening;

use a2a_escrow::escrow::{Self, FeeConfig};
use a2a_escrow::reputation::{Self, AgentScore};
use agent_id::registry::{Self, Registry};
use sui::balance::Balance;
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;

/// Default claim policy: any ACTIVE registered Agent ID ($0 claim, FCFS).
const CLAIM_POLICY_ANY_ACTIVE: u8 = 0;
/// S.1054 — Proven: claimer needs ≥ `reputation::proven_min_reviews()`
/// on-chain reviews. Claims go through `claim_proven`.
const CLAIM_POLICY_MIN_REVIEWS: u8 = 1;
/// S.1054 — Proven · 4★+: policy 1 AND average stars ≥ 4.0 (strictly
/// stronger — see `reputation::meets_min_avg`).
const CLAIM_POLICY_MIN_AVG: u8 = 2;
/// How long an Opening may stay claimable: 30 days (the board TTL cap).
const MAX_OPEN_WINDOW_MS: u64 = 2_592_000_000;

// === Errors ===
const EZeroAmount: u64 = 0;
const EBadClaimPolicy: u64 = 1;
const EOpenWindowInPast: u64 = 2;
const EOpenWindowTooFar: u64 = 3;
const ESlaOutOfRange: u64 = 4;
const EReviewWindowTooLong: u64 = 5;
const EBadSplit: u64 = 6;
const EOpeningExpired: u64 = 7;
const EClaimerIsBuyer: u64 = 8;
const ENotActiveAgent: u64 = 9;
const ENotBuyer: u64 = 10;
const ENotExpired: u64 = 11;
/// v3 (S.1019): open-board reject must return 100% to the buyer — an
/// 80/20 default made garbage-deliver-then-eat-reject (+EV) beat an
/// honest decline ($0) on FCFS work.
const EOpenRejectMustBeFullBuyer: u64 = 12;
/// S.1054: `claim_proven` was handed an `AgentScore` that isn't the
/// claimer's own — you cannot borrow someone else's reputation.
const EScoreNotClaimer: u64 = 13;
/// S.1054: the claimer's on-chain score doesn't meet the Opening's
/// Proven bar (clients preflight this in English first).
const EClaimPolicyUnmet: u64 = 14;

// === Objects ===

/// One open job posting. Shared so any ASP can race to claim; the escrow
/// balance lives inside the object from the moment of posting. Existence is
/// the state: claim / cancel / refund all consume it.
public struct Opening<phantom T> has key {
    id: UID,
    buyer: address,
    escrow: Balance<T>,
    /// Amount locked at post (immutable record for events/receipts).
    amount: u64,
    /// Protocol fee bps snapshotted from `FeeConfig` at post — travels into
    /// the Job at claim (terms can never move under committed money).
    fee_bps: u64,
    /// Hash of the public job spec (t2-acp-custom@1 envelope: title + brief).
    spec_hash: vector<u8>,
    /// Claimable until this ms timestamp; after it only refund/cancel run.
    open_until_ms: u64,
    /// Delivery window granted to the claiming ASP: deliver_by = claim + sla.
    sla_ms: u64,
    review_window_ms: u64,
    reject_split_bps: u64,
    /// Forward-compat claim gate — `0` (ANY_ACTIVE) only in v1.
    claim_policy: u8,
    created_at_ms: u64,
}

// === Events (the indexer's read-model is built from these) ===
public struct OpeningCreated has copy, drop {
    opening_id: ID,
    buyer: address,
    amount: u64,
    fee_bps: u64,
    spec_hash: vector<u8>,
    open_until_ms: u64,
    sla_ms: u64,
    review_window_ms: u64,
    reject_split_bps: u64,
    claim_policy: u8,
    timestamp_ms: u64,
}
/// The opening→job edge — keeps the "one job" identity continuous for the
/// indexer and the receipt page.
public struct OpeningClaimed has copy, drop {
    opening_id: ID,
    job_id: ID,
    buyer: address,
    seller: address,
    amount: u64,
    timestamp_ms: u64,
}
public struct OpeningCancelled has copy, drop {
    opening_id: ID,
    buyer: address,
    amount: u64,
    timestamp_ms: u64,
}
public struct OpeningRefunded has copy, drop {
    opening_id: ID,
    buyer: address,
    amount: u64,
    timestamp_ms: u64,
}

// === Create (buyer locks funds + terms at POST — no ASP yet) ===

/// Post an open job: the payment escrows into a shared `Opening` right now.
/// Returns the opening id for PTB callers.
public fun create_open<T>(
    payment: Coin<T>,
    spec_hash: vector<u8>,
    open_until_ms: u64,
    sla_ms: u64,
    review_window_ms: u64,
    reject_split_bps: u64,
    claim_policy: u8,
    cfg: &FeeConfig,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    escrow::assert_version_pkg(cfg);
    // S.1054: 0 (Anyone) stays the default; 1/2 (Proven) are live; 3+
    // still aborts until a later SPEC defines them.
    assert!(claim_policy <= CLAIM_POLICY_MIN_AVG, EBadClaimPolicy);
    let amount = payment.value();
    assert!(amount > 0, EZeroAmount);
    // Money-entering bounds (S.981) — same gate as `escrow::create`. Checked
    // at POST only; claim never re-checks (committed funds must always mint).
    escrow::assert_amount_in_bounds_pkg(cfg, amount);
    let now = clock.timestamp_ms();
    assert!(open_until_ms > now, EOpenWindowInPast);
    assert!(open_until_ms <= now + MAX_OPEN_WINDOW_MS, EOpenWindowTooFar);
    // Fail-fast at post: every bound `create_claimed` enforces at claim must
    // hold here, or accepted funds could sit in an unclaimable Opening.
    assert!(
        sla_ms > 0 && sla_ms <= escrow::max_deliver_horizon_ms_pkg(),
        ESlaOutOfRange,
    );
    assert!(
        review_window_ms <= escrow::max_review_window_ms_pkg(),
        EReviewWindowTooLong,
    );
    assert!(reject_split_bps <= escrow::bps_denominator_pkg(), EBadSplit);
    // v3 (S.1019): OPEN postings lock 10000 — reject pays the buyer in
    // full, seller 0 (economically = decline, so junk delivery has no
    // edge over honesty). Hire/`escrow::create` keeps the free 0–10000
    // range; existing on-chain openings are grandfathered.
    assert!(
        reject_split_bps == escrow::bps_denominator_pkg(),
        EOpenRejectMustBeFullBuyer,
    );
    let opening = Opening<T> {
        id: object::new(ctx),
        buyer: ctx.sender(),
        escrow: payment.into_balance(),
        amount,
        fee_bps: escrow::config_fee_bps(cfg),
        spec_hash,
        open_until_ms,
        sla_ms,
        review_window_ms,
        reject_split_bps,
        claim_policy,
        created_at_ms: now,
    };
    let opening_id = opening.id.to_inner();
    event::emit(OpeningCreated {
        opening_id,
        buyer: opening.buyer,
        amount,
        fee_bps: opening.fee_bps,
        spec_hash: opening.spec_hash,
        open_until_ms,
        sla_ms,
        review_window_ms,
        reject_split_bps,
        claim_policy,
        timestamp_ms: now,
    });
    transfer::share_object(opening);
    opening_id
}

// === Claim (first active ASP wins — the Opening becomes a normal Job) ===

/// Claim an open job posted Anyone (`claim_policy = 0`). Consumes the
/// Opening (first claim wins at the object layer) and mints a funded
/// `escrow::Job` with `seller = claimer` and `deliver_by = now + sla_ms`.
/// Returns the new job id. Proven openings (`1`/`2`) claim through
/// `claim_proven` — this entry aborts on them, so a pre-S.1054 package
/// can never bypass a Proven gate.
public fun claim<T>(
    opening: Opening<T>,
    registry: &Registry,
    cfg: &FeeConfig,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    escrow::assert_version_pkg(cfg);
    assert!(opening.claim_policy == CLAIM_POLICY_ANY_ACTIVE, EBadClaimPolicy);
    do_claim(opening, registry, cfg, clock, ctx)
}

/// Claim a PROVEN open job (`claim_policy` `1` or `2`) — S.1054. The
/// claimer passes their OWN shared `AgentScore` by immutable reference
/// (parallel with every other claim); the score must belong to the sender
/// and meet the Opening's bar. Everything else is `claim`: still FCFS,
/// still $0, the Opening is consumed and a normal Job mints. An agent
/// with no score object cannot call this at all — the correct
/// "zero reviews" outcome.
public fun claim_proven<T>(
    opening: Opening<T>,
    registry: &Registry,
    score: &AgentScore,
    cfg: &FeeConfig,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    escrow::assert_version_pkg(cfg);
    let policy = opening.claim_policy;
    assert!(
        policy == CLAIM_POLICY_MIN_REVIEWS || policy == CLAIM_POLICY_MIN_AVG,
        EBadClaimPolicy,
    );
    assert!(reputation::agent(score) == ctx.sender(), EScoreNotClaimer);
    if (policy == CLAIM_POLICY_MIN_REVIEWS) {
        assert!(reputation::meets_min_reviews(score), EClaimPolicyUnmet);
    } else {
        assert!(reputation::meets_min_avg(score), EClaimPolicyUnmet);
    };
    do_claim(opening, registry, cfg, clock, ctx)
}

/// The one claim body both entries share — every gate EXCEPT the policy
/// check, which each entry asserts against its own inputs first.
fun do_claim<T>(
    opening: Opening<T>,
    registry: &Registry,
    cfg: &FeeConfig,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    let now = clock.timestamp_ms();
    let claimer = ctx.sender();
    let Opening {
        id,
        buyer,
        escrow: escrow_balance,
        amount,
        fee_bps,
        spec_hash,
        open_until_ms,
        sla_ms,
        review_window_ms,
        reject_split_bps,
        claim_policy: _,
        created_at_ms: _,
    } = opening;
    assert!(now <= open_until_ms, EOpeningExpired);
    assert!(claimer != buyer, EClaimerIsBuyer);
    assert!(registry::is_registered(registry, claimer), ENotActiveAgent);
    let record = registry::borrow_record(registry, claimer);
    assert!(registry::is_active(record), ENotActiveAgent);
    let opening_id = id.to_inner();
    id.delete();
    let job_id = escrow::create_claimed(
        buyer,
        claimer,
        escrow_balance,
        fee_bps,
        spec_hash,
        now + sla_ms,
        review_window_ms,
        reject_split_bps,
        cfg,
        clock,
        ctx,
    );
    event::emit(OpeningClaimed {
        opening_id,
        job_id,
        buyer,
        seller: claimer,
        amount,
        timestamp_ms: now,
    });
    job_id
}

// === Cancel (buyer withdraws an unclaimed posting — fee-free, any time) ===

/// Buyer-only. "Unclaimed" is enforced by existence: a claimed Opening is
/// already gone. Works before OR after `open_until` so a buyer is never
/// stuck waiting on the refund crank.
public fun cancel_open<T>(
    opening: Opening<T>,
    cfg: &FeeConfig,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    escrow::assert_version_pkg(cfg);
    assert!(ctx.sender() == opening.buyer, ENotBuyer);
    let (opening_id, buyer, amount) = repay_buyer(opening, ctx);
    event::emit(OpeningCancelled {
        opening_id,
        buyer,
        amount,
        timestamp_ms: clock.timestamp_ms(),
    });
}

// === Refund (ANYONE, after open_until with no claim — fee-free crank) ===

/// Permissionless: funds can only ever go back to the buyer, so open
/// authorship is safe — same discipline as `escrow::refund`.
public fun refund_unclaimed<T>(
    opening: Opening<T>,
    cfg: &FeeConfig,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    escrow::assert_version_pkg(cfg);
    let now = clock.timestamp_ms();
    assert!(now > opening.open_until_ms, ENotExpired);
    let (opening_id, buyer, amount) = repay_buyer(opening, ctx);
    event::emit(OpeningRefunded {
        opening_id,
        buyer,
        amount,
        timestamp_ms: now,
    });
}

/// Consume an Opening and return its full balance to the buyer, fee-free.
fun repay_buyer<T>(opening: Opening<T>, ctx: &mut TxContext): (ID, address, u64) {
    let Opening {
        id,
        buyer,
        escrow: mut escrow_balance,
        amount,
        fee_bps: _,
        spec_hash: _,
        open_until_ms: _,
        sla_ms: _,
        review_window_ms: _,
        reject_split_bps: _,
        claim_policy: _,
        created_at_ms: _,
    } = opening;
    let opening_id = id.to_inner();
    id.delete();
    let payout = coin::from_balance(escrow_balance.withdraw_all(), ctx);
    escrow_balance.destroy_zero();
    transfer::public_transfer(payout, buyer);
    (opening_id, buyer, amount)
}

// === Read accessors (client verification + the indexer) ===
public fun buyer<T>(opening: &Opening<T>): address { opening.buyer }
public fun amount<T>(opening: &Opening<T>): u64 { opening.amount }
public fun fee_bps<T>(opening: &Opening<T>): u64 { opening.fee_bps }
public fun spec_hash<T>(opening: &Opening<T>): vector<u8> { opening.spec_hash }
public fun open_until_ms<T>(opening: &Opening<T>): u64 { opening.open_until_ms }
public fun sla_ms<T>(opening: &Opening<T>): u64 { opening.sla_ms }
public fun review_window_ms<T>(opening: &Opening<T>): u64 {
    opening.review_window_ms
}
public fun reject_split_bps<T>(opening: &Opening<T>): u64 {
    opening.reject_split_bps
}
public fun claim_policy<T>(opening: &Opening<T>): u8 { opening.claim_policy }
public fun created_at_ms<T>(opening: &Opening<T>): u64 { opening.created_at_ms }

public fun claim_policy_any_active(): u8 { CLAIM_POLICY_ANY_ACTIVE }
public fun claim_policy_min_reviews(): u8 { CLAIM_POLICY_MIN_REVIEWS }
public fun claim_policy_min_avg(): u8 { CLAIM_POLICY_MIN_AVG }
public fun max_open_window_ms(): u64 { MAX_OPEN_WINDOW_MS }
