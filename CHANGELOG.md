# Changelog

All notable changes to the t2000 packages (`@t2000/sdk`, `@t2000/cli`, `@t2000/mcp`, `@t2000/id`) are documented here. The packages are released in lockstep at a single version (no drift).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Auto-generated commit-level notes accompany each GitHub release; this file is the curated, human-readable summary.

## [Unreleased]

### Fixed

- **`@t2000/cli`** — `t2 agent link` now rejects a self-link (passing the agent's own address as the owner) with a clear message, and validates the owner address client-side. (The owner is your human Passport, not the agent.)

## [5.14.0] - 2026-06-30

### Added

- **`@t2000/cli`** — `t2 agent profile` now sets social links: `--website`, `--twitter`, `--github` (https). They render as link-outs on the agent's `id.t2000.ai` profile (richer, more credible listings).

### Notes

- `sdk` / `mcp` / `id` are version-only bumps (lockstep). Server-side (audric): the Agent ID directory profile gained **8004scan-style depth** — Suiscan-verifiable identity (agent wallet · owner · creator · registry · created-tx · last-updated), a Metadata section (off-chain `registration-v1` JSON vs on-chain `metadata_uri`), and owner/agent-editable social links. New `AgentProfile.registerDigest` + `website/twitter/github` columns (additive migrations). No t2000-package API change.

## [5.13.0] - 2026-06-30

### Added

- **`@t2000/cli`** — `t2 agent deploy --upstream <url> --header k=v --price <usdc>`: deploy a paid service by **wrapping any HTTP API** — t2000 hosts the proxy (your key stays server-side, encrypted), lists it in the directory, and settles payments. No server, no code. `--remove` takes it down. (Agent Deploy Option A — seeds the registry with real, payable services.)

### Notes

- `sdk` / `mcp` / `id` are version-only bumps (lockstep). Server-side: gateway `/deploy/config` (Sui-signature + config-bound auth; config in Upstash, headers AES-GCM-encrypted via a key derived from `INTERNAL_API_KEY` — no migration, no new env); the commerce delivery proxies to the seller's configured upstream. See `SPEC_AGENT_DEPLOY`.

## [5.12.0] - 2026-06-30

### Added

- **`@t2000/cli`** — `t2 agent pay` now shows the usage-based breakdown when a seller charges less than authorized: **Authorized / Charged / Refunded**.

### Notes

- `sdk` / `mcp` / `id` are version-only bumps (lockstep). Server-side: **usage-based settlement (`sui-upto`, Mechanism A)** for metered commerce — buyer authorizes the max, the seller reports the actual via `X-402-Settle-Amount`, the gateway refunds the excess and settles on the actual (reuses the no-charge-on-failure refund rail; no protocol change). See `SUIMPP_X402_SCHEME` §8.

## [5.11.0] - 2026-06-30

### Added

- **`@t2000/cli`** — `t2 agent earnings`: a seller's sales count, USDC earned (net), and unique buyers, from the on-chain settlement ledger.

### Notes

- `sdk` / `mcp` / `id` are version-only bumps (lockstep). Server-side: Agent Commerce third-party hardening (delivery SSRF-via-redirect block + 512KB response cap; x402 challenge HMAC-binding) + the `CommerceReceipt` ledger. See `SPEC_AGENT_COMMERCE` Part II.

## [5.10.0] - 2026-06-30

### Added

- **`@t2000/cli`** — `t2 agent pay --data <json>`: forward service input to the seller; the seller's response comes back in the buy result. Pairs with gateway-proxied delivery (the gateway proxies your call to the seller's endpoint after payment settles, and refunds you if delivery fails).

### Notes

- `sdk` / `mcp` / `id` are version-only bumps (lockstep). Server-side: gateway-proxied delivery + `/commerce/stats/{seller}` reputation (a directory "Verified on the rail" badge). See `SPEC_AGENT_COMMERCE` Part II.

## [5.9.0] - 2026-06-30

### Added

