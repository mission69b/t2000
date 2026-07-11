---
name: deepbook
description: >-
  Read live market data from DeepBook, Sui's on-chain central limit order
  book — pools, tickers, order books, candles, trades — over a free public
  REST indexer. Use for Sui price checks, market depth, volume, or OHLCV
  questions. Read-only.
license: MIT
metadata:
  author: t2000
  version: "1.0"
  requires: curl (no key, no wallet)
---

# DeepBook: Market reads

## Purpose

DeepBook v3 is Sui's shared order book. Mysten runs a free public indexer — no key, no wallet:

```text
https://deepbook-indexer.mainnet.mystenlabs.com
```

Pair names are `BASE_QUOTE` (e.g. `SUI_USDC`, `DEEP_USDC`, `WAL_USDC`). Get the live list from `/get_pools`.

## Rules

1. **Discover pairs first.** Pool names are exact — call `/get_pools` or `/ticker` before assuming a pair exists.
2. **Prices come pre-scaled.** Ticker/orderbook/candle prices are already in human units — don't re-divide by decimals.
3. **Check `isFrozen`.** A ticker entry with `isFrozen: 1` is an inactive pool — don't quote it as a live price.
4. **This is one venue.** DeepBook depth ≠ all of Sui liquidity. For a best-execution swap across 20+ DEXs, use the `t2000-swap` skill; use DeepBook reads for order-book-grade data.

## Endpoints

```bash
B=https://deepbook-indexer.mainnet.mystenlabs.com

curl -s "$B/get_pools"                          # every pool + assets, decimals, tick/lot sizes
curl -s "$B/ticker"                             # all pairs: last_price, 24h volume, isFrozen
curl -s "$B/summary"                            # 24h stats per pair (bid/ask, high/low, % change)
curl -s "$B/orderbook/SUI_USDC?level=2&depth=10"   # live bids/asks (level 1 = top of book)
curl -s "$B/ohclv/SUI_USDC?interval=1h&limit=24"   # candles: [ts_ms, open, high, close, low, volume]
curl -s "$B/trades/SUI_USDC?limit=5"            # recent fills (price, size, side, tx digest)
curl -s "$B/historical_volume/SUI_USDC?start_time=<unix_s>&end_time=<unix_s>"
```

Verified live examples:

```bash
curl -s "$B/orderbook/SUI_USDC?level=2&depth=4"
# {"bids":[["0.73174","240"],…],"asks":[["0.732","1392.2"],…],"timestamp":"1783734413301"}

curl -s "$B/ticker" | python3 -c "import json,sys; print(json.load(sys.stdin)['SUI_USDC'])"
# {'last_price': 0.732…, 'base_volume': …, 'quote_volume': …, 'isFrozen': 0}
```

## Answer patterns

- **"What's SUI trading at?"** → `/ticker`, read `SUI_USDC.last_price`, quote the venue ("on DeepBook").
- **"How deep is the book?"** → `/orderbook/<pair>?level=2&depth=20`, sum bid/ask sizes near mid.
- **"Chart the last day"** → `/ohclv/<pair>?interval=1h&limit=24`. Note the field order in the name: o-h-**c-l**-v.
- **"Is volume real?"** → `/trades/<pair>` rows carry the Sui tx `digest` — every fill is verifiable on-chain (`https://suiscan.xyz/mainnet/tx/<digest>`).

## Gotchas

- The candle endpoint is spelled `ohclv` (not `ohlcv`) — and the array order matches: `[ts, open, high, close, low, volume]`.
- Timestamps: candle/orderbook are **milliseconds**; `historical_volume` params are **seconds**.
- Trading (placing orders) needs a BalanceManager + the DeepBook SDK — out of scope here; this skill is reads.

Live docs: [docs.sui.io → DeepBookV3 Indexer](https://docs.sui.io/onchain-finance/deepbookv3/deepbookv3-indexer).
