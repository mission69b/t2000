# RUNBOOK — SPEC 9 P9.5 Eval Pass

**Status:** 🔴 SUPERSEDED 2026-05-05 — P9.3 RIPPED OUT (see `audric-build-tracker.md` S.64). UC2 is no longer applicable. P9.5 closed PARTIAL.
**Owner:** Audric founder + assistant.
**Last updated:** 2026-05-05.

> **DO NOT RUN UC2 cells from this runbook.** The `Goal` Prisma table, `<OpenGoalsSidebar>`, `/api/goals/*` routes, and `handlePersistentTodos` were all deleted on 2026-05-05 because the smoke proved Sonnet routes natural prompts to existing tools (`savings_goal_create`, `record_advice`) and never selected `update_todo {persist:true}` for cross-session use cases. UC1 (proactive markers) and UC3 (`add_recipient` `pending_input` form) are still valid; run them only if P9.2 / P9.4 needs re-verification. See S.64 in the build tracker for the full reasoning + LOC delta.

This runbook captures both halves of the SPEC 9 v0.1.3 P9.5 acceptance gate:

1. **Scripted half (CLOSED 2026-05-05).** `packages/engine/src/__tests__/spec9-canonical-eval.test.ts` exercises all 3 canonical use cases with mock providers driving the engine through the EXACT event sequence a correctly-behaving LLM would produce. 11 tests, all green. This proves the WIRING — every R3/R4/R6 gate the spec promised is hooked up correctly.
2. **Manual half (OPEN — runs after P9.6 deploys).** This document. Verifies that real Haiku and Sonnet actually emit `<proactive>` markers, actually call `add_recipient` on unknown contacts, and actually set `persist:true` on long-lived goals. Scripted providers can't catch system-prompt drift; this gate can.

Three use cases, two models each. Six manual prompts total. ~30 minutes wall-time once audric/web has engine v1.18.0.

---

## 1. Standing operational facts

| Field | Value |
|---|---|
| Spec section | `spec/SPEC_9_AUDRIC_STORE_HARNESS.md` § Suggested sequencing P9.5 |
| Build-tracker row | `audric-build-tracker.md` (added at P9.6 release) |
| Hard prerequisite | **P9.6 must be live first** — engine v1.18.0 published, audric/web deployed with new tools wired into `engine-factory.ts`, `NEXT_PUBLIC_HARNESS_V9` flag enabled in the test session. |
| Test wallet | Same audric dev wallet used for SPEC 7 P2.6 (`0x4e127…480f`). Must hold ≥ $50 USDC for UC1 to be a real "idle balance." |
| Network | Sui mainnet via deployed audric/web (Vercel) |
| Eval cost (≈) | ≤ $1 LLM spend (6 short turns × ~3k input tokens × Anthropic input price). Zero on-chain writes — UC3's `add_recipient` writes only to Postgres. |
| Headline metric | All 6 cells PASS the per-cell expectation table below. |
| Failure escalation | If a cell FAILS on Sonnet, system-prompt drift is the prime suspect — re-read the relevant teaching block in `STATIC_SYSTEM_PROMPT` and tighten. If FAILS on Haiku only, document as Haiku limitation; Sonnet is the production default. |

---

## 2. Pre-eval setup (one-time per session)

