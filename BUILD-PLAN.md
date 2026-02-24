# t2000 — Build Plan

**Target:** Mainnet. March 4, 2026 hackathon deadline.

---

## 1. Repository Structure

```
t2000/
├── packages/
│   ├── sdk/                          # @t2000/sdk — Core TypeScript SDK
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts            # Bundle config (ESM + CJS)
│   │   ├── vitest.config.ts
│   │   └── src/
│   │       ├── index.ts              # Public exports
│   │       ├── t2000.ts              # Main T2000 class (entry point)
│   │       ├── types.ts              # Shared types (BalanceResponse, SendResult, etc.)
│   │       ├── constants.ts          # MIST_PER_SUI, fee rates, contract IDs, CLOCK_ID
│   │       ├── errors.ts             # T2000Error class + all error codes
│   │       ├── wallet/
│   │       │   ├── keyManager.ts     # Ed25519 keypair gen, AES-256-GCM encrypt/decrypt
│   │       │   ├── send.ts           # USDC transfer (PTB construction)
│   │       │   ├── balance.ts        # Balance query (available, savings, gasReserve)
│   │       │   └── history.ts        # Transaction history (local + RPC)
│   │       ├── protocols/
│   │       │   ├── suilend.ts        # Save, withdraw, borrow, repay, rates, positions, maxWithdraw/maxBorrow
│   │       │   └── cetus.ts          # Swap (with on-chain slippage via sqrt_price_limit, priceImpact calculation)
│   │       ├── gas/
│   │       │   ├── manager.ts        # Gas resolution: self-funded → auto-topup → sponsored → fail
│   │       │   ├── autoTopUp.ts      # USDC→SUI auto-swap when SUI < 0.05
│   │       │   └── gasStation.ts     # Gas Station client (calls backend API)
│   │       ├── fees/
│   │       │   └── protocolFee.ts    # Fee calculation + PTB commands for on-chain collection
│   │       ├── funding/
│   │       │   └── tracker.ts        # Yield tracking (Suilend accrual index + polling fallback)
│   │       ├── events/
│   │       │   └── emitter.ts        # EventEmitter (yield, balanceChange, health*, error)
│   │       └── utils/
│   │           ├── sui.ts            # SuiClient factory, address validation/truncation
│   │           ├── format.ts         # MIST→SUI, BPS→%, display formatting
│   │           └── retry.ts          # Exponential backoff, RPC failover
│   │
│   ├── cli/                          # @t2000/cli — CLI wrapper
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts              # Entry point (#!/usr/bin/env node)
│   │       ├── program.ts            # Commander.js program setup
│   │       ├── commands/
│   │       │   ├── init.ts           # Create wallet (encrypted by default)
│   │       │   ├── send.ts           # Send USDC
│   │       │   ├── balance.ts        # Show balance breakdown
│   │       │   ├── save.ts           # Deposit to savings (+ supply alias)
│   │       │   ├── withdraw.ts       # Withdraw from savings
│   │       │   ├── borrow.ts         # Borrow against savings
│   │       │   ├── repay.ts          # Repay borrow
│   │       │   ├── swap.ts           # Exchange assets
│   │       │   ├── history.ts        # Transaction history
│   │       │   ├── earnings.ts       # Yield summary
│   │       │   ├── fundStatus.ts     # Savings status
│   │       │   ├── health.ts         # Health factor
│   │       │   ├── deposit.ts        # Funding instructions
│   │       │   ├── address.ts        # Show address
│   │       │   ├── export.ts         # Export key (encrypted file or --stdout)
│   │       │   ├── import.ts         # Import key
│   │       │   ├── config.ts         # Show/set config
│   │       │   └── serve.ts          # Start Hono HTTP API server
│   │       ├── output.ts             # Human vs --json output formatting
│   │       └── prompts.ts            # Passphrase, confirmation prompts (inquirer)
│   │
│   └── contracts/                    # Move smart contracts
│       ├── Move.toml
│       ├── sources/
│       │   ├── t2000.move            # Package init, creates AdminCap + Config + Treasury
│       │   ├── admin.move            # Pause/unpause, fee rate updates, fee recipient
│       │   ├── constants.move        # BPS_DENOMINATOR, MAX_FEE_BPS, operation codes
│       │   ├── errors.move           # Abort codes (EPAUSED, EZERO_AMOUNT, etc.)
│       │   ├── events.move           # FeeCollected, ConfigUpdated, Paused, FeesWithdrawn
│       │   └── treasury.move         # collect_fee, withdraw_fees, view functions
│       └── tests/
│           ├── treasury_tests.move   # Fee collection, withdrawal, edge cases
│           └── admin_tests.move      # Pause, fee updates, access control
│
├── apps/
│   └── web/                          # Next.js on Vercel
│       ├── package.json
│       ├── next.config.ts
│       ├── tailwind.config.ts
│       ├── prisma/
│       │   └── schema.prisma         # Website-only schema (if needed, otherwise shares server prisma)
│       ├── app/
│       │   ├── layout.tsx
│       │   └── (site)/               # Landing page
│       │       ├── page.tsx          # Hero, terminal demo, features
│       │       └── components/       # Landing page components
│
│   └── server/                       # Backend API + Indexer (ECS Fargate)
│       ├── src/
│       │   ├── index.ts             # Hono app entry + indexer boot
│       │   ├── routes/
│       │   │   ├── sponsor.ts       # POST /api/sponsor — wallet init + hashcash
│       │   │   ├── gas.ts           # POST /api/gas — gas sponsorship
│       │   │   └── health.ts        # GET /api/health — service + indexer + pool status
│       │   ├── services/
│       │   │   ├── sponsor.ts       # Sponsor wallet signing (serialized in-process)
│       │   │   ├── gasStation.ts    # Gas pool management, circuit breaker
│       │   │   ├── indexer.ts       # Checkpoint-based indexer loop
│       │   │   └── priceCache.ts    # In-memory SUI price cache + TWAP + circuit breaker
│       │   ├── db/
│       │   │   ├── prisma.ts        # Prisma client singleton
│       │   │   └── queries.ts       # Typed database queries
│       │   └── lib/
│       │       ├── wallets.ts       # Sponsor + Gas Station wallets (from env)
│       │       ├── hashcash.ts      # Proof-of-work verification
│       │       └── checkpoint.ts    # Sui checkpoint fetcher + event parser
│       ├── Dockerfile               # ECS Fargate container image
│       ├── prisma/
│       │   └── schema.prisma        # Full DB schema (MVP + indexer tables)
│       └── package.json
│
├── infra/                            # AWS infrastructure
│   ├── Dockerfile                    # Shared Dockerfile (if needed)
│   └── task-definition.json          # ECS Fargate task definition
│
├── turbo.json                        # Turborepo config
├── pnpm-workspace.yaml               # pnpm workspaces
├── package.json                      # Root dependencies (turbo, prettier, eslint)
├── tsconfig.base.json                # Shared TS config
├── .env.example                      # All required env vars
├── CLAUDE.md                         # AI coding standards
├── t2000-sdk-spec-v2.0.md            # Product spec (v4.0)
└── BUILD-PLAN.md                     # This document
```

### Infrastructure Split

| Component | Infra | Why |
|-----------|-------|-----|
| **Backend API (Sponsor + Gas Station + Indexer)** | ECS Fargate (1 task) | Hot wallet signing needs serialized coin access. In-memory SUI price TWAP for circuit breaker. Checkpoint-based indexer runs as a background loop in the same process. One container, one process — no concurrency headaches. |
| **Website (Landing page)** | Vercel | Static-ish Next.js. Edge-optimized. |
| **Database** | NeonDB | Serverless Postgres. Accessible from both ECS and Vercel. |
| **Dashboard** (v1.1) | Vercel | Next.js frontend, reads from NeonDB. Stateless. |

### Why ECS Fargate for Backend

