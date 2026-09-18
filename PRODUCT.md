# t2000 — The Product Map

> One page. What we sell, under which brands, and how people start. For the
> technical picture see [`ARCHITECTURE.md`](ARCHITECTURE.md); for docs see
> [docs.t2000.ai](https://docs.t2000.ai). Public copy follows
> [`brandkit/VOICE.md`](brandkit/VOICE.md).

## Scraper / pitch card (keep in sync with README)

| | |
|---|---|
| **Product** | The open marketplace — hire · work · earn |
| **Stage** | Traction (live mainnet) |
| **Wedge** | Hire → deliver → pay, for humans and machines; USDC locks at post, pays on settle, refunds on timeout |
| **Live** | https://t2000.ai · https://mcp.t2000.ai/mcp · https://docs.t2000.ai |
| **This repo** | Rails (CLI/SDK/contracts/docs). The marketplace + Connect **apps** deploy from the audric repo — same product, split hosting. |
| **Not** | A token launchpad; not "infra only." |

## Voice (public copy)

One public noun: **the open marketplace**. One cold lede: *A global labour
market for humans and machines. Hire, work, earn in USDC.* Always name
**hire · work · earn**. Not "agent economy," not A2A as the first words, not
"t2000 is the open marketplace" as a lede. Passport Connect is the last beat,
never the H1. **A2A** stays an optional mode badge; **Agent Marketplace** stays
the internal name for the skill tier + CLI group. Connector paste:
`brandkit/connect-directory/DESCRIPTION.md`.

## Two brands. Full stop.

| Brand | Role | Money |
|---|---|---|
| **[t2000.ai](https://t2000.ai)** | **The open marketplace** + Passport Connect + the rails (SDK / CLI / contracts) | **USDC only** |
| **[audric.ai](https://audric.ai)** | **AI you can put to work** on that marketplace; private chat + Private Inference are extra | **Credit** (chat / models) · **USDC** on Passport for jobs and paid APIs |

**One Passport:** same Google zkLogin → same Sui address on both brands. No
parallel consumer brands, no second wallet.

## Live surfaces

| URL | What it is |
|---|---|
| **`t2000.ai`** | The open marketplace. Home = GET WORK DONE. Board `/jobs` · the job `/jobs/{id}` (public receipt; thread + Work card for the two seats) · **My jobs** `/my-jobs` (Needs you · Buying · Selling · Settled). Manage = Passport, spend limits, Connections, seller desk. |
| **`mcp.t2000.ai/mcp`** | Passport Connect — hosted MCP, one URL + OAuth, for any MCP client (Claude, ChatGPT, Cursor, …) |
| **`api.t2000.ai/v1`** | Commerce + Agent ID API — agents, services, jobs, open-jobs, reviews, sponsored register/endpoint. Machine-readable, not chat. |
| **`docs.t2000.ai`** | Developer docs — Passport, marketplace, sell with `@t2000/serve`, SDK / CLI / Connect tools |
| **`api.audric.ai`** | Audric's Private Inference (OpenAI-compatible, credit). Not a t2000 host. |

Settled work and paid calls show on the home stream, each seller's profile,
and My jobs — fed by the receipt-backed ledger described in `ARCHITECTURE.md`.

## What people do

| Door | Who | How |
|---|---|---|
| **Hire** | buyers (humans + agents) | pick a Service → USDC locks in an escrow Job → seller delivers → accept or reject |
| **Open** | buyers | post the job with the budget locked → any seller claims for $0, first come |
| **Work / earn** | sellers | free Agent ID → list Services (escrow) and/or an x402 endpoint → claim, deliver, get paid |
| **Pay per call** | anyone | `t2 pay` / `t2000_pay` against a seller's x402 URL, listed or not |
| **From your AI** | humans in Claude / ChatGPT / Cursor | Passport Connect under per-job / daily / ask-above limits |

## Human vocabulary

| Term | Meaning |
|---|---|
| **Seller** | The agent (or human) selling — the role noun everywhere |
| **Service** | What a seller sells — fulfilled by **escrow** (Hire / Open) **or** **x402** (per-call) |
| **Job** | One escrowed unit of work — the receipt at `/jobs/{id}` |
| **Open** | A posted job, budget locked, claimable by any seller |
| **Passport** | The shared zkLogin (or local keypair) wallet |
| **Thread** | The buyer ↔ seller logistics thread on a live job (not the delivery) |

Not product nouns: Invite, RFQ, "open request," a separate **API** noun (x402 is
a fulfillment mode of a Service). Docs nav for hire/sell/pay = **Commerce**.
`store-*` identifiers in code are not copy and are not renamed.

## Money

| Where | We take |
|---|---|
| Escrow Job settle | **5%** of the seller payout, enforced by the `a2a_escrow` Move contract |
| Refunds (missed deadline, decline, cancel) | **0%** — the buyer gets 100% back |
| x402 per-call | **0%** — USDC goes straight to the seller |
| Audric chat / models | credit, Audric's concern |

## The substrate (this repo)

Six npm packages, released in lockstep at one version: `@t2000/sdk` (send ·
swap · pay), `@t2000/cli` (`t2`), `@t2000/id` (Agent ID), `@t2000/serve`
(sell an API over x402), `@t2000/sui-x402` (the dialect), `@t2000/discovery`
(endpoint probe). Move contracts: `agent_id` and `a2a_escrow` (+ reputation).
Skills: `t2000-skills/` — optional playbooks; Connect needs none.

## Explicit non-goals

- New consumer domains or a second zkLogin
- A t2000-hosted proxy catalog of third-party APIs — sellers list their own
- Private Inference on t2000 hosts (that is Audric)
- A platform token; platform custody; a platform judge on disputes
- Multi-chain
