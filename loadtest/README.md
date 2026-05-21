# Audric Load Test Playbook — PR 6

> Validates the full 500–1k DAU stack from `audric-scaling-spec.md`.
> Five scenarios, one command, shareable markdown report.

---

## Quick start (5 min)

```bash
# 1. Install k6
brew install k6

# 2. Configure credentials
cp loadtest/.env.loadtest.example loadtest/.env.loadtest
# Edit .env.loadtest — fill in BASE_URL, TEST_JWT, TEST_ADDRESS

# 3. Run smoke test (10% VU scale — finishes in ~5 min)
./loadtest/run.sh

# 4. Share results with team
cat loadtest/reports/combined-report.md
```

---

## Getting credentials

| Variable | Where to get it |
|---|---|
| `BASE_URL` | `https://audric.ai` (prod) or your staging URL |
| `TEST_JWT` | Browser DevTools → Network tab → any `/api/engine/chat` request → `Authorization: Bearer <token>` header |
| `TEST_ADDRESS` | Same page — it's in the request body as `address` |

> **TIP:** Create a dedicated load-test Audric account (sign up with a `+loadtest@...` email) so your real account's session history isn't polluted.

---

## Scenarios

| Scenario | Spec | VU (local 0.1×) | VU (full 1.0×) | Duration | Pass criteria |
|---|---|---|---|---|---|
| **S1 — Steady read** | Balance/savings/portfolio queries | 10 → 50 | 100 → 500 | ~5 min local / 20 min full | p95 chat-turn < 4s, BV CB stays closed |
| **S2 — Viral address** | 200 concurrent on same wallet | 20 | 200 | ~3 min | BV calls < 50/min (cache + lock working) |
| **S3 — Mixed R+W** | 10% write-intent turns (save 1 USDC) | 20 | 200 | ~12 min | Writes yield `pending_action`, never auto-execute |
| **S4 — BV degraded** | Portfolio reads, watch sticky-positive cache | 20 | 200 | ~12 min | > 80% of reads return positive `walletValueUsd` |

> **S5 retired 2026-05-21 (S.224 / v0.7d Phase 6 Block C):** the scenario triggered the t2000 ECS cron via `POST /api/internal/financial-context-snapshot` to measure shard fan-out vs live chat. That route + the ECS cron itself were deleted (Vercel cron at `/api/cron/financial-context-snapshot` replaces both). Vercel cron jobs run in isolated function invocations so the original "does cron tank live chat?" concern no longer applies the same way. If revived, port to a Vercel-cron trigger via `Authorization: Bearer ${CRON_SECRET}`.

---

## Running individual scenarios

```bash
# Single scenario
./loadtest/run.sh s1
./loadtest/run.sh s2

# Full VU count (use k6 Cloud for S1/S2/S3 at full scale)
./loadtest/run.sh all full

# Or with explicit env vars (no .env.loadtest file)
BASE_URL=https://audric.ai TEST_JWT=eyJ... TEST_ADDRESS=0x... ./loadtest/run.sh s1
```

---

## Scaling up: k6 Cloud ($89/mo)

At full 500 VU, local k6 can saturate the Mac's network stack. k6 Cloud handles it:

```bash
# Login to k6 Cloud
k6 cloud login --token <YOUR_K6_CLOUD_TOKEN>

# Run S1 at full spec VUs via Cloud
k6 cloud --env BASE_URL=$BASE_URL --env TEST_JWT=$TEST_JWT \
         --env TEST_ADDRESS=$TEST_ADDRESS --env VU_SCALE=1.0 \
         loadtest/k6/scenarios/s1-steady-read.js
```

Results appear at [k6 Cloud dashboard](https://app.k6.io) with time-series charts, percentile breakdowns, and shareable links.

---

## Output

After a run:

```
loadtest/reports/
  s1-summary.json          # full k6 metrics JSON
  s2-summary.json
  ...
  combined-report.md       # ← share this with the team
```

The combined report is a markdown table with pass/fail per scenario and the key metric (p95 latency, cache hit rate, etc.).

---

## What the results prove

| Result | What it validates |
|---|---|
| S1 p95 < 4s at 500 VU | PR 1+2 (Upstash cache + fetch lock) holding under real concurrent load |
| S2 BV calls < 50/min | Cross-instance coalescing working — single leader per address per 10s |
| S3 writes always yield `pending_action` | Confirm gate never bypassed under concurrent load |
| S4 sticky-positive > 80% | PR 1's sticky-positive write rules serving correct data under BV degradation |

---

## Acceptance criteria from spec

From `audric-scaling-spec.md`:

- [ ] S1 (500 VU steady) passes once on staging  
- [ ] BV CB has not opened in production in the last 7 days (after PRs 1+2)  
- [ ] p95 chat-turn latency < 4s in production  
- [ ] PR 3 cron at 1k synthetic users completes < 90s  
- [ ] PR 4 simulated NAVI 5xx burst absorbed without user-visible degradation