The Gas Station and Sponsor sign transactions using hot wallets. In serverless, concurrent invocations can grab the same coin object → `ObjectVersionConflict`. With a single ECS Fargate task, all requests flow through one Node process — coin selection is naturally serialized. No pre-splitting coins, no retries, no fragility.

The checkpoint-based indexer also requires a persistent process to maintain its polling loop and in-memory cursor. Running it in the same Fargate task keeps infrastructure minimal (one container does everything).

**Single Fargate task exposes:**
- `POST /api/sponsor` — wallet creation with hashcash
- `POST /api/gas` — gas sponsorship (bootstrap + auto-topup + fallback)
- `GET /api/health` — service health + pool status + indexer checkpoint lag
- In-memory: SUI price cache (TWAP), rate limiting, circuit breaker
- Background: checkpoint-based indexer loop

### Checkpoint-Based Indexer

The gold standard for on-chain indexing. Sui produces sequentially numbered checkpoints (batches of finalized transactions). The indexer processes them in order with exactly-once semantics.

```
┌────────────────────────────────────────────────────────────────┐
│                  Checkpoint-Based Indexer                       │
│                                                                │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │ Checkpoint   │    │ Event        │    │ Database         │  │
│  │ Fetcher      │───►│ Parser       │───►│ Writer           │  │
│  │              │    │              │    │                  │  │
│  │ sui_getCheck │    │ Filter by    │    │ Upsert positions │  │
│  │ points(from) │    │ t2000 pkg ID │    │ Insert txns      │  │
│  │              │    │              │    │ Update cursor    │  │
│  └──────┬───────┘    └──────────────┘    └──────────────────┘  │
│         │                                                      │
│         ▼                                                      │
│  ┌──────────────────────────────────────┐                     │
│  │ Cursor Table (NeonDB)                │                     │
│  │                                      │                     │
│  │ indexer_cursor                       │                     │
│  │   cursor_name: 'main'               │                     │
│  │   last_checkpoint: 87_420_153       │                     │
│  │   last_processed_at: 2026-02-19T... │                     │
│  └──────────────────────────────────────┘                     │
└────────────────────────────────────────────────────────────────┘
```

**How it works:**

1. On boot, read `last_checkpoint` from `indexer_cursor` table
2. Poll `sui_getCheckpoints(cursor: last_checkpoint, limit: 100)` every 2 seconds
3. For each checkpoint, fetch full transaction blocks with `showEvents: true`
4. Filter events by `t2000` package ID (fee collections, config changes)
5. Also filter transactions involving known agent addresses (sends, saves, swaps)
6. Parse and upsert to `positions`, `transactions`, `yield_snapshots` tables
7. Update `indexer_cursor.last_checkpoint` in the same DB transaction (atomic)
8. On crash/restart, resume from stored checkpoint — no gaps, no duplicates

**Why checkpoint-based > event polling:**

| | Checkpoint-Based | Event Polling (suix_queryEvents) |
|---|---|---|
| **Ordering** | Guaranteed sequential | May miss events during RPC hiccups |
| **Crash recovery** | Resume from exact checkpoint | Cursor may be stale, events lost |
| **Completeness** | Processes ALL transactions in block | Only sees events matching filter |
| **Reprocessing** | Reset cursor to any point | No built-in replay |
| **Lag monitoring** | `latest_checkpoint - last_processed` = exact lag | No native lag metric |

**Indexer processes these event types:**

| Source | Event | Action |
|--------|-------|--------|
| t2000 contract | `FeeCollected` | Insert into `protocol_fee_ledger` |
| t2000 contract | `ConfigUpdated` | Log admin activity |
| t2000 contract | `FeeChangeProposed` | Track pending governance |
| Suilend | Deposit/Withdraw | Upsert `positions` table |
| Cetus | Swap | Insert into `transactions` |
| Sui native | Transfer (USDC) | Insert send/receive into `transactions` |
| Any | Gas sponsor txs | Update `gas_ledger` with actual costs |

### Package Manager & Build

- **pnpm workspaces** — monorepo dependency management
- **Turborepo** — build orchestration, caching
- **tsup** — SDK/CLI bundling (ESM + CJS)
- **Vitest** — testing

---

## 2. Move Smart Contracts

### Package Config (Move.toml)

```toml
[package]
name = "t2000"
edition = "2024.beta"
version = "1.0.0"

# Sui, MoveStdlib, and SuiSystem are implicitly imported (Sui 1.45+)
[dependencies]

[addresses]
t2000 = "0x0"
```

### Types & Shared Objects

Patterns adopted from Clank: version checking on shared objects, timelocked fee changes, two-step admin transfer.

```move
// t2000.move — created in init(), shared globally

/// Protocol configuration. Shared object.
struct Config has key {
    id: UID,
    version: u64,                        // package version for upgrade safety
    save_fee_bps: u64,                   // default: 10 (0.1%)
    swap_fee_bps: u64,                   // default: 10 (0.1%)
    borrow_fee_bps: u64,                 // default: 5 (0.05%)
    fee_recipient: address,              // t2000 treasury address
    paused: bool,
    // Timelocked fee changes (7-day delay)
    pending_save_fee_bps: Option<u64>,
    pending_swap_fee_bps: Option<u64>,
    pending_borrow_fee_bps: Option<u64>,
    fee_change_effective_at: Option<u64>,
}

/// Protocol treasury. Holds collected fees. Shared object.
/// Generic over coin type to support USDC (MVP) and future assets.
struct Treasury<phantom T> has key {
    id: UID,
    version: u64,
    admin: address,
    pending_admin: Option<address>,      // two-step admin transfer
    balance: Balance<T>,
    total_collected: u64,
    total_withdrawn: u64,
    created_at: u64,
}

/// Admin capability. Owned by deployer. Required for all admin operations.
struct AdminCap has key, store {
    id: UID,
    created_at: u64,
}
```

### Init Function

```move
// t2000.move — One-Time Witness pattern (from Clank)

public struct T2000 has drop {}

fun init(_otw: T2000, ctx: &mut TxContext) {
    let deployer = ctx.sender();
    let now = ctx.epoch_timestamp_ms();

    transfer::transfer(
        AdminCap { id: object::new(ctx), created_at: now },
        deployer
    );

    transfer::share_object(Config {
        id: object::new(ctx),
        version: constants::VERSION!(),
        save_fee_bps: constants::DEFAULT_SAVE_FEE_BPS!(),
        swap_fee_bps: constants::DEFAULT_SWAP_FEE_BPS!(),
        borrow_fee_bps: constants::DEFAULT_BORROW_FEE_BPS!(),
        fee_recipient: deployer,
        paused: false,
        pending_save_fee_bps: option::none(),
        pending_swap_fee_bps: option::none(),
        pending_borrow_fee_bps: option::none(),
        fee_change_effective_at: option::none(),
    });
}

/// Create a Treasury for a specific coin type. Called once per asset after deploy.
public fun create_treasury<T>(_admin: &AdminCap, ctx: &mut TxContext) {
    let now = ctx.epoch_timestamp_ms();
    transfer::share_object(Treasury<T> {
        id: object::new(ctx),
        version: constants::VERSION!(),
        admin: ctx.sender(),
        pending_admin: option::none(),
        balance: balance::zero<T>(),
        total_collected: 0,
        total_withdrawn: 0,
        created_at: now,
    });
}
```

After deploying, call `create_treasury<USDC>()` to create the USDC treasury.

### Constants

Uses `public macro fun` for compile-time inlining (pattern from Clank).

```move
// constants.move
module t2000::constants;

/// Current package version — increment on each upgrade
public macro fun VERSION(): u64 { 1 }

// Operation codes
public macro fun OP_SAVE(): u8 { 0 }
public macro fun OP_SWAP(): u8 { 1 }
public macro fun OP_BORROW(): u8 { 2 }

// Fee constants
public macro fun BPS_DENOMINATOR(): u64 { 10_000 }
public macro fun MAX_FEE_BPS(): u64 { 1_000 }     // 10% absolute max
public macro fun DEFAULT_SAVE_FEE_BPS(): u64 { 10 }   // 0.1%
public macro fun DEFAULT_SWAP_FEE_BPS(): u64 { 10 }   // 0.1%
public macro fun DEFAULT_BORROW_FEE_BPS(): u64 { 5 }  // 0.05%

// Governance
public macro fun FEE_TIMELOCK_MS(): u64 { 604_800_000 } // 7 days
```

