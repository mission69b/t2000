# Security Audit Report — t2000 Monorepo

**Date:** 2026-03-09
**Auditor:** Automated Full-Stack Security Audit
**Scope:** All packages (`sdk`, `cli`, `contracts`, `x402`, `server`, `web`), CI/CD, infrastructure
**Severity Levels:** CRITICAL | HIGH | MEDIUM | LOW | INFORMATIONAL

---

## Executive Summary

The t2000 monorepo is a Sui blockchain DeFi platform comprising a CLI wallet, SDK, Move smart contracts, an API server (Hono), a Next.js marketing/stats site, and an on-chain indexer. The audit reviewed ~142 TypeScript source files, 6 Move contract modules, 4 CI/CD workflows, and 2 Dockerized ECS deployments.

**Overall posture: Moderate risk.** The smart contracts are well-designed with proper access controls, timelocks, and version gating. The SDK uses solid cryptographic key management (AES-256-GCM + scrypt). However, the API server has several significant gaps — open CORS, unauthenticated endpoints that accept arbitrary transactions for gas sponsorship, in-memory rate limiting, and an unauthenticated stats endpoint that leaks operational data. No critical vulnerabilities were found that would allow direct fund theft, but several high-severity issues could enable denial-of-service, gas draining, or data manipulation.

### Summary by Severity

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH | 5 |
| MEDIUM | 7 |
| LOW | 5 |
| INFORMATIONAL | 4 |

---

## CRITICAL

### C-1: Gas Sponsorship Endpoint Accepts Arbitrary Transactions — Potential Fund Drain

**Location:** `apps/server/src/routes/gas.ts:12-47`, `apps/server/src/services/gasStation.ts:51-113`

**Description:** The `/api/gas` endpoint accepts any serialized transaction (`txJson` or `txBytes`) and signs it with the gas station's private key as gas sponsor. The only validation is a dry-run and a gas fee ceiling check (for `fallback` type). There is **no authentication** — any caller can submit any transaction to be gas-sponsored. There is **no allowlist** of permitted Move call targets.

An attacker could:
1. Construct a transaction that drains the gas station wallet's SUI balance via `tx.splitCoins(tx.gas, ...)` patterns that inflate gas usage.
2. Submit high-frequency requests to exhaust the gas pool since there is **no per-sender rate limit** on the gas endpoint — only a pool balance floor check.
3. Bypass the `type` parameter by passing `type: 'bootstrap'` to avoid the gas fee ceiling check (bootstrap type has no ceiling).

**Impact:** The gas station wallet could be drained of its SUI balance (currently protected by a 100 SUI floor, but everything above that is at risk).

**Recommendation:**
- Add authentication (API key or hashcash challenge) to the `/api/gas` endpoint.
- Implement per-sender rate limiting (by address and/or IP).
- Allowlist permitted Move call targets (e.g., only NAVI, Cetus, and t2000 package calls).
- Validate the `type` parameter server-side rather than trusting client input — derive it from `determineGasType()` always.
- Consider a per-address daily gas budget.

---

## HIGH

### H-1: Wildcard CORS Allows Any Origin to Call Server APIs

**Location:** `apps/server/src/index.ts:29`

```ts
app.use('*', cors());
```

**Description:** The Hono `cors()` middleware with no arguments sets `Access-Control-Allow-Origin: *`, allowing any website to make cross-origin requests to the API server. This means a malicious website could:
- Call `/api/gas` to sponsor transactions using the server's gas wallet.
- Call `/api/sponsor` to trigger wallet-init fund transfers.
- Read `/api/health` to leak wallet balances and system status.
- Submit fake fee reports to `/api/fees` or `/api/gas/report`.

**Impact:** Any website can abuse the server's financial endpoints. Combined with C-1, this significantly lowers the barrier for gas-draining attacks.

**Recommendation:** Restrict CORS to trusted origins only:
```ts
app.use('*', cors({ origin: ['https://t2000.ai', 'https://api.t2000.ai'] }));
```

---

### H-2: /api/stats Endpoint Exposes Operational Data Without Authentication

