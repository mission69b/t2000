> **ARCHIVED — Fully implemented.** All workstreams shipped: RC rich cards (RC-1 through RC-9), FA analytics (portfolio, spending, yield, activity, heatmap), AC allowance tools, FI proactive insights, plus canvas system (not in this spec). Tool count and card coverage tables are stale (29 tools at time of writing vs 47 shipped). This spec is preserved for design context only. See `audric-build-tracker.md` for ground truth.

# Audric Rich UX Spec — Financial Intelligence Cards + Analytics

> **Status:** Shipped
> **Author:** AI assistant + human review
> **Date:** April 2026
> **Companion to:** `audric-roadmap.md`, `audric-build-tracker.md`
> **Inspired by:** Revolut AIR launch (April 2026), adapted for crypto-native / DeFi context

---

## Problem Statement

Audric's engine returns **rich structured data** from 29 tools, but the chat interface renders most results as **plain assistant text**. Only 6 read tools and write receipts have dedicated visual cards (`ToolResultCard.tsx` → `CARD_RENDERERS`). The remaining tools — including health checks, transaction history, swap quotes, MPP service listings, and all DefiLlama data — render as `null` (no card) and rely on the LLM to describe the data in markdown.

This creates three problems:

1. **Trust gap.** Financial data presented as text feels like the AI is summarising — users can't verify the numbers at a glance. Visual cards with structured layouts feel like the system is showing real data.
2. **UX gap vs competitors.** Revolut AIR renders spending breakdowns as inline charts with category legends. Audric renders the same quality data as paragraphs of text.
3. **Missed intelligence.** We have portfolio analysis, DeFi positions, yield tracking, and transaction history tools that return structured arrays — ideal for charts, sparklines, and trend indicators — but none of it is visualised.

**Goal:** Every tool result that returns structured financial data should render as a visual card. New aggregation endpoints should power analytics views. Chat-based controls should let users manage their agent's access. The result: Audric looks and feels like a premium financial intelligence product.

---

## Scope

This spec covers four workstreams:

| # | Workstream | Type | Summary |
|---|-----------|------|---------|
| **RC** | Rich Chat Cards | Frontend (Audric) | Expand `CARD_RENDERERS` to cover all 29 tools with meaningful visual output |
| **FA** | Financial Analytics | Frontend + API (Audric) | New aggregation endpoints + analytics cards for portfolio, spending, yield |
| **AC** | Allowance Controls | Engine + Frontend (both) | New engine tools for chat-based agent management (pause, limit, permissions) |
| **FI** | Financial Insights | Engine + Frontend (both) | Proactive analytics the agent surfaces without being asked |

---

## Current State

### Existing Card Renderers (`ToolResultCard.tsx`)

| Tool | Card Component | Status |
|------|---------------|--------|
| `balance_check` | `BalanceCard` | Live |
| `savings_info` | `SavingsCard` | Live |
| `rates_info` | `RatesCard` | Live |
| `portfolio_analysis` | `PortfolioCard` | Live |
| `defillama_yield_pools` | `YieldCard` | Live |
| `explain_tx` | `ExplainTxCard` | Live |
| Write tools with `tx` | `TransactionReceiptCard` | Live |

### Tools with NO Card (renders null → text only)

| Tool | Data shape available | Card needed? |
|------|---------------------|--------------|
| `health_check` | `{ healthFactor, supplied, borrowed, maxBorrow, status }` | **Yes — critical** |
| `transaction_history` | `{ transactions: TxRecord[], count }` | **Yes — high value** |
| `swap_quote` | `{ fromToken, toToken, fromAmount, toAmount, priceImpact, route }` | **Yes — pre-confirmation** |
| `mpp_services` | `{ services: Service[], total }` | **Yes — discovery** |
| `web_search` | `{ results: { title, url, description }[] }` | **Yes — links** |
| `volo_stats` | `{ apy, exchangeRate, totalStaked, totalVSui }` | **Yes — staking info** |
| `protocol_deep_dive` | `{ name, tvl, safetyScore, riskFactors... }` | **Yes — research** |
| `defillama_protocol_info` | `{ name, tvl, change1d/7d, chains... }` | Optional |
| `defillama_token_prices` | `{ symbol, price }[]` | Optional |
| `defillama_price_change` | `{ symbol, currentPrice, change, period }` | Optional |
| `defillama_chain_tvl` | `{ rank, chain, tvl }[]` | Optional |
| `defillama_protocol_fees` | `{ name, fees24h, category }[]` | Optional |
| `defillama_sui_protocols` | `{ name, slug, tvl, category }[]` | Optional |
| `save_contact` | `{ saved, name, address }` | Minimal |

### Existing Data APIs (`/api/*`)

