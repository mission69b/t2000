# RUNBOOK — Agent Wallet Greenfield Pivot · Mainnet Smokes (Phase A Day 6)

> **Owner:** founder (manual execution). **Purpose:** validate the v4 CLI's
> write paths (send / swap / pay) against mainnet on a real funded wallet
> after the Day 1-5 code work shipped (S.328-S.332).
>
> **Why this is a runbook, not an automated test:** every step here moves
> real money on Sui mainnet (USDC + USDsui + SUI). Day 6's autonomous
> integration smokes (`src/program.integration.test.ts`) cover wiring,
> arg validation, idempotency, and JSON-mode shape — but never sign a
> transaction. The runbook below closes the gap.

---

## Pre-flight (5 min)

1. **Confirm current dist matches the Day 5 commit (`b6e39927`):**
   ```bash
   cd /Users/funkii/dev/t2000
   git rev-parse HEAD                       # expect b6e39927 or a later Day 6 SHA
   pnpm --filter @t2000/cli build           # rebuild against current source
   node packages/cli/dist/index.js --version
   ```

2. **Move the legacy v3 wallet out of the way:**
   ```bash
   ls -la ~/.t2000/wallet.key               # ~375 bytes = v3 AES envelope
   mv ~/.t2000/wallet.key ~/.t2000/wallet.key.v3-backup
   mv ~/.t2000/.pin-lock ~/.t2000/.pin-lock.v3-backup 2>/dev/null || true
   mv ~/.t2000/.session ~/.t2000/.session.v3-backup 2>/dev/null || true
   ```

3. **Export the v3 wallet's Bech32 secret** (you'll need the v3 CLI to do
   this — `@t2000/cli@3.x`):
   ```bash
   # If the v3 binary is still on $PATH:
   t2000 export                             # prints suiprivkey1…
   # Save the suiprivkey1… string somewhere safe (1Password, etc.)
   ```

   Or, if you've already moved past v3.x: skip the export and start fresh
   with `t2 init` — but you'll have to send USDC + USDsui to the new
   address before continuing.

---

## Smoke 1 — `t2 init --import` (the migration path)

**Goal:** confirm the v3 → v4 migration works end-to-end and the
recovered address matches the v3 one.

```bash
T2=node /Users/funkii/dev/t2000/packages/cli/dist/index.js

# Paste the suiprivkey1… secret when prompted (interactive hidden input):
$T2 init --import

# Expected: "Wallet imported" + Address + Path
```

**Assertions:**
- ✅ Exit 0.
- ✅ Printed address matches the v3 wallet's address (cross-check against
  a Suiscan history of past transactions, or against an audric session
  that's signed in with this Google account).
- ✅ New file at `~/.t2000/wallet.key` is ~150 bytes (plain Bech32, not
  the ~375-byte AES envelope).
- ✅ File mode is `0600` (`ls -l ~/.t2000/wallet.key`).

**If it fails:** the `legacy-wallet-detect` banner from Day 1 should fire
if the v3 wallet wasn't moved aside. Move it and retry.

---

## Smoke 2 — Pre-conditions: balance + address + receive

```bash
T2=node /Users/funkii/dev/t2000/packages/cli/dist/index.js

$T2 wallet address                         # print Sui address
$T2 balance                                # show wallet holdings
$T2 receive                                # show QR + address for incoming transfers
```

**Assertions:**
- ✅ Address resolves and is the same in all three commands.
- ✅ Balance shows ≥ 0.02 USDC AND ≥ 0.02 USDsui (the gasless minimum) AND
  preferably ZERO SUI (to validate the "zero-SUI gasless send" gate).
- ✅ If SUI > 0, transfer it out to a different wallet first (`t2 send …
  SUI <other_address>`) so smoke 3 actually exercises the zero-SUI path.

---

## Smoke 3 — Zero-SUI gasless USDC send

