# TOOL UX DESIGN — v0.7a Phase 2 Day 4-5 (B+ plan)

```yaml
spec_id: tool-ux-design-v07a
version: 1.0
status: locked
locked_at: 2026-05-15T19:55+10:00
related_spec: /Users/funkii/dev/t2000/BENEFITS_SPEC_v07a.md
applies_to: Phase 2 Day 6-26 (shared components + per-tool migration)
```

> **Purpose.** Lock per-tool output patterns + shared audric render components BEFORE Day 6 implementation begins. Without this doc, per-tool migration drifts: each tool's output pattern is re-litigated when the migration PR opens, and shared component opportunities are missed because no one has the full surface area in mind.
>
> **Scope.** 36 tools registered in `TOOL_POLICY` (`packages/engine/src/v2/tool-policy.ts`). For each: output pattern, shared components used, audric assembly notes. Locked decisions. No code yet — Day 6+ implements against this baseline.
>
> **What this doc is NOT.** Not a per-tool API spec — that lives in the tool's source file when the AI SDK `tool()` migration lands. Not a visual mock — Day 6-9 shared component PRs include storybook entries that ARE the visual spec. This doc is the DECISION LOG for "which output pattern + which shared components" so the implementation work is mechanical.

---

## Output patterns (4 total)

Every tool's output falls into ONE of these patterns. Picking the pattern locks downstream work:

| Pattern | What the tool returns | What audric renders |
|---|---|---|
| **text-only** | A short string the model paraphrases inline. | Default markdown text in the chat bubble — no special UI. |
| **structured-data** | A JSON object the model interprets + a `displayText` field. | Generic data card with the JSON pretty-printed below the displayText. (Existing audric `DataBlock` renderer.) |
| **content-blocks** | An array of AI SDK content blocks (`{ type: 'text' \| 'image' \| 'file', ... }`). | Each block renders via its native primitive (TextBlock / ImageBlock / FileBlock). |
| **generative-UI** | A typed `data` payload + a `componentKey` naming a registered audric React component. | Audric's `BlockRouter` looks up the componentKey and renders the registered component with the data as props. |

> **Why not migrate everything to generative-UI?** Custom components per tool means audric's render layer grows by N per tool migration. The mechanical tools (text + structured-data) get clean default rendering with zero audric work; the generative-UI budget pays for the 10 high-value tools where rich UI is the differentiator.

---

## Shared audric render components (4 + 1)

Each component is built ONCE in Day 6-9 and reused across multiple tools in Day 10-24. The first 4 are from the B+ plan; `APYBlock` is added here because 4 tools need it and a one-liner span isn't accessible.

| Component | Built in | Used by | Props (sketch) |
|---|---|---|---|
| **AssetAmountBlock** | Day 6 | `balance_check`, `portfolio_analysis`, `pending_rewards`, `harvest_rewards`, `claim_rewards`, `save_deposit`, `withdraw`, `swap_quote` (in/out legs), `swap_execute`, `borrow`, `repay_debt`, `send_transfer` (12 tools) | `{ asset: string, amount: number, usdValue: number \| null, logo?: string, label?: string, suffix?: string }` |
| **HFGauge** | Day 7 | `health_check`, `borrow` (post-borrow projection), `withdraw` (post-withdraw projection) (3 tools) | `{ healthFactor: number, liquidationThreshold: number, projection?: { healthFactor: number, label: string } }` |
| **RouteDiagram** | Day 8 | `swap_quote`, `swap_execute` (2 tools) | `{ steps: Array<{ pool: string, fromAsset: string, toAsset: string, fee: string }>, totalFeeBps: number }` |
| **PreviewCard** | Day 9 | `save_deposit`, `withdraw`, `borrow`, `repay_debt` (4 tools) | `{ heading: string, body: ReactNode, confirmLabel: string, healthFactorImpact?: HFImpact, feeBreakdown?: FeeBreakdown }` |
| **APYBlock** | Day 9 (paired with PreviewCard) | `save_deposit`, `withdraw`, `portfolio_analysis`, `rates_info` (4 tools) | `{ asset: string, apyBps: number, trend?: '7d_up' \| '7d_down' \| 'flat' }` |

Total: **5 shared components** built across Days 6-9. Each one slots into 2-12 tools without per-tool render-layer rewrite.

---

## Per-tool decisions

### High-value tools (10) — generative-UI

Order matches the Day 10-24 implementation sequence in BENEFITS_SPEC_v07a.md.

