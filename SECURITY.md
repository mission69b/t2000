# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.36.x  | ✅        |
| < 0.36  | ❌        |

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
- `@t2000/sdk` — Key management, transaction building, send / swap / pay routing
- `@t2000/cli` — Input validation, wallet file handling
- `@t2000/mcp` — MCP server tool permissions, input validation
- `@suimpp/mpp` — x402 / MPP payment method (Sui USDC)
- Move contracts — On-chain fee collection, admin controls
- Website — XSS, injection, authentication bypass

> `@t2000/engine` was retired and deleted from this monorepo (2026-06-14). The published
> `@t2000/engine@4.x` remains on npm for the frozen legacy Audric app and is out of scope
> for this repo's security policy.

### Out of scope

- Third-party protocol vulnerabilities (NAVI contracts)
- Social engineering attacks
- Denial of service via rate limiting (already implemented)
- Issues in dependencies (report to upstream maintainers)

## Security Measures

- AES-256-GCM encrypted key storage with scrypt KDF
- Transaction simulation before execution
- On-chain timelocked governance (7-day fee change delay)
- Automated security scanning via GitHub Actions (CodeQL, dependency audit)
- Transaction simulation + input validation across SDK and CLI

> **Engine Security Model — historical.** `@t2000/engine` (the conversational-finance
> harness — permission tiers, guards, delegated `pending_action` execution, cost limits,
> session isolation) was retired and deleted from this monorepo on 2026-06-14. Its security
> model applied to the engine package only and is no longer part of this repo. The published
> `@t2000/engine@4.x` consumed by the frozen legacy Audric app is out of scope here.

## Audit Status

**Last audit**: March 2026 (automated full-stack review)
**Status**: Findings being remediated — contact the maintainers for the full report

This is beta software. Use at your own risk. See [DISCLAIMER](/disclaimer) for details.
