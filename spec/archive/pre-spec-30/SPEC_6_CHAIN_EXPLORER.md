# Spec 6: Audric Explorer — the Sui Block-Explorer Killer

*Version 0.4 — Scoping draft (final, all decisions locked) · April 2026 · Internal*
*Status: Planned — Phase 1 ready to schedule. No remaining open questions.*
*Author: Drafted by Audric agent during 0.46.x correctness pass, founder review applied + indexer architecture review*

**Product name (locked):** Audric Explorer.
**Product taxonomy (locked):** Sixth product. Five Products line becomes Passport · Intelligence · Finance · Pay · Store · **Explorer**.
**Data source (locked):** BlockVision (paid) is the **sole external data source** for stranger addresses, transactions, and tokens. The existing in-house indexer is privacy-by-design and **opt-in agents only** — it powers the differentiated "your own wallet" view but is **not used for third-party queries**.
**Auth model (locked):** Public read for first N queries per IP/hour, then soft sign-in gate.
**Pricing model (locked):** Free tier with rate limits + paid tier with batch queries unlocked.
**LLM context strategy (locked):** Server-side aggregation; LLM only sees summaries, never raw rows.
**Differentiation moat (locked):** signed-in users always get a strictly richer view of their own wallet than unauthenticated visitors get of any wallet. See "The two Explorer modes" below.

---

## TL;DR

Turn Audric into the conversational block explorer for Sui. Today Audric reasons over **the user's own wallet**. Spec 6 makes Audric reason over **any address, any transaction, any token** on Sui mainnet — with rich cards, multi-entity batch queries, and entity-routed URLs.

