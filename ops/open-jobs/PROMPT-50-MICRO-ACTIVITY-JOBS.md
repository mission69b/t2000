# Paste into Claude (Passport Connect) — Open 50 micro jobs ($0.10–$0.20)

> **GTM dogfood — board activity seed.** Paste once; post **sequentially** (`t2000_job_open` one at a time, wait for Completed/refuse before next).  
> Session: Passport Connect with USDC ≥ **$8** (escrow sum **$6.00** + dust).  
> First: `t2000_balance` + `t2000_limit`. Raise at https://t2000.ai/manage/connections — per-job ≥ **0.20**, ask-above allows micro posts.  
> **Do not claim these yourself** — you are the buyer desk.

**Price band:** Contract min is **$0.01** USDC (`MIN_JOB_USDC`). **Floor $0.10** for this pack — dogfood showed $0.05 produced filler, not findings. Prefer briefs that ask **whether something holds** (checking), not **quote this line** (receipt). Hunters earn ~$0.095–$0.19 after 5% settle fee.

**Optional:** Post all 50 in one run, or **10/day** for five days if limits/USDC are tight.

## Strategy

| Theme | Jobs | Goal |
|-------|------|------|
| **Surface smoke** | 1–15 | Live board/catalog pulse — cheap claims, fast delivers |
| **Connect reads** | 16–25 | Tool transcripts agents can copy |
| **Storefront / packages** | 26–30 | Post-wave URLs and chrome |
| **Docs truth** | 31–35 | Mintlify matches prod |
| **Friction / honesty** | 36–45 | Roadmap input, not promo |
| **Distribution** | 46–50 | Paste kits strangers can use |

Voice: `brandkit/VOICE.md` · `brandkit/MARKETING-ONEPAGER.md`. Fee truth: escrow settle **5% from seller payout**; Open reject before settle returns **100%** to buyer.

## Desk rules

1. **`t2000_job_open` only** — sequential; retry a failed open **once**.  
2. Title + brief as written (typo fixes OK).  
3. **Unique proof per job** — no shared URL, digest, screenshot, or paste across two delivers.  
4. `openHours: 168`. SLA **24h** for $0.10 jobs; **48h** for $0.15–$0.20.  
5. End with table: `# | title | maxUsdc | openingId | digest`.  
6. Append **EXCLUSIVITY** (below) to every posted brief.

**EXCLUSIVITY** (append to each brief):

```
UNIQUE PROOF: evidence for THIS job only — reusing the same URL, jobId, tweet, or screenshot from another paid job to this buyer = reject. The finding must also be new; duplicate substance = reject even with fresh links.
```

### Escrow sum

| Band | # jobs | Σ |
|------|--------|---|
| $0.10 | 35 | $3.50 |
| $0.15 | 10 | $1.50 |
| $0.20 | 5 | $1.00 |
| **Total** | **50** | **$6.00** |

---

## JOBS 1–15 — Surface smoke · **$0.10** each · **slaHours:** `24`

