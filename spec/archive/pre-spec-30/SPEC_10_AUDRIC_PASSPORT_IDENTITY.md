# SPEC 10 — Audric Passport Identity (`username.audric.sui` leaf subnames + unified contacts)

**Version:** 0.2.1 (founder decisions locked; D10 narration tightened to single rule; contacts unification; leaf-subname architecture; NOT yet greenlit for build)
**Date:** 2026-05-01
**Status:** Draft — ready for implementation green-light. **Hard prerequisite: SPEC 9 v0.1.1 ships first** (the `pending_input` primitive is the substrate for the username-picker UX). Recommended sequencing: SPEC 8 v0.5 → SPEC 7 v0.3.1 → SPEC 9 v0.1.1 → **SPEC 10 v0.2.1** → SPEC 9 v0.2.
**D1 architecture validated:** ✅ End-to-end mainnet smoke test passed 2026-05-01 (mint + resolve + revoke leaf via `@mysten/suins` SDK, actual gas ~3.2M MIST = $0.011/leaf). Working tx-fragment shape lives in `spec/runbooks/RUNBOOK_audric_sui_parent.md` §3 — Phase A.1 SDK builders should copy from there. Re-runnable harness: `scripts/smoke-suins-leaf.ts`.
**Author:** AI assistant (founder decisions D1–D10 review pass, May 1; D10 single-rule patch, May 1)
**Targets:** `@t2000/sdk` v1.2.0 (new `suins-leaf.ts` module) · `@t2000/engine` v1.4.0 (3 new tools + LLM-teaching system-prompt block) · `@audric/web` next minor
**Engine baseline:** v1.3.0 (post SuiNS reverse-lookup ship, S.52.2)
**SDK baseline:** v1.1.0 (post SPEC 7 v0.3.1)
**Audric baseline:** v0.56.x (post SPEC 7 + SPEC 8 + SPEC 9 v0.1.1)
**Version-chain drift note (S.53.8, 2026-05-03 → updated S.61, 2026-05-05):** Version targets above were locked pre-Phase 0 (SPEC 13). Engine has since shipped `1.12.0` (Phase 0 — `MAX_BUNDLE_OPS=2` + 7-pair `VALID_PAIRS` whitelist). SPEC 12 was retired 2026-05-03 in favour of "specs get refreshed at implementation time" — then **resurrected 2026-05-05** as a real ~3-4d spec (S.61). SPEC 10 ships BEFORE SPEC 12 v0.1 drafts, so this header's version targets get reconciled by SPEC 12, not by SPEC 10. Treat `audric-build-tracker.md` as the authoritative version chain at implementation time.

---

## Revision log