### Error Codes

Uses `public(package) macro fun` for snake_case errors with `#[test_only]` constants for `expected_failure` tests (pattern from Clank).

```move
// errors.move
#[allow(unused_const)]
module t2000::errors;

public(package) macro fun paused(): u64 { 1 }
public(package) macro fun zero_amount(): u64 { 2 }
public(package) macro fun invalid_operation(): u64 { 3 }
public(package) macro fun fee_rate_too_high(): u64 { 4 }
public(package) macro fun insufficient_treasury(): u64 { 5 }
public(package) macro fun not_authorized(): u64 { 6 }
public(package) macro fun version_mismatch(): u64 { 7 }
public(package) macro fun timelock_active(): u64 { 8 }
public(package) macro fun no_pending_change(): u64 { 9 }

// Test-only constants for expected_failure
#[test_only] const EPaused: u64 = 1;
#[test_only] const EZeroAmount: u64 = 2;
#[test_only] const EInvalidOperation: u64 = 3;
#[test_only] const EFeeRateTooHigh: u64 = 4;
#[test_only] const EInsufficientTreasury: u64 = 5;
#[test_only] const ENotAuthorized: u64 = 6;
#[test_only] const EVersionMismatch: u64 = 7;
#[test_only] const ETimelockActive: u64 = 8;
#[test_only] const ENoPendingChange: u64 = 9;
```

### Events

```move
// events.move
struct FeeCollected has copy, drop {
    agent: address,
    operation: u8,     // OP_SAVE | OP_SWAP | OP_BORROW
    amount: u64,       // fee amount in base units
    principal: u64,    // original operation amount
}

struct ConfigUpdated has copy, drop {
    field: vector<u8>, // field name as bytes
    old_value: u64,
    new_value: u64,
    updated_by: address,
}

struct ProtocolPaused has copy, drop {
    paused_by: address,
}

struct ProtocolUnpaused has copy, drop {
    unpaused_by: address,
}

struct FeesWithdrawn has copy, drop {
    amount: u64,
    recipient: address,
    total_withdrawn: u64,
}

struct FeeChangeProposed has copy, drop {
    save_bps: u64,
    swap_bps: u64,
    borrow_bps: u64,
    effective_at: u64,
}

struct AdminTransferProposed has copy, drop {
    current_admin: address,
    proposed_admin: address,
}

struct AdminTransferAccepted has copy, drop {
    old_admin: address,
    new_admin: address,
}
```

### Public Functions

These are callable by any agent via PTB. The SDK constructs PTBs that call these.

```move
// treasury.move

/// Version gate — aborts if Treasury version doesn't match package version
fun assert_version<T>(treasury: &Treasury<T>) {
    assert!(treasury.version == constants::VERSION!(), errors::version_mismatch!());
}

/// Collect protocol fee from agent's coin before a DeFi operation.
/// Splits fee from `payment`, stores in treasury. `payment` value is reduced.
/// Called by SDK within the same PTB as the DeFi operation (atomic).
public fun collect_fee<T>(
    treasury: &mut Treasury<T>,
    config: &Config,
    payment: &mut Coin<T>,
    operation: u8,
    ctx: &mut TxContext,
) {
    assert_version(treasury);
    assert!(!config.paused, errors::paused!());
    assert!(operation <= 2, errors::invalid_operation!());

    let fee_bps = get_fee_bps(config, operation);
    let principal = coin::value(payment);
    assert!(principal > 0, errors::zero_amount!());

    let fee_amount = (principal * fee_bps) / constants::BPS_DENOMINATOR!();

    if (fee_amount > 0) {
        let fee_coin = coin::split(payment, fee_amount, ctx);
        balance::join(&mut treasury.balance, coin::into_balance(fee_coin));
        treasury.total_collected = treasury.total_collected + fee_amount;

        event::emit(FeeCollected {
            agent: ctx.sender(),
            operation,
            amount: fee_amount,
            principal,
        });
    };
}

// --- View functions (read-only, no gas when called off-chain) ---

public fun fee_rate(config: &Config, operation: u8): u64 { get_fee_bps(config, operation) }
public fun total_collected<T>(treasury: &Treasury<T>): u64 { treasury.total_collected }
public fun treasury_balance<T>(treasury: &Treasury<T>): u64 { treasury.balance.value() }
public fun is_paused(config: &Config): bool { config.paused }
public fun version<T>(treasury: &Treasury<T>): u64 { treasury.version }

// --- Internal ---

fun get_fee_bps(config: &Config, operation: u8): u64 {
    if (operation == constants::OP_SAVE!()) { config.save_fee_bps }
    else if (operation == constants::OP_SWAP!()) { config.swap_fee_bps }
    else if (operation == constants::OP_BORROW!()) { config.borrow_fee_bps }
    else { abort errors::invalid_operation!() }
}
```

### Admin Functions

All require `AdminCap` — enforced by Move's type system, not runtime checks.
Governance patterns adopted from Clank: timelocked fee changes, two-step admin transfer, version gating.

