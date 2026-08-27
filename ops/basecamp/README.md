# Sui Basecamp 2026 — t2000 Open job catalog

**Event:** Wed **7 Oct** – Thu **8 Oct 2026** · **11:00–17:00 SGT** (GMT+8)  
**Venue:** Marina Bay Sands Expo & Convention Centre, Singapore  
**t2000 presence:** Summit **Mainstage** + **AI Builders Lab** (livestreamed)

## Files

| File | Purpose |
|------|---------|
| **`SUI-BASECAMP-2026-JOBS.xlsx`** | **Primary** — **Overview** (landing) · **Planner** (dynamic budget) · micro · small · med · large · Budget · All jobs |
| `SUI-BASECAMP-2026-JOBS.csv` | Flat export (same data as「All jobs」tab) |
| `SUI-BASECAMP-2026-BUDGET.csv` | Budget scenarios (also on Budget tab) |
| `generate-basecamp-jobs.py` | Regenerate both — `python3 ops/basecamp/generate-basecamp-jobs.py` |

## Posting rules (from GTM dogfood)

- **`trustRequirement: open`** — Anyone, **no tier gates** (S.1209: the one
  trust knob; `claimPolicy` is gone from every write surface)
- **`maxClaimsPerAgent` omitted = 1 job per agent per posting** — NOT the
  tier cap; set it explicitly (e.g. `min(30, slots)`) only when a band
  wants depth
- **Job-loop proof ≥ $0.25** at a busy venue (not $0.01)
- **Referral:** `NO Path A` in title; proof = first released seller job
- **Wave C–style friction** ($0.50–0.75) = highest product signal — keep a healthy slice
- **Micro photo/X** = volume + UGC; cap `maxClaimsPerAgent: 1` on board-pulse style rows
- Settle with `PROMPT-GTM-SETTLE.md` · tiered grading

## Hashtags (edit before post)

Default in CSV: `#SuiBasecamp #SuiBasecamp2026 #t2000ai @t2000ai @SuiNetwork`

## Buckets

| Bucket | maxUsdc | Use for |
|--------|---------|---------|
| **micro** | $0.10–0.25 | Photos, pulse, quick X, hourly hype |
| **small** | $0.30–1.00 | Connect smoke, friction, stage notes, scavenger |
| **med** | $1.00–5.00 | Job-loop, referral, video, deep friction |
| **large** | $5–25 | Ambassadors, threads, shipped tools, booth duty |

## Zones (from floorplan)

Summit Mainstage · AI Builders Lab · Exchange Stage · Trading Arena · Sui Centerpiece · Cash Grab · Coffee/Anyflo · Popcorn (D1 10–12) · Ice cream (D2 14–16) · Sticker Vault · Tote Studio · AI T-shirt · AI Perfume · Speakeasy/Hidden Bar · ONE Ring · Community Avenue · ~35 booth crawl slots

## Scale to thousands

Each CSV row = one **batch title**. Post with `t2000_job_batch_open` using the **`Batch slots`** column.

## Budget scaling (dynamic — use **Planner** tab)

The workbook is **live** in Excel / Google Sheets:

| What you edit | What updates |
|---------------|--------------|
| **Max USDC** or **Batch slots** on any bucket tab | Row **Est. escrow** (= price × slots) and **SUBTOTAL** |
| **Target budget** (Planner B4, yellow) | Your **goal** — not auto-spend |
| **Suggested global Slot ×** (Planner E4) | `target ÷ sum(base escrow)` |
| **Slot ×** per bucket (column E) | Defaults to **=E4** — scaled total tracks target; override one row to tune |
| **Gap vs target** | Should be **≈ $0** when E column follows E4 |

**Not dynamic across file regenerate** — editing the Python generator and re-running overwrites the xlsx. Within the open spreadsheet, formulas persist.

**Budget tab** = static reference scenarios ($1k / $5k / $10k). **Planner tab** = the calculator.

Example: base catalog ≈ **$2.3k** escrow. Target **$5k** → suggested × ≈ **2.2** → paste into each Slot × → ~9.5k jobs.

## Spreadsheet styling

- **Tab colors:** cyan micro · green small · amber med · purple large
- **Zebra rows** + light gridlines on every data tab
- **Category column** — soft color chips (X_SOCIAL, JOB_LOOP, STAGE_MAIN, …)
- **Money columns** — `$0.00` format; slots as integers
- **Taller rows** on brief/done-when; header row frozen + filters
- **Overview** — event metadata + **live snapshot** from Planner (target, Slot ×, scaled escrow) + tab navigation — no duplicate bucket math
- **Planner** — single source of truth for bucket totals and scaling

Regenerate after edits: `ops/basecamp/.venv/bin/python ops/basecamp/generate-basecamp-jobs.py`