**Location:** `apps/web/app/api/stats/route.ts:9-34`

**Description:** The `/api/stats` GET endpoint returns comprehensive operational data including:
- Sponsor and gas station wallet addresses and SUI balances.
- Treasury balance.
- Total agent count, recent agent addresses and registration timestamps.
- Gas ledger totals, fee ledger totals.
- Complete transaction volume breakdowns.
- x402 payment totals.

This data is served without any authentication and could be used for competitive intelligence or to plan targeted attacks (e.g., timing gas draining when the pool is low).

**Impact:** Information disclosure of sensitive operational metrics.

**Recommendation:** Protect this endpoint with an API key or admin authentication. At minimum, remove wallet balance and address information from the public response.

---

### H-3: /api/gas/report Endpoint Accepts Unverified Data

**Location:** `apps/server/src/routes/gas.ts:49-71`

**Description:** The `/api/gas/report` endpoint accepts arbitrary gas usage reports with no verification. An attacker can submit fabricated reports with any `sender`, `txDigest`, `gasCostSui`, and `usdcCharged` values. This corrupts the gas ledger and could:
- Inflate apparent gas costs.
- Associate fake transactions with legitimate agent addresses.
- Undermine the bootstrap limit tracking (fake bootstrap records).

**Impact:** Data integrity compromise of the gas ledger.

**Recommendation:** Verify the `txDigest` on-chain before recording. At minimum, validate that the transaction exists and involves the claimed sender.

---

### H-4: /api/fees Endpoint Accepts Unverified Fee Records

**Location:** `apps/server/src/routes/fees.ts:6-35`

**Description:** Similar to H-3, the POST `/api/fees` endpoint records fee data with no authentication or on-chain verification. An attacker could inject false fee records, polluting the fee ledger and stats.

**Impact:** Data integrity compromise of the protocol fee ledger.

**Recommendation:** Since fees are now collected on-chain via `treasury::collect_fee`, the off-chain ledger should be treated as a secondary index. Either:
- Remove the POST endpoint entirely and rely on the indexer.
- Add authentication (API key for SDK clients).
- Verify `txDigest` on-chain.

---

### H-5: /x402/settle Has No Authentication — Anyone Can Mark Payments as Settled

**Location:** `apps/server/src/routes/x402.ts:97-131`

**Description:** The `/x402/settle` endpoint marks payments as settled in the database with no authentication. Any caller who knows (or guesses) a payment nonce can mark it as settled. This could be exploited by:
- A resource server marking a payment settled before actually delivering the resource.
- An attacker replaying settlement requests.

**Impact:** Payment state manipulation — payments can be marked settled without actual resource delivery confirmation.

**Recommendation:** Add authentication to the settle endpoint (e.g., require a signature from the payTo address or an API key for authorized resource servers).

---

## MEDIUM

### M-1: In-Memory Rate Limiting Does Not Persist Across Restarts

**Location:** `apps/server/src/routes/x402.ts:9-28` (x402 rate limit), `apps/server/src/services/sponsor.ts:14-19` (sponsor rate limit uses DB)

**Description:** The x402 rate limiter uses an in-memory `Map<string, { count, resetAt }>`. This state is lost on server restart or redeployment, allowing rate limit bypass. The sponsor endpoint correctly uses database-backed rate limiting, but the x402 endpoint does not.

Additionally, neither rate limiter is protected against `x-forwarded-for` header spoofing. An attacker can cycle through arbitrary IPs by setting `x-forwarded-for` to any value.

**Impact:** Rate limits on the x402 verify endpoint can be bypassed by restarting the server or spoofing IP headers.

**Recommendation:**
- Use database-backed rate limiting (like the sponsor endpoint) or Redis.
- Validate `x-forwarded-for` against a trusted proxy list, or use the connection's actual IP when not behind a trusted proxy.

---

### M-2: Sponsor Endpoint Does Not Validate Sui Address Format

**Location:** `apps/server/src/routes/sponsor.ts:7-44`

