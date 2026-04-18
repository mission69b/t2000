> **⚠️ HISTORICAL DOCUMENT — ARCHIVED APRIL 2026**
>
> Companion to the archived [`AUDRIC_2_SPEC.md`](./AUDRIC_2_SPEC.md). Both are superseded by [`AUDRIC_FINANCE_SIMPLIFICATION_SPEC_v1.4.md`](../../AUDRIC_FINANCE_SIMPLIFICATION_SPEC_v1.4.md).
>
> The four-rail dashboard, the Copilot row, the scheduled-action cards, the morning briefing surfaces, the autonomy panels — all of these were deleted in the April 2026 simplification. The shipped UI is chat-first: balance + greeting + chat input + chip bar above the fold, with everything else opt-in via slash-commands or chat-driven canvases. See [`spec/SIMPLIFICATION_RATIONALE.md`](../SIMPLIFICATION_RATIONALE.md) for the why.
>
> **Read this only as historical context.** Do not implement anything from this doc without re-validating against the current spec.

---

# Audric 2.0 — UI/UX Redesign Spec

> Companion to `AUDRIC_2_SPEC.md`. This document covers only the visual shell and interaction patterns.
> Hand each section to Claude Code as a standalone task. All implementation is in the `audric` repo.
>
> Last updated: April 13, 2026 (**archived — see banner above**)

---

## Design philosophy

Audric's UI has one job: make an autonomous financial agent feel trustworthy. Every surface decision flows from that:

- **Dark, minimal, precise** — money deserves restraint. No gradients, no decoration, no marketing energy. The aesthetic is closer to a Bloomberg terminal than a neobank. If it looks like it could run a hedge fund, it's right.
- **Proactive over reactive** — the home screen shows what Audric did, not just what you can ask it to do. The agent's work must be visible even when no action is required.
- **Earned trust, not assumed** — permission levels, trust stages, and autonomous actions are always transparent. Users can see exactly what Audric did, why, and undo it in one tap.
- **Financial data is the content** — the UI is a frame for numbers, not a product in itself. Typography and spacing exist to make $107.31 feel more trustworthy, not more exciting.

**Typeface:** `Geist` (headings + UI) + `Geist Mono` (addresses, amounts, technical values). Already in use in the codebase — this spec just extends the existing type system rather than introducing new fonts.

**Color system:** Follows `spec/DESIGN_SYSTEM.md` Section 14 (Tailwind Configuration) — N-scale neutrals with semantic accent tokens. Do not hardcode hex values; use CSS variable tokens (`--background`, `--surface`, `--border`, `--foreground`, `--muted`, `--dim`). See the Token spec section below for the full mapping. No brand color — Audric's identity is in the typography and layout, not a color.

---

## Shell architecture

The shell has two zones: a fixed left sidebar and a flexible main content area. This replaces the current slide-over panel pattern entirely.

```
┌─────────────────┬──────────────────────────────────────────┐
│                 │  TOPBAR (balance hero)                    │
│   SIDEBAR       ├──────────────────────────────────────────┤
│   210px fixed   │                                          │
│                 │  PANEL CONTENT (swaps per nav item)       │
│  Logo           │                                          │
│  New conv       │  ─ Dashboard (chat + proactive)           │
│  Search         │  ─ Portfolio (financial intelligence hub) │
│  ─────────      │      Overview / Timeline / Activity /     │
│  Nav items      │      Simulate (internal tabs)             │
│  ─────────      │  ─ Activity (feed)                        │
│  Conv history   │  ─ Pay (links + invoices + MPP)           │
│  ─────────      │  ─ Automations (trust dashboard)          │
│  User footer    │  ─ Goals                                  │
│  Allowance bar  │  ─ Reports                                │
│                 │  ─ Store (coming soon)                    │
│                 │  ─ Settings (sub-nav)                     │
│                 │                                          │
│                 │  CHIP BAR + INPUT (chat panels only)      │
└─────────────────┴──────────────────────────────────────────┘
```

**File:** `audric/app/layout.tsx` — add sidebar to root layout, replacing `SettingsPanel.tsx` slide-over.

---

## Component inventory

Every component listed here either already exists (needs moving/restyling) or is genuinely new.

### Existing — relocate or restyle

| Component | Current location | What changes |
|-----------|-----------------|--------------|
| `SettingsPanel.tsx` | `components/dashboard/` | Replaced by full `/settings` route with sub-nav. Panel removed. |
| `DashboardTabs.tsx` | `components/dashboard/` | Moves inside the Dashboard panel. No longer the page root. |
| `ActivityFeed.tsx` | `components/dashboard/` | Moves inside the Activity panel. |
| `ChipBar.tsx` | `components/dashboard/` | Add chip expansion dropdown. Stays at bottom of chat panels. |
| `BriefingCard.tsx` | `components/engine/cards/` | Moves into the Dashboard feed. |
| `CanvasCard.tsx` | `components/engine/canvas/` | No change. Already works. |
| All `*Canvas.tsx` | `components/engine/canvas/` | Referenced from Portfolio panel launcher grid. No change to canvas code. |

### New — build from scratch

| Component | Path | Description |
|-----------|------|-------------|
| `AppSidebar.tsx` | `components/shell/AppSidebar.tsx` | The full sidebar including nav, history list, user footer, allowance bar |
| `AppShell.tsx` | `components/shell/AppShell.tsx` | Wrapper that composes Sidebar + main content area |
| `NavItem.tsx` | `components/shell/NavItem.tsx` | Single nav item with icon, label, badge/dot/soon variants |
| `ConvoHistoryList.tsx` | `components/shell/ConvoHistoryList.tsx` | Scrollable conversation history list |
| `AllowanceFooterBar.tsx` | `components/shell/AllowanceFooterBar.tsx` | Budget remaining bar in sidebar footer |
| `ProactiveBanner.tsx` | `components/dashboard/ProactiveBanner.tsx` | "I've been watching your wallet" strip above tabs |
| `HandledForYou.tsx` | `components/dashboard/HandledForYou.tsx` | "Handled for you" quick-wins strip |
| `TaskCard.tsx` | `components/dashboard/TaskCard.tsx` | Unified card for Needs Input / Running / Upcoming / Done states |
| `ProposalCard.tsx` | `components/engine/cards/ProposalCard.tsx` | Structured pattern proposal (Accept/Decline) — Phase D |
| `PortfolioPanel.tsx` | `components/panels/PortfolioPanel.tsx` | Portfolio summary stats + canvas launcher grid |
| `PayPanel.tsx` | `components/panels/PayPanel.tsx` | Payment links, invoices, MPP spend grid + recent list |
| `AutomationsPanel.tsx` | `components/panels/AutomationsPanel.tsx` | Trust dashboard: patterns, trust ladder, daily spend |
| `StorePanel.tsx` | `components/panels/StorePanel.tsx` | Phase 2 sync products live (Art, Merch, Prompts, Guides, Cards) + Phase 5 async SOON (Music, Video) |
| `ChipExpand.tsx` | `components/dashboard/ChipExpand.tsx` | Dropdown from chip with 3-5 contextual suggestions |
| `PassportSection.tsx` | `components/settings/PassportSection.tsx` | Passport settings sub-section |
| `SafetySection.tsx` | `components/settings/SafetySection.tsx` | Limits + permission presets + emergency lock |
| `FeaturesSection.tsx` | `components/settings/FeaturesSection.tsx` | Allowance budget + feature toggles |
| `MemorySection.tsx` | `components/settings/MemorySection.tsx` | Financial profile + episodic memories (already exists at `/settings#memory` — move here) |
| `WalletsSection.tsx` | `components/settings/WalletsSection.tsx` | LinkedWallet management (Phase E stub) |
| `SchedulesSection.tsx` | `components/settings/SchedulesSection.tsx` | DCA + autonomous schedule list (already exists — move here) |

---

## Routes

| Route | What it is | Status |
|-------|-----------|--------|
| `/` | Landing page | Existing |
| `/new` | Dashboard — redirects to `/chat/[sessionId]` on load | Existing, update redirect |
| `/chat/[sessionId]` | Dashboard with active session | Phase A.6 — already built |
| `/settings` | Full settings page with sub-nav | Existing page — restructure with sub-nav |
| `/settings/passport` | Direct link to Passport section | New — sub-route or hash |
| `/settings/safety` | Direct link to Safety section | New |
| `/settings/features` | Direct link to Features / allowance | New |
| `/settings/memory` | Direct link to Memory section | Existing at `#memory` — promote to route |
| `/settings/wallets` | Wallets (Phase E stub) | New |
| `/settings/schedules` | Schedules management | New |
| `/pay` | Pay panel (payment links, invoices, MPP) | New |
| `/portfolio` | Portfolio panel | New |
| `/automations` | Automations / trust dashboard | New — Phase D |
| `/store` | Store panel — Phase 2 products live, Phase 5 async SOON | New |
| `/goals` | Goals panel — v1 savings goals + milestone states | New |
| `/reports` | Reports panel — income summary + wallet report + briefings | New |
| `/contacts` | Contacts panel — two-panel ADS layout | New |
| `/report/[address]` | Public wallet report | Phase E |

For the sidebar nav, these can all be client-side panel swaps (no full page navigation) to preserve the chat session state. The URL updates via `window.history.pushState` on each nav switch — same pattern as the session URL routing already built in Phase A.6.

---

## Sidebar spec

**File:** `components/shell/AppSidebar.tsx`

### Logo + actions

```tsx
// Logo — use semantic tokens, not hardcoded hex
<div className="flex items-center gap-2 mb-4">
  <span className="text-xs font-medium tracking-widest text-foreground">AUDRIC</span>
  <span className="text-[9px] bg-[var(--n700)] text-muted px-1.5 py-0.5 rounded">BETA</span>
</div>

// New conversation
<button onClick={() => router.push('/new')} className="w-full ...">
  <PlusIcon /> New conversation
</button>

// Search (opens command palette or search modal)
<button className="w-full ...">
  <SearchIcon /> Search...
</button>
```

### Nav items

```tsx
const NAV_ITEMS = [
  { key: 'dashboard',    label: 'Dashboard',    icon: ChatIcon,       badge: null },
  { key: 'portfolio',    label: 'Portfolio',    icon: BarChartIcon,   badge: null },
  { key: 'activity',     label: 'Activity',     icon: ActivityIcon,   badge: 'dot' },
  { key: 'pay',          label: 'Pay',          icon: CardIcon,       badge: null },
  { key: 'automations',  label: 'Automations',  icon: AutoIcon,       badge: 2 },    // count from active patterns
  { key: 'store',        label: 'Store',        icon: StoreIcon,      badge: 'soon' },
];
```

Badge variants:
- `null` — no badge
- `'dot'` — green dot (unread activity)
- `number` — green pill with count (active automations needing attention)
- `'soon'` — muted "SOON" text

### Conversation history

Pull from existing sessions API. Show: first user message (truncated to 40 chars), message count, relative time. Active session highlighted. Clicking loads the session.

