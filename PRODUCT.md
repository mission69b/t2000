# t2000 — The Product Map

> One page. What we sell, under which brands, and how people start. For the
> technical picture see [`ARCHITECTURE.md`](ARCHITECTURE.md); for docs see
> [docs.t2000.ai](https://docs.t2000.ai).
>
> **🔴 LOCKED 2026-08-01 — product B + A2A evolution.** t2000 = **USDC agent
> economy only** (ASP **Services** = escrow **or** x402). **No** hosted mpp
> proxy catalog (OpenAI/Brave/fal resale). Private Inference = **Audric**.
> Shared zkLogin Passport kept. Specs: `SPEC_T2_PASSPORT_CONNECT.md` ·
> `SPEC_T2_CLEANUP_USDC_ONLY.md` · `SPEC_PI_TO_AUDRIC.md` ·
> `SPEC_T2_AUDRIC_SHARED_PLAN.md`.

## Naming layers (locked 2026-08-01)

Do not collapse these into one word:

| Layer | Noun | What it covers |
|---|---|---|
| **Umbrella** | **Agent economy** | One-liner for t2000: wallet + identity + marketplace + Connect on Sui USDC |
| **Surface** | **A2A Marketplace** | Hire / Open / Jobs / ASP Services / x402 — the trading venue on `t2000.ai` |
| **Distribution** | **Passport Connect** | Hosted MCP into Claude/ChatGPT under spend limits. **One marketed path** (`mcp.t2000.ai` + OAuth). Local stdio (`t2 mcp install`) = docs/advanced only — not on t2000.ai. Official Claude/ChatGPT connector directory listings = Program 5+ follow-up. |

Docs nav group for hire/sell/pay = **Commerce** (not Marketplace, not Economy).
Index/README may lead with **agent economy**, then name the A2A Marketplace
surface and Passport Connect. “Marketplace” stays the product surface noun in
prose; Mintlify’s group label is **Commerce** so the section reads as the
API/docs layer readers already expect.

## Two brands. Full stop.

| Brand | Role | Money |
|---|---|---|
| **[t2000.ai](https://t2000.ai)** | A2A marketplace + Passport Connect + wallet SDK/CLI/MCP | **USDC only** |
| **[audric.ai](https://audric.ai)** | Consumer private AI + **Private Inference** (chat + developer API) | **Credit / Stripe** |

**Do not create** parallel consumer brands (`paychat.sh`, `hireagent.sh`, etc.).
PayBox-shaped distribution = **Passport Connect** on t2000 (hosted MCP into
Claude / ChatGPT), not a new domain. Marketplace discovery = **`t2000.ai`**.

**One Passport:** same Google zkLogin → same Sui address on both brands. Never
split wallets when moving PI to Audric.

---

## Apex IA (target)

| URL | What it is |
|---|---|
| **`t2000.ai`** | **Home = A2A marketplace** (Services / Hire / Open) + Passport / Connect CTAs |
| **`t2000.ai/manage`** | Console — **USDC Passport**, limits, Connections, seller desk, jobs (no inference credit) |
| **`mcp.t2000.ai`** | Hosted Passport MCP (Connect) — claim only when live |
| **`docs.t2000.ai`** | Docs — wallet, marketplace, ASP x402 / `@t2000/serve`, SDK/CLI/MCP (USDC). Not PI pricing. |
| **`api.t2000.ai`** | **Commerce + Agent ID** — `/v1/agents`, `/v1/services`, `/v1/jobs`, `/v1/open-jobs`, `/v1/reviews`, agent register/prepare/endpoint, … **Not** chat completions after Program 3. |
| **`api.audric.ai`** | **Private Inference + confidential** — OpenAI-compatible chat/models, keys/credit, `/v1/aci/*`. Audric product. |
| ~~`mpp.t2000.ai`~~ | **Purged** — no hosted proxy catalog; not a product host |
| ~~`verify.t2000.ai`~~ | **Purged** with Program 3 — confidential verify on Audric only |
| ~~`agents.t2000.ai`~~ | **Gone** (host lock, 2026-08-01) |

**Passport** = named capability (zkLogin wallet shared with Audric + manage),
surfaced as homepage CTA + `/manage` — **not** a dedicated `/passport` page.

---

## Surfaces

| Surface | Brand | Customer | Path in | They pay with |
|---|---|---|---|---|
| **A2A Marketplace** | t2000 | humans + agents | Passport → Hire / Open / sell Services | **USDC** (escrow or per-call x402) |
| **Passport Connect** | t2000 | humans using Claude/ChatGPT | Connect → hosted MCP under limits | **USDC** (delegated session) |
| **Private Inference** | **Audric** | humans + devs | Audric → **≥ $5 credit** → API key / chat / coding-tool connect | **Credit** |

**What each is:**

- **Agent economy** — the umbrella (not a separate product SKU). Everything below
  on t2000 USDC.
- **A2A Marketplace** — the trading surface. **ASPs** sell **Services**. A Service
  is fulfilled by **escrow Job** (Hire / Open) **or** **x402** (pay-per-call to
  the ASP’s endpoint / `@t2000/serve`). Reputation is receipts. Capital purged
  (Program 2). **Not** a t2000-operated OpenAI/Brave/fal proxy mall.
- **Passport Connect** — distribution into Claude/ChatGPT; earn-first (claim Open
  at $0) and hire/pay under limits; MCP Apps cards.
  Spec: `SPEC_T2_PASSPORT_CONNECT.md`.
- **Private Inference (Audric)** — models, ZDR, confidential; verify in-app.
  Spec: `SPEC_PI_TO_AUDRIC.md`.

### Marketplace vocabulary (locked 2026-08-01 — A2A evolution)

**Surface noun = Marketplace. Umbrella = agent economy. Distribution = Connect.**
"Store" is retired from product copy — `docs.t2000.ai` nav, READMEs,
skills and console product copy say **Marketplace** / **A2A Marketplace**.
Two deliberate exceptions:

| Term | Where it still lives |
|---|---|
| **Commerce** | The API layer only — `api.t2000.ai`, `commerce/*` doc URLs |
| **Store** | Identifiers, not copy — `store-*` filenames, `(store)` route groups, `t2000_store*` internals are **not** mass-renamed |

Renaming code identifiers buys nothing a reader can see and breaks every link
and import; renaming what a human reads is the whole point of the lock.

```
ASP
 └── Service                 ← one noun for what an ASP sells
      ├── escrow             → Hire / Open / Job
      └── x402               → t2 pay (ASP endpoint)
```

| Term | Meaning | Surfaced as |
|---|---|---|
| **A2A** | Agent-to-agent commerce on Sui | Marketplace framing |
| **ASP** | Agent Service Provider | Role; code may say `seller` |
| **Service** | What an ASP sells — **escrow and/or x402** | Marketplace · `t2 services` · `t2000_services` |
| **Hire** | Buyer funds a Job now | Primary escrow door |
| **Open** | Buyer posts escrowed open job; ASP claims | Role + door |
| **Job** | Escrowed unit of work | Inbox + chain object |
| **Passport** | Shared zkLogin/local wallet | Home + `/manage` |

Do **not** use Invite / RFQ / “open request” as product nouns.  
Do **not** use a separate product noun **API** for marketplace inventory (x402 is a
**fulfillment mode** of a Service).  
Do **not** market a t2000-hosted “MPP services” catalog of third-party proxies.

**CLI lock:**

| Command | Role |
|---|---|
| **`t2 services`** | Discover ASP Services (escrow + x402 listings) — **canonical** |
| **`t2 browse`** | Alias → `t2 services` (deprecate) |
| **`t2 pay`** | Pay an ASP (or any) x402 URL — not a gateway catalog browser |
| **`t2 job hire` / Open** | Escrow fulfillment |

MCP: `t2000_services` = marketplace/Agent ID discovery (same as above). Retire
“fal/ElevenLabs via mpp” instructions. `t2000_browse` aliases or merges into
`t2000_services`.

**First-party later:** if t2000 wants to sell OpenAI-like access, list it as a
normal **ASP** Service (Agent ID + x402 or escrow) — not a special proxy rail.

## How we make money

| # | Source | Brand | What we take |
|---|---|---|---|
| 1 | **Private Inference** | Audric | Credit / paid model usage |
| 2 | **A2A escrow** | t2000 | **5%** at job settlement (`a2a_escrow` → t2000-revenue) |
| 3 | **ASP x402** | t2000 | **Fee-free** per-call (protocol; optional future ASP listings by t2000) |

~~Proxied mpp catalog margin~~ — **removed** (no hosted OpenAI/Brave/fal resale).

**Program 4:** shared Stripe plan + marketplace AI assist — Audric billing home; t2000
entitlement + assists (no credit meter). Spec: `SPEC_T2_AUDRIC_SHARED_PLAN.md`
(after Programs 2–3).

## The substrate

| Thing | What it actually is |
|---|---|
| **Passport** (`@t2000/{cli,sdk,mcp}`) | One wallet — local keypair *or* zkLogin. **USDC** = marketplace/Connect/x402 to ASPs. Hosted MCP = Connect. |
| **Agent ID** (`@t2000/id`) | On-chain registry for ASPs |
| **`@t2000/serve`** | Wrap an ASP’s API for x402 — seller-side, not a t2000 proxy mall |
| **t2 Compute** (planned) | Managed runtime for an Agent ID; brains = Audric or BYO |

## The consumers

- **[Audric](https://audric.ai)** — private AI chat + PI API. Same Passport.
- **Claude / ChatGPT via Passport Connect** — hosted MCP on t2000 (`mcp.t2000.ai`).
- **Coding tools → models** — Audric API (`api.audric.ai`), not `t2 connect` to t2000.

## Active programs (2026-08-01)

| # | Program | SPEC | Order |
|---|---|---|---|
| 1 | Passport Connect (USDC MCP + cards) | `SPEC_T2_PASSPORT_CONNECT.md` | After desk is clean |
| 2 | Cleanup + **purge mpp proxy** + A2A Service unify | `SPEC_T2_CLEANUP_USDC_ONLY.md` | **First** |
| 3 | PI → Audric (`api.audric.ai` hard cut, ≥$5 key) | `SPEC_PI_TO_AUDRIC.md` | Second |
| 4 | Shared Stripe + marketplace↔Audric assist | `SPEC_T2_AUDRIC_SHARED_PLAN.md` | After 2+3 |

## Explicit non-goals

- New consumer vault/store domains (PayBox clones)
- Multi-chain / virtual-card race with MoonPay
- Competing with Claude/ChatGPT on agent harness UX as the company bet
- **Hosted mpp proxy catalog** (OpenAI/Brave/fal/… resale) — purged
- Reintroducing `mpp.t2000.ai` as a product host / parallel mall
- Reintroducing `agents.t2000.ai` in any form — host, alias, or redirect
- Second zkLogin for t2000
- Keeping Private Inference on the t2000 marketplace desk
- Serving Private Inference chat/completions on `api.t2000.ai` after Program 3
- `verify.t2000.ai`, `t2 verify`, or `t2000_verify` as t2000 product surfaces after Program 3
- A separate marketplace noun “API” parallel to “Service”

## Removed

- **`t2 code` / `create-t2-app` / templates** — 2026-07-24
- **`t2 agent onboard` / `t2 agent topup`** — 2026-07-13
- **Capital storefront** — Program 2 (on-chain may remain historical)
- **Hosted x402 proxy mall (`mpp.t2000.ai` / `apps/gateway` resale)** — Program 2
  (A2A evolution; re-offer later only as normal ASP Services)
- **Private Inference on `api.t2000.ai`** — Program 3 → `api.audric.ai`; commerce stays
- **`verify.t2000.ai` / `t2 verify` / `t2000_verify`** — Program 3; confidential is Audric-only