#### Day 10-11 — `balance_check`

**Pattern:** generative-UI
**componentKey:** `BalanceCard`
**Shared components:** `AssetAmountBlock` × N (one per held token, sorted by USD value desc)
**Audric assembly:** Top-of-card heading "Wallet & savings", followed by a wallet-section list of `AssetAmountBlock`s and a separate NAVI-savings section (USDC + USDsui deposits with APY chip). Footer chip showing `walletValueUsd + savingsValueUsd = totalUsd`. Mirrors the `<financial_context>` snapshot shape so the LLM and the user see the same numbers.
**Why generative:** Wallet view is the most-rendered card in audric — every chat opens with one. Justifies its own component.

#### Day 12-13 — `swap_quote`

**Pattern:** generative-UI
**componentKey:** `SwapQuoteCard`
**Shared components:** `AssetAmountBlock` (in leg + out leg), `RouteDiagram`, fee breakdown rendered inline (no shared component — too swap-specific)
**Audric assembly:** "Trade X → Y" heading, in-leg AssetAmountBlock, RouteDiagram middle row, out-leg AssetAmountBlock, slippage chip, fee row showing 0.1% Cetus overlay + DEX fees, "Execute" CTA at the bottom (handed to confirm flow if needsApproval pauses).
**Why generative:** Multi-DEX route visualization can't be done in default markdown. Cetus route diagrams are the differentiator — a static "Best route via Cetus + Aftermath" line is what we have today, the route diagram is the upgrade.

#### Day 14-15 — `health_check`

**Pattern:** generative-UI
**componentKey:** `HealthFactorCard`
**Shared components:** `HFGauge`, `AssetAmountBlock` (collateral + debt summary)
**Audric assembly:** Heading "Health factor", HFGauge as the hero element (with liquidation threshold marker at 1.0), 2-column collateral/debt summary using `AssetAmountBlock`, footer chip with "borrowing capacity remaining".
**Why generative:** HF gauge is a visual primitive — a number is fine for power users but a gauge with a liquidation marker prevents the "I had no idea I was at 1.05" panic.

#### Day 16-17 — `pending_rewards` + `harvest_rewards` (paired PR)

**Pattern:** generative-UI
**componentKey:** `RewardsCard` (used by both — pending_rewards renders without compound preview, harvest_rewards adds the compound section)
**Shared components:** `AssetAmountBlock` × N (one per claimable reward), `RouteDiagram` (only when harvest preview includes a swap leg)
**Audric assembly:**
- For `pending_rewards`: header "Claimable rewards", list of AssetAmountBlock, footer chip with `totalUsd` and a "Claim" CTA.
- For `harvest_rewards`: same header, same list, then a divider + "Compound preview" subsection: RouteDiagram for each swap leg + final AssetAmountBlock for the merged USDC deposit, fee row (10 bps Cetus per swap + 10 bps NAVI save fee), "Compound" CTA.
**Why generative:** Rewards are list-shaped, but the harvest compound preview has 3-leg swap routes that need RouteDiagram. Sharing the component between pending + harvest avoids two near-identical card shapes.

#### Day 18-19 — `save_deposit`

**Pattern:** generative-UI (write with HITL)
**componentKey:** `PreviewCard` with `body=SaveDepositPreview`
**Shared components:** `PreviewCard` (wrapper), `AssetAmountBlock` (deposit amount), `APYBlock` (current pool APY)
**Audric assembly:** PreviewCard header "Save", body shows AssetAmountBlock for the deposit + APYBlock for the target pool (USDC pool ~4.6% or USDsui pool variable), fee row "0.1% NAVI overlay" (Audric fee per S.43), confirmLabel "Confirm save". When the engine yields `tool-approval-request`, audric renders this card; user taps Confirm → engine resumes → tool dispatches.
**Why generative:** Write tools NEED a preview card by design (tap-to-confirm = the Audric Passport pillar). PreviewCard is the standard wrapper; SaveDepositPreview slots in as the body.

#### Day 19-20 — `withdraw`

**Pattern:** generative-UI (write with HITL)
**componentKey:** `PreviewCard` with `body=WithdrawPreview`
**Shared components:** `PreviewCard`, `AssetAmountBlock`, `APYBlock` (yield being given up), `HFGauge` (post-withdraw projection — only if user has open borrows)
**Audric assembly:** PreviewCard header "Withdraw", AssetAmountBlock for the withdraw amount, APYBlock showing "yield foregone", optional HFGauge with `projection` prop showing post-withdraw HF (red if drops below 1.5), "Confirm withdraw".
**Why generative:** Withdrawing from collateral can drop HF — projection gauge prevents the "I withdrew and got liquidated" class of bug.