```tsx
// Each convo item — use semantic tokens
<div
  className={cn("px-2 py-1.5 rounded-md cursor-pointer", isActive && "bg-[var(--n700)]")}
  onClick={() => loadSession(session.id)}
>
  <p className="text-[11px] text-dim truncate max-w-[155px]">{session.title}</p>
  <p className="text-[9px] text-border-bright mt-0.5">{session.msgCount} msgs · {session.relativeTime}</p>
</div>
```

### User footer

```tsx
// User row — use semantic tokens
<div onClick={() => setPanel('settings')} className="flex items-center gap-2 p-1.5 rounded-md cursor-pointer hover:bg-[var(--n700)]">
  <Avatar initial="F" />
  <div className="flex-1 min-w-0">
    <p className="text-[11px] text-muted truncate">{user.email}</p>
    <p className="text-[9px] text-dim font-mono">{truncateAddress(user.address)}</p>
  </div>
  <SettingsIcon className="text-dim" />
</div>

// Allowance budget bar
<div className="mt-1.5 px-1">
  <div className="flex justify-between text-[9px] text-dim mb-1">
    <span>Features budget</span>
    <span className="text-muted">${remaining} · ~{daysLeft}d</span>
  </div>
  <div className="h-[2px] bg-surface rounded-full overflow-hidden">
    <div className="h-full bg-[var(--color-success)]/30 rounded-full" style={{ width: `${pct}%` }} />
  </div>
</div>
```

Data source: `GET /api/allowance/[address]` — already exists.

---

## Topbar (balance hero)

Stays at the top of the main content area across all panels. Shows the total portfolio value always.

```tsx
<header className="flex items-center justify-between px-4 py-2.5 border-b border-border">
  <div className="w-12" /> {/* spacer */}

  <div className="text-center">
    <h1 className="text-[32px] font-light tracking-tight text-foreground">
      {formatUsd(totalPortfolio)}
    </h1>
    <div className="flex items-center justify-center gap-2 text-[10px] text-muted mt-0.5">
      <span className="text-dim">available {formatUsd(available)}</span>
      <span className="text-border">·</span>
      <span className="text-dim">earning {formatUsd(earning)}</span>
      <span className="text-border">·</span>
      <button className="text-[var(--color-warning)]">DEBT {formatUsd(debt)} ▼</button>
    </div>
  </div>

  <div className="flex items-center gap-1.5">
    <NotificationIconBtn />
    <SettingsIconBtn onClick={() => setPanel('settings')} />
  </div>
</header>
```

Data source: `balance_check` pre-fetched at session start (Phase A.1, already built). No new API call needed.

---

## Dashboard panel

This is the default view. Replaces the current `UnifiedTimeline` as the home screen.

### Three feed states

The dashboard renders one of three states depending on session context. The **layout differs structurally** between states — not just the content.

```
STATE A — Returning user (has conversation history + active thread)
┌────────────────────────────────────────┐
│  ProactiveBanner (conditional)         │
│  CHAT | ACTIVITY tabs                  │
├────────────────────────────────────────┤
│  HandledForYou strip                   │
│  TaskCard feed (Needs Input / Running) │
├────────────────────────────────────────┤
│  Row 1: contextual chips               │
│  Row 2: SAVE SEND SWAP ASK CREDIT...   │
│  Input                                 │
└────────────────────────────────────────┘

STATE B — New conversation (returning user, empty thread)
STATE C — First login (brand new user)
┌────────────────────────────────────────┐
│  (ProactiveBanner hidden)              │
│  CHAT | ACTIVITY tabs                  │
├────────────────────────────────────────┤
│                                        │
│         Greeting / welcome title       │
│         Sub-line (live stats or desc)  │
│         [zkLogin callout — C only]     │
│                                        │
│    ┌──────────────────────────────┐    │
│    │  Ask anything...          ↑  │    │
│    └──────────────────────────────┘    │
│                                        │
│    SAVE  SEND  SWAP  ASK  CHARTS       │
│    (chips open downward into space)    │
│                                        │
├────────────────────────────────────────┤
│  (bottom chip bar + input hidden)      │
└────────────────────────────────────────┘
```

The key structural difference: **states B and C own their own input and chips inside the feed area**. The bottom chip bar and input are hidden. When the user sends their first message, transition to State A (the bottom bar reappears, the centred block is replaced by the conversation thread).

**State detection logic** (in `AppShell` before render):

```tsx
type DashboardState = 'returning' | 'new_conversation' | 'first_login';

function getDashboardState(session: Session, messages: Message[]): DashboardState {
  if (!session.hasEverSentMessage) return 'first_login';
  if (messages.length === 0)        return 'new_conversation';
  return 'returning';
}

// session.hasEverSentMessage: persisted to DB on first engine call — never resets
// messages: current conversation thread from engine state in AppShell
```

---

**State A — Returning user:** Full feed layout. `HandledForYou` strip + `TaskCard` feed. Bottom chip bar + input visible. Row 1 contextual chips populated from pre-fetch data. This is the normal logged-in state after any conversation has started.

---

**State B — New conversation:** Centred layout. The input sits in the middle of the viewport. Above it: greeting title + live stats sub-line drawn from session pre-fetch (`$107.31 · earning $0.001/day · 2 automations running`). Below it: action verb chips (SAVE, SEND, SWAP, ASK, CHARTS) with their expansion dropdowns opening **downward** into the open space. Bottom chip bar and input are hidden. ProactiveBanner is hidden.

The chips here are the same action verbs as the bottom bar but in a more discoverable position — they answer "what can I do?" without the user having to ask. The dropdowns are identical to the bottom bar dropdowns.

Row 1 contextual chips (e.g. `SAVE $106 IDLE — 4.3%`) are **not** shown in this layout — the centred design has no room for a horizontal scroll row and the action chips below the input already cover the same ground.

```tsx
// NewConversationView.tsx
// Shown when: messages.length === 0 && session.hasEverSentMessage === true

interface NewConversationViewProps {
  userName: string;
  netWorth: number;
  dailyYield: number;
  automationCount: number;
  onSend: (prompt: string) => void;
}
```

---

**State C — First login:** Centred layout, same structure as State B with two differences:

1. **zkLogin moat callout** sits between the greeting and the input: "No seed phrase, ever — your Google login controls your Sui wallet via zkLogin." This is the single best moment to deliver this message — the user has just authenticated and their wallet just materialised. Show it once, never again.

2. **Simplified chips**: BALANCE, SAVE, RECEIVE, TOUR — no dropdowns. These are direct single-action chips for a user who doesn't know what's possible yet. No expansion needed; clicking one fires the prompt immediately.

Row 1 contextual chips are hidden — there's no pre-fetch balance data yet to populate `SAVE $106 IDLE — 4.3%`. Showing that chip with $0 would look broken.

```tsx
// FirstLoginView.tsx
// Shown when: session.hasEverSentMessage === false (new account)

const FIRST_LOGIN_CHIPS = [
  { label: 'BALANCE', prompt: 'What is my current balance and portfolio?' },
  { label: 'SAVE',    prompt: 'Save $50 USDC into NAVI savings at the current APY' },
  { label: 'RECEIVE', prompt: 'Show me my wallet address and QR code for receiving USDC' },
  { label: 'TOUR',    prompt: 'What can you do? Give me a full tour of Audric' },
];
// No dropdown — direct fire on click
```

---

### Transition: blank → conversation

When the user sends their first message from State B or C:

```tsx
// In AppShell, on first message send:
// 1. session.hasEverSentMessage = true (persist to DB)
// 2. Animate the centred block sliding up / fading out
// 3. Show the bottom chip bar + input
// 4. Render the first user message bubble at top of feed
// 5. Engine response streams in below it

// No page reload, no navigation — pure React state transition
// Same engine session maintained throughout (AppShell-level state)
```

---

### New files

```
components/dashboard/NewConversationView.tsx   ← State B centred layout
components/dashboard/FirstLoginView.tsx        ← State C centred layout + zkLogin callout
```

The `SuggestionCard` component from the previous design is **replaced** by the chip expansion pattern — chips below the input are more consistent with the rest of the UI and already have the prompt infrastructure built. No `SuggestionCard.tsx` needed.

---

### Layer order (State A only)

1. `ProactiveBanner` — pattern proposals or morning briefing teaser
2. Sub-tabs: CHAT | ACTIVITY (with unread dot)
3. `HandledForYou` strip
4. `TaskCard` feed
5. Row 1 contextual chips + Row 2 action verb chips with expansion
6. Input

---

## Engine conversation UX

The agent execution flow is Audric's strongest trust signal. Every step is visible, every token counted, every decision explained. The live product already has the right pattern — this section documents it precisely so it can be maintained and extended consistently.

### Full execution sequence

```
User sends message
        ↓
─────── TASK INITIATED ───────  (centred divider, lines either side)
User message bubble (right-aligned, N700 bg, border-radius 16/16/4/16)
        ↓
▼ HOW I EVALUATED THIS          (accordion — open by default on first turn)
┌─────────────────────────────┐
│ Depositing $1 USDC into     │  (monospace body, N800 bg card with border)
│ savings. Session context... │
└─────────────────────────────┘
94 tokens  (left-aligned, body 11px, dim)
        ↓
✓ 🏦 DEPOSIT                    (green circle check + emoji + mono uppercase)
        ↓
┌─────────────────────────────┐
│ TRANSACTION                 │  (type header, mono 9px, dim)
│ Deposited          1.00 USDC│  (label left, value right, mono)
│ 5PpYfasB...MAvKPR  Suiscan ↗│  (hash left, link right)
└─────────────────────────────┘
        ↓
✦ Deposited $1.00 USDC...      (sparkle prefix, Geist 14px, streams in)
  Ring goal reference bold.
        ↓
58 tokens  (left-aligned)
        ↓
💰 CHECK BALANCE   📊 VIEW RATES   (full-size contextual chips with icons)
        ↓
"Ask a follow up..."  (input placeholder changes after first turn)
```

### TASK INITIATED divider

```tsx
// ADS Chat Divider — fires on every new user message
// Centred label with horizontal lines either side (flex + ::before/::after)
// Departure Mono uppercase, dim colour, 9px, letter-spacing .12em

<div className="chat-divider">
  <span className="chat-divider-label">TASK INITIATED</span>
</div>
```

CSS requirement — both lines must render:
```css
.chat-divider {
  display: flex;           /* ← required — without this the lines don't show */
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}
.chat-divider::before,
.chat-divider::after {
  content: '';
  flex: 1;
  height: 0.5px;
  background: var(--border);
}
```

### User message bubble

```tsx
// Right-aligned flex container
// N700 bg (#363636), border-radius: 16px 16px 4px 16px
// Geist 14px, foreground colour, line-height 1.5
// Max-width 78% of chat area — no avatar

<div className="flex justify-end mb-3">
  <div className="user-bubble">
    Save $1 USDC into savings.
  </div>
</div>
```

### Reasoning accordion — "How I evaluated this"

