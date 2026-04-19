# Mysten Labs Call — April 15, 2026

> **⚠️ HISTORICAL DOCUMENT — PRE-SIMPLIFICATION**
>
> Talking points prepared on April 15, 2026 — three days before the simplification was decided. Everything below describes the autonomous-agent thesis (Copilot, scheduled actions / DCA, on-chain allowance contract, 4-stage trust ladder, ECS cron executing while users sleep, morning briefings) that was retired on April 18, 2026.
>
> The current Audric is chat-first: 40 tools, daily-free billing, no autonomous execution, no allowance contract in the active flow. The Allowance Move type still exists on-chain (owner-recoverable), but no shipping flow creates or charges it. See [`spec/SIMPLIFICATION_RATIONALE.md`](./spec/SIMPLIFICATION_RATIONALE.md) and [`AUDRIC_FINANCE_SIMPLIFICATION_SPEC_v1.4.md`](./AUDRIC_FINANCE_SIMPLIFICATION_SPEC_v1.4.md).
>
> Read this only as context for what was claimed in that conversation. Do not treat it as a current product description.

## Opening

A week ago Audric was a reactive chatbot — you ask, it does. This week it became an autonomous financial agent. It reads your on-chain history, builds a memory of who you are, earns trust incrementally per pattern, and acts with increasing autonomy as that trust compounds. Financial memory and autonomous action aren't two features — they're one product.

Users sign in with Google, get a non-custodial USDC wallet in 3 seconds, never see an address or a gas fee. Under the hood, Sui's 400ms finality, zkLogin, Enoki sponsorship, native USDC, and our scoped allowance contract are the moats. A Web2 version of this is just another neobank.

50 tools. Chain-native memory. 4-stage trust ladder. On-chain allowance contract. ECS cron executing while users sleep. 250 tests passing. All live in production, shipped in a week.

---

## What's New

### The brain — Reasoning + Intelligence

The engine now adapts per user, per session, per message. A complexity classifier routes ~60% of queries to Haiku (5x cheaper), the rest to Sonnet. 7 step guards run before every tool — safety, financial risk, and UX checks that inject warnings into confirmation cards before the user approves anything. 7 YAML skill recipes handle multi-step operations like swap-and-save or emergency-withdraw.

At session start, the engine assembles a dynamic context block from 5 intelligence pillars: financial profiling (nightly inference over chain + conversation data), proactive awareness (idle USDC, low HF, rate changes), episodic memory (fact extraction from conversations, 50-memory cap, persists forever), conversation state machine (6 states in Redis), and post-action self-evaluation (did the action match intent?). The model sees a rich, personalized picture before the user types anything.

### The memory — Chain-native learning

7 classifiers run nightly over AppEvent + PortfolioSnapshot data: deposit patterns, risk profiles, yield behavior, borrow behavior, near-liquidation events, large transactions, compounding streaks. Even if a user never explains themselves in chat, Audric learns their patterns from on-chain behavior. "You save ~$50 every Friday" comes from chain analysis, not conversation. 90-day lookback, Jaccard dedup, 50-memory cap per user.

### The loop — Autonomous actions

5 behavioral pattern detectors. 4-stage trust ladder: detected → proposed in chat → confirmed with email notifications → fully autonomous. User-created DCA and behavior-detected patterns share the same execution pipeline. Circuit breaker auto-pauses after 3 consecutive failures. Every execution is idempotency-keyed to prevent double-execution on container restarts.

This is the core of the product — covered in detail in the "Autonomous Agent Flow" section below.

### The harness — Performance + cost

**Streaming tool execution** — `EarlyToolDispatcher` fires read-only tools mid-stream the moment their JSON is complete, rather than waiting for the model to finish generating. 2-4 second latency reduction on every multi-tool turn.

**Microcompact** — Deduplicates identical tool calls across turns. If `balance_check` ran 3 turns ago with the same inputs, the old result becomes a back-reference. Saves 2-5k tokens per duplicate, zero LLM cost.

**Tool budgeting** — Large results (transaction history, DeFi pool lists) are truncated with re-call hints instead of bloating context.

### On-chain — Allowance + ScopedIntent

**Scoped allowance contract** (`allowance.move`, mainnet at `0xd775…968ad`) — Feature bitmask (8 codes), daily limit with rolling 24h window, expiry. Users control exactly what the admin key can do at the Move level, not just the application level.

**ScopedIntent** — Every autonomous cron execution builds a short-lived signed intent: 60s TTL, single-use nonce, Ed25519 signed, scoped to one user + one feature + max amount. Logged in IntentLog for full audit trail.

