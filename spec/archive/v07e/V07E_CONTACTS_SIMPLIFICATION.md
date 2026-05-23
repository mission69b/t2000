# V07E_CONTACTS_SIMPLIFICATION — Do we even need contacts?

> **Status**: Phase 1A SHIPPED 2026-05-22 ~07:50 AEST (S.243) — Path A locked + Phases 2/3/4/5 queued
> **Author**: Agent under founder direction
> **Lock**: ALL 5 Q's founder-locked 2026-05-22: Q1=A (delete entirely), Q2=A-1 (live reverse-lookup, DEFERRED to P5 audit-first), Q3=A (delete /settings/contacts), Q4=DROP DIRECTLY, Q5=A (@username narration)
> **Scope class**: v0.7e Phase 1 cleanup — sibling to V07E_INVOICE_DEPRECATION
> **Predecessor evidence**: Founder log (4-turn contacts bug session 2026-05-21)
> **Trigger quote**: *"to simplify is it really needed now we have sui ns lookup?"*

## SHIPPED — Phase 1A summary

- **Commit**: pending (see audric-build-tracker S.243)
- **Scope**: web-v2 ONLY (apps/web zombie-code per S.239; dies en bloc with v0.7e Phase 2)
- **Net**: -698 LoC across 17 files (5 deleted + 12 surgical edits)
- **Bug class eliminated by construction** — LLM in web-v2 can no longer dispatch save_contact; no contacts in /settings; @username narration rule prevents @audric fabrication
- **Typecheck + lint + build all clean**

## Phase queue (post-Phase-1A)

- **Phase 2 (~30 min, AFTER ~24h soak)** — Prisma drop `UserPreferences.contacts` JSON column. Q4 DROP DIRECTLY locked.
- **Phase 3 (AUTOMATIC, $0 work)** — apps/web contacts surface dies with v0.7e Phase 2 (apps/web archive).
- **Phase 4 (~30 min, NO RUSH)** — Engine package cleanup: delete `packages/engine/src/tools/contacts.ts` + `add-recipient.ts`, bump minor, publish.
- **Phase 5 (~0-2h, AUDIT FIRST)** — Q2 A-1 reverse-lookup at render layer IF web-v2 send history currently relies on contact-stored names.

---

## 1. The 4 bugs from the founder log

Founder evidence (2026-05-21 chat session, paraphrased):

```
T1 "send $1 to @funkii"          → ✅ resolved via Audric directory → 0x7f20…f6dc
T2 "Send @funkii in my contacts"  → 🐛 save_contact(funkii, 0x7f20…f6dc) silently
                                      created SECOND contact named "funkii"
                                      (the EXISTING funkii pointed to funkii.sui
                                       at 0x40cd…f6dc — different address)
T3 "Ok you overwrote my orginal" → LLM apologized for "overwriting" (incorrect —
                                      it created a duplicate); asked user to
                                      re-paste the funkii.sui address
T4 "add the address as funkii.sui" → workaround: saved as a SECOND contact named
                                      "funkii.sui" (now user has 2 funkiis)
T5 "send $1 to funkii in my contacts"
                                  → LLM silently picked one (the @audric one)
                                      → "Sent $1 USDC to funkii@audric"
                                        — but contact name is just "funkii";
                                        @audric suffix was fabricated
```

**B1. Silent name collision** — `save_contact("funkii", NEW_ADDR)` when "funkii" already maps to a different address creates a duplicate row instead of asking. Server-side dedupe keys on `resolvedAddress` only (see `contact-tools.ts:119` + `/api/contacts/save:99`).

**B2. `@audric` assumption baked into intent parsing** — "Send @funkii in my contacts" was interpreted as "save @funkii (the Audric user) as a contact" without checking if "funkii" already existed as a contact. Bias from the system prompt + `lookup_user` being a primary identifier resolver.

**B3. `@audric` fabricated in send narration** — Output says "Sent $1 USDC to funkii@audric" even when the saved contact was just named `funkii` with no Audric handle attached. The narration unconditionally appends `@audric` when the recipient resolved via the Audric directory.

