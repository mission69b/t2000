# V07E_INVOICE_DEPRECATION — Invoice retires as a distinct product

> **Status**: DRAFT v0.1 — 2026-05-21 ~20:40 AEST (S.239 follow-up)
> **Author**: Agent under founder direction
> **Lock**: Pending founder review of 5 open questions (Q1–Q5 at bottom)
> **Scope class**: v0.7e Phase 1 cleanup (companion to apps/web archive)
> **Predecessor evidence**: S.190 (Phase 6 Session 4 audit), S.239 (apps/web rewrite removal — already shipped)

---

## 1. Why invoice dies

> *"i also believe we deicded to refactor our the invoice feature and just keep payment links."* — Founder, 2026-05-21

The decision was first surfaced and deferred in S.190 (2026-05-20):

> Founder surfaced mid-audit that **invoice deserves to die as a distinct product feature** (payment-link + invoice overlap ~95% — only differentiator is `dueDate`, which the product does nothing actionable with). Scope creep into Session 4 would touch 3+ packages... Splitting into "Session 4 = port Pay infra as-is" + "post-Phase-6 mini-SPEC = deprecate invoice as product feature" preserves audit-first discipline.

**The structural argument:**

| Capability | Payment link | Invoice |
|---|---|---|
| Mint a shareable pay URL | ✅ | ✅ |
| Amount in USDC | ✅ | ✅ |
| Label + memo | ✅ | ✅ |
| QR + wallet-pay | ✅ | ✅ |
| Track paid status | ✅ | ✅ |
| Cancel before paid | ✅ | ✅ |
| Set due date | ❌ | ✅ (but product never reminds, escalates, or charges late fees) |
| Line items breakdown | ❌ | ✅ (cosmetic — final invoice still pays a single USDC amount) |
| Recipient name/email | ❌ | ✅ (informational only — no reminder pipeline) |

**Net:** invoice = payment link + 6 unactioned metadata columns + a separate engine tool + a separate web-v2 component + a separate `type='invoice'` value. ~95% redundant code; 5% (the metadata) is product debt that was never finished.

**Strategic alignment:** Founder's "consider the vercel ai patterns / chatbot template patterns" framing — the web-v2 chatbot template doesn't carry invoice union cases. Forking PayClient into a payment-link branch + invoice branch is the kind of non-template complexity that v0.7e is supposed to retire.

---

## 2. Surface inventory (what carries invoice today)

### 2.1 Already cleaned up (no action needed)
- ✅ `apps/web/next.config.ts` `/invoice/:slug → web-v2/pay/:slug` rewrite — **deleted S.239 (2026-05-21)**
- ✅ `apps/web/app/invoice/[slug]/page.tsx` — deleted S.238 (2026-05-21 ~17:00 AEST)

### 2.2 Engine tools (3 deletions in `packages/engine/src/tools/receive.ts`)

The file currently exports 5 tools — 2 payment-link (KEEP) + 3 invoice (DELETE):

| Tool | Action | LoC delta |
|---|---|---|
| `createPaymentLinkTool` | KEEP | 0 |
| `listPaymentLinksTool` | KEEP | 0 |
| `cancelPaymentLinkTool` | KEEP | 0 |
| `createInvoiceTool` | **DELETE** | -47 |
| `listInvoicesTool` | **DELETE** | -33 |
| `cancelInvoiceTool` | **DELETE** | -38 |
| `InvoiceSchema` Zod schema | **DELETE** | -12 |
| Total engine LoC | | ~-130 |

**Dependents to update:**
- `packages/engine/src/tool-flags.ts` — remove invoice tool flags
- `packages/engine/src/v2/tool-policy.ts` — remove invoice from tool policy map
- `packages/engine/src/__tests__/receive.test.ts` — drop invoice test cases (keep payment-link cases)
- `CLAUDE.md` engine tool count + tool list (drop 3 from "Read 25" → "Read 22"; or 22 if invoice counts toward something else — verify count at ship)

### 2.3 web-v2 surface (3 files touched)

