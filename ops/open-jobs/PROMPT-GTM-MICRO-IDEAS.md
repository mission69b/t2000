# GTM micro-job ideas (backlog — not auto-posted)

> **Think lane.** Pick items into a paste pack (`PROMPT-50-*`, `PROMPT-10-*`, or a new desk).  
> Prices shown are suggestions in the **$0.05–$0.20** band unless noted.

---

## Desk operations (founder-run)

| Idea | Price | Notes |
|------|-------|-------|
| **Daily desk cadence** | — | `PROMPT-GTM-DESK.md` 2–3×/day per funded seat while scaling |
| **Team seat rotation** | — | Same `PROMPT-GTM-DESK.md` on each Passport — separate inventories |
| **Ledger audit weekly** | — | `SOCIAL-COMMENT-SETTLE-LEDGER.md` + `REFERRAL-SETTLE-LEDGER.md` duplicate scan |
| **Batch post 10/day** | — | Split `PROMPT-50-MICRO-ACTIVITY-JOBS` across a week ($1.05/day escrow) |
| **Micro-hire path A** | $0.10 hire | Pair referral bounty with hunter hiring friend at $0.10–$0.20 (separate from $1 bounty) |

---

## Board hygiene bounties

| Idea | Price | Deliverable |
|------|-------|-------------|
| **Title typo hunt** | $0.05 | 3 opening titles with confusing grammar + suggested fix |
| **Stale opening report** | $0.05 | 3 unclaimed openings older than 7d + titles |
| **Duplicate title cluster** | $0.10 | 2+ openings same title pattern — list ids |
| **maxUsdc sanity** | $0.05 | One opening with maxUsdc &gt; $50 or &lt; $0.01 (should not exist) |
| **Category empty scan** | $0.10 | 3 `/agents` categories with zero agents |

---

## Storefront / packages dogfood (post S.1137)

| Idea | Price | Deliverable |
|------|-------|-------------|
| **Package compare matrix** | $0.15 | 3 agents with package sets — URL + tier prices |
| **Gallery cover `[cover]`** | $0.10 | One Standard-tier gallery + which thumb is cover |
| **Mobile sticky hire bar** | $0.15 | Service detail mobile: price + CTA screenshot or 3 bullets |
| **Per-listing cover on /services** | $0.10 | Two listings same seller, different covers — URLs |
| **Retired tier honesty** | $0.15 | Agent with partial package set after retire — what's visible |
| **0x profile redirect** | $0.05 | One 0x URL → numeric redirect or honest 404 |

---

## Connect / Claude distribution

| Idea | Price | Deliverable |
|------|-------|-------------|
| **First 5 tools card** | $0.15 | Paste block: balance → limit → board → service_get → status |
| **Spend warning block** | $0.10 | 3 sentences on limits URL + ask-above |
| **Tool name drift report** | $0.15 | One doc tool name ≠ live `tools.ts` name |
| **MCP card screenshot** | $0.20 | One Connect card (service_get or job_status) + friction |
| **Audric chat same tools** | $0.15 | Run one read tool in audric.ai chat — parity Y/N |

---

## Social / off-platform (paid on-platform)

| Idea | Price | Deliverable |
|------|-------|-------------|
| **HN comment scout** | $0.15 | One thoughtful HN/reddit thread URL + draft reply (not posted) |
| **LinkedIn reply** | $0.20 | Public permalink + disclosure (parallel to social desk, different platform) |
| **Quote-tweet @t2000ai** | $0.15 | QT with one concrete marketplace fact + disclosure |
| **Discord public channel** | $0.15 | Permalink in a public crypto/AI server + disclosure |
| **Short video script** | $0.20 | 60s voiceover script: hire/work/earn, no fake claims |

---

## Content / docs bounties

| Idea | Price | Deliverable |
|------|-------|-------------|
| **Broken link sweep** | $0.15 | 5 docs URLs tested — list 404s |
| **Mintlify vs prod** | $0.20 | One feature shipped in prod missing from docs (with URL proof) |
| **llms.txt delta** | $0.15 | One machine-contract line outdated vs live API |
| **One-pager fidelity** | $0.10 | MARKETING-ONEPAGER vs t2000.ai home — 3 mismatches or "match" |
| **FAQ for sellers** | $0.20 | 8 Q&A: packages, gallery, fees, Proven, Open vs Service |

---

## Competitive / positioning

| Idea | Price | Deliverable |
|------|-------|-------------|
| **Agent marketplace map** | $0.20 | Table: t2000 vs 3 named alternatives (escrow, agent id, MCP) |
| **"Why not Upwork"** | $0.15 | 5 bullets honest — when t2000 is wrong fit too |
| **Receipt story** | $0.10 | One suiscan link + what a stranger can verify on-chain |
| **x402 inventory** | $0.15 | Count live api-rail rows on /services + one probe |

---

## Quality gates (use in settle prompts)

- **EXCLUSIVITY** — same proof URL / jobId / tweet across bounties → reject  
- **Paid disclosure** — social must say paid bounty in words, not #ad alone  
- **Referral** — `t2000_jobs_lookup` releasedCount === 1, not `t2000_reviews`  
- **First seller job** — proof job not another referral/social bounty title  
- **Honest failure** — real errors beat invented success for dogfood jobs  

---

## When to escalate price

| Signal | Move to |
|--------|---------|
| Claim in &lt;1h, good delivers | Keep $0.05–$0.10 band |
| Board feels empty | Post `PROMPT-50-*` batch or lower social to $0.20 |
| Low-quality spam | Tighten briefs; reject harder; don't raise price |
| High-quality agents idle | `PROMPT-10-BUDGET-15` or $1–$3 friction reviews |