| Version | Date | Notes |
|---|---|---|
| **0.2.1** | **2026-05-01** | **D10 narration policy tightened to a single rule, no exceptions.** Founder pushback: showing `@alice` in chips or bare `alice` in transaction history rows still risks the `.sui` ↔ `.audric.sui` confusion (a stranger's `alice.sui` is a different person from `alice.audric.sui`). Transaction history is the highest-stakes display surface — users rely on it for trust verification — so ambiguity there is the worst possible failure mode. **New policy: ALWAYS render the full `alice.audric.sui` whenever an Audric handle is displayed. `@alice` is an INPUT shortcut for autocomplete typing only — NEVER a display form.** Updates: D10 table collapsed (chips/autocomplete + transaction-history rows now render full handle); system-prompt teaching block rewritten to remove `@alice` shorthand exception; architecture overview "Surfaces" line updated; UI mockup in D9 updated; acceptance-gate examples updated. Brand reinforcement bonus: every transaction history row, every chip, every receipt now teaches the `*.audric.sui` namespace by example. Net effort impact: 0d (display-only spec change). |
| 0.2 | 2026-05-01 | **Founder review pass — 10 decisions locked (D1–D10), 5 architectural simplifications.** (a) **D1 reversed** — leaf subnames not node. Simpler signup (no NFT mint), zero per-user marginal cost (parent purchase covers infinite leaves), instant revocation for spam, no marketplace abuse vector. Marketing pitch shifts from "yours forever" to "recognized everywhere on the network" — leaf records resolve everywhere SuiNS does. (b) **D5 dropped** — no multi-sig parent custody for v0.1. Single hardened address + 3-location encrypted backup + RUNBOOK + TD for future hardening. (c) **D7 reframed as full contacts unification** — contacts can hold any of: Audric handle / external SuiNS name / bare 0x. New `Contact` shape (`{ name, identifier, resolvedAddress, audricUsername?, addedAt, source }`). New `audric.ai/settings/contacts` page. Picker reused across signup + settings + future Store onboarding. (d) **D2 strengthened** — mandatory at signup with smart pre-fill from Google profile (3 suggestions pre-checked for availability). "Skip for now" as a small text link, not a button. Settings-page claim is safety valve. (e) **D4 simplified** — free unlimited renames, no cooldown, no fee, old name back in pool immediately. Cycling-abuse mitigation parked as a backend lever (24h cooldown if needed). (f) **NEW D9** — Settings panel + picker reusability across signup / settings / future Store onboarding. (g) **NEW D10** — LLM narration format locked: full `alice.audric.sui` in narration + cards + receipts; `@alice` in chips / autocomplete only; bare 0x only when no handle exists. Critical sub-rule: never abbreviate `alice.audric.sui` to `alice.sui` (independent namespace). (h) Phase A.4 multi-sig setup → A.4 hardened single-address custody + RUNBOOK (-0.5d). (i) Phase A.5 added — handle-release policy + reserved-name admin endpoint + parent-name renewal monitoring (+0.5d). (j) Phase D.5 added — contacts page UI + unified add flow (+0.5d). (k) Phase C.6 added — engine-context LLM teaching (+0.1d). (l) Sequencing-with-Store cross-spec contract for `audric.ai/[username]` route shape locked. **Net effort: ~10d unchanged** — leaf-vs-node savings (~0.5d) ≈ contacts unification + settings + LLM teaching cost (~0.5d). |
| 0.1 | 2026-05-01 | **Initial draft.** Triggered by user feedback after SuiNS reverse-lookup ship: *"someone said we should use leaf subnames as usernames for the user and maybe we get rid of contacts all together to simplify."* User registered `audric.sui` parent name same day (defensive registration before SPEC lands). 8 founder decisions flagged inline. Total scope estimate: ~10 focus days for Phase A–D. Superseded by v0.2 founder lock. |

---

## TL;DR (read this first)

> **The product bet.** Every Audric user gets a free, on-chain handle: `username.audric.sui`. The same string is your chat handle, your wallet recipient (`send 5 USDC to alice.audric.sui`), your future Audric Store creator URL (`audric.ai/alice` — Phase 5), and your portable identity in any Sui wallet, dApp, or block explorer that resolves SuiNS. **One name, recognized everywhere on the network.**
>
> **The architectural simplifications (v0.2):**
> - **Leaf subnames** (not node NFTs) — Audric maintains the registry. Free per signup, instant mint, instant revoke for abuse. No NFT marketplace can hijack premium handles.
> - **Unified contacts** — one model handles Audric handles, external SuiNS names (`alex.sui`), and bare addresses. No more "save contact" friction for Audric users; SuiNS names become first-class contact identifiers; old contacts auto-augment with their `audric.sui` handle if the address resolves.
> - **Mandatory-with-smart-defaults at signup** — Google profile pre-fills 3 suggestions, user taps one in <2s. Skip is available but de-emphasized. Settings-page claim is the safety valve. Designed for >90% adoption without feeling forced.
> - **Free unlimited renames** — no cooldown, no fee, no friction.
> - **Single-address parent custody** — hardened backup + RUNBOOK + TD for multi-sig hardening.
>
> **What this collapses:**
> - **Saved contacts** → unified surface — Audric handle / SuiNS / 0x are all just "ways to refer to a contact"
> - **Wallet sharing friction** → "I'm `alice.audric.sui`" works in any Sui-aware wallet, not just Audric
> - **The trust gradient** → "alice.audric.sui" is verifiably resolved on-chain by anyone, including external wallets
> - **The store URL** → `audric.ai/alice` IS `alice.audric.sui` — single mental model across products (Store v0.2 builds on this URL)
>
> **What this doesn't do (v0.2 boundaries):**
> - **Doesn't change the wallet model** — Audric Passport still = Google sign-in + non-custodial Sui wallet + tap-to-confirm + sponsored gas. The handle is a 5th identity primitive.
> - **Doesn't lock you in** — leaf records resolve everywhere SuiNS does; if Audric ever winds down, we contractually commit to releasing the parent NFT to a community foundation.
> - **Doesn't ship Audric Store yet** — `audric.ai/[username]` ships as a profile stub in v0.1; SPEC 9 v0.2 extends the same route into the creator marketplace surface.
>
> **The headline UX shift.** Combined with SPEC 7's Payment Stream: *"swap 10% into SUI, save 50% of my remaining USDC, send $100 to mom.audric.sui"* — one signature, three operations, atomic on Sui. Identity makes "to mom.audric.sui" possible without the user ever seeing a 0x.

**One-line product impact (v0.2):** *Every Audric user becomes a discoverable on-chain identity with a free handle, every Audric surface speaks the same name, and contacts become a unified mental model spanning Audric users / external SuiNS / bare addresses.*

---

## Pre-SPEC-10 lock decisions — RESOLVED

| Decision | Resolution |
|---|---|
| Register `audric.sui` parent name | ✅ **DONE 2026-05-01** by founder (defensive — protects branding regardless of SPEC 10 outcome). Parent NFT held by founder's address (TODO: rotate to multi-sig per TD-S10-multi-sig — see D5). |

---

## 10 founder decisions — D1–D10 (LOCKED in v0.2)

These are the locked choices that shape every downstream piece of work. v0.2 reflects founder review on 2026-05-01.

### D1 — Subname type: **LEAF** (LOCKED)

SuiNS supports two subname mechanics:

| | Leaf subname (LOCKED) | Node subname (rejected) |
|---|---|---|
| What it is | Pointer record on parent's registration NFT | NFT minted to user's address |
| Per-user cost | ~$0 (parent purchase covers all leaves) | $0.10–$1+ per mint (TBD on SuiNS pricing) |
| Mint speed | Instant (one Move call) | Slow (NFT mint + transfer) |
| Audric control | Full (can revoke abuse) | None (user owns NFT) |
| User portability | Resolves everywhere SuiNS does; can be revoked by parent | Truly user-owned; can transfer wallets |
| Marketplace abuse | Impossible (no NFT to list) | Premium handles can be listed/sold externally |

**Why leaf wins for v0.1:**
- **Simpler signup** — no NFT mint dance, no Enoki gas orchestration for the user's first action
- **Free at scale** — 100k users at $0 vs 100k × $0.50 = $50k absorbed CAC
- **Instant abuse revocation** — spam handles get killed by an admin call, not a user-cooperation flow
- **Aligns with the actual mental model** — your *wallet* is non-custodial (zkLogin), your *handle* is a service identifier (like a Twitter handle). Conflating them was over-engineering.
- **No marketplace hijacking** — no premium handle holdouts, no scalper economy

**The one trade-off named:**
- If Audric ever shuts down, leaf records stop resolving (the parent owner controls them). **Mitigation:** contractual commitment to release the parent NFT to a community foundation if Audric ever winds down — same trust gradient users already extend by using Google sign-in.

**Marketing pitch update:** "Your Audric handle on Sui — free, instant, recognized everywhere on the network." (Drops the "yours forever" framing — that lives in the wallet pillar, where it's actually true via zkLogin recovery.)

### D2 — Mandatory at signup with smart pre-fill (LOCKED)

**Picker UX (Phase B.1):**
1. After Google sign-in completes, picker renders inline in the chat timeline (using SPEC 9 v0.1.1's `pending_input` primitive)
2. **Pre-filled with 3 suggestions** derived from Google profile email — e.g. `alex.smith@gmail.com` → `alex`, `alexsmith`, `alex42` with availability indicators pre-checked
3. User taps one suggestion (<2s) OR types their own
4. "Skip for now" is a small text link below the suggestions (NOT a button)
5. Mint happens automatically on selection (no second confirmation step — leaf is free, instant, revocable)

**Settings safety valve:** Skip-then-claim-later flow is fully supported via `audric.ai/settings/identity` (D9).

**Adoption target:** >90% of new sign-ups claim a username in their first session.

### D3 — Username format constraints (LOCKED)

- **Length:** 3–20 characters
- **Charset:** ASCII `[a-z0-9-]` only (lowercase forced, server-side normalized)
- **Cannot start or end with `-`**
- **Cannot have consecutive `--`**
- **No Unicode lookalikes** (SuiNS standard already enforces ASCII; documented for clarity)
- **Reserved list seeded with:** `admin`, `support`, `audric`, `team`, `root`, `api`, `www`, `mod`, `mods`, `staff`, `official`, `verify`, `verified`, `help`, `info`, `mail`, `null`, `undefined`, `test`, `bot`, `notification`, `system`, `pay`, `send`, `receive`, `swap`, `save`, `borrow`, `repay`, `store`, `passport`, `intelligence`, `finance`, `mom`, `dad` (squat magnets) — plus an early-Audric-team reservation list curated by founder before launch

### D4 — Renames: **FREE UNLIMITED, NO COOLDOWN** (LOCKED)

- No fee
- No cooldown between renames
- Released name returns to the pool immediately (anyone can claim)
- Rename = `revoke_leaf(old) + add_leaf(new)` — both atomic on the parent NFT

**Parked abuse vectors (TD, not v0.1):**
- Cycling abuse (rename every day to evade tracking) → mitigation if needed: backend-only 24h cooldown (not user-visible until triggered)
- Squatter cycling (rename to "alice", grab "premium-name", release that, grab "alice" back) → mitigation if needed: 7-day hold on released names

If signal emerges in production, add either lever as a hot-patch — won't require user-facing changes.

### D5 — Parent custody: **single hardened address + RUNBOOK + TD** (LOCKED for v0.1)

- Parent NFT lives on a dedicated single Sui address controlled by Audric ops
- Encrypted seed phrase backed up in **3 geographic locations** (e.g. password manager + hardware key + offline cold storage)
- `RUNBOOK_audric_sui_parent.md` documents:
  - Custody address + controlling principal
  - Recovery procedure if seed is lost (1-of-3 recovery)
  - Renewal calendar + auto-renewal setup
  - "What if compromised" emergency procedure (revoke all leaves, claim new parent)
- **TD-S10-multi-sig** logged in `audric-build-tracker.md` for future hardening (3-of-5 multi-sig migration when leaf count >10k)

**Rationale for v0.1:** multi-sig adds ~1d to spec + adds operational complexity (signer coordination for any admin action). Single hardened address is acceptable for v0.1 with the upgrade path documented. Revisit when Audric crosses ~10k claimed handles.

### D6 — Sponsored gas for first leaf creation (LOCKED)

- Leaf creation is a Move call on the parent's registration; gas is sponsored via Enoki (consistent with all other Audric writes)
- User pays $0 for their first action on Sui — preserves the "free, instant" Audric Passport pitch
- Cost: ~$0.001 per signup (irrelevant)

### D7 — Contacts: **UNIFIED REFACTOR** (LOCKED — biggest v0.2 architectural change)

**The problem:** Today contacts are `{ name, address }` — can't store SuiNS names, can't tag whether someone is an Audric user, can't auto-augment when a saved 0x has a `*.audric.sui` leaf.

**The new model:**

```typescript
interface Contact {
  name: string;              // user-assigned nickname (e.g. "Mom", "Alex")
  identifier: string;        // what the user typed: "alice.audric.sui" | "alex.sui" | "0xabc..."
  resolvedAddress: string;   // cached lowercase 0x at save time (canonical key)
  audricUsername?: string;   // populated when resolved address has a *.audric.sui leaf
  addedAt: string;           // ISO date
  source: 'manual' | 'agent' | 'import';  // how it got into the address book
}
```

**Save flow:**
1. User types `name` + `identifier`
2. Server resolves `identifier` via engine's `normalizeAddressInput` (S.52 — already handles `0x` + `*.sui` + Audric handles)
3. Server reverse-lookups resolved address (S.52 reverse) — if a `*.audric.sui` leaf exists, set `audricUsername`
4. Persist all 6 fields

**Display flow:**
- Contact list shows: nickname (large) · 🪪 audricUsername badge (when present) · identifier subtitle (small) · full 0x copyable on tap
- Sort: Audric users first → external SuiNS-named contacts → bare-address contacts
- Empty state: "Type @alice to add an Audric user, or paste a 0x for anyone else"

**Send flow integration:**
- Type `alice` → autocomplete matches across Audric handles + saved contact names
- Type `@alice` → matches Audric handles only (server-side query against `User.username`)
- Type `alex.sui` → suggests "Add as contact?" + "Send to alex.sui" inline buttons
- Type `0x...` → suggests "Add as contact?" + send

**Migration plan (Phase A.2):**
- Existing `{name, address}` rows → backfilled as `{name, identifier: address, resolvedAddress: address.toLowerCase(), audricUsername: undefined, addedAt: createdAt, source: 'import'}`
- Lazy reverse-lookup on first contact-list render after SPEC 10 ships → populates `audricUsername` if a `*.audric.sui` exists for the address
- One-time backend cron (or batch on read) — no migration window required

### D8 — Receive QR: **HYBRID 0x-in-QR + handle-above** (LOCKED)

| Layer | Decision |
|---|---|
| QR encoding | Bare `0x` (per S.50 hotfix — Slush + Phantom + Suiet all parse this universally) |
| Display above QR | `🪪 alice.audric.sui · 0x40cd…3e62` (large, copyable; tap copies handle) |
| Audric's own QR scanner | Accepts SuiNS names + `audric.sui` handles + bare 0x (full polymorphic input) |

**Net effect:** External wallets that don't resolve SuiNS still send to the right address; the handle surfaces every time someone shares a receive page; Audric → Audric flows can use the handle end-to-end.

### D9 — Settings UX (NEW in v0.2, LOCKED)

**Picker reusability:** the same `<UsernamePicker />` React component renders in 3 surfaces:
1. **Signup flow** (Phase B.1) — inline `pending_input` form in chat timeline
2. **Settings page** (`audric.ai/settings/identity`) — set-later flow for skip-at-signup users + change-handle flow for everyone else
3. **Future Audric Store onboarding** (SPEC 9 v0.2 — Phase 5) — creator-account claim if user skipped during signup

**Settings page layout:**

```
┌─ Settings · Identity ──────────────────────────────┐
│                                                     │
│  Your Audric handle                                 │
│  ┌────────────────────────────────────────────────┐│
│  │  alice.audric.sui                       🪪     ││
│  │  Claimed Mar 12 · 0x40cd…3e62                  ││
│  │                                                 ││
│  │  [ Change handle (free, anytime) ]             ││
│  └────────────────────────────────────────────────┘│
│                                                     │
│  OR (if not yet claimed):                           │
│  ┌────────────────────────────────────────────────┐│
│  │  You haven't claimed your Audric handle yet.   ││
│  │  Once claimed, you'll be alice.audric.sui.      ││
│  │                                                 ││
│  │  Suggested:  [ alex ]  [ alexsmith ]  [ alex42 ]││
│  │  Or pick:    @ [_______________]  ✓ available  ││
│  │                                                 ││
│  │  [ Claim handle ]                              ││
│  └────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

### D10 — LLM narration format (LOCKED in v0.2.1)

**The single rule, no exceptions:** Whenever an Audric handle is **displayed** in any UI surface or LLM-generated text, render it in **full** as `username.audric.sui`. Never `@alice`. Never bare `alice`. Never `alice.sui` (that's a different namespace, owned by a different person).

`@alice` is reserved as an **INPUT shortcut** (typing `@` triggers autocomplete in send modal / chat input / search). It is never a display/render form.

| Context | Format | Example |
|---|---|---|
| Agent narration ("You sent $5 to ___") | **Full handle** | "You sent $5 to alice.audric.sui yesterday." |
| Confirmation cards (writes) | **Full handle + truncated 0x below** | "Send $50 to alice.audric.sui (0x40cd…3e62)" |
| Receipts / cards (reads) | **Full handle** | Card title: "Recent sends · alice.audric.sui" |
| Chips / autocomplete dropdown rows | **Full handle** | List item: `alice.audric.sui` (truncates with ellipsis on narrow widths) |
| Transaction history rows | **Full handle** | Row: "Send → alice.audric.sui · 1 USDC" |
| Send modal recipient row (after pick) | **Full handle** | "To: alice.audric.sui (0x40cd…3e62)" |
| Bare 0x users (no handle) | **Truncated** `0xabc…123` | "Send to 0x40cd…3e62" |
| External SuiNS users (`*.sui` not `*.audric.sui`) | **Full external SuiNS** | "Send to alex.sui" |
| Search bar / autocomplete typing trigger | **`@` is input shortcut** (NOT display) | User types `@al` → dropdown shows `alice.audric.sui`, `alex.audric.sui`, … |

**Why this rule (the founder pushback that locked it in v0.2.1):**
- Bare `alice` in a transaction history row could be an Audric user, a phone contact, a bank recipient — users can't tell. **Trust verification fails silently.**
- `@alice` in a chip looks like a Twitter handle, not an on-chain identifier. Users may mentally complete it as `alice.sui` (a different person on a different namespace).
- Transaction history is the **highest-stakes display surface** — users review it to confirm what happened. Ambiguity there is the worst possible failure mode.
- Brand reinforcement bonus: every full-handle render teaches the `*.audric.sui` namespace by example.

**Critical sub-rule (LLM must NEVER violate):** `alice.audric.sui` and `alice.sui` are independent records on independent namespaces. **NEVER abbreviate or substitute one for the other.** They may resolve to different addresses or be owned by different people.

**Truncation policy (UI density):** When a full handle exceeds the available width (e.g. `verylongusername123.audric.sui` in a 200px transaction-history column), truncate from the **left** of the username with CSS `text-overflow: ellipsis` so the `.audric.sui` suffix remains visible — `…sername123.audric.sui`. Never truncate the suffix.

**System-prompt teaching (Phase C.6):** New section in `STATIC_SYSTEM_PROMPT`:

```
## How to refer to other users in narration

Audric handles look like `alice.audric.sui`. ALWAYS use the FULL form
in any text you generate — narration, confirmation cards, receipts,
list rows, chips — without exception.

NEVER abbreviate to:
  - just "alice"          (ambiguous; could be many things)
  - just "@alice"         (that's an INPUT shortcut, not a display form)
  - just "alice.sui"      (that's a SEPARATE namespace owned by a
                           different person)

`alice.sui` and `alice.audric.sui` are independent records on
independent namespaces. They may resolve to different addresses.
NEVER substitute one for the other.

For non-Audric Sui users with their own SuiNS (e.g. they own `alex.sui`
externally), use the full external name `alex.sui`. For users with no
handle at all, use truncated `0xabc…123`.

The `@` character is reserved for INPUT contexts only — when the user
types `@al` we trigger autocomplete. You as the LLM should never
emit `@alice` in your output.
```

---

## Architecture overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                      AUDRIC PASSPORT IDENTITY                        │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  audric.sui (parent NFT — single hardened address held)         │ │
│  │   ├─ alice.audric.sui     → 0xabc…123 (alice's wallet, leaf)   │ │
│  │   ├─ bob.audric.sui       → 0xdef…456 (bob's wallet, leaf)     │ │
│  │   ├─ charlie.audric.sui   → 0x789…abc (charlie's wallet, leaf) │ │
│  │   └─ ... (one leaf record per Audric user, free, revocable)    │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  Surfaces consuming the identity:                                    │
│   • Chat — full `alice.audric.sui` in ALL narration + chips + rows   │
│   • Send — typing `@` triggers autocomplete (input only); the picked │
│     recipient renders as full `alice.audric.sui` everywhere after    │
│   • Receive — `alice.audric.sui` displayed above QR (bare 0x in QR)  │
│   • Tx history — every row shows full `alice.audric.sui` (truncates  │
│     the username portion left-side; .audric.sui suffix always shown) │
│   • Audric Store — audric.ai/<username> URL (Phase 5 / SPEC 9 v0.2)  │
│   • Engine — `<user_identity>` block in system prompt; D10 teaching  │
│     enforces full-handle rendering with zero exceptions              │
│   • Reverse lookup — every 0x with an audric.sui resolves on hover   │
│   • Contacts (unified) — Audric handles + external SuiNS + bare 0x   │
│     all in one model; render full handle always                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Layer boundaries:**

| Layer | Responsibility | Files |
|---|---|---|
| **SDK** | Leaf creation / revocation tx builders for SuiNS parent NFT | `packages/sdk/src/protocols/suins-leaf.ts` (NEW) |
| **Engine** | 1 new tool (`lookup_user`); LLM-teaching system-prompt block (D10); contacts model already supports SuiNS via S.52 | `packages/engine/src/tools/lookup-user.ts` |
| **Audric (server)** | Leaf creation orchestration via Enoki sponsorship; `User.username` schema; `Contact` schema migration; reservation + release + reserved-name admin endpoints | `apps/web/app/api/identity/{check,reserve,change}/route.ts`, `apps/web/app/api/contacts/route.ts` |
| **Audric (client)** | Picker modal (reused 3 places); `@`-typed autocomplete in send modal (input shortcut → renders full handle on selection); AddressBadge SuiNS-aware (S.52 done); profile page; contacts page | `apps/web/components/identity/UsernamePicker.tsx`, `apps/web/app/[username]/page.tsx`, `apps/web/app/settings/identity/page.tsx`, `apps/web/app/settings/contacts/page.tsx` |

---

## Phased implementation

### Phase A — Infrastructure (~2.5d)

> **Signer model + sponsorship architecture (SPEC 7 v0.4 cross-reference, NEW G1 patch).** SPEC 10's leaf-mint flow is **structurally different** from chat-agent writes (save / swap / send / borrow). Critical for any implementer:
>
> | Concern | Chat-agent write (SPEC 7 v0.4 `composeTx`) | SPEC 10 leaf-mint (this spec) |
> |---|---|---|
> | **Signer** | User's zkLogin ephemeral key | Audric custody key (parent NFT owner — see `RUNBOOK_audric_sui_parent.md`) |
> | **Sender** | User's wallet address | Parent NFT owner address (`0x40cd…3e62` per smoke test S.52) |
> | **Sponsorship** | Enoki sponsors gas, gated by user's JWT | Enoki sponsors gas (D6), but no user JWT in the loop — server-to-server flow |
> | **User involvement** | User taps to confirm via PermissionCard, signs the tx | User taps to claim, NEVER signs anything (server signs with custody key) |
> | **Trust model** | Non-custodial (user's key holds funds; tx moves user's funds) | Service-account (Audric custody holds parent NFT; tx mints a leaf record under Audric's name) |
> | **`composeTx` membership** | YES — every chat-agent write goes through `composeTx` | **NO — explicit carve-out**, documented in `audric/.cursor/rules/audric-canonical-write.mdc` |
>
> **Implication for Phase A.1 SDK builders.** `buildAddLeafTx` / `buildRevokeLeafTx` are **standalone builders** (return `{ tx: Transaction }`) — they do NOT register fragment-appenders in `WRITE_APPENDER_REGISTRY`. They're not bundleable with chat-agent writes (different signer; PTB atomicity requires single signer). Future: if SuiNS ships a multi-signer flow, revisit. For v0.1: keep the surfaces architecturally separate.
>
> **Implication for Phase A.5 admin endpoints.** `POST /api/admin/identity/{reserve,release}` follow the same service-account-signed pattern. They build their own `Transaction` directly inside the route handler (parent NFT owner signs via the custody key in env). Each route gets a `// CANONICAL-BYPASS: SPEC 10 leaf-mint — service-account-signed (parent NFT owner), structurally outside composeTx contract` comment to satisfy ESLint rule `audric/canonical-write` (which lands with SPEC 7 v0.4 Layer 0).
>
> **Implication for the smoke-test harness.** `scripts/smoke-suins-leaf.ts` (S.52, mainnet-validated) IS the canonical reference shape for Phase A.1. Re-use the tx-fragment pattern from `RUNBOOK_audric_sui_parent.md` §3 verbatim.

**A.1 — SDK leaf builders** (~0.75d)
- `buildAddLeafTx({ parentNftId, label, leafAddress })` — `add_leaf_record` Move call
- `buildRevokeLeafTx({ parentNftId, label })` — for renames + admin actions + abuse takedowns
- Unit tests + **mainnet dry-run** via `client.dryRunTransactionBlock` (re-use `scripts/smoke-suins-leaf.ts` harness shape — already proved end-to-end on 2026-05-01; **no testnet** per founder direction 2026-05-01)
- Note: simpler than node mint (no NFT minting / transfer dance — just a registry table update)
- **Architectural note (G1 patch):** standalone builders only — NOT registered in `WRITE_APPENDER_REGISTRY` (see signer model callout above)

**A.2 — Database schema migration** (~0.75d)
- Add to `User`: `username String? @unique`, `usernameClaimedAt DateTime?`, `usernameLastChangedAt DateTime?`, `usernameMintTxDigest String?` (audit trail)
- Refactor `UserPreferences.contacts` from `Json` → typed `Contact[]` schema (or stays JSON with shape enforced via Zod — TBD during impl)
- Backfill migration: existing `{name, address}` rows → `{name, identifier: address, resolvedAddress: address.toLowerCase(), source: 'import', addedAt: createdAt}`
- Lazy reverse-lookup at first contact-list render to populate `audricUsername`

**A.3 — Reservation availability API** (~0.5d)
- `GET /api/identity/check?username=alice` → `{ available: boolean, reason?: 'reserved'|'taken'|'invalid'|'too-short'|'too-long' }`
- Hits both: (a) Prisma `User.username` unique index for fast same-Audric checks, (b) SuiNS `suix_resolveNameServiceAddress("alice.audric.sui")` for ground truth (defends against raw-RPC mints by other actors against our parent — though leaf creation is permissioned to parent owner only, so this is belt-and-suspenders)
- Reserved list seeded from D3

**A.4 — Hardened single-address parent custody + RUNBOOK** (~0.25d)
- Dedicated single Sui address holds the parent NFT (separate from founder personal address)
- Encrypted seed in 3 geographic locations (password manager / hardware key / offline cold storage)
- `RUNBOOK_audric_sui_parent.md` — recovery, renewal calendar, emergency procedures
- TD-S10-multi-sig logged for future hardening at >10k handles

**A.5 — Release policy + reserved-name admin endpoint + parent renewal monitoring** (~0.25d)
- `POST /api/admin/identity/reserve` (auth-protected) — adds a name to the reserved list with audit log
- `POST /api/admin/identity/release` (auth-protected) — releases an abandoned/abused leaf back to pool
- Parent name renewal: register max-term on creation, set up SuiNS auto-renewal where supported, calendar alert at T-30d before expiry
- Account-deletion handling: if user deletes their Audric account, leaf is revoked + name held in 7-day cooldown before re-claimable

### Phase B — Reservation flow (~1.75d)

**B.1 — Username picker UI (reusable component)** (~1d)
- Built on **SPEC 9 v0.1.1's `pending_input` primitive** when rendered in chat timeline
- Standalone modal version for settings + future Store onboarding (D9)
- Smart pre-fill from Google profile email (3 suggestions, availability pre-checked)
- Real-time availability check (debounced 300ms)
- Validation rendered inline (red `✗` + reason vs green `✓ available`)
- "Skip for now" small text link below suggestions (not a button)

**B.2 — Mint orchestration** (~0.5d)
- `POST /api/identity/reserve` accepts `{ username }`, server-side:
  - Re-validates availability (anti-race — two users picking the same name in <500ms)
  - Builds the leaf-add tx via SDK helper
  - Sends to Enoki for sponsorship + execution
  - On success: writes `User.username = "alice"`, `usernameMintTxDigest`, `usernameClaimedAt`
  - On failure: returns typed error → UI offers retry
- Optimistic UI: show "claiming…" spinner state
- Sponsored gas (per D6)

**B.3 — Success + share UX** (~0.25d)
- Success state: "🪪 alice.audric.sui — yours on Sui"
- Share buttons: copy, "Show on QR", "Share to X" (templated tweet: "I just claimed alice.audric.sui — find me at audric.ai/alice 🪪")

### Phase C — Display integration (~2.25d)

**C.1 — Engine context injection** (~0.25d)
- New `<user_identity>` block in `STATIC_SYSTEM_PROMPT` dynamic block:
  ```
  Your handle: alice.audric.sui (claimed 2026-05-15)
  Your wallet: 0x40cd…3e62
  ```

**C.2 — AddressBadge already done** (S.52 ship) — **0d**

**C.3 — Send modal autocomplete** (~0.75d)
- Type `@` → dropdown shows up to 10 matching Audric usernames + saved contacts
- **Dropdown renders each row as the FULL `alice.audric.sui`** (D10 — `@` is the input shortcut, never the display form)
- Match on `username` prefix; rank Audric users above 0x contacts
- Selection populates `to: "alice.audric.sui"` — engine resolves on the wire (already supported per S.52)
- Selected recipient row in the modal renders as `alice.audric.sui` (full handle)
- Type SuiNS or 0x → inline "Send to X" + "Add as contact" buttons (per D7)

**C.4 — Receive page hybrid QR** (~0.5d)
- Above QR: `🪪 alice.audric.sui · 0x40cd…3e62` (large, copyable)
- QR encodes bare 0x (per D8 — wallet compat)
- Audric's own scanner accepts SuiNS names + bare 0x

**C.5 — Chat handle rendering** (~0.5d)
- User-typed `@alice` in chat input auto-completes to and renders as `alice.audric.sui` (full handle) the moment the user picks a suggestion
- All link targets use `audric.ai/alice` (the `[username]` route) — bare-username slug is acceptable in URL paths because routes are not user-facing identity
- LLM narration uses full `alice.audric.sui` per D10 (engine-context teaching does the work)

**C.6 — LLM narration teaching (D10)** (~0.25d)
- New section in `STATIC_SYSTEM_PROMPT` per D10 — single-rule policy: ALWAYS full handle, no exceptions
- Examples in the prompt: full-handle in narration, full-handle in confirmation card, full-handle in chip dropdown rows, full-handle in transaction-history rows, explicit "never emit `@alice`" instruction
- Critical sub-rule: never substitute `alice.sui` ↔ `alice.audric.sui`
- Adversarial test: prompt the LLM with "summarize my recent sends as a short list" — verify it doesn't compress to bare `alice` for density

### Phase D — Discovery (~3.5d)

**D.1 — Profile page (`audric.ai/[username]`)** (~1.5d)
- Resolves `[username]` → SuiNS lookup → 0x address → public portfolio (reuse the `audric.ai/report/[address]` infrastructure from Phase E of Audric 2.0)
- "Send X USDC to alice" CTA (opens send modal pre-filled)
- Empty state placeholder: "alice hasn't set up their store yet" (links to SPEC 9 v0.2 future surface)
- "Following" / "Followers" deferred (out of scope for v0.1)

**D.2 — Username search bar** (~0.5d)
- Global search in nav: placeholder `Type @ to find someone, or paste a 0x` (the `@` is the input shortcut; matched results render as full `alice.audric.sui` handles)
- Routes to profile or balance check

**D.3 — Engine `lookup_user` tool** (~0.5d)
- New auto-permission read tool: `lookup_user({ query: "@alice" | "alice.audric.sui" })`
- Returns: `{ username, address, claimedAt, isAudricUser: true, displayName?: string, profileUrl: "audric.ai/alice" }`
- Used by LLM for "who is alex" intents (today returns "I don't know"; post-spec returns the handle + link)

**D.4 — Contact augmentation backfill** (~0.5d)
- One-time cron (or lazy at first contact-list render): for each saved contact's resolved address, do reverse SuiNS lookup
- If a `*.audric.sui` resolves: set `audricUsername` field
- Display rerenders with `🪪 alice.audric.sui (you saved as "alice")` badge

**D.5 — Contacts page UI + unified add flow** (~0.5d)
- New page: `audric.ai/settings/contacts`
- List + add + edit + delete contacts using the unified Contact model (D7)
- Inline `+` button in send modal for one-tap save
- Add-contact form accepts: nickname + identifier (SuiNS / Audric handle / 0x — same field, polymorphic)

### Phase E — Network features (DEFERRED to SPEC 10 v0.3)

- Username badges on transactions in public report pages
- "People you've sent to" suggestions on the home screen
- Audric-internal directory (opt-in)
- SuiNS reverse-resolution on incoming transfer toasts ("received $5 from alice.audric.sui")
- Cycling-abuse cooldown (24h between renames if abuse signal emerges)
- Squatter cooldown (7-day hold on released names if abuse signal emerges)
- Multi-sig parent custody migration (TD-S10-multi-sig)

---

## Effort summary

| Phase | Scope | Effort |
|---|---|---|
| A | Infrastructure (SDK + DB + API + custody + admin) | ~2.5d |
| B | Reservation flow (picker + mint + share) | ~1.75d |
| C | Display integration (autocomplete + QR + chat + LLM) | ~2.25d |
| D | Discovery (profile + search + tool + contacts) | ~3.5d |
| E | Network features (DEFERRED to v0.3) | — |
| **Total v0.2** | **A + B + C + D** | **~10 focus days** |

**Net effort vs v0.1:** Flat — leaf-vs-node savings (~0.5d) ≈ contacts unification + settings + LLM teaching cost (~0.5d).

**Calendar estimate at 4–5 effective focus hours/day:** ~3 weeks for SPEC 10 v0.2.

---

## Sequencing & risk

**Recommended sequence (preserves headline product wins):**

1. SPEC 8 v0.5 (Interactive Harness) — in flight, ~11.25d
2. SPEC 7 v0.3.1 (Multi-Write PTB / Payment Stream) — ~12.75d
3. SPEC 9 v0.1.1 (today's-value primitives — `pending_input`, proactive insights, persistent todos) — ~3.5d
4. **SPEC 10 v0.2 (Audric Passport Identity)** — **~10d**
5. SPEC 9 v0.2 (marketplace primitives, Phase 5) — ~6.5d

**Why SPEC 10 ships AFTER SPEC 9 v0.1.1:** SPEC 9 v0.1.1's `pending_input` primitive is the right substrate for the username-picker UX in chat (Phase B.1). Settings-page version is independent; only the chat-timeline picker depends on `pending_input`. Building before SPEC 9 v0.1.1 = ~+1d engineering tax for one-off form rendering.

**Risks:**

| Risk | Mitigation |
|---|---|
| Parent NFT compromise / loss | D5 hardened single address + 3-location encrypted backup + RUNBOOK + recovery procedure |
| Parent name renewal lapses | A.5 max-term registration + SuiNS auto-renewal where supported + T-30d calendar alert |
| Username squatting / cycling abuse | Parked levers (24h cooldown, 7-day release hold) — add as backend hot-patch if signal emerges |
| Brand impersonation (`audric-team.audric.sui` minted by user) | D3 reserved list + verified-handle UI badge for ops accounts (defer badge UI to v0.3 if not needed at launch) |
| Privacy: users don't want public on-chain identity | D2 skip-for-now link + Settings-page set-later flow |
| SuiNS RPC degradation breaks signup | Picker uses Sui RPC; resilient to SuiNS API downtime; fallback queues mint on retry |
| Audric stops existing — leaf records resolve to nothing | Contractual commitment: parent NFT released to community foundation if Audric ever winds down |
| Contacts migration corrupts existing addresses | A.2 backfill is additive (only sets new fields); identifier defaults to existing address; lazy backfill on first read; rollback = drop new columns |
| Cycling-abuse / Sybil attack on rate-free signups | Park as v0.3 concern; rate-limit per IP / per Google verified-recovery-email if needed |

---

## What v0.2 deliberately DOES NOT do

- **No nested subnames** (`team.alice.audric.sui` etc) — defer to v0.3 if there's demand
- **No verified-handle badges** beyond the audric.sui-team reservation list — defer to v0.3 with a real verification flow
- **No SuiNS marketplace integration** — leaf records can't be listed/sold (architectural feature, not a missing capability)
- **No rename history beyond the latest** — add audit log if it becomes a support burden
- **No directory / search beyond exact-match** — Phase E
- **No external dApp partnerships** — ship internally first, surface partnership opportunities post-launch
- **No multi-sig parent custody** — TD-S10-multi-sig logged for >10k handles
- **No Audric Store** — `audric.ai/[username]` profile stub only; SPEC 9 v0.2 (Phase 5) extends the route
- **No cross-chain identity federation** — out of scope

---

## Acceptance gates

**Phase A complete when:**
- [ ] SDK `add_leaf_record` + `revoke_leaf_record` tx builders dry-run successfully via `client.dryRunTransactionBlock` on **mainnet** (re-use `scripts/smoke-suins-leaf.ts` harness shape — already proved end-to-end on 2026-05-01; **no testnet** per founder direction 2026-05-01)
- [ ] `User.username` migration applied to staging DB without data loss
- [ ] Contact schema migration applied; lazy reverse-lookup populates `audricUsername` on first read
- [ ] `GET /api/identity/check?username=alice` returns correct `available: boolean` for 8 fixture cases (taken, available, reserved, too-short, too-long, invalid-chars, leading-hyphen, double-hyphen)
- [ ] Parent NFT moved to dedicated hardened address; 3-location backup verified by 2 team members; RUNBOOK reviewed
- [ ] Reserved-name admin endpoint + audit log working
- [ ] Parent renewal calendar alert configured

**Phase B complete when:**
- [ ] User can sign in fresh, see picker with 3 pre-filled suggestions, tap one, mint, and confirm — full happy path under 5 seconds
- [ ] Custom-typed username works equally well
- [ ] "Skip for now" link works; user lands in chat without claim
- [ ] Race condition test: two browsers picking the same name → exactly one mints, other gets "taken, try again"
- [ ] Skip-then-claim-later via Settings works (D9)
- [ ] Sponsored gas verified (user's wallet SUI balance unchanged after mint)
- [ ] Mint failure → typed error → UI retry path

**Phase C complete when:**
- [ ] LLM narration uses full `alice.audric.sui` (not "alice", not "@alice", not "alice.sui") in ALL surfaces — verified via 5 manual prompts including a "summarize my recent sends" density-pressure prompt
- [ ] LLM never substitutes `alice.sui` ↔ `alice.audric.sui` — verified via adversarial prompt where the user's saved contact name happens to be "alice"
- [ ] LLM never emits `@alice` in its output — verified by grepping a 50-turn rollout transcript for `@[a-z]` patterns (should match zero)
- [ ] Engine context block correctly includes user's own handle when claimed
- [ ] Send modal `@` autocomplete returns Audric users in <200ms; **dropdown rows render full `alice.audric.sui`** (NOT `@alice`)
- [ ] Selected recipient row in send modal renders full handle
- [ ] Transaction history rows render full handle (verified at 320px / 375px / 768px viewport widths; truncation cuts username left-side, never the `.audric.sui` suffix)
- [ ] Receive page shows `🪪 alice.audric.sui` above QR; QR scans correctly in Slush + Phantom + Suiet
- [ ] Audric's own scanner accepts SuiNS names

**Phase D complete when:**
- [ ] `audric.ai/alice` renders alice's profile (or 404 cleanly if unclaimed); empty state mentions "Audric Store coming soon"
- [ ] `lookup_user` tool returns correct shape for 5 fixture cases (Audric user, non-Audric Sui user with own SuiNS, non-Audric Sui user without SuiNS, unregistered name, invalid input)
- [ ] Contact augmentation backfill runs without errors on staging dataset; 5 fixture contacts get correctly tagged
- [ ] Search bar in nav routes correctly to profile / balance check
- [ ] Settings/contacts page CRUD working; unified add-contact flow accepts SuiNS + Audric handle + 0x

**SPEC 10 v0.2 SHIP COMPLETE when:**
- [ ] All four phase gates green
- [ ] Adoption metric instrumented: % of new sign-ups that claim a username in their first session (target: >90%)
- [ ] Settings-claim metric: % of skip-at-signup users who claim later via settings (informs D2 calibration)
- [ ] Build tracker entry written + S.X allocated
- [ ] Audric Passport pitch updated to 5 pillars (founder review required)
- [ ] Marketing surface updates: landing page mention, social announcement, blog post (separate work item, not in this spec)

---

## Cross-spec dependencies

| Dependency | Resolution |
|---|---|
| SPEC 8 v0.5 `pending_input` event type reservation | ✅ Already reserved — SPEC 10 picker uses it in chat-timeline mode |
| SPEC 9 v0.1.1 `pending_input` form rendering | ⚠️ Hard prerequisite for chat-timeline picker — settings-page picker is independent |
| SPEC 7 v0.3.1 Payment Stream | Optional — handles work fine in single-write today; Payment Stream just gets the bonus of "send $100 to mom.audric.sui" headline copy |
| SPEC 9 v0.2 Audric Store URL scheme | **Locked here:** `audric.ai/[username]` route opened in v0.2 with profile stub; v0.2 of SPEC 9 (Phase 5) extends the SAME route into a creator marketplace surface. Single component shape, additive layout switch based on user state. |
| `@t2000/engine` `resolve_suins` (S.52) | ✅ Shipped 2026-05-01 — engine-side reverse + forward already works; powers contact augmentation |
| Audric `AddressBadge` SuiNS-aware (S.52) | ✅ Shipped 2026-05-01 — Phase C.2 is a 0d "free win" |
| Enoki gas sponsorship | ✅ Already in production — no new infra |
| SuiNS Move API support for `add_leaf_record` / `revoke_leaf_record` | ✅ **Verified end-to-end on mainnet 2026-05-01** (smoke test S.52) — `scripts/smoke-suins-leaf.ts` mints + resolves + revokes a leaf successfully against the real `audric.sui` parent NFT. Phase A.1 SDK builders copy from `RUNBOOK_audric_sui_parent.md` §3. **No testnet** per founder direction 2026-05-01 — mainnet dry-run is strict superset (real pools, no gas spent). |
| `audric.sui` parent NFT registered | ✅ DONE 2026-05-01 (founder) |

---

## Open questions for founder review (before Phase A starts)

All 10 D-decisions LOCKED in v0.2. Remaining open items:

**Operational:**
- **Reserved-name founder list** — Curate the early-Audric-team reservation list (e.g. founder handle, ops handles, key brand names) before Phase B ships
- **Parent NFT custody address** — Designate which Sui address holds the parent NFT (not founder's personal). Ops account or new dedicated address?
- **Backup locations** — Confirm 3 geographic locations for encrypted seed backup
- **Parent name renewal cadence** — Verify SuiNS supports max-term + auto-renewal; if not, set up renewal cron

**Sequencing:**
- Default: SPEC 8 → SPEC 7 → SPEC 9 v0.1.1 → SPEC 10 v0.2 → SPEC 9 v0.2 (10d for SPEC 10)
- Push SPEC 10 ahead of SPEC 9 v0.1.1? (+1d engineering tax for ~3.5d earlier ship of identity)
- Push SPEC 10 ahead of SPEC 7? (Payment Stream slips ~10d for identity-first positioning)

**Brand pitch update — LOCKED 2026-05-01 (founder approved):**

> **Fold into the existing 🪪 Identity pillar** (do NOT add a 5th pillar). Keeps the Audric Passport brand at 4 pillars (Identity / You decide / Sponsored gas / Yours) — easier to remember, fewer brand surfaces to maintain. New Identity-pillar copy:
>
> > **🪪 Identity.** Sign in with Google. In 3 seconds you have `you.audric.sui` — a free, on-chain handle that's your wallet's name everywhere on Sui. No seed phrase. Yours forever. (zkLogin + Enoki + leaf SuiNS subname under `audric.sui`.)
>
> The handle becomes the headline phrase across the marketing site, the launch announcement, the App Store description, and the "what is Audric Passport" explainer. It's the most concrete, demonstrable benefit of the trust layer — easier to grok than "non-custodial zkLogin."

---

## Marketing tagline candidates (founder picks one)

Updated for leaf framing — "recognized everywhere on the network" replaces the "yours forever" phrasing (which is true for the wallet via zkLogin, not the leaf handle).

- "Your Audric handle on Sui — `username.audric.sui`. Free, instant, recognized everywhere."
- "One name. Everywhere on Sui. Free."
- "Your handle is your wallet's name — `username.audric.sui`. Free, on-chain, instantly recognized."
- "Sign in. Pick a name. You're `you.audric.sui` everywhere on Sui."

> Removed the `@you` candidate — `@` is the input shortcut, never a display form (per D10 v0.2.1). Marketing should always feature the full `username.audric.sui` to teach the namespace.

---

## Appendix — What changed v0.1 → v0.2 → v0.2.1

**v0.2.1 changes (May 1):**
- **D10 single-rule policy** — display ALWAYS uses full `alice.audric.sui`, no exceptions. Removed the `@alice` chip/list shorthand and the bare-`alice` transaction-history shorthand. `@` is now exclusively an INPUT shortcut for autocomplete typing.
- **Why:** founder pushback — bare `alice` in a transaction history row is ambiguous (could be many things) and `@alice` in a chip looks like a Twitter handle (users may mentally complete to `alice.sui`, a different namespace owned by a different person). Transaction history is the highest-stakes display surface; ambiguity there fails trust verification silently.
- **Bonus:** every full-handle render teaches the `*.audric.sui` namespace by example — brand reinforcement on every row.
- **Truncation policy:** narrow widths truncate the username portion left-side; `.audric.sui` suffix always remains visible.
- **System-prompt teaching block rewritten** to remove the `@alice` shorthand exception; explicit "you as the LLM never emit `@alice`" instruction added.
- **Phase C.6 acceptance gate strengthened** — adversarial test grepping a 50-turn transcript for `@[a-z]` patterns (must match zero); transaction-history-row test at 320/375/768px viewports.
- **Marketing tagline candidate `@you` removed** — `@` is input-only, marketing must feature full handle.
- **Net effort impact:** 0d (display-only spec change; LLM teaching already covered in C.6).

**v0.2 changes (May 1):**

**Decisions reversed / refined:**
- **D1**: Node → Leaf (simpler signup, free at scale, no marketplace abuse vector)
- **D2**: Soft-mandatory → Mandatory with smart pre-fill + de-emphasized skip link
- **D4**: Paid renames after 30d → Free unlimited, no cooldown
- **D5**: Multi-sig from day 1 → Single hardened address + RUNBOOK + TD for future hardening
- **D7**: Augment contacts → Full unified refactor (new Contact shape, contacts page, polymorphic add)

**New decisions:**
- **D9**: Settings UX + reusable picker component
- **D10**: LLM narration format (full handle everywhere, never substitute `.sui` ↔ `.audric.sui`) — *narrowed in v0.2.1 to single-rule policy*

**Phase changes:**
- A.1 simpler (leaf builders vs node mint orchestration): ~-0.25d
- A.2 expanded (contacts schema migration): ~+0.25d
- A.4 simpler (single address vs multi-sig): ~-0.5d
- A.5 added (release policy + admin endpoint + renewal monitoring): ~+0.5d
- B.1 simpler (free signup, no NFT mint dance): ~-0.25d
- C.6 added (LLM teaching for D10): ~+0.25d
- D.5 added (contacts page + unified add flow): ~+0.5d

Net: ~10d unchanged.

**New cross-spec contract:**
- `audric.ai/[username]` route shape locked here; SPEC 9 v0.2 extends additively

**Risks updated:**
- Dropped: multi-sig coordination overhead
- Added: parent name renewal monitoring; contacts migration data integrity

**Marketing pitch:**
- Drops "yours forever" framing (incorrect for leaf — wallet still is via zkLogin)
- Replaces with "recognized everywhere on the network"

---

## Build-plan addendum (locked 2026-05-05, pre-Phase-A)

This section captures decisions made during the SPEC 10 implementation-plan review on 2026-05-05. The body of v0.2.1 above is unchanged; this addendum carries refinements that emerged once Phase A was about to start. Treat this as binding for implementation but NOT a v0.3 (no decision shape changes — only clarifications, scope narrows, and one post-S.22 correction).

### B-1. Tool surface (Option A locked) — `lookup_user` ONLY as engine tool

The original v0.2.1 spec lists `lookup_user` (Phase D.3) as the sole engine tool. SPEC 8 v0.5.1 G4 over-anticipated by listing 3 (`lookup_user`, `reserve_username`, `change_username`). **The locked answer aligns with v0.2.1 verbatim:** `lookup_user` is the only engine tool shipping in v0.2.0. Reservation + rename operations stay as HTTP routes (`POST /api/identity/reserve`, `POST /api/identity/change`) called by the picker UI.

**Why:** the picker is the tool. Phase B.1's `<UsernamePicker>` is a `pending_input` form (SPEC 9 P9.4 substrate). Adding `reserve_username` as an engine tool would let the LLM bypass the picker entirely (no 3-suggestion UI, no availability indicator) — the UI-driven flow is structurally better than LLM-driven for this operation. `change_username` could plausibly be an engine tool for "rename me to alex_v2" prompts but a `pending_input` form rendering the same picker is the cheaper-and-equivalent answer. Keep the surface minimal; promote later only on real behavior signal (30d post-launch).

**SPEC 8 v0.5.5 patch (same-day):** v0.5.1 G4 inventory narrowed from 3 tools → 1 tool. `🪪` (reserve) + `✏️` (change) icons preserved for future use in the spec.

### B-2. Phase D.1 `audric.ai/[username]` profile page — build FRESH on `getPortfolio()`

v0.2.1 line 439 says "reuse the `audric.ai/report/[address]` infrastructure from Phase E of Audric 2.0". **This reference is wrong** — per `t2000/ARCHITECTURE.md` line 1104, the public `/report/[address]` route + `PublicReport` cache were **deleted in S.22 (April 2026)**. The deletion happened ~3 weeks before SPEC 10 was drafted; the spec author missed it.

**Locked correction:** Phase D.1 builds the profile page **fresh on `getPortfolio()`** (the canonical wallet read per `audric/.cursor/rules/audric-canonical-portfolio.mdc`). MVP scope:

- Resolve `[username]` → SuiNS lookup → 0x address
- Render: handle (full `alice.audric.sui` per D10), avatar (Google profile or default), portfolio summary (net worth USD, savings USD, wallet USD via `getPortfolio(address)`)
- "Send X USDC to alice" CTA → opens send modal pre-filled with the resolved address
- Empty state: "alice hasn't set up their store yet" → links to SPEC 9 v0.2 future surface
- 404 cleanly for unclaimed `[username]`

**No carry-over of "Audric would do" suggestion cards** (those were the reason `/report` was deleted in S.22 — they promoted features that no longer exist). No `PublicReport` Prisma cache (the `/[username]` page is a thin server-component render of `getPortfolio()` output; its 60s in-process cache is sufficient).

**Effort:** ~1.5–2d (matches the v0.2.1 estimate for D.1).

### B-3. Phase C.1 `<user_identity>` block — `buildIdentityContext()` helper at top of context order

v0.2.1 C.1 says "new `<user_identity>` block in `STATIC_SYSTEM_PROMPT` dynamic block" but doesn't specify position. Per `audric/.cursor/rules/engine-context-assembly.mdc` the deterministic section order is F1 Profile → F3 Memory → AdviceLog → Chain → `<financial_context>` → F4 State → F5 Eval, with token budget < 4k.

**Locked placement:** new `## User Identity` section via a `buildIdentityContext(user)` helper, **at the top of the context order, BEFORE F1 Profile**. ~50 tokens (`Your handle: alice.audric.sui (claimed 2026-05-15) / Your wallet: 0x40cd…3e62`). Pattern-conformant — matches every other context block. **Side-effect:** updates `audric/.cursor/rules/engine-context-assembly.mdc` to add the new section to the documented order.

**Why this position:** "this is who you're talking to" is the most foundational fact for the LLM to know. Placing it first means every downstream block can reference the user's own handle without re-introducing it. Negligible cost (~50 tokens of a 4k budget).

### B-4. Engine release timing — one bump at Phase D.3

The original plan considered shipping `@t2000/engine@1.22.0` early (just the no-op `update_todo {persist: true}` cleanup from S.64) and again at Phase D.3 (with `lookup_user`). **Locked answer:** one bump only, at Phase D.3, carrying both `lookup_user` + the `update_todo {persist}` cleanup. Rationale: fewer Vercel deploys, fewer audric noise commits, and the `<user_identity>` block (C.1, audric-only) is built host-side from the `User` table (no engine schema change needed). Phase A through C are pure audric work + t2000 SDK work; no engine bump until D.3.

### B-5. Contacts schema — `Json` with Zod parse boundary

v0.2.1 A.2 says `Json` → typed `Contact[]` schema "(or stays JSON with shape enforced via Zod — TBD during impl)". **TBD resolved:** keep as `Json` with Zod parse boundary. Reasons:

1. The Contact shape may evolve again post-launch (v0.3 may add fields like `tags`, `lastInteraction`, `audricStoreFollowing`). Json + Zod absorbs that without a relational migration each time.
2. Postgres jsonb is fine for the access patterns (read-on-render, write-on-add). No relational query needed.
3. Avoids ON DELETE CASCADE complexities + foreign-key headaches with `User.id`.

**Phase A.2 acceptance gate addition:** existing send-by-email + send-by-contact-name flows pass on staging post-migration (per `audric/.cursor/rules/audric-pay-flow.mdc`'s send-flow contract). Backfill is additive (`{name, address}` → `{name, identifier: address, resolvedAddress: address.toLowerCase(), source: 'import', addedAt: createdAt}`) so behavior is preserved by construction; this gate verifies the construction is correct.

### B-6. Phase B.1 picker UX — privacy escape hatch

v0.2.1 B.1 says "smart pre-fill from Google profile email (3 suggestions, availability pre-checked)". **Implementation note:** add a 🔄 "regenerate suggestions" button so privacy-conscious users can hide email-derived defaults without typing the whole thing manually. The button re-derives 3 new suggestions from a different seed (e.g. add a number suffix variant; use the user's `name` claim instead of `email` claim). No spec-shape change; just a UX safety valve.

### B-7. Phase C.3 send-modal autocomplete — ambiguity ranking

v0.2.1 C.3 says "Type `@` → dropdown shows up to 10 matching Audric usernames + saved contacts". **Implementation note (edge case the spec doesn't cover):** when the user has a saved contact `{name: "alice", identifier: "0x999"}` AND `alice.audric.sui` resolves to a **different** `0xabc`, the dropdown shows BOTH rows. Ranking rule: saved contact ranked ABOVE Audric handle (your-saved-contact wins on ambiguity); the Audric-handle row gets a `🪪 Audric user` chip + full `alice.audric.sui` rendering to differentiate. Add as a Phase C.3 acceptance gate.

### B-8. Phase C.5 transaction-history truncation — viewport tests

v0.2.1 D10 says "truncate from the LEFT of the username … so the `.audric.sui` suffix remains visible". **Implementation note:** Phase C acceptance gate must test 320px / 375px / 768px viewports with all transaction-history columns rendered (recipient, amount, USD, timestamp, status icon). On 320px the recipient column may collapse to ~80px (~10 chars max — barely fits `.audric.sui` with no username). If that happens, design a 2-line row layout for narrow viewports (line 1: nickname/handle, line 2: amount + status). Decide at implementation time based on actual measurements.

### B-9. Operational items — parallel track

v0.2.1's "Open questions for founder review" lists 4 operational items un-decided at spec-lock time. Status as of 2026-05-05:

| Item | Owner | Tracking |
|---|---|---|
| Reserved-name founder list (D3) | Founder (5-min curation pass before Phase B ships) | Phase B.1 acceptance gate |
| Parent NFT custody address (D5) | ✅ DONE — `0xaca29165188f10136073788f648e1186dd25100100146186ebecedaf94b23d11` per `RUNBOOK_audric_sui_parent.md` §1 | RUNBOOK §2 item 1 ✅ |
| 3-location backup verify | Founder + 2nd team member (`RUNBOOK_audric_sui_parent.md` §2 item 2) | Phase A acceptance gate |
| Recovery procedures (RUNBOOK §5) | AI drafts; founder reviews | Phase A.4 deliverable |
| SuiNS auto-renewal cadence + T-30d alert | AI researches options; founder confirms | Phase A.4 deliverable |

The 4 open items are operational, not engineering — they gate Phase A acceptance sign-off, not Phase A code start. Total ~0.5d of focused ops work; runs in parallel with the ~2.5d of Phase A engineering.

### B-10. Out-of-scope confirmation (no spec change, just an explicit "no")

The carryover question "Decide if we refactor and remove GOALS" surfaced during the SPEC 10 build-plan review. **Answer: no.** SavingsGoal is orthogonal to SPEC 10 (Contacts unification doesn't touch SavingsGoal). S.65 manual smoke confirmed Sonnet correctly routes "$500 emergency fund" prompts to `savings_goal_create` (the working agentic flow). The P9.3 redundancy issue from S.64 is resolved (P9.3 was ripped; SavingsGoal is now the only persistence track for that intent). If a SavingsGoal cleanup pass is wanted, schedule it separately post-SPEC-10 — don't bundle into SPEC 10.

---

### Locked phase plan (~10d, ready to execute)

| Phase | Tasks | Owner | Effort |
|---|---|---|---|
| **A.0** | SPEC 8 v0.5.5 patch + this addendum (Commit 1) | t2000 | 0.1d |
| A.1 | `packages/sdk/src/protocols/suins-leaf.ts` — copy verbatim from `RUNBOOK_audric_sui_parent.md` §3 | t2000 SDK | 0.75d |
| A.2 | Prisma migration: `User.username` (+3 fields), Contact JSON+Zod boundary, send-flow regression gate | audric | 0.75d |
| A.3 | `GET /api/identity/check?username=alice` — 8 fixture cases | audric | 0.5d |
| **A.4** | RUNBOOK §5 recovery procedures (AI draft) + SuiNS auto-renewal research (AI) + 3-location backup verify (founder + 2nd team) + reserved-name list (founder) | shared | 0.25d–0.5d |
| A.5 | `POST /api/admin/identity/{reserve,release}` with `// CANONICAL-BYPASS:` comments per `audric-canonical-write.mdc` | audric | 0.25d |
| B.1 | `<UsernamePicker>` reusable component on SPEC 9 P9.4 `pending_input` substrate; smart pre-fill + 🔄 regenerate; debounced check; design-system tokens | audric | 1d |
| B.2 | `POST /api/identity/reserve` — anti-race re-validate, `buildAddLeafTx`, Enoki sponsor, write `User.username` + audit fields | audric | 0.5d |
| B.3 | Success state + share buttons | audric | 0.25d |
| C.1 | `buildIdentityContext(user)` helper → `## User Identity` block at top of context order; update `engine-context-assembly.mdc` | audric | 0.25d |
| C.2 | (already done — S.52 `AddressBadge`) | — | 0d |
| C.3 | Send-modal `@`-autocomplete with ambiguity ranking (B-7) | audric | 0.75d |
| C.4 | Receive page hybrid QR | audric | 0.5d |
| C.5 | Chat handle rendering with 320/375/768px viewport tests (B-8) | audric | 0.5d |
| C.6 | D10 LLM teaching block + 50-turn `@[a-z]` adversarial grep test | audric | 0.25d |
| **D.1** | `audric.ai/[username]` profile page — built FRESH on `getPortfolio()` (B-2 correction) | audric | 1.5–2d |
| D.2 | Nav search bar | audric | 0.5d |
| **D.3** | Engine `lookup_user` tool ships in `@t2000/engine@1.22.0` (also drops `update_todo {persist}` cleanup from S.64). Audric PR bumps engine + adds `STEP_ICONS['lookup_user'] = '🔎'` + `STEP_LABELS['lookup_user'] = 'LOOKUP USER'` to `AgentStep.tsx` in same PR per SPEC 8 v0.5.1 G4 binding | t2000 + audric | 0.5d |
| D.4 | Contact augmentation backfill (cron or lazy-on-render) | audric | 0.5d |
| D.5 | `audric.ai/settings/contacts` CRUD page | audric | 0.5d |

**Total v0.2.0:** ~10 focus days, ~3 weeks at 4–5 effective focus hours/day.
