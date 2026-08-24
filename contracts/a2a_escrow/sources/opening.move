/// Open jobs — escrow-at-post (SPEC_T2_AGENTS_OPEN_ONCHAIN, Phase 3).
///
/// The second buyer door of ONE JOB, TWO DOORS. `Hire` picks the seller up
/// front (`escrow::create`). `Open` posts the job with NO seller picked: the
/// buyer's USDC locks in a shared `Opening<T>` immediately, and the first
/// active registered seller to `claim` mints a normal `escrow::Job<T>` — from
/// there the existing deliver / release / reject / refund verbs are the only
/// lifecycle. An Opening holds money but NEVER settles work itself.
///
///   create_open ──claim (first active seller, before open_until)──▶ Job (FUNDED)
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
use sui::dynamic_field as df;
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
/// S.1192: the claimer is at their level's active-job cap — finish or
/// settle an in-flight claimed job first (clients preflight in English).
const EActiveJobCap: u64 = 15;
/// S.1192: the claimer's effective seller level is below the Opening's
/// `min_seller_level` floor.
const EMinSellerLevelUnmet: u64 = 16;
/// S.1192: `create_open`/`claim`/`claim_proven` moved to their `_v2`
/// entries (the active-cap + level gates ride the claim; posts carry
/// `min_seller_level`). Dedicated code, same S.1032/S.1063 pattern —
/// shared by all three dead stubs, documented in RUNBOOK_S1192.
const EUseClaimV2: u64 = 17;
/// S.1192: `min_seller_level` must be 0 (no floor) or 1..4.
const EBadMinSellerLevel: u64 = 18;

// === Objects ===

