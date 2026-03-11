# Phase 17 — Investment Account Build Plan

**Goal:** Add a 5th account tier — Investment — enabling spot investing and margin trading. Users can buy/sell crypto assets and open leveraged positions through natural language.

**Scope:** Phase 17a (Spot Investing) + Phase 17b (Margin Trading) shipped together.

**MVP Asset:** SUI only (spot). SUI-PERP (margin). BTC/ETH/XAUM added in Phase 17c.

**Estimated total:** 2–3 weeks

**Version bump:** v0.13.0 → v0.14.0 (minor — new feature, no breaking changes)

---

## Design Principle

**Think in dollars. Track everything. Zero friction.**

| Principle | Implementation |
|-----------|---------------|
| Dollar-denominated | `t2000 invest buy 100 SUI` = invest $100 in SUI |
| Cost-basis tracking | Local `portfolio.json` tracks every buy/sell |
| Live P&L | Real-time prices from Cetus pool |
| Unified balance | Investment shows alongside checking, savings, credit |
| Same safeguards | `maxPerTx`, lock, existing limits all apply |
| Progressive disclosure | `invest` (simple spot) vs `trade` (advanced margin) |
| Reuse infrastructure | Spot uses existing CetusAdapter — no new protocol integration |
| Separate concerns | Spot = on-chain wallet. Margin = Bluefin exchange. |

---

## What's in vs what's deferred

| Feature | v1 (this phase) | v2 (later) |
|---------|-----------------|------------|
| Spot buy/sell SUI | ✅ | — |
| Portfolio tracking (cost basis, P&L) | ✅ | — |
| Balance tier integration (investment line) | ✅ | — |
| Margin trading (Bluefin perps) | ✅ | — |
| Position management (long/short/close) | ✅ | — |
| Investment safeguards (maxLeverage, maxPositionSize) | ✅ | — |
| MCP tools (`t2000_invest`, `t2000_portfolio`, `t2000_trade`) | ✅ | — |
| Agent skill | ✅ | — |
| Spot: BTC, ETH, XAUM | — | ⬜ Phase 17c (add to INVESTMENT_ASSETS) |
| DCA (dollar-cost averaging) | — | ⬜ Agent-driven (agent schedules buys) |
| Yield vaults (Ember) | — | ⬜ Phase 17d |
| Earn on holdings (lend BTC/SUI) | — | ⬜ Phase 17d |
| Funding rate display | — | ⬜ Add `getFundingRate()` when needed |
| Bluefin ProtocolDescriptor (indexer) | — | ⬜ For proper tx classification |
| Investment DB tracking (server) | — | ⬜ If we need cross-agent analytics |
| Options / structured products | — | ⬜ Future |
| RWA / equities | — | ⬜ Future |

---

## Account Tier Model

```
┌─────────────────────────────────────────────────────┐
│  t2000 Balance                                      │
├─────────────────────────────────────────────────────┤
│  Available:  $85.81  (checking — spendable)         │
│  Savings:    $5.00   (earning 4.99% APY)            │
│  Credit:     -$1.00  (borrowed @ 7.73% APR)         │
│  Investment: $100.00 (105 SUI, +2.1%)               │ ← NEW
│  Gas:        0.81 SUI (~$0.78)                      │
│  ──────────────────────────────────────              │
│  Total:      $190.59                                │
└─────────────────────────────────────────────────────┘
```

---

## CLI UX

### Spot Investing

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

### Margin Trading

```bash
# Open positions — margin amount in USD, leverage as multiplier
t2000 trade long SUI 100 3x      # Long SUI-PERP with $100 margin at 3x
t2000 trade short SUI 200 2x     # Short SUI-PERP with $200 margin at 2x

# Close
t2000 trade close SUI             # Close SUI-PERP position

# View
t2000 trade positions             # Show all open perp positions
```

#### Trade long output
```
  ✓ Opened SUI-PERP Long
    Margin:         $100.00
    Leverage:       3x
    Position size:  $300.00
    Entry price:    $0.95
    Liq. price:     $0.63
    Tx: https://suiscan.xyz/mainnet/tx/...
```

#### Trade positions output
```
  Margin Positions (Bluefin)
  ─────────────────────────────────────────────────────
  SUI-PERP   LONG   3x   Entry: $0.95   Mark: $0.97
             Margin: $100   Size: $300   PnL: +$6.32 (+6.3%)
  ─────────────────────────────────────────────────────
  Total margin:     $100.00
  Unrealized P&L:   +$6.32
```

---

## Architecture

### Phase 17a: Spot Investing

**No new protocol integrations.** Reuses existing CetusAdapter for swaps. New code is:

1. `PortfolioManager` — local file tracking (cost basis, trades, P&L)
2. `investBuy()` / `investSell()` on `T2000` class — thin wrappers around `exchange()` + portfolio tracking
3. `portfolio()` on `T2000` class — portfolio + live prices
4. Updated `balance()` — adds investment tier

```
investBuy flow:
  1. enforcer.assertNotLocked()
  2. enforcer.check({ operation: 'invest', amount })
  3. Pre-check: query balance, verify available >= usdAmount
  4. Get SUI price from CetusAdapter.getPoolPrice()
  5. Execute swap via exchange() method (USDC → SUI) — reuses existing infrastructure
  6. Record trade in PortfolioManager
  7. Return InvestResult

investSell flow:
  1. enforcer.assertNotLocked()
  2. Check portfolio has position for asset
  3. Query ACTUAL on-chain wallet SUI balance (not portfolio tracking)
  4. Guard: wallet_SUI - GAS_RESERVE_MIN (0.05) ≥ sell_amount_in_SUI
  5. Execute swap via exchange() method (SUI → USDC) — reuses existing infrastructure
  6. Record trade in PortfolioManager (with realized P&L via average cost)
  7. Return InvestResult
```