**B4. No read-before-write on contacts** — LLM has no `list_contacts` call in the resolution chain before writing, so it can't detect collisions or surface them.

---

## 2. Today's contacts surface (the LoC inventory)

```
─── Engine ────────────────────────────────────────────────────────────
packages/engine/src/tools/contacts.ts                            45 LoC
packages/engine/src/tools/add-recipient.ts (SPEC 9 P9.4)        125 LoC
                                                          ───────────
                                                                170 LoC

─── audric/apps/web (host-side full implementation) ───────────────────
apps/web/lib/engine/contact-tools.ts                            216 LoC
apps/web/lib/identity/contact-schema.ts                         211 LoC
apps/web/lib/identity/__tests__/contact-schema.test.ts          346 LoC
apps/web/lib/engine/__tests__/contact-tools.test.ts             292 LoC
apps/web/hooks/useContacts.ts                                   280 LoC
apps/web/components/panels/ContactsPanel.tsx                    787 LoC
apps/web/app/api/user/preferences/contacts/backfill/route.ts    128 LoC
                                                          ───────────
                                                              2,260 LoC

─── audric/apps/web-v2 (HITL route + settings UI) ─────────────────────
apps/web-v2/app/api/contacts/save/route.ts                      163 LoC
apps/web-v2/hooks/use-contacts.ts                               134 LoC
apps/web-v2/components/settings/contacts-section.tsx            113 LoC
                                                          ───────────
                                                                410 LoC

═══════════════════════════════════════════════════════════════════════
TOTAL                                                         2,840 LoC
═══════════════════════════════════════════════════════════════════════
```

Plus:
- `UserPreferences.contacts` Prisma JSON column (data)
- `audric handle` Audric User Postgres table — separate from contacts, served by `lookupUserTool` (~80 LoC)
- SuiNS resolver — `packages/engine/src/tools/resolve-suins.ts` (~60 LoC, generic SuiNS)
- `parseContactList`, `serializeContactList`, lazy reverse-SuiNS backfill (SPEC 10 D.4) — embedded in the above

**Architectural complexity carried by contacts:**
- 5 contact `source` values (`import`, `save_contact`, `manual`, `autocomplete`, `agent`)
- 24h `audricUsernameCheckedAt` TTL cache for reverse-SuiNS enrichment
- Per-session `backfillDoneRef` debounce for backfill firing
- Forward-only schema migration (legacy `{name, address}` → unified 7-field shape via lazy `liftLegacyContact`)
- Mixed dedupe semantics (by `resolvedAddress`, not by `name`)
- `address` ≠ `identifier` ≠ `resolvedAddress` (3 fields, all overlap)

---

## 3. The radical question — what does contacts EVEN buy us now?

**4 ways a user can identify a recipient today:**

| Identifier format | Resolution path | Coverage |
|---|---|---|
| `@username` (e.g., `@funkii`) | `lookup_user` (Audric User table) | Anyone with an Audric handle |
| `name.sui` (e.g., `funkii.sui`) | `resolve_suins` (Sui SuiNS) | Anyone with a SuiNS leaf |
| `0x...` (bare hex) | Direct address use | Anyone on Sui |
| `Mom` / `Alex` / free-form name | Contact lookup | Recipients with no canonical identifier |

**The last row is the entire reason contacts exist.** Without contacts, a user can ONLY send to recipients they can identify via one of the three canonical formats.

**The strategic question:** in 2026, is "I need a nickname for a bare 0x address that's not on Audric and not on SuiNS" still a real use case worth 2,840 LoC + a JSON column + a CRUD UI?

**Arguments for "no, delete it":**
- Anyone the user repeatedly sends USDC to should onboard to Audric (free, 3 sec, zkLogin) — then they have a `@handle`
- SuiNS coverage of the Sui ecosystem is growing
- Audric Passport's product positioning IS "give your wallet a handle" — contacts duplicate that abstraction layer
- Removes B1-B4 by construction (no name → no collision; no contact-as-fallback → no `@audric` assumption confusion)
- Massive simplification: ~2,000+ LoC delete + 1 Prisma column drop + 1 settings page deletion
- Aligns with founder framing: *"if v2 doesn't need it, we shouldn't be adding complexity"* (S.239)

