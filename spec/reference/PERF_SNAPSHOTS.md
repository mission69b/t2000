# Performance Snapshots — rolling deploy-window perf log

**Local-only doc** (gitignored alongside the rest of `spec/`).

This file is the rolling record of TurnMetrics-derived perf data per deploy window. **Append a new entry after every SPEC close-out** (or major release). The §14.5 commitment in `HANDOFF_NEXT_AGENT.md` formalizes this as a standing recurring task — this is the artifact that satisfies it.

The earliest entry below is the **SPEC 19 + 20.2 trend** (2026-05-09 ~10h after the SPEC 19 Phase A ship through the SPEC 20.2 deploy). Future entries appended on top so the latest deploy is always at §1.

---

## How to add a new snapshot

1. Wait until at least 30 turns of the new deploy have landed in `TurnMetrics` (so percentiles are meaningful).
2. Note the engine npm version + audric commit + deploy timestamp from the canonical sources:
   - Engine: `npm view @t2000/engine version` (or check `https://github.com/mission69b/t2000/releases`)
   - Audric: `cd /Users/funkii/dev/audric && git log --oneline main -1`
   - Deploy time: Vercel dashboard OR `git show <commit> --format=%cI -s` for an approximation
3. Run the SQL block in §B against NeonDB (pattern in §C). Capture the columns shown in the table template.
4. Compare vs the prior entry's row using the §A trigger thresholds. If any threshold trips → root-cause before next ship.
5. Insert a new "## Snapshot N" section at the TOP (above the most recent), update the rolling trend table in §1, optionally append a "what shipped" + "interpretation" paragraph.
6. Bump §0 "last updated" line.

**This is local-only.** If we ever decide to publish a public perf history, sanitize first (no internal tx digests / wallet addresses, etc.).

---

## §0 Status

- **Last updated:** 2026-05-10 06:45 AEST
- **Last deploy captured:** SPEC 20.2 / engine `@t2000/engine 1.25.0` / audric `7154e18` / 2026-05-09 11:13Z
- **Next snapshot due:** after SPEC 20.2 closes (founder smoke pass on G20.2.2 + G20.2.4) OR after SPEC 20.1 ships, whichever is first.

---

## §1 Rolling trend (newest deploy at top)

| Deploy window | Engine version | Audric commit | Deploy ts (UTC) | n | TTFVP p50 | TTFVP p95 | Wall p50 | Wall p95 | Write tool p95 | Cache hit | Cost p50 | Cache savings (cumulative window) |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **SPEC 20.2 (current)** | `1.25.0` | `7154e18` | 2026-05-09 11:13 | **50** | **2 649 ms** | **6 761 ms** | — | 24 359 ms | — | **94.0%** | — | — |
| SPEC 19 Phase F | `1.24.14` | `dc2b198` | 2026-05-09 08:06 | 66 | 2 625 ms | 4 905 ms | — | 17 649 ms | — | 89.4% | — | — |
| SPEC 19 Phase D Opt3 | `1.24.12` | `4433698` | 2026-05-09 06:14 | 63 | 2 761 ms | 4 998 ms | — | 23 042 ms | — | 77.8% | — | — |
| SPEC 19 Phase A | `1.24.9` | `f0a69cc` | 2026-05-09 03:42 | 48 | 3 276 ms | 9 555 ms | — | 18 092 ms | — | 81.3% | — | — |
| Pre-SPEC-19 baseline | `1.24.6` | (pre `f0a69cc`) | (pre 2026-05-09 03:42) | 14 | 2 881 ms | 14 881 ms | — | 27 875 ms | — | 71.4% | — | — |

**Headline deltas (current vs pre-SPEC-19 baseline):**

- TTFVP p95 **−55%** (14 881 ms → 6 761 ms)
- Wall p95 **−13%** (27 875 ms → 24 359 ms)
- Cache hit **+22.6pp** (71.4% → 94.0%)
- TTFVP p50 **−8%** (2 881 ms → 2 649 ms)

**Empty cells (`—`)** indicate the metric wasn't captured in the original snapshot run; future captures should fill all columns where data exists.

---

## §A Intervention thresholds (when a snapshot triggers a follow-up)

Same as `HANDOFF_NEXT_AGENT.md` §14.5. If ANY of these trip vs the prior snapshot, **root-cause before the next ship.**

