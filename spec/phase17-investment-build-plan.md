# Phase 17a — Spot Investment Account Build Plan

**Goal:** Add a 5th account tier — Investment — enabling spot investing with portfolio tracking, cost-basis P&L, and unified balance display. Invested assets are logically locked — the only way to access value is to sell back to USDC.

**Scope:** Spot investing only. Margin trading deferred to Phase 17e.

**MVP Asset:** SUI only for 17a. BTC (wBTC via SuiBridge) and ETH (wETH via SuiBridge) coin types added to registry — ready for Phase 17b activation.

**Version bump:** v0.13.1 → v0.14.0 (minor — new feature, no breaking changes)

---

## Product Vision — Investment Products

t2000 offers three investment products, inspired by CBA's tiered investment offering. The AI agent is the differentiator — instead of separate products with separate UIs, these are different levels of agent autonomy on the same SDK infrastructure.

### 1. Direct Investing ← **This is Phase 17a**

> "Buy $100 of SUI" — user picks asset and amount

- User controls what to buy, when, and how much
- Full portfolio tracking with cost basis and P&L
- Experience: Moderate to advanced
- Minimum: $1
- Agent autonomy: Low (user-directed)
- **Status: Shipped (v0.14.0)**

### 2. Baskets (Phase 17d)

> "Invest $200 in Layer 1s" — user picks a theme, agent fills the basket

- Predefined themed baskets: "Bluechip/L1" (50% BTC, 30% ETH, 20% SUI), "DeFi", "Memecoin"
- Agent splits investment across basket assets, auto-rebalances to target weights
- Experience: Beginner to moderate
- Minimum: $50
- Agent autonomy: Medium (user picks theme, agent executes)
- Implementation: Agent calls `investBuy` N times per basket allocation. Rebalancing = `investSell` + `investBuy` to adjust weights. Basket definitions stored in config.

### 3. Auto-Invest (Phase 17d)

> "Invest $50/week into a balanced crypto portfolio" — fully agent-managed

- Agent picks allocation based on market conditions and user risk profile
- DCA on schedule (weekly/monthly)
- Auto-rebalances
- Experience: Beginner
- Minimum: $2
- Agent autonomy: High (agent manages everything)
- Implementation: Scheduled agent task + investment-strategy prompt. Agent decides allocation, calls `investBuy` with DCA amounts.

**All three products use the same `investBuy`/`investSell`/`getPortfolio` SDK methods.** Baskets and Auto-Invest are agent behaviors (prompts + schedules), not new infrastructure.

---

## Design Principle

**Think in dollars. Track everything. Zero friction. Locked like a real investment.**

| Principle | Implementation |
|-----------|---------------|
| Dollar-denominated | `t2000 invest buy 100 SUI` = invest $100 in SUI |
| Cost-basis tracking | Local `portfolio.json` tracks every buy/sell |
| Live P&L | Real-time prices via Cetus Aggregator quotes |
| Unified balance | Investment shows alongside checking, savings, credit |
| Investment locking | Invested assets cannot be sent or exchanged — must sell first |
| Same safeguards | `maxPerTx`, lock, existing limits all apply |
| Registry-driven assets | Adding a new asset = one line in `INVESTMENT_ASSETS`. Cetus Aggregator v3 handles routing |
| Reuse infrastructure | Spot uses existing CetusAdapter — no new protocol integration |

---

## What's in vs what's deferred

| Feature | 17a (this phase) | Later |
|---------|:---:|---|
| Spot buy/sell SUI | ✅ | — |
| Asset registry (scalable, coin type based) | ✅ | — |
| Portfolio tracking (cost basis, P&L) | ✅ | — |
| Balance tier integration (investment line) | ✅ | — |
| Investment locking (send/exchange guard) | ✅ | — |
| Portfolio wallet-clamping (desync protection) | ✅ | — |
| MCP tools (`t2000_invest`, `t2000_portfolio`) | ✅ | — |
| MCP prompt (`investment-strategy`) | ✅ | — |
| Investment safeguard config (`maxLeverage`, `maxPositionSize`) | ✅ | — |
| Agent skill (`t2000-invest`) | ✅ | — |
| Multi-asset: BTC, ETH (coin types in registry) | ✅ | ✅ Phase 17b — Shipped (v0.14.1) |
| Yield on investment assets (invest earn/unearn) | — | ⬜ Phase 17c (NAVI + Suilend + Bluefin Lending) |
| Baskets + Auto-Invest (agent-driven) | — | ⬜ Phase 17d |
| DCA (dollar-cost averaging) | — | ⬜ Phase 17d |
| Margin trading (Bluefin perps) | — | ⬜ Phase 17e (BluefinPerpsAdapter) |
| Securities-backed lending (borrow against investments) | — | ⬜ Phase 17f (15-20% LTV, auto-repay) |

---

## Account Tier Model

```
┌─────────────────────────────────────────────────────┐
│  t2000 Balance                                      │
├─────────────────────────────────────────────────────┤
│  Available:  $85.81  (checking — spendable)         │
│  Savings:    $5.00   (earning 4.99% APY)  🔒 locked │
│  Credit:     -$1.00  (borrowed @ 7.73% APR)         │
│  Investment: $100.00 (105 SUI, +2.1%)     🔒 locked │ ← NEW
│  Gas:        0.81 SUI (~$0.78)                      │
│  ──────────────────────────────────────              │
│  Total:      $190.59                                │
└─────────────────────────────────────────────────────┘
```

**Savings and Investment follow the same locking model:**

| Account | What's in it | Locked? | How to access value |
|---------|-------------|---------|---------------------|
| Checking | USDC (spendable) | No | `send`, `pay`, `exchange` |
| Savings | USDC in NAVI (earning yield) | Yes | `withdraw` → USDC → checking |
| Credit | USDC borrowed (debt) | — | `repay` to reduce debt |
| Investment | SUI (price exposure) | Yes | `invest sell` → USDC → checking |
| Gas | Free SUI (for tx fees) | No | Auto-used by transactions |

---

## Investment Locking Guard

### Why

Invested SUI should behave like stocks in Robinhood — you can't send Apple stock to someone. To access value, sell it back to cash. This prevents:
- Portfolio tracking going out of sync
- Users accidentally spending their investment
- Agents moving invested assets without going through proper sell flow

### How

When `send()` or `exchange()` is called with SUI, calculate free (non-invested) SUI:

```typescript
const walletSUI = <actual on-chain SUI balance>;
const investedSUI = portfolio.getPosition('SUI')?.totalAmount ?? 0;
const freeSUI = Math.max(0, walletSUI - investedSUI - GAS_RESERVE_MIN);
```

Only `freeSUI` is available for send/exchange operations.

### Error messages

```bash
# User tries to send invested SUI
t2000 send 50 SUI to alice
# Error: "Cannot send 50 SUI — 50 SUI is invested. Free SUI: 0.81
#         To access invested funds: t2000 invest sell 50 SUI"

# User tries to exchange invested SUI
t2000 exchange 50 SUI USDC
# Error: "Cannot exchange 50 SUI — 50 SUI is invested. Free SUI: 0.81
#         To sell investment: t2000 invest sell 50 SUI"
```

### Edge cases

| Scenario | freeSUI | Behavior |
|----------|---------|----------|
| 106 wallet, 105 invested, 0.05 reserve | 0.95 | Can send up to 0.95 SUI |
| 105 wallet, 105 invested, 0.05 reserve | 0 | Can't send any SUI. Error with helpful message |
| 110 wallet, 105 invested, 0.05 reserve | 4.95 | Can send up to 4.95 (received 5 SUI from someone) |
| 100 wallet, 105 invested (gas ate some) | 0 | Can't send. Portfolio clamps to 100 in display |
| 0 invested | All free | No guard — send/exchange work normally |
| Sending USDC (not SUI) | N/A | No guard needed — USDC isn't an investment asset |

### What the guard does NOT block

- `invest sell` — this is the proper exit path, always allowed
- `invest buy` — this is the entry path, always allowed
- Sending/exchanging USDC or other stablecoins — unaffected
- Sending SUI received from others (free SUI, not invested)
- Gas consumption — unavoidable, may slowly reduce investment balance

---

## Portfolio Wallet Clamping

### Problem

If gas fees consume invested SUI over time, `portfolio.json` might track more SUI than the wallet actually holds. Without clamping, `getPortfolio()` would show phantom SUI.

### Fix

`getPortfolio()` fetches actual wallet SUI and clamps each position:

```typescript
const walletSUI = await getWalletSuiBalance();
const trackedSUI = pos.totalAmount;
const actualHeld = Math.min(trackedSUI, Math.max(0, walletSUI - GAS_RESERVE_MIN));

// Adjust cost basis proportionally if clamped
if (actualHeld < trackedSUI) {
  const ratio = actualHeld / trackedSUI;
  pos.costBasis *= ratio;
}
```

`balance()` already does this clamping (line 250: `Math.min(pos.totalAmount, bal.gasReserve.sui)`).

---

## User Flows

### Flow 1: First-time investor — buy, check, sell

The most common journey. User has USDC in checking and wants price exposure to SUI.