```tsx
// Component: ReasoningAccordion.tsx
// Source: thinking_delta events from AnthropicProvider stream
// OPEN by default on the first turn of a session (user sees transparency immediately)
// Collapsed on subsequent turns — respects progressive disclosure

// The body is a CARD (N800 bg + border), NOT inline text
// Content: condensed thinking summary — NOT raw chain-of-thought
// Monospace font in the body — signals "internal log", not a user-facing message
// Hide entirely if no thinking data present

interface ReasoningAccordionProps {
  content: string;        // condensed thinking summary
  defaultOpen?: boolean;  // true on first turn, false on subsequent
}

// Collapsed:
<div className="reasoning-row" onClick={toggle}>
  <span className="reasoning-chevron">▶</span>
  <span className="reasoning-label">How I evaluated this</span>
</div>

// Expanded:
<div className="reasoning-row" onClick={toggle}>
  <span className="reasoning-chevron">▼</span>
  <span className="reasoning-label">How I evaluated this</span>
</div>
<div className="reasoning-body">
  {content}
</div>

// reasoning-label: Departure Mono uppercase, 10px, letter-spacing .1em, --muted
// reasoning-body:  N800 bg card + 0.5px border, padding 12px,
//                  font-mono 12px, --muted, line-height 1.7
```

### Token count

```tsx
// Component: TokenCount.tsx
// Position: LEFT-ALIGNED, below the reasoning card and below the AI response
// Two placements per turn: after reasoning (input tokens) + after response (output tokens)

// Styling: font-body 11px, left-aligned, --dim colour
// Shows: "94 tokens" / "58 tokens" — never dollar cost, never "used X credits"
// Source: engine SSE events — token counts from AnthropicProvider

<span className="token-count">94 tokens</span>
```

### Tool call rows

```tsx
// Component: ToolCallRow.tsx
// In-flight state: spinner replaces the green circle
// Complete state: green filled circle ✓ + emoji icon + Departure Mono name

// In-flight:
<div className="tool-row">
  <div className="tool-spinner" />      // ADS circular spinner
  <div className="tool-ico">🏦</div>
  <span className="tool-name-label">DEPOSIT</span>
</div>

// Complete:
<div className="tool-row">
  <div className="tool-check-circle">✓</div>   // green filled circle, white bold ✓
  <div className="tool-ico">🏦</div>
  <span className="tool-name-label">DEPOSIT</span>
</div>

// tool-check-circle: 16px circle, background var(--color-success), white ✓ inside
// tool-name-label: Departure Mono uppercase, 10px, letter-spacing .1em, --muted
// Parallel tools: render multiple rows simultaneously (both in-flight, both complete)
```

### Tool result cards

```tsx
// Component: ToolResultCard.tsx — dispatches to type-specific sub-components
// All cards: N800 bg, 0.5px border, border-radius 8px, overflow hidden

type ToolResultCardType =
  | 'transaction'   // deposit, send, swap, borrow, repay
  | 'balance'       // balance_check, rates_info, savings_info
  | 'canvas'        // draw_canvas — renders the interactive widget
  | 'activity'      // activity_summary
  | 'analysis'      // portfolio_analysis
  | 'search'        // web_search results
  | 'briefing';     // morning_briefing

// ── TRANSACTION CARD (table layout — matches live product) ──
// TRANSACTION header (mono 9px dim, full-width row with bottom border)
// Deposited         1.00 USDC   (label body left, value mono right)
// 5PpYfasB...MAvKPR  View on Suiscan ↗  (hash dim left, link right)

<div className="trc transaction-card">
  <div className="trc-type">Transaction</div>
  <div className="trc-table-row">
    <span className="trc-table-label">Deposited</span>
    <span className="trc-table-value">1.00 USDC</span>
  </div>
  <div className="trc-table-row" style={{ borderBottom: 'none' }}>
    <span className="trc-hash">5PpYfasB...MAvKPR</span>
    <a className="trc-link">View on Suiscan ↗</a>
  </div>
</div>

// trc-type: mono 9px uppercase, dim, bottom border, padding 8px 12px
// trc-table-row: flex space-between, 13px, padding 8px 12px, bottom border
// trc-table-label: body, --muted
// trc-table-value: mono, --foreground
// trc-hash: mono 11px, --dim
// trc-link: mono 11px, --color-info


// ── BALANCE CARD (4-column grid — matches live product screenshot) ──
// Shown after balance_check tool call
// Total / Cash / Savings / Debt in a horizontal grid
// Savings = --color-success (green), Debt = --color-warning (orange)
// USDC breakdown sub-row at bottom

<div className="trc trc-balance">
  <div className="trc-type">Balance</div>
  <div className="trc-balance-grid">
    <div className="trc-balance-col">
      <div className="trc-balance-label">Total</div>
      <div className="trc-balance-val">$107.03</div>
    </div>
    <div className="trc-balance-col">
      <div className="trc-balance-label">Cash</div>
      <div className="trc-balance-val">$106.03</div>
    </div>
    <div className="trc-balance-col">
      <div className="trc-balance-label">Savings</div>
      <div className="trc-balance-val green">$1.01</div>
    </div>
    <div className="trc-balance-col">
      <div className="trc-balance-label">Debt</div>
      <div className="trc-balance-val orange">$0.00</div>
    </div>
  </div>
  <div className="trc-balance-subrow">
    <span>USDC</span>
    <span>106.0555 · $106.03</span>
  </div>
</div>

// trc-balance-grid: grid, 4 equal columns, right border between cols
// trc-balance-col: padding 8px 12px, right border (except last)
// trc-balance-label: body 11px, --dim
// trc-balance-val: mono 15px medium, --foreground
// trc-balance-val.green: --color-success
// trc-balance-val.orange: --color-warning
// trc-balance-subrow: flex space-between, mono 10px, --dim, top border

// ── CANVAS CARD ──
// ANALYTICS/SIMULATOR label + canvas name + ⛶ expand icon (header)
// Preview content below (mini heatmap, stat summary etc.)

<div className="trc canvas-card-result">
  <div className="trc-canvas-header">
    <span className="trc-type" style={{ margin: 0 }}>Analytics</span>
    <span className="canvas-title">On-Chain Activity</span>
    <span className="trc-expand" onClick={openFullCanvas}>⛶</span>
  </div>
  <div className="canvas-preview">
    {/* rendered canvas or preview thumbnail */}
  </div>
</div>

// trc-canvas-header: flex row, gap 8px, subtle bg (rgba white .015), bottom border
// trc-expand: margin-left auto, 13px, --dim, cursor pointer
// ⛶ click → fires the same prompt into chat to open the full interactive canvas
```

### AI response text

```tsx
// Left-aligned, full width, no bubble
// ✦ sparkle prefix in --color-success (green) — signals agent output
// Geist 14px, --muted colour, line-height 1.75
// Streams token by token during generation
// Goal names, key entities bolded inline where relevant

<div className="agent-response">
  <span className="response-sparkle">✦</span>
  Deposited $1.00 USDC into NAVI savings.
  <br /><br />
  You still have ~$105.28 idle USDC in your wallet — depositing
  more would help pace toward your <strong>Ring</strong> goal
  ($100 target by Aug 2026).
</div>

// response-sparkle: --color-success, 12px, margin-right 4px
// Never show ✦ until streaming starts — avoids a flash of the icon with no text
```

### Follow-up chips

```tsx
// Appear AFTER streaming completes — not during
// Same visual weight as the bottom bar action chips
// Icon + label, Departure Mono uppercase, pill shape
// 2–3 chips max — curated by the engine based on what actions make sense next
// Background: var(--n800) filled, border: 0.5px border-bright
// Exact sizing to be confirmed against live product during React implementation

// Use chip-contextual class — same as Row 1 smart chips
<div className="follow-up-chips">
  <div className="chip-contextual" onClick={() => send('Check my current balance')}>
    <span className="chip-icon">💰</span> Check balance
  </div>
  <div className="chip-contextual" onClick={() => send('Save the remainder of my idle USDC')}>
    <span className="chip-icon">🏦</span> Save remainder
  </div>
</div>

// Input placeholder changes after first turn:
// Empty state:  "Ask anything..."
// After turn 1: "Ask a follow up..."
```

### Input placeholder state

```tsx
// ChatInput.tsx — placeholder and send button driven by conversation state
const placeholder = messages.length === 0 ? 'Ask anything...' : 'Ask a follow up...';

// Send button state:
// Empty input → N700 bg (dark, inactive)
// Has content → N100 bg (white, active) — matches live product
const sendActive = inputValue.length > 0;

// Input sizing — matches live product screenshots:
// min-height: 52px
// border: 1px solid var(--border) → var(--n400) on focus
// border-radius: var(--r-xl) — 16px
// padding: 12px 12px 12px 16px
// font-size: 15px Geist (ADS Body Md)

// + button — plain character, NOT a bordered icon box:
// <button className="chat-input-plus">+</button>
// font-size: 18px, font-weight: 300, color: var(--n600)
// No border, no background — just the character

// Send button — solid circle:
// 34px circle, background N700 (empty) → N100 (has content)
// Arrow: upward-pointing triangle (border-left/right + border-bottom trick)
// Arrow color: var(--n900) so it shows on white background
```

### Complete component list

```
components/engine/
├── ConversationThread.tsx      ← scrollable message container
├── UserMessage.tsx             ← right-aligned bubble, N700 bg
├── AgentResponse.tsx           ← ✦ prefix, streams in, bold entity names
├── ReasoningAccordion.tsx      ← ▼ HOW I EVALUATED THIS, card body, open first turn
├── ToolCallRow.tsx             ← spinner → green circle ✓ + emoji + name
├── TokenCount.tsx              ← left-aligned, body 11px, dim, two placements/turn
├── FollowUpChips.tsx           ← full-size contextual chips, appear post-stream
└── cards/
    ├── TransactionCard.tsx     ← table layout: type header + label/value rows
    ├── BalanceCard.tsx         ← balance, rates, savings info
    ├── CanvasCard.tsx          ← header + preview + ⛶ expand
    ├── ActivityCard.tsx        ← activity summary
    ├── PortfolioCard.tsx       ← portfolio analysis
    ├── SearchCard.tsx          ← web search results
    └── ProposalCard.tsx        ← automation proposal (4 variants)
```

### Design principles

**The divider is a clock, not a label.** "TASK INITIATED" with lines either side signals a clean break — a new unit of work starting. It orients the user in long conversations and makes it easy to scroll back and find where specific tasks began.

**Transparency first, detail on demand.** The reasoning accordion is open on the first turn so every new user immediately sees the agent thought before acting. After that it stays closed unless the user wants to dig in. Progressive disclosure — the internals are always one tap away, never forced.

**The green circle is a heartbeat.** The `✓` in a green filled circle is the moment of completion — the tool executed, the transaction happened, the action is done. It must be visually distinct from the preceding spinner so the state change registers immediately. This is the moment users feel trust.

**Token counts are receipts, not warnings.** Left-aligned, dim, body text — not monospace, not right-aligned, not prominent. They answer "what did that cost?" for users who think about it, without making users who don't think about it feel anxious. The answer is always tokens, never dollars.

**Follow-up chips close the loop.** The agent's response text and the chips below it are one continuous thought. "You still have $105 idle... [💰 Check balance]" is a complete sentence — the chip is the natural next action, not a navigation element. They appear only after streaming ends so they don't interrupt the reading experience.

---





### ProactiveBanner

