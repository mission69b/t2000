# Brand Guide

> Working document. Two-brand strategy: **t2000** stays as developer/infrastructure brand, **Audric** is the consumer product brand. See Brand Architecture section.

---

## Positioning

### One sentence

The financial operating system for humans and agents.

### The shift

| Before | After |
|--------|-------|
| "A bank account for AI agents" | "Your money, handled." |
| Developer tool with a consumer app | Consumer product with developer tools |
| Five accounts | Five products |
| Terminal-first | App-first |
| Dark hacker aesthetic | Clean, trustworthy, precise |

### What we are

- A platform where money works for you — saving, paying, sending, borrowing
- AI-native: talk to your money, your agent handles the rest
- Built on Sui, settled in USDC, non-custodial
- Open infrastructure: anyone can build on it, run a server, integrate

### What we are NOT

- Not a wallet (wallets hold money; we put money to work)
- Not a crypto app (crypto is the rail, not the pitch)
- Not a chatbot (the conversation is the interface, not the product)
- Not a developer tool (developers are an audience, not THE audience)

---

## Audience

### Priority order

| # | Audience | What they want | Where they enter |
|---|----------|---------------|-----------------|
| 1 | **Everyday people** | "I want my money to earn, pay, send without me doing everything" | Homepage, app |
| 2 | **AI agent users** | "My agent needs to pay for APIs and services" | /pay product page, /agent |
| 3 | **Developers** | "I want to build with this stack — CLI, SDK, MCP" | /docs |
| 4 | **Builders / providers** | "I want to run my own MPP server or integrate" | suimpp.dev |

The homepage converts audience 1. Everyone else navigates to their section.

---

## Product Catalog

Products are how we organize and sell capabilities. Inside the app, it is still one conversational interface.

| Product | Tagline | Description | Integration | Status |
|---------|---------|-------------|-------------|--------|
| **Savings** | Earn yield on USDC | Deposit USDC, earn ~2–8% APY via NAVI. Auto-compounding. | NAVI MCP (reads) + thin tx builders (writes) | Live |
| **Pay** | Access APIs with micropayments | Pay for 40+ API services (AI, search, commerce) with USDC. No API keys. | MPP / t2000 gateway | Live |
| **Send** | USDC transfers, instantly | Send to contacts, any Sui address. Cross-border, no fees beyond gas. | Direct Sui transactions | Live |
| **Credit** | Borrow against your balance | Collateralized borrowing via NAVI. Manage debt with chat. | NAVI MCP (reads) + thin tx builders (writes) | Live |
| **Receive** | Accept payments anywhere | QR codes, payment links, invoices, merchant receive. | Direct Sui transactions | Planned |

### Removed products (and why)

| Removed | Reason | When it comes back |
|---------|--------|-------------------|
| **Invest** | "Multi-protocol yield optimization" is a DeFi power-user feature, not consumer. Savings already covers yield. | When protocols release MCPs, the engine auto-discovers yield sources. No SDK needed. |
| **Swap** | Not a product — it's a utility. Converting SUI to USDC is a step within the deposit flow, not a standalone feature. | Added as a utility within other flows when DEX protocols (Cetus, DeepBook) release MCPs. |

### Product page structure (each product gets a page)

```
/savings    — Hero, current rates, how it works, CTA
/pay        — Hero, API catalog summary, pricing, CTA
/send       — Hero, how transfers work, contacts, CTA
/credit     — Hero, rates, collateral info, CTA
/receive    — Hero, use cases, "coming soon" signup
```

### Integration architecture