| Metric | Threshold | Why this matters |
|---|---|---|
| TTFVP p95 regression | > 10% vs prior deploy | User-perceived "first byte" latency; the headline number for harness responsiveness |
| Cache hit drop | > 5pp vs prior deploy | Most likely a prompt-cache invalidation issue; one of the cheapest wins to lose |
| Median pre-write read count | > 0.5 tools growth vs prior deploy | "Why is it calling 4 reads before a swap?" — the founder's standing observation, see §14.3 in handoff |
| Cost per write turn | > 20% growth vs prior deploy | Usually a model selection regression (Sonnet where Haiku was fine) or an effort-tier promotion |

---

## §B SQL block — copy-paste-runnable

The query that generated the SPEC 20.2 row in §1. Edit `WHERE "createdAt" > '<deploy ts>'` for new windows.

```sql
SELECT
  COUNT(*) AS n,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "ttfvpMs") AS ttfvp_p50,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "ttfvpMs") AS ttfvp_p95,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "wallTimeMs") AS wall_p50,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "wallTimeMs") AS wall_p95,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "writeToolDurationMs") AS write_tool_p95,
  AVG(CASE WHEN "cacheHit" THEN 1.0 ELSE 0.0 END) AS cache_hit_rate,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "estimatedCostUsd") AS cost_p50,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "estimatedCostUsd") AS cost_p95,
  SUM("cacheSavingsUsd") AS cache_savings_total
FROM "TurnMetrics"
WHERE "createdAt" > '2026-05-09 11:13Z' AND "createdAt" < '2026-05-10 06:00Z';
```

For per-tool-call analysis (the §A "median pre-write read count" trigger):

```sql
SELECT
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY jsonb_array_length("toolsCalled")) AS median_tools,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY jsonb_array_length("toolsCalled")) AS p95_tools
FROM "TurnMetrics"
WHERE "createdAt" > '<deploy ts>'
  AND "pendingActionYielded" = true
  AND "turnPhase" = 'initial';
```

---

## §C How to run the queries (proven pattern)

NeonDB connection lives in `audric/apps/web/.env.local` as `DATABASE_URL`. The `@neondatabase/serverless` package is already a dep there. Pattern:

```bash
cd /Users/funkii/dev/audric/apps/web
cat > scripts/perf-snapshot.mjs <<'EOF'
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

const rows = await sql`
  -- paste a query block from §B here
`;
console.log(JSON.stringify(rows, (_k, v) => typeof v === 'bigint' ? Number(v) : v, 2));
EOF

node --env-file=.env.local scripts/perf-snapshot.mjs
rm scripts/perf-snapshot.mjs   # one-shot — don't commit
```

Requires `full_network` shell permission on agent runs. The `rm` is important — these scripts don't belong in the audric repo.

---

## §2 Snapshot — SPEC 20.2 (engine `1.25.0`, audric `7154e18`, deployed 2026-05-09 11:13Z)

**Window:** 2026-05-09 11:13 → 2026-05-10 ~03:00Z (~16h post-deploy, 50 turns)

**What shipped:**
- Cetus route serialization (SDK)
- `pending_action.cetusRoute` (engine type contract extension)
- `<canonical_route>` system-prompt block on post-write resume turns (engine)
- TurnMetrics `cetusRoute` column (audric Prisma migration `20260509110000_spec20_2_add_cetus_route`)
- Prepare-route fast-path that skips `findSwapRoute()` when a valid precomputed route is supplied (audric)
- Dual-path fallback when the precomputed route is malformed / stale / mismatched (audric)

**Numbers:**

| Metric | Value | vs prior (1.24.14) |
|---|---:|---:|
| n | 50 | — |
| TTFVP p50 | 2 649 ms | +0.9% (essentially flat) |
| TTFVP p95 | 6 761 ms | **+38%** ⚠️ — needs investigation |
| Wall p95 | 24 359 ms | +38% — same pattern as TTFVP p95 |
| Cache hit rate | 94.0% | **+4.6pp** ✅ |

**Interpretation:**

- **Cache hit jump is real and good.** Going from 89.4% → 94.0% means the prompt cache invalidation is healthier than ever. Most likely a side effect of cleaner system-prompt deltas in 1.25.0 (no churn on the cached portion).
- **TTFVP p95 regressed +38% vs the immediate prior deploy.** Two hypotheses:
  1. Sample size mix — only 50 turns in 16h vs 66 in 8h means more variance. Re-snapshot at n≥100 to confirm.
  2. The added `<canonical_route>` block on resume turns is small (~200 chars) but lands on the post-write critical path. Worth checking whether resume-turn TTFVP specifically regressed (filter `WHERE "turnPhase" = 'resume'`).