```move
// admin.move

public fun pause(_admin: &AdminCap, config: &mut Config, ctx: &TxContext) {
    assert!(config.version == constants::VERSION!(), errors::version_mismatch!());
    config.paused = true;
    event::emit(ProtocolPaused { paused_by: ctx.sender() });
}

public fun unpause(_admin: &AdminCap, config: &mut Config, ctx: &TxContext) {
    assert!(config.version == constants::VERSION!(), errors::version_mismatch!());
    config.paused = false;
    event::emit(ProtocolUnpaused { unpaused_by: ctx.sender() });
}

/// Propose fee changes — takes effect after 7-day timelock
public fun propose_fee_change(
    _admin: &AdminCap, config: &mut Config,
    save_bps: u64, swap_bps: u64, borrow_bps: u64,
    ctx: &TxContext,
) {
    assert!(config.version == constants::VERSION!(), errors::version_mismatch!());
    assert!(save_bps <= constants::MAX_FEE_BPS!(), errors::fee_rate_too_high!());
    assert!(swap_bps <= constants::MAX_FEE_BPS!(), errors::fee_rate_too_high!());
    assert!(borrow_bps <= constants::MAX_FEE_BPS!(), errors::fee_rate_too_high!());

    let effective_at = ctx.epoch_timestamp_ms() + constants::FEE_TIMELOCK_MS!();
    config.pending_save_fee_bps = option::some(save_bps);
    config.pending_swap_fee_bps = option::some(swap_bps);
    config.pending_borrow_fee_bps = option::some(borrow_bps);
    config.fee_change_effective_at = option::some(effective_at);

    event::emit(FeeChangeProposed { save_bps, swap_bps, borrow_bps, effective_at });
}

/// Execute pending fee change after 7-day timelock expires
public fun execute_fee_change(_admin: &AdminCap, config: &mut Config, ctx: &TxContext) {
    assert!(config.version == constants::VERSION!(), errors::version_mismatch!());
    assert!(config.fee_change_effective_at.is_some(), errors::no_pending_change!());
    assert!(ctx.epoch_timestamp_ms() >= *config.fee_change_effective_at.borrow(), errors::timelock_active!());

    config.save_fee_bps = *config.pending_save_fee_bps.borrow();
    config.swap_fee_bps = *config.pending_swap_fee_bps.borrow();
    config.borrow_fee_bps = *config.pending_borrow_fee_bps.borrow();
    config.pending_save_fee_bps = option::none();
    config.pending_swap_fee_bps = option::none();
    config.pending_borrow_fee_bps = option::none();
    config.fee_change_effective_at = option::none();
}

/// Cancel pending fee change
public fun cancel_fee_change(_admin: &AdminCap, config: &mut Config) {
    config.pending_save_fee_bps = option::none();
    config.pending_swap_fee_bps = option::none();
    config.pending_borrow_fee_bps = option::none();
    config.fee_change_effective_at = option::none();
}

/// Migrate Config to new version after package upgrade
public fun migrate_config(_admin: &AdminCap, config: &mut Config) {
    assert!(config.version < constants::VERSION!(), errors::version_mismatch!());
    config.version = constants::VERSION!();
}

// treasury.move — includes two-step admin transfer

/// Withdraw fees from treasury (requires AdminCap + treasury admin check)
public fun withdraw_fees<T>(
    _admin: &AdminCap,
    treasury: &mut Treasury<T>,
    amount: u64,
    recipient: address,
    ctx: &mut TxContext,
) {
    assert_version(treasury);
    assert!(treasury.admin == ctx.sender(), errors::not_authorized!());
    assert!(treasury.balance.value() >= amount, errors::insufficient_treasury!());

    let coin = coin::from_balance(treasury.balance.split(amount), ctx);
    transfer::public_transfer(coin, recipient);
    treasury.total_withdrawn = treasury.total_withdrawn + amount;

    event::emit(FeesWithdrawn { amount, recipient, total_withdrawn: treasury.total_withdrawn });
}

/// Emergency withdraw all fees
public fun emergency_withdraw<T>(
    _admin: &AdminCap,
    treasury: &mut Treasury<T>,
    recipient: address,
    ctx: &mut TxContext,
) {
    assert_version(treasury);
    assert!(treasury.admin == ctx.sender(), errors::not_authorized!());
    let amount = treasury.balance.value();
    if (amount > 0) {
        let coin = coin::from_balance(treasury.balance.withdraw_all(), ctx);
        transfer::public_transfer(coin, recipient);
        treasury.total_withdrawn = treasury.total_withdrawn + amount;
        event::emit(FeesWithdrawn { amount, recipient, total_withdrawn: treasury.total_withdrawn });
    };
}

/// Propose admin transfer (step 1 of 2)
public fun propose_admin_transfer<T>(
    _admin: &AdminCap,
    treasury: &mut Treasury<T>,
    new_admin: address,
    ctx: &TxContext,
) {
    assert_version(treasury);
    assert!(treasury.admin == ctx.sender(), errors::not_authorized!());
    treasury.pending_admin = option::some(new_admin);
}

/// Accept admin transfer (step 2 of 2 — called by new admin)
public fun accept_admin_transfer<T>(
    treasury: &mut Treasury<T>,
    ctx: &TxContext,
) {
    assert_version(treasury);
    let sender = ctx.sender();
    assert!(treasury.pending_admin.contains(&sender), errors::not_authorized!());
    treasury.admin = sender;
    treasury.pending_admin = option::none();
}

/// Migrate Treasury to new version after package upgrade
public fun migrate_treasury<T>(_admin: &AdminCap, treasury: &mut Treasury<T>, ctx: &TxContext) {
    assert!(treasury.admin == ctx.sender(), errors::not_authorized!());
    assert!(treasury.version < constants::VERSION!(), errors::version_mismatch!());
    treasury.version = constants::VERSION!();
}
```

### PTB Integration — How the SDK Calls the Contract

Every fee-bearing operation includes the contract call in the same PTB. Three patterns:

**Pattern A — Save (fee on input)**
```
PTB:
  1. MergeCoins: merge all USDC into one coin
  2. SplitCoins: split save_amount from merged coin
  3. MoveCall: t2000::treasury::collect_fee<USDC>(&mut treasury, &config, &mut save_coin, OP_SAVE)
     → save_coin value reduced by fee, fee stored in treasury
  4. MoveCall: suilend::lending_market::deposit(..., save_coin, ...)
     → deposits remaining USDC into Suilend
```

**Pattern B — Swap (fee on input USDC)**
```
PTB:
  1. SplitCoins: split swap_amount from USDC coin
  2. MoveCall: t2000::treasury::collect_fee<USDC>(&mut treasury, &config, &mut swap_coin, OP_SWAP)
     → swap_coin value reduced by fee
  3. MoveCall: cetus::swap(..., swap_coin, ...)
     → swaps remaining USDC for target asset
  4. TransferObjects: transfer received asset to agent
```

**Pattern C — Borrow (fee on output)**
```
PTB:
  1. MoveCall: suilend::lending_market::borrow(...) → borrowed_coin
  2. MoveCall: t2000::treasury::collect_fee<USDC>(&mut treasury, &config, &mut borrowed_coin, OP_BORROW)
     → borrowed_coin value reduced by fee
  3. TransferObjects: transfer remaining USDC to agent
```

All patterns are atomic. If any step fails, the entire PTB reverts including the fee.

### Contract Deployment Checklist

1. `sui move build` — compile
2. `sui move test` — run all tests
3. `sui client publish --gas-budget 100000000` — deploy to mainnet
4. Record: package ID, Config object ID, AdminCap object ID
5. Call `create_treasury<USDC>()` — creates USDC Treasury shared object
6. Record: Treasury object ID
7. Add all IDs to SDK `constants.ts`

---

## 3. SDK Architecture

### Module Dependency Graph

```
T2000 (main class)
├── wallet/keyManager     ← crypto (AES-256-GCM), fs
├── wallet/send           ← sui client, gas/manager, fees/protocolFee
├── wallet/balance        ← sui client, protocols/suilend
├── wallet/history        ← sui client
├── protocols/suilend     ← sui client, @suilend/sdk
├── protocols/cetus       ← sui client, @cetusprotocol/sui-clmm-sdk
├── gas/manager           ← gas/autoTopUp, gas/gasStation
├── gas/autoTopUp         ← protocols/cetus (USDC→SUI swap)
├── gas/gasStation        ← fetch (ECS backend API)
├── fees/protocolFee      ← constants (contract IDs, fee rates)
├── funding/tracker       ← protocols/suilend (accrual index)
├── events/emitter        ← EventEmitter
└── utils/*               ← shared utilities
```

### T2000 Class (Public API Surface)

```typescript
class T2000 extends EventEmitter {
  // Construction
  static async create(options?: { keyPath?: string; passphrase?: string; network?: 'mainnet'; sponsored?: boolean; name?: string }): Promise<T2000>
  static fromPrivateKey(privateKey: string, options?: { network?: 'mainnet' }): T2000

  // Wallet
  async send(params: { to: string; amount: number; asset?: string }): Promise<SendResult>
  async balance(): Promise<BalanceResponse>
  async history(params?: { limit?: number }): Promise<Transaction[]>
  address(): string                    // sync — cached from keypair
  async deposit(): DepositInfo

  // Savings
  async save(params: { amount: number | 'all'; asset?: string }): Promise<SaveResult>
  async withdraw(params: { amount: number | 'all'; asset?: string }): Promise<WithdrawResult>
  async maxWithdraw(params?: { asset?: string }): Promise<MaxWithdrawResult>

  // Borrowing
  async borrow(params: { amount: number; asset?: string }): Promise<BorrowResult>
  async repay(params: { amount: number | 'all'; asset?: string }): Promise<RepayResult>
  async maxBorrow(params?: { asset?: string }): Promise<MaxBorrowResult>
  async healthFactor(): Promise<number>

  // Swap
  async swap(params: { from: string; to: string; amount: number }): Promise<SwapResult>

  // Yield
  async earnings(): Promise<EarningsResult>
  async fundStatus(): Promise<FundStatusResult>

  // Info
  async positions(): Promise<PositionsResult>
  async rates(): Promise<RatesResult>

  // Events (inherited from EventEmitter)
  // on('yield' | 'balanceChange' | 'healthWarning' | 'healthCritical' | 'gasStationFallback' | 'error', handler)
}
```

### Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@mysten/sui` | latest | SuiClient, Transaction, utils |
| `@suilend/sdk` | latest | Suilend lending operations |
| `@cetusprotocol/sui-clmm-sdk` | latest | Cetus swap routing |

