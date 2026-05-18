# RUNBOOK — `audric.sui` parent NFT custody

**Status:** Active. **Owner:** Audric ops. **Last verified:** 2026-05-01 (mainnet smoke test passed end-to-end).

This runbook is the canonical operational reference for the `audric.sui` parent NFT — the on-chain identity that anchors every Audric user's `username.audric.sui` leaf subname (per SPEC 10 v0.2.1).

---

## 1. Standing operational facts

| Field | Value |
|---|---|
| Parent name | `audric.sui` |
| Parent NFT object ID | `0x070456e283ec988b6302bdd6cc5172bbdcb709998cf116586fb98d19b0870198` |
| Custody address | `0xaca29165188f10136073788f648e1186dd25100100146186ebecedaf94b23d11` |
| Custody type | Single hardened address, founder personal custody (per SPEC 10 D5 — multi-sig deferred to TD-S10-multi-sig at >10k handles) |
| Network | Sui mainnet |
| Registered on | 2026-05-01 |
| Renewal status | ✅ Renewed to max-term (5 years) — current expiry ~2031-05-01 |
| Next renewal trigger | T-90d before 2031-05-01 (calendar alert ~2031-02-01) |

## 2. Custody hardening checklist (SPEC 10 D5)

| # | Item | Status |
|---|---|---|
| 1 | Parent NFT lives on a dedicated single Sui address (NOT founder personal wallet) | ✅ Verified 2026-05-01 — owner is `0xaca2…23d11`, separate from dev wallet (`0x4e12…480f`) |
| 2 | Encrypted seed backup | ✅ Founder maintains private key in personal custody (single secure location). 3-location requirement waived per founder decision 2026-05-05. **Risk acknowledgment:** single-point-of-failure exists; mitigated by (a) founder-only access reduces compromise surface, (b) multi-sig migration trigger at 10k handles per `TD-S10-multi-sig` provides scale-out path. If founder custody practice changes (e.g. team member added, hardware key adopted), update this row to reflect actual practice. |
| 3 | Recovery procedure documented | ✅ See §5 below (drafted 2026-05-05; founder reviewed 2026-05-05) |
| 4 | Renewal cadence + monitoring | ✅ Renewed to max-term (5y) on 2026-05-05 → next expiry ~2031-05-01. SuiNS does NOT support auto-renewal (verified — see §6). Calendar alerts required; PagerDuty/cron deferred to scale-out per §6.2. |
| 5 | T-30d calendar alert before expiry | ⏳ TODO — set Google Calendar recurring alert on founder's calendar for ~2031-04-01 (T-30d before 2031-05-01 renewal). Tracked separately; deferred until ~2030-Q4 (5y away). |
| 6 | Emergency procedure ("what if compromised") | ✅ See §5.3 below |
| 7 | Multi-sig migration trigger (`TD-S10-multi-sig`) | 📌 Logged for >10k handles milestone. Trigger becomes more important under single-key custody (item 2) — at 10k handles, single-point-of-failure risk × consequence (every Audric user's identity) crosses the threshold for mandatory 3-of-5 multi-sig migration. |

## 3. SDK reference (Phase A.1 seed)

The minimum viable shape for `packages/sdk/src/protocols/suins-leaf.ts`. Verified end-to-end on mainnet 2026-05-01 (see smoke-test journal below).

```typescript
import { SuinsClient, SuinsTransaction } from '@mysten/suins';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';

const suiClient = new SuiJsonRpcClient({
  url: getJsonRpcFullnodeUrl('mainnet'),
  network: 'mainnet',
});
const suinsClient = new SuinsClient({ client: suiClient, network: 'mainnet' });

// CREATE leaf — Phase A.1 buildAddLeafTx({ parentNftId, label, targetAddress })
const PARENT_NFT_ID = '0x070456e283ec988b6302bdd6cc5172bbdcb709998cf116586fb98d19b0870198';

export function buildAddLeafTx({
  label,            // e.g. 'alice'   (NOT 'alice.audric.sui')
  targetAddress,    // user's wallet address
}: {
  label: string;
  targetAddress: string;
}): Transaction {
  const tx = new Transaction();
  const suinsTx = new SuinsTransaction(suinsClient, tx);
  suinsTx.createLeafSubName({
    parentNft: PARENT_NFT_ID,
    name: `${label}.audric.sui`,    // SDK expects the FULL path
    targetAddress,
  });
  return tx;
}

// REVOKE leaf — Phase A.1 buildRevokeLeafTx({ parentNftId, label })
export function buildRevokeLeafTx({ label }: { label: string }): Transaction {
  const tx = new Transaction();
  const suinsTx = new SuinsTransaction(suinsClient, tx);
  suinsTx.removeLeafSubName({
    parentNft: PARENT_NFT_ID,
    name: `${label}.audric.sui`,
  });
  return tx;
}
```

**Important note for SDK builders (gotcha caught during smoke test):** Sui's `dryRunTransactionBlock` returns `gasUsed.computationCost` as the cheap-looking `~100,000 MIST` figure. The **actual** net cost on execution is ~32× higher because storage cost dominates leaf creation (you're writing a new dynamic field on the SuiNS registry). Always compute net cost as `computationCost + storageCost - storageRebate`. The revoke tx likely has a NEGATIVE net cost (storage rebate > computation) — lifetime cost per username (mint + eventual revoke when account deleted) is even cheaper than the mint alone.