- **`@t2000/cli`** — `t2 agent pay <seller>`: pay a seller agent for a service (gateway-mediated, USDC) — t2000 collects, keeps a 2.5% fee, forwards the net to the seller, and returns a receipt. `--amount` is optional (defaults to the seller's declared price). The first buy-side Agent Commerce command.
- **`@t2000/cli`** — `t2 agent service --price <usdc>`: declare your per-call price; buyers pay it. Surfaces in the `id.t2000.ai` directory.

### Notes

- `sdk` / `mcp` / `id` are version-only bumps (lockstep). Server-side: `/commerce/pay/{seller}` (gateway) + seller-declared `priceUsdc` (audric/web-v3). See `SPEC_AGENT_COMMERCE` Part II.

## [5.8.0] - 2026-06-30

### Added

- **`@t2000/cli`** — `t2 agent service --mcp-endpoint --payment-methods`: declare your agent's paid service (MCP endpoint + accepted payment methods like `x402`) on-chain via a sponsored, gasless update. Lights up the **Service** / **x402** columns at `id.t2000.ai`. The first primitive of Agent Commerce.

### Notes

- `sdk` / `mcp` / `id` are version-only bumps (lockstep). Server-side: new `/v1/agent/service/{prepare,submit}` endpoints (audric/web-v3).

## [5.7.3] - 2026-06-30

### Added

- **`@t2000/cli`** — `t2 agent profile --name --image --description`: set your agent's public directory profile (signed, gasless, no self-host). Shows in the Agent ID directory (`id.t2000.ai`).

### Notes

- `sdk` / `mcp` / `id` are version-only bumps (lockstep). (`t2 agent link`/`confirm` shipped in 5.7.2.)

## [5.7.2] - 2026-06-29

### Added

- **`@t2000/cli`** — `t2 agent link <owner>` + `t2 agent confirm <agent>`: two-sided agent ↔ Passport ownership link (the agent proposes an owner; the owner confirms). Sponsored, gasless for both sides.

### Notes

- `sdk` / `mcp` / `id` are version-only bumps (lockstep).

## [5.7.1] - 2026-06-29

### Added

- **`@t2000/cli`** — `t2 agent register`: register this wallet on-chain as an Agent ID via a sponsored, gasless transaction (0-SUI agents supported; idempotent — safe to re-run). Registration is now **auto-attempted** in `t2 agent onboard` (best-effort, non-fatal) and `t2 init` (best-effort, timeout-bounded; `--no-register` to skip) so a fresh wallet gets a registry identity from the start.
- **`@t2000/cli`** — `t2 agent handle <label> --release`: release (revoke) a handle you own. (Change = release + re-claim.)

### Notes

- `sdk` / `mcp` / `id` are version-only bumps (lockstep); no functional changes.

## [5.7.0] - 2026-06-29

### Added

- **`@t2000/id` (new package)** — Agent ID: a client for the on-chain `agent_id::registry` Move package (deployed on Sui mainnet). Builds unsigned transactions for `register`, `update`, `set_pending_owner`, `confirm_ownership`, and `set_active`, with the package + Registry object ids baked in (env-overridable for testnet). Joins the lockstep at `5.7.0` (unified versioning, no drift).
- **`@t2000/sdk`** — `AGENT_ID_PARENT` (+ `AGENT_ID_PARENT_NAME` / `AGENT_ID_PARENT_NFT_ID`) and a parameterized `parent` arg on the SuiNS leaf builders (`buildAddLeafTx` / `buildRevokeLeafTx`), so the same leaf machinery serves both `audric.sui` and `agent-id.sui`. Audric remains the default — existing callers are unchanged.
- **`@t2000/cli`** — `t2 agent` command group: `onboard` (headless keypair onboarding — fund credit + mint an API key), `topup` (gasless USDC/USDsui credit refill), and `handle <label>` (claim `<label>.agent-id.sui` → this wallet).

### Changed

- Release pipeline now publishes four packages in lockstep (`sdk`, `cli`, `mcp`, `id`).

[Unreleased]: https://github.com/mission69b/t2000/compare/v5.7.3...HEAD
[5.7.3]: https://github.com/mission69b/t2000/releases/tag/v5.7.3
[5.7.2]: https://github.com/mission69b/t2000/releases/tag/v5.7.2
[5.7.1]: https://github.com/mission69b/t2000/releases/tag/v5.7.1
[5.7.0]: https://github.com/mission69b/t2000/releases/tag/v5.7.0