| File | Action |
|---|---|
| `apps/web-v2/components/pay/invoice-header.tsx` | **DELETE entire file** (147 LoC) |
| `apps/web-v2/components/pay/pay-client.tsx` | Remove invoice union case (line items render, dueDate render, isInvoice branch) — est. ~80 LoC out of 532 |
| `apps/web-v2/app/pay/[slug]/page.tsx` | Remove invoice union case from server-side branching — est. ~30 LoC |
| `apps/web-v2/app/api/payments/[slug]/route.ts` | GET handler currently returns invoice rows for type=invoice slugs; after Prisma cleanup these rows are gone, but defensive: return 404 for any `type !== 'link'` row found during transition |

### 2.4 audric apps/web LIVE side (not zombie)

> Note: `apps/web/app/api/payments/route.ts` LIST is still live — was deferred from S.238 because `PayPanel` in `/new` dashboard consumes it. After invoice deprecation, the LIST handler shape doesn't need to change (it filters by `type` param already, payment-link callers pass `type=link`). Just make sure: NO invoice rows exist in DB before flipping the v2 PayClient to drop the invoice branch.

| File | Action |
|---|---|
| `apps/web/app/api/payments/route.ts` LIST handler | Tighten: reject `?type=invoice` with 410 Gone after migration ships |
| `apps/web/app/api/internal/payments/route.ts` POST handler | Tighten: reject `type=invoice` in body with 410 Gone after migration ships |
| `apps/web/components/engine/cards/InvoiceCard.tsx` + tests | DELETE (147 LoC + 65 LoC test) — but verify this isn't already orphaned in apps/web (chat-shell may render it via FeedRenderer); if it's referenced, delete with chat-shell instead |

### 2.5 Prisma schema (`apps/web/prisma/schema.prisma`)

Current `Payment` model (lines 148-187) carries 6 invoice-specific columns + 1 invoice-specific index:

```prisma
// Invoice-specific (optional, ignored for type=link)
lineItems      Json?
dueDate        DateTime?
recipientName  String?
recipientEmail String?
sentAt         DateTime?
reminderSentAt DateTime?

@@index([dueDate, status])
```

**Migration plan** (`prisma/migrations/YYYYMMDDhhmm_drop_invoice_columns/migration.sql`):

```sql
-- Phase A: archive type='invoice' rows to a soft-deleted table for ~30 days
-- (or drop immediately if Q4 answers "no data to preserve")
CREATE TABLE "PaymentInvoiceArchive" AS
  SELECT * FROM "Payment" WHERE type = 'invoice';

-- Phase B: delete invoice rows from live Payment table
DELETE FROM "Payment" WHERE type = 'invoice';

-- Phase C: drop invoice-only columns + index
ALTER TABLE "Payment" DROP COLUMN "lineItems";
ALTER TABLE "Payment" DROP COLUMN "dueDate";
ALTER TABLE "Payment" DROP COLUMN "recipientName";
ALTER TABLE "Payment" DROP COLUMN "recipientEmail";
ALTER TABLE "Payment" DROP COLUMN "sentAt";
ALTER TABLE "Payment" DROP COLUMN "reminderSentAt";

DROP INDEX "Payment_dueDate_status_idx";

-- Phase D: tighten the `type` column to a CHECK constraint (Prisma doesn't
-- enum-natively in PostgreSQL String fields, but we can add a check)
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_type_link_only"
  CHECK ("type" = 'link');
```

Plus the Prisma schema update:

```prisma
model Payment {
  // ...kept fields...
  type       String  @default("link")  // Now always "link"; CHECK constraint enforces
  // ...
  // (removed: lineItems, dueDate, recipientName, recipientEmail, sentAt, reminderSentAt, @@index([dueDate, status]))
}
```

### 2.6 System prompt (`apps/web/lib/engine/engine-factory.ts` line 1220)

Current prompt mentions invoice as a product capability:

> *"Audric Pay (move money — send USDC, receive via payment links / invoices / QR — free, global, instant on Sui)"*
> *"Operation→product mapping: ... send, receive, payment-link, invoice, QR → Audric Pay."*