1. **Confirm deployment.** Open audric/web in a fresh browser tab. Open DevTools → Network → filter on `engine/chat`. The first chat response payload should reference engine version ≥ `1.18.0` (in the `usage` event metadata or `meta` SSE event if you're version-stamping).
2. **Confirm flag.** `localStorage.NEXT_PUBLIC_HARNESS_V9 === '1'` (or whatever P9.6 wires up — check `audric-build-tracker.md` P9.6 row).
3. **Confirm tools.** Open the system prompt source (network response of first chat) and grep for `add_recipient`. If not present, P9.6 forgot to wire `addRecipientTool` into `engine-factory.ts` — escalate before continuing.
4. **Reset test wallet's contacts.** Optional, but cleaner. Delete any contact named "Mom" via settings → Contacts → ⋯ → Delete, or via DB:
   ```sql
   UPDATE "UserPreferences"
     SET contacts = (
       SELECT jsonb_agg(c) FROM jsonb_array_elements(contacts) c
       WHERE c->>'name' != 'Mom'
     )
     WHERE address = '0x4e127…480f';
   ```
5. **Install the SSE eval hook** (DevTools console — paste once per browser session before running prompts). This exposes `window.__lastSseEvents` for inspection after each prompt.
   ```javascript
   (function() {
     const orig = window.fetch;
     window.fetch = async function(...args) {
       const res = await orig.apply(this, args);
       if (typeof args[0] === 'string' && args[0].includes('/api/engine/')) {
         const clone = res.clone();
         const reader = clone.body?.getReader();
         if (!reader) return res;
         const dec = new TextDecoder();
         const events = [];
         (async () => {
           let buf = '';
           while (true) {
             const { value, done } = await reader.read();
             if (done) break;
             buf += dec.decode(value, { stream: true });
             const lines = buf.split('\n');
             buf = lines.pop();
             for (const line of lines) {
               if (!line.startsWith('data: ')) continue;
               try {
                 const ev = JSON.parse(line.slice(6));
                 events.push(ev);
                 if (ev.type === 'proactive_text') console.log('[eval] proactive_text', ev);
                 if (ev.type === 'pending_input') console.log('[eval] pending_input', ev);
                 if (ev.type === 'todo_update') console.log('[eval] todo_update', ev);
               } catch {}
             }
           }
           window.__lastSseEvents = events;
         })();
       }
       return res;
     };
     console.log('[eval] SSE hook installed; type a prompt and watch [eval] logs');
   })();
   ```

---

## 3. The three canonical use cases (run each on Haiku + Sonnet → 6 cells)

### UC1 — Idle-balance proactive nudge with same-session cooldown (R3)

**Setup.** Wallet must have ≥ $50 idle stables (USDC and/or USDsui) sitting outside NAVI savings. Either stable triggers the F2 rule as of engine v1.21.0 (matches v0.51.0+ saveable scope). If wallet has neither, deposit some out and back to create the idle position.

**Run prompt 1.** `"What's my balance?"`

**Expected first sighting:**
- `[eval] proactive_text { proactiveType: "idle_balance", subjectKey: "USDC" | "USDsui", suppressed: false, ... }` appears in console (either stable is valid as of engine v1.21.0).
- The chat surface renders the proactive nudge with the `✦ ADDED BY AUDRIC` lockup (italic body, dim border-left accent).
- The body mentions the idle USDC amount and the saving suggestion.

**Run prompt 2 (same session).** `"Show me my wallet again."`

**Expected second sighting:**
- `[eval] proactive_text { ..., suppressed: true, ... }` appears in console.
- The chat surface renders the regular text (NO `✦ ADDED BY AUDRIC` lockup) — same content, just no special treatment.
- Or: the LLM doesn't re-emit the marker at all (also valid — the engine's cooldown is one of two paths; both are PASS).

**Per-cell expectation table:**

| Cell | Model | Prompt 1: proactive emitted? | Prompt 2: cooldown engaged? |
|---|---|---|---|
| 1a | Sonnet | ⏳ | ⏳ |
| 1b | Haiku | ⏳ | ⏳ |

**FAIL signals:**
- Prompt 1 does NOT emit a proactive marker → system-prompt teaching is too weak; re-read `buildProactivenessInstructions` and tighten.
- Prompt 2 emits with `suppressed:false` → cooldown rehydration broken. Check `extractAllProactiveMarkers` in `engine.loadMessages` round-trip.

---

### UC2 — Cross-session goal persistence with R4 lean-shape gate

**Setup.** Fresh chat session (clear current session via "New chat" button or wait for session expiry). The user has zero open `Goal` rows in the DB.

**Run prompt 1 (RICH-shape turn — multi-step planning intent).** `"Help me plan a $500 emergency fund. I want to save by month-end and track my progress weekly."`

**Expected:**
- LLM calls `update_todo` with at least one item carrying `persist: true` (the $500 goal item) AND non-persistent within-turn steps (e.g. "check current rate", "compute monthly target").
- `[eval] todo_update { items: [{ id: ..., persist: true, ... }, ...] }` in console.
- Audric chat route writes the persist:true item to the `Goal` table — verify via:
  ```sql
  SELECT * FROM "Goal" WHERE "userId" = (SELECT id FROM "User" WHERE address = '0x4e127…480f') AND status = 'open';
  ```
  Should return ≥ 1 row matching the goal text.

**Sign out + sign back in (or wait for session expiry, then start a new session).**

**Run prompt 2 (LEAN-shape turn — simple read).** `"What's my current USDC balance?"`

