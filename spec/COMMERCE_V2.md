# Commerce v2 — Pepesto + Gift Card Removal

> Remove Reloadly gift cards (risk + complexity). Add Pepesto recipe/grocery integration for EU users. Expose as MPP services for all agents.

**Status:** Planned
**Depends on:** Gateway v2 (shipped), Deliver-first pattern (shipped)
**Effort:** ~1.5 weeks
**Spec:** `spec/COMMERCE_V2.md`

---

## Why Remove Gift Cards

### The risk is real

The deliver-first pattern for Reloadly creates financial exposure:

1. **We buy the gift card BEFORE the user pays** — if they never sign the MPP transaction, we've spent money and can't recover it
2. **No idempotency** — network timeouts can trigger duplicate Reloadly orders
3. **Retry route targets wrong pipeline** — `/order` (legacy MPP) instead of `/order-internal` (deliver-first), risking double-orders
4. **No `fetchWithRetry`** on `order-internal` — a single Reloadly timeout kills the transaction
5. **v1 vs v2 API headers mixed** in one handler — fragile, hard to debug

### The UX is bad

User says "I want pizza" → gets a gift card code → has to leave t2000 → open Uber Eats → redeem code → then order. That's not a product feature, it's a workaround.

### The codebase cost is high

36 files across gateway, web-app, marketing site, MCP, skills, scripts, and docs. All for a feature one person complained about and nobody loves.

### The long-term path doesn't include gift cards

The spending endgame is **USDC → fiat at point of sale** via Stripe/Bridge or similar infrastructure. When stablecoin payment rails are production-ready, users spend USDC directly at any merchant. Gift cards are a temporary bridge to a bridge — not worth maintaining.

### Decision: Remove now

Don't freeze, don't improve. Remove. The risk alone justifies it, and the engineering time saved pays for the Pepesto integration.

---

## What We're Building: Pepesto

### Why Pepesto works

Pepesto is the one integration where the full chain is differentiated from ChatGPT:

```
ChatGPT:   "Here's a recipe for pizza" (text)
t2000:     "Here's a recipe for pizza" → real ingredients at Tesco → checkout → cooking coaching
```

Without grocery checkout, recipe search is just another LLM feature. Pepesto gives us the checkout in 11 European countries across 25 supermarket chains. That's the differentiator.

### Two-layer value

**For t2000 users (EU):** Full flow — recipe → real products → checkout → cooking coaching
**For MPP ecosystem (global):** Recipe search + grocery matching as MPP services any agent can call

```
MPP endpoints (available to all agents):
  mpp.t2000.ai/pepesto/v1/suggest   →  recipe search         $0.005
  mpp.t2000.ai/pepesto/v1/parse     →  URL/text → recipe     $0.005
  mpp.t2000.ai/pepesto/v1/products  →  ingredients → products $0.005
  mpp.t2000.ai/pepesto/v1/session   →  checkout session       $0.005
  mpp.t2000.ai/pepesto/v1/oneshot   →  all-in-one             $0.005
```

### Coverage