### Phase 17b: Margin Trading

**New protocol integration:** Bluefin Pro exchange.

#### ⚠️ Bluefin SDK Version Conflict

Bluefin Pro SDK (`@bluefin-exchange/pro-sdk@1.13.0`) has peer dependency `@mysten/sui ^1.28.2` (v1.x).
Our SDK uses `@mysten/sui ^2.6.0` (v2.x). These are **incompatible**.

**Recommended approach — REST API direct:**

| Approach | Pros | Cons |
|----------|------|------|
| ~~SDK + override~~ | Less code | Version conflict, fragile, breaks on SDK updates |
| **REST API direct** | Clean deps, full control, no version headaches | More upfront work, need to implement auth |
| SDK in isolated pkg | Works for sure | Complex monorepo setup, duplicate Sui deps |

The Bluefin SDK is an OpenAPI client wrapper. We implement:
1. **Auth** — Sign requests with our Ed25519Keypair (replicate `BluefinRequestSigner` pattern)
2. **Deposit/Withdraw** — Build Sui transactions directly (we already know how to do this)
3. **Trading** — REST API calls via fetch/axios to Bluefin endpoints
4. **Positions** — REST API calls for account data

This gives us zero new dependencies and complete control.

```
tradeLong flow:
  1. enforcer.assertNotLocked()
  2. enforcer.check({ operation: 'trade', amount })
  3. Check maxLeverage safeguard
  4. Check Bluefin exchange balance, deposit more USDC if needed
  5. Create order via Bluefin REST API (market order, long)
  6. Return TradeResult with position details

tradeClose flow:
  1. enforcer.assertNotLocked()
  2. Get position from Bluefin API
  3. Place closing order
  4. Withdraw USDC back to checking wallet
  5. Return TradeResult with P&L
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
export type InvestmentAsset = 'SUI'; // Expand: 'BTC' | 'ETH' | 'XAUM' in Phase 17c

export interface InvestmentTrade {
  id: string;
  type: 'buy' | 'sell';
  asset: InvestmentAsset;
  amount: number;        // asset units
  price: number;         // price per unit in USD
  usdValue: number;      // total USD
  fee: number;           // swap fee in USD
  tx: string;            // Sui tx digest
  timestamp: string;     // ISO 8601
}

export interface InvestmentPosition {
  asset: InvestmentAsset;
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
  asset: InvestmentAsset;
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

### New types for margin trading

```typescript
export type PerpsMarket = 'SUI-PERP'; // Expand later

export type PositionSide = 'long' | 'short';

export interface PerpsPosition {
  market: PerpsMarket;
  side: PositionSide;
  margin: number;        // USD margin
  leverage: number;
  size: number;          // notional size in USD
  entryPrice: number;
  markPrice: number;
  liquidationPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
}

export interface TradeResult {
  success: boolean;
  action: 'open' | 'close';
  market: PerpsMarket;
  side: PositionSide;
  margin: number;
  leverage: number;
  size: number;
  entryPrice: number;
  liquidationPrice?: number;
  realizedPnL?: number;  // only on close
  tx?: string;           // deposit/withdraw tx if applicable
}

export interface TradePositionsResult {
  positions: PerpsPosition[];
  totalMargin: number;
  totalUnrealizedPnL: number;
}
```

### Safeguard extensions

```typescript
export interface SafeguardConfig {
  locked: boolean;
  maxPerTx: number;
  maxDailySend: number;
  dailyUsed: number;
  dailyResetDate: string;
  maxLeverage?: number;       // default: 5 (max 5x leverage on perps)
  maxPositionSize?: number;   // default: 1000 (max $1000 per perp position)
}

// TxMetadata.operation gets two new values:
// 'invest' | 'trade'
```

`invest` and `trade` are NOT in `OUTBOUND_OPS` — they use `assertNotLocked()` + `maxPerTx` check only. They don't count against `maxDailySend` (which tracks outbound payments to other addresses).

---

## New adapter: PerpsAdapter

### `packages/sdk/src/adapters/types.ts`

```typescript
export type AdapterCapability = 'save' | 'withdraw' | 'borrow' | 'repay' | 'swap' | 'perps';

// FundingRate deferred to v2

export interface PerpsAdapter {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly capabilities: readonly AdapterCapability[];
  readonly supportedMarkets: readonly string[];

  init(keypair: Ed25519Keypair, network: 'mainnet' | 'testnet'): Promise<void>;

  getAccountBalance(address: string): Promise<number>;
  getPositions(address: string): Promise<PerpsPosition[]>;
  getMarketPrice(market: string): Promise<number>;

  deposit(amount: number): Promise<string>;     // returns tx digest
  withdraw(amount: number): Promise<string>;     // returns tx digest

  openPosition(params: {
    market: string;
    side: PositionSide;
    margin: number;
    leverage: number;
  }): Promise<TradeResult>;

  closePosition(market: string): Promise<TradeResult>;

  // v2: getFundingRate(market: string): Promise<FundingRate>;
}
```

### ProtocolRegistry extension

```typescript
// registry.ts additions
private perps: Map<string, PerpsAdapter> = new Map();

registerPerps(adapter: PerpsAdapter): void
getPerps(id: string): PerpsAdapter | undefined
listPerps(): PerpsAdapter[]
```

---

## Constants

### `packages/sdk/src/constants.ts`

```typescript
export const INVESTMENT_ASSETS = {
  SUI: SUPPORTED_ASSETS.SUI,
  // Phase 17c additions:
  // BTC: { type: '0x...', decimals: 8, symbol: 'BTC', displayName: 'Bitcoin' },
  // ETH: { type: '0x...', decimals: 8, symbol: 'ETH', displayName: 'Ethereum' },
  // XAUM: { type: '0x...', decimals: 6, symbol: 'XAUM', displayName: 'Gold' },
} as const;