```
Consumer app
├── NAVI MCP (https://open-api.naviprotocol.io/api/mcp)
│   ├── Reads: rates, positions, health, rewards, quotes
│   └── Free, no auth, structured data
├── Thin transaction builders (deposits, withdrawals, borrow, repay)
│   └── @mysten/sui Transaction class + known contract addresses
├── MPP gateway (mpp.t2000.ai)
│   └── API payments via @suimpp/mpp
└── Direct Sui transfers
    └── USDC transfers via @mysten/sui

Dependencies removed:
✗ @naviprotocol/lending (patched) → replaced by MCP + thin tx
✗ Suilend SDK → removed, not needed at launch
✗ Cetus SDK → removed, not needed at launch

Future expansion (zero-effort via MCP):
○ Suilend releases MCP → add as alternative yield source
○ Cetus releases MCP → add swap utility within deposit flows
○ Any protocol releases MCP → engine auto-discovers, presents to user
```

### Gateway as infrastructure product

The MPP gateway (`mpp.t2000.ai`) is the infrastructure behind "Pay." It is NOT a separate consumer product. On the website, it is referenced on the /pay page and in /docs. Builders who want to run their own gateway go to suimpp.dev.

---

## Product Model: Hybrid Agent

### The insight

Don't build a bank from scratch. Build the AI financial agent that operates across existing platforms.

### Why hybrid, not pure vertical or pure horizontal

| Approach | Pros | Cons |
|----------|------|------|
| **Vertical app** (build every feature) | Full control, premium feel | Slow, expensive, rebuilding Revolut |
| **Horizontal agent** (browser extension only) | Fast coverage, works everywhere | No trust anchor, dependent on third-party UIs |
| **Hybrid** (app + extension + agent) | Own the high-trust moments, delegate the rest | More surfaces to maintain |

**The hybrid wins:** the app is where users deposit money and feel safe. The agent (extension, MCP, CLI) is how the money moves across services the user already trusts.

### What lives where

| Surface | Role | Examples |
|---------|------|---------|
| **Web app** (Audric.ai) | Vault + command center | Deposit, check balance, savings, chat, settings |
| **Chrome extension** | Hands — operates across any web service | Auto-fill payments, interact with DeFi frontends, collect info |
| **CLI** (@t2000/cli) | Developer tool | `t2000 pay`, `t2000 mcp`, programmatic access |
| **MCP** (@t2000/mcp) | Agent integration | Claude Desktop, Cursor, any MCP-compatible client |
| **iOS app** (future) | Pocket — mobile-native experience | Notifications, quick actions, biometric auth |

### What we build vs what we navigate

| Action | Build custom UI? | Or agent navigates? |
|--------|-----------------|-------------------|
| Deposit USDC | **Build** — high trust, needs our own UI | — |
| Check balance | **Build** — core app screen | — |
| Earn yield (Savings) | **Build** — simple UI, NAVI MCP + thin tx | — |
| Pay for an API | **Build** — MPP is our protocol | — |
| Send to a friend | **Build** — simple transfer UI | — |
| Borrow / Repay | **Build** — NAVI MCP + thin tx | — |
| Check health factor | **Build** — NAVI MCP query | — |
| Browse DeFi site | — | **Agent navigates** — via extension |
| Pay on merchant site | — | **Agent navigates** — via extension |
| Fill a form, collect info | — | **Agent navigates** — via extension |

**Rule of thumb:** if it involves the user's money moving, build the UI. If it involves interacting with a third-party service, let the agent navigate.

### Distribution ladder

```
Phase 1: Web app (Audric.ai)
         └── zkLogin (Google sign-in), deposit, save, pay, chat
         └── The trust anchor. "My money lives here."

Phase 2: Chrome extension
         └── Same wallet, same agent, operates across any website
         └── "My agent works everywhere I browse."
         └── Reference: Claude extension model (navigate, fill, collect)

Phase 3: iOS app
         └── Notifications, biometrics, mobile-native
         └── "My money in my pocket."
```

All three surfaces share one identity (zkLogin / Google), one wallet (Sui keypair), one agent.

### Strategic validation

NAVI CEO (ecosystem partner, Sui DeFi protocol) independently recommended this exact split: "separate infra/consumer to gain different verticals and revenue streams" and suggested leveraging existing pathways (browser extensions, AI agents) rather than building each vertical from scratch. This aligns with the hybrid model.