**Expected:**
- `<open_goals>` block IS present in the system prompt (goalCount > 0). Verify by inspecting the request payload: DevTools → Network → POST `/api/engine/chat` → Request → expand `system` array → search for `<open_goals>`.
- BUT: the goal-promotion teaching addendum is OMITTED on this LEAN turn. Search the same system prompt for `"persist: true"` — it should be ABSENT (the teaching block only appears on rich/max turns).
- The agent's response surfaces the goal contextually if relevant (e.g. "you have $X USDC; you're $Y short of your $500 goal").

**Run prompt 3 (RICH-shape turn — planning intent).** `"How am I doing on my $500 goal?"`

**Expected:**
- `<open_goals>` block present.
- Goal-promotion teaching addendum ALSO present (this is a rich-shape turn).
- Agent narrates progress, e.g. "you're at $X — $Y short. Current pace: …".

**Per-cell expectation table:**

| Cell | Model | Prompt 1: persist:true emitted? | Prompt 2: <open_goals> in prompt, teaching omitted (LEAN R4)? | Prompt 3: <open_goals> + teaching present (RICH)? |
|---|---|---|---|---|
| 2a | Sonnet | ⏳ | ⏳ | ⏳ |
| 2b | Haiku | ⏳ | ⏳ | ⏳ |

**FAIL signals:**
- Prompt 1 doesn't set `persist: true` → system-prompt teaching too vague. Look at the rich-only addendum injected by `engine-context.ts` and tighten the "promote multi-week commitments" wording.
- Prompt 2 has `<open_goals>` block but ALSO has the teaching addendum → R4 LEAN-gate bug. Check `harnessShape >= rich` guard in `buildFinancialContextBlock`.
- Prompt 2 missing `<open_goals>` entirely while Goal rows exist → engine-factory's open-goals query returning empty. Check the Prisma `findMany` filter (status='open' AND userId).
- Prompt 3 missing the teaching addendum → R4 RICH-gate too restrictive (probably accidentally gating on `harnessShape === 'rich'` instead of `>= 'rich'`).

---

### UC3 — LLM-initiated add-contact via inline form (R6)

**Setup.** Fresh chat session. The user does NOT have a contact named "Mom" (cleaned in pre-eval setup). The user IS Google-authenticated with a wallet that owns at least $0.10 USDC (so the LLM has something to send).

**Run prompt.** `"Send $1 USDC to my mum."`

**Expected:**
- LLM thinking (visible in DevTools or in expanded thinking block): "user said 'mum' but no contact named 'Mom'/'Mum' exists; calling add_recipient to capture."
- LLM calls `add_recipient` with empty input or partial input (`{ name: 'Mum' }`).
- Engine emits `pending_input` with:
  - `toolName: 'add_recipient'`
  - `description: 'Add a new contact'`
  - `schema.fields[0].name === 'name'`, `kind === 'text'`
  - `schema.fields[1].name === 'identifier'`, **`kind === 'sui-recipient'`** ← R6 verification
- `[eval] pending_input { schema: { fields: [...] }, ... }` in console.
- The chat surface renders an inline form with two fields: "Nickname" + "Audric handle, SuiNS name, or wallet address".

**Submit the form.** Type `name = "Mom"` and `identifier = "mom.audric.sui"` (or any test SuiNS name you've registered for the dev account; if you don't have one, paste any 0x address). Click Submit.

**Expected post-submit:**
- The form collapses to the "Submitted" confirmation row.
- The chat continues with new SSE events. The LLM narrates: "Saved Mom — sending $1 now…" or similar.
- A `tool_result` for `add_recipient` appears in the network panel with `isError: false`.
- The DB has a new contact row:
  ```sql
  SELECT contacts FROM "UserPreferences" WHERE address = '0x4e127…480f';
  -- contacts JSON should now include { name: 'Mom', identifier: 'mom.audric.sui', resolvedAddress: '0x...', source: 'agent', ... }
  ```
- A subsequent `send_transfer` `pending_action` is yielded for the $1 send.

**Per-cell expectation table:**

| Cell | Model | LLM calls add_recipient? | pending_input.schema.fields[1].kind === 'sui-recipient'? | Form submit → contact persisted + send proceeds? |
|---|---|---|---|---|
| 3a | Sonnet | ⏳ | ⏳ | ⏳ |
| 3b | Haiku | ⏳ | ⏳ | ⏳ |