```
User                          t2000                           On-chain
─────────────────────────────────────────────────────────────────────────
                              ┌─────────────────────────────┐
1. "How much do I have?"      │ t2000 balance               │
                              │                             │
                              │ Available: $185.81          │
                              │ Savings:   $5.00            │
                              │ Investment: —               │  ← no investment yet
                              │ Gas: 0.81 SUI              │
                              │ Total: $191.59              │
                              └─────────────────────────────┘
                              ┌─────────────────────────────┐
2. "Invest $100 in SUI"       │ t2000 invest buy 100 SUI    │──→ USDC→SUI swap
                              │                             │    via Cetus Aggr v3
                              │ ✓ Bought 105.26 SUI @ $0.95│
                              │   Invested: $100.00         │
                              │   Portfolio: 105.26 SUI     │
                              │   Tx: suiscan.xyz/...       │
                              └─────────────────────────────┘
                              ┌─────────────────────────────┐
3. "What's my balance now?"   │ t2000 balance               │
                              │                             │
                              │ Available: $85.81           │  ← $100 moved to investment
                              │ Savings:   $5.00            │
                              │ Investment: $100.00 (+2.1%) │  ← SUI price went up
                              │ Gas: 0.81 SUI              │
                              │ Total: $191.59              │
                              └─────────────────────────────┘
                              ┌─────────────────────────────┐
4. "Show my portfolio"        │ t2000 portfolio             │
                              │                             │
                              │ SUI  105.26  Avg: $0.95     │
                              │   Now: $0.97  +$2.10 (+2.1%)│
                              │                             │
                              │ Total invested: $100.00     │
                              │ Current value:  $102.10     │
                              │ Unrealized P&L: +$2.10      │
                              └─────────────────────────────┘
                              ┌─────────────────────────────┐
5. "Take some profit"         │ t2000 invest sell 50 SUI    │──→ SUI→USDC swap
                              │                             │
                              │ ✓ Sold 52.63 SUI @ $0.97   │
                              │   Proceeds: $51.05          │
                              │   Realized P&L: +$1.05      │
                              │   Remaining: 52.63 SUI      │
                              └─────────────────────────────┘
                              ┌─────────────────────────────┐
6. "Final balance"            │ t2000 balance               │
                              │                             │
                              │ Available: $136.86          │  ← $51.05 returned
                              │ Savings:   $5.00            │
                              │ Investment: $51.05 (+2.1%)  │  ← remaining position
                              │ Gas: 0.81 SUI              │
                              │ Total: $193.69              │  ← grew from $191.59
                              └─────────────────────────────┘
```

### Flow 2: Locking guard — user tries to send invested SUI

The investment is locked. User must sell first.

```
User                          t2000
───────────────────────────────────────────────────────
1. Has 105 SUI invested        (portfolio: 105 SUI)
   + 0.81 free SUI             (gas reserve)

2. "Send 50 SUI to alice"     t2000 send 50 SUI to alice
                              
                              ✗ Cannot send 50 SUI
                                50 SUI is invested. Free SUI: 0.76
                                To access invested funds:
                                  t2000 invest sell 50 SUI

3. "Ok, sell first"            t2000 invest sell 50 SUI
                              ✓ Sold 52.63 SUI @ $0.97
                                Proceeds: $51.05 → checking

4. "Now send from checking"   t2000 send 50 to alice
                              ✓ Sent $50.00 USDC to alice
```

### Flow 3: Agent-driven investing (via Claude Desktop)

```
User (Claude Desktop):  "I have some idle USDC, should I invest?"

Agent thinks:
  1. Calls t2000_balance → Available: $500, Savings: $0, Investment: $0
  2. Calls t2000_portfolio → Empty
  3. Uses investment-strategy prompt → Suggests investing idle funds

Agent responds: "You have $500 idle in checking. Based on current market
conditions, I'd suggest investing $200 in SUI. Want me to go ahead?"

User: "Yes, invest $200"

Agent:
  1. Calls t2000_invest(action: "buy", asset: "SUI", amount: 200, dryRun: true)
     → Preview: buy ~210 SUI @ $0.95, checking balance: $500
  2. Shows preview: "I'll invest $200, buying ~210 SUI at $0.95. Proceed?"
  3. User confirms
  4. Calls t2000_invest(action: "buy", asset: "SUI", amount: 200)
     → Result: bought 210.53 SUI @ $0.95

Agent responds: "Done! Invested $200 in SUI (210.53 SUI @ $0.95).
Your checking balance is now $300. I'll keep an eye on the position."
```

### Flow 4: Portfolio with multiple assets (Phase 17b)

```
t2000 balance
  Available:  $500.00
  Savings:    $100.00  (earning 4.99% APY)
  Investment: $650.00  (+5.2%)
  Gas:        0.81 SUI
  Total:      $1,250.81

t2000 portfolio
  Investment Portfolio
  ─────────────────────────────────────────────────────
  BTC     0.0052    Avg: $94,230    Now: $97,500    +$17.00 (+3.5%)
  ETH     0.15      Avg: $3,100     Now: $3,250     +$22.50 (+4.8%)
  SUI     105.26    Avg: $0.95      Now: $0.97      +$2.10  (+2.1%)
  XAUM    2.00      Avg: $78.50     Now: $82.00     +$7.00  (+4.5%)
  ─────────────────────────────────────────────────────
  Total invested:   $618.00
  Current value:    $648.60
  Unrealized P&L:   +$30.60 (+5.0%)
  Realized P&L:     $12.50
```

### Flow 5: Auto-Invest with DCA (Phase 17d — future)

```
User (Claude Desktop): "Set up a weekly $50 investment into a balanced portfolio"

Agent:
  1. Creates auto-invest schedule: $50/week
  2. Picks allocation: 50% BTC, 30% ETH, 20% SUI
  3. Every week, agent runs:
     - t2000_invest(buy, BTC, $25)
     - t2000_invest(buy, ETH, $15)
     - t2000_invest(buy, SUI, $10)
  4. Monthly rebalance: sells overweight, buys underweight

Agent responds: "Auto-invest set up: $50/week into a balanced portfolio
(50% BTC, 30% ETH, 20% SUI). First investment runs next Monday."
```

---

## CLI UX

### Commands

```bash
# Buy — amount is always USD (spend $X from checking to buy asset)
t2000 invest buy 100 SUI          # Invest $100 in SUI
t2000 invest buy 50 SUI           # Invest another $50

# Sell — amount is USD (sell $X worth of asset back to USDC)
t2000 invest sell 50 SUI          # Sell $50 worth of SUI
t2000 invest sell all SUI         # Sell all SUI holdings

# Portfolio
t2000 portfolio                   # Show all investment positions + P&L
```

#### Invest buy output
```
  ✓ Bought 105.26 SUI at $0.95
    Invested:       $100.00
    Portfolio:      105.26 SUI (avg $0.95)
    Tx: https://suiscan.xyz/mainnet/tx/...
```

#### Invest sell output
```
  ✓ Sold 52.63 SUI at $0.97
    Proceeds:       $51.05
    Realized P&L:   +$1.05 (+2.1%)
    Remaining:      52.63 SUI (avg $0.95)
    Tx: https://suiscan.xyz/mainnet/tx/...
```

#### Portfolio output
```
  Investment Portfolio
  ─────────────────────────────────────────────────────
  SUI     105.26    Avg: $0.95    Now: $0.97    +$2.10 (+2.1%)
  ─────────────────────────────────────────────────────
  Total invested:   $100.00
  Current value:    $102.10
  Unrealized P&L:   +$2.10 (+2.1%)
  Realized P&L:     $0.00
```

#### Send guard error
```
  ✗ Cannot send 50 SUI — 50 SUI is invested. Free SUI: 0.81
    To access invested funds: t2000 invest sell 50 SUI
```

#### Price unavailable
```
  Investment Portfolio
  ─────────────────────────────────────────────────────
  SUI     105.26    Avg: $0.95    Now: unavailable
  ─────────────────────────────────────────────────────
  ⚠ Price data unavailable. Values may be inaccurate.
```

#### Invalid input
```
  t2000 invest buy 0 SUI
  ✗ Amount must be greater than $0

  t2000 invest buy -50 SUI
  ✗ Amount must be greater than $0
```

---

## Architecture

**No new protocol integrations.** Reuses existing CetusAdapter for swaps. New code is:

1. `PortfolioManager` — local file tracking (cost basis, trades, P&L)
2. `investBuy()` / `investSell()` on `T2000` class — thin wrappers around `exchange()` + portfolio tracking
3. `getPortfolio()` on `T2000` class — portfolio + live prices + wallet clamping
4. Updated `balance()` — adds investment tier with SUI double-counting fix
5. Investment locking guard on `send()` and `exchange()` — prevents moving invested SUI