**Arguments for "yes, keep but simplify":**
- "I want to nickname my Mom's 0x address" is a legitimate UX request when Mom isn't a tech native
- Send history would otherwise show recipient as raw `0x7f20…f6dc` forever
- One-tap-send-by-name is a smoother flow than re-typing/pasting an address each time

**Arguments for "patch the bugs, keep architecture":**
- Existing users may already have contacts saved (production has live `UserPreferences.contacts` rows)
- Test coverage already exists (346 + 292 LoC of tests)
- Smallest blast radius

---

## 4. Three candidate paths

### PATH A — Delete contacts entirely
**Recipient resolution:** `@handle` (Audric) → `.sui` (SuiNS) → `0x...` (bare) → "Recipient not recognized — invite them to Audric or paste their address."

**What gets deleted:**
- All 2,840 LoC of contacts surface (engine stub + host tool + HITL route + schema + hooks + panels + backfill route + tests + settings section)
- `UserPreferences.contacts` JSON column (Prisma migration)
- `save_contact` + `list_contacts` + `add_recipient` tools (3 engine/host tool deletions)
- `/settings/contacts` UI surface in both apps/web and web-v2
- The entire `lib/identity/contact-schema.ts` unified shape + SPEC 10 D.7 / D.4 backfill code path
- `to: 'Sui address or saved contact name'` description simplifies to `to: 'Sui address (0x… or @handle or .sui)'`

**What gets ADDED (small):**
- Send-history display layer: reverse-lookup an address against (a) Audric directory (b) SuiNS at render time to show a friendly label. Cached for the session. Falls back to short-form `0x7f20…f6dc` if neither resolves. ~50-80 LoC across audric/web-v2 send-history renderer.

**What gets POSTED to users at migration:** In-app notice (optional) "Contacts have been simplified — use @handles, .sui names, or paste addresses directly. Existing contacts archived for ~30d if you need to copy any out." (Pattern matches V07E_INVOICE_DEPRECATION Phase 5 archive-then-drop.)

**Effort estimate:** ~6-9h spread across 4 phases. Net diff: **−2,800+ LoC, −1 Prisma column, −2 settings UI surfaces, −3 engine/host tools.**

**Risk:** Founder may decide post-ship that nickname-a-bare-0x is desired after all — but if so, it's a clean fresh-build feature, not a re-add of the deleted code (the old architecture was over-built for the use case).

---

### PATH B — Simplify contacts to "free-form name → bare 0x ONLY"
**Recipient resolution:** `@handle` (Audric) → `.sui` (SuiNS) → `0x...` (bare) → free-form contact name → "Recipient not recognized."

**What gets simplified:**
- Contact schema collapses to `{name: string, address: string, addedAt: ISO}` — 3 fields, no enrichment
- Delete `audricUsername`, `audricUsernameCheckedAt`, `identifier`, `resolvedAddress` (use lowercased `address` directly), `source` enum
- Dedupe BY NAME (not by address) — second save with same name = "Replace existing 'funkii' (0x40cd...)?" HITL prompt
- Delete the reverse-SuiNS backfill route + lazy enrichment (no `audricUsername` to fill)
- `save_contact` tool description simplifies to: *"Save a free-form name for an address (e.g., 'Mom' → 0x123...). Names must be unique."*
- System prompt teaches: contacts are nicknames for arbitrary addresses, NOT for `@handles` (which resolve directly) or `.sui` names (also direct)
- Engine `add_recipient` tool stays but its polymorphic identifier collapses to bare-0x-only (since `@handle` and `.sui` resolve directly, not via contacts)
- `ContactsPanel.tsx` simplifies to 2-column table (name + address)

**What stays:**
- `UserPreferences.contacts` Prisma column (same column, simpler shape)
- Settings `/contacts` page (simpler UI)
- Auto-migration of existing `{name, identifier, resolvedAddress, ...}` rows → `{name, address}` on first read