### Asset Whitelist (constants.ts)

MVP supports exactly 5 verified assets. Enforced in SDK, CLI, and API.

| Asset | Mainnet Token Address | Notes |
|-------|----------------------|-------|
| USDC | `0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC` | Primary unit of account |
| SUI | `0x2::sui::SUI` | Gas token (hidden from agent) |
| USDT | *(verify on mainnet)* | |
| WETH | *(verify on mainnet)* | |
| WBTC | *(verify on mainnet)* | |

Unrecognized assets throw `ASSET_NOT_SUPPORTED`.

### Local State Files

```
~/.t2000/
├── wallet.key      # Ed25519 private key (AES-256-GCM encrypted)
├── config.json     # Network, RPC URL, API auth token, preferences
└── funding.json    # Yield tracking state (snapshots, totals)
```

---

## 4. CLI Architecture

### Command Map

| Command | SDK Method | Flags |
|---------|-----------|-------|
| `t2000 init` | `T2000.create()` | `--no-encrypt`, `--network` |
| `t2000 send <amount> <asset> to <address>` | `agent.send()` | `--json` |
| `t2000 balance` | `agent.balance()` | `--json` |
| `t2000 save <amount> <asset>` | `agent.save()` | `--json`. `supply` alias. |
| `t2000 withdraw <amount> <asset>` | `agent.withdraw()` | `--json` |
| `t2000 borrow <amount> <asset>` | `agent.borrow()` | `--json` |
| `t2000 repay <amount> <asset>` | `agent.repay()` | `--json` |
| `t2000 swap <amount> <from> to <to>` | `agent.swap()` | `--json` |
| `t2000 history` | `agent.history()` | `--limit`, `--json` |
| `t2000 earnings` | `agent.earnings()` | `--json` |
| `t2000 fund-status` | `agent.fundStatus()` | `--json` |
| `t2000 health` | `agent.healthFactor()` | `--json` |
| `t2000 deposit` | `agent.deposit()` | `--json` |
| `t2000 address` | `agent.address()` | — |
| `t2000 export` | key export | `--stdout` |
| `t2000 import` | key import | `--raw` |
| `t2000 positions` | `agent.positions()` | `--json` |
| `t2000 rates` | `agent.rates()` | `--json` |
| `t2000 config` | show/set config | `--set <key> <value>` |
| `t2000 serve` | start HTTP API | `--port`, `--rate-limit` |

### Global Flags

| Flag | Description |
|------|-------------|
| `--json` | Machine-readable JSON output |
| `--yes` | Skip confirmation prompts (for non-TTY / CI environments) |
| `--key <path>` | Key file path (default: `~/.t2000/wallet.key`) |
| `--network <network>` | Network override (default: `mainnet`) |

### Output Strategy

Every command supports `--json` for machine-readable output. Without `--json`, shows human-friendly formatted output with colors.

```typescript
function output(data: unknown, json: boolean) {
  if (json) {
    console.log(JSON.stringify({ success: true, data, timestamp: Date.now() }));
  } else {
    // Human-friendly output with chalk
  }
}
```

---

## 5. Infrastructure

### Backend API Routes (ECS Fargate — Hono)

**`POST /api/sponsor`** — Sponsored wallet init

```typescript
// Request
{ address: string; proof: string }  // hashcash proof

// Flow
1. Verify hashcash proof
2. Check rate limit: SELECT COUNT(*) FROM sponsor_requests WHERE ip = ? AND created_at > NOW() - '1 hour'
3. If > 10/hr → 429
4. Create sponsored transaction (fund wallet with minimum SUI)
5. Sign with sponsor wallet
6. INSERT INTO sponsor_requests (ip_address, agent_address)
7. INSERT INTO gas_ledger (agent_address, ..., tx_type: 'bootstrap')
8. Return { sponsoredTx, digest }
```

**`POST /api/gas`** — Gas sponsorship

```typescript
// Request
{ agentAddress: string; txBytes: string; txType: 'bootstrap' | 'auto-topup' | 'fallback' }

// Flow
1. If txType == 'auto-topup' → always sponsor (no bootstrap check)
2. If txType == 'bootstrap':
   a. SELECT COUNT(*) FROM gas_ledger WHERE agent_address = ? AND tx_type = 'bootstrap'
   b. If >= 10 → 403 "Bootstrap limit reached"
3. Check circuit breaker: if SUI price moved >20% in 1hr → 503
4. Sign transaction as sponsor
5. INSERT INTO gas_ledger (agent_address, sui_spent, usdc_charged, tx_type)
6. Return { sponsoredTxBytes }
```

**`GET /api/health`** — Service health

```typescript
// Response
{
  status: 'ok' | 'degraded',
  gasStation: { suiBalance: number, circuitBreaker: boolean },
  sponsor: { balance: number },
  indexer: {
    lastCheckpoint: number,
    latestCheckpoint: number,
    lag: number,                    // checkpoints behind
    lastProcessedAt: string,
  },
  database: 'connected'
}
```

### NeonDB Schema (Prisma)

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model SponsorRequest {
  id           Int      @id @default(autoincrement())
  ipAddress    String   @map("ip_address")
  agentAddress String   @map("agent_address")
  createdAt    DateTime @default(now()) @map("created_at")

  @@index([ipAddress, createdAt(sort: Desc)])
  @@map("sponsor_requests")
}

model GasLedger {
  id           Int      @id @default(autoincrement())
  agentAddress String   @map("agent_address")
  suiSpent     Decimal  @map("sui_spent")
  usdcCharged  Decimal  @map("usdc_charged")
  txDigest     String   @map("tx_digest")
  txType       String   @default("bootstrap") @map("tx_type")  // bootstrap | auto-topup | fallback
  status       String   @default("settled")                      // settled | loss
  createdAt    DateTime @default(now()) @map("created_at")

  @@index([status])
  @@index([agentAddress, txType])
  @@map("gas_ledger")
}

model ProtocolFeeLedger {
  id           Int      @id @default(autoincrement())
  agentAddress String   @map("agent_address")
  operation    String                                             // save | swap | borrow
  feeAmount    Decimal  @map("fee_amount")
  feeAsset     String   @default("USDC") @map("fee_asset")
  feeRate      Decimal  @map("fee_rate")                         // 0.001 or 0.0005
  txDigest     String   @map("tx_digest")
  createdAt    DateTime @default(now()) @map("created_at")

  @@index([agentAddress, createdAt(sort: Desc)])
  @@index([operation])
  @@map("protocol_fee_ledger")
}

// --- Indexer Tables ---

model IndexerCursor {
  id               Int      @id @default(autoincrement())
  cursorName       String   @unique @map("cursor_name")       // 'main'
  lastCheckpoint   BigInt   @map("last_checkpoint")
  lastProcessedAt  DateTime @default(now()) @map("last_processed_at")

  @@map("indexer_cursor")
}

model Agent {
  id        Int       @id @default(autoincrement())
  address   String    @unique
  name      String?
  isPublic  Boolean   @default(false) @map("is_public")
  createdAt DateTime  @default(now()) @map("created_at")
  lastSeen  DateTime? @map("last_seen")

  positions    Position[]
  transactions Transaction[]
  snapshots    YieldSnapshot[]

  @@map("agents")
}

model Position {
  id           Int      @id @default(autoincrement())
  agentAddress String   @map("agent_address")
  protocol     String                                          // 'suilend'
  asset        String
  positionType String   @map("position_type")                  // 'save' | 'borrow'
  amount       Decimal
  apy          Decimal?
  updatedAt    DateTime @default(now()) @map("updated_at")

  agent Agent @relation(fields: [agentAddress], references: [address])

  @@index([agentAddress])
  @@map("positions")
}

