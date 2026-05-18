# CHIP Review #2.5 — Pre-SPEC-18 UX Sweep (Stale Data + Dead Features)

**Date:** 2026-05-07
**Trigger:** Founder spotted stale references on the Pay page during SPEC 18 prep. Asked for a full sweep across all sidebar surfaces (Portfolio + tabs, Activity, Pay, Contacts, Store, Settings) before regression testing baselines lock.
**Method:** Code grep for known-removed-feature keywords (`goal`, `trust ladder`, `recurring`, `schedule`, `allowance`, `automate`) → triage user-facing matches → ship surgical fixes inline.

---

## Findings (11 fixes shipped)

### P1 — Pay page (founder-flagged)

| ID | Surface | Issue | Action |
|---|---|---|---|
| **PR2.5-1** | `PayPanel.tsx` L247 (income card body) | Literal code identifier `balance.available` in body copy ("Every payment received adds to balance.available immediately") | Replace with "your wallet" |
| **PR2.5-2** | `PayPanel.tsx` L248 (income card body) | Phrase "direct it to a goal" — SPEC 17 cleanup miss | Drop the goal phrasing; copy becomes "save it, send it onward, or hold it" |
| **PR2.5-3** | `PayPanel.tsx` L259–265 (income card actions) | "Goal ›" pill — SPEC 17 cleanup miss | Replace with "Send ›" — natural follow-up to receiving money |
| **PR2.5-4** | `PayPanel.tsx` L22–24 + L352–369 | "Automate recurring invoice / Monthly client billing · trust ladder applies" upsell row — DOUBLE removed feature (S.7 dropped scheduled actions; trust ladder concept retired) | DELETE the entire dashed-row block + comments |
| **PR2.5-5** | `PayPanel.tsx` L220–225 (API SPEND stat card) | Vague label + em-dash placeholder + "today · 40+ services" sublabel — same drift class as S.109 F-13 on FullPortfolioCanvas | Align with canvas: "$0.00" + "no MPP services this month" |

### P1 — Store page (founder-flagged)

| ID | Surface | Issue | Action |
|---|---|---|---|
| **PR2.5-6** | `StorePanel.tsx` L209–213 (earnings callout) | "count toward your **Goals**" reference — SPEC 17 cleanup miss | Drop the Goals chunk; copy becomes "show in Activity → Store and appear in your weekly income report" |
| **PR2.5-7** | `StorePanel.tsx` L17 + L264–278 | "Automate store content / Generate + list on a schedule · trust ladder applies" dashed card — DOUBLE removed feature | DELETE the entire dashed card + comment |

### P2 — Other surfaces (proactive sweep, not founder-flagged)

| ID | Surface | Issue | Action |
|---|---|---|---|
| **PR2.5-8** | `PortfolioPanel.tsx` L32 | Dead `goals?: Array<...>` prop (declared but never used inside component, never passed at call site `dashboard-content.tsx` L2474) | Delete the prop |
| **PR2.5-9** | `PortfolioPanel.tsx` L8 + L114–121 + L348 (Spending stat card + tool-grid + comment) | Same drift as PR2.5-5 — vague "Spending" label + `—` placeholder | Align with canvas + PayPanel: "API SPEND" + "$0.00" + "no MPP services this month" |
| **PR2.5-10** | `ProductScreenshotSection.tsx` L17 (marketing landing) | Mock dashboard sidebar shows `{ glyph: '◇', label: 'Goals' }` as the 5th sidebar item — but the real sidebar dropped Goals in SPEC 17. Visitors see a feature that doesn't exist. | Replace with `{ glyph: '◇', label: 'Store' }` — matches the real sidebar |

---

## Audited surfaces — clean (no findings)

| Surface | Status |
|---|---|
| `ContactsPanel.tsx` | ✅ Clean — no stale references |
| `ActivityPanel.tsx` | ✅ Clean |
| `app/settings/page.tsx` | ✅ Clean — has SPEC 17 cleanup comment + defensive redirect for legacy `?section=goals` deep-links |
| `AppSidebar.tsx` | ✅ Clean — has SPEC 17 cleanup comment |
| `app/(legal)/*` | ✅ No stale refs |
| `app/litepaper/page.tsx` | ✅ "Copilot" = GitHub Copilot (MCP plugin context); "your goals" in opening copy = chat-mentioned aspirations (legit Silent Profile concept, same as `goal_progress` proactive type that SURVIVED SPEC 17) |