export type InvestmentAsset = keyof typeof INVESTMENT_ASSETS;

export const PERPS_MARKETS = ['SUI-PERP'] as const;
export type PerpsMarket = (typeof PERPS_MARKETS)[number];

export const DEFAULT_MAX_LEVERAGE = 5;
export const DEFAULT_MAX_POSITION_SIZE = 1000; // $1000

export const INVEST_FEE_BPS = 0n; // no additional fee beyond Cetus swap fee
```

---

## SDK Methods

### T2000 class additions

```typescript
// Properties
readonly portfolio: PortfolioManager;

// Spot investing
async investBuy(params: { asset: InvestmentAsset; usdAmount: number; maxSlippage?: number }): Promise<InvestResult>
async investSell(params: { asset: InvestmentAsset; usdAmount: number | 'all'; maxSlippage?: number }): Promise<InvestResult>
async getPortfolio(): Promise<PortfolioResult>

// Margin trading
async tradeLong(params: { market: PerpsMarket; margin: number; leverage: number }): Promise<TradeResult>
async tradeShort(params: { market: PerpsMarket; margin: number; leverage: number }): Promise<TradeResult>
async tradeClose(params: { market: PerpsMarket }): Promise<TradeResult>
async tradePositions(): Promise<TradePositionsResult>
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

---

## MCP Tools

### Read tools

| Tool | Description |
|------|-------------|
| `t2000_portfolio` | Show investment portfolio positions and P&L |
| `t2000_trade_positions` | Show open margin/perp positions |

### Write tools

| Tool | Description | dryRun |
|------|-------------|--------|
| `t2000_invest` | Buy or sell investment assets | ✅ |
| `t2000_trade` | Open or close margin positions | ✅ |

### `t2000_invest` schema

```typescript
{
  action: z.enum(['buy', 'sell']),
  asset: z.enum(['SUI']),         // expand with Phase 17c
  amount: z.union([z.number(), z.literal('all')]),
  dryRun: z.boolean().optional(),
}
```

### `t2000_trade` schema

```typescript
{
  action: z.enum(['long', 'short', 'close']),
  market: z.enum(['SUI-PERP']),
  margin: z.number().optional(),     // required for long/short
  leverage: z.number().optional(),   // required for long/short
  dryRun: z.boolean().optional(),
}
```

---

## Safeguard Integration

| Operation | assertNotLocked | maxPerTx | maxDailySend | maxLeverage | maxPositionSize |
|-----------|:---:|:---:|:---:|:---:|:---:|
| invest buy | ✅ | ✅ | — | — | — |
| invest sell | ✅ | — | — | — | — |
| trade long | ✅ | ✅ | — | ✅ | ✅ |
| trade short | ✅ | ✅ | — | ✅ | ✅ |
| trade close | ✅ | — | — | — | — |

Sell and close don't need `maxPerTx` — you're reducing exposure, not increasing it.

---

## ⚠️ CRITICAL: SUI Investment vs Gas Reserve (Double-counting)

SUI is used for both investment and gas. Both live in the same wallet. **This creates a double-counting risk.**

### The Problem

`queryBalance()` in `wallet/balance.ts` puts ALL wallet SUI into `gasReserve`:

```typescript
// Current: queryBalance() treats ALL wallet SUI as gas
gasReserve: { sui: suiAmount, usdEquiv: suiAmount * suiPriceUsd }
total: totalStables + savings + usdEquiv  // ← SUI counted here via usdEquiv
```

If we naively add `investment = portfolio_SUI * price` to total, the same SUI gets counted **twice** — once in `gasReserve.usdEquiv` and again in `investment`.

### The Fix

`T2000.balance()` must adjust `gasReserve` AFTER getting portfolio data:

```typescript
async balance(): Promise<BalanceResponse> {
  const bal = await queryBalance(this.client, this._address);

  // 1. Merge lending positions (existing logic)
  try {
    const positions = await this.positions();
    bal.savings = positions.positions.filter(p => p.type === 'save').reduce(...);
    bal.debt = positions.positions.filter(p => p.type === 'borrow').reduce(...);
  } catch { }

  // 2. NEW: Merge investment positions
  try {
    const portfolio = this.portfolio.getPositions();
    const suiPrice = bal.gasReserve.usdEquiv / bal.gasReserve.sui; // reuse fetched price
    let investmentValue = 0;
    let investmentPnL = 0;

    for (const pos of portfolio) {
      if (pos.asset === 'SUI') {
        // Actual held = min(portfolio tracked, wallet SUI)
        const actualHeld = Math.min(pos.totalAmount, bal.gasReserve.sui);
        const value = actualHeld * suiPrice;
        investmentValue += value;
        investmentPnL += value - pos.costBasis;

        // Adjust gas reserve: subtract investment SUI
        const gasSui = Math.max(0, bal.gasReserve.sui - pos.totalAmount);
        bal.gasReserve = { sui: gasSui, usdEquiv: gasSui * suiPrice };
      }
      // Future: BTC/ETH/XAUM would need their own price sources
    }

    bal.investment = investmentValue;
    bal.investmentPnL = investmentPnL;
  } catch {
    bal.investment = 0;
    bal.investmentPnL = 0;
  }

  // 3. Recalculate total (investment replaces the SUI portion that was in gasReserve)
  bal.total = bal.available + bal.savings - bal.debt + bal.investment + bal.gasReserve.usdEquiv;

  return bal;
}
```

**Key insight:** `queryBalance()` does NOT change. The adjustment happens in `T2000.balance()` which already overrides `savings` and `debt` from the base query. This pattern is consistent.

