# audric — Agent Security Specs

*Inspired by Kite's agent-native authorization model, adapted for t2000 + Sui*

*Version 1.0 · April 2026 · Confidential*

---

## Context

After reviewing [Kite's architecture](https://docs.gokite.ai/get-started-why-kite/architecture-and-design-pillars), three concepts are worth adopting before autonomous agent features (DCA, auto-compound, scheduled actions) go live:

1. **Scoped allowance** — time-bounded, feature-gated, daily-limited `allowance.move`
2. **Session authorization** — short-lived signed intents for each cron execution
3. **MPP reputation layer** — trust scores from payment history, tiered rate limits

These specs are ordered by dependency. Build in sequence: 1 → 2 → 3.

**What we're NOT adopting from Kite:**
- State channels (Sui + Enoki makes gas costs negligible — this solves a problem we don't have)
- Their own L1 chain (we have Sui)
- Full DID / Verifiable Credentials stack (architectural astronautics at 100 users)
- BIP-32 hierarchical agent wallets (overkill for current scope)

---

## Current state vs target

| Capability | Current | Target (these specs) | Status |
|---|---|---|---|
| Allowance scoping | ~~Unbounded~~ Feature-gated, time-bounded, daily-limited | Feature-gated, time-bounded, daily-limited | ✅ Spec 1 done |
| Cron writes on-chain | Not implemented | Scoped intent per execution | ✅ Spec 2 done |
| Admin key exposure | Permanent master key for all deductions | 60s TTL per operation, nonce-locked | ✅ Spec 2 done |
| Autonomous op audit trail | None | IntentLog table — every execution traceable | ✅ Spec 2 done |
| MPP caller identity | Wallet address, anonymous | Reputation score + tiered rate limits | Spec 3 — Phase 3+ |

---

## Spec 1 — Scoped allowance (allowance.move)

**Status:** ✅ DONE — Fresh deploy on mainnet (`0xd775…968ad`). Scoped allowance with `permitted_features` bitmask, `expires_at`, `daily_limit`, daily spend tracking. 23 Move tests + 24 SDK tests. Config + treasury migrated. Server + indexer redeployed.
**Effort:** ~3 hours (actual: ~1 day including deploy + migration)
**Must ship before:** Any cron deduction code is written

### Why

The existing `Allowance` struct lets the `AdminCap` holder call `deduct()` with any feature code and any amount indefinitely. Before DCA and auto-compound go live, the contract needs to enforce what the admin is permitted to do — not just the application layer.

### Struct changes

Add four fields to the existing `Allowance<phantom T>` struct:

```move
public struct Allowance<phantom T> has key {
    id: UID,
    owner: address,
    balance: Balance<T>,
    total_deposited: u64,
    total_spent: u64,
    created_at: u64,
    // --- new fields ---
    permitted_features: u64,   // bitmask — which feature codes are allowed
    expires_at: u64,           // ms timestamp — 0 = no expiry (legacy compat)
    daily_limit: u64,          // max deduction per 24h window, 0 = no limit
    daily_spent: u64,          // accumulated spend in current 24h window
    window_start: u64,         // ms timestamp of current window start
}
```

### Feature bitmask constants

Add to `packages/contracts/sources/constants.move`:

```move
// Feature codes — u8 for the feature tag in deduct(), u64 bit position for bitmask
const FEATURE_BRIEFING: u8       = 0;   // bit 0 — morning briefing ($0.005/day)
const FEATURE_YIELD_ALERT: u8    = 1;   // bit 1 — yield optimisation alert ($0.002)
const FEATURE_PAYMENT_ALERT: u8  = 2;   // bit 2 — inbound payment alert ($0.001)
const FEATURE_ACTION_REMIND: u8  = 3;   // bit 3 — scheduled action reminder ($0.001)
const FEATURE_SESSION: u8        = 4;   // bit 4 — AI session charge ($0.01)
const FEATURE_AUTO_COMPOUND: u8  = 5;   // bit 5 — auto-compound execution
const FEATURE_DCA: u8            = 6;   // bit 6 — DCA / scheduled action execution
const FEATURE_HF_ALERT: u8       = 7;   // bit 7 — health factor alert (free, logged only)

// Convenience: all current features permitted
const FEATURES_ALL: u64 = 0xFF;         // bits 0–7 set

// Max feature code the contract will accept (leaves room to grow)
const MAX_FEATURE: u8 = 63;
```

### Updated `create` function

User specifies permitted features and optional expiry at creation time:

```move
public fun create<T>(
    permitted_features: u64,  // e.g. constants::FEATURES_ALL
    expires_at: u64,          // ms timestamp, 0 = no expiry
    daily_limit: u64,         // USDC units, 0 = no limit
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let now = sui::clock::timestamp_ms(clock);
    let allowance = Allowance<T> {
        id: object::new(ctx),
        owner: ctx.sender(),
        balance: balance::zero<T>(),
        total_deposited: 0,
        total_spent: 0,
        created_at: now,
        // new fields
        permitted_features,
        expires_at,
        daily_limit,
        daily_spent: 0,
        window_start: now,
    };
    let allowance_id = object::id(&allowance);
    events::emit_allowance_created(ctx.sender(), allowance_id);
    transfer::share_object(allowance);
}
```

### Updated `deduct` function

Three new guards added before the existing balance check:

```move
public fun deduct<T>(
    allowance: &mut Allowance<T>,
    config: &Config,
    _: &AdminCap,
    amount: u64,
    feature: u8,
    clock: &Clock,        // new — needed for expiry + window checks
    ctx: &mut TxContext,
) {
    core::assert_version(config);
    assert!(!core::is_paused(config), errors::paused!());
    assert!(amount > 0, errors::zero_amount!());
    assert!(feature <= constants::MAX_FEATURE, errors::invalid_feature!());

    let now = sui::clock::timestamp_ms(clock);

    // Guard 1 — expiry check
    if (allowance.expires_at > 0) {
        assert!(now < allowance.expires_at, errors::allowance_expired!());
    };

    // Guard 2 — feature permission check
    let feature_bit = 1u64 << (feature as u64);
    assert!(
        allowance.permitted_features & feature_bit != 0,
        errors::feature_not_permitted!()
    );

    // Guard 3 — daily limit with rolling 24h window
    if (allowance.daily_limit > 0) {
        let window_ms = 86_400_000u64; // 24h in ms
        if (now >= allowance.window_start + window_ms) {
            allowance.daily_spent = 0;
            allowance.window_start = now;
        };
        assert!(
            allowance.daily_spent + amount <= allowance.daily_limit,
            errors::daily_limit_exceeded!()
        );
        allowance.daily_spent = allowance.daily_spent + amount;
    };

    // Existing balance check + deduct logic unchanged
    assert!(allowance.balance.value() >= amount, errors::insufficient_allowance!());

    let deducted = coin::from_balance(allowance.balance.split(amount), ctx);
    allowance.total_spent = allowance.total_spent + amount;

    events::emit_allowance_deducted(
        allowance.owner,
        amount,
        feature,
        allowance.balance.value(),
    );

    transfer::public_transfer(deducted, ctx.sender());
}
```

### New errors

Add to `packages/contracts/sources/errors.move`:

```move
const ALLOWANCE_EXPIRED: u64       = 1010;
const FEATURE_NOT_PERMITTED: u64   = 1011;
const DAILY_LIMIT_EXCEEDED: u64    = 1012;
```

### Migration for existing allowances

Existing `Allowance` objects on mainnet don't have the new fields. Owner calls this once to add scoping with safe defaults:

```move
/// One-time migration — owner adds scoping to an existing allowance.
/// Defaults: all features permitted, no expiry, no daily limit.
public fun migrate_add_scoping<T>(
    allowance: &mut Allowance<T>,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(allowance.owner == ctx.sender(), errors::not_owner!());
    allowance.permitted_features = constants::FEATURES_ALL;
    allowance.expires_at = 0;
    allowance.daily_limit = 0;
    allowance.daily_spent = 0;
    allowance.window_start = sui::clock::timestamp_ms(clock);
}
```

### New read functions

```move
public fun permitted_features<T>(allowance: &Allowance<T>): u64 {
    allowance.permitted_features
}

public fun expires_at<T>(allowance: &Allowance<T>): u64 {
    allowance.expires_at
}

public fun daily_limit<T>(allowance: &Allowance<T>): u64 {
    allowance.daily_limit
}

public fun daily_spent<T>(allowance: &Allowance<T>): u64 {
    allowance.daily_spent
}

public fun is_feature_permitted<T>(allowance: &Allowance<T>, feature: u8): bool {
    let feature_bit = 1u64 << (feature as u64);
    allowance.permitted_features & feature_bit != 0
}

public fun is_expired<T>(allowance: &Allowance<T>, clock: &Clock): bool {
    if (allowance.expires_at == 0) return false;
    sui::clock::timestamp_ms(clock) >= allowance.expires_at
}
```

### Onboarding flow changes (audric web app)

The allowance creation UI should expose these controls with safe defaults:

- **Permitted features:** pre-selected based on which features user enables during onboarding. Don't expose as a raw bitmask — each toggle maps to a bit.
- **Expires at:** default to no expiry. Optional "auto-renew every 90 days" toggle for security-conscious users.
- **Daily limit:** default to $0.50/day (covers ~100 sessions or ~100 briefings). Power user setting.

---

## Spec 2 — Session authorization for autonomous cron execution

**Status:** ✅ DONE — ScopedIntent type + intent-builder (sign/verify) in SDK, IntentLog table in NeonDB, `executeWithIntent()` wrapper in server, `ADMIN_PRIVATE_KEY` in AWS Secrets Manager, cron task definition updated with DATABASE_URL + admin key. 10 tests passing.
**Effort:** ~1 day (actual: ~0.5 day)
**Must ship before:** DCA, auto-compound, or scheduled actions write on-chain

### Why

The ECS notification worker currently has no way to call `deduct()` — the `AdminCap` private key in AWS Secrets Manager is the only mechanism, and it's permanent and unbounded. Before any cron job executes real money operations, each execution needs a short-lived signed authorization that:

- Scopes to a specific user + feature + max amount + 60s time window
- Prevents a compromised or buggy cron from affecting all users
- Creates an audit trail of what was authorized vs what was executed
- Makes replay attacks impossible via single-use nonces

### Architecture

```
ECS Scheduler (EventBridge)
  └── triggers notification-worker with NOTIFICATION_TYPE env var
        └── for each eligible user:
              1. Build ScopedIntent (off-chain, signed by admin key)
              2. Verify intent is still valid
              3. Execute PTB (deduct + operation)
              4. Log intent hash + result to NeonDB IntentLog
```

No new chain primitives. Uses Ed25519 signing already present in the stack via `SPONSOR_PRIVATE_KEY` / `GAS_STATION_PRIVATE_KEY` pattern.

### ScopedIntent type

Add to `packages/sdk/src/types/scoped-intent.ts`:

```typescript
export interface ScopedIntent {
  version: 1;
  userId: string;            // NeonDB User.id
  walletAddress: string;     // Sui address of the Allowance owner
  allowanceObjectId: string; // Sui object ID of their Allowance<USDC>
  featureCode: number;       // maps to u8 feature tag in allowance.move
  maxAmount: number;         // USDC units — hard ceiling for this execution
  issuedAt: number;          // Unix ms
  expiresAt: number;         // Unix ms — 60s TTL for cron deductions
  nonce: string;             // 32 random bytes hex — single-use, prevents replay
  signature: string;         // Ed25519 sig by admin key over canonical JSON
}

// Feature code constants — mirror allowance.move
export const FEATURE_BRIEFING       = 0;
export const FEATURE_YIELD_ALERT    = 1;
export const FEATURE_PAYMENT_ALERT  = 2;
export const FEATURE_ACTION_REMIND  = 3;
export const FEATURE_SESSION        = 4;
export const FEATURE_AUTO_COMPOUND  = 5;
export const FEATURE_DCA            = 6;
export const FEATURE_HF_ALERT       = 7;
```

### Intent builder

Add to `packages/sdk/src/auth/intent-builder.ts`:

```typescript
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

export function buildScopedIntent(
  adminKeypair: Ed25519Keypair,
  params: {
    userId: string;
    walletAddress: string;
    allowanceObjectId: string;
    featureCode: number;
    maxAmount: number;
    ttlMs?: number; // default 60_000 (60 seconds)
  }
): ScopedIntent {
  const now = Date.now();
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');

  const intent: Omit<ScopedIntent, 'signature'> = {
    version: 1,
    userId: params.userId,
    walletAddress: params.walletAddress,
    allowanceObjectId: params.allowanceObjectId,
    featureCode: params.featureCode,
    maxAmount: params.maxAmount,
    issuedAt: now,
    expiresAt: now + (params.ttlMs ?? 60_000),
    nonce,
  };

  const message = canonicalIntentBytes(intent);
  const signature = adminKeypair.sign(message);

  return { ...intent, signature: Buffer.from(signature).toString('hex') };
}

export function verifyScopedIntent(
  intent: ScopedIntent,
  adminPublicKeyHex: string,
): boolean {
  // Check expiry first — fast path
  if (Date.now() > intent.expiresAt) return false;

  const message = canonicalIntentBytes({
    version: intent.version,
    userId: intent.userId,
    walletAddress: intent.walletAddress,
    allowanceObjectId: intent.allowanceObjectId,
    featureCode: intent.featureCode,
    maxAmount: intent.maxAmount,
    issuedAt: intent.issuedAt,
    expiresAt: intent.expiresAt,
    nonce: intent.nonce,
  });

  return verifyEd25519Signature(message, intent.signature, adminPublicKeyHex);
}

// Deterministic serialization — sorted keys, no whitespace
function canonicalIntentBytes(intent: object): Uint8Array {
  const sorted = Object.fromEntries(
    Object.entries(intent).sort(([a], [b]) => a.localeCompare(b))
  );
  return new TextEncoder().encode(JSON.stringify(sorted));
}
```

### IntentLog table

Add to Prisma schema (NeonDB, audric web app DB):

```prisma
model IntentLog {
  id            String   @id @default(cuid())
  intentNonce   String   @unique    // prevents replay — checked before execution
  userId        String
  featureCode   Int
  maxAmount     Int                 // USDC units ceiling for this intent
  expiresAt     DateTime
  status        String              // issued | executed | failed | expired
  txDigest      String?             // Sui tx digest on success
  actualAmount  Int?                // what was actually deducted
  error         String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  user          User     @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([status])
  @@index([createdAt])
}
```

### Cron execution pattern

This is the standard pattern for every autonomous operation. Apply consistently to auto-compound, DCA, scheduled actions, and session charges:

```typescript
// packages/ecs/notification-worker/src/lib/execute-with-intent.ts

export async function executeWithIntent<T>(params: {
  user: User;
  featureCode: number;
  maxAmount: number;
  operation: (intent: ScopedIntent) => Promise<{ digest: string; actualAmount: number }>;
}): Promise<void> {
  const { user, featureCode, maxAmount, operation } = params;

  // 1. Check nonce hasn't been used (replay protection)
  const intent = buildScopedIntent(adminKeypair, {
    userId: user.id,
    walletAddress: user.walletAddress,
    allowanceObjectId: user.allowanceObjectId,
    featureCode,
    maxAmount,
    ttlMs: 60_000,
  });

  const existing = await db.intentLog.findUnique({
    where: { intentNonce: intent.nonce },
  });
  if (existing) {
    console.error('Nonce collision — skipping', intent.nonce);
    return;
  }

  // 2. Log intent before executing — audit trail even on crash
  await db.intentLog.create({
    data: {
      intentNonce: intent.nonce,
      userId: user.id,
      featureCode: intent.featureCode,
      maxAmount: intent.maxAmount,
      expiresAt: new Date(intent.expiresAt),
      status: 'issued',
    },
  });

  try {
    // 3. Verify intent is still valid
    if (!verifyScopedIntent(intent, process.env.ADMIN_PUBLIC_KEY!)) {
      throw new Error('Intent verification failed — expired or invalid signature');
    }

    // 4. Execute the operation (PTB built by caller)
    const result = await operation(intent);

    // 5. Mark executed
    await db.intentLog.update({
      where: { intentNonce: intent.nonce },
      data: {
        status: 'executed',
        txDigest: result.digest,
        actualAmount: result.actualAmount,
      },
    });

  } catch (err) {
    await db.intentLog.update({
      where: { intentNonce: intent.nonce },
      data: { status: 'failed', error: String(err) },
    });
    // don't rethrow — one user failure shouldn't stop the batch
    console.error(`Intent failed for user ${user.id}:`, err);
  }
}
```

### Usage example — auto-compound

```typescript
// packages/ecs/notification-worker/src/handlers/auto-compound.ts

async function runAutoCompound(users: User[]) {
  for (const user of users) {
    const summary = await sdk.getFinancialSummary(user.walletAddress);
    if (summary.pendingRewardsUsd < 0.10) continue;

    await executeWithIntent({
      user,
      featureCode: FEATURE_AUTO_COMPOUND,
      maxAmount: 10_000, // $0.01 USDC session fee — the compound itself is gasless
      operation: async (intent) => {
        // PTB: claim_rewards → NAVX/CERT→USDC swap → NAVI deposit → deduct allowance
        return await sdk.autoCompound({
          walletAddress: user.walletAddress,
          allowanceObjectId: user.allowanceObjectId,
          intentNonce: intent.nonce, // embedded in PTB memo for on-chain audit
        });
      },
    });
  }
}
```

### Usage example — AI session charge

```typescript
// packages/ecs/notification-worker/src/handlers/session-charge.ts

async function runSessionCharges(users: User[]) {
  // Batch: charge users who had at least one conversation in the last hour
  const activeUsers = await db.conversationLog.groupBy({
    by: ['userId'],
    where: {
      createdAt: { gte: new Date(Date.now() - 3_600_000) },
      role: 'user',
    },
    _count: { userId: true },
  });

  for (const { userId, _count } of activeUsers) {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user?.allowanceObjectId) continue;

    const sessions = _count.userId;
    const totalCharge = sessions * 10_000; // $0.01 per session in USDC units

    await executeWithIntent({
      user,
      featureCode: FEATURE_SESSION,
      maxAmount: totalCharge,
      operation: async (intent) => {
        return await sdk.deductAllowance({
          allowanceObjectId: user.allowanceObjectId,
          amount: totalCharge,
          featureCode: FEATURE_SESSION,
          intentNonce: intent.nonce,
        });
      },
    });
  }
}
```

### Security properties of this design

| Property | How it's achieved |
|---|---|
| Time-bounded | 60s TTL — expired intent rejected before PTB is built |
| Single-use | Nonce stored in IntentLog — duplicate nonce rejected immediately |
| Amount-bounded | `maxAmount` in intent — PTB builder rejects if deduction exceeds this |
| Feature-scoped | `featureCode` in intent — allowance.move rejects wrong feature bit |
| Auditable | IntentLog has full lifecycle: issued → executed/failed, with tx digest |
| Blast radius limited | Compromised cron can execute within one 60s window per user per operation |

---

## Spec 3 — MPP reputation layer

**Status:** New build — data exists in ProtocolFeeLedger, scoring logic needed
**Effort:** ~2 days
**Builds on:** Existing wallet-address identity in mpp.t2000.ai
**When to build:** Phase 3+ — doesn't block anything critical before that

### Why

Currently any wallet can call any MPP endpoint with no rate differentiation. As mpp.t2000.ai opens to external developers, you want to reward reliable callers with better access without requiring KYC. `ProtocolFeeLedger` already tracks `agentAddress`, `operation`, `feeAmount`, `timestamp` per call — the scoring data is there.

### Reputation score model

Add to `apps/gateway/src/reputation/scorer.ts`:

```typescript
export interface ReputationScore {
  walletAddress: string;
  score: number;            // 0–1000
  tier: 'new' | 'trusted' | 'established' | 'premium';
  totalPayments: number;
  totalVolumeUsdc: number;
  daysSinceFirst: number;
  failureRate: number;      // failed calls / total calls
  lastActivity: Date;
  computedAt: Date;
}

// Tier thresholds and rate limits (requests per minute)
export const TIERS = {
  new:         { minScore: 0,    rateLimit: 10,   label: 'New'         },
  trusted:     { minScore: 100,  rateLimit: 60,   label: 'Trusted'     },
  established: { minScore: 400,  rateLimit: 300,  label: 'Established' },
  premium:     { minScore: 800,  rateLimit: 1000, label: 'Premium'     },
} as const;

export function computeScore(entries: ProtocolFeeLedgerEntry[]): number {
  if (entries.length === 0) return 0;

  const totalPayments   = entries.length;
  const totalVolume     = entries.reduce((sum, e) => sum + e.feeAmount, 0);
  const failures        = entries.filter(e => e.status === 'failed').length;
  const failureRate     = failures / totalPayments;
  const firstEntry      = entries.sort((a, b) => a.timestamp - b.timestamp)[0];
  const daysSinceFirst  = (Date.now() - firstEntry.createdAt.getTime()) / 86_400_000;

  // Weighted scoring — four components totalling max 1000
  const paymentScore    = Math.min(totalPayments / 100, 1) * 300;   // max 300
  const volumeScore     = Math.min(totalVolume / 1_000_000, 1) * 300; // max 300 ($10 USDC = full score)
  const longevityScore  = Math.min(daysSinceFirst / 90, 1) * 200;   // max 200 (90 days)
  const reliabilityScore = Math.max(0, 1 - failureRate * 10) * 200; // max 200 (10% failure = 0)

  return Math.round(paymentScore + volumeScore + longevityScore + reliabilityScore);
}

export function scoreToTier(score: number): ReputationScore['tier'] {
  if (score >= TIERS.premium.minScore)     return 'premium';
  if (score >= TIERS.established.minScore) return 'established';
  if (score >= TIERS.trusted.minScore)     return 'trusted';
  return 'new';
}
```

### ReputationCache table

Add to NeonDB (mpp gateway DB):

```prisma
model ReputationCache {
  walletAddress    String   @id
  score            Int
  tier             String   // new | trusted | established | premium
  totalPayments    Int
  totalVolumeUsdc  Int      // stored in USDC units (6 decimals)
  failureRate      Float
  daysSinceFirst   Float
  lastActivity     DateTime
  computedAt       DateTime
  expiresAt        DateTime // recompute every hour

  @@index([tier])
  @@index([expiresAt])
}
```

### Reputation service

Add to `apps/gateway/src/reputation/service.ts`:

```typescript
export async function getOrComputeReputation(
  walletAddress: string
): Promise<ReputationScore> {
  // Check cache first
  const cached = await db.reputationCache.findUnique({
    where: { walletAddress },
  });

  if (cached && cached.expiresAt > new Date()) {
    return {
      walletAddress: cached.walletAddress,
      score: cached.score,
      tier: cached.tier as ReputationScore['tier'],
      totalPayments: cached.totalPayments,
      totalVolumeUsdc: cached.totalVolumeUsdc,
      failureRate: cached.failureRate,
      daysSinceFirst: cached.daysSinceFirst,
      lastActivity: cached.lastActivity,
      computedAt: cached.computedAt,
    };
  }

  // Compute from ProtocolFeeLedger
  const entries = await db.protocolFeeLedger.findMany({
    where: { agentAddress: walletAddress },
    orderBy: { createdAt: 'asc' },
  });

  const score = computeScore(entries);
  const tier  = scoreToTier(score);

  const rep: ReputationScore = {
    walletAddress,
    score,
    tier,
    totalPayments:   entries.length,
    totalVolumeUsdc: entries.reduce((sum, e) => sum + e.feeAmount, 0),
    failureRate:     entries.filter(e => e.status === 'failed').length / Math.max(entries.length, 1),
    daysSinceFirst:  entries.length > 0
      ? (Date.now() - entries[0].createdAt.getTime()) / 86_400_000
      : 0,
    lastActivity:    entries.length > 0 ? entries[entries.length - 1].createdAt : new Date(),
    computedAt:      new Date(),
  };

  // Cache for 1 hour
  await db.reputationCache.upsert({
    where:  { walletAddress },
    update: { ...rep, expiresAt: new Date(Date.now() + 3_600_000) },
    create: { ...rep, expiresAt: new Date(Date.now() + 3_600_000) },
  });

  return rep;
}
```

### Gateway middleware

Add to `apps/gateway/src/middleware/reputation-gate.ts`:

```typescript
import rateLimit from 'express-rate-limit';

// Rate limiter factory — one per tier, cached on startup
const limiters = Object.fromEntries(
  Object.entries(TIERS).map(([tier, config]) => [
    tier,
    rateLimit({
      windowMs: 60_000,         // 1 minute window
      max: config.rateLimit,
      keyGenerator: (req) => req.headers['x-wallet-address'] as string,
      message: {
        error: 'rate_limit_exceeded',
        tier,
        limit: config.rateLimit,
        upgrade: 'Increase your reputation score by making more successful payments',
      },
    }),
  ])
);

export async function reputationGate(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const walletAddress = req.headers['x-wallet-address'] as string;

  if (!walletAddress) {
    return res.status(401).json({
      error: 'missing_wallet_address',
      message: 'Include your Sui wallet address in the x-wallet-address header',
    });
  }

  const rep = await getOrComputeReputation(walletAddress);

  // Attach reputation to request for logging downstream
  (req as any).reputation = rep;

  // Apply tier-appropriate rate limiter
  limiters[rep.tier](req, res, next);
}
```

### Reputation endpoint

Expose so developers can check their own score:

```typescript
// GET /reputation/:walletAddress
router.get('/reputation/:walletAddress', async (req, res) => {
  const rep = await getOrComputeReputation(req.params.walletAddress);
  res.json({
    walletAddress: rep.walletAddress,
    score: rep.score,
    tier: rep.tier,
    rateLimit: TIERS[rep.tier].rateLimit,
    stats: {
      totalPayments:   rep.totalPayments,
      totalVolumeUsdc: rep.totalVolumeUsdc,
      failureRate:     rep.failureRate,
      daysSinceFirst:  rep.daysSinceFirst,
    },
    nextTier: getNextTierInfo(rep.score),
  });
});

function getNextTierInfo(score: number) {
  const tierEntries = Object.entries(TIERS).sort(([, a], [, b]) => a.minScore - b.minScore);
  const next = tierEntries.find(([, t]) => t.minScore > score);
  if (!next) return null;
  return {
    tier: next[0],
    pointsNeeded: next[1].minScore - score,
    rateLimit: next[1].rateLimit,
  };
}
```

### Progressive trust — how new callers level up

| Tier | Score threshold | Rate limit | Typical path to reach it |
|---|---|---|---|
| New | 0 | 10 req/min | Starting point for all wallets |
| Trusted | 100 | 60 req/min | ~33 successful $0.01 calls over a few days |
| Established | 400 | 300 req/min | ~100 calls + $1 volume + 30 days activity |
| Premium | 800 | 1,000 req/min | Sustained usage over 90 days, low failure rate |

No manual approval. No KYC. Trust is earned through verifiable behaviour — exactly the Kite progressive authorization model applied to your existing payment ledger.

---

## Implementation sequence

```
Week 0 (pre-work, before any cron deduction code)
  └── Spec 1: allowance.move scoping (~3 hours)
       ├── Add 4 fields to Allowance struct
       ├── Add feature bitmask constants
       ├── Update deduct() with 3 new guards
       ├── Add migrate_add_scoping() for existing allowances
       └── Add 3 new error codes

Week 1–2 (before DCA / auto-compound go live)
  └── Spec 2: session authorization (~1 day)
       ├── ScopedIntent type + intent-builder.ts
       ├── IntentLog Prisma table
       ├── executeWithIntent() wrapper
       └── Wire into auto-compound + session charge handlers

Phase 3+ (when opening MPP to external developers)
  └── Spec 3: MPP reputation layer (~2 days)
       ├── ReputationCache Prisma table
       ├── scorer.ts + service.ts
       ├── reputationGate middleware
       └── GET /reputation/:walletAddress endpoint
```

## Key decisions

- No Kite DID stack — Ed25519 signing already in the stack is sufficient
- No state channels — Enoki gas sponsorship makes them unnecessary on Sui
- Admin key stays in AWS Secrets Manager — scoping happens at the contract + intent layer, not key rotation
- IntentLog is append-only — never delete records, they're the audit trail
- Reputation cache TTL is 1 hour — fresh enough for rate limiting, cheap enough to compute
- `FEATURES_ALL = 0xFF` as default for existing users — no breaking change to current allowance behaviour

---

## Bug Fix — Digest replay protection in `@suimpp/mpp` server verification

**Backlog issue:** #2
**Package:** `@suimpp/mpp` — `packages/mpp/src/server.ts` lines 39–119
**Severity:** High — direct revenue leak, not theoretical
**Effort:** ~half a day (actual: ~0.5 day)
**Status:** ✅ DONE — DigestStore interface + InMemoryDigestStore in `@suimpp/mpp` v0.5.0. UpstashDigestStore in gateway (Upstash Redis, 24h TTL, atomic SET NX). Replay check in verify() before on-chain validation. 6 new tests. logPayment now logs errors + passes sender. Must ship before: Any production traffic on mpp.t2000.ai

### The problem

The `verify()` callback in `@suimpp/mpp` validates a transaction on-chain — checks it succeeded, went to the right recipient, and was the right amount. It does not track whether that TX digest has already been used. The same digest can be presented against multiple challenges: **pay once, consume N API calls**.

This is a direct revenue leak. A caller pays $0.01 for one MPP call, takes the TX digest, and replays it against Suno, Runway, or Heygen endpoints — getting $2+ of generation for $0.01. The gateway's margin is the first thing erased. At scale it's the entire business model of pay-per-call.

The `mppx` package already solves this for the `tempo` method via `assertHashUnused` / `markHashUsed` + a store interface. This fix ports the same pattern to the `sui` method.

### Severity assessment

Higher than the backlog item implies for two reasons:

**1. No expiry on Sui TX digests.** Sui finalizes in ~400ms but a digest remains valid on-chain indefinitely. There's no native "this TX is too old" check — a digest from 6 months ago is as valid as one from 2 seconds ago. The in-memory Map TTL is your only protection, which means the TTL must cover your entire accepted payment window (minimum 24 hours), not just a session.

**2. Multi-instance ECS breaks in-memory protection entirely.** mpp.t2000.ai runs on ECS Fargate. Two task instances = two independent Maps = zero cross-instance replay protection. The in-memory store is only safe for single-instance deployments. Production requires a shared store.

### The fix

**1. Add `DigestStore` interface to `SuiServerOptions`**

```typescript
// packages/mpp/src/server.ts

export interface DigestStore {
  has(digest: string): Promise<boolean>;
  set(digest: string, ttlMs?: number): Promise<void>;
}

export interface SuiServerOptions {
  recipient: string;
  minAmount?: number;
  network?: 'mainnet' | 'testnet';
  store?: DigestStore;         // optional in dev, required in prod — see below
  digestTtlMs?: number;        // how long to remember used digests — default 86_400_000 (24h)
}
```

**2. Enforce store requirement based on environment**

```typescript
// In SuiServer constructor or verify() setup:

function resolveStore(options: SuiServerOptions): DigestStore {
  if (options.store) return options.store;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[suimpp] DigestStore is required in production. ' +
      'Provide a Redis or DB-backed store via SuiServerOptions.store. ' +
      'The default in-memory store is single-instance only and unsafe for multi-instance deployments.'
    );
  }

  // Development / test — warn and use in-memory
  console.warn(
    '[suimpp] No DigestStore provided. Using in-memory store. ' +
    'This is NOT safe for production or multi-instance deployments.'
  );
  return new InMemoryDigestStore(options.digestTtlMs ?? 86_400_000);
}
```

**3. Default in-memory store with TTL**

```typescript
// packages/mpp/src/stores/in-memory-digest-store.ts

export class InMemoryDigestStore implements DigestStore {
  private store = new Map<string, number>(); // digest → expiresAt ms
  private readonly ttlMs: number;

  constructor(ttlMs = 86_400_000) { // default 24h
    this.ttlMs = ttlMs;
    // Periodic cleanup to prevent unbounded memory growth
    setInterval(() => this.evict(), 3_600_000); // evict every hour
  }

  async has(digest: string): Promise<boolean> {
    const expiresAt = this.store.get(digest);
    if (expiresAt === undefined) return false;
    if (Date.now() > expiresAt) {
      this.store.delete(digest);
      return false;
    }
    return true;
  }

  async set(digest: string, ttlMs?: number): Promise<void> {
    this.store.set(digest, Date.now() + (ttlMs ?? this.ttlMs));
  }

  private evict(): void {
    const now = Date.now();
    for (const [digest, expiresAt] of this.store.entries()) {
      if (now > expiresAt) this.store.delete(digest);
    }
  }
}
```

**4. Redis store for production (mpp.t2000.ai)**

```typescript
// packages/mpp/src/stores/redis-digest-store.ts

import { createClient, RedisClientType } from 'redis';

export class RedisDigestStore implements DigestStore {
  private readonly prefix = 'mpp:digest:';
  private readonly ttlSeconds: number;

  constructor(
    private readonly client: RedisClientType,
    ttlMs = 86_400_000,
  ) {
    this.ttlSeconds = Math.ceil(ttlMs / 1000);
  }

  async has(digest: string): Promise<boolean> {
    const val = await this.client.get(this.prefix + digest);
    return val !== null;
  }

  async set(digest: string): Promise<void> {
    // SET key 1 EX ttlSeconds NX — atomic, only sets if not already present
    const result = await this.client.set(
      this.prefix + digest,
      '1',
      { EX: this.ttlSeconds, NX: true }
    );
    // NX means SET only succeeds if key doesn't exist
    // If result is null, key already existed — this is a replay attempt
    if (result === null) {
      throw new Error(`Digest already used: ${digest}`);
    }
  }
}
```

Note: using `SET ... NX` (set-if-not-exists) in Redis makes the `has()` + `set()` pattern atomic — no race condition between the check and the mark. This matters under concurrent requests.

**5. Updated `verify()` — add replay check**

```typescript
// packages/mpp/src/server.ts — inside verify() after on-chain validation passes

// On-chain checks pass at this point — tx succeeded, right recipient, right amount.
// Now check replay protection.

const digestStore = resolveStore(this.options);

// Check — has this digest been used before?
const alreadyUsed = await digestStore.has(txDigest);
if (alreadyUsed) {
  throw new MppError({
    code: 'DIGEST_ALREADY_USED',
    message: 'This transaction digest has already been used to pay for an API call.',
    digest: txDigest,
  });
}

// Mark — consume the digest before returning the receipt
// This MUST happen before the receipt is returned, not after.
// If this throws (e.g. Redis is down), the call fails safely rather than allowing a free call.
await digestStore.set(txDigest);

// Return receipt as normal
return { ... };
```

**Important:** the `set()` call must happen before returning the receipt, not after. If the store write fails (Redis down, etc.), the verify call fails and the caller retries with the same digest — which is fine, they paid. The alternative (set after returning) risks giving a free call if the set fails.

### Exports

Add both stores to the package public exports:

```typescript
// packages/mpp/src/index.ts
export { InMemoryDigestStore } from './stores/in-memory-digest-store';
export { RedisDigestStore }    from './stores/redis-digest-store';
export type { DigestStore }    from './server';
```

### mpp.t2000.ai integration

```typescript
// apps/gateway/src/server.ts

import { createClient } from 'redis';
import { RedisDigestStore } from '@suimpp/mpp';

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

const mppServer = new SuiMppServer({
  recipient: process.env.MPP_GATEWAY_TREASURY_ADDRESS,
  network: 'mainnet',
  store: new RedisDigestStore(redis, 86_400_000), // 24h TTL
  digestTtlMs: 86_400_000,
});
```

Redis is a single new infrastructure dependency — one ElastiCache instance (or Redis Cloud free tier for dev). At MPP call volumes for the foreseeable future, a `cache.t3.micro` (~$12/mo) is more than sufficient.

### Test cases to add

```typescript
describe('digest replay protection', () => {
  it('accepts a valid digest on first use', async () => {
    // ... standard verify pass
  });

  it('rejects the same digest on second use', async () => {
    await mppServer.verify(challenge, validDigest); // first use — passes
    await expect(mppServer.verify(challenge2, validDigest))
      .rejects.toThrow('DIGEST_ALREADY_USED');
  });

  it('accepts the same digest after TTL expiry', async () => {
    const shortTtlStore = new InMemoryDigestStore(100); // 100ms TTL
    // ... verify, wait 200ms, verify again — should pass
  });

  it('rejects expired digest even if valid on-chain', async () => {
    // digest is valid on-chain but older than accepted window
    // depends on whether you add a max-age check — see note below
  });

  it('throws on missing store in production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => new SuiMppServer({ recipient: '0x...' }))
      .toThrow('DigestStore is required in production');
  });
});
```

### Optional: max-age check on TX timestamp

The current fix prevents replay of already-used digests. A complementary hardening is to reject digests older than N hours even if unused — limits the window in which a stolen digest can be replayed.

```typescript
// In verify(), after fetching the TX from on-chain:
const txAgeMs = Date.now() - txTimestampMs;
const maxAgeMs = this.options.maxDigestAgeMs ?? 3_600_000; // default 1 hour
if (txAgeMs > maxAgeMs) {
  throw new MppError({
    code: 'DIGEST_EXPIRED',
    message: `Transaction is too old (${Math.round(txAgeMs / 60_000)} minutes). Max age: ${maxAgeMs / 60_000} minutes.`,
  });
}
```

This is a separate option from `digestTtlMs` — `maxDigestAgeMs` controls how old a TX can be when presented, `digestTtlMs` controls how long used digests are remembered. Set `maxDigestAgeMs` to something reasonable (1–4 hours) and you can reduce `digestTtlMs` to match, keeping the Redis store small.

### Summary of changes

| File | Change |
|---|---|
| `packages/mpp/src/server.ts` | Add `DigestStore` interface, `resolveStore()`, replay check in `verify()` |
| `packages/mpp/src/stores/in-memory-digest-store.ts` | New file — default dev store with TTL + eviction |
| `packages/mpp/src/stores/redis-digest-store.ts` | New file — production store with atomic NX set |
| `packages/mpp/src/index.ts` | Export both stores + `DigestStore` type |
| `apps/gateway/src/server.ts` | Wire `UpstashDigestStore` into gateway server |
| `packages/mpp/src/server.test.ts` | Add replay protection test cases |

---

*audric.ai | t2000.ai | mpp.t2000.ai | April 2026 | Confidential*
