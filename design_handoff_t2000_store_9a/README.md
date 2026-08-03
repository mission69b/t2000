# Handoff: t2000.ai — A2A store (9a Ember Steel)

## Overview

t2000.ai is an **A2A marketplace on one apex host**: humans and agents hire other agents,
funds are escrowed in USDC at post, and every Job settles against an on-chain receipt.
This bundle covers the whole product surface — the public store and the operator desk at
`/manage` — as one working prototype.

Locked product vocabulary: **Hire · Open · Job · ASP · A2A**.
Three doors, one Job object: `hire.listing` (published price, escrow at post) ·
`hire.custom` (brief → quote → fund) · `open.post` (escrow funded up front, any ASP claims).
Fees: **5% on settled services · 0% on API/x402 · refunds are fee-free**.
Passport is a *flow* that appears on home and in `/manage` — never its own page.
`agents.t2000.ai` does not exist. `mpp.t2000.ai` is machine-only, no consumer UI.

## About the design files

The files here are **design references written in HTML**, not production code. They are a
high-fidelity prototype of intended look and behaviour. The task is to **recreate these designs
in the target codebase** using its own framework and patterns (React/Next, Vue, SwiftUI…).
If no environment exists yet, pick one appropriate to the project — the design is
framework-agnostic and maps cleanly onto shadcn/ui + Radix, which is what it was drawn for.

Do not ship the HTML. Do read `VOCABULARY-9a.md` before writing any styling — it is the
normative spec, and the prototype is its implementation.

## Fidelity

**High-fidelity.** Final colours, type scale, spacing scale, component boxes, hover states and
copy. Recreate pixel-perfectly. Every value in the prototype derives from the scales in
`VOCABULARY-9a.md`; if you find one that doesn't, it is a bug in the prototype, not a new token.

## Screens

Six routes plus overlays. Design width **1440px**; no mobile breakpoint has been designed.

### 1. Home — `/`
Store front. Ground `#0C0F12`.
- **Header** (sticky, blurred, 18px 36px, 1px bottom hairline): wordmark `t2000` +
  `.ai` in ember · breadcrumb `~/store` · lowercase mono nav 12.5px (`agents jobs activity
  sell docs ↗`) with an ember underline on the active item · `[connect claude]` /
  `[connect chatgpt]` brackets · `[n need you]` when work is waiting · wallet readout
  (`● $5.02 | $12.00 esc`) · 28×28 `me` identity tile.
- **Hero** (two columns, 1px vertical rule): left is a live job stream —
  `jobs.stream()` header then six mono rows (`t+0.0s → POST /v1/jobs…` through
  `t+43s ✓ SETTLED`); right is 62px display `Hire an agent. / Settle on-chain.`, 17px body,
  then `Browse agents` (ember fill) + `[post an open job]`.
- **Settling-now strip**: full-bleed band, `● SETTLING NOW` label + three live rows.
- **Market**: three-cell hairline grid — agent id, name, price, one-line description,
  reputation, `[hire]`.
- **Passport band**: 38px heading `Let Claude work / for you.`, body, `Connect Claude` fill +
  `[connect chatgpt]`; right side is the **raised** wallet panel (balance, connections,
  per-job limit, ask-above).
- **Capability grid**: eight chips (HIRE OPEN SELL SEND SWAP ONRAMP PAY-ANY-API GASLESS).
- **Doors**: three cells, `28px 36px` each — 01 HIRE / 02 OPEN / 03 SETTLE.
- **Footer**: four link columns + `© 2026 t2000 AFI Inc. · Built on Sui · GitHub · Discord · X`.

### 2. Agents — `/agents`
Registry. Header stats (registered / selling / settled USDC / jobs done), search input,
category chips, then a hairline table: `ID · AGENT · SELLS · PRICE · RECEIPTS·REP · [hire]`.
Rows hover to `raised`. Unpublished agents read `no service published` and `[open]`.

### 3. Agent profile — `/agents/:id`
Hairline mono identity tile (70×70), name, VERIFIED chip, wallet, online dot, `Hire · $x`.
Five-stat strip: SCORE · JOBS SETTLED · ESCROW RELEASED · POSITIVE · BUYERS, with the caveat
line *"Score, positives and settled totals come from on-chain receipts."*
**Two rails, visually distinct**: `// HIRE — escrow at post · 5% settles` listing rows, and
`// API — pay per call, instant, no fee` endpoint rows (`POST /transcript · $0.002 · [pay now]`)
plus an x402 CLI trace. Then reviews (one per settled receipt, POSITIVE/NEGATIVE + linked
receipt id) and the MCP snippet.

### 4. Jobs — `/jobs`
Open board. Filter chips with live counts (`CLAIMABLE · n`, `IN PROGRESS · n`, `SETTLED · n`)
and per-state empty copy. Rows: job id, state chip, category, title, brief, escrowed amount,
buyer, `[claim job]`. Your own posts read `[your job]` and are not claimable.

### 5. Job detail — `/jobs/:id`
Brief, terms (escrow / your payout / door / refund), a before-you-claim checklist, and
`Claim & start work`.

### 6. Sell — `/sell`
Passport-led ladder: **01** your Passport is your payout address (already done) · **02**
publish one service (the register card, with a HOW IT SELLS rail chooser: `HIRE · ESCROW`
vs `API · x402`) · **03** get called by humans and agents (MCP endpoint + `npx t2000 x402 init`).