After deprecation: drop `invoices` and `invoice` from these sentences. Update CLAUDE.md `Audric Pay` description to match.

### 2.7 Documentation

- `CLAUDE.md` — Audric Pay description, engine tool count (Read 25 → 22 if invoice tools are in the Read group; verify per `defineTool.isReadOnly` flag at ship), engine tool list
- `audric-build-tracker.md` — stamp S.NNN entry when invoice deprecation ships
- `HANDOFF_NEXT_AGENT.md` — close out invoice-deprecation task

### 2.8 Out of scope (intentional)

- `@mysten/payment-kit` dependency — used by both payment-link AND web-v2 invoice QR flow; KEEP (still needed for payment links)
- `lib/sui-pay-uri.ts` — payment URI builder used by both; KEEP
- DB rows with `type='link'` AND invoice-specific columns populated (legacy mis-typed rows) — defensive: query before migration; if any found, decide row-by-row

---

## 3. Phased shipment plan

5 phases. Each phase is independently revertable. Ship phase-by-phase, not all at once.

### Phase 1 — Engine tool deletion (~1h)
**Goal:** Remove invoice from the agent's vocabulary. Agent stops being able to create/list/cancel invoices. Existing invoice DB rows stay readable via direct URL (still rendered by web-v2 in invoice union case).

- Delete 3 tool exports + `InvoiceSchema` from `receive.ts`
- Remove invoice entries from `tool-flags.ts` + `tool-policy.ts`
- Drop invoice test cases from `receive.test.ts`
- Update `CLAUDE.md` engine tool count + list
- Bump `@t2000/engine` to next minor (or patch — see Q3 for versioning call)
- Update audric/apps/web + apps/web-v2 to pull new engine version