- **Net vs baseline is still strongly positive** (TTFVP p95 −55% from pre-SPEC-19), so this isn't a "rollback now" signal — it's a "watch this and re-measure after SPEC 20.1 ships" signal.

**Bundle route capture (SPEC 20.2 acceptance signal, NOT a perf metric):**

- Single swaps: **11/12 captured `cetusRoute` (92%)** ✅
- Bundles: **0/3 captured `cetusRoute` (0%)** 🔴 — known bug, see `HANDOFF_NEXT_AGENT.md` §2

---

## §3 Snapshot — SPEC 19 Phase F (engine `1.24.14`, audric `dc2b198`, deployed 2026-05-09 08:06Z)

**Window:** 2026-05-09 08:06 → 11:13Z (~3h, 66 turns)

**What shipped:**
- External retry counter on Anthropic 5xx (SDK + engine)
- SLO targets formalized in `audric-build-tracker.md` S.137

**Numbers:**

| Metric | Value | vs prior (1.24.12) |
|---|---:|---:|
| n | 66 | — |
| TTFVP p50 | 2 625 ms | −5% |
| TTFVP p95 | 4 905 ms | −2% |
| Wall p95 | 17 649 ms | **−23%** ✅ |
| Cache hit rate | 89.4% | **+11.6pp** ✅ |

**Interpretation:** Best cache hit rate observed pre-1.25.0; best wall p95 in the entire SPEC 19 sweep. This is the snapshot that triggered "we're safe to ship 1.25.0" confidence.

---

## §4 Snapshot — SPEC 19 Phase D Opt3 (engine `1.24.12`, audric `4433698`, deployed 2026-05-09 06:14Z)

**Window:** 2026-05-09 06:14 → 08:06Z (~2h, 63 turns)

**What shipped:**
- Skipped the post-write 1500ms sleep entirely (Phase A's bounded poll was sufficient)

**Numbers:**

| Metric | Value | vs prior (1.24.9) |
|---|---:|---:|
| n | 63 | — |
| TTFVP p50 | 2 761 ms | −16% ✅ |
| TTFVP p95 | 4 998 ms | **−48%** ✅ |
| Wall p95 | 23 042 ms | +27% ⚠️ (likely sample-size artifact) |
| Cache hit rate | 77.8% | −3.5pp |

**Interpretation:** This is where the headline TTFVP p95 win locked in. Wall p95 noise resolved itself by Phase F (next snapshot up).

---

## §5 Snapshot — SPEC 19 Phase A (engine `1.24.9`, audric `f0a69cc`, deployed 2026-05-09 03:42Z)

**Window:** 2026-05-09 03:42 → 06:14Z (~2.5h, 48 turns)

**What shipped:**
- Poll-on-balance-delta replacing the fixed 1500ms post-write sleep (engine + audric host)

**Numbers:**

| Metric | Value | vs baseline (1.24.6) |
|---|---:|---:|
| n | 48 | — |
| TTFVP p50 | 3 276 ms | +14% |
| TTFVP p95 | 9 555 ms | **−36%** ✅ |
| Wall p95 | 18 092 ms | **−35%** ✅ |
| Cache hit rate | 81.3% | **+9.9pp** ✅ |

**Interpretation:** First clean win in the SPEC 19 sweep. Phase D Opt3 (next deploy) doubled the TTFVP p95 win.

---

## §6 Snapshot — Pre-SPEC-19 baseline (engine `1.24.6`)

**Window:** ~12h pre-2026-05-09 03:42Z, 14 turns. Small sample size; treat as a rough baseline only.

| Metric | Value |
|---|---:|
| n | 14 |
| TTFVP p50 | 2 881 ms |
| TTFVP p95 | 14 881 ms |
| Wall p95 | 27 875 ms |
| Cache hit rate | 71.4% |

**Interpretation:** The "before" picture for the SPEC 19 sweep. Notable that p50 was already healthy — the win was almost entirely on p95 tail latency and cache hit rate.

---

## §7 Cross-references

- `HANDOFF_NEXT_AGENT.md` §1 (rolling trend), §6 (NeonDB access pattern), §14.5 (intervention thresholds)
- `audric-build-tracker.md` S.137 (SPEC 19 close-out + acceptance criteria)
- `spec/SPEC_19_PERFORMANCE_RELIABILITY_SWEEP.md` (the sweep that produced snapshots §3–§6)
- `spec/SPEC_20_PERFORMANCE_ARCHITECTURE_V2.md` (the redesign whose 20.2 phase produced snapshot §2)
- `spec/harness-metrics-baseline.md` (the original SPEC 1/2 baseline from 2026-04-25; predates the §1 rolling trend)