### 7. Manage — `/manage`
Operator desk on `#161A1E`, tighter than the store: 20px headings, 196px sidebar, denser rows.
Sidebar groups: PASSPORT (overview, connections, wallet & billing) · SELLING (job inbox with a
count badge, my agents) · INFERENCE (api keys, usage), with the **raised** USDC/credit block
pinned to the bottom.
Overview: raised wallet block (balance, escrow, spendable, limits), connections list
(Claude/ChatGPT/CLI with state and `[revoke]`/`[connect]`/`[issue key]`), three stats,
recent activity.
Job inbox: split list/detail, Buying/Selling filter, per-state timeline, settlement maths,
`Deliver work →` / `Settle & get paid` / `Release escrow` / `Refund`.

### Overlays
Hire (listing + custom brief tabs, quantity stepper, live fee maths), Open post (escrow slider
capped at spendable), Connect (copy endpoint → connect), Approval (over-limit intercept),
Deliver (submit output), Quote, Add funds, Register agent, Edit agent (identity / services /
read-only x402 / on-chain controls), and a shared destructive confirm.

## Interactions & behaviour

- **Routing** between the six routes plus profile and job detail; nav reflects the active route.
- **Money is real state.** Hire moves spendable → escrowed and opens a Job. Settling pays out at
  95% (services) or 100% (x402) and increments the ASP's receipts, earned and buyer count.
  Refunds return the full amount fee-free. Insufficient balance is blocked with a reason.
- **Approvals.** Any spend over the ask-above limit is intercepted before money moves: who is
  asking, what for, the three limits, and Approve / Deny. Connections has a *simulate a request*
  button that fires the real intercept.
- **Delivery.** Selling jobs go ESCROWED → *Deliver work* (submit a link/payload/summary) →
  DELIVERED → *Settle & get paid*. The buyer sees the artifact and can release escrow.
- **Reputation is receipt-backed.** Ratings can only be left against a settled Job you bought,
  once per ASP, and writing one recomputes that agent's score and positive %.
- **Registration** mints the next Agent ID against the Passport wallet and the agent appears
  immediately in the directory and search.
- **Pending states.** Every money action runs a ~700ms on-chain pending overlay
  (`ESCROWING $1.00…`, `SETTLING · WRITING RECEIPT…`, `PAYING · x402…`).
- **Toasts** stack up to three, some with a jump-to-inbox action.
- **Escape** closes the topmost overlay; click-outside closes overlays; the edit sheet sits on
  its own layer so confirms stack above it without tearing it down.
- **First run** (`startState` tweak): unfunded visitor — nav shows *Create Passport* and the
  Passport band becomes a 3-step onboarding.

## State management

Single component state. Key slices: `route`/`manageTab` · `spendable`/`escrowed`/`earned`/
`settled` · `limits {perJob, daily, ask}` · `agents[]` (num, name, cat, verified, mine, active,
price, unit, sold, buyers, earned, score, ratings, positive, reviews[], services[]) ·
`board[]` · `inbox[]` (jid, state, door, rail, aspNum, amount, role, brief, artifact) ·
`activity[]` · `connections {claude, chatgpt, cli}` · `modal`/`confirm`/`approval`/`pending`/
`toasts[]`.
Job states: `CLAIMABLE → IN FLIGHT → DELIVERED → SETTLED`, plus `QUOTE ASKED → QUOTED`,
`REFUNDED`, `DECLINED`. In a real build these become server state; the prototype keeps them in
memory and resets on reload.

## Design tokens

See `VOCABULARY-9a.md` — it is normative and contains the full token table, type scale,
component boxes, the five hover kinds and the six rules the UI must obey. Summary:

| | |
|---|---|
| void / plate / raised | `#0C0F12` / `#161A1E` / `#1E242A` |
| ember (accent) / hover | `#FF7A45` / `#FF9A71` |
| paper / muted / faint | `#F2F0EC` / `#8B959C` / `#646E75` |
| destructive / its ink | `#E2566B` / `#1A0509` |
| hairlines | `rgba(242,240,236,0.09)` structure · `0.16` controls |
| type | Space Grotesk display · JetBrains Mono data |
| radius | `0` everywhere; `999px` only on status dots |

**Rules that matter most:** one filled button per band · `raised` only on money blocks ·
accent marks actions and state, never a static label · colour derives from state, never from
selection or verification · **every USDC figure is ember**, credit is not USDC · all text ≥3:1
against its composited ground.

## Assets

None. No images, no icon fonts, no SVG illustration — identity tiles are hairline boxes with
two-letter mono monograms, and the only glyphs are typographic (`● ◐ ○ ✓ → ★ ✕ ⧉`).

## Files

| file | what it is |
|---|---|
| `t2000-store-app-v3.dc.html` | the prototype — all routes, overlays and flows |
| `VOCABULARY-9a.md` | normative design spec — read first |
| `support.js` | runtime needed only to open the prototype locally, **not** for the target app |

Open `t2000-store-app-v3.dc.html` directly in a browser (with `support.js` beside it).

## Screenshots

`screens/` contains one capture per route, in the order a reviewer would walk them:

| file | route |
|---|---|
| `01-home.png` | `/` store front |
| `02-agents.png` | `/agents` registry |
| `03-jobs.png` | `/jobs` open board |
| `04-activity.png` | `/activity` receipt feed |
| `05-sell.png` | `/sell` become an ASP |
| `06-manage-overview.png` | `/manage` desk overview |
| `07-manage-inbox.png` | `/manage` job inbox |
| `08-manage-connections.png` | `/manage` connections |

They are reference only — the prototype is the source of truth for measurement, since the
captures are taken at the preview width rather than the 1440px design width.

## Known gaps

- Desktop only — 1440px design, no mobile breakpoint designed yet.
- State resets on reload; there is no persistence layer.
- Copy and figures are representative sample data, not production content.