/// One open job posting. Shared so any seller can race to claim; the escrow
/// balance lives inside the object from the moment of posting. Existence is
/// the state: claim / cancel / refund all consume it.
/// S.1192 — optional seller-level floor on `Opening.id` (value `u8`,
/// 1..4). A DF, NEVER a struct field: live openings can't grow layout
/// under a compatible upgrade, and missing ⇒ 0 (no floor) makes every
/// pre-S.1192 opening claimable unchanged. Written by `create_open_v2`
/// at post (when > 0), removed at claim/cancel/refund before the UID
/// deletes (storage rebate).
public struct MinSellerLevelKey has copy, drop, store {}

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
    /// Delivery window granted to the claiming seller: deliver_by = claim + sla.
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
/// S.1192 sibling of `OpeningCreated` (same fields + `min_seller_level`,
/// emitted together on every v2 post) — a NEW struct because the v1
/// event's layout is frozen under compatible upgrade. Defining id = the
/// S.1192 upgrade package (V10 pin); indexers pin that id and prefer
/// this event.
public struct OpeningCreatedV2 has copy, drop {
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
    /// 0 = no floor · 1..4 = minimum EFFECTIVE seller level to claim.
    min_seller_level: u8,
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

// === Create (buyer locks funds + terms at POST — no seller yet) ===

/// DEPRECATED (S.1192) — always aborts `EUseClaimV2`. The live post door
/// is `create_open_v2` (adds `min_seller_level`); all new posts go
/// through v2 so the board's floor field is uniform. Signature survives
/// (compatible upgrades can't remove public functions); the body is dead
/// — the unconsumed `payment` is fine on a diverging path, the abort
/// reverts the whole tx.
public fun create_open<T>(
    _payment: Coin<T>,
    _spec_hash: vector<u8>,
    _open_until_ms: u64,
    _sla_ms: u64,
    _review_window_ms: u64,
    _reject_split_bps: u64,
    _claim_policy: u8,
    cfg: &FeeConfig,
    _clock: &Clock,
    _ctx: &mut TxContext,
): ID {
    escrow::assert_version_pkg(cfg);
    abort EUseClaimV2
}

/// Post an open job: the payment escrows into a shared `Opening` right now.
/// Returns the opening id for PTB callers. S.1192: `min_seller_level`
/// (0 = no floor, 1..4) writes the `MinSellerLevelKey` DF — enforced at
/// claim on the claimer's EFFECTIVE level, independent of `claim_policy`
/// (a post can require Proven · 4★+ AND Level 2+, or either alone).
public fun create_open_v2<T>(
    payment: Coin<T>,
    spec_hash: vector<u8>,
    open_until_ms: u64,
    sla_ms: u64,
    review_window_ms: u64,
    reject_split_bps: u64,
    claim_policy: u8,
    min_seller_level: u8,
    cfg: &FeeConfig,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    escrow::assert_version_pkg(cfg);
    // S.1054: 0 (Anyone) stays the default; 1/2 (Proven) are live; 3+
    // still aborts until a later SPEC defines them (min_seller_level is
    // the level floor — NEVER a claim_policy 3+).
    assert!(claim_policy <= CLAIM_POLICY_MIN_AVG, EBadClaimPolicy);
    assert!(min_seller_level <= 4, EBadMinSellerLevel);
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
    let mut opening = Opening<T> {
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
    // S.1192: the level floor is a DF, never a struct field — absent
    // means 0, so old openings and floor-less posts read identically.
    if (min_seller_level > 0) {
        df::add(&mut opening.id, MinSellerLevelKey {}, min_seller_level);
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
    event::emit(OpeningCreatedV2 {
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
        min_seller_level,
        timestamp_ms: now,
    });
    transfer::share_object(opening);
    opening_id
}

// === Claim (first active seller wins — the Opening becomes a normal Job) ===

/// DEPRECATED (S.1192) — always aborts `EUseClaimV2`. The live path is
/// `claim_v2`, which takes the claimer's `&mut AgentScore` for the
/// active-cap + level-floor gates. Signature survives; the body is dead
/// (the by-value Opening needs no consumption on a diverging path — the
/// abort reverts the whole tx and the object stays shared + claimable
/// through v2).
public fun claim<T>(
    _opening: Opening<T>,
    _registry: &Registry,
    cfg: &FeeConfig,
    _clock: &Clock,
    _ctx: &mut TxContext,
): ID {
    escrow::assert_version_pkg(cfg);
    abort EUseClaimV2
}

/// DEPRECATED (S.1192) — always aborts `EUseClaimV2`. Live path:
/// `claim_proven_v2`.
public fun claim_proven<T>(
    _opening: Opening<T>,
    _registry: &Registry,
    _score: &AgentScore,
    cfg: &FeeConfig,
    _clock: &Clock,
    _ctx: &mut TxContext,
): ID {
    escrow::assert_version_pkg(cfg);
    abort EUseClaimV2
}

/// Claim an open job posted Anyone (`claim_policy = 0`) — S.1192 v2.
/// Consumes the Opening (first claim wins at the object layer) and mints
/// a funded `escrow::Job` with `seller = claimer` and `deliver_by = now +
/// sla_ms`. Returns the new job id. The claimer passes their OWN shared
/// `AgentScore` by MUTABLE reference — policy 0 included — because every
/// claim now moves the active-job counter and reads the capacity gates;
/// an agent with no score yet chains the permissionless
/// `create_empty_score` in the same PTB (the S.1063 precursor pattern —
/// an empty score grants nothing and reads as Level 1). Proven openings
/// (`1`/`2`) claim through `claim_proven_v2` — this entry aborts on them,
/// so the Proven gate can never be bypassed.
public fun claim_v2<T>(
    opening: Opening<T>,
    registry: &Registry,
    score: &mut AgentScore,
    cfg: &FeeConfig,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    escrow::assert_version_pkg(cfg);
    assert!(opening.claim_policy == CLAIM_POLICY_ANY_ACTIVE, EBadClaimPolicy);
    do_claim(opening, registry, score, cfg, clock, ctx)
}

/// Claim a PROVEN open job (`claim_policy` `1` or `2`) — S.1192 v2 of the
/// S.1054 entry. The score must belong to the sender and meet the
/// Opening's bar; the same object then feeds the capacity gates and the
/// counter write in `do_claim`. Still FCFS, still $0, no bond, no
/// buyer-confirm. Mutability note: `&mut` serializes same-SELLER claims
/// on their own score (that IS the cap); different sellers stay parallel.
public fun claim_proven_v2<T>(
    opening: Opening<T>,
    registry: &Registry,
    score: &mut AgentScore,
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
    // S.1062: Proven = distinct buyers, not raw review count.
    if (policy == CLAIM_POLICY_MIN_REVIEWS) {
        assert!(reputation::meets_proven(score), EClaimPolicyUnmet);
    } else {
        assert!(reputation::meets_min_avg(score), EClaimPolicyUnmet);
    };
    do_claim(opening, registry, score, cfg, clock, ctx)
}

/// The one claim body both v2 entries share — every gate EXCEPT the
/// policy check, which each entry asserts against its own inputs first.
/// S.1192 adds the capacity gates: the claimer's own score (ownership
/// re-asserted here so a policy-0 claim can't ride a stranger's score),
/// the per-level active cap on the EFFECTIVE level, and the Opening's
/// optional `min_seller_level` floor. The counter increments AFTER the
/// Job mints (same tx — atomic either way; the event wants the job id).
fun do_claim<T>(
    opening: Opening<T>,
    registry: &Registry,
    score: &mut AgentScore,
    cfg: &FeeConfig,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    let now = clock.timestamp_ms();
    let claimer = ctx.sender();
    let Opening {
        mut id,
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
    // S.1192 capacity gates — clients preflight both in English first.
    assert!(reputation::agent(score) == claimer, EScoreNotClaimer);
    let level = reputation::effective_seller_level(score, cfg);
    let cap = reputation::active_cap_for_level(cfg, level);
    assert!(reputation::active_seller_jobs(score) < cap, EActiveJobCap);
    // The floor DF comes OFF the UID here (missing ⇒ 0) — removed, not
    // just read, so the deleted UID leaves no orphaned storage behind.
    let min_level: u8 = if (df::exists(&id, MinSellerLevelKey {})) {
        df::remove(&mut id, MinSellerLevelKey {})
    } else {
        0
    };
    if (min_level > 0) {
        assert!(
            reputation::meets_min_seller_level(score, cfg, min_level),
            EMinSellerLevelUnmet,
        );
    };
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
    reputation::increment_active(score, job_id, now);
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
        mut id,
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
    // S.1192: reclaim the floor DF (if any) before the UID deletes.
    if (df::exists(&id, MinSellerLevelKey {})) {
        let _floor: u8 = df::remove(&mut id, MinSellerLevelKey {});
    };
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

/// S.1192 — the opening's seller-level floor (DF read; missing ⇒ 0, which
/// covers every pre-S.1192 opening and every floor-less v2 post).
public fun min_seller_level<T>(opening: &Opening<T>): u8 {
    if (df::exists(&opening.id, MinSellerLevelKey {})) {
        *df::borrow(&opening.id, MinSellerLevelKey {})
    } else {
        0
    }
}

public fun claim_policy_any_active(): u8 { CLAIM_POLICY_ANY_ACTIVE }
public fun claim_policy_min_reviews(): u8 { CLAIM_POLICY_MIN_REVIEWS }
public fun claim_policy_min_avg(): u8 { CLAIM_POLICY_MIN_AVG }
public fun max_open_window_ms(): u64 { MAX_OPEN_WINDOW_MS }