```tsx
// Show when: detected pattern with confidence > 0.8 not yet surfaced
// Falls back to: morning briefing teaser if no pattern
// Hides when: dismissed or after pattern accepted/declined

interface ProactiveBannerProps {
  type: 'pattern' | 'briefing' | null;
  text: string;        // e.g. "You've saved ~$50 three Fridays in a row. Want me to automate it?"
  actionLabel: string; // "Review →" | "View briefing →"
  onAction: () => void;
}
```

Data source:
- Patterns: `GET /api/automations/pending-proposals` (new route, Phase D)
- Briefing: existing `GET /api/user/briefing`

### HandledForYou strip

```tsx
// Show last 3 items from:
// - ScheduledExecution records (autonomous actions)
// - AppEvent where type in ['compound', 'rate_alert', 'briefing']
// from last 48 hours

<div className="bg-[#0a150a] border border-[#1a2a1a] rounded-[8px] p-2 mx-3 mb-1.5">
  <p className="text-[9px] tracking-widest text-[#4ade80] mb-1.5">HANDLED FOR YOU</p>
  {items.map(item => (
    <div key={item.id} className="flex items-center gap-2 text-[10px] text-[#666] py-0.5">
      <Checkmark />
      {item.label}
    </div>
  ))}
</div>
```

### TaskCard

Unified card for all proactive states. Replaces the BriefingCard + PermissionCard in the feed.

```tsx
type TaskCardStatus = 'needs_input' | 'running' | 'upcoming' | 'done';

interface TaskCardProps {
  status: TaskCardStatus;
  title: string;
  description: string;
  timeLabel: string;          // "by Friday 9am" | "next: Mon 9am"
  progress?: number;          // 0-1, shows progress bar if set
  primaryAction?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
}
```

Status → color map:
```
needs_input → bg-[#2a1200] text-[#f97316]    "NEEDS YOUR INPUT"
running     → bg-[#001525] text-[#60a5fa]    "RUNNING"
upcoming    → bg-[#150018] text-[#a78bfa]    "UPCOMING"
done        → bg-[#0a1500] text-[#4ade80]    "COMPLETE"
```

---

## Chip bar with expansion

The key UX upgrade from the current chip bar. Each chip opens a dropdown of 3-5 concrete, pre-populated suggestions.

```tsx
interface ChipAction {
  label: string;       // "Save $50 USDC"
  sublabel: string;    // "deposit into NAVI at 5% APY"
  prompt: string;      // sent to engine on click
}

interface ChipConfig {
  id: string;
  label: string;       // "SAVE"
  actions: ChipAction[];
}
```

**Chip configs** (defined in `lib/chip-configs.ts`, data-driven so amounts update from pre-fetch):

```typescript
export function buildChipConfigs(prefetch: SessionPrefetch): ChipConfig[] {
  const idleUsdc = prefetch.balance.available;
  const currentApy = prefetch.rates.usdc;

  return [
    {
      id: 'save',
      label: 'SAVE',
      actions: [
        {
          label: 'Save $50 USDC',
          sublabel: `deposit into NAVI at ${currentApy}% APY`,
          prompt: 'Save $50 USDC into savings',
        },
        {
          label: `Save all idle USDC`,
          sublabel: `$${idleUsdc.toFixed(0)} sitting in wallet`,
          prompt: 'Save all my idle USDC',
        },
        {
          label: 'Automate weekly saves',
          sublabel: 'every Friday at 9am',
          prompt: 'Set up automatic weekly savings of $50 every Friday',
        },
        {
          label: 'Check savings rate',
          sublabel: 'live NAVI APY',
          prompt: 'What is my current savings APY?',
        },
      ],
    },
    {
      id: 'send',
      label: 'SEND',
      actions: [
        { label: 'Send to contact', sublabel: 'from your saved contacts', prompt: 'Send $10 USDC to a contact' },
        { label: 'Send to address', sublabel: 'paste any Sui wallet', prompt: 'Send USDC to a Sui address' },
        { label: 'Create payment link', sublabel: 'share to receive USDC', prompt: 'Create a payment link for $50' },
      ],
    },
    {
      id: 'swap',
      label: 'SWAP',
      actions: [
        { label: 'SUI → USDC', sublabel: 'Cetus quote preview', prompt: 'Swap 10 SUI to USDC and show me the quote first' },
        { label: 'Best rates now', sublabel: 'live market prices', prompt: 'What are the best swap rates right now?' },
        { label: 'Swap all SUI', sublabel: 'see quote, then confirm', prompt: 'Swap all my SUI to USDC' },
      ],
    },
    {
      id: 'ask',
      label: 'ASK',
      actions: [
        { label: 'Health factor check', sublabel: 'liquidation risk analysis', prompt: 'What is my health factor and am I at risk of liquidation?' },
        { label: 'This month\'s yield', sublabel: 'NAVI earnings breakdown', prompt: 'How much yield have I earned this month?' },
        { label: 'Save vs stay liquid?', sublabel: 'personalised advice', prompt: 'Should I save more or keep my USDC liquid?' },
        { label: 'What can you automate?', sublabel: 'full autonomy overview', prompt: 'What can Audric automate for me?' },
      ],
    },
    {
      id: 'pay',
      label: 'PAY',
      actions: [
        { label: 'Create payment link', sublabel: 'shareable link to receive USDC', prompt: 'Create a payment link for $50 USDC' },
        { label: 'Create invoice', sublabel: 'with line items and due date', prompt: 'Create an invoice for $500 for design work due May 1' },
        { label: 'Payment history', sublabel: 'MPP spend + links + invoices', prompt: 'Show me my recent payments and API spend' },
        { label: 'What can you pay for?', sublabel: '40+ services via MPP', prompt: 'What services can Audric pay for?' },
      ],
    },
    {
      id: 'charts',
      label: 'CHARTS',
      actions: [
        { label: 'Full portfolio', sublabel: '4-panel financial overview', prompt: 'Show me my full portfolio canvas' },
        { label: 'Activity heatmap', sublabel: 'transaction history grid', prompt: 'Show my activity heatmap' },
        { label: 'Yield projector', sublabel: 'simulate future earnings', prompt: 'Show my yield projector' },
        { label: 'Portfolio timeline', sublabel: 'net worth over time', prompt: 'Show my portfolio timeline for the last 90 days' },
      ],
    },
  ];
}
```

**Expansion behaviour:**
- Tap/click chip → dropdown appears above the chip bar
- Tap elsewhere → closes
- Tap an action → sends the prompt string to the engine, closes dropdown
- Only one chip open at a time
- On mobile: dropdown expands upward with max-height and scroll if needed

---

## Portfolio panel

Portfolio is a **financial intelligence hub**, not just a canvas launcher. It's the most-visited panel after Dashboard — users open it to understand their current position without asking a question. It must deliver immediate value on load, then let users drill into any dimension.

### Architecture

Four internal tabs, each mapping to a canvas group:

| Tab | What it shows | Primary canvas |
|-----|--------------|----------------|
| **Overview** | Net worth hero + 4-stat grid + allocation bar + agent insights + canvas grid | `full_portfolio` |
| **Timeline** | Net worth over time, period selector | `portfolio_timeline` |
| **Activity** | On-chain transaction heatmap | `activity_heatmap` |
| **Simulate** | Yield projector + health simulator + DCA planner | `yield_projector`, `health_simulator`, `dca_planner` |

Tab switching is client-side — no navigation, no page reload. Each tab fires its canvas prompt into chat on first open if data isn't already loaded. Deep-link format: `/portfolio/simulate` opens the Simulate tab directly (useful for email deep-links from health factor alerts).

### Overview tab — spec

```tsx
// PortfolioPanel.tsx

interface PortfolioPanelProps {
  netWorth: number;
  netWorthChange: number;       // absolute $ change
  netWorthChangePct: number;    // percentage change
  netWorthPeriod: string;       // "this week" | "this month"
  savings: number;
  savingsApy: number;
  dailyYield: number;
  wallet: number;
  idleUsdc: number;
  healthFactor: number | null;
  debt: number;
  activityCount30d: number;
  activeDays30d: number;
  peakActivity: number;
  spendTotal: number;
  spendRequests: number;
  allocation: Array<{ label: string; pct: number; color: string }>;
  insights: string[];           // agent-generated, from session pre-fetch
}
```

**Net worth hero:**
```tsx
<div className="flex items-baseline justify-between mb-3">
  <div className="text-[36px] font-light tracking-tight">{formatUsd(netWorth)}</div>
  <div className="text-right">
    <div>
      <span className="text-[#3cc14e] font-mono text-[12px]">
        ▲ {netWorthChangePct.toFixed(1)}%
      </span>
      <span className="text-[#555] text-[11px] ml-1">{netWorthPeriod}</span>
    </div>
    <div className="text-[10px] text-[#444] font-mono mt-0.5">
      {formatUsd(dailyYield)}/day earning
    </div>
  </div>
</div>
```

**4-stat drill-down grid** — each card fires a canvas prompt on click:
```tsx
const statCards = [
  {
    label: 'SAVINGS',
    value: formatUsd(savings),
    sub: `${savingsApy.toFixed(2)}% APY`,
    trend: `${formatUsd(dailyYield)}/day`,
    drillLabel: 'NAVI →',
    prompt: 'Show me my savings position and NAVI yield details',
  },
  {
    label: 'HEALTH',
    value: healthFactor?.toFixed(1) ?? '—',
    valueColor: healthFactor && healthFactor > 2 ? '#3cc14e' : '#f97316',
    sub: debt > 0 ? `${formatUsd(debt)} debt` : '$0 debt',
    trend: 'No liquidation risk',
    drillLabel: 'Simulate →',
    prompt: 'Open the health factor simulator',
  },
  {
    label: 'ACTIVITY (30D)',
    value: activityCount30d.toLocaleString(),
    sub: `${activeDays30d} active days`,
    trend: `Peak ${peakActivity}/day`,
    drillLabel: 'Heatmap →',
    prompt: 'Show my on-chain activity heatmap for the past year',
  },
  {
    label: 'SPENDING',
    value: formatUsd(spendTotal),
    sub: `${spendRequests} requests`,
    trend: 'This month',
    drillLabel: 'Breakdown →',
    prompt: 'Show my API spending breakdown by category',
  },
];
```

**Allocation bar** — visual answer to "where is my money?":
```tsx
// allocation array: [{ label: 'Wallet USDC', pct: 99, color: '#363636' }, { label: 'NAVI Savings', pct: 1, color: '#3cc14e' }]
// Computed from: balance.available vs savings vs other assets
// Updates from session pre-fetch — no new API call needed
```

**"Audric noticed" insights strip** — passive agent intelligence, shown without requiring a chat message:
```tsx
// Source: generated during session pre-fetch by a lightweight prompt
// Pattern: pull 3 observations from the same data the morning briefing uses
// Reuse the same buildProactivenessInstructions() logic from engine-context.ts
// Store in session state — don't re-generate on every Portfolio open

const insights = generatePortfolioInsights({
  idleUsdc,        // → "idle USDC earning 0%" insight
  savingsVsGoal,   // → "goal trajectory" insight
  allocation,      // → "concentration risk" insight
  hf,              // → "health factor safe / at risk" insight
  pendingIncome,   // → "payment received / store sale, save it?" insight
});

// Each insight is one sentence, plain English, no emoji
// Max 3 insights. Only show if confidence > threshold.
// Examples from live product:
// "→ $106.28 idle USDC in wallet. Saving it would earn ~$4.5/year at 4.32% APY."
// "→ Thailand goal is $380 below target with 4 months to go. Current rate falls short."
// "→ Portfolio concentrated in a single asset (USDC 99%). No diversification exposure."
// New Pay/Store examples:
// "→ $50 received via payment link yesterday is sitting idle. Save it to start earning."
// "→ $13.80 store earnings this week. Saving it would earn $0.60/year at 4.3% APY."
```

