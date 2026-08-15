/// Agent reputation — thin on-chain score aggregates (S.1054, Phase C of
/// SPEC_AGENT_ID_REPUTATION).
///
/// One shared `AgentScore` per reviewed seller, created lazily on their first
/// review at a DETERMINISTIC address derived from the shared `ScoreBoard`
/// (`sui::derived_object`): no score object ⇔ zero reviews (Anyone-claims OK,
/// Proven claims abort). Aggregates only — `review_count` + `stars_sum` —
/// review TEXT stays off-chain (jobId-keyed); an average is integer math over
/// the two counters. Per-job stars live in a `Table` under the seller's own
/// score, so storage growth and write contention are per-agent, never global:
/// reviews for agent A and agent B touch different shared objects, and a
/// Proven claim only ever takes the claimer's score by IMMUTABLE reference.
///
/// **Placement (documented deviation from SPEC_AGENT_ID_REPUTATION §3's
/// "prefer agent_id"):** the review writer must see `&Job<T>` to verify the
/// receipt, and `a2a_escrow` already depends on `agent_id` — storing the
/// score under `agent_id` would need either an illegal dependency cycle or a
/// hardcoded witness-package handshake (three ordered mainnet upgrades, since
/// the witness type's defining id doesn't exist until escrow republishes).
/// Parking storage AND writer here keeps the apply path unforgeable for free
/// (module-internal, `apply_review` is private) and the cutover to ONE
/// additive escrow upgrade. The SPEC/prompt explicitly allow this shape.
///
/// Write authority (all Move-enforced — reputation is receipts):
/// - sender == `Job.buyer` and `Job.state == RELEASED`
/// - the job was actually DELIVERED (`delivered_at_ms > 0`): a goodwill
///   release of an undelivered job is not a reviewable receipt (the on-chain
///   form of the API's no-goodwill-review rule)
/// - one contribution per `job_id`; resubmitting = star edit in place
///   (`stars_sum` adjusts, `review_count` doesn't)
/// - NO AdminCap / mint path: the protocol cannot gift stars.
module a2a_escrow::reputation;

use a2a_escrow::escrow::{Self, AdminCap, FeeConfig, Job};
use sui::clock::Clock;
use sui::derived_object;
use sui::event;
use sui::table::{Self, Table};

// === Proven thresholds (S.1054 v1 — protocol constants, one SSOT) ===
/// `claim_policy = 1` (and the floor of `2`): minimum on-chain reviews.
const PROVEN_MIN_REVIEWS: u64 = 3;
/// `claim_policy = 2`: minimum average stars, scaled ×10 (40 = 4.0★).
const PROVEN_MIN_AVG_STARS_X10: u64 = 40;
/// The ×10 scale used for the integer-math average compare.
const AVG_SCALE: u64 = 10;
/// Star bounds — a 0-star write would corrupt the average math.
const MIN_STARS: u8 = 1;
const MAX_STARS: u8 = 5;

// === Errors ===
const ENotBuyer: u64 = 0;
const ENotReleased: u64 = 1;
/// RELEASED but never DELIVERED = goodwill settle — not reviewable.
const ENotDelivered: u64 = 2;
const EBadStars: u64 = 3;
/// The passed `AgentScore` doesn't belong to this job's seller.
const EWrongScore: u64 = 4;
/// Structurally impossible (escrow::create asserts buyer != seller) —
/// asserted anyway so this module's invariant never depends on a sibling's.
const ESelfReview: u64 = 5;

// === Objects ===

/// The one shared namespace parent for derived `AgentScore` addresses.
/// Created ONCE post-upgrade via `create_score_board` (module `init` does not
/// re-run on package upgrade); its id is pinned in client constants. Holds no
/// table — `derived_object::claim` markers on its UID are the per-agent
/// uniqueness guarantee, and it is only `&mut` on an agent's FIRST review.
public struct ScoreBoard has key {
    id: UID,
}

/// One seller's on-chain reputation. Shared, at
/// `derived_object::derive_address(board, agent)` — clients can compute the
/// id locally with no lookup. Aggregates only; per-job stars in `job_stars`
/// enforce one contribution per job and make edits update-in-place.
public struct AgentScore has key {
    id: UID,
    /// The reviewed seller (Agent ID address). Claim gates verify this
    /// matches the claimer — you cannot borrow someone else's score.
    agent: address,
    review_count: u64,
    stars_sum: u64,
    job_stars: Table<ID, u8>,
    created_at_ms: u64,
    updated_at_ms: u64,
}

// === Events (the indexer's score read-model is built from these) ===
public struct ScoreBoardCreated has copy, drop {
    board_id: ID,
    timestamp_ms: u64,
}
public struct ScoreCreated has copy, drop {
    score_id: ID,
    agent: address,
    timestamp_ms: u64,
}
/// Emitted on every review write, first OR edit — carries the post-write
/// aggregates so the read-model never has to fetch the object.
public struct ReviewSubmitted has copy, drop {
    score_id: ID,
    agent: address,
    job_id: ID,
    buyer: address,
    stars: u8,
    /// 0 = first review for this job; non-zero = an edit replacing that value.
    previous_stars: u8,
    review_count: u64,
    stars_sum: u64,
    timestamp_ms: u64,
}

// === One-time setup (AdminCap — upgrade can't run `init`) ===

/// Share the score namespace parent. Called ONCE in the S.1054 cutover
/// ritual; the resulting id is pinned client-side. AdminCap-gated so a
/// stranger can't share a decoy board — but note the cap grants NO star
/// authority: every star still requires a RELEASED job receipt.
public fun create_score_board(_: &AdminCap, cfg: &FeeConfig, clock: &Clock, ctx: &mut TxContext) {
    escrow::assert_version_pkg(cfg);
    let board = ScoreBoard { id: object::new(ctx) };
    event::emit(ScoreBoardCreated {
        board_id: board.id.to_inner(),
        timestamp_ms: clock.timestamp_ms(),
    });
    transfer::share_object(board);
}

