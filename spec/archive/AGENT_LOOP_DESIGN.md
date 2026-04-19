# Agent Loop Design — Web App LLM Tool Calling (v2)

> **Status:** ✅ Shipped — Design Reference (client-driven agent loop live)
> **Scope:** Replace chat-only LLM with tool-calling agent; remove Pay panel; fix service bugs
> **Goal:** One input bar that does everything — feels like magic

---

## Table of Contents

1. [The Problem](#1-the-problem)
2. [Architecture](#2-architecture)
3. [Wireframes](#3-wireframes)
4. [User Flows](#4-user-flows)
5. [How It Fits the Current UI](#5-how-it-fits-the-current-ui)
6. [Tool Definitions](#6-tool-definitions)
7. [Client-Driven Agent Loop](#7-client-driven-agent-loop)
8. [Budget & Approval Model](#8-budget--approval-model)
9. [Conversation History](#9-conversation-history)
10. [Bug Fixes (pre-requisites)](#10-bug-fixes)
11. [Implementation Plan](#11-implementation-plan)
12. [Edge Cases & Error Handling](#12-edge-cases--error-handling)
13. [What We're Removing](#13-what-were-removing)
14. [Iron Rules](#14-iron-rules)
15. [Design Principles — The "Magic" Standard](#15-design-principles--the-magic-standard)
16. [System Prompt](#16-system-prompt)

---

## 1. The Problem

The Pay panel is a **form catalog**. Users browse services, fill fields, submit. Nobody wants to fill a form to call Brave Search when they could just Google it. The current LLM is chat-only — it can answer questions but can't do anything.

What works (proven via MCP + Claude Desktop):

```
User: "Send 100 postcards to the top crypto and AI VCs"
  → Brave Search → Firecrawl → OpenAI → Lob × 100
  → All paid with USDC via MPP
  → Total: ~$100 + $0.04 in API calls
```

The LLM decides what tools to call, chains outputs into inputs, pays for each call. The user describes intent; the agent executes.

### What we already have

| Layer | Status |
|-------|--------|
| MCP server: 35 tools including `t2000_pay` | ✅ Working |
| Gateway: 35+ services, 402 payment flow | ✅ Working |
| Web app: `payService()` — prepare → sign → complete | ✅ Working |
| Web app: LLM streaming (Tier 3 fallback) | ✅ Chat-only |
| Web app: Service catalog + gateway mappings | ✅ Working |
| Web app: Intent parser (Tier 2) | ✅ Working |

**What's missing:** Tool definitions for the LLM, an agent loop, and client-side orchestration.

---

## 2. Architecture

### Why Client-Driven (not Server-Driven)

The first draft used a server-side SSE agent loop that paused mid-execution waiting for client zkLogin signatures. This is broken:

| Problem | Why it breaks |
|---------|---------------|
| Vercel serverless timeouts | 10s (free) to 300s (Pro). A 5-tool chain exceeds this. |
| Cross-request state | SSE stream and `/api/agent/sign` are separate handlers on separate instances. Need Redis. |
| Connection fragility | Mobile network hiccup drops SSE = entire loop lost. |
| Unnecessary complexity | Bidirectional SSE protocol, sign request/response, plan approval endpoint — all fragile. |

**The fix:** The client drives the loop. Each server call is stateless, fast, and independent.

### Architecture Diagram

```
┌──────────────────────────────────────────────┐
│  Client (useAgentLoop hook)                   │
│                                               │
│  Loop:                                        │
│  1. POST /api/agent/chat                      │
│     → sends messages[] + tools[]              │
│     → gets LLM response (tool_calls or text)  │
│                                               │
│  2. For each tool_call:                       │
│     Read tool?  → POST /api/agent/tool        │
│     Service tool? → payService()              │
│       (existing prepare → zkLogin sign        │
│        → complete, already works)             │
│                                               │
│  3. Append tool results to messages[]         │
│  4. Go to step 1                              │
│  5. If LLM returns text → display, done       │
│                                               │
│  Feed shows progress at each step.            │
│  Cancel = stop looping.                       │
└──────────────┬───────────────────────────────┘
               │
┌──────────────▼───────────────────────────────┐
│  /api/agent/chat (stateless, <5s)             │
│                                               │
│  Receives: messages[], tools[]                │
│  Calls LLM with tool definitions              │
│  Returns: { tool_calls } or { content }       │
│  No state. No loop. Just a proxy.             │
└───────────────────────────────────────────────┘

┌───────────────────────────────────────────────┐
│  /api/agent/tool (stateless, <3s)             │
│                                               │
│  Receives: toolName, args, address            │
│  Executes read tools (balance, rates, etc.)   │
│  Returns: tool result JSON                    │
└───────────────────────────────────────────────┘

┌───────────────────────────────────────────────┐
│  Existing /api/services/prepare + /complete    │
│  (reused unchanged by payService())           │
└───────────────────────────────────────────────┘
```

**No SSE. No WebSockets. No shared state. No sign protocol.** Each request is independent. The client holds conversation state and drives everything.

### Intent Routing (unchanged)

```
User types text
  → Tier 1: Chips (save, send, swap…) — free, instant
  → Tier 2: parseIntent (regex) — free, instant
  → Tier 3: Agent Loop (this design) — may cost money
```

Tier 1 and 2 are unchanged. The agent loop replaces the chat-only LLM fallback.

---

## 3. Wireframes

### 3a. Dashboard — Default State (no active flow)

```
┌─────────────────────────────────────────────┐
│  $127.45                                     │
│  cash $42 · inv $52 · sav $32 · debt $1  ▾  │
├─────────────────────────────────────────────┤
│                                              │
│  ┌─ t2 ───────────────────────────────────┐  │
│  │ ✅ Your account is working for you.    │  │
│  │ Earning 3.9% on $32.                   │  │
│  └────────────────────────────────────────┘  │
│                                              │
│                                              │
│                                              │
│                                              │
│                                              │
│                                              │
│                                              │
│                                              │
│                                              │
├─────────────────────────────────────────────┤
│                                              │
│  ┌─ Contextual AI Chips ─────────────────┐  │
│  │ 💰 Save $42 idle   🏆 Claim $2.50    │  │
│  │ 📈 SUI +5% today                      │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  Ask anything...                    🎤 │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  Save  Send  Swap  Invest  Borrow  More ▾   │
│                                              │
└─────────────────────────────────────────────┘
```

Key: The **contextual AI chips** sit between the feed and the input bar.
They're derived from `deriveSmartCards()` logic but rendered as compact pills.
Always visible — no scrolling needed to find suggestions.

---

### 3b. Dashboard — Agent Running (single service)

```
┌─────────────────────────────────────────────┐
│  $127.45                                     │
│  cash $42 · inv $52 · sav $32 · debt $1  ▾  │
├─────────────────────────────────────────────┤
│                                              │
│  ┌─ You ──────────────────────────────────┐  │
│  │            What's Bitcoin's price?     │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌─ t2 ───────────────────────────────────┐  │
│  │ 📈 Fetching price...          $0.005   │  │
│  │ ●●● (animated dots)                    │  │
│  └────────────────────────────────────────┘  │
│                                              │
│                                              │
│                                              │
│                                              │
├─────────────────────────────────────────────┤
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  Ask anything...                    🎤 │  │
│  └────────────────────────────────────────┘  │
│  [■ Stop]                                    │
│                                              │
└─────────────────────────────────────────────┘
```

Key: Contextual chips hide during agent execution. Stop button replaces chip bar.

---

### 3c. Dashboard — Agent Result (single service)

```
┌─────────────────────────────────────────────┐
│  $127.44                                     │
│  cash $42 · inv $52 · sav $32 · debt $1  ▾  │
├─────────────────────────────────────────────┤
│                                              │
│  ┌─ You ──────────────────────────────────┐  │
│  │            What's Bitcoin's price?     │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌─ t2 ───────────────────────────────────┐  │
│  │ Bitcoin: $97,432 (+2.3% 24h)           │  │
│  │ Ethereum: $3,842 (+1.1% 24h)           │  │
│  │ SUI: $2.41 (-0.4% 24h)                │  │
│  │                              $0.005 ▸  │  │
│  └────────────────────────────────────────┘  │
│                                              │
├─────────────────────────────────────────────┤
│                                              │
│  ┌─ Contextual AI Chips ─────────────────┐  │
│  │ 💰 Save $42 idle   🏆 Claim $2.50    │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  Ask anything...                    🎤 │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  Save  Send  Swap  Invest  Borrow  More ▾   │
│                                              │
└─────────────────────────────────────────────┘
```

Key: Cost is subtle (`$0.005 ▸`). Tap ▸ to see tx hash. No noise for cheap calls.

---

### 3d. Dashboard — Agent Multi-Step (in progress — one evolving card)

```
┌─────────────────────────────────────────────┐
│  $127.45                                     │
│  cash $42 · inv $52 · sav $32 · debt $1  ▾  │
├─────────────────────────────────────────────┤
│                                              │
│  ┌─ You ──────────────────────────────────┐  │
│  │  Find flights SYD→NRT and email me    │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌─ t2 ───────────────────────────────────┐  │
│  │ ✓ Searched flights                     │  │
│  │ ● Emailing top 3...                    │  │
│  │                                        │  │
│  │ ░░░░░░░░░░░░░░░░░░░░ (shimmer)       │  │
│  └────────────────────────────────────────┘  │
│                                              │
│                                              │
│                                              │
│                                              │
├─────────────────────────────────────────────┤
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  Ask anything...                    🎤 │  │
│  └────────────────────────────────────────┘  │
│  [■ Stop]                    $0.01 spent     │
│                                              │
└─────────────────────────────────────────────┘
```

Key: Steps evolve INSIDE a single card. No separate "step" and "response" feed items.
The shimmer bar replaces bouncing dots — feels like it's actively working.

---

### 3e. Dashboard — Agent Multi-Step (complete — same card, expanded)

```
┌─────────────────────────────────────────────┐
│  $127.43                                     │
│  cash $42 · inv $52 · sav $32 · debt $1  ▾  │
├─────────────────────────────────────────────┤
│                                              │
│  ┌─ You ──────────────────────────────────┐  │
│  │  Find flights SYD→NRT and email me    │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌─ t2 ───────────────────────────────────┐  │
│  │ ✓ Searched flights · ✓ Emailed         │  │
│  │                                        │  │
│  │ Top 3 flights SYD → NRT, April 2026:  │  │
│  │                                        │  │
│  │ 1. ANA $892 — 14h direct, Apr 15      │  │
│  │ 2. JAL $945 — 14h direct, Apr 12      │  │
│  │ 3. Jetstar $654 — 18h 1-stop, Apr 14  │  │
│  │                                        │  │
│  │ Sent to you@gmail.com ✓               │  │
│  │                              $0.015 ▸  │  │
│  └────────────────────────────────────────┘  │
│                                              │
├─────────────────────────────────────────────┤
│                                              │
│  ┌─ Contextual AI Chips ─────────────────┐  │
│  │ 💰 Save $42 idle   ✈️ Search again    │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  Ask anything...                    🎤 │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  Save  Send  Swap  Invest  Borrow  More ▾   │
│                                              │
└─────────────────────────────────────────────┘
```

Key: Steps collapse to a compact summary line. Cost is a subtle footnote — tap ▸
to see per-step costs and tx hashes. No clutter.

---

### 3e2. Dashboard — Agent Error (tool failure mid-chain)

```
┌─────────────────────────────────────────────┐
│  $127.44                                     │
│  cash $42 · inv $52 · sav $32 · debt $1  ▾  │
├─────────────────────────────────────────────┤
│                                              │
│  ┌─ You ──────────────────────────────────┐  │
│  │  Find flights SYD→NRT and email me    │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌─ t2 ───────────────────────────────────┐  │
│  │ ✓ Searched flights                     │  │
│  │ ✗ Email failed — service unavailable   │  │
│  │                                        │  │
│  │ Found 12 flights but couldn't email.   │  │
│  │ Here are the top 3:                    │  │
│  │                                        │  │
│  │ 1. ANA $892 — 14h direct, Apr 15      │  │
│  │ 2. JAL $945 — 14h direct, Apr 12      │  │
│  │ 3. Jetstar $654 — 18h 1-stop, Apr 14  │  │
│  │                                        │  │
│  │ [Retry email]                $0.01 ▸  │  │
│  └────────────────────────────────────────┘  │
│                                              │
├─────────────────────────────────────────────┤
│  ┌────────────────────────────────────────┐  │
│  │  Ask anything...                    🎤 │  │
│  └────────────────────────────────────────┘  │
│  Save  Send  Swap  Invest  Borrow  More ▾   │
└─────────────────────────────────────────────┘
```

Key: Partial results are always preserved. Failed step shows error inline.
Retry is one tap. The agent gracefully presents what it has.

---

### 3f. Dashboard — Expensive Step Confirmation

```
┌─────────────────────────────────────────────┐
│  $127.45                                     │
│  cash $42 · inv $52 · sav $32 · debt $1  ▾  │
├─────────────────────────────────────────────┤
│                                              │
│  ┌─ You ──────────────────────────────────┐  │
│  │  Buy a $25 Amazon gift card for       │  │
│  │  sarah@gmail.com                       │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌─ t2 confirmation ─────────────────────┐  │
│  │ 🎁 Gift Card                           │  │
│  │                                        │  │
│  │ Brand        Amazon                    │  │
│  │ Amount       $25.00                    │  │
│  │ Region       US                        │  │
│  │ To           sarah@gmail.com           │  │
│  │ Total cost   ~$26.25                   │  │
│  │                                        │  │
│  │  [Confirm $26.25]     [Cancel]         │  │
│  └────────────────────────────────────────┘  │
│                                              │
├─────────────────────────────────────────────┤
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  Ask anything...                    🎤 │  │
│  └────────────────────────────────────────┘  │
│                                              │
└─────────────────────────────────────────────┘
```

---

### 3g. Dashboard — Image Result (screenshot / image gen)

```
┌─────────────────────────────────────────────┐
│  $127.44                                     │
│  cash $42 · inv $52 · sav $32 · debt $1  ▾  │
├─────────────────────────────────────────────┤
│                                              │
│  ┌─ You ──────────────────────────────────┐  │
│  │          Screenshot t2000.ai           │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌─ t2 ───────────────────────────────────┐  │
│  │ ✓ 📸 Screenshot                        │  │
│  │ $0.01 · Tx: HURu...                   │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ ┌──────────────────────────────────┐   │  │
│  │ │                                  │   │  │
│  │ │   [rendered screenshot image]    │   │  │
│  │ │                                  │   │  │
│  │ └──────────────────────────────────┘   │  │
│  │ $0.01 from your balance                │  │
│  └────────────────────────────────────────┘  │
│                                              │
├─────────────────────────────────────────────┤
│  ┌────────────────────────────────────────┐  │
│  │  Ask anything...                    🎤 │  │
│  └────────────────────────────────────────┘  │
│  Save  Send  Swap  Invest  Borrow  More ▾   │
└─────────────────────────────────────────────┘
```

---

### 3h. Dashboard — Banking Suggestion (agent doesn't execute)

```
┌─────────────────────────────────────────────┐
│  $127.45                                     │
│  cash $42 · inv $52 · sav $32 · debt $1  ▾  │
├─────────────────────────────────────────────┤
│                                              │
│  ┌─ You ──────────────────────────────────┐  │
│  │  Put my idle cash into highest yield  │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌─ t2 ───────────────────────────────────┐  │
│  │ You have $42 in idle cash. Best yield  │  │
│  │ is 4.2% APY on Suilend — that's       │  │
│  │ ~$0.15/mo.                             │  │
│  │                                        │  │
│  │ [Save $42]                             │  │
│  └────────────────────────────────────────┘  │
│                                              │
├─────────────────────────────────────────────┤
│  ┌─ Contextual AI Chips ─────────────────┐  │
│  │ 🏆 Claim $2.50   📈 SUI +5% today    │  │
│  └────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────┐  │
│  │  Ask anything...                    🎤 │  │
│  └────────────────────────────────────────┘  │
│  Save  Send  Swap  Invest  Borrow  More ▾   │
└─────────────────────────────────────────────┘
```

Key: The agent suggests [Save $42] as a chip — it triggers the existing save
chip flow with confirmation card. The agent **never** executes banking tx directly.

---

### 3i. Dashboard — Discovery ("what can you do?")

```
┌─────────────────────────────────────────────┐
│  $127.45                                     │
│  cash $42 · inv $52 · sav $32 · debt $1  ▾  │
├─────────────────────────────────────────────┤
│                                              │
│  ┌─ You ──────────────────────────────────┐  │
│  │          What services do you have?    │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌─ t2 ───────────────────────────────────┐  │
│  │ I can use 40+ paid services:           │  │
│  │                                        │  │
│  │ 🔍 Web search · 📰 News · ✈️ Flights  │  │
│  │ 🤖 AI (GPT-4o, Claude) · 🖼 Images    │  │
│  │ 📧 Email · 📮 Postcards · 🎁 Gift cards│ │
│  │ 📈 Crypto · 📊 Stocks · 💱 Currency    │  │
│  │ 🌐 Translate · 🔊 Text-to-speech      │  │
│  │ 📸 Screenshots · 💻 Code · 🔗 URLs    │  │
│  │                                        │  │
│  │ Just describe what you need:           │  │
│  │ "Search for SUI news"                  │  │
│  │ "Buy a $25 Amazon gift card"           │  │
│  │ "What's AAPL trading at?"              │  │
│  └────────────────────────────────────────┘  │
│                                              │
├─────────────────────────────────────────────┤
│  ┌────────────────────────────────────────┐  │
│  │  Ask anything...                    🎤 │  │
│  └────────────────────────────────────────┘  │
│  Save  Send  Swap  Invest  Borrow  More ▾   │
└─────────────────────────────────────────────┘
```

---

### 3j. Contextual AI Chips — States

**New user (no funds):**
```
┌─ Contextual AI Chips ────────────────────────┐
│  👋 Add funds to start   📋 What can I do?   │
└──────────────────────────────────────────────┘
```

**Active user, morning:**
```
┌─ Contextual AI Chips ────────────────────────┐
│  ☀ Morning briefing   💵 Earned $0.12 overnight│
└──────────────────────────────────────────────┘
```

**Idle funds + rewards:**
```
┌─ Contextual AI Chips ────────────────────────┐
│  💰 Save $500 idle — 3.9%   🏆 Claim $2.50   │
└──────────────────────────────────────────────┘
```

**Better rate available:**
```
┌─ Contextual AI Chips ────────────────────────┐
│  📈 Switch to 4.2% Suilend (+$0.25/mo)       │
└──────────────────────────────────────────────┘
```

**Risky health factor:**
```
┌─ Contextual AI Chips ────────────────────────┐
│  ⚠ Repay — HF at 1.3   📊 View risk report   │
└──────────────────────────────────────────────┘
```

**Session expiring:**
```
┌─ Contextual AI Chips ────────────────────────┐
│  ⚠ Session expires soon — refresh now         │
└──────────────────────────────────────────────┘
```

**All good:**
```
┌─ Contextual AI Chips ────────────────────────┐
│  ✅ Earning 3.9% on $32   📋 What can I do?  │
└──────────────────────────────────────────────┘
```

---

### 3k. ChipBar — Collapsed vs Expanded

**Default (collapsed):**
```
  Save  Send  Swap  Invest  Borrow  More ▾
```

**Expanded (user taps "More"):**
```
  Save  Send  Swap  Invest  Borrow  More ▴
  Withdraw  Repay  Receive  Report  History  Help
```

---

### 3l. Settings — Agent Budget

```
┌─ Settings ──────────────────────────────────┐
│                                              │
│  ─── Agent ──────────────────────────────── │
│                                              │
│  Auto-approve budget                         │
│  Per-task spending limit for AI agent        │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  $0.50                            [✓]  │  │
│  └────────────────────────────────────────┘  │
│  $0.10  $0.50  $1.00  $5.00                  │
│                                              │
│  Steps over $0.50 always ask for             │
│  confirmation regardless of budget.          │
│                                              │
│  ─── Safety ─────────────────────────────── │
│  Max per transaction       $1,000            │
│  Daily limit               $5,000            │
│                                              │
└──────────────────────────────────────────────┘
```

---

## 4. User Flows

### Flow A: Read-Only Query (free, instant)

**"What's my savings rate?"**

```
┌─ You ───────────────────────────────────────┐
│ What's my savings rate?                      │
└──────────────────────────────────────────────┘

┌─ t2 ────────────────────────────────────────┐
│ ⏳ Checking rates...                         │
└──────────────────────────────────────────────┘

┌─ t2 ────────────────────────────────────────┐
│ Your USDC savings rate is 3.9% APY on NAVI. │
│ Best available: 4.2% on Suilend (+$0.25/mo  │
│ on your $100).                               │
│                                              │
│ [Switch to better rate]                      │
└──────────────────────────────────────────────┘
```

**Internally:**
1. Client sends message to `/api/agent/chat` with tools
2. LLM returns `tool_call: get_rates()`
3. Client calls `/api/agent/tool` → gets rates
4. Client sends tool result back to `/api/agent/chat`
5. LLM returns text response with chip suggestion

No payment. No approval. Free.

---

### Flow B: Single Service (cheap, auto-approve)

**"What's Bitcoin's price?"**

```
┌─ You ───────────────────────────────────────┐
│ What's Bitcoin's price?                      │
└──────────────────────────────────────────────┘

┌─ t2 ────────────────────────────────────────┐
│ 📈 Fetching price... $0.005                  │
└──────────────────────────────────────────────┘

┌─ t2 ────────────────────────────────────────┐
│ Bitcoin: $97,432 (+2.3% 24h)                 │
│ Ethereum: $3,842 (+1.1% 24h)                │
│ SUI: $2.41 (-0.4% 24h)                      │
│                                              │
│ $0.005 · Tx: 7SSF1x...                      │
└──────────────────────────────────────────────┘
```

**Internally:**
1. LLM returns `tool_call: get_crypto_price({ coins: "bitcoin,ethereum,sui" })`
2. Client calls `payService('coingecko-price', { ids: 'bitcoin,ethereum,sui' })`
3. `payService()` handles: prepare → zkLogin sign → complete
4. Client sends result back to LLM
5. LLM formats response

$0.005 is within auto-approve budget. No confirmation needed.

---

### Flow C: Multi-Step Task (within budget, no interruption)

**"Find cheap flights from Sydney to Tokyo in April and email me the top 3"**

```
┌─ You ───────────────────────────────────────┐
│ Find cheap flights from Sydney to Tokyo in   │
│ April and email me the top 3                 │
└──────────────────────────────────────────────┘

┌─ t2 ────────────────────────────────────────┐
│ ✈️ Step 1 · Searching flights... $0.01       │
└──────────────────────────────────────────────┘

┌─ t2 ────────────────────────────────────────┐
│ ✓ Found 12 flights                           │
│ 📧 Step 2 · Emailing top 3... $0.005        │
└──────────────────────────────────────────────┘

┌─ t2 ────────────────────────────────────────┐
│ ✓ Done — 2 steps · $0.015                   │
│                                              │
│ Top 3 flights SYD → NRT, April 2026:        │
│ 1. ANA $892 — 14h direct, Apr 15            │
│ 2. JAL $945 — 14h direct, Apr 12            │
│ 3. Jetstar $654 — 18h 1-stop, Apr 14        │
│                                              │
│ Sent to you@gmail.com ✓                      │
└──────────────────────────────────────────────┘
```

**Internally:** The LLM returns tool_calls one at a time (or in parallel). The client executes each, feeds results back, LLM continues. Total $0.015 is well within the default $0.50 budget — no plan screen, no approval interruption. Just progress in the feed.

---

### Flow D: Expensive Action (confirmation required)

**"Buy a $25 Amazon gift card for sarah@gmail.com"**

```
┌─ You ───────────────────────────────────────┐
│ Buy a $25 Amazon gift card for               │
│ sarah@gmail.com                              │
└──────────────────────────────────────────────┘

┌─ t2 ────────────────────────────────────────┐
│ 🎁 Gift Card                                 │
│                                              │
│ Amazon $25 · US                              │
│ To: sarah@gmail.com                          │
│ Cost: ~$26.25 (includes 5% fee)             │
│                                              │
│ [Confirm $26.25]  [Cancel]                   │
└──────────────────────────────────────────────┘
```

User taps **Confirm**:

```
┌─ t2 ────────────────────────────────────────┐
│ 🎁 Finding products... → Placing order...    │
└──────────────────────────────────────────────┘

┌─ t2 ────────────────────────────────────────┐
│ ✓ Gift Card Ordered!                         │
│ Amazon $25 → sarah@gmail.com                 │
│ They'll get a "Redeem Now" email.            │
│ Paid $26.25 · Tx: 9KF2m...                  │
└──────────────────────────────────────────────┘
```

**Why confirmation here:** $26.25 exceeds the auto-approve threshold. The LLM recognizes the high-value call and instead of executing it, asks for confirmation first. This is enforced by the client — the `useAgentLoop` hook checks estimated cost before calling `payService()`.

---

### Flow E: Banking Action — Agent Suggests, Doesn't Execute

**"Put my idle cash into the highest yield"**

This is too complex for Tier 2 (parseIntent), so it goes to the agent.

```
┌─ You ───────────────────────────────────────┐
│ Put my idle cash into the highest yield      │
└──────────────────────────────────────────────┘

┌─ t2 ────────────────────────────────────────┐
│ ⏳ Checking your balance and rates...        │
└──────────────────────────────────────────────┘

┌─ t2 ────────────────────────────────────────┐
│ You have $500 in idle cash. The best yield   │
│ right now is 4.2% APY on Suilend — that's   │
│ ~$1.75/mo.                                   │
│                                              │
│ [Save $500]                                  │
└──────────────────────────────────────────────┘
```

The agent calls `get_balance` + `get_rates` (both free), synthesizes advice, and surfaces a chip that triggers the existing save chip flow with confirmation card. **The agent never executes banking transactions directly.** (See [Iron Rules](#13-iron-rules).)

---

### Flow F: Multi-Turn Conversation

**Conversation continues from previous context.**

```
┌─ You ───────────────────────────────────────┐
│ Search for the latest SUI news               │
└──────────────────────────────────────────────┘

┌─ t2 ────────────────────────────────────────┐
│ [search results appear]                      │
└──────────────────────────────────────────────┘

┌─ You ───────────────────────────────────────┐
│ Email me those results                       │
└──────────────────────────────────────────────┘

┌─ t2 ────────────────────────────────────────┐
│ 📧 Emailing results... $0.005               │
└──────────────────────────────────────────────┘

┌─ t2 ────────────────────────────────────────┐
│ ✓ Sent SUI news summary to you@gmail.com    │
│ $0.005 · Tx: 3KJm...                        │
└──────────────────────────────────────────────┘
```

The client maintains conversation history. "Those results" refers to the previous search — the LLM has the full context.

---

### Flow G: Cancel Mid-Task

User taps **Stop** during execution:

```
┌─ t2 ────────────────────────────────────────┐
│ ⏹ Stopped after step 1                      │
│                                              │
│ ✓ Search: found 12 flights ($0.01)           │
│ ○ Email: cancelled                           │
│                                              │
│ Spent $0.01. Results above still available.  │
└──────────────────────────────────────────────┘
```

Cancellation is trivial with the client-driven loop — just stop iterating.

---

### Flow H: Discovery — "What can you do?"

When the user doesn't know what's available:

```
┌─ You ───────────────────────────────────────┐
│ What services do you have?                   │
└──────────────────────────────────────────────┘

┌─ t2 ────────────────────────────────────────┐
│ I can use 40+ paid services for you:         │
│                                              │
│ 🔍 Web search · 📰 News · ✈️ Flights        │
│ 🤖 AI (GPT-4o, Claude, Gemini) · 🖼 Images  │
│ 📧 Email · 📮 Postcards · 🎁 Gift cards     │
│ 📈 Crypto prices · 📊 Stocks · 💱 Currency   │
│ 🌐 Translate · 🔊 Text-to-speech            │
│ 📸 Screenshots · 💻 Run code · 🔗 Short URLs│
│                                              │
│ Just tell me what you need — e.g.:           │
│ "Search for SUI news"                        │
│ "Buy a $25 Amazon gift card"                 │
│ "What's AAPL trading at?"                    │
└──────────────────────────────────────────────┘
```

This replaces the entire Pay panel for discovery. The LLM knows its tools and can describe them.

---

## 5. How It Fits the Current UI

### Dashboard Layout

```
Before:                           After:
┌─────────────────────┐          ┌─────────────────────┐
│  Balance Header      │          │  Balance Header      │
├─────────────────────┤          ├─────────────────────┤
│  Smart Cards (big)   │          │  Feed                │
│  Feed                │          │  (cleaner, no cards) │
│  (cluttered)         │          │                      │
├─────────────────────┤          ├─────────────────────┤
│  [Input Bar]         │          │  AI Chips (compact)  │
│  12 static chips     │          │  [Input Bar]         │
│  including Pay       │          │  6 core + More ▾     │
└─────────────────────┘          └─────────────────────┘
```

### What changes

| Element | Before | After |
|---------|--------|-------|
| Input bar | Routes to chat-only LLM | Routes to agent loop |
| Feed | LLM text + bulky smart cards | Agent progress + results (clean) |
| Smart cards | Big cards in scroll area | **Contextual AI chips** above input |
| Pay chip | Opens ServicesPanel slide-over | **Removed** |
| ServicesPanel | Slide-over with forms | **Removed** |
| Chip bar | 12 static chips | 6 core + "More" expandable |
| Settings panel | Safety limits, contacts, DCA | + Agent budget setting |

### Smart Cards → Contextual AI Chips (Apple-Inspired)

Smart cards currently render as bulky cards in the feed area — easy to scroll past.
Inspired by Apple Intelligence's Siri UI, we move this intelligence to **compact contextual chips** directly above the input bar — always visible, right where the user's eyes are.

Same `deriveSmartCards()` data, different presentation:

| Before (Smart Card) | After (Contextual Chip) |
|---|---|
| Big card in feed scroll area | Compact pill above input |
| Easy to miss | Always visible |
| Takes up feed space | Zero feed clutter |
| 1-2 visible at a time | 2-3 visible, horizontally scrollable |

The agent and contextual chips serve different purposes:

| | Contextual AI Chips | Agent Loop |
|---|---|---|
| **Trigger** | Automatic, on load | User-initiated (typed) |
| **Purpose** | Proactive nudges | Reactive execution |
| **Actions** | Trigger chip flows | Execute services, synthesize info |
| **Cost** | Free (derived from state) | May cost money |
| **Position** | Fixed above input | In the feed area |

### Why Remove the Pay Panel

1. **The agent makes it redundant.** Every service is accessible via the input bar.
2. **Forms add friction.** The agent extracts parameters from natural language.
3. **Discovery is handled by Flow H.** "What can you do?" is better than browsing a grid.
4. **Less surface area = less maintenance.** One path, not two.
5. **"Less is more."** One input that does everything > input + slide-over panel with forms.

The `ServicesPanel`, `ServiceCard`, `SmartForm`, and `GiftCardGrid` components can be deleted. The `service-catalog.ts` file stays (tool definitions reference it). The `service-gateway.ts` file stays (used by `payService()`).

---

## 6. Tool Definitions

Tools use OpenAI-style function schemas. The LLM sees friendly names — no raw gateway URLs.

### Read Tools (free)

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_balance` | Cash, investments, savings, debt, holdings | none |
| `get_rates` | Yield rates across protocols | none |
| `get_history` | Recent transactions | `limit?: number` |
| `get_portfolio` | Investment P&L and allocations | none |
| `get_health` | Health factor and borrow safety | none |

### Service Tools (paid via MPP)

| Tool | Cost | Description |
|------|------|-------------|
| `web_search` | $0.005 | Search the web (Brave) |
| `get_news` | $0.005 | Breaking news (NewsAPI) |
| `get_crypto_price` | $0.005 | Live crypto prices (CoinGecko) |
| `get_stock_quote` | $0.005 | Stock quotes (AlphaVantage) |
| `convert_currency` | $0.005 | Forex conversion (ExchangeRate) |
| `translate` | $0.005 | Translate text (DeepL) |
| `send_email` | $0.005 | Send email (Resend) |
| `shorten_url` | $0.005 | Short links (Short.io) |
| `generate_qr` | $0.005 | QR codes |
| `run_code` | $0.005 | Execute code (Judge0) |
| `ask_ai` | $0.01 | GPT-4o / Claude / Gemini / etc. |
| `search_flights` | $0.01 | Flights (SerpAPI) |
| `take_screenshot` | $0.01 | Webpage capture |
| `security_scan` | $0.01 | VirusTotal URL scan |
| `generate_image` | $0.03 | Image gen (Fal/Flux) |
| `text_to_speech` | $0.05 | Audio (ElevenLabs) |
| `send_postcard` | ~$1.00 | Physical mail (Lob) |
| `buy_gift_card` | dynamic | Gift cards — 800+ brands (Reloadly) |

**18 service tools, 5 read tools = 23 total.** Compared to MCP's 35, we exclude banking actions (chip flows handle those) and internal tools (contacts, config, lock).

### Tool → Service Mapping

Each tool maps to a `serviceId` and argument transformer. This is the bridge between the agent's friendly tool names and the existing `payService()` + `service-gateway.ts` infrastructure:

```typescript
// lib/agent-tools.ts
export const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  // Read tools
  get_balance:   { type: 'read', handler: 'balance' },
  get_rates:     { type: 'read', handler: 'rates' },
  get_history:   { type: 'read', handler: 'history' },
  get_portfolio: { type: 'read', handler: 'portfolio' },
  get_health:    { type: 'read', handler: 'health' },

  // Service tools — reuse payService(serviceId, fields)
  web_search:       { type: 'service', serviceId: 'brave-search',
                      transform: a => ({ q: a.query }) },
  get_news:         { type: 'service', serviceId: 'newsapi',
                      transform: a => ({ q: a.topic }) },
  get_crypto_price: { type: 'service', serviceId: 'coingecko-price',
                      transform: a => ({ ids: a.coins }) },
  get_stock_quote:  { type: 'service', serviceId: 'alphavantage-quote',
                      transform: a => ({ symbol: a.symbol }) },
  convert_currency: { type: 'service', serviceId: 'exchangerate-convert',
                      transform: a => ({ from: a.from, to: a.to, amount: String(a.amount) }) },
  translate:        { type: 'service', serviceId: 'translate',
                      transform: a => ({ text: a.text, target: a.target_language }) },
  send_email:       { type: 'service', serviceId: 'resend-email',
                      transform: a => ({ to: a.to, subject: a.subject, body: a.body }) },
  shorten_url:      { type: 'service', serviceId: 'shortio',
                      transform: a => ({ originalURL: a.url }) },
  generate_qr:      { type: 'service', serviceId: 'qrcode',
                      transform: a => ({ data: a.data }) },
  run_code:         { type: 'service', serviceId: 'e2b-execute',
                      transform: a => ({ code: a.code, language: a.language }) },
  ask_ai:           { type: 'service', serviceId: 'openai-chat',
                      transform: a => ({ prompt: a.prompt, model: a.model }) },
  search_flights:   { type: 'service', serviceId: 'serpapi-flights',
                      transform: a => ({ departure: a.from, arrival: a.to, date: a.date }) },
  take_screenshot:  { type: 'service', serviceId: 'screenshot',
                      transform: a => ({ url: a.url }) },
  security_scan:    { type: 'service', serviceId: 'virustotal',
                      transform: a => ({ url: a.url }) },
  generate_image:   { type: 'service', serviceId: 'fal-flux',
                      transform: a => ({ prompt: a.prompt }) },
  text_to_speech:   { type: 'service', serviceId: 'elevenlabs-tts',
                      transform: a => ({ text: a.text }) },
  send_postcard:    { type: 'service', serviceId: 'lob-postcard',
                      transform: a => ({ to_name: a.to_name, to_address: a.to_address, message: a.message }) },
  buy_gift_card:    { type: 'service', serviceId: 'reloadly-giftcard',
                      transform: a => ({ brand: a.brand, amount: String(a.amount), email: a.email, country: a.country }) },
};
```

### Gift Card Two-Step Flow

Reloadly needs two API calls: browse products (get `productId`) → place order. The `buy_gift_card` tool executor handles both internally:

1. First `payService('reloadly-browse', { countryCode: args.country })` → get matching productId
2. Then `payService('reloadly-giftcard', { productId, unitPrice, email, countryCode })`

This means two payment transactions but the user sees one logical action. The agent loop handles this naturally — the `buy_gift_card` executor makes two sequential `payService()` calls.

(Requires adding a `reloadly-browse` entry to `service-gateway.ts` for product discovery.)

---

## 7. Client-Driven Agent Loop

### LLM Provider: Claude (Anthropic)

We use **Claude claude-sonnet-4-20250514** (or latest) via the Anthropic SDK directly. Claude is the most reliable model for tool calling — it follows schemas precisely, knows when *not* to call tools, and handles multi-step reasoning well.

**Why not OpenAI-compatible format?**
- Anthropic's native API is the most reliable path — no translation layers, no middlemen
- The `/api/agent/chat` proxy normalizes the response to a standard internal format, so the client doesn't care which provider is behind it
- If we ever need to swap providers, only this one file changes

**Environment variables:**
```
ANTHROPIC_API_KEY=sk-ant-...        # Anthropic API key
AGENT_MODEL=claude-sonnet-4-20250514  # Configurable, defaults to claude-sonnet-4-20250514
```

### `/api/agent/chat` — Stateless LLM Proxy

```typescript
// POST /api/agent/chat
// Input: { messages: ChatMessage[], address: string, email: string }
// Output: { content?: string, tool_calls?: ToolCall[] }
//
// Translates between Anthropic's native format and our internal format.
// The client always sees: { content, tool_calls: [{ id, function: { name, arguments } }] }

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.AGENT_MODEL ?? 'claude-sonnet-4-20250514';

export async function POST(request: NextRequest) {
  const { messages, address, email } = await request.json();

  const systemPrompt = buildSystemPrompt(address, email);
  const tools = getAnthropicTools(); // Anthropic tool format

  // Convert our internal message format → Anthropic format
  const anthropicMessages = toAnthropicMessages(messages);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: anthropicMessages,
    tools,
  });

  // Normalize Anthropic response → our internal format
  // Anthropic: { content: [{ type: 'text', text }, { type: 'tool_use', id, name, input }] }
  // Ours:     { content?: string, tool_calls?: [{ id, function: { name, arguments } }] }
  return NextResponse.json(normalizeResponse(response));
}

function normalizeResponse(response: Anthropic.Message) {
  let content: string | undefined;
  const toolCalls: ToolCall[] = [];

  for (const block of response.content) {
    if (block.type === 'text') {
      content = block.text;
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        function: { name: block.name, arguments: JSON.stringify(block.input) },
      });
    }
  }

  return {
    content: content || undefined,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  // Convert tool results from { role: 'tool', tool_call_id, content }
  // to Anthropic's { role: 'user', content: [{ type: 'tool_result', tool_use_id, content }] }
  // Group consecutive tool results into a single user message.
  // ... (implementation detail)
}
```

Stateless. Fast. Under 5 seconds. The normalization is ~30 lines — the client never knows it's talking to Anthropic.

### `/api/agent/tool` — Read Tool Executor

```typescript
// POST /api/agent/tool
// Input: { tool: string, args: Record<string, unknown>, address: string }
// Output: { result: unknown }

export async function POST(request: NextRequest) {
  const { tool, args, address } = await request.json();

  switch (tool) {
    case 'get_balance':
      return NextResponse.json(await fetchBalance(address));
    case 'get_rates':
      return NextResponse.json(await fetchRates());
    case 'get_history':
      return NextResponse.json(await fetchHistory(address, args.limit));
    case 'get_portfolio':
      return NextResponse.json(await fetchPortfolio(address));
    case 'get_health':
      return NextResponse.json(await fetchHealth(address));
    default:
      return NextResponse.json({ error: 'Unknown tool' }, { status: 400 });
  }
}
```

### `hooks/useAgentLoop.ts` — Client Loop

```typescript
function useAgentLoop() {
  const { agent } = useAgent();
  const [status, setStatus] = useState<'idle' | 'running' | 'confirming'>('idle');
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const conversationRef = useRef<ChatMessage[]>([]);
  const cancelledRef = useRef(false);

  const run = useCallback(async (
    message: string,
    address: string,
    budget: number,
    callbacks: {
      onStep: (step: AgentStep) => void;
      onText: (text: string) => void;
      onConfirmNeeded: (tool: string, cost: number) => Promise<boolean>;
      onDone: (totalCost: number) => void;
      onError: (error: string) => void;
    },
  ) => {
    setStatus('running');
    cancelledRef.current = false;
    let cost = 0;
    let iterations = 0;

    // Add user message to conversation
    conversationRef.current.push({ role: 'user', content: message });

    while (iterations < 10 && !cancelledRef.current) {
      iterations++;

      // 1. Call LLM
      const llmRes = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: conversationRef.current,
          address,
        }),
      });
      const assistantMessage = await llmRes.json();

      // 2. If text response — done
      if (assistantMessage.content && !assistantMessage.tool_calls?.length) {
        conversationRef.current.push(assistantMessage);
        callbacks.onText(assistantMessage.content);
        callbacks.onDone(cost);
        break;
      }

      // 3. If tool calls — execute each
      if (assistantMessage.tool_calls) {
        conversationRef.current.push(assistantMessage);

        for (const toolCall of assistantMessage.tool_calls) {
          if (cancelledRef.current) break;

          const executor = TOOL_EXECUTORS[toolCall.function.name];
          if (!executor) continue;

          const args = JSON.parse(toolCall.function.arguments);
          let result: unknown;

          if (executor.type === 'read') {
            // Free — execute directly
            callbacks.onStep({ tool: toolCall.function.name, status: 'running' });
            const res = await fetch('/api/agent/tool', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tool: toolCall.function.name, args, address }),
            });
            result = await res.json();
            callbacks.onStep({ tool: toolCall.function.name, status: 'done', cost: 0 });
          }

          else if (executor.type === 'service') {
            const estimatedCost = executor.estimatedCost ?? 0.01;

            // Check budget + confirm expensive calls
            if (cost + estimatedCost > budget || estimatedCost > 0.50) {
              const approved = await callbacks.onConfirmNeeded(
                toolCall.function.name, estimatedCost
              );
              if (!approved) { cancelledRef.current = true; break; }
            }

            callbacks.onStep({ tool: toolCall.function.name, status: 'running', cost: estimatedCost });

            const fields = executor.transform(args);
            const sdk = await agent.getInstance();
            const serviceResult = await sdk.payService({
              serviceId: executor.serviceId,
              fields,
            });

            result = serviceResult.result;
            cost += parseFloat(serviceResult.price);
            setTotalCost(cost);
            callbacks.onStep({ tool: toolCall.function.name, status: 'done', cost: parseFloat(serviceResult.price) });
          }

          // Truncate large results before feeding back to LLM
          const resultStr = JSON.stringify(result);
          const truncated = resultStr.length > 4000
            ? resultStr.slice(0, 4000) + '…[truncated]'
            : resultStr;

          conversationRef.current.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: truncated,
          });
        }
      }
    }

    setStatus('idle');
  }, [agent]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setStatus('idle');
  }, []);

  const clearHistory = useCallback(() => {
    conversationRef.current = [];
  }, []);

  return { run, cancel, clearHistory, status, steps, totalCost };
}
```

---

## 8. Budget & Approval Model

### Simple Rule

| Estimated cost | Behavior |
|----------------|----------|
| $0 (read tools) | Execute immediately, no approval |
| ≤ session budget (default $0.50) | Execute immediately, auto-sign |
| > session budget per step | Pause, show confirmation in feed |
| Budget exhausted mid-task | Stop, show what was completed |

**No plan screen.** The user sets their comfort level once in Settings. After that, cheap tasks just flow. Expensive ones pause for confirmation on the specific expensive step — not a separate "plan approval" screen.

### Session Budget

- Default: **$0.50** per agent task
- Stored in `UserPreferences.agentBudget`
- Configurable in Settings under "Agent"
- Per-task — resets each new invocation
- Displayed: `"Agent auto-approve: up to $0.50 per task"`

### High-Value Guardrails

Gift cards, postcards, and anything over $0.50 per step always confirm regardless of budget. The confirmation appears inline in the feed as a standard confirmation card (same pattern as banking actions).

---

## 9. Conversation History

The client maintains an array of `ChatMessage[]` across the agent session. This enables multi-turn context:

```
Turn 1: "Search for SUI news"
  → messages: [user, assistant(tool_call), tool(result), assistant(text)]

Turn 2: "Email me those results"
  → messages: [...turn1, user("email me those"), assistant(tool_call:send_email), ...]
```

### Rules

- History persists within a dashboard session (not across page reloads)
- Max history: 20 messages (trim oldest when exceeded, keep system prompt)
- `clearHistory()` resets on explicit user action or session change
- Tool results are truncated to 4KB before appending (prevent context overflow)
- Binary results (images, audio) are not stored in history — only a reference like `"[image: screenshot of t2000.ai]"`

---

## 10. Bug Fixes (Pre-requisites)

These fix the existing broken services. Do these first — they're needed whether or not we build the agent loop, and the agent loop reuses `payService()`.

### 10a. Gift Card Region

**Problem:** Reloadly requires `countryCode`. Web app doesn't collect it.

**Files:** `service-catalog.ts`, `service-gateway.ts`

**Fix:**
1. Add `country` select field to gift card service definition
2. Add `countryCode` to gateway transform
3. Add `reloadly-browse` mapping for product discovery (used by agent's two-step flow)

### 10b. Binary Response Handling

**Problem:** Screenshot returns JFIF bytes as text. TTS returns audio bytes as text.

**File:** `services/complete/route.ts`

**Fix:** In `callGateway()`, check `Content-Type` header. If `image/*` or `audio/*`, read as `arrayBuffer`, convert to base64 data URI, return as structured `{ type: 'image'|'audio', dataUri }`.

**File:** `dashboard/page.tsx` (`handleServiceSubmit`)

**Fix:** Check for `result.type === 'image'` or `result.type === 'audio'` in the response and use the existing `image` / `audio` feed item types (already have renderers in `FeedRenderer.tsx`).

### 10c. Flight Search Params

**Problem:** May have field name mismatch between catalog and SerpAPI gateway.

**File:** `service-gateway.ts`

**Fix:** Verify `departure_id`, `arrival_id`, `outbound_date` match what the gateway expects. Add `type: "2"` for round-trip default.

---

## 11. Implementation Plan

### Phase 1: Bug Fixes (2-3 hours)

| Task | Files |
|------|-------|
| Gift card: add country field + gateway transform | `service-catalog.ts`, `service-gateway.ts` |
| Binary responses: detect in complete route, return data URI | `services/complete/route.ts` |
| Binary rendering: handle in handleServiceSubmit | `dashboard/page.tsx` |
| Flight params: verify gateway mapping | `service-gateway.ts` |

### Phase 2: Agent Infrastructure (3-4 hours)

| Task | Files |
|------|-------|
| Install `@anthropic-ai/sdk` | `package.json` |
| Tool schemas (Anthropic tool format) | `lib/agent-tools.ts` (new) |
| Tool→service mapping + transformers | `lib/agent-tools.ts` |
| System prompt — inject email, address, balance (see §16) | `lib/agent-tools.ts` |
| LLM proxy + Anthropic→internal format normalization | `app/api/agent/chat/route.ts` (new) |
| Read tool executor endpoint | `app/api/agent/tool/route.ts` (new) |
| Graceful degradation when LLM unavailable (Principle 5) | `hooks/useAgentLoop.ts` |

### Phase 3: Client Agent Loop (3-4 hours)

| Task | Files |
|------|-------|
| `useAgentLoop` hook — loop, cancel, history | `hooks/useAgentLoop.ts` (new) |
| Budget checking + confirmation flow | `hooks/useAgentLoop.ts` |
| Tool result truncation | `hooks/useAgentLoop.ts` |
| Error handling per step | `hooks/useAgentLoop.ts` |

### Phase 4: Dashboard Integration (3-4 hours)

| Task | Files |
|------|-------|
| Replace `llm.queryStream` with agent loop | `dashboard/page.tsx` |
| Step progress in feed | `dashboard/page.tsx` |
| Inline confirmation for expensive steps | `dashboard/page.tsx` |
| Stop button during execution | `dashboard/page.tsx` |
| Multi-turn conversation support | `dashboard/page.tsx` |

### Phase 5: Feed Renderers (2-3 hours)

| Task | Files |
|------|-------|
| `agent-response` feed item — single evolving card (Principle 1) | `feed-types.ts`, `FeedRenderer.tsx` |
| Step tracker: compact ✓ line while running, summary line when done | `FeedRenderer.tsx` |
| Shimmer animation for "thinking" state (Principle 4) | CSS / `FeedRenderer.tsx` |
| Subtle cost footer — `$0.005 ▸` with tap-to-expand (Principle 2) | `FeedRenderer.tsx` |
| Error state with inline retry (see wireframe 3e2) | `FeedRenderer.tsx` |
| Ensure image data URIs work in existing renderer | `FeedRenderer.tsx` |
| Ensure audio data URIs work in existing renderer | `FeedRenderer.tsx` |

### Phase 6: Cleanup (2-3 hours)

| Task | Files |
|------|-------|
| Remove Pay chip from ChipBar | `ChipBar.tsx` |
| Remove ServicesPanel, ServiceCard, SmartForm, GiftCardGrid | Delete components |
| Remove handleServiceSubmit from dashboard | `dashboard/page.tsx` |
| Remove service-catalog.ts service panel references | Various |
| Add agent budget to Settings | `SettingsPanel.tsx` |
| Agent budget in UserPreferences | `schema.prisma`, `preferences/route.ts` |

### Phase 7: Polish (2-3 hours)

| Task | Files |
|------|-------|
| Handle "what can you do?" / "help" nicely | System prompt |
| Loading animations for agent steps | CSS / `FeedRenderer.tsx` |
| Mobile responsive for step cards | CSS |
| Rate limiting for agent loop | `api/agent/chat/route.ts` |

### Phase 8: Contextual AI Chips (3-4 hours)

Apple Intelligence-inspired contextual suggestions above the input bar.

| Task | Files |
|------|-------|
| Refactor `deriveSmartCards()` → `deriveContextualChips()` | `lib/smart-cards.ts` → `lib/contextual-chips.ts` |
| New `ContextualChips` component | `components/dashboard/ContextualChips.tsx` (new) |
| Position above InputBar, horizontally scrollable | `dashboard/page.tsx` |
| Remove `SmartCardFeed` from feed area | `dashboard/page.tsx` |
| Delete `SmartCardFeed` component | `components/dashboard/SmartCardFeed.tsx` |
| Slim ChipBar: 6 core + "More" expand | `ChipBar.tsx` |
| Add time-of-day awareness (morning briefing, etc.) | `lib/contextual-chips.ts` |
| Add post-agent suggestions ("try another?") | `lib/contextual-chips.ts` |

**Chip derivation logic (extends existing smart card logic):**

```typescript
interface ContextualChip {
  id: string;
  icon: string;
  label: string;       // compact — max ~25 chars
  chipFlow?: string;    // triggers existing chip flow
  agentPrompt?: string; // feeds into agent loop
  priority: number;     // higher = shown first
  dismissible?: boolean;
}

function deriveContextualChips(state: AccountState): ContextualChip[] {
  const chips: ContextualChip[] = [];

  // Critical — always show first
  if (state.sessionExpiringSoon) {
    chips.push({ id: 'session', icon: '⚠', label: 'Session expiring — refresh',
                 chipFlow: 'refresh-session', priority: 100 });
  }
  if (state.healthFactor && state.healthFactor < 1.5 && state.healthFactor > 0) {
    chips.push({ id: 'risk', icon: '⚠', label: `Repay — HF at ${state.healthFactor.toFixed(1)}`,
                 chipFlow: 'repay', priority: 90 });
  }

  // Actionable — high priority
  if (state.pendingRewards > 0) {
    chips.push({ id: 'rewards', icon: '🏆', label: `Claim $${state.pendingRewards.toFixed(2)}`,
                 chipFlow: 'claim-rewards', priority: 80 });
  }
  if (state.recentIncoming?.length) {
    const total = state.recentIncoming.reduce((s, tx) => s + tx.amount, 0);
    chips.push({ id: 'received', icon: '💸', label: `$${total.toFixed(0)} received — save it?`,
                 chipFlow: 'save', priority: 75, dismissible: true });
  }
  if (state.cash > 5) {
    const monthlyEarnings = (state.cash * (state.savingsRate / 100)) / 12;
    chips.push({ id: 'idle', icon: '💰', label: `Save $${Math.floor(state.cash)} idle — ${state.savingsRate.toFixed(1)}%`,
                 chipFlow: 'save-all', priority: 70 });
  }
  if (state.bestAlternativeRate && state.currentRate) {
    const diff = state.bestAlternativeRate.rate - state.currentRate;
    if (diff > 0.3 && state.savings > 0) {
      chips.push({ id: 'rate', icon: '📈', label: `Switch to ${state.bestAlternativeRate.rate.toFixed(1)}% ${state.bestAlternativeRate.protocol}`,
                   chipFlow: 'rebalance', priority: 65, dismissible: true });
    }
  }

  // Informational — lower priority
  if (state.isFirstOpenToday && state.overnightEarnings && state.overnightEarnings > 0) {
    chips.push({ id: 'earnings', icon: '💵', label: `Earned $${state.overnightEarnings.toFixed(2)} overnight`,
                 priority: 50, dismissible: true });
  }

  // Fallback — discovery
  if (chips.length === 0) {
    if (state.cash === 0 && state.savings === 0) {
      chips.push({ id: 'welcome', icon: '👋', label: 'Add funds to get started',
                   chipFlow: 'receive', priority: 10 });
    } else {
      chips.push({ id: 'good', icon: '✅', label: `Earning ${state.savingsRate.toFixed(1)}% on $${Math.floor(state.savings)}`,
                   priority: 10 });
    }
    chips.push({ id: 'discover', icon: '📋', label: 'What can I do?',
                 agentPrompt: 'What services and features do you have?', priority: 5 });
  }

  return chips.sort((a, b) => b.priority - a.priority).slice(0, 3);
}
```

### Phase 9: Test Coverage (2-3 hours)

Builds on existing Vitest setup (8 test files already in place). Focus on the new code paths — no need to test LLM output quality, just the plumbing.

| Task | Files | What it tests |
|------|-------|---------------|
| Agent tools — schema validity + all transformers | `lib/agent-tools.test.ts` (new) | Every `TOOL_EXECUTORS` entry has valid `serviceId`, `transform` produces correct shape |
| Agent tools — unknown tool rejection | `lib/agent-tools.test.ts` | Calling a non-existent tool returns error |
| Agent loop — budget enforcement | `hooks/useAgentLoop.test.ts` (new) | Auto-approve under budget, confirm over budget, stop when exhausted |
| Agent loop — cancel mid-chain | `hooks/useAgentLoop.test.ts` | Setting `cancelledRef` stops iteration, partial results preserved |
| Agent loop — max iterations (10) | `hooks/useAgentLoop.test.ts` | Loop exits after 10 rounds even if LLM keeps returning tool_calls |
| Agent loop — tool result truncation | `hooks/useAgentLoop.test.ts` | Results >4KB are truncated before appending to conversation |
| Agent loop — graceful degradation | `hooks/useAgentLoop.test.ts` | LLM 500/timeout → fallback message, no crash |
| `/api/agent/chat` route | `app/api/agent/chat/route.test.ts` (new) | Auth check, rate limit, forwards to LLM, returns structured response |
| `/api/agent/tool` route | `app/api/agent/tool/route.test.ts` (new) | Each read tool returns data, unknown tool → 400 |
| Contextual chips derivation | `lib/contextual-chips.test.ts` (new) | Priority ordering, max 3 chips, critical states first, fallbacks for empty/new users |
| Updated smart-cards → contextual-chips migration | `lib/smart-cards.test.ts` (update) | Existing tests still pass after refactor |

**Not tested (by design):**
- LLM response quality (non-deterministic, test manually)
- `payService()` end-to-end (already has integration coverage via existing prepare/complete route tests)
- UI rendering (test manually in browser per CLAUDE.md workflow)

**Total: ~22-31 hours across 5-6 focused sessions**

---

## 12. Edge Cases & Error Handling

### Payment Failure Mid-Chain

- Completed steps: results preserved in feed
- Failed step: show error + `[Retry]` chip
- Remaining steps: cancelled (client stops looping)
- Budget: only deducts for successful payments

### Gateway Errors

- Error fed back to LLM as tool result: `{ error: "Service unavailable" }`
- LLM decides: retry, use alternative, or inform user
- Example: Brave Search down → LLM tries NewsAPI instead

### Tool Result Size

- Results truncated to **4KB** before feeding to LLM context
- Binary results (images, audio) stored as references: `"[image generated]"`
- Full result displayed in feed — truncation only affects LLM context

### Rate Limits

- Max **10 iterations** per agent task (prevents infinite loops)
- Max **5 agent tasks per minute** per user (prevents abuse)
- Per-task LLM calls: ~1-10 depending on complexity
- Existing 20/min LLM rate limit still applies per IP

### LLM Misbehavior

- Unknown tool name → skip, feed error to LLM, let it retry
- Invalid args → feed validation error to LLM
- Repeated identical calls → break after 3, inform user
- LLM tries to execute banking action → blocked by Iron Rules
- No tool_calls AND no content → treat as empty response, retry once

### Network Issues

- Each request is independent — no session to lose
- If a `payService()` call fails mid-signing, existing `ServiceDeliveryError` retry flow applies
- If `/api/agent/chat` times out, show partial results + `[Continue]` chip

---

## 13. What We're Removing

| Component | Why | Phase |
|-----------|-----|-------|
| `ServicesPanel` | Agent replaces it | 6 |
| `ServiceCard` | No longer rendered | 6 |
| `SmartForm` | Agent extracts params from NL | 6 |
| `GiftCardGrid` | Agent handles gift card flow | 6 |
| `Pay` chip in ChipBar | Input bar handles everything | 6 |
| `handleServiceSubmit` | Replaced by agent loop | 6 |
| `handleServiceRetry` | Retry built into agent steps | 6 |
| `servicesOpen` state | No panel to open | 6 |
| `parseServiceIntent` | Agent handles intents naturally | 6 |
| `SmartCardFeed` component | Replaced by contextual chips | 8 |
| Smart card feed items in page | Replaced by contextual chips | 8 |
| 6 overflow chips (static) | Moved under "More" expand | 8 |

**Files to delete:**
- `components/services/ServicesPanel.tsx`
- `components/services/ServiceCard.tsx`
- `components/services/SmartForm.tsx`
- `components/services/GiftCardGrid.tsx`
- `components/dashboard/SmartCardFeed.tsx` (Phase 8)

**Files to refactor:**
- `lib/smart-cards.ts` → `lib/contextual-chips.ts` (Phase 8, same logic, new format)
- `components/dashboard/ChipBar.tsx` (Phase 8, 6 core + More)

**Files to keep (still needed):**
- `lib/service-catalog.ts` — tool definitions reference service metadata
- `lib/service-gateway.ts` — `payService()` uses this for gateway mapping
- `lib/service-pricing.ts` — cost estimation
- `app/api/services/prepare/route.ts` — `payService()` calls this
- `app/api/services/complete/route.ts` — `payService()` calls this
- `app/api/services/retry/route.ts` — error recovery

---

## 14. Iron Rules

Non-negotiable constraints for the agent implementation:

1. **The agent NEVER executes banking transactions.** No sends, saves, swaps, borrows, repays, or withdrawals. It can read balances and suggest actions via chips, but execution always goes through the existing chip flow with confirmation cards. This preserves the explicit-confirmation UX that keeps user funds safe.

2. **The agent NEVER calls arbitrary URLs.** Tool executors map to known `serviceId` values in `service-gateway.ts`. The LLM doesn't see or construct gateway URLs. This prevents prompt injection from triggering calls to unauthorized endpoints.

3. **Every paid tool call goes through `payService()`.** The existing prepare → sign → complete flow is the only payment path. No shortcuts, no new payment flows.

4. **Tool results are truncated before feeding to LLM.** 4KB max per result. This prevents context overflow and keeps costs predictable.

5. **Max 10 loop iterations per task.** Hard limit. If the LLM can't finish in 10 rounds, the task is too complex for a single prompt.

6. **Expensive steps (>$0.50) always confirm.** Regardless of budget setting. The user always sees what they're paying for high-value actions.

7. **The agent loop is client-driven.** No server-side state. No SSE. No WebSockets. Each API call is stateless and fast (<5s).

---

## 15. Design Principles — The "Magic" Standard

### Principle 1: One Evolving Card, Not a Chat Log

The current wireframes show separate feed items for each step + the final response. This feels like a chatbot. Apple's approach: one card that evolves in place.

**Before (chatbot feel):**
```
┌─ t2 step ─────────────────────────┐
│ ✓ Search flights         $0.01    │
│ ✓ Email results          $0.005   │
└───────────────────────────────────┘

┌─ t2 ──────────────────────────────┐
│ Top 3 flights SYD → NRT...        │
│ Sent to you@gmail.com ✓          │
│ 2 steps · $0.015 total           │
└───────────────────────────────────┘
```

**After (magic feel):**
```
┌─ t2 ──────────────────────────────┐
│ ✓ Searched flights · ✓ Emailed    │  ← compact step summary (collapsed)
│                                    │
│ Top 3 flights SYD → NRT:          │  ← final content
│ 1. ANA $892 — 14h direct, Apr 15  │
│ 2. JAL $945 — 14h direct, Apr 12  │
│ 3. Jetstar $654 — 18h 1-stop      │
│                                    │
│ Sent to you@gmail.com ✓           │
│                          $0.015 ▸  │  ← subtle cost, tap to expand tx details
└───────────────────────────────────┘
```

While running, the same card shows the live step:
```
┌─ t2 ──────────────────────────────┐
│ ✓ Searched flights                 │
│ ● Emailing top 3...               │
│                                    │
│ ●●● (thinking animation)          │
└───────────────────────────────────┘
```

Implementation: Use a single `agent-response` feed item that updates in-place via `feed.updateLastItem()` as steps complete. The step tracker, LLM thinking animation, and final text all render inside one card. Clean. Minimal. Magical.

### Principle 2: Cost Should Be Subtle, Not Noisy

Showing `$0.005 · Tx: 7SSF1x...` on every response is noisy. Most users don't care about tx hashes for a $0.005 call.

**Rule:**
- **Cheap calls (≤$0.05):** Show cost as a subtle right-aligned footnote. No tx hash. `$0.005 ▸` — tappable to expand details.
- **Expensive calls (>$0.50):** Show full receipt with tx hash.
- **Multi-step:** Show total at the bottom. Individual step costs only on expand.

This is how Apple Pay works — "Done ✓" is the default, details are on tap.

### Principle 3: The Agent Knows You

The system prompt receives the user's context. No asking questions the app already knows.

**System prompt must include:**
- User's email (from zkLogin JWT) — enables "email me results" without asking
- User's address — enables "what's my balance" without passing it each time
- Balance summary — enables "save my idle cash" without a tool call
- Time of day — enables "morning briefing"

The user types "email me those results" and it just works. No "what's your email?" friction. That's magic.

### Principle 4: Thinking Should Feel Alive

Between steps (when the LLM is deciding what to do next), show a subtle shimmer or pulse animation — not just static dots. The card should feel like it's actively working.

```
┌─ t2 ──────────────────────────────┐
│ ✓ Searched flights                 │
│                                    │
│ ░░░░░░░░░░░░░░░░░░░ (shimmer)    │  ← subtle gradient shimmer, not bouncing dots
└───────────────────────────────────┘
```

This is the difference between "loading..." and "working on it." Apple's Siri has that pulsing glow. We should have a gradient shimmer across the bottom of the active card.

### Principle 5: Graceful Degradation

If `ANTHROPIC_API_KEY` is not set or the LLM is down:
- Agent falls back to the existing `fallbackResponse()` function
- Contextual chips still work (they're derived from account state, not LLM)
- Chip flows still work (Tier 1)
- Intent parser still works (Tier 2)
- Only Tier 3 (agent) is degraded — and it says "I'm having trouble connecting. Try using the chips below." with relevant chip suggestions

The app should never feel broken. Every degraded state should still be useful.

### Principle 6: Zero-Friction First Use

A new user with $0 balance types in the input bar. What happens?

```
┌─ You ───────────────────────────────────────┐
│ What is this?                                │
└──────────────────────────────────────────────┘

┌─ t2 ────────────────────────────────────────┐
│ t2000 is a smart wallet on Sui. You can:     │
│                                              │
│ 💰 Save & earn 3-5% yield on stablecoins    │
│ 📤 Send money to anyone, gas-free            │
│ 📈 Invest in BTC, ETH, Gold                 │
│ 🤖 Use 40+ AI services — search, translate,  │
│    email, gift cards, and more              │
│                                              │
│ To start, send funds to your address:        │
│                                              │
│ [Show my address]                            │
└──────────────────────────────────────────────┘
```

The agent handles onboarding naturally. No separate onboarding flow needed.

### Principle 7: The "More" Chip Behavior

- Tap "More ▾" → expands to show Withdraw, Repay, Receive, Report, History, Help
- Tap "More ▴" → collapses back
- Tap any expanded chip → executes that flow AND auto-collapses
- Scrolling the feed → auto-collapses (less visual noise)
- On mobile: "More" chips wrap to a second line; on very small screens, horizontal scroll

---

## 16. System Prompt

The agent's personality and constraints. Passed as the `system` parameter in the Anthropic `messages.create()` call. This is critical — it defines the "magic."

```
You are t2000, a financial assistant built into a smart wallet on Sui blockchain.

## About the user
- Email: {email}
- Wallet: {address}
- Balance: {balanceSummary}
- Local time: {timeOfDay}

## Your capabilities
You have 5 read tools (free) and 18 service tools (paid via USDC):
- Read: balance, rates, history, portfolio, health factor
- Services: web search, news, crypto prices, stock quotes, flights, email, 
  translate, image gen, screenshots, postcards, gift cards, TTS, code execution,
  QR codes, short URLs, currency conversion, security scans, AI chat

## Rules
- Be concise. 2-4 sentences for simple answers. No markdown formatting.
- When the user asks to perform a banking action (save, send, swap, borrow, 
  repay, withdraw, invest), DO NOT use tools. Instead, respond with advice and 
  suggest they tap the relevant chip. For example: "You have $500 idle. Tap 
  [Save $500] below to start earning 3.9%."
- For paid services, just call the tool. Don't ask permission for cheap calls.
- For expensive services (gift cards, postcards), confirm the details first 
  in your response before calling the tool.
- When the user says "email me" or "send me", use their email: {email}
- Show prices in USD. Show crypto amounts with appropriate precision.
- If you don't know something, say so. Don't make up data.
- Keep tool calls minimal. Don't call tools you don't need.
- When chaining tools, pipe the output of one into the next. Don't ask the 
  user to confirm intermediate steps for cheap calls — just execute.
```

**Model:** Claude claude-sonnet-4-20250514 via `@anthropic-ai/sdk` (native API, not OpenAI-compatible).

**Why Claude:** Proven reliable for tool calling — follows schemas precisely, chains multi-step tasks naturally, and knows when *not* to call a tool. The same model that powers the MCP integration in Claude Desktop, which already demonstrated the postcard chaining use case.

**Cost:** ~$0.003-0.01 per agent turn (input + output tokens). Negligible vs. the paid service calls. Server-side cost, not charged to the user.

**Fallback:** If `ANTHROPIC_API_KEY` is not set, the existing `fallbackResponse()` function handles gracefully (see Principle 5).

---

## MCP Tool Comparison

| MCP Tool | Web Agent | Reason for exclusion |
|----------|-----------|---------------------|
| `t2000_balance` | `get_balance` | ✅ Included |
| `t2000_rates` / `t2000_all_rates` | `get_rates` | ✅ Merged |
| `t2000_history` | `get_history` | ✅ Included |
| `t2000_portfolio` | `get_portfolio` | ✅ Included |
| `t2000_health` | `get_health` | ✅ Included |
| `t2000_pay` | 18 named service tools | ✅ Split into typed tools |
| `t2000_overview` | — | Covered by balance + portfolio |
| `t2000_positions` | — | Covered by balance |
| `t2000_earnings` | — | Covered by balance |
| `t2000_fund_status` | — | Covered by balance |
| `t2000_pending_rewards` | — | Smart cards handle this |
| `t2000_deposit_info` | — | Onboarding card |
| `t2000_services` | — | Agent knows its tools |
| `t2000_contacts` | — | Chip flow |
| `t2000_send/save/withdraw/borrow/repay` | — | Iron Rule #1: chip flows only |
| `t2000_swap/invest/strategy/auto_invest` | — | Iron Rule #1: chip flows only |
| `t2000_rebalance/claim_rewards` | — | Smart card actions |
| `t2000_config/lock` | — | Settings panel |
| `t2000_contact_add/remove` | — | Settings panel |