**Canvas tool grid** — 2×3 grid of canvas launchers grouped by type:
```tsx
const ANALYTICS_CANVASES = [
  { type: 'ANALYTICS', title: 'Net worth timeline',  desc: 'Wallet / savings / debt over time', action: '7D 30D 90D 1Y →', prompt: 'Show my portfolio timeline for the last 90 days' },
  { type: 'ANALYTICS', title: 'Activity heatmap',     desc: 'GitHub-style transaction grid',      action: 'Full year view →', prompt: 'Show my on-chain activity heatmap' },
  { type: 'ANALYTICS', title: 'Spending breakdown',   desc: 'MPP API spend by service',           action: 'Week/Month/Year →', prompt: 'Show my spending breakdown by category' },
];

const SIMULATOR_CANVASES = [
  { type: 'SIMULATOR', title: 'Yield projector',    desc: 'Simulate compound returns with sliders', action: 'Adjust amount + APY →', prompt: 'Show the yield projector' },
  { type: 'SIMULATOR', title: 'Health simulator',   desc: 'Model borrow scenarios before executing', action: 'Collateral + debt sliders →', prompt: 'Open the health factor simulator' },
  { type: 'SIMULATOR', title: 'DCA planner',        desc: 'Recurring savings projection',            action: 'Set amount + cadence →', prompt: 'Show me a DCA savings plan: $200 per month for 2 years' },
];

// Full portfolio canvas — full-width row at bottom
const FULL_OVERVIEW = {
  type: 'OVERVIEW', title: 'Full portfolio overview',
  desc: '4-panel canvas: savings, health, activity, spending',
  prompt: 'Show me my full portfolio overview',
};
```

Clicking any canvas card calls `sendToEngine(prompt)` which:
1. Switches the active panel back to Dashboard
2. Fires the message into the engine
3. The canvas renders inline in chat as it always has

### Data sources

All data comes from the **session pre-fetch** already built in Phase A.1 — no new API calls on panel open. The Portfolio panel reads from `SessionPrefetch` which already contains balance, savings, health factor, and rates. `activityCount30d` comes from `activity_summary` tool (already exists). `spendTotal` comes from `spending_analytics` tool (already exists).

The only new computation is `generatePortfolioInsights()` — a pure function over the pre-fetch data that returns 1-3 plain English observations. It runs once at session start and stores results in session state.

### New file

```
audric/apps/web/components/panels/PortfolioPanel.tsx   — full panel including tabs
audric/apps/web/lib/portfolio-insights.ts              — generatePortfolioInsights() pure function
```

**Effort:** ~2.5 days (up from 2). The stats grid and canvas launcher are unchanged. New work: tab structure, allocation bar, insights strip, `generatePortfolioInsights()`, deep-link routing for `/portfolio/[tab]`.

---

## Pay panel

Pay has three distinct surfaces: the **dashboard panel** (manage your links and see MPP spend), the **public payment page** (`audric.ai/pay/[slug]`), and the **creation flow** (in-chat). All three feed into the same activity feed and portfolio data layer.

### Creation flow — the primary UX

The fastest path to a payment link or invoice is chat. The RECEIVE chip expansion and the Pay panel both funnel here.

```
"Create a payment link for $50 — logo design work"
→ Engine creates PaymentLink record
→ Returns PaymentLinkCard inline in chat:
  ┌─────────────────────────────────┐
  │ 🔗 Payment link created         │
  │ Logo design work · $50.00 USDC  │
  │ audric.ai/pay/abc123            │
  │ [Copy link]  [Share]  [View →]  │
  └─────────────────────────────────┘
→ Follow-up chips: [Create another] [View all links →]

"Create an invoice for $500 for design work due May 1"
→ Engine creates Invoice record
→ Returns InvoiceCard:
  ┌─────────────────────────────────┐
  │ 📄 Invoice #0042                │
  │ Design work · $500.00 USDC      │
  │ Due: May 1, 2026                │
  │ [Share link]  [PDF]  [View →]   │
  └─────────────────────────────────┘
```

Both card types show inline in the chat feed — the user never leaves the conversation to create or share.

### Dashboard panel layout

```tsx
// 2×2 stat grid (top)
const payCards = [
  { label: 'PAYMENT LINKS', value: activeLinks, sub: `${paidThisMonth} paid this month`, drill: 'Create →', prompt: 'Create a new payment link' },
  { label: 'INVOICES',      value: activeInvoices, sub: `${overdueCount} overdue`, drill: 'Create →', prompt: 'Create an invoice' },
  { label: 'RECEIVED',      value: formatUsd(receivedThisMonth), sub: 'this month via links + invoices', drill: 'History →', prompt: 'Show my payment received history' },
  { label: 'API SPEND',     value: formatUsd(mppSpendToday), sub: 'today · 40+ services', drill: 'Breakdown →', prompt: 'Show my API spending breakdown' },
];

// Recent list (below grid)
// Merged feed: PaymentLink + Invoice + ServicePurchase + AppEvent(type:pay)
// Each row is clickable → fires explain prompt
```

### Public payment page — `audric.ai/pay/[slug]`

Five states spec'd in full — see Pay panel section. Key acquisition mechanic: "Try Audric →" on every state including Paid. The person who just paid is the warmest lead possible.

### How Pay bubbles up to the rest of the app

**Dashboard:** When a payment link is paid, a `HandledForYou` item appears: `Received $50 USDC · Logo design work`. If the received amount is idle (not saved), a ProactiveBanner fires: "You received $50 USDC. Save it to start earning 4.3% APY?"

**Activity:** Every payment received (`type: pay_received`) and every payment link created (`type: pay_link_created`) appears in the Activity feed with its own filter chip. The Autonomous filter also shows when Audric auto-created a receipt or sent an overdue invoice reminder.

**Portfolio:** Received USDC adds to `balance.available` immediately — reflected in the hero balance, the allocation bar, and the "Audric noticed" insights. If a payment pushes total wallet USDC above $X threshold, the idle USDC insight fires: "You just received $50 USDC — saving it would earn $2.15/year."

**Goals:** Received USDC can be directed to a goal at the moment it arrives. When a payment comes in, the ProactiveBanner can offer: "Just received $50 — apply it to your Thailand goal?" This is a single-tap action that fires `save_to_goal` with the received amount.

**Reports:** The weekly summary and wallet intelligence report both include a "Income received" line: total USDC received via payment links and invoices in the period. Broken out separately from yield earnings so the user can see earned income vs passive income.

**Automations:** Recurring invoices can be scheduled via DCA-style automation: "Send invoice to clientname@email.com for $500 on the 1st of every month." Creates a ScheduledAction of type `invoice_recurring`. Appears in the Automations panel with the same trust ladder mechanic.

---

## Store panel

Store is a creator income channel. Every sale is real USDC income — it should feel as significant as a NAVI yield deposit. Phase 2 sync products are live now. Phase 5 async products (music, video) are SOON.

### Creation flow

```
"Create an AI art pack — 10 pieces, Japanese woodblock style"
→ Stability AI generates images (sync, <10s)
→ Returns StoreCreateCard:
  ┌─────────────────────────────────┐
  │ 🎨 Art pack ready               │
  │ Japanese woodblock · 10 pieces  │
  │ Preview: [thumbnail grid]       │
  │ [List for $15 USDC]  [Preview →]│
  └─────────────────────────────────┘

"List it for $15"
→ Creates Listing record
→ Generates payment link automatically
→ Returns ListingCard:
  ┌─────────────────────────────────┐
  │ ✓ Listed on your storefront     │
  │ audric.ai/funkiirabu            │
  │ Japanese woodblock · $15 USDC   │
  │ [Copy link]  [Tweet this]  [→]  │
  └─────────────────────────────────┘
→ Follow-up chips: [Create another] [View storefront →]
```

### Panel layout

```tsx
// "Create and list →" CTA header (always visible)
// Two sections:
//   Available now — Phase 2 sync products (no SOON badge)
//   Coming Phase 5 — async products (SOON badge, 50% opacity)

// Earnings summary (if user has listings):
const storeStats = {
  totalEarned:    formatUsd(lifetimeSales),   // "Total earned: $47.00"
  thisMonth:      formatUsd(monthlySales),    // "This month: $23.00"
  activeListings: listingCount,               // "4 active listings"
  storefrontUrl:  `audric.ai/${username}`,
};

// If no listings yet: show creation prompt instead of empty stats
```

### How Store bubbles up to the rest of the app

**Dashboard — HandledForYou:** When a listing sells, it appears in HandledForYou: `Sold Japanese woodblock pack · $13.80 USDC earned` (after 8% platform fee). Same pattern as auto-compound rewards — Audric handled the fulfilment, the user just earned.

**Dashboard — ProactiveBanner:** After first sale, ProactiveBanner fires: "Your first sale — $13.80 USDC just landed. Save it to earn 4.3% APY?" One-tap action to put the earnings to work.

**Activity:** Every sale creates `AppEvent(type: store_sale)`. Shows in Activity feed under a new **Store** filter chip alongside Savings/Send/Swap/Pay. Row format: `💰 Sold Japanese woodblock pack · $13.80 · audric.ai/funkiirabu`. Click → explain prompt about the sale and buyer.

**Portfolio — Audric noticed strip:** If store earnings are sitting idle, the insights strip surfaces it: "→ $47 in store earnings sitting in wallet. Saving it would earn $2/year at 4.3% APY." Store income is treated identically to received payment income — it's idle USDC that should be working.

**Portfolio — Allocation bar:** Store earnings that aren't saved show as wallet USDC in the allocation bar. No special treatment — money is money. The "Audric noticed" insight is the nudge to act.

**Goals:** Store earnings can be directed to a goal the moment they land. When a sale comes in and the user has an active goal, Audric can offer: "You earned $13.80 from your storefront — put it toward your Ring goal?" Goals don't care where the USDC came from — yield, payments received, or store sales all count toward `currentAmount`.

**Reports — weekly summary:** Adds an "Store earnings" line to the weekly report alongside yield and payments received:
```
Income this week:
  Yield earned:     $0.04
  Payments received: $50.00
  Store sales:       $13.80
  ─────────────────────────
  Total income:      $63.84
```
This is the full income picture — passive (yield) + active (pay + store). The wallet intelligence report at `audric.ai/report/[address]` includes a "Creator activity" section if the address has store sales.

**Automations:** Recurring store products can be automated. "Automatically generate and list a new prompt pack every Monday" → ScheduledAction of type `store_recurring`. The trust ladder applies — 5 manual confirmations before Audric generates and lists autonomously. This is the "passive income machine" story: the user sets the direction once, Audric runs the content factory.