**Goal:** confirm the Day 2 gRPC/gasless rewrite works end-to-end with
zero SUI in the wallet.

```bash
T2=node /Users/funkii/dev/t2000/packages/cli/dist/index.js

# Send 0.01 USDC (tiny amount; the gasless minimum is 0.01).
# Use a recipient you control so you can verify receipt:
RECIPIENT=0x…your_other_wallet…

$T2 send 0.01 USDC $RECIPIENT
```

**Assertions:**
- ✅ Exit 0.
- ✅ Output prints "GASLESS" badge / indicator.
- ✅ Returns a Sui transaction digest (`<64-char hex>` or base58).
- ✅ On Suiscan (https://suiscan.xyz/mainnet/tx/<digest>):
   - status: success
   - sender: the v4 wallet address
   - gas paid: by SPONSOR (not the sender)
   - balance change on recipient: +0.01 USDC
- ✅ `$T2 balance` after the send shows sender's USDC dropped by 0.01,
  SUI still zero (or unchanged).
- ✅ `$T2 history` includes the new digest as the most recent row.

**Document the digest in `audric-build-tracker.md`** under the S.333
entry.

---

## Smoke 4 — Zero-SUI gasless USDsui send

Same shape as Smoke 3, with USDsui instead of USDC.

```bash
T2=node /Users/funkii/dev/t2000/packages/cli/dist/index.js
RECIPIENT=0x…your_other_wallet…

$T2 send 0.01 USDsui $RECIPIENT
```

**Assertions:** same as Smoke 3 with the asset swapped. USDsui transfers
should ALSO use the gasless sponsor path (per the Day 2 design).

---

## Smoke 5 — `t2 swap 1 USDC SUI` (acquire gas)

**Goal:** validate the Day 3 swap command (Cetus aggregator). After this
the wallet WILL have some SUI gas — that's intentional, to set up smoke
6 (the SUI send path which requires standard gas, not sponsored).

```bash
T2=node /Users/funkii/dev/t2000/packages/cli/dist/index.js

# Preview first:
$T2 swap 1 USDC SUI --quote

# Execute:
$T2 swap 1 USDC SUI
```

**Assertions:**
- ✅ `--quote` exits 0, prints route + expected SUI received + price
  impact + slippage, does NOT sign or submit.
- ✅ Execute exits 0, returns a digest.
- ✅ Suiscan shows USDC out → SUI in, via Cetus.
- ✅ `$T2 balance` shows the new SUI balance.

---

## Smoke 6 — SUI send (non-gasless path, gas required)

**Goal:** validate that the non-stable asset path still works (uses
standard Sui gas the swap from smoke 5 acquired).

```bash
T2=node /Users/funkii/dev/t2000/packages/cli/dist/index.js
RECIPIENT=0x…your_other_wallet…

$T2 send 0.1 SUI $RECIPIENT
```

**Assertions:**
- ✅ Exit 0.
- ✅ Output does NOT print "GASLESS" badge (or prints a "STANDARD GAS"
  badge).
- ✅ Suiscan shows gas paid by the sender (not a sponsor).

---

## Smoke 7 — `t2 pay <real_url>` end-to-end (MPP / x402)

**Goal:** validate the Day 3 pay command against a real MPP endpoint.

```bash
T2=node /Users/funkii/dev/t2000/packages/cli/dist/index.js

# Discovery first:
$T2 services search openai
$T2 services inspect https://mpp.t2000.ai/openai

# Estimate (no payment):
$T2 pay https://mpp.t2000.ai/openai/v1/chat/completions \
  --method POST \
  --data '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"say hi in one word"}]}' \
  --estimate

# Execute:
$T2 pay https://mpp.t2000.ai/openai/v1/chat/completions \
  --method POST \
  --data '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"say hi in one word"}]}' \
  --max-price 0.05
```

**Assertions:**
- ✅ `services search openai` returns ≥ 1 OpenAI endpoint with a price.
- ✅ `services inspect` shows all OpenAI endpoints + prices.
- ✅ `--estimate` exits 0, prints price + service info, does NOT pay.
- ✅ Execute exits 0:
  - 402 challenge parsed from the gateway response.
  - USDC transfer signs (gasless) + submits.
  - Gated content returns: a JSON chat completion from gpt-4o-mini.
- ✅ Suiscan shows the USDC transfer digest.
- ✅ `$T2 balance` shows USDC dropped by ≤ $0.05.

---

## Smoke 8 — `t2 limit` enforcement (live)

**Goal:** confirm Day 4's opt-in spending caps actually block a real
write.

```bash
T2=node /Users/funkii/dev/t2000/packages/cli/dist/index.js
RECIPIENT=0x…your_other_wallet…

# Set a low cap:
$T2 limit set --per-tx 0.005

# Try to send 0.01 USDC — should be blocked:
$T2 send 0.01 USDC $RECIPIENT
# Expected: exit 1, "LimitExceeded" message with $0.005 cap vs $0.01 attempted

# --force override:
$T2 send 0.01 USDC $RECIPIENT --force
# Expected: exits 0, real transfer happens

# Cleanup:
$T2 limit reset
```

**Assertions:**
- ✅ First send blocks with structured error (operation: send, limit:
  0.005, attempted: 0.01).
- ✅ `--force` flag overrides cleanly.
- ✅ Reset returns config to empty state.

---

## Post-flight

1. **Document every digest** in `audric-build-tracker.md` under a new
   `## S.333 — Phase A Day 6 mainnet smokes` entry. One row per smoke
   with the digest + Suiscan link.

2. **If any smoke fails:** stop and investigate. Don't proceed to the
   next smoke. The most likely failure modes:
   - Gasless send rejects with "no SUI for gas" → Day 2 fix didn't land
     correctly in `sdk/wallet/send.ts`.
   - `t2 pay --estimate` doesn't show a 402 challenge → Day 3 mppx
     integration is broken.
   - `t2 swap --quote` returns empty route → Cetus aggregator wiring is
     broken.

3. **Once all 8 smokes pass:** Phase A is officially DONE. Update
   `HANDOFF_NEXT_AGENT.md` to switch the "next thing to do" pointer to
   Phase B (skills + MCP sweep). Promote SPEC_AGENT_WALLET_GREENFIELD's
   Phase A row from `pending` to `done`.

4. **Roll the v3 backup forward:** once you're confident the v4 wallet
   works (≥ 1 week of successful sends), delete the
   `~/.t2000/wallet.key.v3-backup` file. Until then, keep it as the
   "fallback in case v4 has a bug we missed."

---

## Estimated time

- Pre-flight: 5 min
- Smokes 1-2: 5 min
- Smokes 3-6 (the 4 send/swap paths): 15-20 min (waiting for chain
  finality between each)
- Smoke 7 (pay end-to-end): 5 min
- Smoke 8 (limit enforcement): 5 min
- Post-flight (digest documentation): 5 min

**Total: ~45 min wall-clock** including chain-finality waits.

---

## Cross-references

- Phase A SPEC: `spec/active/shipping/SPEC_AGENT_WALLET_GREENFIELD.md`
- Day-by-day execution log: `audric-build-tracker.md` S.328 (Day 1) →
  S.332 (Day 5) → S.333 (Day 6 mainnet smokes — this runbook closes it)
- Day 1 legacy-wallet-detect: `packages/cli/src/lib/legacy-wallet-detect.ts`
- Day 2 gRPC/gasless rewrite: `packages/sdk/src/wallet/send.ts`
- Day 3 send/swap/pay: `packages/cli/src/commands/{send,swap,pay}.ts`
- Day 4 limit enforcement: `packages/cli/src/commands/limit/enforce.ts`
- Day 5 v4 surface lock: `packages/cli/src/program.ts`
