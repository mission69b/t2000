# Changelog

All notable changes to the t2000 packages (`@t2000/sdk`, `@t2000/cli`, `@t2000/mcp`, `@t2000/id`) are documented here. The packages are released in lockstep at a single version (no drift).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Auto-generated commit-level notes accompany each GitHub release; this file is the curated, human-readable summary.

## [Unreleased]

## [5.7.0] - 2026-06-29

### Added

- **`@t2000/id` (new package)** — Agent ID: a client for the on-chain `agent_id::registry` Move package (deployed on Sui mainnet). Builds unsigned transactions for `register`, `update`, `set_pending_owner`, `confirm_ownership`, and `set_active`, with the package + Registry object ids baked in (env-overridable for testnet). Joins the lockstep at `5.7.0` (unified versioning, no drift).
- **`@t2000/sdk`** — `AGENT_ID_PARENT` (+ `AGENT_ID_PARENT_NAME` / `AGENT_ID_PARENT_NFT_ID`) and a parameterized `parent` arg on the SuiNS leaf builders (`buildAddLeafTx` / `buildRevokeLeafTx`), so the same leaf machinery serves both `audric.sui` and `agent-id.sui`. Audric remains the default — existing callers are unchanged.
- **`@t2000/cli`** — `t2 agent` command group: `onboard` (headless keypair onboarding — fund credit + mint an API key), `topup` (gasless USDC/USDsui credit refill), and `handle <label>` (claim `<label>.agent-id.sui` → this wallet).

### Changed

- Release pipeline now publishes four packages in lockstep (`sdk`, `cli`, `mcp`, `id`).

[Unreleased]: https://github.com/mission69b/t2000/compare/v5.7.0...HEAD
[5.7.0]: https://github.com/mission69b/t2000/releases/tag/v5.7.0