### Accounting model

| Wallet SUI | Portfolio SUI | Gas SUI | Investment Value |
|------------|--------------|---------|------------------|
| 106.12 | 105.26 | 0.86 | 105.26 × price |
| 104.50 | 105.26 | 0 | 104.50 × price (gas consumed some) |
| 0.85 | 0 | 0.85 | $0 (no investment) |

### investSell guard

Before selling, query ACTUAL on-chain wallet SUI balance (not portfolio tracking):

```typescript
const walletSui = Number(await client.getBalance({ owner, coinType: SUI_TYPE })) / 1e9;
const maxSellable = walletSui - GAS_RESERVE_MIN; // GAS_RESERVE_MIN = 0.05 SUI
if (sellAmountSui > maxSellable) throw new T2000Error('INSUFFICIENT_INVESTMENT', ...);
```

### Edge case display

If gas fees consume some investment SUI, portfolio shows actual held:

```
SUI   105.26 bought · 104.50 held · Avg $0.95 · ...
      (0.76 SUI consumed by gas fees)
```

P&L is calculated on **actual held** amount — giving an honest view.

---

## Bluefin REST API Integration

### Authentication

Bluefin uses Ed25519 signature-based auth:
1. First-time: register on Bluefin exchange (on-chain tx or API call)
2. Sign a login message with Ed25519 keypair → get session token
3. Use session token as `Authorization: Bearer <token>` header for all API calls

### Endpoints (from Bluefin API docs)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/auth/login` | Authenticate, get token |
| GET | `/account` | Account details + balances |
| GET | `/positions` | Open positions |
| POST | `/orders` | Place order |
| DELETE | `/orders/{id}` | Cancel order |
| GET | `/ticker/{market}` | Market data |
| ~~GET~~ | ~~`/funding-rate/{market}`~~ | ~~Funding rates~~ — deferred to v2 |

### On-chain operations

| Operation | Method |
|-----------|--------|
| Deposit USDC | Build PTB: transfer USDC to Bluefin vault contract |
| Withdraw USDC | Build PTB: call Bluefin withdraw function |

Implementation detail: reference Bluefin SDK source for exact contract addresses and function signatures. The deposit/withdraw are standard Sui Move calls.

### BluefinAdapter class

```typescript
export class BluefinAdapter implements PerpsAdapter {
  readonly id = 'bluefin';
  readonly name = 'Bluefin';
  readonly version = '1.0.0';
  readonly capabilities = ['perps'] as const;
  readonly supportedMarkets = ['SUI-PERP'] as const;

  private token: string | null = null;
  private baseUrl: string;
  private keypair: Ed25519Keypair;

  async init(keypair, network): Promise<void>
  private async authenticate(): Promise<void>
  private async apiCall(method, path, body?): Promise<any>

  async getAccountBalance(address): Promise<number>
  async getPositions(address): Promise<PerpsPosition[]>
  async getMarketPrice(market): Promise<number>

  async deposit(amount): Promise<string>
  async withdraw(amount): Promise<string>

  async openPosition(params): Promise<TradeResult>
  async closePosition(market): Promise<TradeResult>
}
```

---

## Tasks

### Layer 1: Types, Constants, Error Codes (17.1–17.2)

#### 17.1 — Define investment types and error codes

**File:** `packages/sdk/src/types.ts`

- [ ] Add `InvestmentAsset`, `InvestmentTrade`, `InvestmentPosition`, `PortfolioResult`, `InvestResult`
- [ ] Add `PerpsMarket`, `PositionSide`, `PerpsPosition`, `TradeResult`, `TradePositionsResult`
- [ ] ~~Add `FundingRate` to adapter types~~ — deferred to v2
- [ ] Extend `BalanceResponse` with `investment` and `investmentPnL` fields (default to `0`)
- [ ] Extend `TxMetadata.operation` with `'invest' | 'trade'`

**File:** `packages/sdk/src/errors.ts`

- [ ] Add error codes: `INSUFFICIENT_INVESTMENT`, `MARKET_NOT_SUPPORTED`, `LEVERAGE_EXCEEDED`, `POSITION_SIZE_EXCEEDED`, `BLUEFIN_AUTH_FAILED`, `BLUEFIN_API_ERROR`, `POSITION_NOT_FOUND`

#### 17.2 — Add investment constants

**File:** `packages/sdk/src/constants.ts`

- [ ] Add `INVESTMENT_ASSETS` constant (SUI only for MVP)
- [ ] Add `PERPS_MARKETS` constant
- [ ] Add `DEFAULT_MAX_LEVERAGE`, `DEFAULT_MAX_POSITION_SIZE`
- [ ] Add `INVEST_FEE_BPS`
- [ ] Add `GAS_RESERVE_MIN = 0.05` (minimum SUI to keep for gas — matches `AUTO_TOPUP_THRESHOLD`)
- [ ] Export `InvestmentAsset`, `PerpsMarket` types

### Layer 2: PerpsAdapter Interface (17.3)

#### 17.3 — Define PerpsAdapter in adapter types

**File:** `packages/sdk/src/adapters/types.ts`

- [ ] Add `'perps'` to `AdapterCapability`
- [ ] Define `PerpsAdapter` interface (init, getPositions, deposit, withdraw, openPosition, closePosition, getMarketPrice, getAccountBalance)
- [ ] Skip `getFundingRate` for v1 (defer to v2)
- [ ] Export from `packages/sdk/src/adapters/index.ts`

### Layer 3: Portfolio Manager (17.4)

#### 17.4 — Implement PortfolioManager

**File:** `packages/sdk/src/portfolio.ts`