model Transaction {
  id           Int      @id @default(autoincrement())
  agentAddress String   @map("agent_address")
  txDigest     String   @unique @map("tx_digest")
  action       String                                          // 'send' | 'save' | 'withdraw' | 'swap' | ...
  asset        String?
  amount       Decimal?
  gasCostUsd   Decimal? @map("gas_cost_usd")
  gasMethod    String?  @map("gas_method")                     // 'self-funded' | 'sponsored' | 'auto-topup'
  executedAt   DateTime @default(now()) @map("executed_at")

  agent Agent @relation(fields: [agentAddress], references: [address])

  @@index([agentAddress, executedAt(sort: Desc)])
  @@map("transactions")
}

model YieldSnapshot {
  id           Int      @id @default(autoincrement())
  agentAddress String   @map("agent_address")
  suppliedUsd  Decimal  @map("supplied_usd")
  yieldEarned  Decimal  @map("yield_earned")
  apy          Decimal
  snapshotAt   DateTime @default(now()) @map("snapshot_at")

  agent Agent @relation(fields: [agentAddress], references: [address])

  @@index([agentAddress, snapshotAt(sort: Desc)])
  @@map("yield_snapshots")
}
```

### Environment Variables

```bash
# NeonDB
DATABASE_URL="postgres://..."

# Sui
SPONSOR_PRIVATE_KEY="0x..."         # Sponsor wallet (funds inits)
GAS_STATION_PRIVATE_KEY="0x..."     # Gas Station wallet (sponsors gas)
SUI_RPC_URL="https://fullnode.mainnet.sui.io:443"

# ECS / Backend
PORT=3000                            # Backend API port
INDEXER_POLL_INTERVAL_MS=2000        # Checkpoint poll interval
INDEXER_BATCH_SIZE=100               # Checkpoints per poll

# Website (Vercel)
NEXT_PUBLIC_SITE_URL="https://t2000.ai"
NEXT_PUBLIC_API_URL="https://api.t2000.ai"