**Description:** The `/api/sponsor` endpoint sends SUI tokens to whatever `address` is provided without validating it's a valid Sui address. While an invalid address would cause the transaction to fail on-chain, the rate limit record is still created in the database. An attacker could:
- Submit invalid addresses to waste rate limit slots.
- Submit another user's address to fund it (though this is arguably benign).

**Impact:** Minor — mostly results in failed transactions and wasted rate limit entries.

**Recommendation:** Add `isValidSuiAddress()` validation before processing. The SDK's `validateAddress()` utility already exists for this purpose.

---

### M-3: Scrypt KDF Parameters Could Be Stronger

**Location:** `packages/sdk/src/wallet/keyManager.ts:11-13`

```ts
const SCRYPT_N = 2 ** 14; // 16384
const SCRYPT_R = 8;
const SCRYPT_P = 1;
```

**Description:** The scrypt parameters use N=16384, which is the minimum recommended value. For a wallet protecting potentially significant funds, stronger parameters (N=2^17 or 2^20) would increase brute-force resistance. The current parameters can be brute-forced at ~100k attempts/sec on modern hardware.

**Impact:** If the encrypted key file is stolen, a weak PIN could be brute-forced relatively quickly.

**Recommendation:**
- Increase N to 2^17 (131072) or higher for new wallets.
- Add key file versioning to support future parameter upgrades.
- Consider enforcing minimum PIN length/complexity.

---

### M-4: Next.js Config Has No Security Headers

**Location:** `apps/web/next.config.ts`

```ts
const nextConfig: NextConfig = {};
```

**Description:** The Next.js configuration is empty — no security headers are configured. Missing headers include:
- `Content-Security-Policy` — no CSP to prevent XSS.
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (clickjacking protection)
- `Strict-Transport-Security` (HSTS)
- `Referrer-Policy`
- `Permissions-Policy`

**Impact:** The web app is more vulnerable to XSS, clickjacking, and other browser-based attacks.

**Recommendation:** Add security headers in `next.config.ts`:
```ts
const nextConfig: NextConfig = {
  headers: async () => [{
    source: '/(.*)',
    headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
    ],
  }],
};
```

---

### M-5: Price Oracle Fallback to Hardcoded Value on Failure

**Location:** `apps/server/src/lib/priceCache.ts:50-51`, `packages/sdk/src/protocols/cetus.ts:184`

```ts
// priceCache.ts
return 1.0; // fallback

// cetus.ts
return 3.5; // fallback
```

**Description:** When the on-chain price fetch fails, the code falls back to hardcoded SUI prices ($1.00 and $3.50 respectively). If the RPC is temporarily unavailable, the gas fee ceiling calculation could use an incorrect price, either under-charging (allowing expensive transactions) or over-charging.

In `priceCache.ts`, if all initial price fetches fail, the TWAP returns $1.00. If SUI is actually $4.00, the gas fee ceiling is effectively 4x lower than intended, potentially blocking legitimate transactions. Conversely, if SUI drops to $0.50, the ceiling is 2x too generous.

**Impact:** Incorrect gas fee calculations during RPC outages could lead to financial loss or denial of service.

**Recommendation:**
- Track the age of the last successful price fetch.
- If the price data is stale (>5 minutes), trip the circuit breaker automatically.
- Log warnings when using fallback prices.
- Don't serve gas sponsorship requests when no valid price data exists.

---

### M-6: No Request Body Size Limit on Server Endpoints

**Location:** `apps/server/src/index.ts`

**Description:** The Hono server does not configure request body size limits. An attacker could send extremely large JSON payloads to `/api/gas` (which accepts transaction bytes), causing memory exhaustion.

**Impact:** Denial of service via memory exhaustion.

**Recommendation:** Add body size limits via Hono middleware:
```ts
app.use('*', bodyLimit({ maxSize: 256 * 1024 })); // 256KB
```

---

### M-7: AdminCap ID and UpgradeCap ID Hardcoded in Public SDK

**Location:** `packages/sdk/src/constants.ts:39-40`

```ts
export const T2000_ADMIN_CAP_ID = '0x863d...';
export const T2000_UPGRADE_CAP_ID = '0xef28...';
```