#### Day 20-21 — `borrow`

**Pattern:** generative-UI (write with HITL)
**componentKey:** `PreviewCard` with `body=BorrowPreview`
**Shared components:** `PreviewCard`, `AssetAmountBlock`, `HFGauge` (post-borrow projection), interest rate chip (no shared component — borrow-specific)
**Audric assembly:** PreviewCard header "Borrow", AssetAmountBlock for borrowed amount, HFGauge with projection prop showing post-borrow HF (always shown — borrowing always changes HF), interest rate chip "5.2% variable APY". Per safeguards, borrow autoBelow=0 across every preset → always pauses.
**Why generative:** HF projection on borrow is the entire reason borrow tier=confirm. Without the gauge, the user is back to trusting raw numbers.

#### Day 21-22 — `repay_debt`

**Pattern:** generative-UI (write with HITL)
**componentKey:** `PreviewCard` with `body=RepayPreview`
**Shared components:** `PreviewCard`, `AssetAmountBlock` (repay amount), HFGauge (post-repay projection — HF goes UP after repay so this is reassurance not warning)
**Audric assembly:** PreviewCard header "Repay debt", AssetAmountBlock for repay amount, "remaining debt after repay" chip, HFGauge projection showing improved HF, "Confirm repay".
**Why generative:** Same family as borrow — HF projection is the value-add, PreviewCard is the wrapper.

#### Day 23-24 — `portfolio_analysis`

**Pattern:** generative-UI
**componentKey:** `PortfolioCard`
**Shared components:** `AssetAmountBlock` × N (wallet section), `AssetAmountBlock` × N (DeFi positions section), `APYBlock` (savings APY), `HFGauge` (only if user has open borrows)
**Audric assembly:** Multi-section card: top header showing total net worth, three sections (Wallet / Savings / Debt), each with AssetAmountBlock list + section subtotal. Savings section adds APYBlock per pool. Debt section adds HFGauge if borrowing.
**Why generative:** This is balance_check + savings_info + health_check fused. The native render is the value-add — text-only would be a wall of numbers.

#### Day 23-24 (companion) — `rates_info`

**Pattern:** structured-data + APY component (NOT generative-UI)
**Shared components:** `APYBlock` × 2 (USDC pool, USDsui pool)
**Audric assembly:** Compact APY comparison table — no custom card needed. Audric's existing `DataBlock` renderer wraps the JSON; we just register `APYBlock` as the rendering hint for `rates_info` rate fields.
**Why structured-data:** rates_info is a 2-row APY table — doesn't justify its own card. Falls back to default rendering with APYBlock as the cell renderer.

---

### Mechanical tools (26) — text-only or structured-data

Done in Day 25-26 batches of 5-8 per day. No new audric components, no render-layer changes — existing tests port verbatim.

| Tool | Pattern | Notes |
|---|---|---|
| `web_search` | text-only | Model summarizes search results inline. |
| `explain_tx` | text-only | Model paraphrases the transaction's effect. |
| `transaction_history` | structured-data | Timeline list — existing audric DataBlock renders this fine. |
| `volo_stats` | structured-data | Liquid-staking stats; numeric output, no UI primitives needed. |
| `mpp_services` | structured-data | List of MPP services with prices. |
| `protocol_deep_dive` | text-only | Long analysis paragraph; the lone DefiLlama consumer per CLAUDE.md. |
| `token_prices` | structured-data | Price table; APYBlock NOT used (no APY field). |
| `spending_analytics` | structured-data | Aggregated spend numbers. |
| `yield_summary` | structured-data | Yield earned to date. |
| `activity_summary` | structured-data | Recent activity counts. |
| `resolve_suins` | text-only | "alice.sui resolves to 0xabc..." — single sentence. |
| `render_canvas` | content-blocks | Returns HTML — audric's existing CanvasBlock renderer. |
| `list_payment_links` | structured-data | List with link/QR per row. |
| `list_invoices` | structured-data | List with status per row. |
| `create_payment_link` | structured-data | Returns the link + QR data; no preview card. |
| `create_invoice` | structured-data | Returns the invoice id + amount; no preview card. |
| `cancel_payment_link` | text-only | "Cancelled link X." — confirmation sentence. |
| `cancel_invoice` | text-only | Same. |
| `send_transfer` | structured-data | Write tool but the preview is just amount+recipient — too simple for a custom card. Default DataBlock + needsApproval pause works. |
| `claim_rewards` | structured-data | Write tool that returns claimed amount per asset — list rendered by DataBlock. |
| `pay_api` | structured-data | Returns API response payload. |
| `swap_execute` | structured-data | Write tool — receipt with amounts in/out. RouteDiagram NOT used here (it's only useful PRE-execution; post-execution the diagram doesn't add information). |
| `volo_stake` | structured-data | Stake receipt. |
| `volo_unstake` | structured-data | Unstake receipt. |
| `save_contact` | text-only | "Saved alice.sui as @alice." — confirmation sentence. |
| `add_recipient` | generative-UI (form) | Special case — uses preflight `needsInput` pause-and-prompt for an inline form. Migrates last (Day 26 end-of-batch) once v2's needsInput handling is built. |