**Smoke:** Ask the chat "create an invoice for $100" — agent should NOT call the tool (it's gone); should respond with payment-link offer instead or say invoices aren't supported.

### Phase 2 — System prompt update (~10 min)
**Goal:** Remove invoice from agent's self-description so it doesn't promise capabilities it can't deliver.

- Edit `apps/web/lib/engine/engine-factory.ts` line 1220 system prompt
- Edit web-v2 system prompt builder if it has its own
- Edit `CLAUDE.md` Audric Pay product description

**Smoke:** Ask "what can Audric Pay do?" — response should mention payment links + send USDC + QR, NOT invoices.

### Phase 3 — web-v2 UI cleanup (~1.5h)
**Goal:** Remove invoice-union-case rendering from web-v2's pay surface. After this, any remaining invoice DB rows render as payment links (graceful degradation — line items + due date disappear from UI).

- Delete `apps/web-v2/components/pay/invoice-header.tsx`
- Remove invoice branch from `pay-client.tsx` (isInvoice conditional + line items + dueDate)
- Remove invoice branch from `app/pay/[slug]/page.tsx`
- Update `app/api/payments/[slug]/route.ts` GET to return only payment-link fields (defensive — drop invoice fields from response shape even if Prisma still has them pre-migration)

**Smoke:**
- Visit a known `type='link'` payment URL → pays normally
- Visit a known `type='invoice'` payment URL (if any test rows exist) → renders as payment link with no line items / no due date (graceful)

### Phase 4 — apps/web internal-API tightening (~30 min)
**Goal:** Reject any remaining invoice writes at the API layer.

- `apps/web/app/api/internal/payments/route.ts` POST: reject `type === 'invoice'` with 410 Gone + message *"Invoices have been deprecated — use payment links instead."*
- `apps/web/app/api/payments/route.ts` LIST: same rejection for `?type=invoice` filter
- (Optional) delete `apps/web/components/engine/cards/InvoiceCard.tsx` + test — verify orphaning first; if chat-shell still imports, defer to chat-shell deletion

**Smoke:** `curl -X POST /api/internal/payments` with `type=invoice` → 410 Gone

### Phase 5 — Prisma migration + DB cleanup (~45 min, founder-supervised)
**Goal:** Drop invoice rows + columns + index from the live DB. Final structural cleanup.

- Pre-flight: `SELECT COUNT(*) FROM "Payment" WHERE type = 'invoice'` — confirm count
- Per Q4 answer: archive to `PaymentInvoiceArchive` OR drop directly
- Drop 6 invoice columns + invoice index
- Add CHECK constraint `type = 'link'`
- Run `prisma migrate dev` locally to verify, then `prisma migrate deploy` to prod
- Verify all read paths still work (PayPanel LIST, /pay/:slug GET)

**Smoke:** Full Pay flow end-to-end on production after migration applies.

---

## 4. Risks + mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | Live invoice URLs in the wild (clients have bookmarked `audric.ai/pay/INVOICE_SLUG`) — they'll render degraded after Phase 3 | After Phase 5, those slugs are gone from DB → 404. Acceptable: invoice product is dead; users get a clean 404 not a confusing partial render. |
| R2 | Engine deletion (Phase 1) ships before audric/web-v2 picks up new engine version → agent still has invoice tools in prod for a window | Coordinate: Phase 1 = engine release; web-v2 + audric web pull same hour. Smoke immediately. |
| R3 | Chat-shell (`apps/web/components/engine/cards/InvoiceCard.tsx`) still imports invoice card in dashboard `FeedRenderer.tsx` — deletion orphans render path | Verify before delete: `rg "InvoiceCard" apps/web/`. If chat-shell uses it, defer InvoiceCard delete to chat-shell deletion (Phase 2 of v0.7e). The engine no longer producing invoice cards means dead code without dead reference. |
| R4 | Existing `type='invoice'` rows with paid status (real money already received) — losing them is operationally bad | Phase 5 archive table (`PaymentInvoiceArchive`) preserves the data for ~30 days. Phase 5 verify step: count + dollar sum of paid invoices before drop. |
| R5 | Customer asks "where's my invoice feature?" post-deprecation | Marketing copy update + in-app: "Payment links cover this use case — set memo to invoice number." (Out of scope for this SPEC; flag to founder.) |
| R6 | Engine version bump breaks audric or web-v2 (compat test gap) | Each phase is independently revertable; revert engine version if Phase 1 ship surfaces breakage. |

---

## 5. Test plan

### 5.1 Engine (Phase 1)
- `receive.test.ts` — payment-link tests pass, invoice tests deleted
- `tool-policy.test.ts` — payment-link tools listed, invoice tools absent
- `engine-factory.test.ts` (audric/web-v2) — `tools.length` matches expected post-deprecation count
- Manual: chat ask "create an invoice" → response is graceful refusal or payment-link offer

### 5.2 web-v2 (Phase 3)
- `pay-client.test.tsx` — payment-link render path passes; invoice render path tests deleted
- `app/pay/[slug]/page.test.tsx` — server render works for type=link
- Manual: visit a live payment link URL → renders correctly
- Manual: visit a test type=invoice URL pre-migration → renders as degraded payment link (no line items, no due date)

### 5.3 Prisma (Phase 5)
- `prisma migrate dev` locally → migration applies, schema validates
- Pre-prod: dump `Payment` schema, run migration, verify columns dropped
- Post-prod: `SELECT * FROM "Payment" WHERE type != 'link'` → 0 rows
- Post-prod: `SELECT * FROM "PaymentInvoiceArchive"` → matches pre-prod count

### 5.4 Cross-cutting
- `pnpm --filter @t2000/engine test` → all green
- `pnpm --filter audric/web test` → all green
- `pnpm --filter audric/web-v2 test` → all green
- E2E: full payment-link create → pay → settle on testnet

---

## 6. Open questions for founder lock (Q1–Q5)

### Q1 — Sequencing relative to v0.7e Phase 2 (chat-shell deletion)
Should invoice deprecation ship BEFORE, ALONGSIDE, or AFTER v0.7e Phase 2?
- **BEFORE (recommended)**: Clean break; chat-shell deletion no longer has to think about invoice tools or cards.
- **ALONGSIDE**: Single combined ship; risk of larger surface in one PR.
- **AFTER**: Invoice surface lives until chat-shell dies; defers the structural cleanup but reduces inter-phase coordination.

### Q2 — DB row preservation
Q4 in §2.5 — do we ARCHIVE `type='invoice'` rows to `PaymentInvoiceArchive` before deletion, or DELETE directly?
- ARCHIVE: 30-day window to recover; small DB cost.
- DELETE: clean break; no recovery; smallest cleanup.

### Q3 — Engine version bump
Is `removeInvoiceTools` a MINOR bump (new feature: smaller tool set) or PATCH (no public API change for callers using just `createEngine()`)?
- MINOR (recommended): tool surface IS the engine's public API; removing tools is a behavior change downstream consumers must opt into via version bump.
- PATCH: if no external `@t2000/engine` consumer outside audric exists yet, the tool-removal is internal. (Check: any other engine consumer?)

### Q4 — Marketing/docs handling
After deprecation, do we keep "invoices" anywhere in product copy (e.g. README, landing page) as a "coming back later" promise, or wipe entirely?
- WIPE (recommended): payment links cover the use case; carrying an "invoices coming soon" promise is product debt.
- KEEP as roadmap: signals intent but creates expectation.

### Q5 — When can apps/web LIST endpoint reject type=invoice?
Phase 4 tightens `/api/payments?type=invoice` and `/api/internal/payments POST type=invoice` to 410 Gone. Can this ship same-day as Phase 3, or does Phase 4 wait for Phase 5 (DB rows actually gone)?
- SAME-DAY (recommended): after engine tools are gone (Phase 1) + UI no longer creates invoices (Phase 3), no legitimate caller exists. 410 is correct response from that point.
- WAIT-FOR-PHASE-5: defers structural enforcement until data is also gone.

---

## 7. Out-of-band notes for the next agent

- **The S.190 founder framing is the SSOT** — this SPEC is just operationalizing that decision. Don't re-litigate the "should invoice die?" question; founder already locked it.
- **Engine tool deletion is the LIFTING action** — it removes invoice from the agent's vocabulary, which is the highest-leverage change. The DB cleanup is data hygiene; the UI cleanup is code hygiene; the engine cleanup is *capability* removal.
- **Pre-flight before Phase 5**: count + dollar-sum existing `type='invoice'` rows. Founder needs to approve the delete-vs-archive call (Q2) with real numbers in front of them, not abstractly.
- **Don't fold this into v0.7e Phase 2** unless founder explicitly says to. The audit-first discipline pattern (see S.190, S.222, S.238) says: cross-cutting changes that touch engine + DB + UI deserve their own SPEC + their own ship cadence.

---

## 8. Cross-references

- **S.190** (2026-05-20) — `audric-build-tracker.md` — original founder framing of invoice deprecation
- **S.238** (2026-05-21) — `audric-build-tracker.md` — v0.7e Phase 1A Batch 2 (incorrectly preserved invoice via rewrite cutover)
- **S.239** (2026-05-21) — `audric-build-tracker.md` — apps/web `/invoice/:slug` rewrite REMOVED (this SPEC's predecessor commit)
- `spec/active/BENEFITS_SPEC_v07e.md` — parent v0.7e structural migration SPEC
- `spec/active/V07E_PHASE_1_EXECUTION_PLAN.md` — Phase 1 execution; invoice deprecation slots between Phase 1A (apps/web cutover, shipped) and Phase 1B (chat-shell prep)
- `packages/engine/src/tools/receive.ts` — engine source for tool deletes (Phase 1)
- `apps/web/prisma/schema.prisma` line 148-187 — Prisma `Payment` model (Phase 5)
- `apps/web-v2/components/pay/invoice-header.tsx` — UI delete target (Phase 3)
- `apps/web/lib/engine/engine-factory.ts` line 1220 — system prompt edit (Phase 2)
- `CLAUDE.md` — Audric Pay product description + engine tool list (Phase 2 + Phase 1 docs)

---

**END V07E_INVOICE_DEPRECATION v0.1 DRAFT**