The reference experience is [Lana.ai for Solana](https://www.lana.ai/) — `lana.ai/address/<addr>`, `lana.ai/tx/<digest>`, `lana.ai/token/<mint>` open a chat scoped to that entity, and prompts like *"did any of these 14 wallets move TRUMP after winning the dinner?"* return real flow analysis in seconds.

**Why this matters for Audric specifically:** the moat is Audric Intelligence (the 5-system harness). Today that moat is locked behind sign-in and only ever points at one address. Unlocking it for arbitrary chain entities is the single largest expansion of TAM available without building a new product — every Sui address, every SuiScan link, every Twitter wallet screenshot becomes a potential entry point.

**This is not a 2-week spec.** Realistically a 12–16 week track across 4 phases. Phase 1 alone (single-entity URLs + read-only "ask about any wallet") is ~3 weeks and unlocks 70% of the demo value.

---

## What this spec does NOT touch

- **Real-time alerting / "watch this wallet"** — that's a future Notifications spec, not here. Spec 6 is on-demand only.
- **Cross-chain** — Sui mainnet only for v1. No Solana, no EVM bridges.
- **NFT collections** — separate explorer track. Coin/fungible-token entities only.
- **On-chain governance** — no proposal viewing, no voting analysis.
- **MEV / private-pool data** — no source on Sui yet, defer indefinitely.
- **Write actions on third-party wallets** — read-only inspection only. Write actions still require Passport sign-in and can only target the signed-in user's own wallet.
- **Existing single-wallet flows** — Spec 6 is purely additive. Today's "what's my balance" UX is unchanged.

---

## The two Explorer modes (architectural finding from indexer review)

The existing t2000 indexer is **scoped to opt-in agents only** by design — it filters every checkpoint against a `getKnownAgents()` set sourced from the `Agent` Postgres table (only addresses that ran `t2000 init` or its zkLogin web equivalent). This is privacy-by-design and a documented brand commitment ("No scanning of arbitrary wallets — Privacy by design" — `ARCHITECTURE.md` "Indexer" section).

Spec 6 inherits this constraint as a hard architectural boundary. It produces two distinct Explorer modes:


| Mode                     | Entity                                                                      | Data sources                                                       | Card depth  | Examples of unique data                                                                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Own-wallet mode**      | The signed-in user's wallet (or any address they linked via `LinkedWallet`) | BlockVision **+** in-house indexer **+** chain memory + advice log | **Maximum** | t2000-classified action labels, protocol fees paid (`ProtocolFeeLedger`), per-position yield over time (`YieldSnapshot`), real-time HF monitoring, full chain memory + advice context |
| **Public-explorer mode** | Any other Sui address, tx digest, or token                                  | BlockVision only                                                   | Standard    | Balance, transfers, classifications via `classifyTransaction`, public on-chain data                                                                                                   |


**Why this matters strategically:**

1. **Privacy by design is preserved.** No change to the indexer's known-agents filter. The brand commitment holds.
2. **Sign-in becomes its own upsell.** A logged-in user always gets a strictly richer view of their own wallet than any anonymous visitor gets of any wallet. "Sign in to see protocol fees you've paid, your yield over time, your real-time HF monitoring, and your linked wallets" is a real, differentiated reason to sign up — not a nag.
3. **Public Explorer is the SEO surface; own-wallet Explorer is the retention surface.** Each mode is optimized for a different funnel stage.
4. **The in-house indexer's scope never has to change** to ship Spec 6. Zero risk of regressing the privacy commitment to add Explorer features.

This finding eliminates the Spec 6.3 "what does the in-house indexer cover?" open question — it's already known and locked. See "Resolved decisions" section below.

---

## Where we are today

### What already works in Audric's favor

- **7 of 12 read tools accept arbitrary `address` parameters.** Verified in `packages/engine/src/tools/`: `balance_check`, `transaction_history`, `savings_info`, `health_check`, `activity_summary`, `yield_summary`, `portfolio_analysis` all destructure `input.address ?? context.walletAddress`. This means a chunk of the chain-explorer surface is already plumbed — the LLM just doesn't know to use it on arbitrary addresses.
- **Rich cards already exist.** Balance, savings, health, activity, yield, portfolio, transaction-history cards all render off pure data and don't depend on the address being the signed-in user's. Card surface ports cleanly.
- **Transaction classification system** (`packages/sdk/src/wallet/classify.ts`, completed in 0.46.x) already labels swaps, lending, sends, payment links from any tx. It's address-agnostic.
- **Recipe system** (registry + trigger matching, used for `account_report` in 0.46.x) is the right primitive for entity-routed flows — see Phase 1 architecture below.

### What's missing

- **No URL routing for entities.** No `/address/<addr>`, `/tx/<digest>`, `/token/<symbol>` routes. No way to land on a page seeded with chain context.
- **No way for the LLM to know "the user is asking about a third-party address."** Today, if a user pastes `0xabc…` and says "what does this wallet do?", the LLM has no convention for routing that into the address-accepting tools.
- **No batch / fan-out tool.** "Did any of these 14 wallets move X token?" requires 14 parallel scans + result aggregation; no current tool supports this shape.
- **No address labels.** A pasted address shows up as `0xabc…` everywhere — no "this is Cetus pool 0x…", no "this is the NAVI lending market", no "this is Binance hot wallet 7."
- **No token-level primitives.** No holders list, no supply, no top-holders breakdown, no flow graph for a given coin type.
- **Sui RPC is the only data source.** That works for single-wallet queries on small histories; it falls over on multi-wallet batch queries or "all txs for token X in last 30 days." Need an indexer for Phase 3.

---

## Vision: the four use cases

Every architectural decision in this spec serves at least one of these four reference flows. If a proposal doesn't unlock one of them, defer it.

### Use case 1: "Ask about any address"

> User pastes `0xabc…` or lands on `audric.ai/address/0xabc…` and asks *"what does this wallet do?"*
>
> Audric responds with a rich Address Card (balance, top tokens, recent activity bucket, label if known) plus a 2–3 sentence narrative — same UX as "what's my balance" but pointed at a stranger's wallet.

### Use case 2: "Trace a transaction"

> User pastes a digest or lands on `audric.ai/tx/<digest>` and asks *"what happened here?"*
>
> Audric returns a Transaction Card (counterparties, amounts, decoded MoveCalls, classification — swap / lending / payment link / send / etc.) plus a narrative *"Alice sent 500 USDC to a Cetus aggregator, swapped for 2,000 LOFI, then deposited the LOFI to a NAVI lending market."*

### Use case 3: "Inspect a token"

> User asks *"what is LOFI?"* or lands on `audric.ai/token/LOFI`.
>
> Audric returns a Token Card (price, FDV, supply, top holders, 24h volume, top pools) and offers natural follow-ups (*"show me top holders," "trace recent flows," "is this safe?"*).

### Use case 4: "Multi-wallet batch analysis" — the killer feature

> User pastes 14 addresses + asks *"did any of these wallets move TRUMP token after Apr 1?"*
>
> Audric fans out, scans each wallet's transfer history for that coin type since the cutoff, and returns a Flow Card *"4 of 14 wallets moved TRUMP after Apr 1: 0xabc → Binance, 0xdef → unknown EOA, 0x123 → Cetus liquidity pool, 0x456 → vested escrow."*
>
> **This is the demo that wins enterprise / research customers.** It's also what Lana.ai converted on.

---

## Architecture sketch

### Phase 1: Single-entity URLs + LLM context routing (3 weeks)

**Add three URL routes:**

- `app/address/[address]/page.tsx`
- `app/tx/[digest]/page.tsx`
- `app/token/[symbol]/page.tsx`

Each route:

1. Validates the path param (Sui address regex, 64-char digest, known token symbol or coinType).
2. Renders the existing chat surface with a **seeded system context** that says *"You are inspecting **. The user landed on this page intending to ask about it. Treat ** as the implicit subject of every question unless they explicitly ask about something else."*
3. Pre-fires one entity-appropriate tool call so the first card renders before the user types — `balance_check({address})` for addresses, a new `tx_inspect({digest})` for txs, a new `token_info({symbol})` for tokens.

**Add three new tools:**

- `chain_address_lookup(address)` — wraps `balance_check` + `activity_summary` + label resolution into one summary call. Read-only.
- `chain_tx_inspect(digest)` — fetches the tx, runs it through the existing `classifyTransaction` pipeline, returns decoded MoveCalls + counterparties + classification + amounts. Read-only.
- `chain_token_info(symbolOrCoinType)` — price (DefiLlama), supply (Sui RPC), 24h volume (DefiLlama or DEX aggregator), top pools. Read-only.

**Add an entity-aware recipe** (`chain_inspect_address`, `chain_inspect_tx`, `chain_inspect_token`) so the URL-routed pages get deterministic 1–3 tool fan-out without LLM judgement, same pattern as the `account_report` recipe shipped in 0.46.3.

**Phase 1 explicitly skips:** indexer, batch queries, holder lists, flow graphs, address labels beyond a hardcoded ~20-entry seed list.

**Phase 1 ships when:**

- Pasting `https://www.audric.ai/address/0x<any-valid-sui-address>` opens a chat with an Address Card pre-rendered.
- Asking "what does this wallet do?" on that page returns a coherent narrative.
- Pasting a tx digest into chat (without URL routing) classifies it correctly and renders a Transaction Card.
- Asking "what is SUI?" / "what is USDC?" returns a Token Card.

### Phase 2: Token-aware primitives (3 weeks)

Add token-level depth that single-wallet flows didn't need:

- `**chain_token_holders(coinType, limit)`** — top N holders by balance. Requires either an indexer or a paginated RPC scan with caching.
- `**chain_token_flows(address, coinType, since)`** — all in/out for a given (address, token) pair within a time window. This is the building block for the Phase 3 batch use case.
- `**chain_token_supply(coinType)*`* — total supply, circulating supply, mint authority status.

Add a `**TokenRegistry` Postgres table** that caches metadata for the top ~500 Sui tokens (symbol, decimals, coinType, current price, last refreshed). Refreshed by a 5-minute cron. Avoids hitting DefiLlama on every chat turn.

Add a `**AddressLabel` Postgres table** with a curated seed of ~100 labels (Cetus pools, NAVI markets, Suilend, Bluefin, Aftermath, the major CEX hot wallets that operate on Sui). Resolved synchronously inside `chain_address_lookup`. Community submission flow deferred to Phase 4.

### Phase 3: Multi-entity batch queries — needs dedicated sub-spec

**Status: scoping placeholder only. A full Spec 6.3 sub-doc is required before Phase 3 starts.** Founder decision (Apr 2026): Phase 3 is the killer demo and is too important to ship from this scoping draft alone. Once Phase 1 ships and we have real BlockVision usage data, write Spec 6.3 with concrete schemas, BlockVision endpoint inventory, and indexer fallback contracts.

**The core problem:** the Lana-style "scan 14 wallets for token X movements since date Y" query is **~14 × full transaction history scans + filter + aggregate**. Doing that against raw Sui RPC is too slow (RPC pagination caps + rate limits) and too expensive.

**Data source plan:**

- **BlockVision (paid) is the sole external data source for Phase 3.** Their Sui API covers multi-address coin history, balance changes, and per-address activity scans. The Phase 3 batch shape assembles from existing BlockVision endpoints + server-side aggregation; no new indexer infrastructure required.
- **The in-house indexer is NOT a fallback for stranger-address batch queries.** It is privacy-by-design and scoped to opt-in agents only (see "The two Explorer modes" section above). Forcing it to serve stranger-address queries would require relaxing the known-agents filter — a brand violation, not an engineering shortcut.
- **The own-wallet batch case** (a signed-in user with multiple linked wallets running a batch query against their own portfolio) **does** ride on the in-house indexer + chain memory and gets a richer result than the public-explorer batch path. This becomes a natural paid-tier feature.
- The earlier SubQuery / Allium / self-built indexer trade-off table is **dropped from scope** — BlockVision is the single external dependency.

**Phase 4+ contingency (not in scope now):** if BlockVision becomes insufficient at scale (rate limits, missing data shapes, vendor risk), spinning up a *second* indexer is feasible — the existing infrastructure (checkpoint poller, cursor tracking, heartbeat, ECS pipeline in `apps/server/src/indexer/`) is reusable as a template for a general-Sui "Explorer indexer" with a different scope. **Do not plan or scope this in Spec 6.3.** Revisit only if BlockVision proves insufficient post-launch.

**LLM context strategy (locked) — applies to all Phase 3 tools:**

- Tool results returned to the LLM are **summaries only**, never raw transaction rows.
- Concrete shape for `chain_address_flows_batch`:
  ```ts
  {
    totalAddresses: number;
    addressesWithMovement: number;
    cutoffTimestamp: string;
    coinType: string;
    aggregateVolume: { in: number; out: number; net: number; symbol: string };
    perAddress: Array<{
      address: string;
      label?: string;
      txCount: number;
      netFlow: number;
      topCounterparty: { address: string; label?: string; volume: number };
    }>;
    topCounterparties: Array<{
      address: string;
      label?: string;
      totalReceived: number;
      fromAddressCount: number;
    }>;
  }
  ```
- Raw transaction rows are kept in the **card data only** (rendered client-side from the same tool result, not surfaced to the LLM message stream).
- Result: a 14-wallet batch costs ~500 LLM context tokens instead of ~50k. Headline narration becomes trivially cheap and never overflows the context window. Same pattern applies to `chain_address_flow_graph` and `chain_token_top_movers`.
- This pattern is also a guardrail against LLM hallucination on third-party flows — the model can only narrate the aggregates it's given.

**New tools enabled in Phase 3:**

- `chain_address_flows_batch(addresses[], coinType, since)` — the Lana killer query. Fans out across BlockVision (or the in-house indexer for queries BlockVision can't serve), aggregates server-side, returns the summary shape above.
- `chain_address_flow_graph(address, depth, since)` — N-hop flow graph for a given address, suitable for rendering a force-directed graph card or a sankey diagram card. Returns aggregated node/edge counts to the LLM; full graph data flows to the card only.
- `chain_token_top_movers(coinType, since)` — top N addresses by volume in/out for a coin in a time window.

### Phase 4: Labeling at scale (ongoing, lightweight)

- Community submission form for address labels (`audric.ai/labels/submit`).
- Curator review queue (1 person, ~1 hour/week).
- Bulk import of public lists (DefiLlama protocol addresses, Sui Foundation labeled addresses, exchange wallet lists).
- Label confidence tiers: `verified` (us), `community` (submitted + reviewed), `inferred` (heuristic — e.g., "this address has interacted with 12 NAVI markets, likely a NAVI power user").

---

## New rich cards (frontend scope)

All cards live in `apps/web/components/engine/cards/` alongside today's 12 cards. Same `CardShell` primitive. Each binds to one tool's result schema.


| Card                | Tool                                              | Phase | Notes                                                                                                                       |
| ------------------- | ------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------- |
| **AddressCard**     | `chain_address_lookup`                            | 1     | Identity (label or truncated addr), balance summary, top 3 tokens, activity bucket, age (first-seen).                       |
| **TransactionCard** | `chain_tx_inspect`                                | 1     | Sender, receiver(s), amounts, classification badge, decoded MoveCalls (collapsed by default), gas, timestamp, SuiScan link. |
| **TokenCard**       | `chain_token_info`                                | 1     | Symbol + icon, price + 24h change, market cap / FDV, supply, top 3 pools, "ask about this token" follow-up chips.           |
| **HoldersCard**     | `chain_token_holders`                             | 2     | Top N holders table, % of supply, label resolution per row, concentration warning if top-10 > 50%.                          |
| **FlowCard**        | `chain_token_flows` / `chain_address_flows_batch` | 2 / 3 | List of (sender → receiver, amount, timestamp) rows for a token, optionally grouped by counterparty type.                   |
| **FlowGraphCard**   | `chain_address_flow_graph`                        | 3     | Force-directed graph or sankey, N-hop depth, click-to-follow. Probably uses `react-flow` or `d3-sankey`.                    |


---

## Surface area in numbers


| Surface            | Today      | Phase 1                | Phase 2                           | Phase 3                                       |
| ------------------ | ---------- | ---------------------- | --------------------------------- | --------------------------------------------- |
| Engine read tools  | 29         | 32 (+3)                | 35 (+3)                           | 38 (+3)                                       |
| Engine write tools | 11         | 11                     | 11                                | 11                                            |
| Rich card types    | 12         | 15 (+3)                | 17 (+2)                           | 18 (+1)                                       |
| Recipes            | 6          | 9 (+3 chain_inspect_*) | 9                                 | 11 (+2 batch)                                 |
| URL routes         | ~10        | ~13 (+3)               | ~13                               | ~14 (+1 labels)                               |
| Postgres tables    | (existing) | + 0                    | + 2 (TokenRegistry, AddressLabel) | + 1 (IndexedTx hot range) or external indexer |


---

## Product taxonomy (locked)

**Audric Explorer is the sixth Audric product.** The Five Products line becomes the Six Products line:

> 🪪 **Passport** · 🧠 **Intelligence** · 💰 **Finance** · 💸 **Pay** · 🛒 **Store** · 🔍 **Explorer**

**Tagline candidates** (pick during Phase 1 marketing pass):

- *"Ask anything on Sui."*
- *"Every wallet, every transaction, every token — explained."*
- *"The block explorer that talks back."*

**Naming decision rationale.** "Explorer" was chosen over "Search" and "Trace":

- "Search" was too broad and pulled toward the Perplexity/Google framing — implies general web search, dilutes the chain-specific positioning.
- "Trace" was strong but narrow — fits the flow-graph use case but not "what is this token" or "what does this wallet do." Reserved as a verb inside Explorer (e.g., "Trace this address").
- "Explorer" maps directly to "block explorer," which is the comparison we *want* people to make. It implies discovery, not just lookup, and survives the Lana.ai comparison cleanly.

**Comms cost of going from five to six products** is acceptable. The S.18 "exactly five products" reframe shipped April 2026 and has not had major external comms yet (no funding round, no press cycle). Changing the canonical taxonomy now is cheap; doing it after a launch beat would be expensive.

**Operation-to-product mapping update** (for system prompts, marketing copy, READMEs):

- `address_lookup`, `tx_inspect`, `token_info`, `address_flows_batch`, `flow_graph`, `token_top_movers`, `holders` → **Audric Explorer**
- All other read/write operations: unchanged.

---

## Cost & rate-limit considerations

### Data source cost (locked)

- **BlockVision (paid) is already in place.** Phase 1–3 ride on the existing subscription. No additional infra spend for the public-explorer data layer.
- **In-house indexer is already running** and adds zero marginal cost — but **only for own-wallet mode** (opt-in agents). It does not serve public-explorer queries.
- **Earlier SubQuery / Allium / self-built indexer estimates are dropped.** BlockVision is the single external dependency.

### Per-query cost (Phase 1)

- **BlockVision API calls per address lookup:** ~2–3 (coins + activity + price). Well within paid tier limits.
- **DefiLlama price fetches:** already cached in engine via `priceCache`. Spec 6 should respect that cache and not cold-fetch on every entity card.
- **Anthropic / model cost per entity card:** ~500–1500 input tokens + ~200 output tokens = sub-cent. Negligible at Phase 1 volume.

### Auth + rate-limit model (locked)

- **Public read** for the first **5 entity queries per IP per hour** (unauthenticated).
- After 5: **soft sign-in gate** ("Sign in to keep exploring — it's free").
- Signed-in **free tier**: 50 entity queries per hour, no batch queries, no flow graphs.
- Signed-in **paid tier (~$20/mo or $200/yr)**: unlimited entity queries, batch up to 50 wallets, flow graphs unlocked, label-submission priority.
- **Cloudflare in front** of all `/explorer/`* routes for bot filtering and DDoS resilience.
- **Pricing dollar amount is a marketing call** — engineering only needs to know the gate exists and where it sits in the request path.

### SEO upside

Every Sui address becomes a potential Audric landing page (`audric.ai/address/<addr>`, etc.). At ~10M unique active Sui addresses and growing, this is the largest organic-discovery surface available without paid acquisition. **Public read of the first 5 queries is what unlocks it** — gating sign-in earlier kills SEO. This is the trade-off the auth model is optimized around.

---

## Resolved decisions (founder review, Apr 2026)


| #   | Question                                    | Decision                                                                                                                                                                                                                                                                                |
| --- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Entity URL auth model                       | Public read for first **5 queries/IP/hour**, then soft sign-in gate. Cloudflare in front.                                                                                                                                                                                               |
| 2   | Indexer build vs. buy                       | **Dropped.** BlockVision (paid, in place) is the sole external source for stranger-entity queries. The in-house indexer is privacy-by-design (opt-in agents only) and powers the differentiated own-wallet view — not a public-explorer fallback. See "The two Explorer modes" section. |
| 3   | Product taxonomy                            | **Sixth product: Audric Explorer.** Five Products line becomes Six Products line.                                                                                                                                                                                                       |
| 4   | LLM context budget for batch queries        | **Server-side aggregation only.** Tools return summary shapes to the LLM; raw rows go to the card data only. ~500 tokens for a 14-wallet batch instead of ~50k.                                                                                                                         |
| 5   | Pricing / tiering                           | **Free w/ rate limits + paid tier.** Free signed-in: 50 queries/hr, no batch. Paid: unlimited + batch + graphs + label priority.                                                                                                                                                        |
| 6   | Naming                                      | **Audric Explorer.** "Search" too broad, "Trace" too narrow.                                                                                                                                                                                                                            |
| 7   | Phase 2 vs. Phase 3 ordering                | Phase 1 → Phase 2 → Phase 3 as drafted. **Phase 3 gets its own dedicated sub-spec (Spec 6.3) before build.**                                                                                                                                                                            |
| 8   | Linked-wallet aggregation (own-wallet mode) | **Merged view by default.** All linked wallets shown as one Explorer surface. Per-wallet inspection via direct `/explorer/address/<addr>` URL. Inherits the `FullPortfolioCanvas` aggregation pattern.                                                                                  |
| 9   | Backfill on first sign-in                   | **Yes — backfill from BlockVision into local `Transaction` table.** Capped at 90 days. Runs async after sign-in completes; dashboard loads immediately with a "Loading your full history…" banner. New `Agent.backfillCompletedAt` column tracks state.                                 |


## All architectural questions resolved

**The earlier "what does the indexer cover" question is closed.** Indexer review (April 2026) confirmed it is checkpoint-based, polls every 2s, scoped to opt-in agents only via `getKnownAgents()`, indexes `Transaction` / `ProtocolFeeLedger` / `YieldSnapshot` / `Agent.lastSeen`, exposes data via direct Postgres reads from the same NeonDB the web app uses. **Privacy-by-design and not modifiable for Spec 6.** Locked into the architecture as the own-wallet enrichment layer; never used for public-explorer queries.

Two follow-up questions surfaced during the indexer review and are now also locked:

### Resolved: Linked-wallet aggregation in own-wallet mode

**Decision: merged view across all linked wallets is the default.** A signed-in user with multiple `LinkedWallet` rows sees their full portfolio as a single Explorer view by default.

Reasoning:

- The `FullPortfolioCanvas` analytics surface already aggregates across linked wallets for the same user — Spec 6 inherits that pattern, no new UX paradigm to teach.
- "Show me my portfolio" intuitively means *one* view; forcing the user to pick which of their 10 wallets to inspect adds clicks for the most common case.
- Per-wallet inspection remains trivially accessible: the user navigates to the direct URL `/explorer/address/<specific-addr>`, which auto-scopes to that single wallet (this is the same URL surface anonymous visitors use, just authenticated and enriched). No extra UI required.
- Aligns with the Audric brand: "the agent understands you." Your linked wallets are all yours; the agent treats them as one financial picture.

Implementation note: the merged view is the *default landing*. The "drill into one wallet" path is the existing `/explorer/address/<addr>` URL — Phase 1 ships both surfaces simultaneously because the URL routing is needed for the public-explorer case anyway.

### Resolved: Backfill on first sign-in

**Decision: yes, backfill the new agent's history from BlockVision into the local `Transaction` table on first sign-in. Cap at 90 days. Run async after sign-in completes.**

Reasoning:

- First-sign-in is the most fragile onboarding moment. An empty dashboard with "your data will populate over the next 24 hours" kills retention. The rich own-wallet Explorer view should feel instant from minute one.
- BlockVision already has the data; backfill is just a one-time normalization into our existing `Transaction` schema. No new endpoints required, no new infra.
- One-time per new agent, bounded — much cheaper than the alternative ("wait and let the indexer catch up over days").

Two guardrails:

1. **Cap at 90 days of history.** A power user with years of Sui activity could have 10k+ historical txs; backfilling all of it would burn BlockVision quota and take minutes. 90 days matches the activity-summary card's display window — anything older is rare and can be fetched on-demand from BlockVision when the user scrolls back in their tx history. Spec 6.3 should validate this cap against real usage data; loosen if 90 days proves too restrictive for real users.
2. **Run async, post sign-in.** The dashboard loads immediately with whatever is already indexed (zero rows for brand-new agents); a subtle "Loading your full history…" banner shows until backfill completes. Typical backfill expected to finish in <30s for a fresh wallet, <2 min for a heavy one. The user can interact with the rest of the dashboard the entire time — backfill is non-blocking.

Implementation note: backfill triggers as part of the existing `t2000 init` / first-zkLogin agent-creation flow. Tracked via a new `Agent.backfillCompletedAt` column so the dashboard banner can render conditionally. Does not require any change to the indexer's known-agents filter — by the time backfill runs, the address is already an opt-in agent.

---

## Success metrics

Measurable post-launch. Each metric ties to a use case from the Vision section.


| Metric                                                                                            | Phase 1 target  | Phase 3 target                 |
| ------------------------------------------------------------------------------------------------- | --------------- | ------------------------------ |
| Time to first card on `/address/<x>`                                                              | < 3 s p50       | < 2 s p50                      |
| Single-entity query "what does this wallet do?" success rate (rendered card + coherent narrative) | ≥ 90%           | ≥ 95%                          |
| Multi-wallet batch (≤ 20 wallets) end-to-end latency                                              | n/a             | < 30 s p95                     |
| % of pasted tx digests classified into a non-"On-chain" label                                     | n/a             | ≥ 85%                          |
| % of top-100 Sui addresses with human-readable labels                                             | ≥ 50% (curated) | ≥ 95%                          |
| Direct entity-URL traffic share of new chat sessions                                              | —               | ≥ 20% by month 3               |
| MAU lift attributable to entity URLs                                                              | —               | ≥ 30% over baseline by month 6 |


---

## Risks

- **BlockVision is now a single point of failure for public-explorer mode.** The in-house indexer is *not* a fallback (privacy-by-design). An outage or API change takes down all stranger-entity queries. Mitigations: (a) abstract data access behind an interface so a second provider could be swapped in without rewriting tools, (b) cache hot entity responses aggressively (top tokens, recent address lookups), (c) own-wallet mode survives BlockVision outages because the indexer is independent — graceful degradation message for public-explorer mode only, (d) Phase 4+ contingency to spin up a dedicated Explorer indexer if BlockVision ever proves insufficient.
- **LLM hallucination on third-party wallets.** Today's correctness work has been about the user's *own* wallet, where we have full ground truth. On a stranger's wallet, the LLM has more room to invent context ("this looks like a market maker," "this is probably a phishing victim"). Need explicit prompt guardrails: *never speculate about identity beyond resolved labels.* The server-side-aggregation pattern (decision 4) is also a guardrail here — the LLM can only narrate the aggregates it's given.
- **Address-label liability.** Labeling `0x…` as "Suspected scam" or "Mt. Gox creditor wallet" is a legal exposure surface. Phase 4 community labels need a moderation policy and a takedown flow before launch. **Action item:** legal review before opening community submissions.
- **Scope creep into NFT / governance / cross-chain.** Each is a quarter of work. The non-goals section above is load-bearing — defend it during planning.
- **Cannibalizes SuiScan attention but doesn't replace functionality immediately.** Phase 1 only ships Address / Tx / Token cards; SuiScan still wins on raw data depth (object inspection, package source, validator stats). Don't market as "SuiScan replacement" until at least Phase 3 ships.
- **Public-read SEO surface as a rate-limit attack vector.** 5 queries/IP/hour unauthenticated is permissive. Cloudflare bot filtering required from day one — not a "we'll add it later" item.

---

## What this spec depends on

- **Spec 1 (Harness Correctness, v1.4–v1.5.x):** ✅ shipped 0.46.3 — gives us the recipe system and tx classification pipeline that Phase 1 builds on.
- **Spec 2 (TBD — observability + tool-group routing):** likely concurrent. Spec 6 adds 9 tools across phases, which exercises Spec 2's routing assumptions. Coordinate so they don't collide.
- **Spec 3 (TBD):** unknown impact, likely independent.

---

## Suggested next steps

All architectural decisions are locked. Scheduling can proceed:

1. **Spike: validate Phase 1 UX on one address** (~1 day). Hand-build `/explorer/address/[addr]/page.tsx` with hardcoded BlockVision calls + the existing Balance Card. Goals: prove the pre-rendered card UX feels right, measure end-to-end BlockVision latency, confirm own-wallet mode delta vs. public-explorer mode is visually obvious to the user.
2. **Six Products taxonomy update** (~2 hours, marketing). Update homepage, READMEs, system prompts, pitch deck, litepaper to add Audric Explorer as the sixth product. Tagline can lock during this pass. Should ship before Phase 1 GA, not necessarily before Phase 1 kickoff.
3. **Phase 1 implementation sub-spec** (~1 day, written right before kickoff). Nail down: BlockVision endpoint contracts for the 3 Phase 1 tools, exact card schemas, the 3 `chain_inspect`_* recipe YAMLs, the backfill-on-sign-in trigger location in the auth flow, and the merged-wallet-view UI shell.
4. **Phase 1 kickoff** — ~3 weeks engineering, single developer. Ships single-entity URLs, 3 new tools, 3 new cards, 3 new recipes, Cloudflare in front, 5/hr public read gate, two-mode rendering (own-wallet enriched vs. public-explorer baseline), backfill-on-sign-in (90-day cap, async).
5. **Phase 2 kickoff** — ~3 weeks. Token primitives (`holders`, `flows`, `supply`), `TokenRegistry` + `AddressLabel` Postgres tables, ~100 hand-curated address labels seeded.
6. **Spec 6.3 (Phase 3 sub-spec)** — written *after* Phase 1 ships and we have real BlockVision usage data. Then Phase 3 build (~4–6 weeks).
7. **Phase 4 (labeling at scale)** — runs in parallel with Phase 3 ops, no hard dependency.

**Total wall time to Lana-equivalent demo (Phase 3 GA):** ~12–14 weeks from Phase 1 kickoff, assuming sequential phases and one engineer.

---

## Appendix: reference flows from the user

> *"I sent the addresses of the winners of the Trump dinner, asked if they moved the Trump token after winning the dinner. It correctly gave me the outflows for 4 out of 14 wallets. I think it's going to save me hours of work."* — Lana.ai user testimonial cited by t2000 founder, Apr 2026.

This is **Use case 4** in the Vision section. It's the only flow on this spec that requires Phase 3 infrastructure. Every demo, pitch, and marketing beat for Chain Explorer should feature this query.