**Effort estimate:** ~8-12h spread across 5 phases. Net diff: **−1,500 to −2,000 LoC**, simpler schema, same DB column.

**Risk:** Name uniqueness might frustrate users who genuinely want "Mom" and "Mom (work)" — fix is to surface the rename HITL prompt at save time.

---

### PATH C — Patch the 4 bugs, keep architecture
**Recipient resolution:** same as today (4 paths including contacts).

**What gets changed:**
- **B1**: `save_contact` checks for name collision before persisting; if collision exists with different address, yield `pending_action` "Contact 'funkii' already points to 0x40cd... — replace, save as different name, or cancel?"
- **B2**: System prompt update — when user says "send/save X in my contacts", call `list_contacts` FIRST to check for existing X; only fall back to `lookup_user` if no contact match
- **B3**: Send-receipt narration: only append `@audric` when the recipient was resolved VIA `lookup_user` AND the user typed `@handle` format; for resolved-via-contacts recipients, show the contact name as-is
- **B4**: Add an implicit `list_contacts` call into the engine's send-recipient resolution chain (or auto-inject contacts into system prompt at turn start)

**Effort estimate:** ~4-6h. Net diff: **+200 to +400 LoC** (bug fixes + new HITL flow + system prompt updates).

**Risk:** Carries the 2,840 LoC complexity forward forever. Future SPECs touching contacts (e.g., contacts migration to web-v2, schema evolution) pay the same complexity tax.

---

## 5. Recommendation: PATH A

**Reasoning:**

1. **Founder's framing is consistent with Path A.** "If v2 doesn't need it, we shouldn't be adding complexity" (S.239) + "to simplify is it really needed now we have sui ns lookup?" (this session) = the explicit founder lean.

2. **The Audric Passport product story.** Passport's whole pitch is "your wallet has a handle — `funkii@audric` IS the friendly name." Carrying a parallel "contacts table for nicknaming arbitrary addresses" duplicates that abstraction. Either Passport handles cover the use case, OR they don't — and if they don't, the fix is making Passport sign-up frictionless (already 3-sec zkLogin), not maintaining a side-channel contacts system.

3. **B1-B4 are structural, not surface bugs.** B1 (name collision) is rooted in the address-keyed dedupe; B2 (`@audric` assumption) is rooted in having multiple recipient-resolution paths; B3 (narration fabrication) is rooted in the LLM stitching together identifier formats it shouldn't; B4 (no read-before-write) is rooted in the tool being one-shot. Fixing all 4 in Path C is a constant maintenance burden. Path A retires the bug class entirely.

4. **2,840 LoC + 1 Prisma column + 2 settings UI surfaces + 3 engine/host tools is a LOT of code for a marginal use case.** The bare-0x-nickname case (the only thing contacts uniquely solves) is small enough that "live reverse-lookup at display time" is a clean ~50-80 LoC alternative.

5. **Reversibility.** If post-ship founder feedback requests "I want to nickname my Mom's address" back, it's a fresh-build feature SPEC, not an undo of the deletion. The old over-built architecture isn't worth preserving.

6. **Aligns with V07E_INVOICE_DEPRECATION pattern.** Same "should we even have this product" question + same "delete from the source, not nibble around the edges" answer + same "live in its own mini-SPEC" cadence.

---

## 6. Open questions for founder lock (Q1–Q5)

### Q1 — Which path?
- **A — Delete contacts entirely** (agent recommendation; ~6-9h, ~−2,800 LoC)
- **B — Simplify to free-form name → bare 0x only** (~8-12h, ~−1,500 LoC, mid-ground)
- **C — Patch B1-B4 in place** (~4-6h, +200-400 LoC, retains complexity)

### Q2 (if A or B) — Send-history display fallback
When contacts are removed/simplified, how do we show past sends in the activity feed?
- **A-1 — Live reverse-lookup at render** (audric directory + SuiNS, session-cached, fallback to short-form `0x7f20…f6dc`). ~50-80 LoC ADDED.
- **A-2 — Raw short-form `0x7f20…f6dc` only.** No reverse-lookup. Cheaper; less polished UX.
- **A-3 — Both: live for current activity, raw for historical.** Hybrid.