---

## Decision: tools that DON'T migrate to generative-UI

Several tools COULD have generative-UI rendering but explicitly DON'T:

- **send_transfer** — write tool, but preview is just "send X USDC to 0xabc". A custom card adds zero information vs the default needsApproval pause + DataBlock body. Skipped.
- **swap_execute** — same family as send_transfer. The interesting visualization is on swap_quote (the PRE-execution route); swap_execute returns a receipt that's well served by structured-data.
- **claim_rewards** — non-compound claim. Just shows what was claimed. RewardsCard is for the PRE-claim view (pending_rewards) and the compound preview (harvest_rewards).
- **rates_info** — 2-row APY comparison; APYBlock as the cell renderer is enough. No card.

The pattern: **generative-UI for the highest-information-density user moments (wallet view, write previews, HF gauges, swap routes); text/structured for everything else.**

---

## What Day 6-9 produces

Five shared audric components, each as its own PR with storybook entry and unit tests:

| Day | Component | PR scope |
|---|---|---|
| Day 6 | `AssetAmountBlock` | Component + storybook (4 stories: stable, volatile, no-USD, with-suffix) + tests |
| Day 7 | `HFGauge` | Component + storybook (5 stories: healthy, borderline, near-liquidation, with-projection-up, with-projection-down) + tests |
| Day 8 | `RouteDiagram` | Component + storybook (3 stories: 1-hop, 2-hop, 3-hop) + tests |
| Day 9 (a) | `PreviewCard` | Component + storybook (4 stories: save, withdraw, borrow, repay) + tests |
| Day 9 (b) | `APYBlock` | Component + storybook (3 stories: stable, with-trend-up, with-trend-down) + tests |

Each PR is small + reviewable + ships independently. Audric's BlockRouter doesn't change yet — it just gets the new components registered.

---

## What Day 10+ then becomes

Per-tool migration is now ASSEMBLY:

```
For each high-value tool:
  1. Migrate engine tool from buildTool → AI SDK tool() (1 file)
  2. Update engine TOOL_POLICY entry if behavior changed (rare)
  3. Audric: register the tool's componentKey in BlockRouter (1 line)
  4. Audric: write the tool's component using shared components (1 file)
  5. Tests: port the legacy unit test (1 file) + add an audric storybook entry (1 file)
  6. PR ships: 1 engine commit + 1 audric commit, ~200-400 LoC total
```

Without this design baseline, step 4 takes a day per tool because it's BOTH render decisions AND assembly. With the baseline, step 4 is just assembly — the render decisions are pre-locked here.

---

## What's intentionally OUT of scope for this doc

- **Visual mocks** — those live in the storybook entries built in Day 6-9.
- **Color tokens / typography** — uses audric's existing Agentic Design System (white/black, New York Large + Geist + Departure Mono per CLAUDE.md). No new tokens added.
- **Animation specs** — defer to per-component PR review.
- **Mobile-specific layouts** — audric is mobile-first by default; components built responsive from day one.
- **Pending input / form components** — `add_recipient` migration in Day 26 will define this when needed.

---

## Cross-references

- BENEFITS_SPEC_v07a.md — Phase 2/3/4 consolidation section, Day 4-5 line item
- packages/engine/src/v2/tool-policy.ts — the 36 tools' policies (source of truth for the inventory)
- audric/.cursor/rules/* — audric's design system + render layer rules (the components live in audric/, not t2000/)
- safeguards-defense-in-depth.mdc — defines why write tools need PreviewCard + tap-to-confirm