**Description:** While these IDs are discoverable on-chain, hardcoding them in the public SDK makes them more visible to attackers. The AdminCap controls protocol pause/unpause and fee changes. The UpgradeCap controls package upgrades.

**Impact:** Low direct impact (these are access-controlled on-chain), but increases attack surface visibility.

**Recommendation:** Remove the UpgradeCap ID from the SDK — it's not needed at runtime. Consider whether the AdminCap ID needs to be in the SDK constants.

---

## LOW

### L-1: Hashcash Replay Window Is Too Wide (24 Hours)

**Location:** `apps/server/src/lib/hashcash.ts:44-45`

**Description:** Hashcash stamps are valid for 24 hours. A solved challenge can be reused multiple times within this window (the server doesn't track used stamps). This partially defeats the purpose of the proof-of-work challenge.

**Recommendation:** Track used stamps in a time-bounded set (Redis or in-memory with expiry) and reject duplicates.

---

### L-2: Private Key Export Command Has No Rate Limiting

**Location:** `packages/cli/src/commands/exportKey.ts`

**Description:** The `t2000 export` command displays the raw private key. While it requires PIN entry, there's no rate limiting on PIN attempts — an attacker with access to the machine could brute-force the PIN.

**Recommendation:** Add exponential backoff on failed PIN attempts (e.g., store attempt count in the key file metadata or a separate lockfile).

---

### L-3: Error Messages May Leak Internal Details

**Location:** Multiple routes (e.g., `apps/server/src/routes/gas.ts:44`, `apps/server/src/routes/x402.ts:93`)

**Description:** Several error handlers pass the raw error message to the client:
```ts
const msg = error instanceof Error ? error.message : 'Gas sponsorship failed';
return c.json({ error: 'GAS_SPONSOR_FAILED', message: msg }, 500);
```

Internal error messages may reveal stack traces, database schema details, or RPC endpoint information to attackers.

**Recommendation:** Log detailed errors server-side and return generic error messages to clients in production.

---

### L-4: Database Connection String Not Validated

**Location:** `apps/server/src/db/prisma.ts`

**Description:** The Prisma client is initialized without validating the `DATABASE_URL` format. A malformed URL could cause cryptic errors at runtime. While the server checks for `DATABASE_URL` presence at startup, it doesn't validate the connection.

**Recommendation:** Add a connection test at startup (e.g., `prisma.$queryRaw\`SELECT 1\`` in the startup sequence).

---

### L-5: CI/CD Uses Long-Lived AWS Access Keys

**Location:** `.github/workflows/deploy-server.yml:59-61`, `.github/workflows/deploy-indexer.yml:59-61`

**Description:** Both deployment workflows use `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` stored as GitHub secrets. These are long-lived credentials that, if compromised, provide persistent access to AWS resources.

**Recommendation:** Migrate to GitHub OIDC federation with AWS IAM roles, which uses short-lived tokens:
```yaml
- uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::ACCOUNT:role/github-actions
    aws-region: us-east-1
```

---

## INFORMATIONAL

### I-1: Smart Contract Security Is Well-Designed

The Move contracts implement several security best practices:
- **AdminCap-gated access control** for privileged operations.
- **7-day timelock** on fee changes (`FEE_TIMELOCK_MS = 604_800_000`).
- **5% hard cap** on fees (`MAX_FEE_BPS = 500`).
- **Version gating** to prevent stale package calls after upgrades.
- **Two-step admin transfer** (propose + accept pattern).
- **Event emission** for all state changes (auditability).
- **Integer overflow safety** via Sui Move's built-in overflow checks.

No vulnerabilities were found in the smart contract layer.

---

### I-2: Key Management Is Well-Implemented

The wallet encryption in `packages/sdk/src/wallet/keyManager.ts` follows best practices:
- AES-256-GCM authenticated encryption.
- Random 32-byte salt and 16-byte IV per key.
- scrypt KDF for passphrase derivation.
- File permissions set to `0o600` (owner read/write only).
- Check-before-write to prevent accidental overwrites.

The only concern is the KDF parameter strength (see M-3).

---

### I-3: Transaction Simulation Before Execution

The SDK correctly simulates transactions via `dryRunTransactionBlock` before signing in the gas station flow (`services/gasStation.ts:86-88`). The `simulateTransaction` utility in the SDK provides Move abort code mapping for user-friendly errors.

---

### I-4: Circuit Breaker Pattern for Price Volatility

The price cache (`apps/server/src/lib/priceCache.ts`) implements a circuit breaker that pauses gas sponsorship when SUI price changes >20% in one hour. This is a good defense against oracle manipulation or flash crash exploitation. However, see M-5 for the fallback price concern.

---

## Recommendations — Priority Order

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | C-1: Auth + rate limit + allowlist on `/api/gas` | Medium | Prevents gas wallet drain |
| 2 | H-1: Restrict CORS origins | Low | Blocks cross-origin abuse |
| 3 | H-3/H-4: Verify tx digests or remove POST endpoints | Medium | Data integrity |
| 4 | H-2: Auth on `/api/stats` | Low | Prevents info disclosure |
| 5 | H-5: Auth on `/x402/settle` | Low | Payment integrity |
| 6 | M-4: Add security headers to Next.js | Low | Browser hardening |
| 7 | M-6: Add request body size limits | Low | DoS prevention |
| 8 | M-1: Persistent rate limiting + IP validation | Medium | Rate limit effectiveness |
| 9 | M-5: Handle stale price data | Medium | Financial accuracy |
| 10 | L-5: Migrate to OIDC for AWS | Medium | Supply chain security |

---

## Files Reviewed

### Server (`apps/server/src/`)
- `index.ts` — Hono app setup, CORS, logging
- `routes/sponsor.ts` — Wallet init sponsorship
- `routes/gas.ts` — Gas sponsorship + reporting
- `routes/x402.ts` — Payment verification + settlement
- `routes/fees.ts` — Fee ledger
- `routes/health.ts` — Health check
- `services/gasStation.ts` — Gas sponsorship logic
- `services/sponsor.ts` — Sponsor wallet init logic
- `lib/wallets.ts` — Keypair loading
- `lib/hashcash.ts` — Proof-of-work challenges
- `lib/signingQueue.ts` — Serial signing queue
- `lib/priceCache.ts` — SUI price oracle + circuit breaker
- `db/prisma.ts` — Database client
- `indexer/indexer.ts` — Checkpoint indexer
- `indexer/eventParser.ts` — On-chain event classification

### SDK (`packages/sdk/src/`)
- `constants.ts` — All hardcoded IDs and configuration
- `wallet/keyManager.ts` — AES-256-GCM key encryption
- `wallet/send.ts` — Token transfer transactions
- `gas/gasStation.ts` — Gas station API client
- `gas/autoTopUp.ts` — USDC→SUI auto top-up
- `gas/manager.ts` — Gas resolution chain
- `protocols/navi.ts` — NAVI lending integration
- `protocols/cetus.ts` — Cetus DEX integration
- `protocols/protocolFee.ts` — On-chain fee collection
- `utils/simulate.ts` — Transaction simulation
- `utils/sui.ts` — Address validation

### Contracts (`packages/contracts/sources/`)
- `t2000.move` — Core config + AdminCap
- `treasury.move` — Fee treasury
- `admin.move` — Admin operations + timelock
- `constants.move` — Protocol constants
- `errors.move` — Error codes

### CLI (`packages/cli/src/commands/`)
- `exportKey.ts` — Private key export
- `importKey.ts` — Private key import

### x402 (`packages/x402/src/`)
- `facilitator.ts` — Payment verification logic

### Web (`apps/web/`)
- `app/api/stats/route.ts` — Stats API
- `next.config.ts` — Next.js configuration

### Infrastructure
- `.github/workflows/ci.yml` — CI pipeline
- `.github/workflows/deploy-server.yml` — Server deployment
- `.github/workflows/deploy-indexer.yml` — Indexer deployment
- `infra/server-task-definition.json` — ECS task definition