// === Review writes (buyer, RELEASED receipt only) ===

/// First review a seller ever receives: lazily creates + shares their
/// `AgentScore` at its derived address. Aborts if the score already exists
/// (`derived_object::claim` is the uniqueness gate) — callers race-fall-back
/// to `submit_review`.
public fun submit_first_review<T>(
    board: &mut ScoreBoard,
    job: &Job<T>,
    stars: u8,
    cfg: &FeeConfig,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    escrow::assert_version_pkg(cfg);
    let seller = validate_review(job, stars, ctx);
    let now = clock.timestamp_ms();
    let mut score = AgentScore {
        id: derived_object::claim(&mut board.id, seller),
        agent: seller,
        review_count: 0,
        stars_sum: 0,
        job_stars: table::new(ctx),
        created_at_ms: now,
        updated_at_ms: now,
    };
    event::emit(ScoreCreated {
        score_id: score.id.to_inner(),
        agent: seller,
        timestamp_ms: now,
    });
    apply_review(&mut score, object::id(job), ctx.sender(), stars, now);
    transfer::share_object(score);
}

/// Every later review — and star EDITS (same buyer re-rating the same job):
/// touches only this seller's score, so unrelated reviews run in parallel.
public fun submit_review<T>(
    score: &mut AgentScore,
    job: &Job<T>,
    stars: u8,
    cfg: &FeeConfig,
    clock: &Clock,
    ctx: &TxContext,
) {
    escrow::assert_version_pkg(cfg);
    let seller = validate_review(job, stars, ctx);
    assert!(score.agent == seller, EWrongScore);
    apply_review(score, object::id(job), ctx.sender(), stars, clock.timestamp_ms());
}

/// The receipt gate — every review path funnels through here.
fun validate_review<T>(job: &Job<T>, stars: u8, ctx: &TxContext): address {
    assert!(stars >= MIN_STARS && stars <= MAX_STARS, EBadStars);
    let buyer = escrow::buyer(job);
    let seller = escrow::seller(job);
    assert!(ctx.sender() == buyer, ENotBuyer);
    assert!(buyer != seller, ESelfReview);
    assert!(escrow::state(job) == escrow::state_released(), ENotReleased);
    assert!(escrow::delivered_at_ms(job) > 0, ENotDelivered);
    seller
}

/// The ONLY aggregate mutator — private, so a star can never enter a score
/// except through a validated RELEASED receipt above.
fun apply_review(score: &mut AgentScore, job_id: ID, buyer: address, stars: u8, now: u64) {
    let previous_stars = if (score.job_stars.contains(job_id)) {
        let prev = score.job_stars.remove(job_id);
        score.stars_sum = score.stars_sum - (prev as u64);
        prev
    } else {
        score.review_count = score.review_count + 1;
        0
    };
    score.job_stars.add(job_id, stars);
    score.stars_sum = score.stars_sum + (stars as u64);
    score.updated_at_ms = now;
    event::emit(ReviewSubmitted {
        score_id: score.id.to_inner(),
        agent: score.agent,
        job_id,
        buyer,
        stars,
        previous_stars,
        review_count: score.review_count,
        stars_sum: score.stars_sum,
        timestamp_ms: now,
    });
}

// === Proven predicates (read by `opening::claim_proven`) ===

/// `claim_policy = 1` — Proven: at least `PROVEN_MIN_REVIEWS` on-chain
/// reviews. No score object ⇒ the claim entry can't even be called — the
/// correct "count 0" outcome.
public fun meets_min_reviews(score: &AgentScore): bool {
    score.review_count >= PROVEN_MIN_REVIEWS
}

/// `claim_policy = 2` — Proven · 4★+: policy 1 AND average ≥ 4.0. Strictly
/// stronger than plain Proven (the prompt's "require both" preset): an
/// average over fewer than `PROVEN_MIN_REVIEWS` reviews is noise, and a gate
/// labeled 4★+ must never admit an agent plain Proven would refuse. Integer
/// math — `sum × 10 ≥ count × 40` — no division, no rounding.
public fun meets_min_avg(score: &AgentScore): bool {
    meets_min_reviews(score) &&
        score.stars_sum * AVG_SCALE >= score.review_count * PROVEN_MIN_AVG_STARS_X10
}

// === Read accessors (clients, indexer, composing modules) ===
public fun agent(score: &AgentScore): address { score.agent }
public fun review_count(score: &AgentScore): u64 { score.review_count }
public fun stars_sum(score: &AgentScore): u64 { score.stars_sum }
public fun has_job_review(score: &AgentScore, job_id: ID): bool {
    score.job_stars.contains(job_id)
}
public fun job_stars(score: &AgentScore, job_id: ID): u8 {
    *score.job_stars.borrow(job_id)
}

/// Whether an agent has a score yet (board-side check, no score fetch).
public fun has_score(board: &ScoreBoard, agent: address): bool {
    derived_object::exists(&board.id, agent)
}

/// The deterministic address an agent's score lives (or will live) at.
public fun score_address(board: &ScoreBoard, agent: address): address {
    derived_object::derive_address(board.id.to_inner(), agent)
}

public fun proven_min_reviews(): u64 { PROVEN_MIN_REVIEWS }
public fun proven_min_avg_stars_x10(): u64 { PROVEN_MIN_AVG_STARS_X10 }
public fun avg_scale(): u64 { AVG_SCALE }
public fun min_stars(): u8 { MIN_STARS }
public fun max_stars(): u8 { MAX_STARS }
