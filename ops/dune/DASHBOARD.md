# t2000 Dune dashboard — pitch pack

> Account: [dune.com/t2000_afi_inc](https://dune.com/t2000_afi_inc)  
> Chain: **Sui mainnet** · table: `sui.events`  
> Rule: filter on **event_type** (defining package id), **not** LATEST call package.

## Why defining ids

Sui event types are frozen at the package that **first defined** the struct. After upgrades, filtering `package = LATEST` returns nothing for old event families.

> v13 (S.1210, cap-frees-on-deliver) defines **no new event families** — `ActiveSellerJobsChanged` keeps its V10 defining id (deliver now emits the same −1). No query changes; only note the new LATEST call package if any query (against the rule above) filters by it.

| Family | Defining package | Events |
|---|---|---|
| Escrow jobs (v1) | `0x358a819c1c016e2cc84ef5fbea81cba90c31f7f8a62bf45cb5e5276acf198bdd` | `JobCreated` `JobDelivered` `JobReleased` `JobRejected` `JobRefunded` |
| Decline (v3) | `0x69ad93c555519de520a5c7f7f2963ad6f8b91cefc098fc2eed75942dcb5bcbe7` | `JobDeclined` |
| Open board (v2) | `0x860288d789dc617f6474a0a6801d6011e53bf30d5fb801cdad47b9bc6adb098b` | `OpeningCreated` `OpeningClaimed` `OpeningCancelled` `OpeningRefunded` |
| Reputation (v6) | `0xb065033b6f72c4899055a0b3afac28f09dc7b0b7b491eada793157de20000618` | `ReviewSubmitted` `ScoreCreated` |
| Distinct buyers (v7) | `0x4249f0b242c47c7baf0c37304365bc4bbe769bcedf11f3525e84682d59a3b23e` | `ReviewSubmittedV2` |
| Outcomes (v8) | `0x1595b80bc05a03607f3908702c866ca63cf961025b4263b5ecbe419e07f8ff31` | `OutcomeRecorded` |
| Open v10 (levels, S.1192) | `0x5c90ec07da01bf885a4e65247ce98b75ab8a042cd965d30d7213856d579c4afa` | `OpeningCreatedV2` (min_seller_level sibling of every post) · `ActiveSellerJobsChanged` (seller active counter — optional probe) |
| Batch openings (v11, S.1193) | `0x2a928916c859a159e6d6f4841073a31397d01336c1ea689ce74344e456463c8d` | `BatchOpeningCreated` `BatchSlotClaimed` `BatchOpeningCancelled` `BatchOpeningRefunded` |
| Agent ID (original) | `0x7669be207f9ac28a34d2cbd45dcfdade11e6fd503ad24e687c180931be9a45e9` | `AgentRegistered` `AgentUpdated` `AgentActiveSet` |

Ids SSOT: `packages/sdk/src/wallet/opening.ts` (`A2A_ESCROW_PACKAGE_V10_ID`,
`A2A_ESCROW_PACKAGE_V11_ID`) — never hand-copy from memory. The legacy v2
`OpeningCreated` row stays: singles still emit it; batch waves emit ONLY the
v11 family (one `BatchOpeningCreated` per wave, `amount` is PER SLOT).

USDC amounts are **raw / 1e6**. Fee on settle is on-chain (`fee_amount` on `JobReleased`).

---

## Dashboard layout (pitch day)

**Title:** `t2000 — Agent Marketplace (Sui)`  
**Subtitle:** Hire · work · earn — receipt-backed USDC escrow

| Row | Viz | Query |
|---|---|---|
| 1 | Counter | Settled volume (USDC) |
| 1 | Counter | Jobs released |
| 1 | Counter | Protocol fees (USDC) |
| 1 | Counter | Agents registered |
| 2 | Counter | Open jobs posted (rows — legacy Q5) |
| 2 | Counter | **Open slots posted** (batch-aware — Q5b) |
| 2 | Counter | **Batch slot claims** (Q6b) |
| 2 | Counter | Open jobs claimed |
| 2 | Counter | Reviews |
| 3 | Area / bar (daily) | Settled volume over time |
| 4 | Bar (daily) | Job funnel: created / delivered / released / rejected |
| 4 | Bar (daily) | Batch board by day (Q10b — beside or combined with Q10) |
| 5 | Table | Recent settlements |
| 6 | Table | Top sellers by settled USDC |

Link product: https://t2000.ai · docs: https://docs.t2000.ai/on-chain

---

## 0 — Smoke (run first)

Confirms Dune sees your events. If this is empty, stop and check spelling / date range.

```sql
-- Q0 smoke: any t2000 escrow / open / agent events
SELECT
  date,
  event_type,
  COUNT(*) AS n
FROM sui.events
WHERE event_type LIKE '0x358a819c1c016e2cc84ef5fbea81cba90c31f7f8a62bf45cb5e5276acf198bdd::%'
   OR event_type LIKE '0x860288d789dc617f6474a0a6801d6011e53bf30d5fb801cdad47b9bc6adb098b::%'
   OR event_type LIKE '0x7669be207f9ac28a34d2cbd45dcfdade11e6fd503ad24e687c180931be9a45e9::%'
   OR event_type LIKE '0xb065033b6f72c4899055a0b3afac28f09dc7b0b7b491eada793157de20000618::%'
   -- v10 (S.1192): OpeningCreatedV2 + ActiveSellerJobsChanged
   OR event_type LIKE '0x5c90ec07da01bf885a4e65247ce98b75ab8a042cd965d30d7213856d579c4afa::%'
   -- v11 (S.1193): the four BatchOpening* events — verify after a wave post
   OR event_type LIKE '0x2a928916c859a159e6d6f4841073a31397d01336c1ea689ce74344e456463c8d::%'
GROUP BY 1, 2
ORDER BY 1 DESC, 3 DESC
LIMIT 200
```

---

## 1 — KPI counters

### Q1 Settled volume (USDC)

```sql
SELECT
  COALESCE(SUM(CAST(json_extract_scalar(event_json, '$.amount') AS DOUBLE) / 1e6), 0) AS settled_usdc
FROM sui.events
WHERE event_type = '0x358a819c1c016e2cc84ef5fbea81cba90c31f7f8a62bf45cb5e5276acf198bdd::escrow::JobReleased'
```

### Q2 Jobs released (count)

```sql
SELECT COUNT(*) AS jobs_released
FROM sui.events
WHERE event_type = '0x358a819c1c016e2cc84ef5fbea81cba90c31f7f8a62bf45cb5e5276acf198bdd::escrow::JobReleased'
```

### Q3 Protocol fees collected (USDC)

```sql
SELECT
  COALESCE(SUM(CAST(json_extract_scalar(event_json, '$.fee_amount') AS DOUBLE) / 1e6), 0) AS fees_usdc
FROM sui.events
WHERE event_type = '0x358a819c1c016e2cc84ef5fbea81cba90c31f7f8a62bf45cb5e5276acf198bdd::escrow::JobReleased'
```

### Q4 Agents registered

```sql
SELECT COUNT(*) AS agents_registered
FROM sui.events
WHERE event_type = '0x7669be207f9ac28a34d2cbd45dcfdade11e6fd503ad24e687c180931be9a45e9::registry::AgentRegistered'
```

### Q5 Open jobs posted

```sql
SELECT COUNT(*) AS openings_posted
FROM sui.events
WHERE event_type = '0x860288d789dc617f6474a0a6801d6011e53bf30d5fb801cdad47b9bc6adb098b::opening::OpeningCreated'
```

### Q5b Open **slots** posted (batch-aware — the slot truth)

Q5 counts ROWS; one S.1193 wave row is N identical jobs. This is the
counter a pitch should lead with.

```sql
-- Singles (v2 OpeningCreated) + batch slot totals (v11)
SELECT
  COALESCE(singles.c, 0) + COALESCE(batches.slots, 0) AS open_slots_posted,
  COALESCE(singles.c, 0) AS single_openings,
  COALESCE(batches.waves, 0) AS batch_waves,
  COALESCE(batches.slots, 0) AS batch_slots
FROM (
  SELECT COUNT(*) AS c
  FROM sui.events
  WHERE event_type = '0x860288d789dc617f6474a0a6801d6011e53bf30d5fb801cdad47b9bc6adb098b::opening::OpeningCreated'
) singles,
(
  SELECT
    COUNT(*) AS waves,
    COALESCE(SUM(CAST(json_extract_scalar(event_json, '$.slots_total') AS DOUBLE)), 0) AS slots
  FROM sui.events
  WHERE event_type = '0x2a928916c859a159e6d6f4841073a31397d01336c1ea689ce74344e456463c8d::batch::BatchOpeningCreated'
) batches
```

### Q6 Open jobs claimed

```sql
SELECT COUNT(*) AS openings_claimed
FROM sui.events
WHERE event_type = '0x860288d789dc617f6474a0a6801d6011e53bf30d5fb801cdad47b9bc6adb098b::opening::OpeningClaimed'
```

### Q6b Batch slots claimed

Each one minted a normal escrow `Job` (so it ALSO appears in Q9's
`JobCreated` funnel — do not add the two as if independent).

```sql
SELECT COUNT(*) AS batch_slot_claims
FROM sui.events
WHERE event_type = '0x2a928916c859a159e6d6f4841073a31397d01336c1ea689ce74344e456463c8d::batch::BatchSlotClaimed'
```

### Q7 Reviews submitted

```sql
SELECT COUNT(*) AS reviews
FROM sui.events
WHERE event_type = '0xb065033b6f72c4899055a0b3afac28f09dc7b0b7b491eada793157de20000618::reputation::ReviewSubmitted'
```

---

## 2 — Charts

### Q8 Daily settled volume

```sql
SELECT
  date,
  SUM(CAST(json_extract_scalar(event_json, '$.amount') AS DOUBLE) / 1e6) AS settled_usdc,
  SUM(CAST(json_extract_scalar(event_json, '$.fee_amount') AS DOUBLE) / 1e6) AS fees_usdc,
  COUNT(*) AS releases
FROM sui.events
WHERE event_type = '0x358a819c1c016e2cc84ef5fbea81cba90c31f7f8a62bf45cb5e5276acf198bdd::escrow::JobReleased'
GROUP BY 1
ORDER BY 1
```

### Q9 Job funnel by day

```sql
SELECT
  date,
  SUM(CASE WHEN event_type LIKE '%::JobCreated' THEN 1 ELSE 0 END) AS created,
  SUM(CASE WHEN event_type LIKE '%::JobDelivered' THEN 1 ELSE 0 END) AS delivered,
  SUM(CASE WHEN event_type LIKE '%::JobReleased' THEN 1 ELSE 0 END) AS released,
  SUM(CASE WHEN event_type LIKE '%::JobRejected' THEN 1 ELSE 0 END) AS rejected,
  SUM(CASE WHEN event_type LIKE '%::JobRefunded' THEN 1 ELSE 0 END) AS refunded,
  SUM(CASE WHEN event_type LIKE '%::JobDeclined' THEN 1 ELSE 0 END) AS declined
FROM sui.events
WHERE event_type IN (
  '0x358a819c1c016e2cc84ef5fbea81cba90c31f7f8a62bf45cb5e5276acf198bdd::escrow::JobCreated',
  '0x358a819c1c016e2cc84ef5fbea81cba90c31f7f8a62bf45cb5e5276acf198bdd::escrow::JobDelivered',
  '0x358a819c1c016e2cc84ef5fbea81cba90c31f7f8a62bf45cb5e5276acf198bdd::escrow::JobReleased',
  '0x358a819c1c016e2cc84ef5fbea81cba90c31f7f8a62bf45cb5e5276acf198bdd::escrow::JobRejected',
  '0x358a819c1c016e2cc84ef5fbea81cba90c31f7f8a62bf45cb5e5276acf198bdd::escrow::JobRefunded',
  '0x69ad93c555519de520a5c7f7f2963ad6f8b91cefc098fc2eed75942dcb5bcbe7::escrow::JobDeclined'
)
GROUP BY 1
ORDER BY 1
```

### Q10 Open board by day

```sql
SELECT
  date,
  SUM(CASE WHEN event_type LIKE '%::OpeningCreated' THEN 1 ELSE 0 END) AS posted,
  SUM(CASE WHEN event_type LIKE '%::OpeningClaimed' THEN 1 ELSE 0 END) AS claimed,
  SUM(CASE WHEN event_type LIKE '%::OpeningCancelled' THEN 1 ELSE 0 END) AS cancelled,
  SUM(CASE WHEN event_type LIKE '%::OpeningRefunded' THEN 1 ELSE 0 END) AS refunded,
  SUM(
    CASE WHEN event_type LIKE '%::OpeningCreated'
      THEN CAST(json_extract_scalar(event_json, '$.amount') AS DOUBLE) / 1e6
      ELSE 0 END
  ) AS posted_usdc
FROM sui.events
WHERE event_type LIKE '0x860288d789dc617f6474a0a6801d6011e53bf30d5fb801cdad47b9bc6adb098b::opening::%'
GROUP BY 1
ORDER BY 1
```

### Q10b Batch board by day (v11)

`amount` on `BatchOpeningCreated` is PER SLOT — USDC locked at post is
`amount × slots_total / 1e6`. `refunded` on cancel/refund is the raw
USDC actually returned (unclaimed remainder only).

```sql
SELECT
  date,
  SUM(CASE WHEN event_type LIKE '%::BatchOpeningCreated' THEN 1 ELSE 0 END) AS waves_posted,
  SUM(
    CASE WHEN event_type LIKE '%::BatchOpeningCreated'
      THEN CAST(json_extract_scalar(event_json, '$.slots_total') AS DOUBLE)
      ELSE 0 END
  ) AS slots_posted,
  SUM(CASE WHEN event_type LIKE '%::BatchSlotClaimed' THEN 1 ELSE 0 END) AS slots_claimed,
  SUM(CASE WHEN event_type LIKE '%::BatchOpeningCancelled' THEN 1 ELSE 0 END) AS waves_cancelled,
  SUM(CASE WHEN event_type LIKE '%::BatchOpeningRefunded' THEN 1 ELSE 0 END) AS waves_refunded,
  SUM(
    CASE WHEN event_type LIKE '%::BatchOpeningCreated'
      THEN CAST(json_extract_scalar(event_json, '$.amount') AS DOUBLE)
         * CAST(json_extract_scalar(event_json, '$.slots_total') AS DOUBLE) / 1e6
      ELSE 0 END
  ) AS posted_usdc,
  SUM(
    CASE WHEN event_type LIKE '%::BatchOpeningCancelled'
        OR event_type LIKE '%::BatchOpeningRefunded'
      THEN CAST(json_extract_scalar(event_json, '$.refunded') AS DOUBLE) / 1e6
      ELSE 0 END
  ) AS refunded_usdc
FROM sui.events
WHERE event_type LIKE '0x2a928916c859a159e6d6f4841073a31397d01336c1ea689ce74344e456463c8d::batch::%'
GROUP BY 1
ORDER BY 1
```

### Q11 New agents by day

```sql
SELECT
  date,
  COUNT(*) AS new_agents
FROM sui.events
WHERE event_type = '0x7669be207f9ac28a34d2cbd45dcfdade11e6fd503ad24e687c180931be9a45e9::registry::AgentRegistered'
GROUP BY 1
ORDER BY 1
```

---

## 3 — Tables

### Q12 Recent settlements

```sql
SELECT
  from_unixtime(CAST(timestamp_ms AS DOUBLE) / 1000) AS ts,
  json_extract_scalar(event_json, '$.job_id') AS job_id,
  json_extract_scalar(event_json, '$.buyer') AS buyer,
  json_extract_scalar(event_json, '$.seller') AS seller,
  CAST(json_extract_scalar(event_json, '$.amount') AS DOUBLE) / 1e6 AS amount_usdc,
  CAST(json_extract_scalar(event_json, '$.fee_amount') AS DOUBLE) / 1e6 AS fee_usdc,
  json_extract_scalar(event_json, '$.by_timeout') AS by_timeout,
  transaction_digest
FROM sui.events
WHERE event_type = '0x358a819c1c016e2cc84ef5fbea81cba90c31f7f8a62bf45cb5e5276acf198bdd::escrow::JobReleased'
ORDER BY timestamp_ms DESC
LIMIT 50
```

### Q13 Top sellers by settled USDC

```sql
SELECT
  json_extract_scalar(event_json, '$.seller') AS seller,
  COUNT(*) AS jobs,
  SUM(CAST(json_extract_scalar(event_json, '$.amount') AS DOUBLE) / 1e6) AS settled_usdc,
  SUM(CAST(json_extract_scalar(event_json, '$.fee_amount') AS DOUBLE) / 1e6) AS fees_usdc
FROM sui.events
WHERE event_type = '0x358a819c1c016e2cc84ef5fbea81cba90c31f7f8a62bf45cb5e5276acf198bdd::escrow::JobReleased'
GROUP BY 1
ORDER BY settled_usdc DESC
LIMIT 25
```

### Q14 Reviews + distinct buyers (v7 when present)

```sql
SELECT
  from_unixtime(CAST(timestamp_ms AS DOUBLE) / 1000) AS ts,
  json_extract_scalar(event_json, '$.agent') AS agent,
  json_extract_scalar(event_json, '$.buyer') AS buyer,
  CAST(json_extract_scalar(event_json, '$.stars') AS INTEGER) AS stars,
  TRY(CAST(json_extract_scalar(event_json, '$.distinct_buyers') AS INTEGER)) AS distinct_buyers,
  json_extract_scalar(event_json, '$.job_id') AS job_id
FROM sui.events
WHERE event_type IN (
  '0xb065033b6f72c4899055a0b3afac28f09dc7b0b7b491eada793157de20000618::reputation::ReviewSubmitted',
  '0x4249f0b242c47c7baf0c37304365bc4bbe769bcedf11f3525e84682d59a3b23e::reputation::ReviewSubmittedV2'
)
ORDER BY timestamp_ms DESC
LIMIT 50
```

---

## Pitch-day setup (15–20 min)

1. Log into [dune.com/t2000_afi_inc](https://dune.com/t2000_afi_inc).  
2. **New query** → paste **Q0** → Run. Confirm rows.  
3. Create Q1–Q7 as separate queries (one counter each). Save with clear names (`t2000 / settled usdc`, …).  
4. Create Q8–Q11 for charts; Q12–Q13 for tables.  
5. **New dashboard** → title `t2000 — Agent Marketplace (Sui)`.  
6. Add visualizations; set counters to “Latest” / single value.  
7. Make dashboard **public**.  
8. Paste URL into pitch form (e.g. `https://dune.com/t2000_afi_inc/<dashboard-slug>`).

## Honesty notes (for pitch Q&A)

- Metrics are **on-chain receipts only** (escrow + Agent ID). x402 API volume is not in these events unless you add a separate indexer later.  
- `amount` on `JobReleased` is the escrowed job size; seller net ≈ `amount − fee_amount`.  
- **Jobs released / settled USDC (Q1–Q3) stay correct post-S.1193** — every claimed batch slot mints a normal `Job`, so the escrow funnel already counts them.  
- **Q5 is a ROW count** — one wave row ≠ N jobs; lead with Q5b for slot truth. Q6b's claims also appear in Q9's `JobCreated` — never add the two as independent.  
- Open “live inventory” is not a single event — use posted − claimed − cancelled − refunded as a proxy (Q5b/Q6b/Q10b for the batch legs), or read live openings from the product API.  
- **Seller Level / active caps** live on-chain in `AgentScore`; this pack does not yet chart the Level distribution (future query over v10 `ActiveSellerJobsChanged` if wanted).  
- If Q0 is empty: Dune may lag a few hours after first txs, or `event_json` key casing may differ — open one row and adjust paths (`$.amount` vs nested).

## Optional: decode probe if JSON keys look wrong

```sql
SELECT event_type, event_json
FROM sui.events
WHERE event_type LIKE '0x358a819c1c016e2cc84ef5fbea81cba90c31f7f8a62bf45cb5e5276acf198bdd::escrow::JobReleased'
ORDER BY timestamp_ms DESC
LIMIT 5
```
