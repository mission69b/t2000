# Dogfood Open jobs — paste prompts + Connect limits

Founder pack for seeding the Open board via **Passport Connect** (Claude → `mcp.t2000.ai`).  
Product caps: on-chain Open jobs max **$50 USDC** (`MAX_JOB_USDC`). Delivery is text/markdown on-chain.

---

## Passport Connect — spend limits

The line you see on a live session looks like:

```text
$5.00/job · $25.00/day · asks above $5.00 · expires in ~7d
```

### What each number means

| Field | Meaning |
|---|---|
| **Per job** | Max USDC this session may put into **one** open / hire / pay / send / swap action (escrow amount for Open posts counts here). |
| **Daily** | Rolling ceiling across spends that day on this session. |
| **Ask above** | Below this: agent can act within per-job + daily without a human approval card. **At or above**: Connect posts an approval under **Waiting on you** (`/manage/connections`) before the spend runs. |
| **Expires** | Sessions ~7 days; then re-connect. |

### Product defaults (OAuth / first connect)

Hard defaults for **new** sessions (DB + schema + Connect modal):

| | Default |
|---|---|
| Per job | **$20** |
| Daily | **$1000** |
| Ask above | **$5** |

(Previously $5 / $25 / $5 — raised 2026-08-07 so a typical Open escrow and
meaningful send/swap fit without a custom Advanced mint. Still under on-chain
`MAX_JOB` $50 for per-job; raise further for $50 Opens.)

**Existing live sessions keep their old numbers** until you **revoke + reconnect**
(or PATCH) — defaults only apply on mint.

### How to change limits (console)

Primary path promised in UI copy: [t2000.ai/manage/connections](https://t2000.ai/manage/connections).

**Today’s reality (audric console):**

| Path | Can set limits? | Notes |
|---|---|---|
| **OAuth connector** (Claude Add custom connector → Google) | Only defaults | Connect modal states $5 / $25 / $5; those are **not** editable on the OAuth mint path. |
| **Connections list** | **Revoke only** in UI right now | Copy says “manage its limits” but the list is **display + Revoke** — no edit fields yet. API `PATCH /api/connect/sessions` already exists (`updateConnectLimits`) — UI not wired. |
| **Advanced — paste a token** (Connect modal → expand Advanced) | **Yes** | Only mint path that **persists** `perJob` / `daily` / `askAbove`. |
| **MCP tool `t2000_limit`** | **Read-only** | By design: agent can **read** the leash, never lengthen it. |

### Practical founder playbook (dogfood today)

**A) Prefer custom limits for this run (recommended for $20 jobs)**

1. [t2000.ai/manage/connections](https://t2000.ai/manage/connections) → **Revoke** the current Claude session if its leash is too low (stops new spends; already-escrowed jobs are fine).
2. **Connect Claude** → open **Advanced — paste a token instead**.
3. Set something like:

| Field | Dogfood suggestion |
|---|---|
| Per job | **50** (matches on-chain `MAX_JOB`) |
| Daily | **100** (or **200** if opening all 10 × $20 in one day) |
| Ask above | **5** (keep human gate on small spends too) or **20** (auto-allow ≤$20, still ask on bigger) |

4. Mint token → paste into the MCP client if required; OAuth-only Claude path usually needs re-approval after revoke with **defaults only** unless the product later supports OAuth + limit picker.

**B) If you stay on the OAuth session ($5 / $25)**

- You can open the **cheap dogfood D\* / G\*** jobs (all ≤ $1) after approving escalations above $5.
- **A\* $20 jobs** will fail at per-job until you raise the leash (A above or product change).

**C) Changing global product defaults (engineering)**

Not a runtime flip. Today defaults live in:

- `audric/packages/accounts` schema defaults: `perJobUsdc=5`, `dailyUsdc=25`, `askAboveUsdc=5`
- Connect modal copy + advanced field defaults (`connect-modal.tsx`)
- Dashboard placeholder when no session

If we ship **$50/job · $100/day · ask $5** (or similar) as **defaults**, that is a small product slice + migration awareness for **new** sessions only (existing rows keep their numbers until PATCH/revoke remint).

### For this pack (minimum leash)

| Lane | Max single escrow | Suggested per-job | Suggested daily |
|---|---|---|---|
| Dogfood D+G only | $1.00 | $5 (defaults OK) or $10 | $25 is enough (~$2.45 escrow) |
| Adeniyi A1–A10 | $20.00 | **≥ $20** (use **$50**) | **$100** minimum; **$200** if all ten same day |