**Goals — v2 earning goal type:** Once Goals v2 ships, Store enables the `earning` goal type: "Earn $1,000 from my storefront." Progress tracked from `Sale.creatorReceivedUsdc` totals. The morning briefing updates: "Storefront: $47 of $1,000 earned — 17 more sales at your average price."

---

## Pay + Store integration summary

Both features share the same data model at the income layer. From the app's perspective, USDC that arrives via a payment link, invoice, or store sale is identical to USDC that arrives via any other transfer — it shows in `balance.available`, it triggers the idle USDC nudge, it can be directed to savings or goals. The only difference is the source label in the activity feed.

```
                  ┌──────────────┐
                  │  USDC INBOX  │
                  └──────┬───────┘
           ┌─────────────┼──────────────┐
           ↓             ↓              ↓
    Payment link    Store sale      Regular transfer
    received        received        received
           └─────────────┼──────────────┘
                         ↓
                  balance.available
                  (same pool)
                         ↓
          ┌──────────────┼──────────────┐
          ↓              ↓              ↓
     Save to NAVI   Direct to goal  Leave in wallet
     (earn yield)   (goal progress)  (idle USDC insight)
```

New `AppEvent` types needed:
```typescript
type AppEventType =
  | 'pay_received'        // payment link paid
  | 'invoice_paid'        // invoice marked paid
  | 'store_sale'          // listing purchased
  | 'pay_link_created'    // new payment link
  | 'invoice_created'     // new invoice
  | 'store_listed'        // new listing live
  // existing types:
  | 'compound' | 'rate_alert' | 'briefing' | 'hf_alert' ...
```

Activity filter chips update:
```
All | Savings | Send | Receive | Swap | Pay | Store | Autonomous
```
`Pay` = payment links + invoices + MPP spend. `Store` = sales + new listings. Separate chips because the intent is different — Pay is about sending/receiving money, Store is about creator income.

---

Trust dashboard for the scheduled action system. Shows the full trust ladder UI from the roadmap.

### Trust ladder states

The roadmap specifies four distinct card states for scheduled actions:

```
STATE 1: During confirmation phase (executions 1–5)
┌─────────────────────────────────────────────┐
│  [Stage 3/5]              next: Mon 9am     │
│  DCA — Buy $20 SUI every Monday             │
│  ●●●○○  3 of 5 confirmations               │
│  ━━━━━━━━━━━━━━━━░░░░░░░                   │
│  2 more until autonomous                    │
│  [Pause]  [Edit]  [Explain →]              │
└─────────────────────────────────────────────┘

STATE 2: Night-before reminder (feed card)
┌─────────────────────────────────────────────┐
│  ⏰ Tomorrow 9am                            │
│  Audric will save $50 USDC into NAVI.       │
│  [OK, go ahead]     [Cancel this one]       │
└─────────────────────────────────────────────┘

STATE 3: Newly autonomous (graduation)
┌─────────────────────────────────────────────┐
│  [Autonomous ✓]           next: Fri 9am    │
│  Save $50 USDC every Friday                 │
│  Confirmed 5 times. Now running silently.   │
│  [Keep autonomous]   [Require approval]     │
└─────────────────────────────────────────────┘

STATE 4: Pending proposal (auto-detected pattern)
┌─────────────────────────────────────────────┐
│  [Needs input]        pattern detected      │
│  Automate Friday saves — $50 USDC           │
│  Detected 3 weeks · confidence 91%          │
│  [Yes, automate it]    [Not now]            │
└─────────────────────────────────────────────┘
```

```tsx
// Component: ProposalCard.tsx — handles all 4 states via `variant` prop
type AutomationVariant = 'proposal' | 'confirming' | 'autonomous' | 'reminder';

// Trust progress dots: ●●●○○  = 3 of 5
// Rendered as 5 inline spans: filled (●) or empty (○)
// Progress bar width = (confirmationsCompleted / 5) * 100%

// Night-before reminder: sourced from ScheduledAction.nextRunAt - 18h
// Appears in Dashboard feed AND Automations panel
```

### Daily autonomous spend gauge

```tsx
// Shown below active automations
// Source: sum of ScheduledExecution.amountUsd for today
// Limit: UserPreferences.dailyAutonomousLimit (default $200)
// Shows: "$50 of $200 limit used today · $150 remaining"
// [Edit limit] → fireCanvas('Change my daily autonomous spend limit')
```

### Edge cases (all specified in roadmap)

```
Insufficient balance at execution: skip + notify
  "Skipped $50 save — only $30 available. Save $30 instead?"

User edits amount: does NOT reset trust ladder
Action type change: DOES reset trust ladder to 0

Multiple schedules: each has independent trust counter
Missed execution (server downtime): catch up + explain
  "Missed Friday — executing now"
```

---

## Goals panel

Two-tier system: v1 savings goals (live) and v2 goal types (stub for future).

### V1 goal card states

Every goal card has four possible states based on progress and deadline:

```tsx
type GoalStatus = 'on_track' | 'behind' | 'milestone' | 'complete';

// Progress computed from: current USDC savings balance vs targetAmount
// Schedule computed from: (targetAmount - currentAmount) / daysRemaining vs required daily rate
// "ahead" = actual daily rate > required daily rate

const goalCard = {
  name: 'Ring',
  targetAmount: 100,
  currentAmount: 1.03,
  deadline: 'Aug 2026',
  dailyYield: 0.001,
  status: 'on_track',  // or 'behind', 'milestone', 'complete'
  milestoneReached: null,  // 25 | 50 | 75 | 100
};
```

**Milestone celebration state** (25/50/75% reached):

```
┌─────────────────────────────────────────────┐
│  🎉 Milestone reached!     [×]              │
│  Tokyo trip — halfway there                 │
│  $250 of $500 · 50% · ██████████░░░░░░░    │
│  At this rate you'll hit your goal          │
│  3 days early.                              │
│  [Keep saving]   [Share progress →]         │
└─────────────────────────────────────────────┘
```

**Goal complete state** (100% — stays 7 days then auto-archives):

```
┌─────────────────────────────────────────────┐
│  ✓ Goal reached! 🎊                        │
│  Ring — $100 saved                          │
│  Took 4 months · earned $2.10 in yield      │
│  [Archive]   [Set a new goal →]             │
└─────────────────────────────────────────────┘
```

```tsx
// Milestone notifications sourced from AppEvent type: 'goal_milestone'
// Created by ECS cron when: currentAmount / targetAmount crosses 25/50/75/100%
// Celebration card pinned at top of Goals feed, dismissible
// 100% card: confetti animation (CSS keyframes, no library) auto-archives after 7 days
// MilestoneCard.tsx — separate component, reused in Dashboard feed too
```

### V2 goal types (stub — future)

```tsx
// Schema ready when DCA (Phase 3) or Store (Phase 5) ships
// goalType: 'savings' | 'wealth' | 'investment' | 'earning' | 'compound'
// trackingMetric maps to different data sources:
//   savings    → USDC savings balance (live now)
//   wealth     → total portfolio value (savings + wallet)
//   investment → specific asset holdings (requires Swap + portfolio tracking)
//   earning    → store revenue + yield earned (requires Store)
//   compound   → cumulative yield over time

// UI stub: V2 goal types show as "coming soon" in the goal creation flow
// "Set a wealth goal — track your total portfolio" → [Soon]
// Don't block v1 launch on this
```

### Empty state

```tsx
// Shown when user has no goals
<div className="text-center py-12">
  <p className="text-[28px] mb-3">🎯</p>
  <p className="text-[14px] font-medium text-white mb-2">Save with a purpose.</p>
  <p className="text-[12px] text-[#666] mb-4 max-w-[260px] mx-auto leading-relaxed">
    Set a goal and Audric tracks your progress in every morning briefing.
  </p>
  <button onClick={() => sendToEngine('Save $500 for a trip by August')}>
    "Save $500 for a trip by August" →
  </button>
</div>
```

---

## Activity panel

Chronological event feed across all activity types. First-class nav destination — not just the ACTIVITY tab on the Dashboard.

```tsx
// Component: ActivityPanel.tsx (or reuse existing ActivityFeed.tsx in a panel wrapper)
// Data: GET /api/activity?cursor=xxx&type=xxx
// Source: merged Sui RPC on-chain history + NeonDB AppEvent table
// Deduplication: AppEvent preferred over chain when digest matches
// Allowance transactions filtered out (internal budget ops excluded from feed)

// Filter chips (8 types):
type ActivityFilter = 'all' | 'savings' | 'send' | 'swap' | 'pay' | 'store' | 'auto';
// pay    = payment links + invoices + MPP spend
// store  = sales + new listings (AppEvent type: store_sale | store_listed)
// auto   = ScheduledExecution records + autonomous actions

// Each tx row (TxCard):
// - Click anywhere → fireCanvas('Explain this transaction...')
// - Explain → action link fires explain prompt
// - Suiscan ↗ → opens tx on Suiscan
// - Reverse → shown on autonomous actions only, fires undo prompt
// - "What should I do?" → shown on alert rows
// - "Save it →" → shown when income lands idle (pay_received, store_sale)

// Date grouping: Today / Yesterday / This week / [Month Year]
// Pagination: "Load more" button, 20 items per page, cursor-based
```

**Empty state per filter** — each has a contextual CTA:

```tsx
const emptyStates = {
  savings: { text: 'No savings activity yet.', cta: 'Save USDC', prompt: 'Save $50 USDC into NAVI savings' },
  send:    { text: 'No send transactions yet.', cta: 'Send USDC', prompt: 'Send USDC to a contact' },
  pay:     { text: 'No payment activity yet.', cta: 'Create a link', prompt: 'Create a payment link for $50' },
  store:   { text: 'No store activity yet.', cta: 'Create a listing', prompt: 'Create an AI art pack and list it for sale' },
  auto:    { text: 'No autonomous actions yet.', cta: 'Learn more', prompt: 'What can Audric automate for me?' },
};
```

---

## Automations panel

Trust dashboard for the scheduled action system. Phase D — stub from day one, populate when Phase D ships.

```tsx
// Component: AutomationsPanel.tsx
// Data: GET /api/automations/active + GET /api/automations/pending-proposals

// Four ProposalCard variants — see engine conversation UX section for full spec:
// 1. Pending proposal  — pattern detected, awaiting user input
// 2. Confirming        — trust ladder in progress (●●●○○)
// 3. Autonomous        — graduated, running silently
// 4. Night-before      — reminder card before tomorrow's execution

// Daily autonomous spend gauge:
// Source: sum of ScheduledExecution.amountUsd for today
// Limit: UserPreferences.dailyAutonomousLimit (default $200)
// [Edit limit] → fireCanvas('Change my daily autonomous spend limit')

// Empty state (before any automations exist):
// "As I learn your patterns I'll propose automations here"
// Dashed card → fireCanvas('What can Audric automate for me?')
```

**Edge cases all handled at engine level** (see `AUDRIC_2_SPEC.md` Phase D):
- Insufficient balance → skip + notify
- Amount edit → does NOT reset trust ladder
- Action type change → DOES reset trust ladder
- Missed execution → catch up on next cron + explain

---

## Reports panel