- [ ] `PortfolioManager` class with constructor accepting optional `configDir`
- [ ] `load()` / `save()` — read/write `portfolio.json`
- [ ] `recordBuy(trade)` — add to position, update cost basis + avg price
- [ ] `recordSell(trade)` — reduce position, calculate realized P&L (FIFO or average cost)
- [ ] `getPosition(asset)` — single position by asset
- [ ] `getPositions()` — all positions
- [ ] `getRealizedPnL()` — total realized P&L
- [ ] Fresh `load()` on every read (prevent stale state — same pattern as ContactManager)
- [ ] Storage: `{configDir}/portfolio.json`

**Cost basis method:** Average cost (simpler than FIFO, good enough for MVP).

```
avgPrice = totalCostBasis / totalAmount
On sell: realizedPnL = (sellPrice - avgPrice) × sellAmount
```

### Layer 4: Bluefin Adapter (17.5–17.6)

#### 17.5 — Bluefin REST API client

**File:** `packages/sdk/src/adapters/bluefin.ts`

- [ ] Implement `BluefinAdapter` class
- [ ] Auth: Ed25519 signature → session token flow
- [ ] `init()` — set up keypair, network, base URL
- [ ] `authenticate()` — sign login message, store token
- [ ] `apiCall()` — generic REST caller with auth headers
- [ ] Reference Bluefin API docs for exact endpoints and request/response shapes

**Discovery task:** During implementation, review Bluefin SDK source at `github.com/fireflyprotocol/pro-sdk` to extract:
- Login message format and signing scheme
- Deposit/withdraw contract addresses and Move function signatures
- Order placement request format (priceE9, quantityE9 encoding)

#### 17.6 — Bluefin adapter: trading + positions

**File:** `packages/sdk/src/adapters/bluefin.ts`

- [ ] `getAccountBalance()` — GET account details
- [ ] `getPositions()` — GET open positions, map to `PerpsPosition[]`
- [ ] `getMarketPrice()` — GET ticker for market
- [ ] `deposit()` — build Sui PTB to transfer USDC to Bluefin vault, execute, return tx digest
- [ ] `withdraw()` — build Sui PTB to withdraw from Bluefin, execute, return tx digest
- [ ] `openPosition()` — create market order via REST API
- [ ] `closePosition()` — create closing order, optionally auto-withdraw proceeds

### Layer 5: SDK Integration (17.7–17.9)

#### 17.7 — T2000 class: spot investing methods

**File:** `packages/sdk/src/t2000.ts`

- [ ] Add `portfolio: PortfolioManager` property, initialize in constructor (pass `configDir`)
- [ ] `investBuy({ asset, usdAmount, maxSlippage })`:
  1. `assertNotLocked()`
  2. `enforcer.check({ operation: 'invest', amount: usdAmount })` (checks maxPerTx)
  3. **Pre-check: verify `balance.available >= usdAmount`** (prevent unclear Cetus swap failure)
  4. Get price from Cetus `getPoolPrice()`
  5. Execute swap via existing `exchange()` method (USDC → SUI)
  6. Record buy in PortfolioManager
  7. Return InvestResult
- [ ] `investSell({ asset, usdAmount | 'all', maxSlippage })`:
  1. `assertNotLocked()`
  2. Check portfolio has position for asset
  3. **Query actual on-chain wallet SUI balance** (not portfolio tracking — gas may have consumed some)
  4. Guard: `actual_wallet_SUI - GAS_RESERVE_MIN >= sell_amount_in_SUI`
  5. Execute swap via existing `exchange()` method (SUI → USDC)
  6. Record sell in PortfolioManager (compute realized P&L via average cost)
  7. Return InvestResult
- [ ] `getPortfolio()` — get portfolio positions, fetch live prices from Cetus, compute current values + P&L, return PortfolioResult

#### 17.8 — T2000 class: margin trading methods

**File:** `packages/sdk/src/t2000.ts`

- [ ] `tradeLong({ market, margin, leverage })` — assertNotLocked, check safeguards (maxPerTx, maxLeverage, maxPositionSize), auto-deposit to Bluefin if needed, open long position, return TradeResult
- [ ] `tradeShort({ market, margin, leverage })` — same flow but short side
- [ ] `tradeClose({ market })` — close position, auto-withdraw to checking, return TradeResult
- [ ] `tradePositions()` — get positions from Bluefin API, return TradePositionsResult
- [ ] Emit `balanceChange` after Bluefin deposit (USDC leaving checking) and withdraw (USDC returning)

#### 17.9 — Balance and safeguard updates

**Files:** `packages/sdk/src/t2000.ts`, `packages/sdk/src/safeguards/`

**Balance (`t2000.ts`):**
- [ ] Update `balance()` — see "CRITICAL: SUI Investment vs Gas Reserve" section above
- [ ] Adjust `gasReserve` to subtract portfolio SUI (prevent double-counting)
- [ ] Add `investment` and `investmentPnL` fields to returned BalanceResponse
- [ ] Recalculate `total = available + savings - debt + investment + gasReserve.usdEquiv`
- [ ] Handle gracefully if portfolio is empty (investment = 0, gas unchanged)

**Safeguards (`safeguards/types.ts`, `safeguards/enforcer.ts`):**
- [ ] Add `maxLeverage` and `maxPositionSize` to `SafeguardConfig` (optional, with defaults)
- [ ] Add `'invest' | 'trade'` to `TxMetadata.operation`
- [ ] Do NOT add `invest`/`trade` to `OUTBOUND_OPS` (they are internal, not sending to others)
- [ ] Add leverage/position checks in `T2000.tradeLong/tradeShort` (not in enforcer — custom checks)