| Endpoint | Returns | Used by |
|----------|---------|---------|
| `GET /api/positions` | `{ savings, borrows, savingsRate, healthFactor, supplies[], borrows_detail[] }` | Engine position fetcher |
| `GET /api/activity` | `{ items: ActivityItem[], nextCursor }` | Activity feed tab |
| `GET /api/history` | `{ items: TxHistoryItem[] }` | Engine `transaction_history` tool |
| `GET /api/stats` | `{ totalUsers, totalSessions, totalTokens... }` | Landing page stats |
| `GET /api/rates` | `{ rates[], bestSaveRate }` | Engine `rates_info` tool |
| `GET /api/prices` | `{ prices: Record<string, number> }` | Dashboard, swap flows |
| `GET /api/balances` | `{ SUI, USDC, BTC?, ETH?... }` | Engine `balance_check` tool |

---

## RC: Rich Chat Cards

### Design Principles

1. **Monochrome first.** Charts use grayscale segments, not rainbow colours. Matches dark theme and feels premium/financial (per Revolut reference).
2. **Data density.** Cards show 3-7 data points. Not too sparse (feels empty), not too dense (feels like a spreadsheet).
3. **Action affordance.** Write-tool cards have a prominent CTA. Read-tool cards are informational only.
4. **Consistent anatomy.** Every card follows the same structural template:

```
┌─────────────────────────────────────┐
│  LABEL (mono, uppercase, muted)     │
│                                     │
│  Hero Value (large, white)          │
│  ▸ Subtitle or trend (small, muted) │
│                                     │
│  ┌─ Visual (chart/gauge/list) ────┐ │
│  │                                │ │
│  └────────────────────────────────┘ │
│                                     │
│  Detail row 1          Value 1      │
│  Detail row 2          Value 2      │
│  Detail row 3          Value 3      │
│                                     │
│  [ CTA Button ] (writes only)       │
└─────────────────────────────────────┘
```

5. **Responsive.** Cards are max-width 360px in chat column. Stack vertically on narrow screens.
6. **Confirmation flow awareness.** Write tools go through `PermissionCard` (existing component) for user approval before execution. The enhanced `TransactionReceiptCard` (RC-9) renders *after* confirmation succeeds. The card flow is: `tool_start` → `PermissionCard` → user approves → `tool_result` → `TransactionReceiptCard`. Read-tool cards render immediately on `tool_result`.

### Card Specifications

---

#### RC-1: `HealthCard` — for `health_check`

**Priority:** Critical — this is a financial safety indicator.

**Data source:** `health_check` tool result: `{ healthFactor, supplied, borrowed, maxBorrow, liquidationThreshold, status }`

```
┌─────────────────────────────────────┐
│  HEALTH FACTOR                      │
│                                     │
│           2.45                       │
│      ● Healthy                      │
│                                     │
│  ┌──────────────────────────────┐   │
│  │  ████████████░░░░░░░░░░░░░░  │   │
│  │  ▲ liq. threshold      ▲ you│   │
│  └──────────────────────────────┘   │
│                                     │
│  Supplied          $1,240.00        │
│  Borrowed            $505.20        │
│  Max Borrow          $868.00        │
│  Liq. Threshold         1.00       │
│                                     │
│  Status colours:                    │
│  ● Healthy   (HF ≥ 2.0)  green     │
│  ● Warning   (1.5–2.0)   amber     │
│  ● Danger    (1.0–1.5)   red       │
│  ● Critical  (< 1.1)     red pulse │
└─────────────────────────────────────┘
```

**Visual:** Horizontal gauge bar with two markers — liquidation threshold (1.0) and user's current HF. Bar fills from red (left) to green (right). The gauge gives an instant visual read on risk.

**Status badge:** Coloured dot + label. One of 4 states. Critical state uses a subtle pulse animation.

---

#### RC-2: `TransactionHistoryCard` — for `transaction_history`

**Priority:** High — users frequently ask "show my recent transactions".

**Data source:** `transaction_history` result: `{ transactions: TxRecord[], count }`

```
┌─────────────────────────────────────┐
│  RECENT TRANSACTIONS     12 total   │
│                                     │
│  Today                              │
│  ┌─────────────────────────────┐    │
│  │ ↗ Save    +500.00 USDC     │    │
│  │           3:42 PM   ∎ view │    │
│  ├─────────────────────────────┤    │
│  │ ↗ Send    -50.00 USDC      │    │
│  │   → alice  2:18 PM  ∎ view │    │
│  └─────────────────────────────┘    │
│                                     │
│  Yesterday                          │
│  ┌─────────────────────────────┐    │
│  │ ↙ Borrow  +200.00 USDC     │    │
│  │           11:05 AM  ∎ view │    │
│  ├─────────────────────────────┤    │
│  │ ⚡ Pay     -0.03 USDC       │    │
│  │   fal     10:22 AM  ∎ view │    │
│  └─────────────────────────────┘    │
│                                     │
│  Showing 4 of 12                    │
└─────────────────────────────────────┘
```

**Visual:** Grouped by date. Each row: action icon, label, signed amount, optional counterparty/service, time, link to Suiscan. Positive amounts in green-ish, negative in default white. Max 5 shown, "Showing X of Y" footer.

**Action icons:** `↗` save/deposit, `↙` borrow, `→` send, `←` receive, `⚡` pay (service), `↺` swap, `↗` claim.

---