**FAIL signals:**
- LLM doesn't call `add_recipient` — instead asks "who do you mean by mum?" via free-text. → System-prompt teaching for `add_recipient` is too weak; tighten the tool description.
- LLM calls `send_transfer` directly with `recipient: 'mum'` (passing through unresolved) → tool description didn't gate on contact existence. Check the system prompt's contact-disambiguation rules.
- `pending_input.schema.fields[1].kind === 'address'` (the old name) → R6 wasn't fully landed in v0.1.3; engine still has the legacy kind. Should already be impossible by P9.6 — fail closed.
- Form submit returns 400 → JWT or rate-limit issue, not LLM. Check `/api/engine/resume-with-input` route logs.

---

## 4. Decision matrix on eval results

| Outcome | Action |
|---|---|
| All 6 cells PASS | ✅ **Close P9.5.** Capture results in `spec9-acceptance-yyyy-mm-dd.json` (template below). Append a P9.5 ✅ row to `audric-build-tracker.md`. Mark `spec/SPEC_9_AUDRIC_STORE_HARNESS.md` v0.1.3 as Closed. Delete the matching REMINDERS.md row. |
| Sonnet PASSES all 3, Haiku FAILS one | 🟡 **Ship Sonnet-only initially.** Document Haiku as "experimental for SPEC 9 features." Ship a follow-up prompt-tuning PR for Haiku. |
| Any UC FAILS on Sonnet | 🔴 **Don't close P9.5.** Diagnose the system-prompt drift (most likely cause). Ship a tightening PR; re-run that one UC's two cells. |
| Engine event missing entirely (e.g. no `pending_input` ever fires) | 🔴 **P9.6 wiring bug.** Check `engine-factory.ts` `addRecipientTool` registration; check `inputValidation: true` on guard config; check `applyToolFlags`. |

---

## 5. Acceptance artifact template

After all 6 cells PASS, capture results as JSON and commit:

```json
{
  "spec": "SPEC 9 v0.1.3 P9.5",
  "ranAt": "2026-MM-DDTHH:MM:SSZ",
  "engineVersion": "1.18.0",
  "audricCommit": "<sha>",
  "wallet": "0x4e127…480f",
  "cells": {
    "uc1_sonnet": { "prompt1_proactive": "PASS|FAIL", "prompt2_cooldown": "PASS|FAIL", "notes": "" },
    "uc1_haiku":  { "prompt1_proactive": "PASS|FAIL", "prompt2_cooldown": "PASS|FAIL", "notes": "" },
    "uc2_sonnet": { "prompt1_persist": "PASS|FAIL", "prompt2_lean_gate": "PASS|FAIL", "prompt3_rich_gate": "PASS|FAIL", "notes": "" },
    "uc2_haiku":  { "prompt1_persist": "PASS|FAIL", "prompt2_lean_gate": "PASS|FAIL", "prompt3_rich_gate": "PASS|FAIL", "notes": "" },
    "uc3_sonnet": { "calls_add_recipient": "PASS|FAIL", "kind_sui_recipient": "PASS|FAIL", "form_submit_persists": "PASS|FAIL", "notes": "" },
    "uc3_haiku":  { "calls_add_recipient": "PASS|FAIL", "kind_sui_recipient": "PASS|FAIL", "form_submit_persists": "PASS|FAIL", "notes": "" }
  },
  "scriptedEvalPassedAt": "2026-05-05T03:28:00Z",
  "scriptedEvalCommit": "<engine sha>",
  "scriptedTestFile": "packages/engine/src/__tests__/spec9-canonical-eval.test.ts",
  "scriptedTestCount": 11
}
```

Commit path: `t2000/spec9-acceptance-2026-MM-DD.json` (alongside the existing `spec8-acceptance-*.json` artifacts).

---

## 6. Cross-references

- Spec — `spec/SPEC_9_AUDRIC_STORE_HARNESS.md` (v0.1.3 § Suggested sequencing P9.5)
- Scripted eval — `packages/engine/src/__tests__/spec9-canonical-eval.test.ts`
- Host R4 gate test — `audric/apps/web/lib/engine/__tests__/financial-context-block.test.ts`
- Host persist:true writer — `audric/apps/web/lib/engine/handle-persistent-todos.ts`
- Host pending_input renderer — `audric/apps/web/components/engine/timeline/PendingInputForm.tsx`
- Host resume route — `audric/apps/web/app/api/engine/resume-with-input/route.ts`
- Reminder row — `REMINDERS.md` "📅 post-P9.6 deploy day — SPEC 9 manual real-LLM smoke"