**CLI config (`packages/cli/src/commands/config.ts`):**
- [ ] Add `maxLeverage` and `maxPositionSize` to `SAFEGUARD_KEYS` array
- [ ] `t2000 config set maxLeverage 3` and `t2000 config set maxPositionSize 500` should work

### ~~Layer 6: Registry Update (17.10)~~ — SIMPLIFIED

#### 17.10 — Wire BluefinAdapter directly (skip registry pattern)

**Why:** Only ONE perps provider (Bluefin). Full registry pattern (`registerPerps`/`getPerps`/`listPerps`) is over-engineering. Add registry when we need a second provider.

**File:** `packages/sdk/src/t2000.ts`

- [ ] Add `private bluefin: BluefinAdapter | null = null` property
- [ ] Initialize in constructor: `this.bluefin = new BluefinAdapter()` + `this.bluefin.init(keypair, network)`
- [ ] Trade methods call `this.bluefin.*` directly
- [ ] No changes to `registry.ts` or `ProtocolRegistry`

### Layer 7: CLI Commands (17.11–17.14)

#### 17.11 — CLI: `t2000 invest` command

**File:** `packages/cli/src/commands/invest.ts`

- [ ] `invest buy <amount> <asset>` — resolve PIN, create agent, call investBuy, format output
- [ ] `invest sell <amount|all> <asset>` — resolve PIN, create agent, call investSell, format output
- [ ] `--slippage <pct>` option (default 3%)
- [ ] `--json` mode support
- [ ] Error handling: ASSET_NOT_SUPPORTED, INSUFFICIENT_BALANCE, INSUFFICIENT_INVESTMENT

#### 17.12 — CLI: `t2000 portfolio` command

**File:** `packages/cli/src/commands/portfolio.ts`

- [ ] Default: show all positions with P&L, color-coded (green = profit, red = loss)
- [ ] `--json` mode support
- [ ] Empty state: "No investments yet. Try: t2000 invest buy 100 SUI"

#### 17.13 — CLI: `t2000 trade` command

**File:** `packages/cli/src/commands/trade.ts`

- [ ] `trade long <market> <margin> <leverage>` — resolve PIN, create agent, call tradeLong
- [ ] `trade short <market> <margin> <leverage>` — resolve PIN, create agent, call tradeShort
- [ ] `trade close <market>` — resolve PIN, create agent, call tradeClose
- [ ] `trade positions` (default subcommand) — PIN required (Bluefin API needs keypair for auth)
- [ ] Leverage format: `3x` or `3` both accepted
- [ ] `--json` mode support
- [ ] Error handling: MARKET_NOT_SUPPORTED, LEVERAGE_EXCEEDED, POSITION_NOT_FOUND

#### 17.14 — CLI: update `t2000 balance` output

**File:** `packages/cli/src/commands/balance.ts`

- [ ] Add `Investment:` line showing total value and P&L percentage
- [ ] Show even if $0 (greyed out or "—") for progressive disclosure
- [ ] Update total to include investment value

### Layer 8: MCP Tools & Prompts (17.15–17.16b)

#### 17.15 — MCP: read tools

**File:** `packages/mcp/src/tools/read.ts`

- [ ] `t2000_portfolio` — calls `agent.getPortfolio()`, returns positions + P&L as JSON
- [ ] `t2000_trade_positions` — calls `agent.tradePositions()`, returns open perp positions as JSON
- [ ] Tool count: 8 → 10 read tools

#### 17.16 — MCP: write tools

**File:** `packages/mcp/src/tools/write.ts`

- [ ] `t2000_invest` — buy/sell with dryRun preview, includes portfolio summary in response
- [ ] `t2000_trade` — long/short/close with dryRun preview, includes position details
- [ ] Tool count: 7 → 9 write tools

**Total MCP tools: 17 → 21** (10 read + 9 write + 2 safety)

#### 17.16b — MCP: prompt updates

**File:** `packages/mcp/src/prompts.ts`

- [ ] Update `financial-report` — add step: "Check investment portfolio (t2000_portfolio)" and "Check margin positions (t2000_trade_positions)"
- [ ] Update `budget-check` — mention investment value as part of net worth
- [ ] Update `savings-strategy` — mention investing idle funds as alternative to savings
- [ ] Add new `investment-strategy` prompt — analyze portfolio, suggest DCA, check margin positions, risk assessment
- [ ] Prompt count: 5 → 6

### Layer 9: Tests (17.17–17.19)

#### 17.17 — SDK: PortfolioManager unit tests

**File:** `packages/sdk/src/portfolio.test.ts`

- [ ] CRUD: recordBuy, recordSell, getPosition, getPositions
- [ ] Cost basis: average cost calculation on multiple buys
- [ ] P&L: realized P&L on sell, unrealized P&L with mock prices
- [ ] Edge cases: sell more than held, sell all, empty portfolio
- [ ] Persistence: load/save cycle, corrupted file handling
- [ ] Isolation: use temp dirs (same pattern as contacts tests)

#### 17.18 — SDK: invest + trade method tests

**File:** `packages/sdk/src/t2000.integration.test.ts` (extend existing)

- [ ] investBuy: mock CetusAdapter swap, verify portfolio recording
- [ ] investSell: verify P&L calculation, gas reserve guard
- [ ] getPortfolio: verify live price enrichment
- [ ] tradeLong/tradeShort: mock BluefinAdapter, verify safeguard checks
- [ ] tradeClose: verify auto-withdraw
- [ ] Balance: verify investment tier appears in balance response

#### 17.19 — MCP: tool tests

**File:** `packages/mcp/src/tools/read.test.ts`, `write.test.ts`

- [ ] t2000_portfolio: verify returns portfolio data
- [ ] t2000_invest: verify buy/sell with dryRun
- [ ] t2000_trade: verify long/short/close with dryRun
- [ ] t2000_trade_positions: verify returns perp positions
- [ ] Update mock agent with portfolio + trade mocks
- [ ] Update expected tool counts