---

## PR2.5-11 — SHIPPED: surface .sui addresses + format-recognition hint

**Founder question (resolved):** today the SEND chip accepts (a) `@username`, (b) Sui address `0x...`, (c) `.sui` domain (SuiNS). Discoverability was poor — users didn't know they could paste a `.sui` name unless they tried.

**Originally three options were drafted (A/B/C). Option B was chosen and a tightened version shipped after a ground-truth code trace revealed:**
- Contact pills already exist above the input (so no new "recent contacts" affordance needed)
- `@username` autocomplete dropdown already exists (covers itself)
- The ONLY missing piece was advertising `.sui` and acknowledging recognized formats

**Implementation (commit `03783a3`, ~25 LoC, 1 file `app/new/dashboard-content.tsx`):**

1. **Placeholder updated** — `"@username, contact, .sui name, or 0x address"` (was `"@username, contact name, or 0x address"` — `.sui name` added)
2. **Inline format-recognition hint** below the input (`data-testid="send-recipient-format-hint"`):
   - `0x...` prefix → `"Sui address (0x…) — tap Go to send"`
   - `looksLikeSuiNs(value)` → `"SuiNS .sui name — we'll resolve when you tap Go"`
   - exact contact match → `"Contact match: <name>"`
   - empty / `@` prefix → silent (dropdown is the affordance)

**Live verified on production (`audric.ai/new` → SEND → first L2 chip):**
- ✅ Placeholder reads `@username, contact, .sui name, or 0x address`
- ✅ Typing `alex.sui` → hint shows `SuiNS .sui name — we'll resolve when you tap Go`
- ✅ Typing `0x40cd1234abcd` → hint shows `Sui address (0x…) — tap Go to send`
- ✅ Typing `funkii` (matching contact) → hint shows `Contact match: funkii`
- ✅ Typing `@alice` → hint silent (dropdown takes over with "No Audric user matches @alice. Paste a 0x address or pick a contact above")

**Cost vs. originally proposed Option B:**
- Original Option B: ~30 LoC + new "recent contacts" backend query
- Shipped: ~25 LoC, no backend changes — discovered the contact pills + dropdown already covered most of Option B's intent
- Surgical-changes principle paid off: only the genuinely missing affordance was added

---

## Disposition

- **All 10 stale-data fixes** (PR2.5-1 through PR2.5-10) shipped in commit `2671e02`
- **PR2.5-11 send-recipient UX** shipped in commit `03783a3` — live-verified across all 4 input formats
- **CHIP Review #2.5 fully closed.** Regression baseline locked for SPEC 18.

---

## Lessons learned

1. **Marketing surfaces drift independently of the product.** The sidebar mock in `ProductScreenshotSection.tsx` was authored when Goals existed. SPEC 17 cleanup correctly dropped the real sidebar entry but missed the marketing screenshot. Add to SPEC 12 audit checklist for next consistency sweep: "marketing screenshots reflect current product surface."
2. **`balance.available` literal in copy** is a class of bug — code identifiers leaking into user-facing prose. One-off, but worth a lint rule eventually (`no-code-identifiers-in-jsx-text`).
3. **The "no behavior change" rule has a half-life.** PayPanel L23 explicitly notes the recurring-invoice row was preserved per "no behavior change" during the Phase 7 re-skin. That preservation logic is now stale because the underlying feature was retired afterward. When a feature is retired, audit all "preserved per X rule" tombstones.
4. **Trace before designing.** PR2.5-11 was originally drafted as a 30-LoC Option B that would add a "recent contacts" affordance and a format-recognition badge. A 5-minute code trace before coding revealed (a) contact pills already render above the input, (b) `@username` autocomplete already exists, (c) the actual gap was just `.sui` undocumented. Shipped scope shrank from "new affordance + new backend query" to "1 placeholder string + 1 hint paragraph." Discipline rule: never design a UX surface without first reading the existing component end-to-end.
5. **Discoverability gaps don't always need new affordances.** They sometimes need the existing affordances to advertise themselves better. PR2.5-11 added zero new components — just a placeholder update and a single conditional `<p>` element. The `.sui` resolver path had been live for SPEC 10 D-series; users just couldn't see it.