## 4. Operational facts (validated by smoke test 2026-05-01)

| Fact | Value | Source |
|---|---|---|
| Net gas per leaf mint | ~**3,222,612 MIST** = 0.0032 SUI = **~$0.011** at $3.50/SUI | Mainnet tx `FyDvNgu9sEVsbHTu6rSXe7aT3cc5i8fKWErmae1dTuoJ` |
| Indexer lag (mint → resolve visible) | ~1–3 seconds | Step 4 of smoke test (resolved on attempt 1 in production) |
| Indexer lag (revoke → resolve null) | <3 seconds | Step 6 of smoke test |
| Sponsored gas pitch math (100k users) | 100,000 × $0.011 = **~$1,100 total** absorbed via Enoki | Validates SPEC 10 D6 economic model |

## 5. Recovery procedures

### 5.1 — Private key inaccessible (founder-only access)

**Scenario:** Founder is temporarily unable to access the parent NFT custody key (lost device, locked-out password manager, travel without recovery means).

**Severity:** MEDIUM — service degrades but doesn't fail. Existing `*.audric.sui` leaves continue to resolve on-chain (read-only) and existing Audric users with handles are unaffected. New signups can't claim handles; rename + admin-revoke flows are paused. Resolves when founder regains access.

**Procedure:**
1. **Halt** the new-signup username picker (set `NEXT_PUBLIC_USERNAME_PICKER_ENABLED=false` in Vercel; force-redeploy). New sign-ups continue WITHOUT claiming a handle; existing users unaffected. Surface "Username claiming temporarily unavailable" copy in the picker UI.
2. **Communicate** internally only (no public communication needed if access is restored within 7 days). Users in the rename / admin-revoke queue get a one-line "your request is queued; we're processing it shortly."
3. **Restore** founder access via whatever recovery means the founder maintains (hardware key replacement, password manager 2FA recovery, etc.).
4. **Re-enable** the picker once access is restored.

**Time budget:** depends on the recovery means. Single-key custody (per §2 item 2) means the recovery path is whatever the founder set up. **If founder's recovery means itself fails**, escalate to §5.2 (functionally equivalent to "all backups lost").

### 5.2 — Private key permanently lost (catastrophic)

**Scenario:** Founder permanently loses access to the parent NFT custody key (key destroyed without recovery means; founder incapacitated without succession plan; storage medium corrupted with no backup).

**Severity:** CATASTROPHIC — the parent NFT is permanently inaccessible. Every existing `*.audric.sui` leaf becomes orphaned (still resolves on-chain, but no revocations or new mints possible). Audric's identity layer is functionally frozen until parent name expires (~2031-05-01 with current max-term renewal) at which point someone else can claim `audric.sui` from the public pool.

**Why this risk profile is acceptable for v0.1 (founder decision 2026-05-05):**
- Audric's user count is small (<1000 handles at SPEC 10 launch); blast radius is bounded.
- Founder maintains key in personal custody, which keeps the compromise surface (hostile parties who could exfiltrate it) minimal.
- The 5-year max-term renewal buys ~5 years of grace before the parent name even risks public-pool reclamation, providing enormous lead time for recovery attempts.
- The migration trigger to multi-sig at 10k handles (`TD-S10-multi-sig`) provides a structural scale-out path before single-key custody becomes inappropriate for the user base.