#### RC-3: `SwapQuoteCard` — for `swap_quote`

**Priority:** High — preview before confirmation reduces anxiety.

**Data source:** `swap_quote` result: `{ fromToken, toToken, fromAmount, toAmount, priceImpact, route }`

```
┌─────────────────────────────────────┐
│  SWAP QUOTE                         │
│                                     │
│  100.00 SUI  →  245.80 USDC        │
│                                     │
│  Rate          1 SUI = 2.458 USDC   │
│  Impact        0.12%                │
│  Route         SUI → USDC (Cetus)   │
│  Fee           0.1% overlay         │
│                                     │
│  ⓘ Quote valid for ~30 seconds     │
└─────────────────────────────────────┘
```

**Visual:** Clean two-column layout with arrow. Price impact highlighted in amber if > 1%, red if > 3%. Route shows the DEX.

---

#### RC-4: `ServiceCatalogCard` — for `mpp_services`

**Priority:** Medium — discovery experience for MPP.

**Data source:** `mpp_services` result: `{ services: Service[], total }`

```
┌─────────────────────────────────────┐
│  AVAILABLE SERVICES      41 total   │
│                                     │
│  ┌─ AI Images ─────────────────┐    │
│  │ fal · flux/dev      $0.03   │    │
│  │ fal · flux/schnell  $0.01   │    │
│  └─────────────────────────────┘    │
│  ┌─ Search ────────────────────┐    │
│  │ brave · web         $0.005  │    │
│  └─────────────────────────────┘    │
│  ┌─ Mail ──────────────────────┐    │
│  │ lob · postcards     $1.00   │    │
│  │ lob · letters       $1.50   │    │
│  └─────────────────────────────┘    │
│                                     │
│  Grouped by category. Price per req │
│  "Ask me to use any service"        │
└─────────────────────────────────────┘
```

**Visual:** Services grouped by category. Each shows provider, endpoint name, price. Compact rows. Tapping a service could pre-fill a prompt.

---

#### RC-5: `SearchResultsCard` — for `web_search`

**Priority:** Medium.

**Data source:** `web_search` result: `{ results: { title, url, description }[] }`

```
┌─────────────────────────────────────┐
│  SEARCH RESULTS          5 found    │
│                                     │
│  Sui DeFi Ecosystem Overview        │
│  defillama.com/chain/Sui            │
│  Overview of protocols, TVL...      │
│  ─────────────────────────────      │
│  NAVI Protocol Documentation        │
│  docs.naviprotocol.io               │
│  Lending and borrowing on Sui...    │
│  ─────────────────────────────      │
│  (3 more results)                   │
└─────────────────────────────────────┘
```

**Visual:** Standard search result layout. Title (clickable, white), URL (mono, muted), snippet (muted). Max 3 shown, expandable.

---

#### RC-6: `StakingCard` — for `volo_stats`

**Priority:** Low-medium.

```
┌─────────────────────────────────────┐
│  VOLO STAKING                       │
│                                     │
│  APY             5.82%              │
│  Exchange Rate   1 vSUI = 1.047 SUI│
│  Total Staked    12.4M SUI          │
│  Total vSUI      11.8M             │
└─────────────────────────────────────┘
```

---

#### RC-7: `ProtocolCard` — for `protocol_deep_dive`

**Priority:** Low-medium — research/due diligence use case.

```
┌─────────────────────────────────────┐
│  NAVI PROTOCOL                      │
│                                     │
│  Safety Score    ████████░░  8/10   │
│                                     │
│  TVL             $142.5M            │
│  24h Change      +2.3%             │
│  7d Change       -1.1%             │
│  Fees (24h)      $45.2K            │
│  Revenue (24h)   $12.1K            │
│  Audits          3                  │
│                                     │
│  Risk: ⚠ Single-chain (Sui only)   │
│  Risk: ✓ Multi-audited             │
└─────────────────────────────────────┘
```

**Visual:** Safety score as a filled bar (1-10). Risk factors as tagged items with warning/check icons.

---

#### RC-8: `PriceCard` — for `defillama_token_prices` and `defillama_price_change`

**Priority:** Low — the LLM can describe prices well enough.

```
┌─────────────────────────────────────┐
│  TOKEN PRICES                       │
│                                     │
│  SUI       $2.46    ▲ +3.2% (24h)  │
│  USDC      $1.00       0.0%        │
│  BTC    $94,230     ▼ -1.1% (24h)  │
│  ETH     $3,420     ▲ +0.8% (24h)  │
└─────────────────────────────────────┘
```

---

#### RC-9: Enhanced `TransactionReceiptCard` — for all write tools

**Current state:** Exists but is basic. Enhance with more structured layout.

```
┌─────────────────────────────────────┐
│  ✓ TRANSACTION CONFIRMED            │
│                                     │
│  Save Deposit                       │
│  +500.00 USDC → NAVI Savings       │
│                                     │
│  APY            4.2%                │
│  New Balance    $1,500.00           │
│  Gas            0.003 SUI           │
│                                     │
│  tx: 4TD6Co...E6CP                  │
│  [ View on Suiscan ↗ ]             │
└─────────────────────────────────────┘
```