# Contract (set after deployment)
T2000_PACKAGE_ID="0x..."
T2000_CONFIG_ID="0x..."
T2000_TREASURY_ID="0x..."
```

---

## 6. Phased Build Plan

### Phase 1 — Foundation (Week 1)

**Goal:** Working wallet. Send and receive USDC on mainnet.

#### Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 1.1 | Monorepo setup: pnpm workspaces, turbo.json, tsconfig.base, eslint, prettier | root | 2h | ✅ |
| 1.2 | SDK package scaffold: tsup config, vitest config, package.json | sdk | 1h | ✅ |
| 1.3 | CLI package scaffold: Commander.js setup, bin entry | cli | 1h | ✅ |
| 1.4 | `keyManager.ts`: Ed25519 keypair gen, AES-256-GCM encrypt/decrypt, load/save/export/import | sdk | 4h | ✅ |
| 1.5 | `sui.ts` utils: SuiClient factory (mainnet), address validation/truncation | sdk | 1h | ✅ |
| 1.6 | `errors.ts`: T2000Error class, all 15 error codes | sdk | 1h | ✅ |
| 1.7 | `constants.ts`: MIST_PER_SUI, asset addresses (USDC on mainnet), placeholders for contract IDs | sdk | 1h | ✅ |
| 1.8 | `types.ts`: All response/result types | sdk | 2h | ✅ |
| 1.9 | `send.ts`: USDC transfer via PTB (no fee collection yet, no gas management yet — uses agent's SUI) | sdk | 3h | ✅ |
| 1.10 | `balance.ts`: Query USDC + SUI balances, format as BalanceResponse | sdk | 2h | ✅ |
| 1.11 | `history.ts`: Query recent transactions from RPC | sdk | 2h | ✅ |
| 1.12 | `t2000.ts`: T2000 class wiring keyManager + send + balance + history | sdk | 3h | ✅ |
| 1.13 | CLI commands: `init`, `send`, `balance`, `address`, `deposit`, `history`, `export`, `import` | cli | 4h | ✅ |
| 1.14 | `output.ts` + `prompts.ts`: Human/JSON output, passphrase prompts | cli | 2h | ✅ |
| 1.15 | Move contract: write all source files (t2000, admin, constants, errors, events, treasury) | contracts | 4h | ✅ |
| 1.16 | Move tests: treasury_tests, admin_tests | contracts | 3h | ✅ |
| 1.17 | Deploy Move contract to mainnet, record IDs | contracts | 1h | ✅ |
| 1.18 | SDK unit tests for wallet module | sdk | 3h | ✅ |

**Week 1 testing:** Pre-funded mainnet wallet via `T2000_PRIVATE_KEY` env var. Small amounts ($5 USDC).

**Definition of done:** `t2000 init` creates encrypted wallet. `t2000 send 1 USDC to <address>` works on mainnet. `t2000 balance` shows correct amounts. Move contract deployed with fee collection working.

---

### Phase 2 — Sponsor + Savings (Week 2)

**Goal:** Zero-cost onboarding. Earn yield on idle USDC. Backend service running on ECS.

#### Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 2.1 | Server package scaffold: Hono app, tsup config, Dockerfile, prisma | server | 2h | ✅ |
| 2.2 | Prisma schema: all tables (sponsor, gas, fees, indexer cursor, agents, positions, transactions, yield). Push to NeonDB. | server | 2h | ✅ |
| 2.3 | `POST /api/sponsor`: hashcash verification, rate limiting, serialized wallet signing | server | 4h | ✅ |
| 2.4 | `hashcash.ts`: Proof-of-work generation (SDK) + verification (server) | sdk + server | 2h | ✅ |
| 2.5 | Update `t2000 init`: call sponsor API, solve hashcash challenge | sdk + cli | 3h | ✅ |
| 2.6 | `suilend.ts`: save (deposit), withdraw, borrow, repay, healthFactor, rates | sdk | 8h | ✅ |
| 2.7 | `maxWithdraw()` + `maxBorrow()`: read-only safe limit queries | sdk | 2h | ✅ |
| 2.8 | CLI commands: `save`, `withdraw`, `borrow`, `repay`, `health`, `rates`, `positions` | cli | 3h | ✅ |
| 2.9 | Integration: save → earn → withdraw roundtrip on mainnet (small amounts) | — | 2h | ✅ |
| 2.10 | SDK unit tests for Suilend module | sdk | 3h | ✅ |
| 2.11 | ECS Fargate deployment: Docker build, task definition, deploy. Connect NeonDB. | server | 3h | ✅ |

**Definition of done:** `npx t2000 init` creates wallet with zero cost (sponsored). `t2000 save 2 USDC` deposits to Suilend. `t2000 withdraw 1 USDC` works. Health factor checks enforced. Backend running on ECS Fargate.

---

### Phase 3 — Gas Station + Auto-SUI Reserve (Week 3)

**Goal:** Gas is invisible. Agent never thinks about SUI.

#### Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 3.1 | `POST /api/gas`: gas sponsorship endpoint (bootstrap + fallback + auto-topup). Serialized signing via in-process queue. | server | 4h | ✅ |
| 3.2 | Bootstrap counter: server-side tracking by wallet address in gas_ledger | server | 2h | ✅ |
| 3.3 | `priceCache.ts`: In-memory SUI price TWAP (5-min window), circuit breaker (>20% in 1hr → 503), gas fee ceiling ($0.05 → `GAS_FEE_EXCEEDED`) | server | 3h | ✅ |
| 3.4 | `gasStation.ts`: SDK client for Gas Station API | sdk | 2h | ✅ |
| 3.5 | `autoTopUp.ts`: USDC→SUI auto-swap when SUI < 0.05 (via Cetus) | sdk | 3h | ✅ |
| 3.6 | `manager.ts`: Gas resolution chain (self-funded → auto-topup → sponsored → fail) | sdk | 4h | ✅ |
| 3.7 | Wire gas manager into all SDK operations (send, save, withdraw, etc.) | sdk | 3h | ✅ |
| 3.8 | `retry.ts`: Exponential backoff, RPC failover logic | sdk | 2h | ✅ |
| 3.9 | Update balance to include gasReserve (SUI amount + usdEquiv) | sdk | 1h | ✅ |
| 3.10 | Integration tests: bootstrap → auto-topup → self-funded lifecycle | — | 3h | ✅ |
| 3.11 | SDK unit tests for gas module | sdk | 3h | ✅ |

**Definition of done:** Fresh wallet gets first 10 txs sponsored. After bootstrap, auto-swaps USDC→SUI silently. `gasMethod` shown in every response. Circuit breaker tested. In-memory TWAP running.

---

### Phase 4 — Swaps + Protocol Fees + Risk (Week 4)

**Goal:** Swap assets. Protocol earns revenue. Risk controls enforced.

#### Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 4.1 | `cetus.ts`: Swap integration with on-chain slippage (`sqrt_price_limit`) | sdk | 6h | ✅ |
| 4.2 | `protocolFee.ts`: Fee calculation, PTB command construction for on-chain collection | sdk | 4h | ✅ |
| 4.3 | Wire protocol fees into save, swap, borrow operations | sdk | 3h | ✅ |
| 4.4 | Protocol fee ledger: log fee events to NeonDB (via server API or indexer) | server | 2h | ✅ |
| 4.5 | Pre-signing disclosure: surface fee + gas estimate before signing | sdk | 2h | ✅ |
| 4.6 | Risk module: HF check before borrow AND withdraw | sdk | 2h | ✅ |
| 4.7 | `WITHDRAW_WOULD_LIQUIDATE` with `safeWithdrawAmount` | sdk | 1h | ✅ |
| 4.8 | Transaction simulation with Move abort code in error messages | sdk | 2h | ✅ |
| 4.9 | Address validation on send | sdk | 1h | ✅ |
| 4.10 | CLI command: `swap` | cli | 2h | ✅ |
| 4.11 | Integration tests: swap, fee collection, risk enforcement | — | 3h | ✅ |
| 4.12 | SDK unit tests for cetus, protocolFee modules | sdk | 3h | ✅ |

**Definition of done:** `t2000 swap 2 USDC to SUI` works with on-chain slippage. Protocol fee deducted and visible. Withdraw blocked if HF would drop below 1.5.

---

### Phase 5 — Indexer + Yield + Events + Local API (Week 5)

**Goal:** Checkpoint-based indexer live. Yield tracking, event system, HTTP API for non-TS agents.

#### Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 5.1 | `checkpoint.ts`: Sui checkpoint fetcher — paginated checkpoint retrieval, tx block expansion with events | server | 4h | ✅ |
| 5.2 | `indexer.ts`: Main indexer loop — boot from cursor, poll, filter by package ID + agent addresses, parse events | server | 6h | ✅ |
| 5.3 | Event parser: FeeCollected → protocol_fee_ledger, transfers → transactions, Suilend events → positions | server | 4h | ✅ |
| 5.4 | Yield snapshotter: hourly cron (in-process) — read Suilend accrual index, compute deltas, write yield_snapshots | server | 3h | ✅ |
| 5.5 | `GET /api/health` update: include indexer lag (latest_checkpoint - last_processed), pool status | server | 1h | ✅ |
| 5.6 | `tracker.ts`: Client-side yield tracking via Suilend accrual index (for agents not registered in indexer) | sdk | 3h | ✅ |
| 5.7 | CLI commands: `earnings`, `fund-status` | cli | 2h | ✅ |
| 5.8 | `emitter.ts`: EventEmitter for SDK events (yield, balanceChange, health*, gasStationFallback, error) | sdk | 3h | ✅ |
| 5.9 | `serve.ts` command: Hono HTTP API server | cli | 4h | ✅ |
| 5.10 | Bearer token auth: generate at startup, store in config.json | cli | 1h | ✅ |
| 5.11 | Rate limiting middleware (configurable via `--rate-limit`) | cli | 1h | ✅ |
| 5.12 | All HTTP API endpoints: /v1/balance, /v1/send, /v1/save (+ /v1/supply alias), /v1/withdraw, /v1/borrow, /v1/repay, /v1/swap, /v1/history, /v1/earnings, /v1/health-factor, /v1/deposit, /v1/address, /v1/max-withdraw, /v1/max-borrow, /v1/positions, /v1/rates | cli | 4h | ✅ |
| 5.13 | SSE endpoint: /v1/events | cli | 2h | ✅ |
| 5.14 | `--json` flag on all CLI commands | cli | 2h | ✅ |
| 5.15 | `config` command: show/set preferences | cli | 1h | ✅ |
| 5.16 | Integration tests: indexer checkpoint processing, yield tracking, HTTP API auth, rate limiting | — | 4h | ✅ |
| 5.17 | SDK unit tests for events, funding modules | sdk | 2h | ✅ |

**Definition of done:** Indexer is processing checkpoints with <10s lag. `t2000 earnings` shows yield. `t2000 serve` starts HTTP API with auth. All endpoints working. Events fire correctly.

---

### Phase 6 — Launch (Week 6)

**Goal:** Ship it. Hackathon ready.

#### Tasks

| # | Task | Package | Est | Status |
|---|------|---------|-----|--------|
| 6.1 | npm publish: `@t2000/sdk` and `@t2000/cli` | sdk + cli | 2h | ⬜ |
| 6.2 | Vercel Next.js app scaffold: project setup, tailwind | web | 2h | ✅ |
| 6.3 | Landing page: Hero, terminal demo (animated), features, install command, wireframes from spec | web | 6h | ✅ |
| 6.4 | Vercel deployment: connect domain (t2000.ai), deploy | web | 1h | ✅ |
| 6.5 | README: 30-second quickstart, badges, API reference link | root | 2h | ✅ |
| 6.6 | Full E2E test pass on mainnet (the demo sequence from the spec) | — | 4h | ⬜ |
| 6.7 | Record terminal demo video (for landing page + hackathon) | — | 2h | ⬜ |
| 6.8 | Polish: error messages, output formatting, edge cases | all | 4h | ✅ |
| 6.9 | DeepSurge: Register + submit hackathon project | — | 1h | ⬜ |

**Definition of done:** `npm install -g @t2000/cli` works. `npx t2000 init` → send → save → swap → borrow → yield tracked. Landing page live. Hackathon submitted.

---

## 7. Test Strategy

### Move Tests (`sui move test`)

Uses `run_env!` test macro and `create_for_testing`/`destroy_for_testing` helpers (patterns from Clank).

| Test | Assertions |
|------|-----------|
| `test_collect_save_fee` | 0.1% deducted from coin, treasury balance increased, event emitted |
| `test_collect_swap_fee` | 0.1% deducted, correct operation code in event |
| `test_collect_borrow_fee` | 0.05% deducted |
| `test_collect_fee_zero_amount` | Aborts with `errors::EZeroAmount` |
| `test_collect_fee_paused` | Aborts with `errors::EPaused` |
| `test_collect_fee_invalid_op` | Aborts with `errors::EInvalidOperation` |
| `test_collect_fee_version_mismatch` | Aborts with `errors::EVersionMismatch` if treasury not migrated |
| `test_withdraw_fees` | Admin can withdraw, balance reduced, event emitted |
| `test_withdraw_fees_not_admin` | Aborts with `errors::ENotAuthorized` |
| `test_emergency_withdraw` | Treasury emptied, works on empty treasury too |
| `test_withdraw_insufficient` | Aborts with `errors::EInsufficientTreasury` |
| `test_pause_unpause` | Config state toggles, events emitted |
| `test_propose_fee_change` | Pending fees set, effective_at = now + 7 days |
| `test_execute_fee_change_timelock_active` | Aborts with `errors::ETimelockActive` |
| `test_execute_fee_change_success` | After timelock: fees updated, pending cleared |
| `test_cancel_fee_change` | Pending cleared without applying |
| `test_fee_rate_too_high` | Aborts if > MAX_FEE_BPS on propose |
| `test_propose_admin_transfer` | Pending admin set |
| `test_accept_admin_transfer` | Admin changed, pending cleared |
| `test_accept_admin_transfer_wrong_address` | Aborts with `errors::ENotAuthorized` |
| `test_create_treasury` | Treasury created with zero balance, correct version |
| `test_migrate` | Version bumps after upgrade |

### SDK Unit Tests (Vitest)

| Module | Tests |
|--------|-------|
| `keyManager` | Keypair gen (valid Ed25519). Encrypt/decrypt roundtrip. `--no-encrypt` plaintext. Env var override. Export encrypted file. Import from file. Import from raw hex. |
| `send` | Address validation. Insufficient balance. Correct PTB construction. Balance returned. |
| `balance` | Correct aggregation (available + savings + gasReserve). USD equiv calculation. |
| `suilend` | Save returns digest. `save all` reserves $1. HF < 1.5 blocks borrow. HF < 1.5 blocks withdraw with `safeWithdrawAmount`. No collateral throws. Repay all correct amount. |
| `cetus` | Slippage enforcement (sqrt_price_limit set). Whitelist rejects unlisted. |
| `gas/manager` | Resolution order correct. Self-funded when SUI sufficient. Auto-topup triggers at threshold. Sponsored fallback works. |
| `gas/autoTopUp` | Triggers when SUI < 0.05 and USDC > $5. Swaps $1 USDC. |
| `gas/gasStation` | Bootstrap count tracked. Circuit breaker respected. Fee cap enforced. |
| `fees/protocolFee` | 0.1% save/swap. 0.05% borrow. Zero for free ops. PTB construction correct. |
| `funding/tracker` | Yield from accrual index accurate. Polling fallback works. |
| `events/emitter` | Events fire with correct data. SSE serialization. |
| `errors` | All error codes correct shape. Retryable flag correct. |
| `utils/retry` | Backoff timing. Max retries. Failover. |

### Integration Tests (Mainnet, small amounts)

| Suite | Verification |
|-------|-------------|
| Send | $1 USDC transfer. Balance updates. Recipient receives. gasMethod in response. |
| Save → Withdraw | Save $2 → verify savings balance → withdraw $1. HF safe. |
| Borrow → Repay | With collateral: borrow $1 → repay $1. Without collateral: throws. |
| Swap | $1 USDC → SUI. Slippage protection. gasMethod shown. |
| Sponsored Init | Wallet created zero cost. Encrypted key. hashcash passed. |
| Bootstrap Gas | First 10 txs sponsored. Tx #11 self-funded. |
| Auto-SUI Reserve | When SUI < 0.05: auto-swap triggers. gasReserve in balance. |
| Protocol Fees | Save: 0.1% deducted. Swap: 0.1%. Borrow: 0.05%. Fee in response. |
| API Auth | No token → 401. Rate limit → 429. Valid token → 200. |

### Indexer Tests

| Suite | Verification |
|-------|-------------|
| Checkpoint parsing | Process a real checkpoint, extract t2000 package events correctly. |
| Cursor persistence | Process checkpoints, kill process, restart → resumes from exact cursor. No gaps. |
| Event filtering | Only t2000 package events + known agent addresses indexed. Noise ignored. |
| Position upsert | Suilend deposit → position created. Withdrawal → position updated/removed. |
| Transaction insert | Send/swap/borrow → inserted with correct action, amount, gasMethod. Duplicate tx_digest rejected. |
| Yield snapshot | Hourly snapshot captures correct supplied balance and yield delta. |
| Lag monitoring | `GET /api/health` reports accurate checkpoint lag. |

### E2E Test (The Demo)

```bash
npx t2000 init                            # encrypted wallet, sponsored
t2000 deposit                              # shows funding instructions
t2000 balance                              # $0.00
# (fund with $10 USDC on mainnet)
t2000 balance                              # $10.00 USDC
t2000 send 1 USDC to <test-address>        # auto-topup + send
t2000 save 5 USDC                          # deposit to Suilend, fee shown
t2000 balance                              # available + savings + gasReserve
t2000 borrow 2 USDC                        # borrow, HF checked
t2000 health                               # HF > 1.5
t2000 swap 1 USDC to SUI                   # Cetus swap, slippage shown
t2000 history                              # all txs
t2000 earnings                             # yield tracked
t2000 fund-status                          # savings summary
t2000 repay all USDC                       # repay borrow
t2000 withdraw all USDC                    # withdraw savings
```

---

## 8. Deployment

### Move Contract → Mainnet

```bash
cd packages/contracts
sui move build
sui move test
sui client publish --gas-budget 100000000

