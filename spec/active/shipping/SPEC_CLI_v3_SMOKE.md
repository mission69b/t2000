# SPEC_CLI_v3_SMOKE — `@t2000/cli@3.1.0` Smoke Checklist

> **Status:** ACTIVE · drafted 2026-05-25 · target: any developer with a funded Sui mainnet keypair · est. 6-8 min
> **Build smoked:** `@t2000/cli@3.1.0`
> **Pre-req:** Node 18+ · clean shell (no existing `~/.t2000/` dir, OR ok to overwrite — set `T2000_KEY_PATH` to a sandbox path) · ≥$3 USDC + ≥0.1 SUI funded into the CLI wallet

---

## Why this exists

CLI v3.0.0 / v3.1.0 added a new ESLint config (cosmetic) but the CLI's runtime command surface didn't change. The CLI is the OS-installed entry point for non-Audric consumers — a published version that crashes on `t2000 balance` would be discovered by GitHub Issues, not by audric.

This is a **command-surface canary** — install global, run the 5 most-used commands, confirm exit codes + output shape. The funded send/save/borrow legs are LIVE on-chain; budget ~$0.50 in gas + fees.

---

## Setup (1 min)

```bash
npm i -g @t2000/cli@latest
t2000 --version
# expect: 3.1.0

# Use a sandbox key path so this doesn't touch your real wallet
export T2000_KEY_PATH="/tmp/t2000-smoke.key"
rm -f "$T2000_KEY_PATH"
```

---

## CLI-SMOKE-1 — `t2000 init` happy path (2 min)

```bash
t2000 init --no-mcp --no-safeguards --pin smoke-pin
```

### Verifiable signals

- ✅ Prints "Bank account created" with a `0x`-prefixed address.
- ✅ Creates `$T2000_KEY_PATH` (60+ bytes).
- ✅ Exit code 0.

Then fund the address with ≥$3 USDC + ≥0.1 SUI from your real wallet before running the next items.

---

## CLI-SMOKE-2 — `t2000 balance` (1 min)

```bash
t2000 balance --pin smoke-pin
```

### Verifiable signals

- ✅ Prints a balance table with `USDC`, `SUI`, `Savings`, `Health Factor` rows.
- ✅ USDC row reflects the deposit you just made (within ~30s of funding).
- ✅ Exit code 0.

If the balance is stale, `t2000 balance --refresh` (or just retry after 30s — the canonical fetcher's 60s cache may not have refreshed yet).

---

## CLI-SMOKE-3 — `t2000 send 0.5 USDC to <self-address>` (1 min)

Self-send is the cheapest way to exercise the full transaction path without losing funds.

```bash
SELF=$(t2000 address --pin smoke-pin)
t2000 send 0.5 USDC to "$SELF" --pin smoke-pin --confirm
```

### Verifiable signals

- ✅ Prints "Sent $0.50 USDC → 0x…" with the address echoed.
- ✅ Prints a Suiscan tx link (`https://suiscan.xyz/mainnet/tx/0x…`).
- ✅ Exit code 0.
- ✅ Re-running `t2000 balance` shows USDC unchanged (modulo gas).

---

## CLI-SMOKE-4 — `t2000 save 1 USDC` (2 min)

```bash
t2000 save 1 USDC --pin smoke-pin --confirm
```

### Verifiable signals

- ✅ Prints "Saved $1.00 USDC to best rate" with the APY printed.
- ✅ Prints a tx link.
- ✅ `t2000 balance` afterward shows `Savings` ≥ $1 (NAVI deposit landed).
- ✅ Exit code 0.

---

## CLI-SMOKE-5 — `t2000 rates` (1 min)

Read-only canary for the `rates_info` engine tool surface (CLI's `rates` wraps it).

```bash
t2000 rates
```

### Verifiable signals

- ✅ Prints a table with at minimum: `USDC`, `USDsui`, `SUI` rows.
- ✅ Each row has Supply APY + Borrow APY columns with positive numbers (not `0.00%` everywhere).
- ✅ Exit code 0.

---

## Wrap-up

If all 5 items pass, CLI 3.1.0 is shippable. Total on-chain cost ~$0.05 in gas + the 10 bps NAVI save fee on the $1 deposit.

Cleanup:

```bash
# Optional: withdraw the $1 you saved
t2000 withdraw 1 --pin smoke-pin --confirm
# Optional: send the remaining USDC back to your funding wallet
t2000 send 1 USDC to 0x<funding-wallet> --pin smoke-pin --confirm
# Then wipe the sandbox key
rm "$T2000_KEY_PATH"
```

Move this file to `spec/archive/<version>/SPEC_CLI_v3_SMOKE.md` after the founder confirms PASSED.