**Per tool type:**

| Write tool | Hero line | Key details |
|-----------|-----------|-------------|
| `save_deposit` | "+500 USDC → NAVI Savings" | APY, new balance, gas |
| `withdraw` | "-200 USDC ← NAVI Savings" | Remaining balance, gas |
| `send_transfer` | "50 USDC → alice (0x7f2...)" | Contact saved?, gas |
| `borrow` | "+200 USDC (borrowed)" | New HF, fee, gas |
| `repay_debt` | "-200 USDC (repaid)" | Remaining debt, gas |
| `claim_rewards` | "Claimed 2.45 USDC" | Total value, gas |
| `swap_execute` | "100 SUI → 245.80 USDC" | Rate, impact, gas |
| `pay_api` | "Image generated · $0.03" | Service, cost, receipt. **Special handling:** if `body` contains an image URL → render inline preview. If postcard → show delivery estimate. If text → show snippet |
| `volo_stake` | "100 SUI → 95.5 vSUI" | APY, gas |
| `volo_unstake` | "95.5 vSUI → 100.2 SUI" | Gas |

---

### Implementation Plan (RC)

**All RC work is pure frontend in the Audric repo.** No engine changes needed — the data already flows through `tool_result` events.

| Task | File(s) | Effort | Priority |
|------|---------|--------|----------|
| RC-1 `HealthCard` | `components/engine/cards/HealthCard.tsx` | 0.5d | P0 |
| RC-2 `TransactionHistoryCard` | `components/engine/cards/TransactionHistoryCard.tsx` | 0.5d | P0 |
| RC-3 `SwapQuoteCard` | `components/engine/cards/SwapQuoteCard.tsx` | 0.25d | P0 |
| RC-4 `ServiceCatalogCard` | `components/engine/cards/ServiceCatalogCard.tsx` | 0.5d | P1 |
| RC-5 `SearchResultsCard` | `components/engine/cards/SearchResultsCard.tsx` | 0.25d | P1 |
| RC-6 `StakingCard` | `components/engine/cards/StakingCard.tsx` | 0.25d | P2 |
| RC-7 `ProtocolCard` | `components/engine/cards/ProtocolCard.tsx` | 0.5d | P2 |
| RC-8 `PriceCard` | `components/engine/cards/PriceCard.tsx` | 0.25d | P2 |
| RC-9 Enhanced receipts | `components/engine/cards/TransactionReceiptCard.tsx` | 0.5d | P1 |
| Register all in `CARD_RENDERERS` | `components/engine/ToolResultCard.tsx` | 0.25d | P0 |
| Shared card primitives | `components/engine/cards/CardShell.tsx`, `MiniBar.tsx`, `Gauge.tsx` | 0.5d | P0 |

**Total RC effort:** ~4 days

**Shared primitives needed:**
- `CardShell` — consistent card wrapper (background, padding, border-radius, label)
- `MiniBar` — horizontal stacked bar chart (monochrome, for spending/allocation breakdowns)
- `Gauge` — horizontal gauge with markers (for health factor)
- `TrendIndicator` — `▲ +3.2%` / `▼ -1.1%` with colour
- `MonoLabel` — uppercase mono label (reusable)

---

## FA: Financial Analytics

New aggregation endpoints and analytics cards that provide the "spending breakdown" and "portfolio overview" experiences Revolut excels at — adapted for DeFi.

### FA-1: Portfolio Summary Card

**Trigger:** User asks "how's my portfolio?" or `portfolio_analysis` tool runs. (Card already exists as `PortfolioCard` — this enhances it.)

```
┌─────────────────────────────────────┐
│  YOUR PORTFOLIO                     │
│                                     │
│         $2,847.50                   │
│      ▲ +$42.30 this week (1.5%)    │
│                                     │
│  ┌──────────────────────────────┐   │
│  │ ████████████████░░░░░░░░░░░░ │   │
│  │ USDC 62%  SUI 28%  Other 10%│   │
│  └──────────────────────────────┘   │
│                                     │
│  Wallet         $847.50            │
│    USDC           $500.00           │
│    SUI            $302.50           │
│    Other           $45.00           │
│  Savings       $1,500.00            │
│    APY 4.2% · Earning $0.17/day    │
│  Debt            -$500.00           │
│    HF 2.45 · ● Healthy             │
│                                     │
│  Net Worth      $2,847.50          │
│                                     │
│  💡 68% of your portfolio is in     │
│  stablecoins. Consider diversifying │
│  for growth, or saving more USDC    │
│  to maximise yield.                 │
└─────────────────────────────────────┘
```

**Enhancement over current `PortfolioCard`:**
- Week-over-week change (requires storing historical snapshots — see FA-4)
- Stacked allocation bar (monochrome)
- Inline savings APY + daily earnings
- Inline health factor with status badge
- Insights from `portfolio_analysis` tool rendered as callout

---

#### FA-2: Spending Analytics Card (NEW)