### Other

- **Public wallet report** — `audric.ai/report/[address]`, any Sui address, no signup, OG images for social sharing
- **8 interactive canvases** — yield projector, health simulator, DCA planner, portfolio timeline, heatmap, spending breakdown, watch address, full portfolio
- **ECS cron** — 3 Fargate task groups (hourly/daily-chain/daily-intel), 16+ jobs, EventBridge schedules
- **Permission presets** — conservative / balanced / aggressive, per-operation USD thresholds

---

## MPP Gateway (mpp.t2000.ai)

Pay-per-request API marketplace. 40 services, 88 endpoints (OpenAI, Anthropic, Brave, ElevenLabs, Suno, Runway, etc.), paid in USDC on Sui via `@suimpp/mpp`.

**Request flow:**

```
Request → reputation check (wallet tier) → 402 challenge (HMAC-bound)
→ client pays on Sui → retries with digest → verify() on server
→ digest replay check (Redis SET NX) → on-chain verification
→ proxy to upstream → log payment → return response
```

**Reputation tiers** (score-based, no KYC — log-weighted from payment count + volume + age - failures):

| Tier | Score | Rate limit |
|------|-------|-----------|
| New | 0 | 10/min |
| Trusted | 100+ | 60/min |
| Established | 400+ | 300/min |
| Premium | 800+ | 1,000/min |

**Digest replay protection:** Upstash Redis, `SET NX` + 24h TTL. Each tx digest is single-use.

**Recent `@suimpp/mpp` change:** Removed `digestTtlMs` from `SuiServerOptions` — TTL is now the store implementation's concern, not the library's. Our gateway uses 24h in Redis; another deployer could use permanent storage. Also removed `registryUrl`/`serverUrl` — reporting is via `onPayment` callback only.

---

## How We Use Sui

| Primitive | Usage |
|-----------|-------|
| **zkLogin + Enoki** | Google OAuth → Sui address. Ephemeral keys, gas sponsored, users never see gas. |
| **Non-custodial** | Keys never leave browser/CLI. Server sees addresses only. |
| **Scoped allowance** | `allowance.move` at `0xd775…968ad`. Bitmask + daily limit enforced on-chain. |
| **NAVI** | MCP for reads, thin tx builders for writes. No SDK dependency. |
| **Cetus** | Only protocol SDK. Isolated to one file. Routes across 20+ DEXs. |
| **USDC** | Native Circle USDC. All savings/payments/autonomy denominated in USDC. |
| **Finality** | 400ms. "Save $50" → confirm → receipt in <2s. |
| **RPC** | `@mysten/sui@2.x`, BlockVision 1,000 CUPS. |

---

## Autonomous Agent Flow

How a user goes from manual actions to a fully autonomous agent — the core product story.

### Phase 1: Observation

User manually saves $50 USDC via chat on three consecutive Fridays. They don't configure anything. Nightly cron runs pattern detection — `recurring_save` detector scans AppEvents (90-day lookback), finds 3 Friday deposits at ~$50, confidence 0.91. Creates a `ScheduledAction` at stage 0 with `confirmationsRequired: 3`.

### Phase 2: Proposal

Next chat session, the pending proposal is injected into the system prompt. Audric surfaces it conversationally when contextually relevant — not pushed, not a popup:

> "I've noticed you save about $50 every Friday. Want me to automate this? I'll confirm with you the first 3 times, then handle it silently."

User says yes. Stage advances to 2 (confirming). Action appears in the Automations panel.

### Phase 3: Trust Building

Friday 9am — ECS hourly cron fires. Finds the action: enabled, not yet autonomous. Runs fail-closed safety checks. Since it hasn't graduated, it skips execution and stores a `schedule_confirm` event. User sees "Confirm scheduled action — $50.00 pending" in the Activity feed with a link to Automations. Opens Automations, sees the trust ladder: `○○○`. Clicks "Confirm save." Trust ladder: `●○○`.

This repeats for 2 more Fridays. After 3 confirmations: `●●●` — action graduates to autonomous.

### Phase 4: Full Autonomy

Friday 9am — cron fires. Action is autonomous. Safety checks pass. Engine builds a `ScopedIntent` (60s TTL, single-use nonce, scoped to this user + save feature + $50 max). Logs intent as "issued." Executes the PTB — deducts allowance on-chain via `allowance.move`, then deposits $50 USDC into NAVI. Updates IntentLog to "executed" with tx digest. Sends email notification.