### Technical foundation: Claude Code architecture

Anthropic's open-sourced Claude Code provides production-grade patterns for the agent engine: async generator conversation loops, tool orchestration with parallel/serial execution, MCP bidirectional integration, plugin/skills systems, voice input, and cross-surface session bridging. The plan is to **study and reimplement these patterns** (not fork) as `@t2000/engine`, replacing code-editing tools with financial tools and the terminal UI with the Agentic Design System web UI. Full analysis in `spec/CLAUDE_CODE_LEVERAGE.md`.

### MCP-first DeFi integration

NAVI Protocol released a free, public MCP server (`https://open-api.naviprotocol.io/api/mcp`) covering all read operations (rates, positions, health, rewards, quotes). This enables an MCP-first integration model: **MCP for reads, thin transaction builders for writes**. No SDK per protocol needed — just connect the engine's MCP client. If other protocols follow with their own MCPs, the engine becomes a universal DeFi aggregator through MCP alone.

### Repository separation

Current t2000 monorepo splits into three focused repos: **t2000** (infrastructure — gateway, CLI, SDK, MCP, engine, contracts), **Audric** (consumer product — web app, extension, mobile), **suimpp** (protocol — already separate). Consumer app imports `@t2000/engine` and `@t2000/sdk` from npm. Clean boundary, different deploy pipelines, different design systems. Full plan in `spec/CLAUDE_CODE_LEVERAGE.md`.

---

## Voice & Tone

### Principles

| Do | Don't |
|----|-------|
| Be direct | Don't hedge with "helps you" or "allows you to" |
| Use plain language | Don't use jargon (no "DeFi primitives," "liquidity pools" on consumer pages) |
| Show real numbers | Don't say "high yield" — say "4.86% APY" |
| Be confident | Don't be arrogant — no "the best," no "revolutionary" |
| Be concise | Don't over-explain — one sentence beats three |

### Headlines

Headlines use the serif display font (New York Large). They should be short, declarative, and human.

**Good:**
- "Your money, handled."
- "Earn 4.86% on USDC."
- "Pay for any API. No keys."
- "Send USDC anywhere. Instantly."

> Note: The hero headline should be tested during the homepage redesign. Candidates include "Your money, handled.", "Talk to your money.", "Finance, by conversation." — pick based on what the page looks like.

**Bad:**
- "A bank account for AI agents" (too niche)
- "The future of autonomous finance" (too vague)
- "Powered by Sui blockchain technology" (nobody cares)
- "Five accounts. One agent. Zero friction." (marketing-speak)

### Body copy

Body copy uses Geist (sans-serif). It should read like a smart friend explaining something, not a whitepaper.

**Good:** "Deposit USDC and start earning immediately. We route your funds to NAVI for the best rates, and compound automatically."

**Bad:** "Leveraging multi-protocol yield optimization across decentralized lending protocols on the Sui blockchain, users can maximize risk-adjusted returns on their USDC holdings."

### Technical copy

Technical content (docs, CLI examples, API references) uses the same voice but can assume more knowledge. Departure Mono for code and labels.

---

## Design System — Agentic UI

### Source

Agentic Design System Beta (Figma kit). Exports in `spec/AGENTIC DESIGN SYSTEM BETA/`.

### Typography

Three typefaces, strict roles:

| Role | Typeface | Weight | Case | Usage |
|------|----------|--------|------|-------|
| **Display / Headings** | New York Large | Regular | Title case | H1 page titles, H2 section headers, H3 card headings |
| **Body** | Geist | Regular, Medium | Sentence case | Paragraphs, descriptions, long-form content |
| **Labels / Chrome** | Departure Mono | Regular, Medium | UPPERCASE | Nav items, badges, button text, metadata, status, timestamps |

#### Heading scale