### Q3 (if A) — `/settings/contacts` UI fate
- **A — Delete entirely.** No contacts page anywhere.
- **B — Replace with a "Quick send" or "Recent recipients" view** sourced from recent send history (no DB column needed).
- **C — Keep an empty settings page (signpost):** "Contacts have been simplified. Send to @handles, .sui names, or paste addresses directly."

### Q4 — Existing `UserPreferences.contacts` rows in production
Same pattern as V07E_INVOICE_DEPRECATION Q2:
- **ARCHIVE — Copy to `UserPreferencesContactsArchive` table for 30 days, then drop.** Recoverable if users complain.
- **DROP DIRECTLY — Drop the column + data immediately.** Smaller change; no recovery.

### Q5 — `@username` vs `@user.audric.sui` canonicalization
Today, an Audric user can be addressed as either `funkii@audric` (the display form) OR `funkii.audric.sui` (the canonical SuiNS form, since Audric handles are leaves of `.audric.sui`). Both resolve to the same address.
- **A — Standardize to `@username` notation in chat input + display.** `.audric.sui` is implementation detail. (Recommended — cleaner UX.)
- **B — Accept both, narrate as user typed.** Round-trip fidelity. More implementation work.
- **C — Standardize to `username.audric.sui` notation.** Aligns with SuiNS convention but more verbose.

---

## 7. Per-path execution sketch (whichever locks)

### If PATH A locks — 4-phase delete
- **Phase 1 (~1h):** Delete 3 engine/host tools (`save_contact`, `list_contacts`, `add_recipient`); remove from `tool-flags.ts` + `tool-policy.ts` + system prompt instructions about contacts; update CLAUDE.md tool count
- **Phase 2 (~2h):** Add live reverse-lookup at display layer (Q2-A1 path) — session-cached `address → friendly name` resolver in send history + chat receipts + `<recipient>` narration
- **Phase 3 (~1.5-2h):** Delete contacts UI — `ContactsPanel.tsx`, `useContacts.ts`, `use-contacts.ts`, `contacts-section.tsx`, `/api/contacts/save`, `/api/user/preferences/contacts/backfill`
- **Phase 4 (~1.5-2h):** Prisma migration — archive `UserPreferences.contacts` to `UserPreferencesContactsArchive` (or DROP per Q4), drop the column from `UserPreferences`, update Prisma schema

### If PATH B locks — 5-phase simplify
- **Phase 1 (~1h):** Collapse `contact-schema.ts` to 3-field shape; delete enrichment code; auto-migrate on read
- **Phase 2 (~2h):** Switch dedupe to BY-NAME; add collision HITL flow via `pending_action`
- **Phase 3 (~1h):** Update system prompt (contacts = nicknames for bare 0x only); update `save_contact` description
- **Phase 4 (~2-3h):** Simplify `ContactsPanel.tsx` to 2-column; delete `audricUsername` UI bits; delete reverse-SuiNS backfill route
- **Phase 5 (~1-2h):** Tests + Prisma column documentation update (column stays, simpler shape)

### If PATH C locks — 3-phase patch
- **Phase 1 (~2h):** B1 collision HITL flow in `save_contact`; B4 inject `list_contacts` into resolution chain
- **Phase 2 (~1h):** B2 system prompt update (list_contacts before lookup_user when user says "in my contacts")
- **Phase 3 (~1-2h):** B3 send-receipt narration fix; tests for all 4 bugs

---

