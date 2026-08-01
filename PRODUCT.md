# t2000 — The Product Map

> One page. What we sell, under which brands, and how people start. For the
> technical picture see [`ARCHITECTURE.md`](ARCHITECTURE.md); for docs see
> [developers.t2000.ai](https://developers.t2000.ai).
>
> **🔴 LOCKED 2026-08-01 — three programs + product B.** t2000 = **USDC agent
> economy only**. Private Inference = **Audric** (`api.audric.ai`, hard cut — no
> `api.t2000.ai` redirect). Shared zkLogin Passport kept. Specs:
> `SPEC_T2_PASSPORT_CONNECT.md` · `SPEC_T2_CLEANUP_USDC_ONLY.md` ·
> `SPEC_PI_TO_AUDRIC.md`.

## Two brands. Full stop.

| Brand | Role | Money |
|---|---|---|
| **[t2000.ai](https://t2000.ai)** | A2A store + Passport Connect + x402 rails + wallet SDK/CLI/MCP | **USDC only** |
| **[audric.ai](https://audric.ai)** | Consumer private AI + **Private Inference** (chat + developer API) | **Credit / Stripe** |

**Do not create** parallel consumer brands (`paychat.sh`, `hireagent.sh`, etc.).
PayBox-shaped distribution = **Passport Connect** on t2000 (hosted MCP into
Claude / ChatGPT), not a new domain. Store discovery = **`t2000.ai`**.

**One Passport:** same Google zkLogin → same Sui address on both brands. Never
split wallets when moving PI to Audric.

---

## Apex IA (target)

| URL | What it is |
|---|---|
| **`t2000.ai`** | **Home = A2A store** (browse / Hire / Open) + Passport / Connect CTAs |
| **`t2000.ai/manage`** | Console — **USDC Passport**, limits, Connections, seller desk, jobs (no inference credit) |
| **`mcp.t2000.ai`** | Hosted Passport MCP (Connect) — claim only when live |
| **`developers.t2000.ai`** | Docs — wallet, store, x402, SDK/CLI/MCP (USDC). Not PI pricing. |
| **`mpp.t2000.ai`** | **x402 API rail only** — no consumer marketing/catalog UI |
| **`api.audric.ai`** | **Private Inference** (OpenAI-compatible) — Audric product |
| **`verify.t2000.ai`** | Confidential receipt verify + public ledger |
| **`agents.t2000.ai`** | **Purged** — 301 to `t2000.ai` (do not design for it) |
| **`api.t2000.ai`** | **Removed** (hard cut — no redirect) when Program 3 ships |

**Passport** = named capability (zkLogin wallet shared with Audric + manage),
surfaced as homepage CTA + `/manage` — **not** a dedicated `/passport` page.

---

## Surfaces (after the three-program lock)

| Surface | Brand | Customer | Path in | They pay with |
|---|---|---|---|---|
| **A2A Store** | t2000 | humans + agents hiring/selling work | Create Passport → Hire / Open / sell | **USDC** (escrow or per-call) |
| **Passport Connect** | t2000 | humans using Claude/ChatGPT | Connect → hosted MCP under limits | **USDC** (delegated session) |
| **x402 Gateway** | t2000 | machines | `t2 init` / Passport → `t2 pay` / MCP `pay` | **USDC** per call |
| **Private Inference** | **Audric** | humans + devs | Audric signup → **top up ≥ $5 credit** → API key / chat / coding-tool connect | **Credit** (no free `sk-` mint) |

**What each is:**

- **A2A Store** — agent-to-agent work + paid APIs on Sui. **ASPs** list
  **services** (escrow Jobs) or **APIs** (x402 / `@t2000/serve`). Buyers **Hire**
  or post **Open** jobs. Reputation is receipts. Capital storefront **purged**
  (Program 2).
- **Passport Connect** — hosted MCP + OAuth into Claude/ChatGPT; earn-first
  (claim Open at $0) and hire/pay under limits; MCP Apps cards. Spec:
  `SPEC_T2_PASSPORT_CONNECT.md`.
- **x402 Gateway** — major AI + data APIs, pay per call in USDC, no account.
  Machine-native. Discovery on store/docs — not a parallel mpp marketing site.
- **Private Inference (Audric)** — open + frontier models, ZDR, confidential tier
  with receipts (`verify.t2000.ai`). Coding tools point at `api.audric.ai`.
  Spec: `SPEC_PI_TO_AUDRIC.md`.

### Store vocabulary (locked)

| Term | Meaning | Surfaced as |
|---|---|---|
| **A2A** | Agent-to-agent commerce on Sui escrow | “A2A” framing; package `a2a_escrow` |
| **ASP** | Agent Service Provider | Role name; code may say `seller` |
| **Hire** | Buyer funds a Job now | Primary buyer door |
| **Open** | Buyer posts escrowed open job; ASP claims | Role + door |
| **Job** | Escrowed unit of work | Inbox + chain object |
| **Passport** | Shared zkLogin/local wallet — USDC, limits, Connect | Home + `/manage`; same address as Audric |

Do **not** use Invite / RFQ / “open request” as product nouns.

## How we make money

| # | Source | Brand | What we take |
|---|---|---|---|
| 1 | **Private Inference** | Audric | Credit / paid model usage |
| 2 | **x402 Gateway** | t2000 | USDC on proxied catalog calls |
| 3 | **A2A escrow** | t2000 | **5%** at job settlement (`a2a_escrow` → t2000-revenue). Per-call API sales fee-free. |

Later: shared Stripe subscription entitlements across Audric + store perks (billing program — not Connect Phase 0).

## The substrate

| Thing | What it actually is |
|---|---|
| **Passport** (`@t2000/{cli,sdk,mcp}`) | One wallet — local keypair *or* zkLogin. **USDC** = store/Connect/x402 billing. Hosted MCP = Connect. |
| **Agent ID** (`@t2000/id`) | On-chain registry for ASPs |
| **t2 Compute** (planned) | Managed runtime for an Agent ID; brains = Audric or BYO — not a t2000 PI store product |

## The consumers

- **[Audric](https://audric.ai)** — private AI chat + PI API. Same Passport. No “Connect MCP” chrome (Passport is native). Commerce cards = later pass.
- **Claude / ChatGPT via Passport Connect** — hosted MCP on t2000 (`mcp.t2000.ai`).
- **Coding tools → models** — Audric API (`api.audric.ai`), not `t2 connect` to t2000.

## Three active programs (2026-08-01)

| # | Program | SPEC |
|---|---|---|
| 1 | Passport Connect (USDC MCP + cards) | `SPEC_T2_PASSPORT_CONNECT.md` |
| 2 | Cleanup (Capital purge, apex host, USDC-only desk) | `SPEC_T2_CLEANUP_USDC_ONLY.md` |
| 3 | PI → Audric (`api.audric.ai` hard cut) | `SPEC_PI_TO_AUDRIC.md` |

## Explicit non-goals

- New consumer vault/store domains (PayBox clones)
- Multi-chain / virtual-card race with MoonPay
- Competing with Claude/ChatGPT on agent harness UX as the company bet
- Consumer marketing frontend on `mpp.t2000.ai`
- Designing for `agents.t2000.ai` as a living product host
- Second zkLogin for t2000
- Keeping Private Inference on the t2000 store desk
- `api.t2000.ai` redirect/alias after Program 3

## Removed

- **`t2 code` / `create-t2-app` / templates** — 2026-07-24
- **`t2 agent onboard` / `t2 agent topup`** — 2026-07-13
- **Capital storefront** — Program 2 (on-chain may remain historical)
- **`api.t2000.ai` as PI product host** — Program 3 hard cut → `api.audric.ai`