### Layer 10: SDK Exports (17.19b)

#### 17.19b — Update SDK public API

**File:** `packages/sdk/src/index.ts`

- [ ] Export `PortfolioManager` class
- [ ] Export new types: `InvestmentAsset`, `InvestmentTrade`, `InvestmentPosition`, `PortfolioResult`, `InvestResult`
- [ ] Export new types: `PerpsMarket`, `PositionSide`, `PerpsPosition`, `TradeResult`, `TradePositionsResult`
- [ ] Export new constants: `INVESTMENT_ASSETS`, `PERPS_MARKETS`, `DEFAULT_MAX_LEVERAGE`, `DEFAULT_MAX_POSITION_SIZE`

### Layer 11: Docs, Skills, Marketing (17.20–17.22)

#### 17.20 — Agent skill

**File:** `t2000-skills/skills/t2000-invest/SKILL.md`

- [ ] Purpose, commands, examples for spot investing
- [ ] Portfolio viewing

**File:** `t2000-skills/skills/t2000-trade/SKILL.md`

- [ ] Purpose, commands, examples for margin trading
- [ ] Leverage, position management

#### 17.21 — Documentation updates (batched)

**Count updates across all docs:**
- Tools: 17 → 21 (4 new: t2000_portfolio, t2000_trade_positions, t2000_invest, t2000_trade)
- Prompts: 5 → 6 (1 new: investment-strategy)
- CLI commands: 27 → 30 (3 new: invest, portfolio, trade)
- Skills: 13 → 15 (2 new: t2000-invest, t2000-trade)

**Files to update:**
- [ ] `packages/sdk/README.md` — new methods, types, invest/trade examples
- [ ] `packages/cli/README.md` — new commands
- [ ] `packages/mcp/README.md` — new tools + prompts
- [ ] `apps/web/app/page.tsx` — homepage: update tool counts (21), add Investment to comparison table, update account tiers
- [ ] `apps/web/app/docs/page.tsx` — docs: new commands, tools, changelog entry (v0.14.0)
- [ ] `PRODUCT_FACTS.md` — version 0.14.0, all counts above, investment feature description
- [ ] `CLI_UX_SPEC.md` — new commands documentation
- [ ] `spec/t2000-roadmap-v2.md` — mark Phase 17 as shipped

#### 17.22 — Release

- [ ] Version bump: sdk, cli, mcp → v0.14.0
- [ ] Build all packages
- [ ] Publish to npm
- [ ] Git commit + push
- [ ] Marketing tweet / demo video

---

## Testing Strategy

### Unit tests (PortfolioManager) — ~20 tests
- CRUD: recordBuy, recordSell, getPosition, getPositions
- Cost basis: average cost calculation on multiple buys at different prices
- P&L: realized P&L on sell, unrealized P&L with mock prices
- Edge cases: sell more than held, sell all, empty portfolio, negative P&L
- Persistence: load/save cycle, corrupted file handling
- Isolation: use temp dirs (same pattern as contacts tests)

### Integration tests (SDK methods) — ~18 tests
- investBuy: mock CetusAdapter swap, verify portfolio recording
- investBuy: fail if `available < usdAmount` (insufficient checking balance)
- investSell: verify P&L calculation, gas reserve guard
- investSell: fail if wallet SUI - gas reserve < sell amount
- investSell: sell all (verify portfolio clears position)
- getPortfolio: verify live price enrichment
- **balance: verify SUI NOT double-counted** (gasReserve adjusted for portfolio SUI)
- balance: verify investment = 0 when no portfolio
- balance: verify total formula includes investment
- tradeLong/tradeShort: mock BluefinAdapter, verify safeguard checks
- tradeLong: fail if leverage > maxLeverage
- tradeLong: fail if margin > maxPositionSize
- tradeClose: verify auto-withdraw

### MCP tests — ~10 tests
- t2000_portfolio: returns portfolio data, handles empty portfolio
- t2000_invest: buy/sell with dryRun preview
- t2000_invest: sell with contact-like amount validation
- t2000_trade: long/short/close with dryRun preview
- t2000_trade_positions: returns perp positions, handles no positions
- Update mock agent with portfolio + trade mocks
- Update expected tool counts (17 → 21)

### Manual testing
- Full CLI flow: invest buy → portfolio → balance → invest sell → balance
- Full trade flow: trade long → trade positions → trade close
- Safeguard enforcement: locked, maxPerTx, maxLeverage, maxPositionSize
- Balance display: verify SUI split between Investment and Gas tiers
- `t2000 config set maxLeverage 3` → `trade long SUI 100 5x` → should fail
- Claude Desktop: natural language invest and trade commands
- Existing commands still work: send, save, exchange, rebalance, balance

**Target: ~48 new tests**

---

## Cross-cutting Concerns (won't break existing features)

### Existing `positions` command stays lending-only

`t2000 positions` and `t2000_positions` continue to show savings/borrows only. Investment has its own `t2000 portfolio` / `t2000_portfolio`. No changes to the existing command.

### Existing `exchange` command remains unchanged

`t2000 exchange 100 USDC SUI` continues to work as a utility swap — no portfolio tracking. `t2000 invest buy 100 SUI` does the same swap but ALSO tracks in portfolio. Both use CetusAdapter under the hood. This is intentional: exchange = utility, invest = tracked position.

### Existing `save` / `withdraw` / `borrow` / `repay` unaffected

These only operate on stablecoin lending positions (NAVI, Suilend). Investment SUI in the wallet does not interact with lending. No changes needed.

### Existing `rebalance` stays stablecoin-only