| Token | Role | Example |
|-------|------|---------|
| H1 | Page title | "Agent Setup" — one per page only |
| H2 | Section header | "Orchestrating Multi-Step Reasoning" |
| H3 | Card/subsection | "Workflows" — feature cards, content blocks |

#### Body scale

| Token | Role | Usage |
|-------|------|-------|
| Body | Primary body text | Main paragraphs, long-form content |
| Body (B) | Emphasized body | Inline context, conversation messages |
| Body Sm | Secondary body | Descriptions, explanations, helper text |
| Body Sm (B) | Emphasized secondary | Status confirmations, important content |
| Body Xs | Tertiary/meta | Timestamps, legal, disclaimers, footnotes |
| Body Xs (B) | Compact emphasis | Enhanced micro-copy, data point labels |

#### Label scale

| Token | Role | Usage |
|-------|------|-------|
| Label Md | Primary labels | Form field names, filter category headers |
| Label Md (Underlined) | Interactive labels | Inline text links, breadcrumbs, hover targets |
| Label Sm | Secondary labels | Status tags, micro-labels, compact metadata |

#### Button label scale

| Token | Role | Usage |
|-------|------|-------|
| Button Label Md | Standard buttons | Primary and secondary action buttons |
| Button Label Sm | Compact buttons | Inline actions, toolbar buttons, table row actions |

### Colors

#### Neutrals (primary palette)

| Token | Hex | Usage |
|-------|-----|-------|
| N100 | #FFFFFF | Page background, card background |
| N200 | #F7F7F7 | Subtle background, hover state |
| N300 | #E5E5E5 | Borders, dividers |
| N400 | #CCCCCC | Disabled state borders |
| N500 | #9F9F9F | Placeholder text |
| N600 | #707070 | Secondary text, muted labels |
| N700 | #363636 | Primary body text (on white) |
| N800 | #191919 | Headings, emphasis |
| N900 | #000000 | Maximum contrast, display text |

#### Semantic colors (used sparingly)

| Role | Scale | Primary hex | Usage |
|------|-------|-------------|-------|
| **Red** | R100–R800 | R500: #F0201D | Errors, destructive actions, delete buttons |
| **Green** | G100–G800 | G500: #3CC14E | Success states, positive changes, confirmation |
| **Blue** | B100–B800 | B500: #0966F6 | Links, information, active states |
| **Yellow** | Y100–Y800 | Y400: #FFB014 | Warnings, caution |
| **Orange** | O100–O800 | O500: #EC7383 | Accents (rare) |
| **Pink** | P100–P800 | P500: #DE459E | Accents (rare) |
| **Teal** | T100–T800 | T500: #1BBFCn | Accents (rare) |
| **Purple** | P100–P800 | Pu500: #589HEE | Accents (rare) |

**Rule:** The UI is black and white. Color only appears for semantic meaning (success, error, warning, info) or interactive states (links, focus). There is no "brand accent color."

### Shadows

Four elevation levels, increasing depth:

| Token | Usage |
|-------|-------|
| **Card** | Default card elevation. Subtle lift. |
| **Dropdown** | Menus, select dropdowns, popovers. |
| **Drawer** | Side panels, slide-overs. |
| **Modal** | Dialogs, confirmation overlays. Highest elevation. |

### Screen sizes & grid

| Breakpoint | Name | Layout |
|------------|------|--------|
| >= 1920px | Desktop Large | Max-width container, generous margins |
| >= 1440px | Laptop Large | Standard desktop layout |
| >= 1024px | Laptop | Sidebar + content or full-width |
| >= 768px | Tablet Landscape | Collapsed sidebar or single column |
| >= 640px | Tablet Portrait | Single column, stacked layout |
| < 640px | Mobile | Full-width, bottom nav, stacked cards |

### Component inventory (from kit)

