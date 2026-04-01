# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.7.x   | ✅        |
| < 0.7   | ❌        |

## Reporting a Vulnerability

If you discover a security vulnerability in t2000, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

### How to report

**GitHub Security Advisories** (preferred): [Report a vulnerability](https://github.com/mission69b/t2000/security/advisories/new)

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 5 business days
- **Fix timeline**: Critical issues within 7 days, others within 30 days

### Scope

The following are in scope:
- `@t2000/sdk` — Key management, transaction building, adapter routing
- `@t2000/engine` — LLM orchestration, tool permissions, cost limits, abort handling
- `@t2000/cli` — Input validation, PIN handling
- `@suimpp/mpp` — MPP payment method (Sui USDC)
- Server API — Gas sponsorship, fee ledger, sponsor endpoint
- Move contracts — On-chain fee collection, admin controls
- Website — XSS, injection, authentication bypass

### Out of scope

- Third-party protocol vulnerabilities (NAVI contracts)
- Social engineering attacks
- Denial of service via rate limiting (already implemented)
- Issues in dependencies (report to upstream maintainers)

## Security Measures

- AES-256-GCM encrypted key storage with scrypt KDF
- Transaction simulation before execution
- On-chain timelocked governance (7-day fee change delay)
- Circuit breaker for price volatility
- Automated security scanning via GitHub Actions (CodeQL, dependency audit)
- Adapter compliance test suite (317 tests)

### Engine Security Model (`@t2000/engine`)

- **Permission tiers** — Tools are classified as `auto` (read-only, no approval), `confirm` (requires user approval before execution), or `explicit` (manual-only, never auto-dispatched by LLM)
- **Confirmation flow** — Write tools yield `permission_request` events; execution blocks until the client calls `resolve(true/false)`. `AbortSignal` prevents deadlocks if the client disconnects.
- **Transaction serialization** — `TxMutex` ensures write tools execute sequentially, preventing Sui object version conflicts from concurrent mutations
- **Budget limits** — `CostTracker` enforces configurable `budgetLimitUsd`; engine stops when the threshold is reached
- **Max turns** — `QueryEngine` enforces `maxTurns` to prevent runaway LLM loops
- **Input validation** — All tool inputs are validated through Zod schemas before execution
- **Context isolation** — `MemorySessionStore` uses `structuredClone` to prevent cross-session data leaks

## Audit Status

**Last audit**: March 2026 (automated full-stack review)
**Report**: [SECURITY_AUDIT.md](./SECURITY_AUDIT.md)
**Status**: Findings being remediated — see report for details

This is beta software. Use at your own risk. See [DISCLAIMER](/disclaimer) for details.