**Trigger:** User asks "what did I spend on services?" or "show my MPP spending". New engine tool `spending_analytics` needed.

```
┌─────────────────────────────────────┐
│  SERVICE SPENDING        This Month │
│                                     │
│          $4.23                       │
│     12 requests across 5 services   │
│                                     │
│  ┌──────────────────────────────┐   │
│  │ ████████████░░░░░░░░░░░░░░░░ │   │
│  │ Images 47%  Mail 24%  Other  │   │
│  └──────────────────────────────┘   │
│                                     │
│  AI Images (fal)      $2.01  (8x)  │
│  Postcards (lob)      $1.00  (1x)  │
│  Web Search (brave)   $0.05  (4x)  │
│  Weather (openweather)$0.02  (2x)  │
│  Research (firecrawl) $0.15  (1x)  │
│                                     │
│  Avg. per request: $0.26            │
│  Budget remaining: $95.77 / $100    │
└─────────────────────────────────────┘
```

**New API needed:** `GET /api/analytics/spending?period=month`

Returns:
```ts
interface SpendingAnalytics {
  period: string;               // "2026-04"
  totalSpent: number;           // 4.23
  requestCount: number;         // 12
  serviceCount: number;         // 5
  byService: {
    service: string;            // "fal"
    endpoint: string;           // "/fal-ai/flux/dev"
    category: string;           // "AI Images"
    totalSpent: number;         // 2.01
    requestCount: number;       // 8
  }[];
  budgetTotal: number | null;   // from allowance
  budgetRemaining: number | null;
}
```

**Data source:** `AppEvent` table (already has amount, service, endpoint for MPP transactions). Aggregate with a simple `GROUP BY`.

---

#### FA-3: Yield Earnings Card (NEW)

**Trigger:** User asks "how much have I earned?" or "show my yield". New engine tool `yield_summary` needed.

```
┌─────────────────────────────────────┐
│  YIELD EARNINGS                     │
│                                     │
│         $127.40                     │
│      All-time earnings              │
│                                     │
│  ┌──────────────────────────────┐   │
│  │         ╱‾‾‾‾╲               │   │
│  │    ╱‾‾‾╱      ╲──────       │   │
│  │ ──╱                          │   │
│  │ Jan  Feb  Mar  Apr           │   │
│  └──────────────────────────────┘   │
│                                     │
│  Today           $0.17             │
│  This Week       $1.19             │
│  This Month      $5.10             │
│  All Time       $127.40            │
│                                     │
│  Current APY     4.2%              │
│  Deposited      $1,500.00          │
│  Projected/Year  $63.00            │
└─────────────────────────────────────┘
```

**Sparkline chart:** Monthly cumulative earnings. Requires historical data (FA-4).

**Data source (immediate, no history):** `savings_info` tool already returns `{ earnings: { totalYieldEarned, currentApy, dailyEarning } }`. The "today/week/month" breakdown is calculated from `dailyEarning * days` as an approximation until FA-4 provides real history.

**Data source (with history, FA-4):** Real daily snapshots enable accurate sparklines and period breakdowns.

---

#### FA-4: Portfolio History Snapshots (NEW — backend)

**What:** A daily cron job that snapshots each user's portfolio state. This unlocks "your portfolio is up 1.5% this week" and sparkline charts.

**Schema:**

```prisma
model PortfolioSnapshot {
  id        String   @id @default(cuid())
  userId    String
  date      DateTime @db.Date
  
  walletValueUsd    Float
  savingsValueUsd   Float
  debtValueUsd      Float
  netWorthUsd       Float
  yieldEarnedUsd    Float
  healthFactor      Float?
  
  allocations       Json     // { USDC: 500, SUI: 302.5, ... }
  
  user      User     @relation(fields: [userId], references: [id])
  
  @@unique([userId, date])
  @@index([userId, date])
}
```

**Cron:** Daily, runs in `t2000/apps/server/src/cron/jobs/` calling `POST /api/internal/portfolio-snapshot` on Audric. The internal route fetches positions + balances for each active user and writes one row.

**API:** `GET /api/analytics/portfolio-history?days=30`

Returns:
```ts
interface PortfolioHistory {
  snapshots: {
    date: string;
    netWorthUsd: number;
    walletValueUsd: number;
    savingsValueUsd: number;
    debtValueUsd: number;
    yieldEarnedUsd: number;
    healthFactor: number | null;
  }[];
  change: {
    period: string;        // "7d" | "30d"
    absoluteUsd: number;
    percentChange: number;
  };
}
```

**Effort:** 1.5 days (Prisma migration, cron job, internal route, API endpoint).

---

#### FA-5: DeFi Activity Summary (NEW)

**Trigger:** User asks "what have I done this month?" or weekly summary in morning briefing.

