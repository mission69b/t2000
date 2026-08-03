# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 8.x (latest major) | ✅ |
| < 8 | ❌ |

`@t2000/{sdk,cli,mcp,id}` release in lockstep — only the latest major receives
security fixes.

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

**GitHub Security Advisories** (preferred): [Report a vulnerability](https://github.com/mission69b/t2000/security/advisories/new)

Include: a description, steps to reproduce, potential impact, and a suggested fix
if you have one.

### Response timeline

- **Acknowledgment**: within 48 hours
- **Initial assessment**: within 5 business days
- **Fix timeline**: critical issues within 7 days, others within 30 days

### Scope

- `@t2000/sdk` — key handling, transaction building, gasless send / swap / pay,
  spend-limit enforcement, receipt verification (`verifyReceipt`)
- `@t2000/cli` — input validation, wallet file handling (`~/.t2000`, `0600`)
- `@t2000/mcp` — DEPRECATED (stdio retired); the MCP surface is hosted Passport Connect (`audric/apps/mcp`)
- `@t2000/id` — `agent_id::registry` transaction builders
- Move contracts (`contracts/`) — `agent_id::registry` (ownership / kill-switch
  authorization) and `confidential_anchor` (receipt-anchor integrity)
- `packages/serve` — merchant-side x402: challenge issuance, settle verification, upstream
  API-key isolation
- Websites (`apps/web`, `apps/docs`) — XSS, injection

### Out of scope

- The retired `@t2000/engine@4.x` on npm (frozen legacy consumer app only)
- Social engineering; DoS via rate limiting (implemented)
- Vulnerabilities in third-party dependencies (report upstream)

## Security Measures

- **Non-custodial keys** — Ed25519, Bech32 JSON at `0600`; the private key never
  leaves the user's machine. (No PIN/passphrase layer by design — the security
  boundary is the filesystem ACL; see `ARCHITECTURE.md § Wallet + keys`.)
- **Default-on spending limits** — per-tx + daily caps enforced inside the SDK,
  gating CLI **and** MCP writes.
- **Payment verification** — challenge-bound signed payments, structurally
  verified before settlement; the handler runs BEFORE money moves, so a
  failing seller never charges the buyer (no-charge-on-failure).
- **Confidential inference** — an Audric product (`api.audric.ai`):
  fail-closed GPU-TEE attestation, TEE-signed receipts, Sui-anchored hashes.
- **Automated scanning** — CodeQL + dependency audit in GitHub Actions.

## Audit Status

**Last audit**: March 2026 (automated full-stack review)
**Status**: findings remediated on a rolling basis — contact the maintainers for
the report.

This is beta software. Use at your own risk.