Reports is the financial intelligence dashboard — income summary, wallet report, briefings. Surfaces the full income picture including Pay and Store earnings.

```tsx
// Component: ReportsPanel.tsx (or route /reports)

// Three report cards:
// 1. Weekly income summary — 3-line breakdown: Yield / Payments received / Store sales / Total
// 2. Wallet intelligence report — public page audric.ai/report/[address]
// 3. Morning briefing — view yesterday's, change delivery time

// Weekly income summary card:
interface WeeklyIncomeSummary {
  yieldEarned:        number;  // NAVI yield + auto-compound rewards
  paymentsReceived:   number;  // PaymentLink.paidAt within period
  storeSales:         number;  // Sale.creatorReceivedUsdc within period
  totalIncome:        number;  // sum of all three
  period:             string;  // "Apr 7–13, 2026"
  deliveredAt:        Date;    // Sunday 1pm UTC
}
// Source: GET /api/reports/weekly
// Click → fireCanvas('Show me this week\'s full income and financial summary')

// Wallet intelligence report card:
// - Links to audric.ai/report/[address] — public, no signup
// - "Analyze another wallet" → fireCanvas('Analyze wallet 0x...')
// - Spec for the report page itself: see ## Wallet intelligence report page section

// Morning briefing card:
// - Shows tomorrow's scheduled delivery time
// - [Yesterday →] → view last delivered briefing
// - [Change time →] → fireCanvas('Change my morning briefing delivery time')
```

---

## Allowance low banner

Shown when `allowance.balance < $0.05` (roughly 10 days remaining). Churn-critical — displayed as a non-intrusive top banner on the Dashboard, not a modal.

```tsx
// Component: AllowanceLowBanner.tsx
// Source: GET /api/user/allowance → balance field
// Show when: balance < 0.05 AND features are still active
// Dismiss: hides for 48h, then re-shows if not topped up
// Features paused state: different copy — "Your features are paused"

// Banner (low, features still running):
"Your features budget is running low ($0.03 remaining) — top up to keep your briefings running"
[Top up $0.50 →] [Dismiss]

// Banner (empty, features paused):
"Your features are paused — your morning briefing and alerts are off"
[Top up $0.50 to resume →]

// Deep link: /setup?topup=0.50 — skips creation, goes straight to deposit step
// Never frame as "you ran out of money" — always "features budget needs a top-up"
```

---

## Contacts panel

Two-panel ADS layout. Left: contact list. Right: contact detail with tabs.

```tsx
// Component: ContactsPanel.tsx
// Layout: flex-row — list pane (220px) + detail pane (flex-1)
// Data: Contacts system already in SDK (existing contacts table)

// Left pane:
// - Search input
// - Contact rows: initials avatar, name, truncated address, last sent amount + date
// - "Add contact" dashed row → sendToEngine('Add a new contact...')
// - "Showing N of N" footer

// Right pane — contact profile card:
// - Large initials avatar (ADS generated avatar style)
// - Name, address, Verified badge, Saved badge
// - [Send →] primary button — fireCanvas('Send USDC to [name]')
// - Detail fields: address (full), added date, total sent, last tx, network
// - Four tabs: Chat / Send / Activity / Notes

// Chat tab: "Tell me about my history with [name]"
// Send tab: quick-send rows ($10, $50, custom amount)
// Activity tab: tx cards filtered to this address — same TxCard pattern as Activity panel
// Notes tab: free-form notes stored in NeonDB, edited via chat

// New files:
// components/panels/ContactsPanel.tsx
// Route: contacts nav item → panel swap (no new route needed)
```

---

## Wallet intelligence report page — `audric.ai/report/[address]`

Public acquisition page. No Audric account required. Shows a generated financial intelligence report for any Sui address.

```tsx
// Route: app/report/[address]/page.tsx
// On-demand generation: cold address takes 5–10s
// Cache: 24h per address
// Rate limiting: max 10 report generations per IP per hour

// Loading state (cold generation):
// ADS thinking state: AWAKENING → THINKING → DELIVERING
// Skeleton sections: score bar, 3 analysis cards, insight list
// "Generating report for 0x7f20...f6dc"

// Report sections:
// 1. Yield efficiency score (0–100): how well is this wallet using its assets?
// 2. Activity summary: tx count, active days, peak activity
// 3. Portfolio breakdown: asset allocation, USDC%, savings position
// 4. Risk signals: health factor, idle USDC, concentration
// 5. "What Audric would do": 2–3 plain English recommendations
// 6. Acquisition CTA: "Want Audric to handle this for you? Sign in →"

// Share mechanics:
// - "Share report" copies audric.ai/report/[address]
// - OG image: dynamically generated showing address + score + key stat
// - Linked from Settings > Passport for the user's own address
```

---

---

## Settings page restructure

Currently at `/settings` with a single flat layout. Restructure to two-column: left sub-nav + right content area.

### Sub-nav order

1. **Passport** — identity, address, session, public report link
2. **Safety** — tx limits, permission presets, emergency lock
3. **Features** — allowance budget, feature toggles
4. **Memory** — financial profile, episodic memories (already built at `/settings#memory`)
5. **Wallets** — linked wallets (Phase E stub now)
6. **Schedules** — DCA + autonomous schedule list (currently at `/settings#schedules`)
7. **Account** — email, timezone, sign out

### Passport section (new)

```tsx
// Audric Passport card
// - Linked via: Google OAuth (zkLogin)
// - Sui address: 0x7f20...f6dc [copy]
// - Seed phrase: None · non-custodial  ← green, this is the moat story
// - Session expires: [date] [Refresh session]
// - Network: Sui mainnet

// Public wallet report link
// - "audric.ai/report/0x7f20...f6dc →"  ← blue, links to Phase E route
// - Shows as coming soon until Phase E ships
```

### Safety section (update existing)

Currently has: max per tx, max daily send, agent budget. Add:
- Daily autonomous limit ($200 default — from permission-rules.ts)
- Permission presets: Conservative / Balanced / Aggressive (three buttons)
- Per-operation table (auto-populates from selected preset, editable with "Customise" toggle)
- Emergency lock button (already exists — keep)

### Features section (update existing)

Currently has feature toggles scattered. Consolidate:
- Allowance balance bar + "Top up" link
- Daily cost estimate + days remaining
- Feature toggles: Morning briefing, USDC rate alerts, Auto-compound, Payment alerts, HF alerts (always on)

---

## Mobile behaviour

### Breakpoints

| Name | Width | Behaviour |
|------|-------|-----------|
| Desktop | >1024px | Full sidebar (210px) + main area |
| Tablet | 768–1024px | Sidebar collapses to icon-only (48px) |
| Mobile | <768px | Sidebar hidden, hamburger trigger |

### Sidebar on mobile

```tsx
// Below 768px:
// - Sidebar hidden by default (translateX(-100%) or display:none)
// - Hamburger icon in topbar (top-left, 32×32px icon button)
// - Tap hamburger → sidebar slides in as full-height overlay (z-index: 100)
// - Overlay backdrop closes on tap outside
// - Sidebar width on mobile: 80vw, max 320px
// - All nav items, conversation history, and user footer still present
// - Allowance bar in footer still visible

// AppShell.tsx:
const [sidebarOpen, setSidebarOpen] = useState(false);
// <AppSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
// Hamburger: onClick={() => setSidebarOpen(true)}
// Backdrop: onClick={() => setSidebarOpen(false)}
```

### Chip bar on mobile

The two-row chip system at 375px is the tightest constraint in the whole UI.

```tsx
// Row 1 (contextual chips): horizontal scroll, no wrap — same as desktop
// Row 2 (action chips): horizontal scroll, no wrap
// Both rows: scrollbar hidden, touch-scroll enabled
// Chip dropdowns: open UPWARD on mobile (same as desktop) — already correct
// Chip label text: keep at 10px Departure Mono — 375px can fit ~5 chips before scroll

// On very small screens (<360px): consider showing only Row 2
// Row 1 contextual chips are data-driven — if no idle USDC, Row 1 is empty anyway
```

### New conversation centred layout on mobile

```tsx
// States B and C (NewConversationView, FirstLoginView):
// The centred block stacks naturally on mobile — no layout changes needed
// Input width: 100% of viewport minus horizontal padding (16px each side)
// Chip row below input: wraps to 2 rows on mobile if needed
// Greeting title: font-size drops from 26px → 22px below 768px
// zkLogin callout (State C): remains visible, full width
```

### Portfolio tabs on mobile

```tsx
// Port tabs (Overview / Timeline / Activity / Simulate):
// Horizontal scroll if they overflow — same as chip bar
// No tab truncation — all 4 tabs always accessible via scroll
// Tab content: stats grid changes from 2×2 → 1×4 (single column)
// Canvas grid: 2×3 → 1×6 (single column)
```

### Contacts two-panel on mobile

```tsx
// Desktop: flex-row (list 220px + detail flex-1)
// Mobile (<768px): stack vertically — list panel full width
// Tap contact row → detail slides in as full-screen overlay (same as sidebar pattern)
// Back button in detail header → returns to list
// No flex-row on mobile — too cramped
```

### TaskCard actions on mobile

```tsx
// Desktop: buttons side by side in .tc-actions
// Mobile: .tc-actions flex-wrap: wrap — buttons stack to 2 per row
// Primary button: full width on mobile (width: 100%)
// Secondary buttons: auto width, flex-wrap handles overflow
```

### Input area on mobile

```tsx
// Bottom chip bar + input: fixed to bottom on mobile
// Prevents content from being hidden behind mobile keyboard
// Use: padding-bottom: env(safe-area-inset-bottom) for iPhone notch handling
// Chat area: padding-bottom equal to chipbar+input height so content isn't hidden
```

---

## Implementation phases

These map to the Audric 2.0 build phases but are UI-only tasks.

### UI Phase 1: Shell restructure (3 days)

**Goal:** Sidebar visible, all nav items clickable, panels stubbed.

Tasks:
1. `AppSidebar.tsx` + `AppShell.tsx` — static, no data
2. Move existing content into `panel-chat`
3. Nav routing (client-side panel swap + pushState)
4. Stubbed empty panels for Portfolio, Pay, Automations, Goals, Contacts, Store
5. Settings sub-nav restructure
6. Wire sidebar user footer to existing allowance API
7. Wire conversation history list to existing sessions API
8. `AllowanceLowBanner.tsx` — wire to allowance balance API, show when < $0.05

**Does not require:** Any new API routes. Any Phase C/D work.

### UI Phase 2: Dashboard upgrade (2 days)

**Goal:** ProactiveBanner, HandledForYou strip, TaskCard feed, new/first-login states.

Tasks:
1. `ProactiveBanner.tsx` — falls back to morning briefing data until Phase D
2. `HandledForYou.tsx` — last 3 AppEvents of type compound/rate_alert/briefing
3. `TaskCard.tsx` — replaces BriefingCard
4. `ChipExpand.tsx` — dropdown with data-driven actions
5. `NewConversationView.tsx` + `FirstLoginView.tsx` — centred blank states
6. `MilestoneCard.tsx` — goal celebration card for Dashboard feed

### UI Phase 3: Portfolio + Pay + Goals panels (2.5 days)