```
┌─────────────────────────────────────┐
│  APRIL ACTIVITY                     │
│                                     │
│  28 transactions                    │
│                                     │
│  ┌──────────────────────────────┐   │
│  │ ████████░░░░░░░░░░░░░░░░░░░ │   │
│  │ Save 43%  Send 25%  Pay 21% │   │
│  └──────────────────────────────┘   │
│                                     │
│  Saves          12    $3,200.00     │
│  Sends           7      $420.00    │
│  Services        6        $4.23    │
│  Borrows         2      $400.00    │
│  Repayments      1      $200.00    │
│                                     │
│  Total moved     $4,224.23         │
│  Net savings     +$3,000.00        │
│  Yield earned       $5.10          │
└─────────────────────────────────────┘
```

**Data source:** `AppEvent` table. `GROUP BY` action type for the selected period.

**API:** `GET /api/analytics/activity-summary?period=month`

Returns:
```ts
interface ActivitySummary {
  period: string;
  totalTransactions: number;
  byAction: {
    action: string;       // save, send, borrow, repay, pay, swap, claim
    count: number;
    totalAmountUsd: number;
  }[];
  totalMovedUsd: number;
  netSavingsUsd: number;
  yieldEarnedUsd: number;
}
```

**Effort:** 1 day (API endpoint + card).

---

### New Engine Tools (FA)

| Tool | Permission | Description |
|------|-----------|-------------|
| `spending_analytics` | `auto` (read) | Returns MPP service spending breakdown for a period |
| `yield_summary` | `auto` (read) | Returns yield earnings breakdown (today/week/month/all-time) |
| `activity_summary` | `auto` (read) | Returns categorised activity summary for a period |

These are thin wrappers that call the new Audric API endpoints. ~0.5d each in `packages/engine/src/tools/`.

---

## AC: Allowance Controls via Chat

Let users manage their agent's access through conversation. The `allowance.move` contract already supports `permitted_features`, `daily_limit`, and deposits/withdrawals. What's missing: engine tools that expose these controls.

### AC-1: Show Allowance Status

**Tool:** `allowance_status` (read, auto)

```
┌─────────────────────────────────────┐
│  AGENT ALLOWANCE                    │
│                                     │
│  Balance        $95.77 USDC        │
│  Daily Limit    $10.00 / day       │
│  Used Today      $4.23             │
│                                     │
│  Permissions                        │
│  ✓ Savings (deposit/withdraw)       │
│  ✓ Send (transfers)                 │
│  ✓ Credit (borrow/repay)            │
│  ✓ Services (MPP)                   │
│  ✗ Auto-compound (not enabled)      │
│                                     │
│  Expires        2026-06-15         │
│  Created        2026-04-02         │
│                                     │
│  "Top up" · "Change limits"         │
└─────────────────────────────────────┘
```

**Data source:** SDK `getAllowance()` — already returns balance, limits, features, expiry.

---

#### AC-2: Pause/Resume Agent

**Tool:** `toggle_allowance` (write, confirm)

User says: "Pause my agent" → agent confirms → user approves → SDK call to freeze features.

Implementation: Set `daily_limit` to 0 (effectively pauses autonomous spending). Resume restores previous limit.

**Important:** This is a `confirm` permission tool — the user must approve.

---

#### AC-3: Update Daily Limit

**Tool:** `update_daily_limit` (write, confirm)

User says: "Set my daily limit to $5" → agent shows current vs new → user approves.

---

#### AC-4: Update Permissions

**Tool:** `update_permissions` (write, confirm)

User says: "Disable sends, only allow savings" → agent shows permissions grid → user approves.

---

### AC Card: `AllowanceCard`

Shared card for AC-1 through AC-4.

**Effort:** 1.5 days total (3 tools in engine + 1 card + SDK integration).

---

## FI: Financial Insights (Proactive)

The intelligence layer (Phase 3.5) handles deep proactive behaviour. But some simple insights can ship earlier as card-rendered observations the agent includes when relevant.

### FI-1: Idle USDC Alert

When `balance_check` returns USDC sitting in wallet (not in savings), and savings APY is > 3%:

```
┌─────────────────────────────────────┐
│  💡 INSIGHT                         │
│                                     │
│  You have $500 USDC sitting idle.   │
│  At current rates (4.2% APY),       │
│  that could earn ~$21/year.         │
│                                     │
│  "Save it" · "Dismiss"             │
└─────────────────────────────────────┘
```

This is a **prompt addition** (F2 Proactive Awareness already covers this in the intelligence spec). The card rendering is the new part.

### FI-2: Health Factor Warning

When `health_check` shows HF < 2.0:

```
┌─────────────────────────────────────┐
│  ⚠ HEALTH FACTOR LOW               │
│                                     │
│  Your health factor is 1.65.        │
│  Liquidation risk increases below   │
│  1.5. Consider repaying some debt.  │
│                                     │
│  "Repay $100" · "Show options"      │
└─────────────────────────────────────┘
```

### FI-3: Weekly Performance Summary

Enhancement to the existing morning briefing system (Phase 1.3 — `BriefingCard` + `DailyBriefing` table + `runBriefings()` cron). Ships as a new briefing variant alongside the 3 existing variants (savings/idle/debt_warning). The card reuses the existing `BriefingCard` component — no new card type needed, just a new content template.