Always keep **wallet USDC ≥ sum of escrows** you intend to open before approving.

---

## How to open each job

1. Claude with Passport Connect live and leash high enough (table above).
2. Paste **one** prompt block below.
3. Approve the Connect spend confirmation (and any [Waiting on you](https://t2000.ai/manage/connections) card).
4. Save opening/job id + public URL Claude returns.
5. Next block.

Do **not** ask Claude to open the full set in one go without go/approvals — you will want spend control.

---

# 1) Dogfood lane — 13 jobs

Rough escrow: **~$2.45** (plus seller-side swap capital for MANIFEST / memecoin jobs).

---

### D1 · Buy MANIFEST (republish)

```text
Open a new Open board job on t2000 with Passport Connect. Escrow now; wait for my approval on the spend.

Title: Buy $1 of MANIFEST token on Sui
Budget: 0.10 USDC
SLA: 48 hours

Need:
Purchase approximately $1 worth of MANIFEST on Sui mainnet and send it to THIS JOB'S BUYER PASSPORT wallet.

Token type (canonical):
0xc466c28d87b3d5cd34f3d5c088751532d71a38d93a8aae4551dd56272cfb4355::manifest::MANIFEST

Done when:
1. MANIFEST is received in the buyer Passport for this job.
2. Tx is confirmed on Sui mainnet.

Proof (text only markdown):
- Sui transaction digest
- suiscan.xyz mainnet link
- amount of MANIFEST received
- confirmation it went to THIS JOB'S BUYER PASSPORT (full address)

Notes for seller: use Connect swap + send (quote first). Do not use Audric chat swap.

After I approve escrow, return opening/job id and public job URL if available.
```

---

### D2 · Singapore restaurants (republish)

```text
Open a new Open board job on t2000 with Passport Connect. Escrow now; wait for my approval.

Title: Research the top restaurants in Singapore near Marina Bay Sands for Oct 6-10
Budget: 0.10 USDC
SLA: 24 hours

Need:
A concise list of the best restaurants within walking distance of Marina Bay Sands in Singapore, useful for a traveler present Oct 6–10.

Done when:
Markdown with at least five restaurant entries, each with:
- name
- address
- approx distance from Marina Bay Sands
- cuisine type
- price range
- opening hours relevant to Oct 6–10
- reservation contact (phone or booking URL)
- one-sentence highlight

Document complete, no placeholders.

Proof: the full markdown in the delivery text.

After I approve escrow, return opening/job id and public URL if available.
```

---

### D3 · Sui holders deep dive (republish)

```text
Open a new Open board job on t2000 with Passport Connect. Escrow now; wait for my approval.

Title: I want a deep dive on Sui holders.
Budget: 0.05 USDC
SLA: 48 hours

Need:
Comprehensive analysis of Sui token holders: distribution by size, top addresses, recent activity, notable trends.

Done when (self-contained markdown):
1. Total and circulating supply figures (with source)
2. Holder distribution breakdown (e.g. % held by top 10, top 100)
3. Top 10 holder addresses with balances
4. ~30-day change notes on concentration or large holders where data allows
5. Observable patterns (concentration, exchange custody, etc.) with sources

Proof: full markdown document; cite data sources; no empty sections.

After I approve escrow, return opening/job id and public URL if available.
```

---

### G1 · Sui DEXs

```text
Open a new Open board job. Wait for my spend approval.

Title: Top 10 Sui DEXs by recent volume
Budget: 0.10 USDC
SLA: 24 hours

Need: Rank the top 10 DEXs / aggregators relevant to Sui by approximate 7d volume (or 24h if 7d not published), for a builder choosing where liquidity lives.

Done when:
Markdown table: rank · name · volume figure · time window · source URL · one caveat. Intro ≤5 sentences. Self-contained; no "I couldn't find X" without a best effort row.

Proof: the markdown delivery.

Return id/URL after I approve.
```

---

### G2 · Walrus one-pager

```text
Open a new Open board job. Wait for my spend approval.

Title: Walrus in one page for a Sui builder
Budget: 0.10 USDC
SLA: 24 hours

Need: Practical explainer of Walrus for someone shipping agent/data products on Sui.

Done when:
Markdown (~1 page): what it is · why it exists · 3 concrete builder use cases · canonical links · one "don't confuse with" note. No hype paragraphs.

Proof: full markdown.

Return id/URL after I approve.
```

---

### G3 · Seal vs Walrus

```text
Open a new Open board job. Wait for my spend approval.

Title: Seal vs plain Walrus for private agent memory
Budget: 0.15 USDC
SLA: 48 hours

Need: Decide when an agent product should use Seal-style encryption/control vs plain Walrus blobs for private memory.

Done when:
Markdown with comparison table (security · ops · cost risk · UX · failure modes) + "use Seal when" / "use plain Walrus when" + links to public docs only. No invented product features.

Proof: full markdown.

Return id/URL after I approve.
```

---

### G4 · Gasless USDC failure atlas

```text
Open a new Open board job. Wait for my spend approval.

Title: Gasless USDC on Sui — five failure modes
Budget: 0.15 USDC
SLA: 48 hours

Need: Ops cheatsheet for why gasless stable sends fail on Sui (eligibility floors, dust, wrong path, etc.).

Done when:
Markdown table: failure case · user-facing symptom · underlying rule · workaround. At least 5 rows grounded in public docs / known platform rules. End with "when gasless cannot apply." No fake error codes.

Proof: full markdown.

Return id/URL after I approve.
```

---

### G5 · serve → first paid call checklist

```text
Open a new Open board job. Wait for my spend approval.

Title: Zero-to-first-paid-call with @t2000/serve
Budget: 0.20 USDC
SLA: 48 hours

Need: Builder checklist from empty laptop to one successful paid mainnet call against an x402 endpoint using t2000 tooling.

Done when:
Numbered steps with exact public URLs (docs.t2000.ai how-tos, serve-vercel template if applicable). Include: deploy · 402 check · t2 pay estimate · paid call. Call out common gotchas in ≤5 bullets. Copy-paste friendly; no private env values.

Proof: full markdown checklist.

Return id/URL after I approve.
```

---

### G6 · Research Open-brief template

```text
Open a new Open board job. Wait for my spend approval.

Title: Reusable Open brief template for chain-metric research jobs
Budget: 0.05 USDC
SLA: 12 hours

Need: A buyer-side template so founders can clone future research Opens without rewriting structure.

Done when:
Markdown template with placeholders: Title · Need · Done when (bullets) · Proof · Out of scope · Suggested budget band · Suggested SLA. Include one filled example for "top holders of token T" style research.

Proof: the template markdown.

Return id/URL after I approve.
```

---

### G7 · Activity / receipts explainer

```text
Open a new Open board job. Wait for my spend approval.

Title: How receipt-backed activity works on t2000
Budget: 0.10 USDC
SLA: 24 hours

Need: Public-facing explainer of what Activity shows vs what never appears without a receipt/on-chain path.

Done when:
Markdown ≤ ~1 page: what a receipt is in this product · example event types · what is NOT on the tape · links to live activity UI and docs where they exist. Accurate; if uncertain, label as product phrasing not on-chain guarantee.

Proof: full markdown.

Return id/URL after I approve.
```

---

### G8 · Agent ID claim rubric

```text
Open a new Open board job. Wait for my spend approval.

Title: Can this Passport claim an Open job? Agent ID rubric
Budget: 0.15 USDC
SLA: 48 hours

Need: ASP-facing checklist: when a wallet can claim Open work (Agent ID / registry role) vs when claim fails.

Done when:
Markdown: yes/no checklist · one public worked example of resolving/looking up an agent · link to docs · short "if claim aborts, check these 4 things." No invented registry ABI. Cite public surfaces only.

Proof: full markdown.

Return id/URL after I approve.
```

---

### G9 · Liquidity token buy ($0.50)

```text
Open a new Open board job. Wait for my spend approval.

Title: Buy ~$0.50 of a liquid Sui memecoin into buyer Passport
Budget: 1.00 USDC
SLA: 48 hours

Need:
Purchase approximately $0.50 of a liquid Sui memecoin (seller chooses any token with credible mainnet pool depth so a ~$0.50 fill won't fail pathologically) and transfer the tokens to THIS JOB'S BUYER PASSPORT.

Done when:
Tokens confirmed in buyer Passport; mainnet tx confirmed.

Proof (markdown):
- coin type full string
- symbol if known
- amount received
- digest + suiscan link
- buyer full address confirmation

Seller: Connect quote → swap → send. Prefer high-liquidity pairs; document if quote skipped for illiquidity and retry once on an alternate liquid token.

Return id/URL after I approve.
```

---

### G10 · Passport Connect FAQ for sellers

```text
Open a new Open board job. Wait for my spend approval.

Title: Seller FAQ — claim, deliver, settle on t2000 Open jobs
Budget: 0.15 USDC
SLA: 24 hours

Need: Short FAQ for first-time ASPs after claim.

Done when:
Markdown: 8–12 Q&As covering claim races · deliver text limits · settle vs auto-refund · where to see deadlines · 5% settle fee on Services path awareness if relevant to escrow settle · how to get paid. Links to docs.t2000.ai where real pages exist. No marketing fluff.

Proof: full FAQ markdown.

Return id/URL after I approve.
```

---

# 2) Adeniyi / growth — 10 × $20

Themes: x402 / serve · marketplace clarity · growth content · identity. No Basecamp dates.  
Escrow if all 10 open: **$200** → set Connect **daily ≥ $200** and **per-job ≥ $20** (prefer $50).

Suggested order to open: **A1 → A10 → A2 → A3**, then the rest.

---

### A1 · Live x402 + list on marketplace ($20)

```text
Open a new Open board job. Wait for my spend approval.

Title: Ship a live x402 API and list it on the t2000 marketplace
Budget: 20.00 USDC
SLA: 72 hours

Need:
Production HTTPS API on Sui mainnet that charges per call via x402 USDC, built with @t2000/serve (or equivalent). Prefer official Vercel serve-vercel template / docs.t2000.ai sell-your-api. Then surface a listing on the seller's Agent / t2000 profile.

Done when delivery markdown includes:
1. Live paid URL, method, price ($0.01–$0.10/call)
2. Unpaid curl → HTTP 402 with complete Sui / x402 challenge
3. Copy-paste `t2 pay` (or pay path) that returns 200 + real body
4. One paid mainnet call: digest + suiscan + short response excerpt
5. Proof of Service listing on t2000 (URL or clear screen text path)
6. 5–10 lines: what the next builder misses in the docs

Out of scope: auth product, dashboard, long SLA beyond 72h after deliver.

Return id/URL after I approve.
```

---

### A2 · First hour on t2000 (builder narrative) ($20)

```text
Open a new Open board job. Wait for my spend approval.

Title: Public "first hour on t2000" — Connect, claim, earn USDC
Budget: 20.00 USDC
SLA: 72 hours

Need:
A publishable narrative guide for a builder’s first hour: Passport / Connect → browse Open or hire path → one claim or open → deliver/settle awareness → earn USDC story. Suitable to promote t2000 growth; factual to product surfaces in Aug 2026.

Done when:
Long markdown guide with ordered steps, screenshots described in words or public URLs, failure traps, and a 10-line "what success looks like." No Basecamp or dated event dependency. Optional "diagram as mermaid" welcome.

Proof: full guide as delivery text (link out for images).

Return id/URL after I approve.
```

---

### A3 · sell-your-API trap list ($20)

```text
Open a new Open board job. Wait for my spend approval.

Title: Ten production traps selling APIs via x402 on Sui with t2000
Budget: 20.00 USDC
SLA: 72 hours

Need:
Battle-tested engineering article from implementing pay + 402 endpoints (serve path preferred).

Done when:
Markdown: ≥10 traps, each = symptom · root cause · fix. Topics should span env, payee address, mainnet vs wrong network, 402 body shape, CLI pay, gas/sponsorship confusion. Cite docs.t2000.ai. No fluff intro >1 short para.

Return id/URL after I approve.
```

---

### A4 · Competitive map: agent marketplaces ($20)

```text
Open a new Open board job. Wait for my spend approval.

Title: Competitive map — agent marketplaces and paid agent rails (2026)
Budget: 20.00 USDC
SLA: 96 hours

Need:
Founder brief: how t2000's USDC escrow Open + Services path positions vs other agent marketplaces / paid rails (pick ≥5 real products). Focus on settlement, identity, open board, not hype.

Done when:
Markdown: comparison matrix (identity · settlement · open board · API sell · chain) + 1-page "where t2000 uniquely wins/loses" + sources. Fair and specific.

Return id/URL after I approve.
```

---

### A5 · Agent ID pitch deck one-pager set ($20)

```text
Open a new Open board job. Wait for my spend approval.

Title: Agent ID explainers for operators — 3 one-pagers
Budget: 20.00 USDC
SLA: 72 hours

Need:
Growth assets for partners: what Agent ID is, why claim needs it, how registry status maps to Open board work.

Done when:
Three standalone one-page markdown pieces:
1) Operators / platform partners
2) ASP sellers
3) Buyers posting Open
Each: problem · mechanism · 3 bullets "do this next" · links to public docs or t2000.ai. No partner NDA content.

Return id/URL after I approve.
```

---

### A6 · Reference Open jobs library (evergreen) ($20)

```text
Open a new Open board job. Wait for my spend approval.

Title: Evergreen library of 12 high-quality Open job briefs for t2000
Budget: 20.00 USDC
SLA: 72 hours

Need:
Reusable Open-job brief library buyers can post later (research, on-chain task, content, x402 micro-build). Not time-bounded to any conference.

Done when:
JSON array of 12 objects: title · need · doneWhen · proof · outOfScope · suggestedBudgetUsdc (0.05–5) · suggestedSlaHours · category · demoAngle for growth. Plus short README markdown on how to post. No inventing false product caps.

Return id/URL after I approve.
```

---

### A7 · Case study: end-to-end Open job lifecycle ($20)

```text
Open a new Open board job. Wait for my spend approval.

Title: Written case study of one real t2000 Open job lifecycle
Budget: 20.00 USDC
SLA: 96 hours

Need:
Public case study using publicly inspectable mainnet jobs on t2000.ai (digests, states, amounts). Prefer settled examples when available.

Done when:
Markdown: buyer goal · claim · deliver · settle or refund · fees if any · what a stranger can verify on-chain and in UI · 3 product lessons. Link real job URLs. If a private fact is unknown, say so — don't invent timeline notes.

Return id/URL after I approve.
```

---

### A8 · Discovery for x402 endpoints ($20)

```text
Open a new Open board job. Wait for my spend approval.

Title: How an agent finds and pays an x402 Sui endpoint end-to-end
Budget: 20.00 USDC
SLA: 72 hours

Need:
Agent/operator playbook: discover endpoint → interpret 402 → pay USDC on Sui → consume response. Prefer t2000 tools (`t2 pay`, discovery concepts) and public docs.

Done when:
Step-by-step markdown + example payloads (anonymized) + failure tree. Mentions when marketplace listing helps vs raw URL. Runnable commands where open-source.

Return id/URL after I approve.
```

---

### A9 · Growth instrumentation proposal ($20)

```text
Open a new Open board job. Wait for my spend approval.

Title: Metrics that prove t2000 marketplace is working (founder dashboard spec)
Budget: 20.00 USDC
SLA: 72 hours

Need:
Product analytics design — not build code in-repo. What weekly metrics prove Open board + ASP dogfood health.

Done when:
Markdown: 8–12 KPIs with definition · data source hypothesis (indexer, on-chain, product UI) · healthy vs red threshold · what founders do when red. Include "vanity metrics to ignore." No implementation required.

Return id/URL after I approve.
```

---

### A10 · Deploy your own selling agent pack ($20)

```text
Open a new Open board job. Wait for my spend approval.

Title: Deploy-your-own selling agent pack (Passport + serve + first hire)
Budget: 20.00 USDC
SLA: 96 hours

Need:
Opinionated pack for "I have an API / skill; I want to sell on t2000": Passport, Agent ID, serve/x402, list service, first buyer path, first Open claim as ASP (seller side). Product growth asset for partners such as ecosystem builders.

Done when:
Markdown "pack": prerequisites · day-0 checklist · day-1 money loop · day-2 quality bar · links only to live docs/templates · appendix command list. Distinct from A1 (A1 = ship live endpoint now; A10 = teach the full go-to-market loop). Optional one-page diagram (mermaid).

Return id/URL after I approve.
```

---

## Pointers

| Resource | URL |
|---|---|
| Connections / approvals | https://t2000.ai/manage/connections |
| Open jobs board | https://t2000.ai/jobs |
| Docs: Connect | https://docs.t2000.ai/passport-connect |
| Docs: sell your API | https://docs.t2000.ai/how-to/sell-your-api |
| Docs: open job | https://docs.t2000.ai/how-to/open-job |
| Marketplace manual QA | [`TEST-PLAN-MARKETPLACE.md`](./TEST-PLAN-MARKETPLACE.md) |
| Earlier open-job templates | [`open-jobs/`](./open-jobs/) |

---

## Product follow-ups (not blocked on dogfood)

1. **Connections UI: edit limits** on a live session (PATCH already exists) — docs and modal claim “change under Connections”; list is revoke-only.
2. **OAuth mint limit picker** — so Connectors flow is not stuck on $5 / $25 defaults.
3. Optional default raise for new sessions (e.g. **$50/job · $100/day · ask $5**) — product call; separate slice.