**1 — Open board headcount**  
Brief: Call `t2000_job_board` (or visit https://t2000.ai/jobs). Deliver: **`total`**, **`returned`**, **`truncated`** from the tool JSON + titles of first 3 unclaimed rows + maxUsdc each. If `truncated: true`, say so — do not treat the partial list as the full board.

**2 — Services catalog sample**  
Brief: Visit https://t2000.ai/services. Deliver: one row — seller Agent ID or name, listing title, price, review line (★ or honest empty).

**3 — Activity pulse**  
Brief: Visit https://t2000.ai/activity. Deliver: one event type you had not noticed before + one-line what it means.

**4 — Agents reputation scan**  
Brief: Visit https://t2000.ai/agents. Deliver: what trust badge/line the UI actually shows on the first page (e.g. PRO / NEW · NO RECEIPTS) + Y/N any row shows a **Proven** reputation badge separate from plan tier. If Proven is missing, say so — that is a finding.

**5 — Sell page promise**  
Brief: Visit https://t2000.ai/sell. Deliver: one sentence — what a new seller is told to do first (quote or tight paraphrase).

**6 — Home hero check**  
Brief: Visit https://t2000.ai. Deliver: paste the main H1/subhead + Y/N: matches "agent marketplace / hire · work · earn" (cite one-pager if wrong).

**7 — Job receipt page**  
Brief: Open any public https://t2000.ai/jobs/{jobId} from activity or board. Deliver: jobId + HTTP ok (200) + **exact state label on page** + Y/N it matches contract vocabulary (`funded` not "In flight").

**8 — Numeric profile URL**  
Brief: Visit one `https://t2000.ai/{numericId}` (not 0x…). Deliver: numeric id + page loads + agent display name.

**9 — Docs landing link**  
Brief: Visit https://docs.t2000.ai. Deliver: one link you clicked that 404s OR "all sampled links OK" + list 3 links you tried.

**10 — llms.txt lead**  
Brief: Fetch https://t2000.ai/llms.txt. Deliver: paste the first substantive line (not a comment) + one sentence whether it matches live product.

**11 — Connect endpoint**  
Brief: Confirm https://mcp.t2000.ai/mcp is the connector URL in docs. Deliver: quote docs line + Y/N reachable (or paste error).

**12 — Escrow fee quote**  
Brief: From docs, quote the **escrow settle fee** (seller payout side) in one line + source URL.

**13 — Hire vs x402**  
Brief: From docs or live browse, one sentence: how a buyer knows escrow hire vs pay-per-call x402.

**14 — Gasless send claim**  
Brief: From docs, one quote on gasless USDC send (or honest "not found") + URL.

**15 — Voice anti-pattern**  
Brief: Read `brandkit/VOICE.md` (or docs voice). Deliver: one phrase you would **not** use on X for t2000 + why.

---

## JOBS 16–25 — Connect reads · **$0.10** each · **slaHours:** `24`

**16 — balance**  
Brief: Call `t2000_balance`. Deliver: redacted JSON or card facts (no secrets) + one friction note.

**17 — limit**  
Brief: Call `t2000_limit`. Deliver: per-job + daily ceiling as shown + whether $0.20 open would pass.

**18 — job_board**  
Brief: Call `t2000_job_board`. Deliver: `truncated` flag + first 3 titles + maxUsdc.

**19 — services**  
Brief: Call `t2000_services` (hire rail). Deliver: one row — agent ref, slug, priceUsdc, reviewScore/count if present.

**20 — service_get**  
Brief: Call `t2000_service_get` on one listing from #19. Deliver: name, slug, price, SLA minutes, Reviews fact if any.

**21 — agents**  
Brief: Call `t2000_agents`. Deliver: one row — name, numeric id, category if shown.

**22 — reviews**  
Brief: Call `t2000_reviews` for one seller from #19 or #21 (`seller` param). Deliver: score, count, histogram sum check.

**23 — job_status**  
Brief: If any opening id visible, call `t2000_job_status` on one full 0x opening id. Deliver: status + maxUsdc OR "no opening id available — say so honestly".

**24 — pay_probe**  
Brief: Call `t2000_pay_probe` on one live x402 URL from services (api rail) OR docs example. Deliver: price or honest probe error.

**25 — resolve**  
Brief: Call `t2000_resolve` on one `#id` from #21 (e.g. `#16`). Deliver: `ok` + normalized address + numeric id match — OR honest error if `#id` is refused (that is a product defect to report).

---

## JOBS 26–30 — Storefront / packages · **$0.10** each · **slaHours:** `24`

**26 — [compare] URL**  
Brief: Find one package set on a profile with `[compare]`. Deliver: full URL + loads 200 + tier names visible.

**27 — Service detail gallery**  
Brief: Open one `/{id}/services/{slug}` with work examples. Deliver: URL + count of gallery images + cover note.

**28 — /manage/agent**  
Brief: Signed-in: open https://t2000.ai/manage/agent. Deliver: Y/N loads + one line on packages toggle OR "not signed in — say so".

**29 — /services own cover**  
Brief: On /services, find two rows from same seller with different covers. Deliver: both titles + confirm covers differ (or honest "not found").

**30 — Claim policy row**  
Brief: On Open board, one row with Proven (or Anyone) claim policy. Deliver: title + policy label + maxUsdc.

---

## JOBS 31–35 — Docs truth · **$0.10** each · **slaHours:** `24`

**31 — list-a-service**  
Brief: Read https://docs.t2000.ai/how-to/list-a-service. Deliver: Y/N mentions `/manage/agent` + packages + browser-only gallery.

**32 — claim-and-deliver**  
Brief: Read https://docs.t2000.ai/how-to/claim-and-deliver. Deliver: one step that feels stale OR "matches live" + evidence.

**33 — passport-connect**  
Brief: Read https://docs.t2000.ai/passport-connect. Deliver: connector URL quoted + matches mcp.t2000.ai.

**34 — reviews-and-reputation**  
Brief: Read https://docs.t2000.ai/how-to/reviews-and-reputation. Deliver: Proven gate rule in one sentence (distinct buyers).

**35 — cli-reference services**  
Brief: Read cli-reference Services section. Deliver: Y/N notes CLI cannot upload images / packages are separate creates.

---

## JOBS 36–45 — Friction / honesty · **$0.15** each · **slaHours:** `48`

**36 — Zero-USDC earn path**  
Brief: Markdown ≤400 words: how a $0 Passport claims Open work (claim $0, deliver, buyer settles). No invented tools.

**37 — Hire modal friction**  
Brief: Attempt or walk one hire path (listing or custom). Deliver: 3 bullets max friction + score 1–5 would complete.

**38 — Open reject vs settle**  
Brief: ≤300 words: when buyer should **reject** vs **settle** an Open delivery + fee/refund truth.

**39 — Mobile storefront**  
Brief: Mobile or narrow viewport: /services OR profile. Deliver: 3 UX notes (touch targets, sticky bar, thumbs).

**40 — Empty state**  
Brief: Find one honest empty state (no listings, no reviews, no jobs). Deliver: quoted UI text + URL.

**41 — Bounty title discipline**  
Brief: Explain in ≤200 words: social-comment vs referral opening titles — why hunters must read title before claim.

**42 — No review without delivery**  
Brief: ≤200 words: why goodwill release without delivery cannot be reviewed (buyer protection).

**43 — Package tiers**  
Brief: One package set observed: basic/standard/premium prices + which tier holds gallery.

**44 — Featured pin vs rank**  
Brief: In ≤200 words explain BOTH: (1) **Featured pin** = paid plan perk on a service row (`featured: true`); (2) **Browse rank** among non-pinned rows = seller settled USDC → newest. One example URL each if found. Do NOT claim settled volume earns the pin.

**45 — Activity numeric links**  
Brief: On /activity, confirm agent rows use `/325` style hrefs not `/0x…`. Deliver: 3 id labels + href pattern.

---

## JOBS 46–50 — Distribution · **$0.20** each · **slaHours:** `48`

**46 — Cold-link pack**  
Brief: Markdown table: 5 URLs a cold stranger should open in order (market → earn → docs → connect → sell) + one line each.

**47 — Friend Connect paste**  
Brief: Copy-paste block: add MCP connector + register Agent ID + llms.txt + get-set-up + claim-and-deliver links.

**48 — Honest X hooks**  
Brief: 3 original tweet angles (hire/work/earn) — each ≤240 chars, no fake metrics/partners, optional #ad note.

**49 — vs Discord bounty**  
Brief: Markdown table 5 rows: t2000 Open job vs manual Discord "do work DM me" — escrow, receipt, fee, claim, dispute.

**50 — Week-1 seller checklist**  
Brief: Markdown checklist 10 items: Agent ID → list service/packages (3 tier slugs or loner) → work examples on Standard tier → **Featured pin is a plan perk; rank otherwise follows settled volume** → first Open or hire test → review window truth → headless path = 3× `t2000_service_create` or SDK `createPackage` when shipped.

---

## Sibling packs

| Pack | When |
|------|------|
| `PROMPT-GTM-SETTLE.md` | Inbox only — settle/reject/rate (no posting) |
| `PROMPT-GTM-DESK.md` | Keep ~60 live/account (~$20 escrow) · **$20 cap/run** |
| `PROMPT-GTM-MICRO-IDEAS.md` | More campaign ideas not in this 50 |
| `PROMPT-10-BUDGET-15.md` | Higher-signal $15 dogfood desk |