```
┌─────────────────────────────────────┐
│  WEEKLY SUMMARY        Apr 1–7      │
│                                     │
│  Net Worth     $2,847 (▲ +1.5%)    │
│  Yield Earned  $1.19               │
│  Transactions  8                    │
│  Services Used 3 ($0.09)           │
│                                     │
│  🏆 You saved $500 this week.       │
│  That's your biggest weekly save.   │
└─────────────────────────────────────┘
```

**Data source:** `PortfolioSnapshot` (FA-4) + `AppEvent` aggregation.

---

## Implementation Ordering

### Phase Placement

```
Phase 2 (parallel):
├── RC-shared: Card primitives (CardShell, MiniBar, Gauge, TrendIndicator)
├── RC-1: HealthCard
├── RC-2: TransactionHistoryCard  
├── RC-3: SwapQuoteCard
├── RC-9: Enhanced TransactionReceiptCard
├── RC-register: Wire all into CARD_RENDERERS
└── AC-1: allowance_status tool + AllowanceCard

Phase 2.5 (parallel):
├── RC-4: ServiceCatalogCard
├── RC-5: SearchResultsCard
└── AC-2/3/4: toggle/limit/permissions tools

Phase 3:
├── FA-4: Portfolio snapshots (cron + internal route + API)
├── FA-2: Spending analytics (API + engine tool + card)
├── FA-3: Yield summary (API + engine tool + card)
├── FA-5: Activity summary (API + engine tool + card)
├── FA-1: Enhanced PortfolioCard (with history from FA-4)
├── FI-1: Idle USDC insight card
├── FI-2: HF warning insight card
└── FI-3: Weekly summary card (enhance briefing)

Phase 3.5 (intelligence layer):
├── RC-6: StakingCard (low priority)
├── RC-7: ProtocolCard (low priority)
└── RC-8: PriceCard (low priority)
```

### Dependency Graph

```
RC-shared (primitives)
  ├── RC-1 (HealthCard)
  ├── RC-2 (TransactionHistoryCard)
  ├── RC-3 (SwapQuoteCard)
  ├── RC-4 (ServiceCatalogCard)
  ├── RC-5 (SearchResultsCard)
  ├── RC-9 (Enhanced receipts)
  └── AC-1 (AllowanceCard)
         ├── AC-2 (toggle)
         ├── AC-3 (daily limit)
         └── AC-4 (permissions)

FA-4 (portfolio snapshots) ← backend infra
  ├── FA-1 (enhanced portfolio card)
  ├── FA-3 (yield summary with sparkline)
  └── FI-3 (weekly summary)

AppEvent aggregation (already exists)
  ├── FA-2 (spending analytics)
  └── FA-5 (activity summary)
```

### Effort Summary

| Workstream | Tasks | Total Effort |
|-----------|-------|-------------|
| RC (Rich Chat Cards) | 11 tasks | ~4 days |
| FA (Financial Analytics) | 5 tasks + 3 engine tools | ~5 days |
| AC (Allowance Controls) | 4 tasks | ~1.5 days |
| FI (Financial Insights) | 3 tasks | ~1 day |
| **Total** | **23 tasks** | **~11.5 days** |

---

## Design System Alignment

All cards follow the Agentic Design System (`spec/DESIGN_SYSTEM.md`):

| Element | Font | Style |
|---------|------|-------|
| Card label ("HEALTH FACTOR") | Geist Mono | 11px, uppercase, tracking-[0.08em], `text-muted-foreground` |
| Hero value ("$2,847.50") | Geist Sans | 28px, font-semibold, `text-foreground` |
| Subtitle/trend | Geist Sans | 14px, `text-muted-foreground` |
| Detail labels | Geist Sans | 14px, `text-muted-foreground` |
| Detail values | Geist Mono | 14px, `text-foreground` |
| Status badges | Geist Mono | 11px, uppercase, coloured dot |
| CTA buttons | Geist Mono | 12px, uppercase, tracking-[0.08em] |

### Card Colour Tokens (Dark Theme)

```css
--card-bg:           hsl(var(--card));           /* dark surface */
--card-bg-elevated:  hsl(var(--accent));         /* slightly lighter */
--card-border:       hsl(var(--border));         /* subtle border */
--card-divider:      hsl(var(--border) / 0.5);  /* inner dividers */

/* Chart monochrome segments */
--chart-1:           hsl(0 0% 85%);             /* lightest */
--chart-2:           hsl(0 0% 60%);
--chart-3:           hsl(0 0% 40%);
--chart-4:           hsl(0 0% 25%);             /* darkest */

/* Status colours (only used for status, not decoration) */
--status-healthy:    hsl(142 71% 45%);          /* green */
--status-warning:    hsl(38 92% 50%);           /* amber */
--status-danger:     hsl(0 84% 60%);            /* red */
--status-info:       hsl(217 91% 60%);          /* blue */
```

### Card Anatomy (CSS)

```css
.card-shell {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  padding: 16px;
  max-width: 360px;
}

.card-label {
  font-family: var(--font-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted-foreground);
}

.card-hero {
  font-family: var(--font-sans);
  font-size: 28px;
  font-weight: 600;
  color: var(--foreground);
  margin-top: 8px;
}

.card-detail-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
}

.card-detail-label {
  font-size: 14px;
  color: var(--muted-foreground);
}

.card-detail-value {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--foreground);
}
```