```
investBuy flow:
  1. enforcer.assertNotLocked()
  2. enforcer.check({ operation: 'invest', amount })
  3. Pre-check: query balance, verify available >= usdAmount
  4. Execute swap via exchange() method (USDC → SUI)
  5. Record trade in PortfolioManager
  6. Return InvestResult

investSell flow:
  1. enforcer.assertNotLocked()
  2. Check portfolio has position for asset
  3. Query ACTUAL on-chain wallet SUI balance (not portfolio tracking)
  4. Guard: wallet_SUI - GAS_RESERVE_MIN (0.05) ≥ sell_amount_in_SUI
  5. Execute swap via exchange() method (SUI → USDC)
  6. Record trade in PortfolioManager (with realized P&L via average cost)
  7. Return InvestResult

send/exchange guard (SUI only):
  1. Query wallet SUI balance
  2. Query portfolio invested SUI
  3. freeSUI = max(0, walletSUI - investedSUI - GAS_RESERVE_MIN)
  4. If requested > freeSUI → throw error with helpful message
  5. Otherwise → proceed normally

Locking guard bypass for invest methods:
  investBuy/investSell call exchange() internally.
  The locking guard in exchange() must NOT fire for invest operations.
  Implementation: pass internal option { _bypassInvestmentGuard: true }
  to exchange(). This option is NOT exposed in the public API.
  Only investBuy() and investSell() set this flag.
```

---

## Storage

### File: `~/.t2000/portfolio.json`

```json
{
  "positions": {
    "SUI": {
      "totalAmount": 105.263,
      "costBasis": 100.00,
      "avgPrice": 0.95,
      "trades": [
        {
          "id": "inv_1708300800000",
          "type": "buy",
          "amount": 105.263,
          "price": 0.95,
          "usdValue": 100.00,
          "fee": 0.00,
          "tx": "0xabc...",
          "timestamp": "2026-02-19T12:00:00Z"
        }
      ]
    }
  },
  "realizedPnL": 0.00
}
```

**Storage rules:**
- File path: `{configDir}/portfolio.json` (default `~/.t2000/portfolio.json`)
- Same pattern as `ContactManager` and `SafeguardEnforcer` — `load()` on every read to prevent stale state
- `PortfolioManager` constructor accepts optional `configDir` for testability

---

## Types

### New types in `packages/sdk/src/types.ts`

```typescript
export interface InvestmentTrade {
  id: string;
  type: 'buy' | 'sell';
  asset: string;
  amount: number;        // asset units
  price: number;         // price per unit in USD
  usdValue: number;      // total USD
  fee: number;           // swap fee in USD
  tx: string;            // Sui tx digest
  timestamp: string;     // ISO 8601
}

export interface InvestmentPosition {
  asset: string;
  totalAmount: number;   // current units held (per tracking)
  costBasis: number;     // total USD spent (buys - sells cost)
  avgPrice: number;      // weighted average buy price
  currentPrice: number;  // live price
  currentValue: number;  // totalAmount × currentPrice
  unrealizedPnL: number; // currentValue - costBasis
  unrealizedPnLPct: number;
  trades: InvestmentTrade[];
}

export interface PortfolioResult {
  positions: InvestmentPosition[];
  totalInvested: number;
  totalValue: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  realizedPnL: number;
}

export interface InvestResult {
  success: boolean;
  tx: string;
  type: 'buy' | 'sell';
  asset: string;
  amount: number;        // asset units transacted
  price: number;         // per-unit price
  usdValue: number;      // total USD
  fee: number;           // swap fee
  gasCost: number;
  gasMethod: GasMethod;
  realizedPnL?: number;  // only on sell
  position: InvestmentPosition;
}
```

### Balance extension

```typescript
export interface BalanceResponse {
  available: number;
  savings: number;
  debt: number;
  investment: number;      // ← NEW: total investment value at current prices
  investmentPnL: number;   // ← NEW: unrealized P&L
  gasReserve: GasReserve;
  total: number;            // now includes investment
  assets: Record<string, number>;
  stables: Record<string, number>;
}
```

### Safeguard extensions

```typescript
export interface SafeguardConfig {
  // ...existing fields...
  maxLeverage?: number;       // default: 5 (for Phase 17e)
  maxPositionSize?: number;   // default: 1000 (for Phase 17e)
}

// TxMetadata.operation gets: 'invest' | 'trade'
// Neither is in OUTBOUND_OPS — they don't count against maxDailySend
```

### Margin types (defined now, used in Phase 17e)

Types for `PerpsPosition`, `TradeResult`, `TradePositionsResult`, `PositionSide` are already defined in `types.ts` and exported from `index.ts` — ready for 17e to use without type changes.

---

## Constants

### `packages/sdk/src/constants.ts`

```typescript
// Asset registry — adding a new investment asset = adding one entry here.
// Cetus Aggregator v3 handles USDC ↔ asset routing automatically.
export const INVESTMENT_ASSETS = {
  SUI: SUPPORTED_ASSETS.SUI,
  BTC: SUPPORTED_ASSETS.BTC,   // wBTC (SuiBridge)
  ETH: SUPPORTED_ASSETS.ETH,   // wETH (SuiBridge)
  // Future: just add entries:
  // XAUM: { type: '0x...xaum coin type...', decimals: 6, symbol: 'XAUM', displayName: 'Gold' },
} as const;

export type InvestmentAsset = keyof typeof INVESTMENT_ASSETS;

export const PERPS_MARKETS = ['SUI-PERP'] as const;  // ready for 17e
export type PerpsMarket = (typeof PERPS_MARKETS)[number];

export const DEFAULT_MAX_LEVERAGE = 5;
export const DEFAULT_MAX_POSITION_SIZE = 1000;
export const INVEST_FEE_BPS = 0n;
export const GAS_RESERVE_MIN = 0.05;
```

### Why this scales

The Cetus Aggregator v3 (`@cetusprotocol/aggregator-sdk`) is already integrated. It takes any `from` and `target` coin type and finds the best multi-hop route.

BTC and ETH are already in the registry (`SUPPORTED_ASSETS` + `INVESTMENT_ASSETS`). Once the registry-driven code (17.9h) is done, adding any future asset is just one line per constant — no adapter code, no routing logic.

```
investBuy("BTC", $500) flow:
  1. Look up BTC coin type from INVESTMENT_ASSETS registry
  2. Call exchange(USDC → BTC) → CetusAdapter → Aggregator v3 finds best route
  3. Record trade in PortfolioManager (already multi-asset)
  4. Return InvestResult
```

### Price lookups — generalized (not SUI-specific)

Currently `getPoolPrice()` reads the SUI/USDC pool directly. For multi-asset, use `getQuote()` instead:

```typescript
// Current (SUI-specific):
const suiPrice = await swapAdapter.getPoolPrice();

// Generalized (any asset):
async function getAssetPrice(asset: string): Promise<number> {
  const quote = await swapAdapter.getQuote('USDC', asset, 1);
  return quote.expectedOutput; // 1 USDC → X asset, so price = 1/X
}
```

**For 17a:** We can keep `getPoolPrice()` since we only have SUI. But all code should be written to use the registry, not hardcode `'SUI'`, so 17b is a trivial change.

### Hardcodes to avoid in 17a implementation