**Pepesto Grocery:** UK (Tesco, Sainsbury's, Waitrose, Asda, Morrisons), Ireland (Tesco IE, Dunnes, SuperValu), Netherlands (Albert Heijn, Jumbo, Plus), Belgium (Colruyt, Delhaize), Switzerland (Migros, Coop, Aldi, Farmy), Germany (REWE), Spain (Carrefour), Italy (Esselunga, Conad), Poland (Frisco, Auchan), Bulgaria (eBag, Bulmag), Denmark (Nemlig).

**Pepesto Recipes:** Global — 1M+ recipes, parse any URL/text/image, dietary filtering.

### What non-EU users see

The AI is honest:

> "Grocery ordering is available in Europe right now. I can still find you a recipe and walk you through cooking it, but for ordering ingredients I'd recommend [local delivery service]."

No fake value. No affiliate link wrapping. Just recipes + cooking coaching (which the AI does natively anyway).

---

## User Flows (EU only for grocery, global for recipes)

### Flow 1: "What should I make for dinner?"
```
User: "Something healthy, 30 minutes"
  → AI calls search_recipes (Pepesto /suggest)
  → Shows 3 recipe cards with time, calories, diet tags
  → User taps [ Order Ingredients ]
  → AI calls order_groceries (Pepesto /products + /session)
  → Shows grocery card: Tesco, 7 items, £12.40
  → User taps [ Complete Order on Tesco ↗ ]
  → After groceries arrive: AI walks through cooking steps
```

### Flow 2: "Make this recipe" (URL or image)
```
User: pastes TikTok/Instagram/blog URL
  → AI calls parse_recipe (Pepesto /parse)
  → Shows parsed recipe card
  → [ Order Ingredients ] → grocery cart → checkout
```
**Note:** Image parsing requires Phase 21 (image upload). URL + text works immediately.

### Flow 3: "Buy milk, eggs, bread"
```
User: types grocery list
  → AI calls order_groceries (Pepesto /oneshot)
  → Shows matched products from local supermarket with prices
  → [ Complete Order ↗ ]
```

### Flow 4: "What can I make with chicken and rice?"
```
User: lists what they have
  → AI calls search_recipes with ingredients_on_hand
  → Shows matching recipes
  → [ Order Missing Items ] → only the gap gets ordered
```

### Flow 5: "Walk me through cooking it"
```
User: "My groceries arrived, help me cook"
  → AI shows step-by-step instructions
  → User asks "what does simmer mean?" → AI explains
  → Works globally (no grocery checkout needed)
```

### What makes this different from ChatGPT

| ChatGPT | t2000 |
|---------|-------|
| "Here's a recipe" (text) | Recipe card with nutrition, time, servings |
| "Go buy these ingredients" | Real products at your local Tesco with prices |
| No ordering | One tap → supermarket checkout |
| Forgets your preferences | Remembers dietary needs, preferred store |
| No cooking help after | Step-by-step coaching with Q&A |

The gap is narrow for recipe-only. The gap is massive when ordering works.

---

## Payment Model

### Phase 2 (now): Checkout redirect

User taps [ Complete Order on Tesco ↗ ] → pays fiat on supermarket site. We earn MPP fees on recipe search and product matching.

This is still a context switch (user leaves t2000 to pay). But unlike gift cards, the AI did the hard work — recipe discovery, ingredient matching, cart building. The checkout is the only manual step.

### Future: USDC spending (updated Feb 2026)

The real endgame isn't Tier 2 (pay-on-behalf with corporate cards). It's **USDC → fiat at point of sale**:

- **Stripe Machine Payments (live):** Stripe now accepts MPP/x402 payments on Base, Solana, Tempo, and card networks. Merchants get fiat in their Stripe balance. Microtransactions from $0.01 USDC. Not on Sui yet — monitor.
- **Stripe Issuing for Agents (live):** Dedicated product for agent card issuance — single-use virtual Visa with MCC restrictions, real-time authorization webhooks, and spending controls. See Phase 20b in roadmap.
- **Shared Payment Tokens (SPTs):** New MPP payment method — agents pay with cards/wallets through MPP without on-chain crypto. Bridges fiat and crypto rails.
- **Stripe/Bridge:** Stripe acquired Bridge for stablecoin payments. When GA, USDC settles to fiat at any Stripe-connected merchant.
- **Visa + Stripe + Tempo (Mar 2026):** Visa formally partnered on MPP. Card-based MPP spec + SDK. OpenAI, Mastercard, Anthropic, Shopify already integrated.

**Competitive validation:** Agentic wallet demos on Base have shown USDC → virtual Visa → UberEats food ordering via browser automation (Browserbase/Stagehand). The UX is proven. Browser automation is fragile at scale, but the virtual card model is sound.

**Key constraint:** Stripe machine payments support Base, Solana, Tempo — not Sui. Bridging or SPTs needed until Sui is added.

When Stripe USDC settlement is GA, the flow becomes:
```
User: "Order ingredients"
  → AI builds cart
  → [ Pay £12.40 with USDC ]
  → Stripe converts USDC → GBP → Tesco
  → No redirect, no context switch
```

We don't need to build pay-on-behalf infrastructure. The payment rails are being built by Stripe, Visa, and Tempo. We just need to be ready to plug in. See Phase 20b in the roadmap for the virtual card path that ships before full USDC settlement.

---

## Integration Design

### Gateway Routes (5 endpoints)

| Route | Pepesto Endpoint | Price | Scope |
|-------|-----------------|-------|-------|
| `/pepesto/v1/suggest` | `POST /api/suggest` | $0.005 | Global — recipe search |
| `/pepesto/v1/parse` | `POST /api/parse` | $0.005 | Global — parse URL/text/image |
| `/pepesto/v1/oneshot` | `POST /api/oneshot` | $0.005 | EU — parse + match + session |
| `/pepesto/v1/products` | `POST /api/products` | $0.005 | EU — match ingredients to products |
| `/pepesto/v1/session` | `POST /api/session` | dynamic | EU — create checkout session |

### Agent Tools (4 tools)

```
search_recipes
  Input: query, dietary_tags[], max_time_minutes, ingredients_on_hand[]
  Returns: recipe list with structured data
  Renders: <<recipe>> card
  Provider: Pepesto /suggest (global)

parse_recipe
  Input: url | text | image_url
  Returns: structured recipe
  Renders: <<recipe>> card
  Provider: Pepesto /parse (global)
  Note: image input requires Phase 21

order_groceries
  Input: items[] (from recipe or free text), region (auto-detected)
  Returns: matched products with prices + checkout URL
  Renders: <<grocery>> card
  Provider: Pepesto /products + /session (EU only)
  Non-EU: returns "not available in your region" with local alternatives

get_recipe_steps
  Input: recipe_id
  Returns: step-by-step instructions
  Renders: <<recipe-step>> card (or inline chat)
  Provider: Pepesto recipe data (global)
```

### Render Cards (3 new types)

| Card | What it shows |
|------|--------------|
| `<<recipe>>` | Title, time, calories, diet tags, ingredients, [ View Recipe ] + [ Order Ingredients ] |
| `<<grocery>>` | Store name, items, prices, total, [ Complete Order ↗ ] |
| `<<recipe-step>>` | Step number, instruction, timing, tips, [ Next Step → ] |

### User Preferences

| Setting | Source | Stored in |
|---------|--------|-----------|
| Country | Existing timezone/locale detection | Already exists |
| Preferred supermarket (EU) | Ask on first grocery order or suggest default by country | User profile |
| Dietary preferences | Ask on first recipe request or set in settings | User profile |

---

## Gift Card Removal — Full File Audit

> 36 files across 8 areas. 6 deleted entirely, ~30 edited.

### Gateway (`apps/gateway/`) — DELETE or EDIT

| File | Action | What |
|------|--------|------|
| `app/reloadly/v1/products/route.ts` | **Delete** | Browse products endpoint |
| `app/reloadly/v1/order/route.ts` | **Delete** | Legacy MPP 402 order endpoint |
| `app/reloadly/v1/order-internal/route.ts` | **Delete** | Deliver-first order endpoint |
| `lib/reloadly.ts` | **Delete** | Token management, headers, URL builder |
| `lib/services.ts` | **Edit** | Remove Reloadly service registration |
| `public/logos/reloadly.svg` | **Delete** | Logo asset |
| `app/components/TerminalDemo.tsx` | **Edit** | Remove Reloadly example |
| `app/llms.txt/route.ts` | **Edit** | Remove gift card reference |
| `app/services/page.tsx` | **Edit** | Remove gift card example |

### Web-app (`apps/web-app/`) — EDIT

| File | Action | What |
|------|--------|------|
| `lib/agent-tools.ts` | **Edit** | Remove `browse_gift_cards` + `buy_gift_card` tools, system prompt instructions |
| `lib/service-gateway.ts` | **Edit** | Remove `reloadly-giftcard`, `reloadly-browse` mappings |
| `lib/service-pricing.ts` | **Edit** | Remove `GIFT_CARD_FEE_RATE`, `giftCardPrice` |
| `lib/service-catalog.ts` | **Edit** | Remove `gift-cards` category |
| `components/dashboard/AgentMarkdown.tsx` | **Edit** | Remove `GiftCardVisual`, `<<giftcard>>` parser |
| `components/dashboard/FeedRenderer.tsx` | **Edit** | Remove gift card step labels |
| `lib/contextual-chips.ts` | **Edit** | Remove gift card chips |
| `app/api/services/prepare/route.ts` | **Edit** | Remove Reloadly-specific logic (keep generic deliver-first) |
| `app/api/services/complete/route.ts` | **Edit** | Remove `reloadly-giftcard` mapping |
| `app/dashboard/page.tsx` | **Edit** | Remove "buy gift cards" onboarding copy |
| `app/api/llm/route.ts` | **Edit** | Remove gift cards from services line |
| `hooks/useAgentLoop.test.ts` | **Edit** | Remove gift card tool tests |
| `lib/agent-tools.test.ts` | **Edit** | Remove gift card tests |
| `lib/intent-parser.test.ts` | **Edit** | Remove gift card intent test |

### Marketing site (`apps/web/`) — EDIT

| File | Action | What |
|------|--------|------|
| `app/docs/page.tsx` | **Edit** | Remove Reloadly docs, gift card sections |
| `app/page.tsx` | **Edit** | Remove "Reloadly" partner row, "800+ gift cards" |
| `app/terms/page.tsx` | **Edit** | Remove gift card clause |
| `app/privacy/page.tsx` | **Edit** | Remove Reloadly mention |
| `app/disclaimer/page.tsx` | **Edit** | Remove gift card disclaimer |
| `app/app/page.tsx` | **Edit** | Remove gift card copy |

### MCP + Skills + Scripts

| File | Action | What |
|------|--------|------|
| `packages/mcp/src/tools/write.ts` | **Edit** | Remove Reloadly gift card block |
| `packages/mcp/src/tools/read.ts` | **Edit** | Remove gift card references |
| `t2000-skills/skills/t2000-pay/SKILL.md` | **Edit** | Remove Reloadly table |
| `scripts/audit-gift-cards.ts` | **Delete** | Entire audit script |

### Root + Marketing docs

| File | Action | What |
|------|--------|------|
| `README.md` | **Edit** | Remove Reloadly from service list |
| `ARCHITECTURE.md` | **Edit** | Remove Reloadly row |
| `marketing/x-article.md` | **Edit** | Remove gift card references |
| `marketing/rollout-plan.md` | **Edit** | Remove gift card day |
| `marketing/demo-script.md` | **Edit** | Remove gift card demo |
| `marketing/mysten-strategy.md` | **Edit** | Remove Reloadly reference |
| `marketing/marketing-plan.md` | **Edit** | Remove Reloadly from list |

### Environment variables — Remove from Vercel

- `RELOADLY_CLIENT_ID`
- `RELOADLY_CLIENT_SECRET`
- `RELOADLY_SANDBOX`

### What stays

- **Deliver-first pattern** — used by Printful and Lob, reusable for Pepesto
- **Generic service gateway** — `chargeCustom`, `fetchWithRetry`, `x-internal-key`
- **SponsorLog records** — historical payment logs stay as-is
- **SERVICES_ROADMAP.md** — remove "Phone top-up via Reloadly Airtime" (dropping the entire Reloadly relationship)

---

## Implementation Plan

### Phase 1: Gift Card Removal — 2-3 days

| Step | What | Files |
|------|------|-------|
| 1 | Delete Reloadly gateway routes + lib + logo | 5 files deleted |
| 2 | Remove service registration | `gateway/lib/services.ts` |
| 3 | Edit gateway UI references | 3 files |
| 4 | Remove web-app tools, mappings, pricing, catalog, chips | 7 files |
| 5 | Remove web-app UI (AgentMarkdown, FeedRenderer, dashboard copy) | 4 files |
| 6 | Remove Reloadly from prepare/complete (keep generic deliver-first) | 2 files |
| 7 | Update tests | 3 files |
| 8 | Update marketing site | 6 files |
| 9 | Update MCP + skills, delete audit script | 4 files |
| 10 | Update root + marketing docs | 7 files |
| 11 | Remove Vercel env vars | 3 vars |
| 12 | `npm run lint && npm run typecheck` | Both apps |
| 13 | Deploy | Vercel |

### Phase 2: Pepesto Integration — 1-1.5 weeks

| Step | What | Effort |
|------|------|--------|
| 1 | Sign up for Pepesto, email for 70% discount | External |
| 2 | Add `PEPESTO_API_KEY` to Vercel | Config |
| 3 | Build 5 gateway routes | 2-3 days |
| 4 | Build 4 agent tools with regional routing | 2-3 days |
| 5 | Build 3 render cards (`<<recipe>>`, `<<grocery>>`, `<<recipe-step>>`) | 2-3 days |
| 6 | Add supermarket preference + dietary preferences to profile | 1 day |
| 7 | Update system prompt, contextual chips, feed labels | 1 day |
| 8 | Update MCP + skills with new tools | 0.5 day |
| 9 | Update marketing site + docs with grocery features | 0.5 day |

### Future (not scheduled)

| What | When |
|------|------|
| Virtual card via Stripe Issuing for Agents (Phase 20b) | After Pepesto ships — Stripe Issuing application + entity onboarding needed |
| USDC → fiat settlement via Stripe/Bridge | When Stripe stablecoin settlement is GA |
| Stripe machine payments on Sui | Monitor — Stripe Crypto Onramp already supports Sui; machine payments TBD |
| Restaurant delivery (browser automation) | When Browserbase/Stagehand + virtual card flow is stable enough for production |
| More grocery regions | When demand in EU is proven |

---

## Edge Cases

| Edge case | Mitigation |
|-----------|------------|
| Users asking for gift cards | System prompt: "You do NOT have gift card capabilities." AI suggests alternatives |
| Historical `SponsorLog` records with `service: 'reloadly'` | Leave as-is — historical records, don't migrate |
| MCP/CLI users with cached tool descriptions | Bump MCP version, publish to npm |
| Deliver-first pattern shared with Printful/Lob | Only remove Reloadly branches, grep for `reloadly` not `deliverFirst` |
| Pepesto downtime | Graceful fallback: "Recipe service temporarily unavailable" |
| User in EU but Pepesto doesn't cover their country | AI: "Grocery ordering covers [list of countries]. Yours isn't supported yet." |
| Phase 21 not shipped (image parse unavailable) | `parse_recipe` works with URLs and text. Image support noted as "coming soon" |

---

## Open Questions

| Question | Leaning |
|----------|---------|
| Pepesto pricing? | $0.005 per MPP call (pass through Pepesto cost + small margin) |
| Remove Reloadly Airtime from SERVICES_ROADMAP? | Yes — dropping entire Reloadly relationship |
| Phase 21 before or parallel with Pepesto? | Parallel if possible — image→recipe is a strong demo but URL→recipe ships first |
| When to pursue Stripe/Bridge USDC spending? | Monitor — don't build until their APIs are GA. Stripe Crypto Onramp (fiat → USDC on Sui) confirmed and specced in Phase 20a |

---

## Cross-Doc Cleanup — ✅ DONE

All docs updated during Phase 24a implementation.

**`spec/t2000-roadmap-v2.md`** — ✅
- [x] Removed "gift cards (800+ brands)" from shipped features
- [x] Changed deliver-first example from gift cards to high-value services
- [x] Removed "Phone top-up via Reloadly Airtime" from Phase 23a
- [x] Removed gift card gifting flows and cross-sell chips
- [x] Updated service counts (41→40, 90→88)
- [x] Marked Phase 24a as ✅ Shipped

**`spec/roadmap-mpp.md`** — ✅
- [x] Updated service counts (41→40, 90→88) throughout
- [x] Rewrote "Deliver-First Pattern" section — uses Printful as example
- [x] Replaced `/reloadly/v1/order` in wireframe examples

**`spec/archive/SERVICES_ROADMAP.md`** — ✅
- [x] Removed "Reloadly Gift Cards" from service table
- [x] Removed "Reloadly storytelling" marketing reference
- [x] Changed Commerce category to "Lob, Printful"
- [x] Updated Tempo comparison count
- [x] Removed Reloadly from dynamic pricing examples

**`spec/archive/MPP_GATEWAY_V2.md`** — ✅
- [x] Replaced Reloadly storytelling section with removal note + updated marketing focus

---

*Commerce v2 — from 36 files of gift card risk to 5 clean MPP endpoints.*