# After publish:
# 1. Record package ID from output
# 2. Call create_treasury<USDC> with AdminCap
# 3. Record Config, Treasury, AdminCap object IDs
# 4. Update packages/sdk/src/constants.ts
```

### npm → Registry

```bash
cd packages/sdk && pnpm publish --access public
cd packages/cli && pnpm publish --access public
```

### ECS Fargate → Production

```bash
# Build and push Docker image
cd apps/server
docker build -t t2000-server .
# Push to ECR, update task definition, deploy service

# ECS task definition key settings:
# - CPU: 512, Memory: 1024 (0.5 vCPU, 1 GB — sufficient for MVP)
# - Health check: GET /api/health
# - Auto-restart on failure
# - Single task (no auto-scaling needed for MVP)
# - Environment variables:
#   DATABASE_URL, SPONSOR_PRIVATE_KEY, GAS_STATION_PRIVATE_KEY,
#   SUI_RPC_URL, T2000_PACKAGE_ID, T2000_CONFIG_ID, T2000_TREASURY_ID,
#   PORT, INDEXER_POLL_INTERVAL_MS, INDEXER_BATCH_SIZE
```

### Vercel → Production

```bash
# From apps/web (website only)
vercel --prod
# Set NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_API_URL (points to ECS)
```

### Domain

- `t2000.ai` — landing page (Vercel)
- `api.t2000.ai` — backend API (ECS Fargate, via ALB or API Gateway)

---

## 9. Documentation

| Doc | Location | Ships |
|-----|----------|-------|
| README (quickstart) | `README.md` (root) | Week 6 |
| SDK README | `packages/sdk/README.md` | Week 6 |
| CLI README | `packages/cli/README.md` | Week 6 |
| API Reference | Landing page or generated docs | Week 6 |
| Spec | `t2000-sdk-spec-v2.0.md` (already complete) | — |
| Build Plan | `BUILD-PLAN.md` (this file) | — |

README structure: one-liner description → 30-second install → demo GIF → feature list → API reference → contributing.

---

## 10. Risk Register

| Risk | Mitigation |
|------|-----------|
| Suilend SDK breaking changes | Pin version, test on CI before upgrade |
| Cetus SDK API differences | Verify `sqrt_price_limit` support before Week 4 |
| Gas Station wallet coin locking (concurrency) | Single ECS task = serialized in-process. No concurrency issue. |
| Mainnet testing costs | Budget $50 USDC for testing. Use $1-$5 amounts. |
| Move contract bug after deploy | Retain UpgradeCap. Version gating + `migrate()` for safe upgrades. Test thoroughly before publish. |
| ECS Fargate task failure | Health check auto-restarts. Indexer resumes from checkpoint cursor. Stateless API (no in-memory state loss except price cache, which rebuilds in minutes). |
| Indexer falls behind | Monitor checkpoint lag via `/api/health`. Alert if lag > 100 checkpoints. Increase `INDEXER_BATCH_SIZE` if needed. |
| Hackathon deadline pressure (Week 6) | Landing page can be minimal. Core product > polish. |

---

## Summary

| Component | Technology | Deployment |
|-----------|-----------|------------|
| Move contracts | Sui Move | Mainnet (published once) |
| SDK | TypeScript, @mysten/sui, @suilend/sdk, Cetus SDK | npm (@t2000/sdk) |
| CLI | TypeScript, Commander.js, Hono (local API) | npm (@t2000/cli) |
| Backend (Sponsor + Gas Station + Indexer) | Hono (Node.js) | ECS Fargate (single task) at api.t2000.ai |
| Website | Next.js | Vercel at t2000.ai |
| Database | PostgreSQL (Prisma ORM) | NeonDB |
| Dashboard (v1.1) | Next.js | Vercel (post-MVP) |