Rebalance compares stablecoin lending rates and moves between protocols. It does NOT touch investment positions.

### Existing `send` stays checking-only

`t2000 send` sends from checking (stablecoins). It does NOT send investment SUI. If user wants to liquidate investment to send, they must `invest sell` first, then `send`. The AI agent can suggest this workflow naturally.

### Gas auto-topup unaffected

Auto-topup triggers when wallet SUI < 0.05. With investment SUI, wallet SUI is HIGH, so auto-topup won't trigger. If investment is sold and SUI drops, auto-topup handles it normally.

### BalanceResponse backward compatibility

New fields `investment` and `investmentPnL` default to `0`. Existing consumers of `BalanceResponse` won't break — they just won't display the new fields. The `total` formula changes, but this is correct behavior (total should reflect net worth including investments).

### MCP `t2000_balance` auto-includes investment

The MCP tool just returns `agent.balance()` as JSON. Since `BalanceResponse` gets new fields, they automatically appear in the JSON. No tool code change needed — just the SDK `balance()` logic.

### SDK events fire automatically for spot invest

`investBuy` and `investSell` call `exchange()` internally. The existing `balanceChange` event fires from the swap. No new event types needed. The `cause` field will show `'swap'` — fine for v1.

For margin trading: emit `balanceChange` manually after Bluefin deposit/withdraw (USDC leaving/entering checking).

---

## Backend / Server / Indexer — No Changes Needed

| Component | Status | Why |
|-----------|--------|-----|
| **Prisma schema** | ✅ No change | Investment tracked in local `portfolio.json`, not DB |
| **Indexer** | ✅ No change | Spot invest = Cetus swaps (already classified). Bluefin deposits = unknown transfers (fine for v1) |
| **YieldSnapshotter** | ✅ No change | Investment SUI doesn't earn yield (that's Phase 17d) |
| **EventParser** | ✅ No change | Cetus descriptor already handles swap classification |
| **Stats API** | ✅ No change | Swaps appear as Cetus trades. Fine for v1 |
| **Gas Station** | ✅ No change | No impact on gas sponsorship |
| **Sponsor** | ✅ No change | Agent creation unchanged |
| **CLI `serve` SSE** | ✅ No change | Existing `balanceChange` event covers spot invest via exchange() |

### Deferred infra (v2)

- Add Bluefin `ProtocolDescriptor` for proper indexer classification of margin deposits/withdrawals
- Extend stats API to show investment metrics (total invested, P&L across all agents)
- Investment-specific events (e.g., `investmentPnL`, `positionClosed`)

---

## Risk & Open Questions

| Risk | Mitigation |
|------|------------|
| Bluefin API auth complexity | Discovery task in 17.5 — review SDK source for exact signing scheme |
| Bluefin contract addresses | Extract from SDK source or Bluefin docs |
| SUI double-counting in balance | Explicit adjustment in `T2000.balance()` — see critical section above |
| Gas consumed from investment SUI | P&L calculated on actual held, not tracked. Honest portfolio display. |
| investBuy with insufficient checking | Pre-check `available >= usdAmount` before swap attempt |
| Price slippage on large spot trades | Default 3% slippage, configurable via `--slippage` |
| Bluefin API rate limits | Cache market data, batch position queries |
| Perps liquidation risk | Show liquidation price prominently, require confirmation for high leverage |
| `BalanceResponse` change breaks consumers | New fields default to `0`, total formula change is correct. MCP auto-inherits. |
| Existing `positions` command confusion | Stays lending-only. Investment gets its own `portfolio` command. Documented. |

### Open questions (to resolve during implementation)

1. **Bluefin auth**: Exact signing scheme TBD — need to read SDK source or API docs
2. **Bluefin deposit contract**: Need exact Move package + function for USDC deposit
3. **Market order vs limit**: v1 uses market orders for simplicity. Limit orders in v2.
4. **Auto-close on liquidation risk**: Alert only, or auto-close at configurable threshold?

---

## Dependencies

### No new npm dependencies for 17a (spot)

Reuses existing CetusAdapter.

### 17b (margin) — zero new deps (REST API approach)

We use `fetch` (built-in Node 18+) for Bluefin REST API calls. No SDK dependency.

### If we need to fall back to SDK approach

```
@bluefin-exchange/pro-sdk@^1.13.0  ← version conflict with @mysten/sui
```

Resolution: isolate in separate workspace package with own dep tree, or use pnpm overrides.

---

## Order of Operations

Recommended build sequence:

```
17.1–17.2   Types + constants + error codes      ┐
17.3        PerpsAdapter interface                │ Foundation
17.4        PortfolioManager                      ┘

17.7        T2000: investBuy/Sell/getPortfolio    ┐
17.9a       Balance update (SUI double-count fix) │ Spot investing
17.11       CLI: t2000 invest                     │ (can ship independently)
17.12       CLI: t2000 portfolio                  │
17.14       CLI: balance update                   ┘

17.5–17.6   BluefinAdapter (REST API)             ┐
17.8        T2000: tradeLong/Short/Close          │ Margin trading
17.9b       Safeguard extensions + CLI config     │
17.10       Wire BluefinAdapter in constructor    │
17.13       CLI: t2000 trade                      ┘

17.15–17.16 MCP tools                             ┐
17.16b      MCP prompts (update 3, add 1)         │ Integration
17.17–17.19 Tests                                 │
17.19b      SDK exports (index.ts)                │ Ship
17.20–17.22 Docs, skills, release                 ┘
```

Spot investing (17a) can be built and tested first — zero external dependencies. Margin trading (17b) requires Bluefin API discovery and can proceed in parallel once types are defined.

**Total tasks: 25** (17.1–17.22 + 17.16b + 17.19b — 17.10 simplified to direct wiring)