**Procedure:**
1. **Escalate** to founder (or founder's designated successor under their continuity plan) within 24 hours of loss confirmation.
2. **Halt** the new-signup picker per §5.1 step 1.
3. **Public communication** (recommended): post-mortem blog post explaining the loss; users keep their existing handles (which still resolve on-chain) but can't change them or claim new ones until step 5 completes.
4. **Existing users:** remain whole — their `*.audric.sui` handles continue to resolve on-chain forever (or until parent name expires ~2031). They can still receive funds via their handle. Rename and admin-revoke are unavailable.
5. **New parent name option** (only if recovery is genuinely impossible): register a new parent (e.g. `audric-v2.sui`) on a fresh address and migrate the signup flow to mint leaves under it. Existing `*.audric.sui` leaves are NOT migrated (no on-chain mechanism to move leaves between parents without the original parent NFT). New users get `*.audric-v2.sui`. Two-namespace problem indefinitely; engine `lookup_user` tool must handle both namespaces during the transition.

**There is no on-chain recovery path** if the parent NFT custody key is permanently lost. The parent NFT cannot be re-derived; SuiNS leaves cannot be moved between parents. Prevention is the only defense; founder is responsible for maintaining whatever personal-custody recovery means provides their target reliability level.

### 5.3 — Custody address compromise detected

**Scenario:** Evidence that the parent NFT custody address has been accessed by an unauthorized party (unexpected outbound transactions visible on-chain; backup storage medium shows tampering signs; team member reports a phishing attack that may have exposed the encryption passphrase).

**Severity:** HIGH — attacker can revoke existing leaves (denial-of-service against Audric users) and mint new leaves to addresses they control (impersonation attacks: `support.audric.sui` → attacker's wallet). Speed of response matters.

**Procedure (do these in order, within 1 hour of detection):**
1. **Halt** any in-flight Audric signup flow (set `NEXT_PUBLIC_USERNAME_PICKER_ENABLED=false` in Vercel; force-redeploy). New sign-ups continue without claiming a username; existing users unaffected.
2. **Generate** a new custody address (fresh Ed25519 keypair, new hardened storage). DO NOT reuse the compromised address even after revoking access.
3. **Move** the parent NFT from the compromised address to the new custody address using the SuiNS dashboard (assuming the compromise hasn't already moved it). This is a single Sui transaction signed by the compromised key — sequence matters; the attacker may also be racing to move it.
4. **If the attacker won the race** (parent NFT now in attacker's address): escalate to scenario 5.2 (effectively key-permanently-lost from Audric's perspective — we no longer control the parent NFT). The attacker can revoke leaves at will until the parent name expires. Public communication required immediately.
5. **If Audric won the race**: revoke any leaves the attacker may have minted between compromise-detection and parent-NFT-move. Compare on-chain `*.audric.sui` leaves against `User.username` rows in audric's Postgres; revoke any leaves with no matching User row.
6. **Update** `RUNBOOK_audric_sui_parent.md` §1 with the new custody address + §2 with the new key custody practice.
7. **Re-enable** signup flow.

**Detection sources:**
- Sui RPC alert on parent NFT object owner change (set up monitoring against `0x070456e283ec988b6302bdd6cc5172bbdcb709998cf116586fb98d19b0870198`)
- Periodic audit of `User.username` vs on-chain `*.audric.sui` resolution (if a leaf exists on-chain but no User row owns it → attacker mint)
- Founder periodically verifies key access works (recommend monthly — equivalent of "open the password manager and confirm it still unlocks"; no transaction needed)

### 5.4 — Parent name expiry approaches (renewal procedure)

**Scenario:** The `audric.sui` parent name registration is within 30 days of expiry. SuiNS does NOT support auto-renewal (verified 2026-05-05; see §6 below). Manual renewal is required.

**Severity:** MEDIUM if caught at T-30d; HIGH if caught during 30-day grace period (after grace ends, anyone can claim `audric.sui` from the public pool).

**Procedure:**
1. **Connect** the custody address to the SuiNS dashboard (`https://suins.io`).
2. **Navigate** to Names → `audric.sui` → context menu → "Renew name".
3. **Set Registration Period** to the maximum (5 years minus current registration). Renewing every 5 years = pay once, forget for 5 years.
4. **Calculate cost:** SuiNS pricing varies by name length and tier. For a 6-char name like `audric`, expect ~30–60 SUI per year of renewal (verify on the dashboard before signing). Pre-fund the custody address with enough SUI for the full term BEFORE starting the renewal flow (the renewal tx fails if SUI balance is insufficient).
5. **Sign** the renewal transaction.
6. **Verify** on-chain: `client.getDynamicFieldObject({ parentId: SUINS_REGISTRY, name: { type: 'string', value: 'audric.sui' } })` should show the updated `expirationTimestampMs`.
7. **Update** the calendar alerts (§6.1) for the new expiry date — push every trigger forward by the renewal extension.

**Cost estimate:** at current SuiNS pricing (~30 SUI/year for 6-char names) and current SUI price (~$3.50), 5-year renewal = ~150 SUI = ~$525. Trivial; bake into operational budget.

---

## 6. SuiNS renewal monitoring (verified 2026-05-05)

**Verdict from research (`https://docs.suins.io/user/renew`):**
- ❌ **No auto-renewal subscription feature exists** on SuiNS. Manual renewal only.
- ✅ Maximum 5-year renewal period (5 years TOTAL — so if registered for 1 year, can renew for 4 more max).
- ✅ 30-day grace period after expiry; if not renewed in grace, name returns to public pool.

**Implication:** Audric ops MUST maintain a calendar-based renewal alert system. There is no "set and forget" path on the protocol side.

### 6.1 — Required calendar alerts

Current expiry: ~2031-05-01 (max-term renewal completed 2026-05-05). Set the alerts below on the founder's calendar — all dates anchored to the current expiry.

| Trigger | Date | What it alerts | Owner |
|---|---|---|---|
| **T-90d** before expiry | ~2031-02-01 | "Renewal window opens in 60 days. Verify custody address SUI balance is sufficient for 5y renewal (~150 SUI at current pricing); pre-fund if not." | Founder |
| **T-30d** before expiry | ~2031-04-01 | "PRIMARY renewal alert. Run §5.4 procedure now." | Founder |
| **T-7d** before expiry | ~2031-04-24 | "BACKUP alert. If §5.4 not yet executed, do it TODAY." | Founder |
| **T+0** (expiry day) | ~2031-05-01 | "Last chance before 30-day grace period begins." | Founder |
| **T+25d** (5 days before grace ends) | ~2031-05-26 | "EMERGENCY: name expires in 5 days; if not renewed, `audric.sui` becomes claimable by anyone." | Founder + any ops channels by then |

**Implementation:** Google Calendar recurring alerts on the founder's calendar are sufficient for v0.1 ops. At scale (>10k handles per `TD-S10-multi-sig`), migrate to a dedicated PagerDuty alert backed by §6.2's cron — this also matches the multi-sig migration timing (both kick in at the same scale threshold).

**Lead time math:** 5y between now (2026-05-05) and next renewal trigger (~2031-02-01) = ~4y 9mo of cushion. Plenty of margin to (a) build the §6.2 cron, (b) migrate to multi-sig if user count grows, or (c) decide to wind down the parent NFT and release `audric.sui` to a community foundation (per the SPEC 10 D1 contractual posture).

### 6.2 — On-chain expiry monitoring (recommended for v0.1 ops)

A 30-line t2000-server cron job can poll the parent NFT's `expirationTimestampMs` daily and emit a Slack/Resend alert when within 90 days:

```typescript
// apps/server/src/cron/jobs/parentNameExpiryMonitor.ts (PROPOSED — not yet built)
import { SuinsClient } from '@mysten/suins';

const PARENT_NAME = 'audric.sui';
const ALERT_THRESHOLDS_DAYS = [90, 30, 7, 0, -25]; // negative = inside grace

export async function monitorParentNameExpiry() {
  const suinsClient = new SuinsClient({ /* ... */ });
  const nameRecord = await suinsClient.getNameRecord(PARENT_NAME);
  const expiryMs = Number(nameRecord.expirationTimestampMs);
  const daysUntilExpiry = Math.floor((expiryMs - Date.now()) / 86_400_000);

  for (const threshold of ALERT_THRESHOLDS_DAYS) {
    if (daysUntilExpiry === threshold) {
      await sendAlert({
        channel: 'ops',
        urgency: threshold <= 7 ? 'high' : 'normal',
        message: `audric.sui expires in ${daysUntilExpiry} days. Run RUNBOOK_audric_sui_parent.md §5.4.`,
      });
    }
  }
}
```

Schedule: daily at 09:00 UTC (high enough alert visibility before the founder's daily review). Add to `apps/server/src/cron/index.ts` registry.

**Status:** PROPOSED — not yet built. Decide during SPEC 10 Phase A.4 whether to build the cron now (small, ~1 hour) or rely on calendar alerts only for v0.1 launch. Given the 5y max-term renewal completed 2026-05-05 (next renewal trigger ~2031-02-01 = T-90d before 2031-05-01 expiry), there is ~4y 9mo of cushion before any cron-based alert would fire. Recommend deferring the cron until either (a) the multi-sig migration trigger fires at >10k handles per `TD-S10-multi-sig`, or (b) ~2030-Q3 (~6 months ahead of first calendar alert), whichever comes first.

### 6.3 — Pre-launch action: ✅ DONE 2026-05-05

`audric.sui` renewed to max-term (5 years) on 2026-05-05. Current expiry: ~2031-05-01. Renewal concern is OFF the SPEC 10 launch critical path. Next action: §6.1 calendar alerts deferred until ~2030-Q4 (5 years from now).

---

## 7. Reserved usernames (founder review required before Phase A.5)

This is the canonical list of `*.audric.sui` labels that the audric host MUST refuse to mint as user-facing handles. Lives here for founder review; ports to `apps/web/lib/identity/reserved-usernames.ts` as a `Set<string>` constant at Phase A.5 implementation.

**Rule:** the SDK (`packages/sdk/src/protocols/suins-leaf.ts`) enforces protocol-level validity (length / charset / hyphen rules); the audric host enforces the reserved-name policy (this list). Separation of concerns — see the SDK module's `validateLabel` jsdoc.

**How the list was constructed:** SPEC 10 D3 ships a 35-entry baseline. This section extends it with three additional categories (financial-product brand impersonation, regulator/government, abuse magnets) sized to the threat model. Founder approves / rejects each category as a unit; individual additions/removals are easy to make per-entry once the categories are locked.

**Status: ✅ FOUNDER APPROVED 2026-05-06 (S.75)** — all categories approved as recommended. §7.8 (route-collision + future-product) added at founder's request during the SPEC 10 D.1 stub session ("can you think of other reserved names like team, investors, pay, send, and any other names you can think off that the app might use later"). Live in code as of `apps/web/lib/identity/reserved-usernames.ts` v3 (commit see S.75 in `audric-build-tracker.md`). 189 total entries.

**v4 — S.84 polish v3 (+6 entries → 195).** Founder spot-audit found 2 real route-collision gaps (`activity`, `contacts` — both in `hooks/usePanel.ts` `PANEL_URL_MAP` as panel URLs, unreserved → if claimed, `audric.ai/activity` would have rendered the user's profile via `[username]` instead of the activity panel) + 4 defensive singular/plural parity adds (`setting`, `goal`, `activities`, `bots`). All 6 categorized inline in the relevant §7.x section below. Total now 195 entries. See S.84 polish v3 footnote in `audric-build-tracker.md`.

### 7.1 — D3 baseline (35 entries — already locked in SPEC 10 v0.2.1 D3) + 1 parity add (S.84 polish v3)

```
admin, support, audric, team, root, api, www, mod, mods, staff,
official, verify, verified, help, info, mail, null, undefined,
test, bot, bots, notification, system, pay, send, receive, swap,
save, borrow, repay, store, passport, intelligence, finance, mom, dad
```

✅ Locked. `bots` added in v4 (S.84 polish v3) for parity with `bot` (cf. `mod`/`mods`).

### 7.2 — Audric brand variants (12 entries — recommend ADD)

```
audric-team, audric-support, audric-official, audric-help, audric-pay,
audric-store, audric-finance, audric-passport, audric-intelligence,
audric-bot, audric-admin, audric-system
```

**Why:** every brand-prefixed handle is a phishing primitive ("hey, send your USDC to `audric-support.audric.sui` to verify your account"). Cheap to reserve; impossible to recover post-mint.

**Founder vote:** ✅ approved (S.75)

### 7.3 — Web/ops generics (16 entries approved + 1 parity add S.84 polish v3 → 17 total)

```
app, dashboard, account, settings, setting, profile, login, signin,
signup, register, auth, callback, status, docs, faq, blog, news
```

`setting` (singular) added in v4 (S.84 polish v3) — defensive pair for `settings`. Easy typo path; cheap to reserve.

**Why:** these mirror typical app routes (`audric.ai/dashboard`, `audric.ai/settings`). If a user could mint `dashboard.audric.sui`, social-engineering victims clicking "go to your dashboard" links could be redirected. Low likelihood, near-zero cost to reserve.

**Founder vote:** ✅ approved all 16 (S.75 — header said 15, list contains 16: app, dashboard, account, settings, profile, login, signin, signup, register, auth, callback, status, docs, faq, blog, news. Approved as listed.)

### 7.4 — Crypto primitives + financial verbs (24 entries — original 16 + 8 added S.91)

```
wallet, treasury, vault, pool, dao, defi, lend, lending, invest,
yield, stake, unstake, claim, deposit, withdraw, transfer,
fee, fees, refund, refunds, gas, bridge, escrow, safe
```

**Why (original 16):** if a user mints `treasury.audric.sui` and pretends to be Audric's treasury wallet, victims sending fees/donations there lose funds. `treasury.audric.sui` resolving to a non-Audric address is high-confusion. Financial-verb handles (`stake`, `claim`, etc.) get socially-engineered into "send to {verb}.audric.sui to {action}."

**Founder vote (original 16):** ✅ approved (S.75)

**v5 — S.91 (+8 entries → 24).** Founder-approved post-S.88 audit additions covering financial-flow primitives that were structural gaps in the original §7.4 set, all inheriting the same threat model (fund-routing impersonation):

- **`fee`, `fees`** — phishing primitive ("the protocol fee is fee.audric.sui"). Not a name.
- **`refund`, `refunds`** — phishing primitive ("send refund request to refund.audric.sui"). Not a name.
- **`gas`** — common crypto term, fallback ("gas.audric.sui covers transaction fees"). Not a name.
- **`bridge`** — common crypto term, phishing primitive ("send to bridge.audric.sui to swap chains"). Not a name.
- **`escrow`** — financial primitive, custody-confusion risk ("Audric escrow address is escrow.audric.sui"). Not a name.
- **`safe`** — phishing primitive ("send to safe.audric.sui — your money is safe!"). Not a name.

**Founder vote (S.91 expansion):** ✅ approved 2026-05-06 (per S.90 audit, S.91 ship).

### 7.5 — Common third-party brand impersonation (24 entries — recommend ADD)

Two sub-tiers:

**Tier A — Sui ecosystem brands** (high impersonation value, founders/users actively interact with these):
```
sui, mysten, mystenlabs, navi, cetus, volo, walrus, scallop, kriya,
suiet, phantom, suins, slush
```

**v5 — S.91 (+1 entry → 13).** `slush` added as a Mysten Labs ecosystem brand — Slush is Mysten's new wallet (succeeding Suiet brand-wise). Active phishing target as user adoption grows; same logic as the original 12 entries. ✅ approved 2026-05-06.

**Tier B — Major crypto/exchange brands** (high impersonation value globally):
```
bitcoin, btc, ethereum, eth, circle, usdc, binance, coinbase, kraken,
okx, bybit, coingecko, coinmarketcap
```

**Why:** even though Audric isn't claiming to be these brands, having `binance.audric.sui` resolve to a random user creates phishing opportunities ("send your USDC to `binance.audric.sui` to deposit on Binance"). Cost to reserve = essentially zero; cost to recover after a phishing incident = reputation damage + emergency `/api/admin/identity/release` flow.

**Trade-off note:** reserving brand names creates a "trademark squat" appearance — if Mysten or Binance ever wants `mysten.audric.sui` or `binance.audric.sui`, we'd want to release it to them. The `/api/admin/identity/release` endpoint exists for exactly this. Reserving is reversible; mint-then-recover is not.

**Founder vote:** ✅ approved all (Tier A 12 + Tier B 13 = 25 entries — header said 24, Tier B has 13 items as listed) (S.75)

### 7.6 — Regulator / government (7 entries — recommend ADD)

```
sec, irs, fed, fbi, ofac, cftc, fincen
```

(Note: `treasury` is already reserved via §7.4's financial-primitive list — covers both the regulator and the wallet sense.)

**Why:** any user minting `sec.audric.sui` and impersonating a regulator is both a user-protection failure (phishing) AND a legal-exposure problem for Audric (the regulator may demand revocation or sue). Reserving is cheap defense.

**Founder vote:** ✅ approved (S.75)

### 7.7 — Generic abuse magnets / footguns (12 entries — original 10 + 2 added S.91)

```
none, void, nil, nan, error, deleted, removed, banned, anonymous, anon,
unknown, placeholder
```

**Why (original 10):** these are common JavaScript / database / null-state strings that, if ever appearing in error messages or fallback rendering paths, could create confusion ("Send to: anonymous.audric.sui" when the actual recipient lookup failed). Low-likelihood failure mode but cheap defense.

**Founder vote (original 10):** ✅ approved (S.75)

**v5 — S.91 (+2 entries → 12).** Founder-approved post-S.88 audit additions matching the original §7.7 intent (fallback-state primitives that surface in error paths or debug fallbacks):

- **`unknown`** — fallback state ("Unknown sender: unknown.audric.sui"). Not a plausible Google name.
- **`placeholder`** — debug fallback (UI placeholder text could leak as a literal handle reference). Not a plausible Google name.

**Founder vote (S.91 expansion):** ✅ approved 2026-05-06.

### 7.8 — Audric route-collision + future-product reservation (added S.75 — 68 entries — APPROVED)

Added when SPEC 10 D.1 stub introduced the `app/[username]` dynamic route at the URL root. Founder asked: "can you think of other reserved names like team, investors, pay, send, and any other names you can think off that the app might use later." This section captures the full audit. Lives in `apps/web/lib/identity/reserved-usernames.ts` v3 as `§7.8a`–`§7.8d`.

**Why §7.8 exists at all (vs. just appending to §7.3 / §7.4 / §7.7).** §7.3 captures *current* app routes; §7.8 captures *future* surfaces + Next.js framework collisions that don't fit the existing buckets cleanly. Keeping them in their own section makes the "what new surface should I reserve when shipping a feature" lookup table explicit.

**§7.8a — Static-route sentinels (14 entries — APPROVED)**

Top-level static folders + Next.js special files under `app/`. Next.js prioritizes static segments over the `[username]` dynamic route, so claiming one of these would resolve to the static page instead of the user's profile.

```
new, chat, invoice, litepaper, privacy, terms, disclaimer, security,
icon, favicon, manifest, robots, sitemap, opengraph-image
```

**Already covered by earlier sections** (deduplicated): `admin` (§7.1), `api` (§7.1), `auth` (§7.3), `pay` (§7.1), `settings` (§7.3).

**Maintenance rule.** When adding any new top-level static folder under `app/` (or a new top-level Next.js special file), add the segment to §7.8a in this runbook AND to `reserved-usernames.ts`. The reserved file's header carries this rule as a comment.

**§7.8b — Future-product reservation (23 entries approved + 4 panel-route adds S.84 polish v3 → 27 total)**

Audric features that either exist on the roadmap (Audric 2.0 Phase E `/report/[address]` portfolio pages, Audric Store, notifications) or are likely future expansions. Reserving early avoids the "we shipped /credit but @credit was already claimed" embarrassment.

```
credit, savings, portfolio, portfolios, balance, balances, home, feed,
inbox, notifications, search, explore, discover, onboarding, welcome,
report, reports, analytics, wallets, goals, goal, memories, preferences,
watch, activity, activities, contacts
```

**v4 adds (S.84 polish v3):** `activity` and `contacts` are panel-route URLs in `hooks/usePanel.ts` `PANEL_URL_MAP` today — reserving prevents claim of the URL space if/when these get static `app/` routes. `goal` (singular pair for `goals`) and `activities` (plural pair for `activity`) added for defensive parity.

**Heuristic for inclusion.** Would shipping a feature with this URL segment in the next 12 months be embarrassing if a user already claimed it? If yes, reserve.

**§7.8c — Operator / brand pages (24 entries — APPROVED)**

Common B2B/B2C marketing routes the company will ship at scale (about page, careers, press kit, investor page). Reserve before claim-rush if Audric ever lands on Hacker News.

Founder explicitly requested `investors`; the rest of the cluster (investor / shareholders / board / advisors / partners / ambassadors) follows the same logic.

```
about, contact, company, press, media, careers, jobs, hiring,
investors, investor, shareholders, board, advisors, partners, partner,
ambassador, ambassadors, pricing, plans, plan, billing, subscription,
premium, upgrade
```

**§7.8d — Legal / compliance (7 entries — APPROVED)**

Legal pages not in §7.3 (which covers blog/docs/faq/news). Privacy and terms are static-route sentinels and live in §7.8a.

```
legal, tos, eula, policy, gdpr, cookies, compliance
```

### 7.9 — Founder personal reservations (founder fills in)

```
☐ ____________________   (e.g. founder's own first name handle)
☐ ____________________   (e.g. founder's preferred working name)
☐ ____________________   (e.g. co-founder's handle if applicable)
```

**Notes:**
- The founder's day-to-day Audric handle SHOULD be claimed normally via the picker (sets a public example), not reserved. Reserve only handles the founder explicitly wants to BLOCK from public claiming (e.g. variants of their name that competitors might squat).
- Add any other personal-namespace handles here.

**Founder fills:** ☐ done

### 7.10 — Total summary

| Category | Count | Status |
|---|---|---|
| §7.1 D3 baseline | 36 | ✅ Locked (SPEC 10 v0.2.1) + `bots` parity (S.84 polish v3) |
| §7.2 Audric brand variants | 12 | ✅ Approved (S.75) |
| §7.3 Web/ops generics | 17 | ✅ Approved (S.75) + `setting` parity (S.84 polish v3) |
| §7.4 Crypto primitives + financial verbs | 24 | ✅ Approved (S.75) + 8 entries (S.91 — fee/fees/refund/refunds/gas/bridge/escrow/safe) |
| §7.5 Third-party brand impersonation | 26 | ✅ Approved (S.75 — Tier A 12 + Tier B 13) + `slush` (S.91 — Tier A 13) |
| §7.6 Regulator / government | 7 | ✅ Approved (S.75) |
| §7.7 Abuse magnets / footguns | 12 | ✅ Approved (S.75) + 2 entries (S.91 — unknown/placeholder) |
| §7.8a Static-route sentinels | 14 | ✅ Approved (S.75) |
| §7.8b Future-product reservation | 27 | ✅ Approved (S.75) + `activity`/`contacts`/`goal`/`activities` (S.84 polish v3) |
| §7.8c Operator / brand pages | 24 | ✅ Approved (S.75) |
| §7.8d Legal / compliance | 7 | ✅ Approved (S.75) |
| §7.9 Founder personal reservations | TBD | ⏳ Founder fills |
| **Live total** | **206** | Verified via `RESERVED_USERNAMES.size` 2026-05-06 (post S.91) |

**Implementation note (Phase A.5):** ports to a single TypeScript file:

```typescript
// apps/web/lib/identity/reserved-usernames.ts
// Source of truth: spec/runbooks/RUNBOOK_audric_sui_parent.md §7
// Updates require both the runbook AND this file (they MUST stay in sync — the
// runbook carries the rationale; this file is the executable list).

export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  // §7.1 D3 baseline
  'admin', 'support', /* ...etc, in alphabetical order... */,
]);

export function isReserved(label: string): boolean {
  return RESERVED_USERNAMES.has(label.toLowerCase());
}
```

The audric `/api/identity/check?username=alice` endpoint calls `isReserved(label)` after `validateLabel(label)`; both must pass for the label to be considered claimable.

---

# Smoke-test journal (auto-appended by `scripts/smoke-suins-leaf.ts --execute`)

## SuiNS leaf-subname smoke test — 2026-05-01T02:03:58.493Z

**Outcome:** ✅ PASS — D1 (leaf-not-node) verified buildable on mainnet.

**Mainnet evidence:**
- Add tx: `FyDvNgu9sEVsbHTu6rSXe7aT3cc5i8fKWErmae1dTuoJ` (https://suiscan.xyz/mainnet/tx/FyDvNgu9sEVsbHTu6rSXe7aT3cc5i8fKWErmae1dTuoJ)
- Remove tx: `Hqxyz59NZA5o61u9xEL2Vgo5ezzesRqkiy5qMfMoMw4N` (https://suiscan.xyz/mainnet/tx/Hqxyz59NZA5o61u9xEL2Vgo5ezzesRqkiy5qMfMoMw4N)

**Working tx-fragment shape (becomes `@t2000/sdk` Phase A.1 builder seed):**

```typescript
import { SuinsClient, SuinsTransaction } from '@mysten/suins';
import { Transaction } from '@mysten/sui/transactions';

// add_leaf
const tx = new Transaction();
const suinsTx = new SuinsTransaction(suinsClient, tx);
suinsTx.createLeafSubName({ parentNft: '0x070456e283ec988b6302bdd6cc5172bbdcb709998cf116586fb98d19b0870198', name: 'username.audric.sui', targetAddress: '0x...' });

// remove_leaf
const tx2 = new Transaction();
const suinsTx2 = new SuinsTransaction(suinsClient, tx2);
suinsTx2.removeLeafSubName({ parentNft: '0x070456e283ec988b6302bdd6cc5172bbdcb709998cf116586fb98d19b0870198', name: 'username.audric.sui' });
```

**Gas observation:** ~3222612 MIST per leaf creation (= ~$0.01128 at $3.50/SUI). Validates the "$0 per signup" pitch math (will be sponsored via Enoki).

**Indexer lag:** ~1–3s between tx execution and `suix_resolveNameServiceAddress` returning the new leaf.