## 8. Risks + mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Path A regret** — founder later wants nickname-bare-0x back | Reversible: fresh feature SPEC; old code in git history for reference if needed |
| R2 | **Existing prod rows** — users have saved contacts they expect to keep | Phase 4 (Q4) archive table preserves data for 30 days; can also email/export before drop |
| R3 | **Send-history UX regression** — past sends become unreadable | Q2 Path A-1 reverse-lookup mitigates; cache hit rate should be high (same recipients sent to repeatedly) |
| R4 | **Engine tool deletion ripples** — `save_contact` references in skills / docs / system prompt | Audit at Phase 1 ship: `rg "save_contact\|list_contacts\|add_recipient"` across t2000 + audric; grep-replace + manual review |
| R5 | **HITL prompt fatigue (Path B)** — every name collision pops a modal | Mitigation: collision is rare in practice; the prompt is a one-time event per contact |
| R6 | **Path C tech debt accumulation** — bug-patching keeps the 2,840 LoC complexity forever | Surface the long-term cost in founder review; if Path C locks, schedule a re-evaluation post-v0.7e Phase 2 |
| R7 | **`@user.audric.sui` consumers** — anywhere we render the canonical SuiNS form, Q5 lock changes the display string | Q5 lock determines this; if Path A standardizes to `@username`, audit display sites and update narration |

---

## 9. Test plan (path-agnostic)

After whichever path ships:
- E2E: send to `@handle`, `.sui`, and `0x` — all 3 paths should resolve correctly without contacts
- E2E (Path A only): visit send-history → recipient renders with friendly name when resolvable, short-form `0x7f20…f6dc` when not
- Regression: confirm B1-B4 scenarios from §1 cannot reproduce (collision detection works for B / B1, narration is fact-only for B3, no `@audric` fabrication)
- Unit: `MAX_CONTACTS` capacity gate (Path B only) — saving the 101st contact fails cleanly
- Smoke: ask the agent "show me my contacts" — Path A responds "Contacts have been simplified — use @handles, .sui, or 0x" / Path B responds with 2-column simplified list / Path C unchanged

---

## 10. Cross-references

- **S.239** (2026-05-21) — `audric-build-tracker.md` — sibling SPEC pattern (V07E_INVOICE_DEPRECATION). Same "delete vs patch" question, same SCOPING-SPEC structure
- **`spec/active/V07E_INVOICE_DEPRECATION.md`** — sibling deprecation SPEC, currently DEFERRED per founder 2026-05-21
- **SPEC 9 v0.1.3 P9.4** (archived) — `add_recipient` tool spec; Path A deletes the tool, Path B keeps it with collapsed identifier set
- **SPEC 10 D.4 / D.7** (archived) — unified Contact schema + reverse-SuiNS backfill; Path A deletes the schema entirely, Path B collapses it
- **`packages/engine/src/tools/contacts.ts`** — engine stub (45 LoC)
- **`packages/engine/src/tools/add-recipient.ts`** — engine LLM-initiated form tool (125 LoC)
- **`packages/engine/src/tools/transfer.ts`** — `send_transfer` tool; `to` field description changes per path
- **`apps/web/lib/engine/contact-tools.ts`** — host-side full implementation (216 LoC)
- **`apps/web/lib/identity/contact-schema.ts`** — unified Contact Zod schema (211 LoC)
- **`apps/web-v2/app/api/contacts/save/route.ts`** — HITL persistence route (163 LoC)
- **CLAUDE.md** — Audric Passport "your wallet has a handle" product framing supports Path A
- **Audric handle resolver** — `lookupUserTool` (~80 LoC, audric-side); unchanged by any path
- **SuiNS resolver** — `packages/engine/src/tools/resolve-suins.ts` (~60 LoC); unchanged by any path

---

## 11. Out-of-band notes for the next agent

- **The founder log is the SSOT for the bug evidence.** Don't re-litigate whether B1-B4 are real bugs — they're documented in the founder's own chat session.
- **PATH A is the agent recommendation** — but the radical simplification call is the founder's. Don't ship Path A without explicit lock. Path C is the conservative default if founder waffles.
- **Pre-flight before Phase 4 (any path)**: count existing `UserPreferences.contacts` rows in prod. Founder needs real numbers (especially `non-empty contacts JSON` users + average contact-list size) to approve Q4 archive-vs-drop call with confidence.
- **Don't merge Phase 1 (any path) without coordinating engine release + audric/web-v2 pickup** — same hour, same smoke. The tool surface change is breaking for any consumer holding the old description.

---

**END V07E_CONTACTS_SIMPLIFICATION v0.1 SCOPING SPEC**