| Location | Don't write | Write instead |
|----------|-------------|---------------|
| `getPortfolio()` | `pos.asset === 'SUI' ? suiPrice : 0` | `prices[pos.asset] ?? 0` (price map) |
| `balance()` | `if (pos.asset === 'SUI')` | `if (pos.asset in INVESTMENT_ASSETS)` |
| Locking guard | `asset === 'SUI'` | `asset in INVESTMENT_ASSETS` |
| Gas reserve | `walletSUI - investedSUI` | Only SUI needs gas reserve logic (SUI is the gas token — BTC/ETH don't need this) |
| MCP schema | `z.enum(['SUI'])` | `z.enum(Object.keys(INVESTMENT_ASSETS))` or dynamic |
| `getSupportedPairs` | Hardcoded `['USDC', 'SUI']` | Generate from `INVESTMENT_ASSETS` + `STABLE_ASSETS` |

---

## ⚠️ CRITICAL: SUI Investment vs Gas Reserve (Double-counting)

SUI is used for both investment and gas. Both live in the same wallet. **This creates a double-counting risk.**

### The Fix

`T2000.balance()` adjusts `gasReserve` AFTER getting portfolio data:

```typescript
// Portfolio SUI gets separated from gas SUI
const gasSui = Math.max(0, bal.gasReserve.sui - pos.totalAmount);
bal.gasReserve = { sui: gasSui, usdEquiv: gasSui * suiPrice };
bal.investment = investmentValue;
bal.total = available + savings - debt + investment + gasReserve.usdEquiv;
```

### Accounting model

| Wallet SUI | Portfolio SUI | Gas SUI | Investment Value |
|------------|--------------|---------|------------------|
| 106.12 | 105.26 | 0.86 | 105.26 × price |
| 104.50 | 105.26 | 0 | 104.50 × price (gas consumed some) |
| 0.85 | 0 | 0.85 | $0 (no investment) |

---

## MCP Tools

### Read tools (17a adds 1)

| Tool | Description |
|------|-------------|
| `t2000_portfolio` | Show investment portfolio positions and P&L |

### Write tools (17a adds 1)

| Tool | Description | dryRun |
|------|-------------|--------|
| `t2000_invest` | Buy or sell investment assets | ✅ |

### `t2000_invest` schema

```typescript
{
  action: z.enum(['buy', 'sell']),
  asset: z.enum(Object.keys(INVESTMENT_ASSETS)),  // dynamically generated: ['SUI', 'BTC', 'ETH', ...]
  amount: z.union([z.number(), z.literal('all')]),
  slippage: z.number().optional(),  // max slippage percent (default 3%)
  dryRun: z.boolean().optional(),
}
```

**Tool count: 17 → 19** (9 read + 8 write + 2 safety)

### Prompt updates

- Updated `financial-report` — added "Check investment portfolio (t2000_portfolio)"
- Updated `savings-strategy` — mention investing as alternative
- Added `investment-strategy` prompt — portfolio analysis, allocation, risk

**Prompt count: 5 → 6**

---

## Tasks

### Layer 1: Types, Constants, Error Codes (17.1–17.2)

#### 17.1 — Define investment types and error codes

**File:** `packages/sdk/src/types.ts`

- [x] Add `InvestmentTrade`, `InvestmentPosition`, `PortfolioResult`, `InvestResult`
- [x] Add `PositionSide`, `PerpsPosition`, `TradeResult`, `TradePositionsResult` (ready for 17e)
- [x] Extend `BalanceResponse` with `investment` and `investmentPnL` fields (default to `0`)
- [x] Extend `TxMetadata.operation` with `'invest' | 'trade'`

**File:** `packages/sdk/src/errors.ts`

- [x] Add error codes: `INSUFFICIENT_INVESTMENT`, `MARKET_NOT_SUPPORTED`, `LEVERAGE_EXCEEDED`, `POSITION_SIZE_EXCEEDED`, `BLUEFIN_AUTH_FAILED`, `BLUEFIN_API_ERROR`, `POSITION_NOT_FOUND`
- [x] Add error code: `INVESTMENT_LOCKED` — for send/exchange guard on invested SUI

#### 17.2 — Add investment constants

**File:** `packages/sdk/src/constants.ts`

- [x] Add `INVESTMENT_ASSETS` constant (SUI only for MVP)
- [x] Add `PERPS_MARKETS` constant
- [x] Add `DEFAULT_MAX_LEVERAGE`, `DEFAULT_MAX_POSITION_SIZE`
- [x] Add `INVEST_FEE_BPS`, `GAS_RESERVE_MIN`
- [x] Export `InvestmentAsset`, `PerpsMarket` types

### Layer 2: PerpsAdapter Interface (17.3)

#### 17.3 — Define PerpsAdapter in adapter types

**File:** `packages/sdk/src/adapters/types.ts`

- [x] Add `'perps'` to `AdapterCapability`
- [x] Define `PerpsAdapter` interface
- [x] Export from `packages/sdk/src/adapters/index.ts`

### Layer 3: Portfolio Manager (17.4)

#### 17.4 — Implement PortfolioManager

**File:** `packages/sdk/src/portfolio.ts`

- [x] `PortfolioManager` class with constructor accepting optional `configDir`
- [x] `load()` / `save()` — read/write `portfolio.json`
- [x] `recordBuy(trade)` — add to position, update cost basis + avg price
- [x] `recordSell(trade)` — reduce position, calculate realized P&L (average cost)
- [x] `getPosition(asset)` — single position by asset
- [x] `getPositions()` — all positions with amount > 0
- [x] `getRealizedPnL()` — total realized P&L
- [x] Fresh `load()` on every read

### Layer 4: SDK Integration (17.7, 17.9)

#### 17.7 — T2000 class: spot investing methods

**File:** `packages/sdk/src/t2000.ts`

- [x] Add `portfolio: PortfolioManager` property, initialize in constructor
- [x] `investBuy({ asset, usdAmount, maxSlippage })` — safeguard check, balance pre-check, swap, record, return
- [x] `investSell({ asset, usdAmount | 'all', maxSlippage })` — safeguard check, gas reserve guard, swap, record P&L, return
- [x] `getPortfolio()` — enrich positions with live prices, compute P&L

#### 17.9 — Balance and safeguard updates

**File:** `packages/sdk/src/t2000.ts`

- [x] Update `balance()` — adjust gasReserve for portfolio SUI, add investment/investmentPnL fields
- [x] Recalculate `total = available + savings - debt + investment + gasReserve.usdEquiv`

**File:** `packages/sdk/src/wallet/balance.ts`

- [x] Add `investment: 0` and `investmentPnL: 0` defaults to `queryBalance()` return

**File:** `packages/sdk/src/safeguards/types.ts`

- [x] Add `maxLeverage` and `maxPositionSize` to `SafeguardConfig`
- [x] Add `'invest' | 'trade'` to `TxMetadata.operation`

**File:** `packages/cli/src/commands/config.ts`

- [x] Add `maxLeverage` and `maxPositionSize` to `SAFEGUARD_KEYS`

### Layer 4b: Bug Fixes Found in Review (17.9c–17.9g)

> These were found during a deep code review of the existing implementation.
> Must be fixed before shipping.

#### 17.9c — Protect invested SUI from send/exchange (locking guard)

**File:** `packages/sdk/src/t2000.ts`

- [x] Add helper: `getFreeBalance(asset)` — returns `max(0, walletAmount - invested - gasReserve)` for any investment asset. Generalized beyond SUI-only.
- [x] Update `send()` — when sending any investment asset, check `amount <= free`. If not, throw `INVESTMENT_LOCKED` with message pointing to `invest sell`
- [x] Update `exchange()` — when exchanging FROM any investment asset, same check. Bypass with `_bypassInvestmentGuard` flag.
- [x] No guard needed for USDC or other stablecoins — only assets in `INVESTMENT_ASSETS`
- [x] `investBuy` and `investSell` bypass the guard — pass `_bypassInvestmentGuard: true` to `exchange()`. Not exposed in public API.

**File:** `packages/sdk/src/errors.ts`

- [x] Add `INVESTMENT_LOCKED` error code

#### 17.9d — Portfolio wallet clamping in getPortfolio()

**File:** `packages/sdk/src/t2000.ts`

- [x] Update `getPortfolio()` — fetch actual wallet balance for each investment asset
- [x] Clamp `totalAmount` to `min(tracked, max(0, walletAmount - gasReserve))` — gasReserve only for SUI
- [x] Adjust `costBasis` proportionally if clamped (so P&L stays accurate)
- [x] `balance()` also scales `costBasis` proportionally (see 17.9f)

#### 17.9e — Input validation + division-by-zero guards

**File:** `packages/sdk/src/t2000.ts`

- [x] `investBuy`: validate `usdAmount > 0` at top of method — throw `INVALID_AMOUNT` for 0, negative, or NaN
- [x] `investBuy`: guard `swapResult.toAmount === 0` after swap — throw `SWAP_FAILED` instead of computing `Infinity` price
- [x] `investSell` (specific USD amount): cap `sellAmountAsset` to `Math.min(sellAmountAsset, pos.totalAmount)` — prevent selling more than portfolio tracks
- [x] `investSell`: validate `usdAmount > 0` (when not `'all'`) — same validation as buy

**File:** `packages/cli/src/commands/invest.ts`

- [x] Validate `parseFloat(amount)` is a positive finite number before calling SDK — catch `NaN`, `0`, negatives at CLI level with clear error

#### 17.9h — Registry-driven code (no hardcoded `'SUI'`)

**File:** `packages/sdk/src/t2000.ts`

- [x] `getPortfolio()`: build a price map `Record<string, number>` for all investment assets — `getPoolPrice()` for SUI, `getQuote('USDC', asset, 1)` for others
- [x] `balance()`: loop over positions with `asset in INVESTMENT_ASSETS` check, fetch prices per-asset via `getQuote()`
- [x] Locking guard: check `asset in INVESTMENT_ASSETS` not `asset === 'SUI'`

**File:** `packages/sdk/src/adapters/cetus.ts`

- [x] `getSupportedPairs()`: generate investment asset pairs from `INVESTMENT_ASSETS` — loop: for each asset, add `{ USDC → asset }` and `{ asset → USDC }`

**File:** `packages/mcp/src/tools/write.ts`

- [x] `t2000_invest` schema: generate asset enum from `Object.keys(INVESTMENT_ASSETS)` instead of `z.enum(['SUI'])`

#### 17.9f — Fix `balance()` cost basis scaling when gas erodes investment

**File:** `packages/sdk/src/t2000.ts`

- [x] When `actualHeld < pos.totalAmount` in `balance()`, scale `costBasis` proportionally: `investmentCostBasis += pos.costBasis * (actualHeld / pos.totalAmount)`
- [x] Without this fix: `investmentPnL` was always over-negative when gas consumed investment SUI

#### 17.9g — Handle price fetch failure gracefully

> Keep it simple: no type changes. Just handle `currentPrice === 0 && totalAmount > 0` in the display layer.

**File:** `packages/cli/src/commands/portfolio.ts`

- [x] When `currentPrice === 0` and `totalAmount > 0`, show "unavailable" instead of "$0.00 (-100%)"
- [x] Added price unavailable warning banner when any position has missing price

**File:** `packages/mcp/src/tools/read.ts`

- [x] When `currentPrice === 0` and `totalAmount > 0`, add `"note": "price unavailable"` to portfolio response

**File:** `packages/sdk/src/t2000.ts`

- [x] `getPortfolio()`: when `currentPrice === 0`, set `unrealizedPnL` and `unrealizedPnLPct` to `0` (not negative costBasis)

### Layer 5: CLI Commands (17.11–17.14)

#### 17.11 — CLI: `t2000 invest` command

**File:** `packages/cli/src/commands/invest.ts`

- [x] `invest buy <amount> <asset>` — resolve PIN, create agent, call investBuy, format output
- [x] `invest sell <amount|all> <asset>` — resolve PIN, create agent, call investSell, format output
- [x] `--slippage <pct>` option (default 3%)
- [x] `--json` mode support

#### 17.12 — CLI: `t2000 portfolio` command

**File:** `packages/cli/src/commands/portfolio.ts`

- [x] Show all positions with P&L, color-coded (green = profit, red = loss)
- [x] `--json` mode support
- [x] Empty state: "No investments yet. Try: t2000 invest buy 100 SUI"

#### 17.14 — CLI: update `t2000 balance` output

**File:** `packages/cli/src/commands/balance.ts`

- [x] Add `Investment:` line showing total value and P&L percentage
- [x] Show "—" when no investment (progressive disclosure)
- [x] Update total to include investment value

### Layer 6: MCP Tools & Prompts (17.15–17.16b)

#### 17.15 — MCP: read tools

**File:** `packages/mcp/src/tools/read.ts`

- [x] `t2000_portfolio` — calls `agent.getPortfolio()`, returns positions + P&L as JSON
- [x] Tool count: 8 → 9 read tools

#### 17.16 — MCP: write tools

**File:** `packages/mcp/src/tools/write.ts`

- [x] `t2000_invest` — buy/sell with dryRun preview
- [x] Tool count: 7 → 8 write tools

**Total MCP tools: 17 → 19** (9 read + 8 write + 2 safety)

#### 17.16b — MCP: prompt updates

**File:** `packages/mcp/src/prompts.ts`

- [x] Update `financial-report` — added "Check investment portfolio (t2000_portfolio)"
- [x] Update `savings-strategy` — mention investing as alternative
- [x] Add `investment-strategy` prompt
- [x] Prompt count: 5 → 6

### Layer 7: Tests (17.17–17.19c)

#### 17.17 — SDK: PortfolioManager unit tests

**File:** `packages/sdk/src/portfolio.test.ts`

- [x] CRUD: recordBuy, recordSell, getPosition, getPositions (19 tests)
- [x] Cost basis: average cost calculation on multiple buys
- [x] P&L: realized P&L on sell, negative P&L, sell all
- [x] Edge cases: sell more than held, empty portfolio
- [x] Persistence: load/save cycle, corrupted file, missing file
- [x] Isolation: temp dirs

#### 17.18 — SDK: T2000 invest method tests (mocked adapters)

**File:** `packages/sdk/src/invest.test.ts` ← NEW (25 tests)

**investBuy validation tests:**
- [x] Rejects amount = 0 (INVALID_AMOUNT)
- [x] Rejects negative amount (INVALID_AMOUNT)
- [x] Rejects NaN amount (INVALID_AMOUNT)
- [x] Rejects Infinity amount (INVALID_AMOUNT)
- [x] Accepts valid positive amount

**investSell validation tests:**
- [x] Rejects amount = 0 (INVALID_AMOUNT)
- [x] Allows "all" without numeric validation
- [x] Caps sell to portfolio position amount

**swap-returns-zero guard:**
- [x] Detects toAmount = 0 (division by zero prevention)

**Locking guard tests:**
- [x] Blocks sending invested SUI (freeSUI calculation)
- [x] Allows sending free SUI (wallet > invested)
- [x] No guard for USDC (not investment asset)
- [x] Guard applies to all investment assets (SUI, BTC, ETH)
- [x] Blocks exchange of invested SUI
- [x] Allows exchange in buy direction (USDC→SUI unguarded)

**Portfolio wallet clamping tests:**
- [x] Clamps totalAmount when wallet < tracked
- [x] Scales costBasis proportionally when clamped
- [x] No clamping when wallet has enough

**balance() costBasis scaling tests:**
- [x] Scales costBasis when gas erodes investment SUI
- [x] Uses full costBasis when no gas erosion

**Price unavailable tests:**
- [x] Returns 0 P&L when price = 0 (not -100%)
- [x] Calculates normal P&L when price available

**Registry-driven assets tests:**
- [x] INVESTMENT_ASSETS contains SUI, BTC, ETH
- [x] Stablecoins are not investment assets
- [x] Gas reserve only applies to SUI

#### 17.19 — MCP: tool count + registration tests

**File:** `packages/mcp/src/tools/read.test.ts`, `write.test.ts`, `integration.test.ts`

- [x] Update mock agent with portfolio + getPortfolio mocks
- [x] Update expected tool counts (17 → 19)
- [x] Update expected prompt count (5 → 6)
- [x] Integration test: verify all 19 tools listed

#### 17.19c — MCP: tool behavior tests for invest/portfolio

**File:** `packages/mcp/src/tools/read.test.ts` (3 new tests)

- [x] `t2000_portfolio` — calls getPortfolio, returns positions + P&L JSON
- [x] `t2000_portfolio` — handles empty portfolio
- [x] `t2000_portfolio` — adds "price unavailable" note when currentPrice = 0

**File:** `packages/mcp/src/tools/write.test.ts` (7 new tests)

- [x] `t2000_invest` — buy dryRun returns preview (no execution)
- [x] `t2000_invest` — buy executes investBuy, returns result
- [x] `t2000_invest` — sell executes investSell, returns result
- [x] `t2000_invest` — sell "all" calls investSell with 'all'
- [x] `t2000_invest` — passes slippage to SDK when provided
- [x] `t2000_invest` — sell "all" dryRun with no position returns clear error
- [x] `t2000_invest` — buy with non-number amount returns error

### Layer 8: SDK Exports (17.19b)

#### 17.19b — Update SDK public API

**File:** `packages/sdk/src/index.ts`

- [x] Export `PortfolioManager` class
- [x] Export new types: `InvestmentTrade`, `InvestmentPosition`, `PortfolioResult`, `InvestResult`
- [x] Export new types: `PositionSide`, `PerpsPosition`, `TradeResult`, `TradePositionsResult`
- [x] Export new constants: `INVESTMENT_ASSETS`, `PERPS_MARKETS`, `DEFAULT_MAX_LEVERAGE`, `DEFAULT_MAX_POSITION_SIZE`, `GAS_RESERVE_MIN`
- [x] Export types: `InvestmentAsset`, `PerpsMarket`

### Layer 8b: MCP Tool Fixes (17.19d)

#### 17.19d — Fix MCP tool gaps

**File:** `packages/mcp/src/tools/write.ts`

- [x] Add `slippage` optional param to `t2000_invest` schema
- [x] Pass `slippage` through to `investBuy`/`investSell` calls (converted from percent to decimal)
- [x] Fix dryRun sell "all" with no position — return clear error text `"No {asset} position to sell"`

### Layer 9: Skills, Docs, Website, Marketing, Release (17.20–17.24)

#### 17.20 — Agent skill

**File:** `t2000-skills/skills/t2000-invest/SKILL.md` ← CREATE

- [x] Purpose, commands, examples for spot investing + portfolio viewing
- [x] Note: invested assets are locked — must `invest sell` to access value
- [x] Triggers: "invest in SUI", "buy SUI", "portfolio", "how much is my SUI worth"

**File:** `t2000-skills/skills/t2000-check-balance/SKILL.md` ← UPDATE

- [x] Mention investment balance line in output

**File:** `t2000-skills/skills/t2000-mcp/SKILL.md` ← UPDATE

- [x] Add `t2000_invest`, `t2000_portfolio` to tool list

#### 17.21 — Documentation updates

**Global count updates:**

| Metric | Before | After |
|--------|--------|-------|
| Accounts | 4 | 5 (+ Investment) |
| CLI commands | 27 | 29 (+ invest, portfolio) |
| MCP tools | 17 | 19 (+ t2000_invest, t2000_portfolio) |
| MCP prompts | 5 | 6 (+ investment-strategy) |
| Agent skills | 13 | 14 (+ t2000-invest) |

**Package READMEs:**
- [x] `README.md` (root) — add "Investment" to tagline, add invest examples, update counts
- [x] `packages/sdk/README.md` — add `investBuy()`, `investSell()`, `getPortfolio()` to API reference
- [x] `packages/cli/README.md` — add `invest`, `portfolio` commands to table
- [x] `packages/mcp/README.md` — add `t2000_invest`, `t2000_portfolio` to tools table, update "17 tools" → "19 tools"

**Spec & product docs:**
- [x] `PRODUCT_FACTS.md` — version 0.14.0, all counts, add invest commands + SDK methods + MCP tools, add Investment to asset table
- [x] `CLI_UX_SPEC.md` — output specs for `invest buy`, `invest sell`, `portfolio`, updated `balance` output with Investment line, send guard error format
- [x] `spec/t2000-roadmap-v2.md` — mark Phase 17a as shipped

#### 17.22 — Website updates

**File:** `apps/web/app/page.tsx` — Homepage

- [x] Add 5th account: **Investment** (buy/sell SUI, portfolio tracking, cost-basis P&L)
- [x] Update account count "04 / 04" → "01 / 05" … "05 / 05"
- [x] Update "Four accounts. One agent." → "Five accounts. One agent."
- [x] Update MCP tool counts (17 → 19)
- [x] Add Investment row to comparison table vs Coinbase
- [x] Add "Invest $100 in SUI" to "Try asking" examples
- [x] Add Investment pill to hero section

**File:** `apps/web/app/docs/page.tsx` — Docs Page

- [x] Add `invest buy`, `invest sell`, `portfolio` command cards
- [x] Add Investment row to "Concepts" accounts table (now 5 accounts)
- [x] Update "14 commands" badge to "16 commands"
- [x] Add `t2000_invest`, `t2000_portfolio` to MCP tools list
- [x] Add `investment-strategy` to prompts list
- [x] Add `t2000-invest` to skills list
- [x] Update QuickStart init output: add "✓ Investment"
- [x] Add v0.14.0 changelog entry
- [x] Update version badge

**File:** `apps/web/app/demo/demoData.ts` — Demo Terminal

- [x] Add Investment demo flow: `t2000 invest buy 100 SUI` → `t2000 portfolio` → `t2000 invest sell 50 SUI`

**File:** `apps/web/app/demo/page.tsx`

- [x] Add "investing" to page metadata description

#### 17.23 — Marketing

**File:** `marketing/marketing-plan.md`

- [x] Add Investment launch tweet: "Your agent can now invest in SUI. Portfolio tracking with cost-basis P&L. t2000 invest buy 100 SUI"
- [x] Update "4 accounts" references to "5 accounts"

**File:** `marketing/demo-video.html`

- [x] Add Investment scene to demo video (added demo data in demoData.ts)

#### 17.24 — Release

- [x] Version bump: sdk, cli, mcp → v0.14.0
- [x] Build all packages
- [x] Publish to npm
- [x] `npm run lint && npm run typecheck` passes
- [x] Git commit + push

---

## Testing Strategy

### Unit tests (PortfolioManager) — 19 tests ✅

- CRUD: recordBuy, recordSell, getPosition, getPositions
- Cost basis: average cost calculation on multiple buys at different prices
- P&L: realized P&L on sell, unrealized P&L with mock prices
- Edge cases: sell more than held, sell all, empty portfolio, negative P&L
- Persistence: load/save cycle, corrupted file handling, missing file
- Isolation: temp dirs (same pattern as contacts tests)

### SDK invest + locking + bug fix tests — ⬜ NOT YET WRITTEN (task 17.18)

- `investBuy`: exchange call, portfolio recording, InvestResult shape, input validation (0, negative, NaN), swap-returns-0 guard
- `investSell`: exchange call, realized P&L, gas reserve guard, portfolio cap, input validation
- `getPortfolio`: price enrichment, empty state, wallet clamping, costBasis scaling, price-unavailable handling
- `balance()`: investment field, SUI double-counting fix, costBasis proportional scaling
- `send()` locking: blocks invested SUI, allows free SUI, allows USDC
- `exchange()` locking: blocks invested SUI, allows free SUI, allows USDC→SUI
- Safeguards: locked rejection
- ~25 tests estimated

### MCP tool count tests — 75 tests ✅

- Updated mock agents with portfolio mocks
- Updated tool counts (17 → 19)
- Updated prompt counts (5 → 6)
- Integration test: all 19 tools and 6 prompts listed

### MCP tool behavior tests — ⬜ NOT YET WRITTEN (task 17.19c)

- `t2000_portfolio`: call + response shape, empty state
- `t2000_invest`: dryRun buy/sell, execution buy/sell, sell-all no-position edge case
- ~7 tests estimated

### SDK tests — 444 tests ✅

- All existing tests pass (no regressions)
- PortfolioManager tests included

### Manual testing (pre-release)

- Full CLI flow: invest buy → portfolio → balance → invest sell → balance
- **Locking guard: try send invested SUI → should see helpful error**
- **Locking guard: try exchange invested SUI → should see helpful error**
- **Locking guard: send free SUI (received from others) → should work**
- Safeguard enforcement: locked, maxPerTx
- Balance display: verify SUI split between Investment and Gas tiers
- Claude Desktop: natural language invest commands
- Existing commands still work: send, save, exchange, rebalance, balance

---

## Cross-cutting Concerns

### Existing `positions` command stays lending-only

`t2000 positions` and `t2000_positions` continue to show savings/borrows only. Investment has its own `t2000 portfolio` / `t2000_portfolio`.

### `exchange` command — guarded for SUI sells

`t2000 exchange 100 USDC SUI` — works normally (buying SUI via exchange, resulting SUI is free/untracked).

`t2000 exchange 50 SUI USDC` — **guarded**. If 50 SUI is invested, this is blocked with a message pointing to `invest sell`. Only free SUI can be exchanged.

Why: `exchange` is a utility swap with no portfolio tracking. If we let users exchange invested SUI, the portfolio goes out of sync and the investment tracking becomes meaningless.

### `send` command — guarded for SUI

`t2000 send 100 USDC to alice` — works normally. USDC is not an investment asset.

`t2000 send 5 SUI to alice` — **guarded**. Only free SUI (wallet - invested - gas reserve) can be sent. If the user tries to send more, they get a helpful error.

### `invest buy` vs `exchange` — intentional distinction

| Command | Swap | Portfolio tracked? | Resulting SUI |
|---------|------|--------------------|---------------|
| `t2000 invest buy 100 SUI` | USDC → SUI | Yes | Locked (invested) |
| `t2000 exchange 100 USDC SUI` | USDC → SUI | No | Free (sendable) |

Both use CetusAdapter. The difference is intent: invest = tracked position with locking; exchange = utility swap.

### Existing save/withdraw/borrow/repay/rebalance unaffected

These only operate on stablecoins and lending positions. No interaction with investment SUI.

### BalanceResponse backward compatibility

New fields `investment` and `investmentPnL` default to `0`. Existing consumers won't break. The `total` formula changes to include investment, which is correct.

### SDK events fire automatically

`investBuy` and `investSell` call `exchange()` internally. The existing `balanceChange` event fires from the swap.

---

## Investment Roadmap — All Phases

```
Phase 17a (now)     Direct Investing — SUI only                    ~done
                    Buy/sell SUI, portfolio tracking, locking, P&L
                    Foundation for everything else

Phase 17b ✅        Multi-Asset — BTC, ETH — Shipped (v0.14.1)
                    wBTC + wETH via SuiBridge, Cetus Aggregator v3 routing
                    formatAssetAmount() for asset-aware decimals
                    CLI/SDK/MCP all support BTC and ETH
                    Future: XAUM, native BTC (Hashi), more assets

Phase 17c           Yield on Investment Assets                      ~3-5 days
                    invest earn / invest unearn commands
                    Expand NAVI + Suilend adapters for SUI/ETH/XAUM
                    Create BluefinLendingAdapter (stablecoins + assets)
                    Rebalance expanded for investment asset yield
                    Bluefin lending also benefits stablecoin savings
                    Borrow guard: exclude investment collateral from borrow()

Phase 17d           Baskets + Auto-Invest — Agent-driven            ~2-3 days
                    Themed baskets (Bluechip/L1, DeFi, Memecoin, etc.)
                    DCA scheduling ($50/week)
                    Agent rebalancing to target weights
                    Mostly prompt engineering + BasketConfig type
                    Requires: multi-asset (17b)

Phase 17e           Margin Trading — Bluefin perps                  ~1-2 weeks
                    Long/short with leverage
                    BluefinPerpsAdapter (separate from lending)
                    Bluefin REST API integration (discovery first)
                    Separate spec: phase17e-margin-build-plan.md

Phase 17f           Securities-Backed Lending                       ~1 week
                    Borrow USDC against investment portfolio
                    Conservative 15-20% max LTV (vs protocol's 60-75%)
                    Agent health monitoring + auto-repay trigger
                    Must repay before selling (position lock)
                    Premium feature — tradfi equivalent of margin lending
```

### Why this order

1. **Multi-asset (17b)** — coin types for BTC (wBTC via SuiBridge) and ETH (wETH via SuiBridge) are already in the registry. 17b enables them in CLI/MCP, tests Cetus routing, and ships the /invest page. ~1 day. Future assets (XAUM, native BTC via Hashi, etc.) are one line each.
2. **Yield on assets (17c)** — natural next step: "I bought SUI, now I want it earning." NAVI and Suilend already support SUI lending on-chain — we just expand `supportedAssets`. Bluefin Lending is a new `LendingAdapter` that also gives stablecoin savings a third yield source. Includes a critical borrow guard to prevent borrowing against investment collateral until 17f.
3. **Baskets (17d)** — requires multi-asset. Showcases the AI agent's unique value: "invest in Layer 1s" with one command. Mostly prompt engineering, not new infrastructure.
4. **Margin (17e)** — complex Bluefin *perps* integration (completely separate from Bluefin *lending*). API discovery, risk management. Smaller audience (advanced traders). Higher effort, lower reach.
5. **Securities-backed lending (17f)** — unlocks borrow capacity against investments with strict guardrails. Conservative 15-20% LTV, agent health monitoring, auto-repay. Premium feature that requires yield infrastructure (17c) and careful risk management.

### Bluefin — two separate integrations

Bluefin offers two distinct products that map to two different adapter types:

```
┌──────────────────────────────────────────────────────────────────┐
│                         Bluefin                                  │
├─────────────────────────────┬────────────────────────────────────┤
│  Bluefin Lending            │  Bluefin Perps                     │
│  ─────────────────          │  ─────────────────                 │
│  Deposit assets, earn yield │  Leveraged long/short trading      │
│  Stablecoins + SUI/BTC/ETH │  Perpetual futures                 │
│                             │                                    │
│  Adapter: LendingAdapter    │  Adapter: PerpsAdapter             │
│  Same interface as NAVI     │  Different interface entirely      │
│  Phase 17c                  │  Phase 17e                         │
│                             │                                    │
│  Benefits both:             │  Advanced traders only             │
│  • Savings (stablecoins)    │                                    │
│  • Investment (assets)      │                                    │
└─────────────────────────────┴────────────────────────────────────┘
```

These are independent integrations. Bluefin Lending ships in 17c (yield). Bluefin Perps ships in 17e (margin). Neither depends on the other.

### Multi-Asset Scaling (Phase 17b)

> **Status:** Shipped (v0.14.1). BTC and ETH fully enabled in CLI/SDK/MCP. Cetus Aggregator v3 routing tested. Asset-aware `formatAssetAmount()` utility added. Docs and marketing updated.

**Assets in registry (today):**

| Asset | Coin type | Source | Decimals |
|-------|-----------|--------|----------|
| SUI | `0x2::sui::SUI` | Native | 9 |
| BTC | `0xaafb102d...::btc::BTC` | wBTC (SuiBridge) | 8 |
| ETH | `0xd0e89b2a...::eth::ETH` | wETH (SuiBridge) | 8 |

**What 17b shipped (v0.14.1):**

```
[x] Cetus Aggregator v3 routing for USDC↔BTC and USDC↔ETH — tested and working
[x] Portfolio display for multi-asset with asset-aware decimals
[x] formatAssetAmount() utility — 8 decimals for BTC/ETH, 9 for SUI, 6 for stablecoins
[x] CLI invest buy/sell supports BTC and ETH
[x] SDK investBuy/investSell supports BTC and ETH
[x] MCP t2000_invest schema dynamically includes BTC and ETH
[x] Docs + marketing updates
```

**Adding future assets (XAUM, native BTC via Hashi, etc.):** one line in `SUPPORTED_ASSETS` + one line in `INVESTMENT_ASSETS`. Cetus Aggregator v3 `findRouters()` handles routing automatically.

### Yield on Investment Assets (Phase 17c)

#### How it works

Yield on investment assets uses the **same `LendingAdapter` interface** as stablecoin savings. On-chain, NAVI and Suilend already support SUI lending — the adapters just restrict `supportedAssets` to `STABLE_ASSETS` today. The change is expanding what assets we allow through.

```
                    Stablecoins              Investment assets
                    (USDC, USDT, etc.)       (SUI, ETH, XAUM)
                    ─────────────────        ─────────────────
save/unsave         ✅ Today                 ❌ Not applicable
                    NAVI + Suilend           (use invest earn instead)

invest earn/unearn  ❌ Not applicable        ✅ Phase 17c
                    (use save instead)       NAVI + Suilend + Bluefin Lending

rebalance           ✅ Today (stablecoins)   ✅ Phase 17c (investment assets too)
                    Best APY across          Best APY across all 3
                    NAVI + Suilend           protocols for each asset
```

`save` = stablecoins into lending (checking → savings). Unchanged.
`invest earn` = investment assets into lending. New in 17c.
`rebalance` evolves to optimize both.

#### User flow

```
# Step 1: User buys SUI
t2000 invest buy 100 SUI
→ $100 USDC swapped to ~25 SUI via Cetus
→ Portfolio: 25 SUI, cost basis $100, locked

# Step 2: User earns yield on invested SUI
t2000 invest earn SUI
→ System queries NAVI, Suilend, Bluefin lending rates for SUI
→ Picks best APY (e.g. Bluefin at 5.2%)
→ Deposits invested SUI into Bluefin lending
→ Portfolio: 25 SUI, earning 5.2% APY (Bluefin)
→ SUI still "invested", still "locked" — now also earning

# Step 3: User checks portfolio
t2000 portfolio
┌─────────┬──────────┬─────────┬──────────────────────┐
│ Asset   │ Value    │ P&L     │ Yield                │
├─────────┼──────────┼─────────┼──────────────────────┤
│ SUI     │ $120.00  │ +20.0%  │ 5.2% APY (Bluefin)   │
└─────────┴──────────┴─────────┴──────────────────────┘

# Step 4a: User sells — auto-withdraws from lending
t2000 invest sell 50 SUI
→ Detects SUI is in Bluefin lending
→ Auto-withdraws needed amount
→ Swaps SUI → USDC
→ Portfolio updated

# Step 4b: Or user just stops earning
t2000 invest unearn SUI
→ Withdraw from lending, SUI back in wallet
→ Still tracked as investment, still locked
```

#### What changes

| Change | Details |
|--------|---------|
| **NAVI adapter** | Expand `supportedAssets` to include investment assets (SUI, ETH, XAUM). On-chain support already exists. |
| **Suilend adapter** | Same — expand `supportedAssets`. On-chain support already exists. |
| **BluefinLendingAdapter** (new) | Implements `LendingAdapter`. Supports stablecoins AND investment assets. Gives savings a third yield source too. |
| **`invest earn` command** | Calls `buildSaveTx` on best-rate lending adapter for the investment asset. |
| **`invest unearn` command** | Calls `buildWithdrawTx` to withdraw from lending, asset stays in investment. |
| **PortfolioManager** | Tracks earning state: `{ earning: true, protocol: 'bluefin', apy: 5.2 }` per position. |
| **`invest sell` auto-withdraw** | If asset is in lending, withdraw first, then swap to USDC. |
| **`rebalance` expanded** | Optimizes yield across all lending protocols for both stablecoins AND investment assets. |
| **Borrow guard** | `borrow()` must exclude investment collateral from available borrow capacity. Only savings (stablecoin) deposits count as borrowable collateral until Phase 17f explicitly unlocks securities-backed lending with guardrails. |

#### Locking model

Invested assets stay locked whether held or earning:

```
Investment (wallet)  ──invest earn──→  Investment (earning yield)
       │                                      │
       │ locked (can't send/exchange)         │ locked (can't send/exchange)
       │                                      │
       └──invest sell──→ USDC           ←──invest sell──┘
                                         (auto-withdraws first)
```

The locking guard doesn't change — it checks portfolio tracked amounts, not where the asset physically sits.

### Yield architecture — complete picture

```
Checking (USDC) ──save──→ Savings (stablecoin yield)
                           ├─ NAVI          (today)
                           ├─ Suilend       (today)
                           └─ Bluefin Lend  (Phase 17c — also benefits savings)

Investment (assets) ──invest earn──→ Earning (asset yield + price exposure)
                                     ├─ NAVI SUI lending    (Phase 17c)
                                     ├─ Suilend SUI lending (Phase 17c)
                                     └─ Bluefin lending     (Phase 17c)
```

All three lending protocols serve both stablecoins and investment assets. `rebalance` optimizes yield across all of them for any asset type.

### Borrow guard (Phase 17c — critical safety measure)

When investment assets are deposited into NAVI/Suilend/Bluefin via `invest earn`, the user automatically gains borrow capacity on-chain. Without a guard, the existing `borrow` command could let users borrow against investment collateral — creating liquidation risk on a "banking" product.

**The guard:** `borrow()` calculates available capacity based on **savings deposits only** (stablecoins), explicitly excluding any investment asset collateral. The on-chain capacity exists, but the SDK doesn't expose it.

```
# What the protocol sees (on-chain):
Total collateral = $500 USDC (savings) + $1,000 SUI (investment)
Available borrow = ~$900 (60% LTV)

# What t2000 allows (SDK guard):
Borrowable collateral = $500 USDC (savings only)
Available borrow = ~$300 (60% LTV on savings only)
Investment collateral = excluded until Phase 17f
```

**Implementation:** In `T2000.borrow()` and `T2000.maxBorrowable()`, filter `getPositions()` to only count stablecoin supplies when calculating available borrow capacity. Investment asset supplies are ignored for borrow math. The health factor display (`t2000 health`) should clarify which collateral is borrowable vs locked.

### Securities-Backed Lending (Phase 17f — future)

Borrow USDC against your investment portfolio without selling. The tradfi equivalent of margin lending / securities-backed lines of credit (Schwab Pledged Asset Line, Interactive Brokers margin).

#### Guardrails

| Guardrail | Value | Rationale |
|-----------|-------|-----------|
| **Max LTV** | 15-20% | Protocol allows 60-75%. Our conservative limit means SUI would need to drop 75%+ before liquidation risk. |
| **Borrow asset** | Stablecoins only (USDC) | No borrowing volatile assets against volatile collateral. |
| **Health floor** | 3.0+ | Agent warns at 3.0, blocks new borrows below 3.5. Protocol liquidates at 1.0. |
| **Auto-repay trigger** | Health < 2.5 | Agent auto-repays from checking balance (USDC) if health drops. |
| **Hard cap** | 20% of investment position value | Even if protocol allows more, SDK blocks it. |
| **Position lock** | Can't `invest sell` while borrowed | Must repay first — like real margin accounts. |

#### What 15-20% LTV means in practice

```
User has $1,000 of SUI invested and earning yield
→ Max borrow: $150-200 USDC (15-20% LTV)
→ SUI drops 50%: investment = $500, health still safe (~3.0)
→ SUI drops 75%: investment = $250, auto-repay triggers
→ Liquidation only if SUI drops ~85%+ AND auto-repay fails
```

#### User flow

```
# User has SUI earning yield
t2000 portfolio
│ SUI  │ $1,000  │ +15%  │ 4.8% APY (NAVI)  │

# User borrows against investments
t2000 borrow 150 --from investment
→ "Borrowing $150 USDC against your $1,000 SUI investment"
→ "Loan-to-value: 15% (max 20%)"
→ "Your SUI stays invested and earning yield"
→ "Auto-repay enabled if health drops below 2.5"

# Agent monitors health continuously
t2000 health
→ Health factor: 4.2 (safe)
→ Savings collateral: $500 USDC
→ Investment collateral: $1,000 SUI (15% utilized)
→ Total borrowed: $150 USDC
→ Auto-repay: enabled (trigger at 2.5)

# User must repay before selling
t2000 invest sell 500 SUI
→ "Cannot sell — $150 USDC borrowed against investment."
→ "Run `t2000 repay 150` first, then sell."
```

#### Why this is separate from 17c

The borrow guard in 17c (exclude investment collateral) is a safety wall. 17f carefully opens a door in that wall with strict guardrails. Shipping yield (17c) without securities-backed lending is the safe default — users earn yield, no liquidation risk. 17f is a premium feature that adds value but only when the guardrail infrastructure is properly built and tested.

---

## Website: Dedicated /invest Page vs Homepage Section

**Decision: Add a prominent section to homepage for 17a. Dedicated /invest page for 17b+ (multi-asset + yield).**

**Rationale:**
- 17a has one asset (SUI) — a full page for one asset feels thin
- The homepage already has the account tier cards — Investment is the 5th card
- When 17b ships (BTC, ETH) and 17c adds yield, there's enough content for a dedicated page: listed assets, live prices, yield rates, risk levels
- The docs page already serves as the deep-dive for commands/tools

**Homepage Investment card content:**

```
05 / 05 — Investment

Buy and sell crypto assets with full portfolio tracking.
Cost-basis P&L, locked positions, and real-time pricing.

t2000 invest buy 100 SUI

Your agent tracks every trade — average cost, unrealized P&L,
realized gains. Invested assets are locked until sold back to
USDC, just like stocks in a brokerage.
```

**Future /invest page (17b+) would include:**
- Listed assets with live prices and 24h change
- Yield rates across NAVI / Suilend / Bluefin for each asset
- Portfolio overview dashboard
- "How it works" — buy → earn → sell flow
- Risk disclosures
- Comparison vs Coinbase/Robinhood

---

## Over-engineering Check

> Things we intentionally kept simple for 17a:

| Could over-engineer | What we're doing instead |
|---------------------|--------------------------|
| Add `priceAvailable: boolean` to `InvestmentPosition` type | Handle `currentPrice === 0` in display layer only (CLI + MCP). No type changes. |
| Build full price service for multi-asset | Use `getPoolPrice()` for SUI (already exists). Price map pattern ready in code but only SUI for now. |
| On-chain investment locking (smart contract) | Software guard in SDK. SUI stays in wallet, tracked locally. |
| Basket/DCA infrastructure | Deferred to 17d. Just prompts + scheduling, not new SDK methods. |
| Multi-protocol yield comparison for investment assets | Deferred to 17c. Savings already compares NAVI + Suilend. |
| Transaction log / recovery for failed portfolio writes | Accept filesystem inconsistency for v1. No money lost on-chain. |
| File locking on portfolio.json | Accept for v1 — single-user product. |
| Rich dryRun with quote/price/impact | Keep simple preview: show amount, balance, current position. Enhancement for later. |

---

## Bugs Found in Code Review

> Deep review of the existing implementation revealed these issues.
> All must be fixed before v0.14.0 release (tasks 17.9c–17.9g).

### HIGH severity

| Bug | Location | Impact | Fix |
|-----|----------|--------|-----|
| **Division by zero** | `investBuy`: `price = usdAmount / swapResult.toAmount` | If swap returns 0 tokens, price = `Infinity`. Portfolio corrupted: `avgPrice` becomes `NaN`, cost basis inflates | Guard: throw `SWAP_FAILED` if `toAmount === 0` |
| **No input validation** | `investBuy` + `investSell` | Amount `0`, `-100`, `NaN` all pass through to DEX with cryptic errors | Validate `amount > 0 && isFinite(amount)` at SDK level + CLI level |
| **Send/exchange bypass** | `send()` and `exchange()` have no portfolio awareness | User can `send 50 SUI` or `exchange 50 SUI USDC` which desyncs portfolio permanently | Add locking guard (task 17.9c) |

### MEDIUM severity

| Bug | Location | Impact | Fix |
|-----|----------|--------|-----|
| **investSell exceeds position** | `investSell` specific USD amounts not bounded by `pos.totalAmount` | Can sell 200 SUI when portfolio tracks 50. P&L is wrong (proceeds from 200 vs cost of 50) | Cap: `sellAmountAsset = Math.min(sellAmountAsset, pos.totalAmount)` |
| **balance() P&L wrong after gas erosion** | `balance()` uses full `costBasis` when `actualHeld < totalAmount` | If gas ate 50 of 100 invested SUI, P&L says `50*price - costBasis(100)` — always shows exaggerated loss | Scale: `costBasis *= (actualHeld / totalAmount)` |
| **Price unavailable = -100% loss** | `getPortfolio()` sets `suiPrice = 0` on network error | Portfolio shows `currentValue: $0, unrealizedPnL: -$100` when price just couldn't be fetched | Distinguish "price unavailable" from "value is zero" |

### LOW severity (defensive)

| Bug | Location | Impact | Fix |
|-----|----------|--------|-----|
| **recordSell P&L mismatch** | `PortfolioManager.recordSell` caps `sellAmount` but uses full `trade.usdValue` | If defensive cap triggers, P&L is inflated. Won't trigger in practice (SDK pre-validates), but latent | Accepted risk — SDK prevents this path |
| **Swap succeeds, portfolio write fails** | `investBuy`/`investSell` — swap is on-chain, `recordBuy()`/`recordSell()` is filesystem | If disk write fails after swap, portfolio is permanently desynced. No money lost on-chain. | Accept for v1 — could add tx-log recovery later |
| **Portfolio.json file contention** | Concurrent MCP server + CLI could race on read/write | Could lose a trade record under concurrent access | Accept for v1 — single-user product |
| **Trade ID collisions** | `inv_${Date.now()}` — two trades in same ms get same ID | IDs aren't used for dedup (array-appended), so no data corruption | Accept — cosmetic |

---

## Backend / Server / Indexer — No Changes Needed

| Component | Status | Why |
|-----------|--------|-----|
| **Prisma schema** | ✅ No change | Investment tracked in local `portfolio.json`, not DB |
| **Indexer** | ✅ No change | Spot invest = Cetus swaps (already classified) |
| **YieldSnapshotter** | ✅ No change (17a) | Investment SUI doesn't earn yield until Phase 17c |
| **EventParser** | ✅ No change | Cetus descriptor already handles swap classification |
| **Stats API** | ✅ No change | Swaps appear as Cetus trades |
| **Gas Station** | ✅ No change | No impact on gas sponsorship |

---

## Dependencies

### No new npm dependencies

Reuses existing CetusAdapter. Zero new packages.

---

## Summary

| Metric | Before | After |
|--------|--------|-------|
| Account tiers | 4 | 5 (+ Investment) |
| MCP tools | 17 | 19 |
| MCP prompts | 5 | 6 |
| CLI commands | 27 | 29 |
| Agent skills | 13 | 14 |
| SDK tests | 425 | ~469 (+19 portfolio + ~25 invest/locking) |
| MCP tests | 72 | ~82 (+~7 behavior + count updates) |
| Bugs fixed | — | 6 (3 high, 3 medium) |
| Docs updated | — | 14 files |
| Version | v0.13.1 | v0.14.0 |