| Category | Components |
|----------|-----------|
| **Actions** | Button (filled, outlined, destructive) x sizes, Social buttons (GitHub, Google, Apple, Discord, LinkedIn) |
| **Forms** | Text input, Text area, Search, Radio button, Switch (all with label + validation states) |
| **Navigation** | Sidebar (compact + expanded), Breadcrumbs, Menu, Pagination |
| **Data** | Table cells (text, numeric, avatar, badge, dropdown, editable, icon, action), cell headers |
| **Feedback** | Loader (dark/light, small/large), Skeleton animation, Tooltip, Badge |
| **Overlays** | Chat panel (agent selector, quick actions, model picker), Modal, Drawer |
| **Dashboard** | Stat widgets (with progress bars), Charts (with conversational input) |
| **Patterns** | Multi-step workflow (stepper + sidebar + form + preview), Agent management (variants, metrics) |

---

## Brand Architecture: Two-Brand Strategy

### The pattern

Like Anthropic > Claude, Square > Cash App, or OpenAI > ChatGPT — the infrastructure brand and the consumer brand serve different audiences and have different jobs.

```
┌─────────────────────────────────────────────────────────┐
│  suimpp                                                 │
│  The protocol — Sui MPP standard, ecosystem, registry   │
│  Audience: builders, Mysten, ecosystem                  │
│  Domain: suimpp.dev                                     │
├─────────────────────────────────────────────────────────┤
│  t2000                                                  │
│  The infrastructure — CLI, SDK, MCP, gateway, contracts │
│  Audience: developers, partners, integrators            │
│  Domain: t2000.ai (stays)                               │
│  Packages: @t2000/cli, @t2000/sdk, @t2000/mcp (stay)   │
│  GitHub: github.com/mission69b/t2000 (stays)            │
├─────────────────────────────────────────────────────────┤
│  Audric                                        │
│  The product — app, website, product pages              │
│  Audience: everyday people, crypto + non-crypto          │
│  Domain: Audric.ai or Audric.com (new)                  │
│  App: Audric.ai (replaces app.t2000.ai)                 │
└─────────────────────────────────────────────────────────┘
```

### Why two brands, not a full rebrand