**Goal:** Portfolio, Pay, Goals panels fully populated.

Tasks:
1. `PortfolioPanel.tsx` — stats, allocation bar, insights strip, canvas grid, tabs
2. `PayPanel.tsx` — grid cards + recent activity list
3. `GoalsPanel.tsx` — v1 cards with all 4 states (on_track/behind/milestone/complete), v2 stub, empty state
4. `MilestoneCard.tsx` in Goals feed — celebration state with CSS confetti
5. `GET /api/pay/recent` route

### UI Phase 4: Automations panel (1 day — ships with Phase D)

1. `AutomationsPanel.tsx` — all 4 `ProposalCard` variants
2. `ProposalCard.tsx` — proposal / confirming / autonomous / reminder
3. Trust ladder dots (●●●○○) + progress bar
4. Night-before reminder card treatment
5. Daily spend gauge with edit limit

### UI Phase 5: Store panel — Phase 2 sync products (0.5 days)

1. `StorePanel.tsx` — "Create and list" CTA at top
2. Phase 2 sync products: Art, T-shirts, Prompts, Guides, Greeting cards — **no SOON badge**
3. Phase 5 async products: Music, Video — SOON badge
4. Nav item already wired

### UI Phase 6: Contacts + public pages (2 days)

1. `ContactsPanel.tsx` — two-panel ADS layout, all 4 tabs
2. `app/pay/[slug]/page.tsx` — 5 states (active/paid/expired/loading/not-found)
3. `app/report/[address]/page.tsx` — loading skeleton + report sections + acquisition CTA

---

## Key decisions

**Why sidebar instead of bottom nav on desktop?**
Conversation history needs a persistent home. On desktop, 40+ conversations in a bottom bar is unworkable. The sidebar pattern (Claude, ChatGPT, Perplexity) is now the standard for AI products with conversation history. Audric is a financial agent with ongoing context — users need to return to past sessions, not just see the latest.

**Why panel-swap instead of full page navigation?**
The chat session must survive navigation. If a user is mid-conversation and clicks "Portfolio" to check their stats, they shouldn't lose the session. Panel-swap preserves React state; full navigation would remount the chat component and lose the engine session.

**Why is Store in the nav now even though it's months away?**
Mental model planting. Users who see "Store" with a SOON badge understand Audric is more than a chatbot. It sets the expectation that the wallet they're using is also a commerce platform. The teaser costs nothing to build and pays forward when Phase 5 ships.

**Why is Passport the first Settings section?**
The "no seed phrase, linked via Google" story is Audric's strongest trust signal and it's currently invisible. Every user who opens Settings should see immediately why their funds are safe. Safety details (limits, locks) come second because they're for configuration, not orientation.

---

## Files to create (summary)

```
audric/
├── components/
│   ├── shell/
│   │   ├── AppShell.tsx
│   │   ├── AppSidebar.tsx
│   │   ├── NavItem.tsx
│   │   ├── ConvoHistoryList.tsx
│   │   ├── AllowanceFooterBar.tsx
│   │   └── AllowanceLowBanner.tsx   ← low/paused allowance warning
│   ├── dashboard/
│   │   ├── ProactiveBanner.tsx
│   │   ├── HandledForYou.tsx
│   │   ├── TaskCard.tsx
│   │   ├── MilestoneCard.tsx        ← goal 25/50/75/100% celebration
│   │   ├── NewConversationView.tsx  ← State B: centred input + chips
│   │   ├── FirstLoginView.tsx       ← State C: centred input + zkLogin callout
│   │   └── ChipExpand.tsx
│   ├── panels/
│   │   ├── PortfolioPanel.tsx       ← Overview/Timeline/Activity/Simulate tabs
│   │   ├── PayPanel.tsx
│   │   ├── AutomationsPanel.tsx
│   │   ├── GoalsPanel.tsx           ← v1 cards + milestone states + v2 stub
│   │   ├── ContactsPanel.tsx        ← two-panel ADS layout
│   │   └── StorePanel.tsx           ← Phase 2 live + Phase 5 SOON
│   ├── engine/cards/
│   │   └── ProposalCard.tsx         ← all 4 automation states (Phase D)
│   └── settings/
│       ├── PassportSection.tsx
│       ├── SafetySection.tsx
│       ├── FeaturesSection.tsx
│       ├── MemorySection.tsx
│       ├── WalletsSection.tsx       ← stub, Phase E
│       └── SchedulesSection.tsx
├── lib/
│   ├── chip-configs.ts
│   └── portfolio-insights.ts
└── app/
    ├── layout.tsx                   ← add AppShell
    ├── portfolio/
    │   ├── page.tsx
    │   └── [tab]/page.tsx
    ├── pay/
    │   ├── page.tsx                 ← Pay panel
    │   └── [slug]/page.tsx          ← Public payment page (5 states)
    ├── report/
    │   └── [address]/page.tsx       ← Public wallet intelligence report
    ├── [username]/
    │   └── page.tsx                 ← Public storefront (Phase 5)
    ├── automations/page.tsx
    ├── goals/page.tsx
    ├── contacts/page.tsx
    ├── reports/page.tsx
    └── store/page.tsx
```

---

## Token spec (Tailwind)

> **Canonical source:** `spec/DESIGN_SYSTEM.md` Section 14. The values below are copied from there for convenience. If they ever conflict, DESIGN_SYSTEM.md wins.

All new components use only ADS tokens. Do not introduce custom hex values — map everything to the token system below.

### Design system note — theme override

The ADS default for consumer products is **light theme**. Audric uses **dark theme** as a deliberate product decision — the live product launched dark, the user base expects dark, and the financial agent aesthetic is better served by dark. This is the only intentional deviation from ADS Section 15.

Both themes are supported by the ADS token system. Audric pins to dark.

### CSS variables (dark theme — copy into `globals.css`)

```css
:root {
  /* ADS Neutral Scale */
  --n100: #FFFFFF;
  --n200: #F7F7F7;
  --n300: #E5E5E5;
  --n400: #CCCCCC;
  --n500: #8F8F8F;
  --n600: #707070;
  --n700: #363636;
  --n800: #191919;
  --n900: #000000;

  /* ADS Semantic */
  --color-error:   #D50000;   /* R600 */
  --color-warning: #FF9800;   /* O500 */
  --color-success: #3CC14E;   /* G500 */
  --color-info:    #0D9DFC;   /* B500 */

  /* Audric extension — purple for 'upcoming/scheduled' status */
  /* ADS Purple scale P400 tint — approved addition for agent status states */
  --color-purple:    #7B6FD4;
  --color-purple-bg: rgba(123,111,212,.12);

  /* ADS Shadow tokens */
  --shadow-card:     0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-dropdown: 0 4px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06);
  --shadow-drawer:   0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06);
  --shadow-modal:    0 16px 48px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.08);

  /* ADS Border Radius */
  --r-sm:   4px;
  --r-md:   8px;
  --r-lg:   12px;
  --r-xl:   16px;
  --r-full: 9999px;

  /* ADS Spacing (4px base) */
  --sp1:  4px;   --sp2:  8px;   --sp3: 12px;
  --sp4: 16px;   --sp5: 20px;   --sp6: 24px;
  --sp8: 32px;   --sp10: 40px;
}

/* Dark theme — Audric default */
[data-theme="dark"], :root {
  --background: var(--n900);   /* #000000 — page base */
  --surface:    var(--n800);   /* #191919 — cards, panels */
  --foreground: var(--n100);   /* #FFFFFF — primary text, amounts */
  --muted:      var(--n500);   /* #8F8F8F — secondary text, labels */
  --dim:        var(--n600);   /* #707070 — tertiary text, timestamps */
  --border:     var(--n700);   /* #363636 — default border */
  --border-bright: var(--n600); /* #707070 — hover border, active dividers */
  --input-bg:   var(--n800);
  --input-border: var(--n700);
}
```

### Font stack

```css
:root {
  --font-heading: 'New York', 'Instrument Serif', Georgia, serif;
  --font-body:    'Geist', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono:    'Departure Mono', 'IBM Plex Mono', 'SF Mono', monospace;
}
```

### Component sizing

Sizing to be confirmed against ADS during React/Next.js implementation. The reference HTML is indicative — exact padding/height values should be validated against the live product at that stage.

| Component | Notes |
|-----------|-------|
| Chat input | 52px min-height, 1px border, r-xl (16px), Geist 15px, `+` plain char, send 34px circle |
| Send button | N700 bg empty → N100 bg filled, upward arrow, 34px circle |
| Action chips (bottom bar) | Departure Mono 10px uppercase, r-full pill, 0.5px border — review sizing in React |
| Contextual chips (Row 1 + follow-up) | Same as action chips — review sizing in React |
| Button Sm (task card) | Departure Mono 10px uppercase, r-md, 0.5px border |
| Balance card | 4-col grid: Total/Cash/Savings/Debt — savings green, debt orange |

### Component token usage

| Component | Background | Text | Border |
|-----------|-----------|------|--------|
| Page | `--background` (N900) | `--foreground` (N100) | — |
| Card / panel | `--surface` (N800) | `--foreground` | `--border` (N700) |
| Input | `--input-bg` (N800) | `--foreground` | `--input-border` (N700) |
| Primary button | `--n100` fill | `--n900` text | `--n100` |
| Secondary button | transparent | `--muted` (N500) | `--border-bright` (N600) |
| Toggle ON track | `--foreground` (N100) | — | — |
| Toggle OFF track | `--n700` | — | — |
| Toggle knob ON | `--n900` | — | — |
| Toggle knob OFF | `--n500` | — | — |
| Badge success | `rgba(G500, .12)` | `--color-success` | — |
| Badge info | `rgba(B500, .12)` | `--color-info` | — |
| Badge warning | `rgba(O500, .12)` | `--color-warning` | — |
| Badge upcoming | `--color-purple-bg` | `--color-purple` | — |

### ADS typography rules

```
Headings (New York / Instrument Serif):
  Never uppercase. Sentence case. font-weight 400.
  Used for: panel titles, large balance display.

Body (Geist):
  Never uppercase. font-size 13–15px, line-height 1.6–1.75.
  Used for: agent responses, descriptions, card body text.

Labels & Buttons (Departure Mono):
  ALWAYS uppercase. letter-spacing 0.08–0.15em.
  Used for: nav items, chip labels, button text, stat labels,
            badge text, filter chips, tab labels, tool names,
            token counts, divider labels, section headers.

Exception — Departure Mono without uppercase (data display only):
  Wallet addresses, tx hashes, USDC amounts, token counts,
  settings values, timestamp metadata.
  These are data, not labels. Uppercase would harm readability.
```

### Monospace data display

```
USDC amounts:  font-mono, always 2 decimal places (1.00 not 1)
Token counts:  font-body 11px dim — left-aligned below tool result
Tx hashes:     font-mono, truncated (5Ppf...MAvR)
Addresses:     font-mono, truncated (0x7f20...f6dc)
```

---

*This spec maps directly to the interactive reference in `audric-reference-v2.html`. Implement UI Phase 1 first — it reuses all existing data and creates the shell that everything else plugs into. Cross-reference with `AUDRIC_2_SPEC.md` for backend implementation details.*