Next morning's briefing: *"Auto-saved $50 yesterday. Savings: $2,650 at 5.0% APY. Earning $0.36/day."*

### Safety — Two Independent Layers

Every autonomous execution passes through **both layers**, independently:

**Application layer (engine):**

| Check | Purpose |
|-------|---------|
| Balance | Sufficient USDC for the action |
| Health factor | Won't drop below 1.8 |
| Permission tier | Within user's auto-execute threshold |
| Daily limit | Cumulative autonomous spend within budget |
| Idempotency | Not already executed this period |
| Circuit breaker | <3 consecutive failures (else auto-pause + email) |

**On-chain layer (`allowance.move`):**

```
deduct() guards:
  1. Expiry         → reject if expired
  2. Feature bitmask → reject if bit not set (8 features, 0xFF = all)
  3. Daily window    → rolling 24h, reject if daily_spent + amount > limit
  4. Balance         → reject if insufficient
```

If the engine approves but the contract rejects (wrong feature, limit exceeded, expired), the transaction fails safely. Even a compromised admin key can only use features the user permitted, within their daily limit, before expiry. User can revoke at any time via `withdraw()`.

---

## Trust & Permission Presets

The engine resolves permission tier at dispatch time: convert amount to USD → check operation thresholds → auto / confirm / explicit.

| Operation | Conservative | Balanced (default) | Aggressive |
|-----------|-------------|-------------------|-----------|
| **Save** | auto < $5, confirm < $100 | auto < $50, confirm < $1,000 | auto < $100, confirm < $2,000 |
| **Send** | auto < $5, confirm < $50 | auto < $10, confirm < $200 | auto < $25, confirm < $500 |
| **Swap** | auto < $5, confirm < $50 | auto < $25, confirm < $300 | auto < $50, confirm < $1,000 |
| **Borrow** | auto: never, confirm < $100 | auto: never, confirm < $500 | auto < $10, confirm < $1,000 |
| **Daily cap** | $100 | $200 | $500 |

Borrows never auto-execute in conservative/balanced. Users pick a preset in Settings — engine uses their config at every dispatch. The daily cap is a global ceiling across all auto-executed actions, separate from the on-chain allowance daily limit.

---

## Infrastructure

| Component | Stack |
|-----------|-------|
| Web app | Vercel (zkLogin, chat, dashboard) |
| Server | ECS Fargate (sponsor API, gas station, fee ledger) |
| Cron | 3 × ECS Fargate + EventBridge (hourly/daily-chain/daily-intel) |
| MPP Gateway | Vercel (40 services, reputation, digest replay) |
| Database | NeonDB × 2 |
| Cache | Upstash Redis (state, rate limiting, digest store) |
| Email | Resend (briefings, alerts, autonomous notifications) |
| RPC | BlockVision 1,000 CUPS |
| LLM | Anthropic (Haiku ~60%, Sonnet ~40%) |

**Scaling:** Handles ~500 users today. For 10k: token bucket rate limiter, cache shared data (APY), pre-filter before RPC, user sharding, higher RPC tier. Self-hosting: fine-tune at 500+ users, hybrid routing at 1k+, target 70-80% LLM cost reduction.

---

## Questions for Mysten

1. **gRPC timeline** — 38 callsites to migrate. July 31 deprecation. When is gRPC GA? We want to start June 16.
2. **Enoki server-side signing** — Path to Enoki-sponsored server-triggered txs for zkLogin users? Would simplify autonomous execution.
3. **RPC at scale** — `getOwnedObjects` + `multiGetObjects` per user in hourly cron. Recommended batch providers? Batch endpoints planned?
4. **`@mysten/sui` v2** — Breaking changes coming? How different is the gRPC API surface?
5. **Move feedback** — `allowance.move` shared object, bitmask + rolling daily window. Planning `modify_permissions` (owner-only). Thoughts?
6. **Ecosystem** — Anyone else doing agent-native allowance contracts or trust-earned autonomy on Sui?

---

## Demo

- `audric.ai/report/[address]` — public wallet report, no signup
- Dashboard — morning briefing, activity feed, autonomous history
- Chat — "What's my balance?" → streaming parallel tools
- Canvas — "Show my portfolio timeline" → interactive chart
- Automations — trust ladder, confirm button, execution history
- Permissions — preset picker, daily limit
- MPP — `mpp.t2000.ai/api/services` — 88 endpoints

---

*audric.ai · t2000.ai · mpp.t2000.ai · April 2026 · Confidential*