| Concern | Why two brands wins |
|---------|-------------------|
| **Developer equity** | t2000 is known in the Sui ecosystem, on npm, on GitHub. Renaming @t2000/* packages is expensive and confusing. Keep it. |
| **Migration cost** | A full rebrand touches npm, GitHub, Docker images, CI/CD, docs, every import statement. Two brands means the infra stays untouched. |
| **Audience clarity** | Developers and consumers have fundamentally different needs. A name that works for `npx @t2000/cli init` does NOT need to work for "download Audric and start saving." |
| **Flexibility** | If the consumer product pivots, the infra brand survives. If the infra gets adopted by other companies, the consumer brand isn't dragged along. |
| **Precedent** | This is the dominant pattern in tech: Alphabet > Google, Meta > Instagram, Block > Cash App, Anthropic > Claude. It works because it lets each brand do one job well. |

### What changes vs what stays

| Thing | Current | After |
|-------|---------|-------|
| Consumer app | app.t2000.ai | **Audric.ai** |
| Marketing website | t2000.ai (homepage) | **Audric.ai** |
| Product pages | t2000.ai/accounts | **Audric.ai/savings, /pay, /send** |
| CLI | @t2000/cli | **@t2000/cli** (no change) |
| SDK | @t2000/sdk | **@t2000/sdk** (no change) |
| MCP | @t2000/mcp | **@t2000/mcp** (no change) |
| GitHub repo | mission69b/t2000 | **mission69b/t2000** (no change) |
| Gateway | mpp.t2000.ai | **mpp.t2000.ai** (no change) |
| Protocol hub | suimpp.dev | **suimpp.dev** (no change) |
| Docs (consumer) | t2000.ai/docs | Not needed — the app IS the experience; developer docs at **t2000.ai/docs** |
| Docs (developer) | t2000.ai/docs (same page) | **t2000.ai/docs** (developer hub — package cards, install commands, links to GitHub/npm) |
| X account | @t2000ai | Keep for infra/dev audience, create **@Audric** for consumer |
| npm org | @t2000 | **@t2000** (no change) |

### How the brands reference each other

**On Audric.ai (consumer site):**
- "Built with t2000" in the footer (small, like "Powered by Stripe")
- Docs say "Install the t2000 CLI" naturally — no confusion
- `/docs/cli` page: "The t2000 CLI is the developer interface to Audric"
- No need to hide t2000 — it just lives in the developer layer

**On t2000.ai (developer site):**
- t2000.ai becomes the developer/infra landing page
- "t2000 is the infrastructure behind Audric"
- Links to Audric.ai for the consumer product
- Links to suimpp.dev for the protocol

**On suimpp.dev (protocol site):**
- References "t2000 MPP Gateway" as one registered server
- No reference to the consumer brand needed
- Stays fully independent

### Where the line is drawn

The question "does this touch the consumer or the developer?" determines the brand:

| Feature | Brand | Why |
|---------|-------|-----|
| Sign in with Google, see your balance | Audric | Consumer action |
| "Save $100" in the chat | Audric | Consumer action |
| `t2000 pay https://mpp.t2000.ai/...` | t2000 | Developer command |
| `npx @t2000/cli init` | t2000 | Developer tool |
| MCP server config in Claude Desktop | t2000 | Developer integration |
| "What's my savings rate?" | Audric | Consumer question |
| Payment explorer, server registry | suimpp | Protocol/ecosystem |
| Register an MPP server | suimpp | Builder action |

### Potential tensions (and how to resolve them)

**"The CLI creates a wallet for the consumer app — which brand owns that?"**
The CLI is `@t2000/cli`. When it creates a wallet, it creates a wallet usable in Audric. The CLI docs say: "Your wallet works across Audric (app) and t2000 (CLI/SDK)." The wallet is brandless — it is a Sui keypair.

**"What if someone finds Audric through the app and wants the CLI?"**
Audric.ai/docs has a developer section that introduces t2000: "For developers: the t2000 CLI and SDK give you programmatic access to everything Audric does." Natural cross-reference.

**"What about the @t2000ai X account?"**
Keep it for developer/ecosystem content. Create @Audric for consumer content. The founder account (@funkii) bridges both. Same pattern as Anthropic (@AnthropicAI) vs Claude (@Claude).

**"What if we want to rename t2000 later too?"**
You can. But there is no pressure. The consumer name is the one that matters for growth. t2000 can stay as the boring infrastructure name indefinitely, like how nobody cares that Stripe's company is actually "Stripe, Inc." — they just use the product.

---

## Consumer Name: Audric

### Status: Decided

**Name:** Audric
**Domain:** audric.ai
**Etymology:** Old French/Germanic — "noble ruler" / "wise wealth"

### Why Audric

| Criterion | Score |
|-----------|-------|
| Pronounceable | AW-drik — 2 syllables, clear in conversation |
| Works as a noun | "Open Audric", "my Audric balance", "check your Audric" |
| Not crypto-coded | Sounds like a fintech brand, not a DeFi protocol |
| Not AI-coded | Could be a bank, a savings app, a payment platform |
| Warm + trustworthy | Human name with gravitas — same playbook as Claude, Ada, Alexa |
| Finance story | Etymology connects to wealth and wisdom — a financial product named for wise stewardship |
| Domain | audric.ai available |
| Logo-friendly | Short, distinctive letterforms, the "A" makes a strong mark |

### Candidates considered

| Name | Notes |
|------|-------|
| **Audric** | Selected — clever finance story, warm, trustworthy |
| godwin.ai | Strong but $1k domain cost |
| dexford.ai | Sounds like a British village |
| tennyson.ai | Distinguished but long |
| rawson.ai | Premium but cold |
| haydon.ai | Warm but forgettable |
| dunstan.ai | Serious but hard to spell |
| warrick.ai | Modern but no finance connection |

### Next steps

- [x] Register audric.ai domain
- [x] Register @audric on X (or closest available)
- [ ] Check USPTO / EU trademark for "Audric" in fintech (low priority — do before major launch)
- [x] ~~Design wordmark~~ → Icon-first approach: geometric mark + "Audr\c" text treatment (see Icon section below)

### Icon & Identity

The Agentic Design System's logo mark (pixelated geometric cross pattern made of rounded squares) is the design DNA. The `\` backslash in "Agent\c" carries meaning (escape character, terminal, the unexpected).

**Audric adopts the same `\` treatment: "Audr\c"**

The icon mark should:
- Work as favicon (16–32px), app icon (180–512px), social pfp, and chat avatar
- Be animatable (pulse, rotate, or shimmer for loading states / AI thinking)
- Use the same geometric pixel grid as the Agentic DS mark, but distinct
- Be monochrome (N900 on light, N100 on dark) — no color needed
- The "A" letterform or a simplified geometric pattern derived from the cross mark

**Usage:**
| Surface | Treatment |
|---------|-----------|
| Social pfp | Icon mark on white/black bg |
| Favicon | Icon mark, 32px |
| App loading | Animated icon mark (pulse/shimmer) |
| Chat avatar | Icon mark in circle, shown on AI responses |
| Header | "Audr\c" text or icon mark alone |
| Footer | "Built with t2000" small text (unchanged) |

---

## Properties

### Consumer brand: Audric

| Property | Domain | Purpose | Redesign phase |
|----------|--------|---------|----------------|
| **Website** | Audric.ai | Product marketing, product pages, consumer docs | Phase 1 |
| **Consumer app** | Audric.ai (or app.Audric.ai) | The product — chat, save, pay, send, borrow | Phase 2 |

Design system: Agentic UI (white, black, New York + Geist + Departure Mono).

### Infrastructure brand: t2000

| Property | Domain | Purpose | Change |
|----------|--------|---------|--------|
| **Developer site** | t2000.ai | Infra landing, "the engine behind Audric" + developer hub /docs | ✅ Reskinned (Agentic DS dark) |
| **Gateway** | mpp.t2000.ai | MPP API gateway (41 services, 90+ endpoints) | ✅ Reskinned (Agentic DS dark) |
| **CLI** | npm: @t2000/cli | Developer CLI | No change |
| **SDK** | npm: @t2000/sdk | TypeScript SDK | No change |
| **MCP** | npm: @t2000/mcp | AI agent tools | No change |
| **GitHub** | mission69b/t2000 | Monorepo | No change |

Design system: Agentic UI dark theme — Geist Sans (body), Geist Mono (labels/code), Instrument Serif (headings). N900 background, N800 surfaces, #00D68F accent.

### Protocol brand: suimpp

| Property | Domain | Purpose | Change |
|----------|--------|---------|--------|
| **Protocol hub** | suimpp.dev | Sui MPP ecosystem — spec, servers, explorer | No change |
| **Packages** | npm: @suimpp/mpp, @suimpp/discovery | Protocol packages | No change |

Design system: Stays independent (deep navy + blue). Not part of this redesign.

---

## Website Information Architecture

### Audric.ai — Consumer site (app-first)

```
Audric.ai
├── /                    App — conversational UI (the app IS the homepage)
├── /savings             Product info page — yield, rates, how it works
├── /pay                 Product info page — API catalog, pricing, MPP
├── /send                Product info page — transfers, contacts
├── /credit              Product info page — borrowing, collateral
├── /terms               Legal
├── /privacy             Legal
└── /disclaimer          Legal

No /docs — the app teaches through conversation. Developer docs live at t2000.ai/docs.
No /pricing — rates are live in-app via protocol registry.
```

### t2000.ai — Developer/infra site (simplified) ✅ DONE

```
t2000.ai
├── /                    "The engine behind Audric" — hero, product showcase, 5 packages, gateway marquee, MCP integrations, install CTA
├── /docs                Developer hub — quick start, 5 package cards (install + GitHub + npm), resources grid
├── /terms               Legal
├── /privacy             Legal
├── /disclaimer          Legal
└──                      Header: Docs · GitHub · Gateway · [Try Audric →]
                         Links to: audric.ai (product), mpp.t2000.ai (gateway), suimpp.dev (protocol), GitHub
```

### Navigation (Audric.ai)

```
[Logo]                              Products ▼    Docs    Pricing    [Sign In]

Products dropdown:
┌─────────────────────────────────┐
│  SAVINGS     Earn yield on USDC │
│  PAY         APIs & micropayments│
│  SEND        USDC transfers     │
│  CREDIT      Borrow on deposits │
│  RECEIVE     Accept payments    │
└─────────────────────────────────┘
```

---

## Migration Checklist

### Phase 0: Name (do first, blocks everything) — COMPLETE

- [x] Brainstorm 20-30 consumer name candidates
- [x] Kill anything without available domain
- [x] Shortlist to 8-10, check trademarks + social handles
- [x] Shortlist to 3-4, test with 5-10 non-crypto people
- [x] Final pick — **Audric**
- [x] Register domain (.ai and/or .com) — **audric.ai**
- [x] Register X handle, GitHub org (if needed) — **@audric**
- [x] ~~Register npm org~~ — not needed (consumer app uses @t2000/* from npm)

### Phase 0.5: Codebase cleanup — COMPLETE

- [x] Remove Invest/Swap/Suilend/Cetus dead code across SDK, CLI, MCP, skills, web, specs
- [x] USDC-only simplification — remove rebalance, simplify to single deposit asset
- [x] Drop @cetusprotocol/aggregator-sdk, @suilend/sdk, @suilend/sui-fe deps
- [x] Update lockfile, CI green
- [x] Write BRAND.md, CLAUDE_CODE_LEVERAGE.md, rewrite CLAUDE.md + .claude/rules

### Phase 1: Consumer website (Audric.ai) — COMPLETE

- [x] Extract design tokens from Agentic UI kit into Tailwind config
- [x] Build homepage — app-first conversational UI (ChatShell)
- [x] Build product pages (/savings, /pay, /send, /credit)
- [x] Dynamic product stats (rates from protocol registry, API counts from gateway)
- [x] Set up audric.ai domain + Vercel
- [x] Go live with consumer site

### Phase 2: Consumer app — COMPLETE

- [x] Reskin app with Agentic UI (light mode, new tokens)
- [x] Engine-powered chat (QueryEngine + SSE streaming + confirmation flow)
- [x] Settings panel reskin (Agentic DS — mono labels, DS buttons, session management)
- [x] Update all in-app copy from "t2000" to "Audric"
- [x] Keep @t2000/* package references in developer-facing contexts

### Phase 3: Developer properties — COMPLETE

- [x] Simplify t2000.ai to infra landing page ("The engine behind Audric")
- [x] Reskin t2000.ai with Agentic DS dark theme (Geist fonts, neutral scale, accent)
- [x] Reskin gateway UI (mpp.t2000.ai) with Agentic DS dark theme
- [x] t2000.ai/docs → developer hub (5 package cards, quick start, resources)
- [x] Gateway /docs and /spec → external links to suimpp.dev
- [x] Header: Docs · GitHub · Gateway · [Try Audric →]
- [x] Homepage flow: Hero → Product showcase → Stack → Gateway → Integrations → Get started

### Phase 4: Cleanup — IN PROGRESS

- [x] Update README, ARCHITECTURE.md, PRODUCT_FACTS.md
- [x] Update suimpp.dev references (@mppsui → @suimpp)
- [x] Set up domain redirects (app.t2000.ai → audric.ai)
- [ ] Design Audric icon mark (geometric pixel grid, animatable, works 16–512px)
- [ ] Fix bugs + testing pass before launch
- [ ] Social announcement (new brand launch)