---

## Cross-Spec Integration Points

Features from other specs that have UX card implications — ensuring nothing falls through the cracks.

### From `spec/REASONING_ENGINE.md`

| Feature | UX Impact | Covered? |
|---------|-----------|----------|
| `thinking_delta` events | `ReasoningAccordion` component — collapsible thinking display before assistant text. Spec'd in `audric-intelligence-spec.md` §UI-A | **Not in this spec** — separate component, ships in RE-1.4. No card needed. |
| `GuardEvent` (guard fires) | Guard events are logged to Prisma for observability. No user-facing card — this is backend telemetry | N/A (backend only) |
| Recipe progress (`mid_recipe` state) | Progress bar at top of chat: "Rebalancing portfolio — step 2 of 4". Spec'd in `audric-intelligence-spec.md` §UI-C | **Not in this spec** — persistent bar, not a card. Ships with F4 |

### From `audric-intelligence-spec.md`

| Feature | UX Impact | Covered? |
|---------|-----------|----------|
| F1: User Financial Profile | Settings > Profile page showing inferred fields + correction UI. Spec'd in §UI-B | **Not in this spec** — settings page, not a chat card. Ships with Phase 2.5 (scaffold) + F1 (data) |
| F3: Episodic User Memory | Settings > Memory page listing memories with delete actions. Spec'd in §UI-B | **Not in this spec** — settings page. Ships with Phase 2.5 (scaffold) + F3 (data) |
| F4: State machine progress | Persistent bar/badge above chat. Spec'd in §UI-C | **Not in this spec** — persistent bar. Ships with F4 |
| F5: Self-Evaluation | No UI component — prompt-only feature | N/A |

### From `audric-feedback-loop-spec.md`

| Feature | UX Impact | Covered? |
|---------|-----------|----------|
| `record_advice` tool | Auto-permission tool, no card needed (fires silently) | N/A |
| Follow-up cards | Reuses existing `BriefingCard`. Ships with 3.3.1 | N/A |
| Outcome check results | Backend processing, surfaces via follow-up cards | N/A |

### Tools Not Covered by Cards (intentional omissions)

| Tool | Reason for no card |
|------|-------------------|
| `record_advice` | Silent auto tool — writes to DB, no user-visible output |
| `save_contact` | Minimal data (`{ saved, name, address }`). The LLM's confirmation text is sufficient. Could add a tiny `ContactSavedCard` later |
| `create_goal` / `list_goals` / `update_goal` / `delete_goal` | These 4 goal tools return simple confirmations. Goals have their own UI in Settings > Goals (`GoalCard` + `GoalEditor`). No chat card needed — the LLM describes the result |
| `defillama_chain_tvl` | Rarely called, low user impact. LLM text is fine |
| `defillama_protocol_fees` | Rarely called, niche. LLM text is fine |
| `defillama_sui_protocols` | Rarely called, niche. Could group with `ProtocolCard` later |

**Net result:** All 29 tools are accounted for — 20 get cards (7 existing + 13 new), 9 are intentional omissions with documented reasoning.

---

## Open Questions

| # | Question | Recommendation |
|---|----------|---------------|
| 1 | Should cards be interactive (collapsible, expandable detail)? | v1: static. v2: collapsible detail sections for dense cards like TransactionHistory |
| 2 | Should the agent decide when to show cards vs text? | No — every structured tool result gets a card. The agent's text supplements the card, not replaces it |
| 3 | Should cards have a "copy data" action? | Yes — small copy icon on values like tx digests and addresses |
| 4 | Should we support light theme cards? | Not for v1 — app is dark. Cards inherit theme tokens so they'll work when light theme is added |
| 5 | Should FA analytics be accessible outside chat (standalone dashboard page)? | v1: chat only. v2: `/analytics` page that aggregates all FA cards. Defer until usage data shows demand |
| 6 | Chart library? | Lightweight: `recharts` (already a common Next.js choice) for sparklines and bar charts. Or pure SVG for the simplest cases (MiniBar, Gauge) to avoid bundle bloat |
| 7 | Should `spending_analytics` include DeFi tx costs or only MPP? | Both — DeFi gas costs + MPP service costs. Label them separately |
| 8 | `PortfolioSnapshot` cron frequency? | Daily is sufficient. Intraday changes are visible via live API calls |

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Tool results with visual cards | 7 / 29 (24%) | 20 / 29 (69%) — 9 intentional omissions documented |
| Average time to understand portfolio | ~30s (read LLM text) | ~5s (glance at card) |
| User asks for "balance" / "portfolio" | Text response | Rich card with charts |
| Service spending visibility | Zero (no tracking) | Full breakdown by service/period |
| Allowance management | Settings page only | Chat-based + Settings |

---

*Last updated: April 2026. Reviewed — cross-referenced against all companion specs. Ready for build tracker integration.*
