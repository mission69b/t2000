# Phase 11c — Gateway UX Polish

> Make the AI financial advisor feel like a premium product, not a prototype.
> Data + insight + next action. Every response. Every channel.

**Status:** 🟡 Not started
**Depends on:** Phase 11b (Gateway + Channels)
**Packages:** `@t2000/gateway`, `@t2000/cli`

---

## 🧭 Principles

1. 📊 **Show data + insight + next action** — Never dump a table. Always notice something and suggest a move.
2. 💰 **Lead with the number** — Users scan for amounts. Put the number first, context second.
3. ⚡ **Zero dead air** — User should always see something happening (typing, tool badges, progress).
4. 📱 **Mobile-first** — Telegram is the primary channel. Everything must read well on a phone screen.
5. 🧠 **Opinionated advisor** — Not a neutral bot. "Your debt costs more than it earns. Pay it off?"

---

## 🎯 Task 1: System Prompt Rewrite — `🔴 HIGH IMPACT` `🟢 LOW EFFORT`

**File:** `packages/gateway/src/system-prompt.ts`

The system prompt controls how every single response looks and feels. Currently 30 lines of generic rules ("be concise", "use markdown tables"). Needs to become the personality engine.

### Changes

1. **Response templates** — Give Claude exact formatting patterns for:
   - Balance (compact aligned text, not a markdown table)
   - Transaction receipt (amount, protocol, APY, tx link, updated balance)
   - Portfolio (inline for ≤3 positions, structured for 4+)
   - Error (what happened + what to do)

2. **Formatting rules:**
   - NEVER use markdown tables for simple 2-column data
   - Use aligned text with emoji indicators
   - Bold for key values only
   - Transaction links: `View → suiscan.xyz/tx/...`
   - Currency: always 2 decimal places
   - APY: always show % with 1-2 decimals

3. **Personality:**
   - Opinionated — notice inefficiencies, suggest improvements
   - Brief — 3-5 lines for simple queries, never an essay
   - End every response with an insight or actionable suggestion
   - Financial advisor tone, not chatbot tone

4. **Example responses in prompt** (Claude pattern-matches):

```
BALANCE EXAMPLE:
Checking     $52.67
Savings      $19.24   earning 4.2%
Debt         -$2.01
Investment    $0.05
─────────────
Net          $70.95

Your debt ($2.01) costs more than it earns.
Pay it off from checking? Just say "repay all."
```

```
TRANSACTION RECEIPT EXAMPLE:
✓ Saved $80.00

Protocol  NAVI
APY       5.57%
Monthly   ~$3.71
View → suiscan.xyz/tx/abc123...

Your savings: $99.24 (+$80.00)
```

```
PORTFOLIO EXAMPLE:
Your portfolio ($152.30, +2.3%):

SUI   45.2 tokens   $48.00   +3.1%   earning 2.6% on Suilend
BTC   0.0012         $89.30   +1.8%
ETH   0.025          $15.00   -0.5%

💡 ETH is the only position losing. Rebalance into SUI?
```

### Acceptance Criteria
- [ ] Balance response uses aligned text, not markdown table
- [ ] Every response ends with insight or suggestion
- [ ] Transaction receipts show amount, protocol, APY, tx link, updated balance
- [ ] No markdown table for fewer than 4 data points
- [ ] Personality feels like a knowledgeable friend, not a bot

---

## 🤖 Task 2: Telegram /start + Typing Indicator — `🔴 HIGH IMPACT` `🟢 LOW EFFORT`

**File:** `packages/gateway/src/channels/telegram.ts`

### Changes

**a) /start command handler:**
- Welcome message with user's current balance summary
- 4 inline keyboard buttons: `💰 Balance`, `📊 Portfolio`, `📈 Rates`, `❓ Help`
- Sets the tone immediately — user sees value before they even type

```
Welcome to t2000 — your AI financial advisor.

Your accounts:
  Checking  $52.67
  Savings   $19.24  (4.2% APY)
  Net       $70.95

Ask me anything, or tap a button below.
```

**b) Typing indicator:**
- Call `ctx.replyWithChatAction('typing')` immediately when a message is received
- One line of code, huge perceived speed improvement
- User sees "typing..." bubble while Claude thinks

### Acceptance Criteria
- [ ] /start sends welcome message with current balance
- [ ] /start includes inline keyboard buttons
- [ ] Typing indicator shows while processing
- [ ] Unauthorized users get rejection on /start too

---

## 🖥️ Task 3: Gateway Default Verbose Output — `🟠 MEDIUM IMPACT` `🟢 TINY EFFORT`

**File:** `packages/gateway/src/gateway.ts`, `packages/cli/src/commands/gateway.ts`

### Changes

- Startup logs (`[gateway] · Starting...`, `[gateway] · WebChat started`) should show by DEFAULT, not only with `--verbose`
- `--verbose` adds debug-level detail (token counts, timing, cost per message)
- Logger level defaults to 'info' with console output for startup messages

### Acceptance Criteria
- [ ] `t2000 gateway` (no flags) shows startup progress
- [ ] Users don't need `--verbose` to know it's working
- [ ] `--verbose` adds per-message debug info

---

## 🔤 Task 4: Telegram HTML Parse Mode — `🟠 MEDIUM IMPACT` `🟢 LOW EFFORT`

**File:** `packages/gateway/src/channels/telegram.ts`

### Changes

- Switch from `parse_mode: 'Markdown'` to `parse_mode: 'HTML'`
- System prompt updated to use HTML formatting hints for Telegram context
- `<b>bold</b>`, `<code>address</code>`, `<a href="url">View →</a>`
- More reliable than Markdown (no escaping issues with `_`, `*`, `[`)
- Fallback to plain text still works

### Acceptance Criteria
- [ ] All Telegram messages use HTML parse mode
- [ ] Transaction links are clickable `<a href>` elements
- [ ] Addresses render in `<code>` blocks
- [ ] Fallback to plain text on HTML parse failure

---

## ⌨️ Task 5: Telegram Inline Keyboards for Confirmations — `🟠 MEDIUM IMPACT` `🟡 MEDIUM EFFORT`

**File:** `packages/gateway/src/channels/telegram.ts`, `packages/gateway/src/gateway.ts`

### Changes

- When a state-changing action needs confirmation, send inline keyboard: `[✓ Confirm] [✗ Cancel]`
- Handle callback query instead of text message for confirmation responses
- Inline keyboard buttons are easier to tap than typing "yes"
- After confirmation, edit the original message to show result (no duplicate messages)

### Acceptance Criteria
- [ ] Confirmations use inline keyboard buttons
- [ ] Tapping Confirm executes the action
- [ ] Tapping Cancel cancels gracefully
- [ ] Original message is edited to show result after confirmation
- [ ] Keyboard is removed after action is taken

---

## 👋 Task 6: WebChat Welcome State + Quick Actions — `🟠 MEDIUM IMPACT` `🟢 LOW EFFORT`

**File:** `packages/gateway/src/channels/webchat.ts` (inline HTML)

### Changes

- On first load, show a welcome message with quick action buttons:
  - `💰 What's my balance?`
  - `📊 Show portfolio`
  - `📈 Best savings rate`
  - `💸 Recent transactions`
- Buttons send the text as a message when clicked
- Welcome message: "I'm your AI financial advisor. Ask me anything about your accounts."
- Welcome disappears after first message

### Acceptance Criteria
- [ ] WebChat shows welcome state on open
- [ ] Quick action buttons work and send messages
- [ ] Welcome disappears after first interaction
- [ ] Buttons are styled consistently with the dark theme

---

## ✍️ Task 7: WebChat Markdown Rendering (marked CDN) — `🟠 MEDIUM IMPACT` `🟢 LOW EFFORT`

**File:** `packages/gateway/src/channels/webchat.ts` (inline HTML)

### Changes

- Import `marked` via CDN (`https://cdn.jsdelivr.net/npm/marked/marked.min.js`)
- Replace the custom `renderMarkdown()` with `marked.parse()`
- Handles: tables, links (clickable tx URLs), code blocks (addresses), lists, bold, italic
- Add CSS for rendered markdown elements (links as accent color, code blocks with bg)
- Sanitize output (marked has built-in sanitization options)

### Acceptance Criteria
- [ ] Markdown tables render as proper HTML tables
- [ ] Links are clickable (open in new tab)
- [ ] Code blocks/inline code styled with monospace + background
- [ ] Bold, italic, lists all render correctly
- [ ] No XSS vulnerabilities from user-controlled content

---

## 📡 Task 8: Activity Feed in Gateway CLI — `🟢 LOW IMPACT` `🟢 LOW EFFORT`

**File:** `packages/gateway/src/gateway.ts`

### Changes

- After startup, show one-line activity entries as messages arrive:
  ```
  [12:34] webchat · "what's my balance?" → 2 tools, 1.2s, $0.003
  [12:35] telegram · "save 50" → confirmation pending
  [12:36] telegram · "yes" → executed, 0.8s
  ```
- Uses the existing logger but with a compact inline format
- Shows channel, query preview (truncated), tool count, response time, estimated cost
- Only in default mode; `--verbose` shows full debug detail

### Acceptance Criteria
- [ ] Activity lines appear in real-time as messages are processed
- [ ] Shows channel, truncated query, tool count, response time
- [ ] Does not clutter the terminal (one line per message)

---

## 🚨 Task 9: Actionable Error Messages — `🟢 LOW IMPACT` `🟢 LOW EFFORT`

**File:** `packages/gateway/src/system-prompt.ts`, `packages/gateway/src/gateway.ts`

### Changes

- System prompt includes error formatting rules:
  - Never show raw error codes to user
  - Always explain what happened in plain English
  - Always suggest what to do next
  - Example: "Not enough funds. You have $52.67 available. Try a smaller amount?"
- Gateway error handler maps common SDK errors to friendly messages before sending

### ⚠️ Error mapping:
| SDK Error | User Message |
|-----------|-------------|
| `INSUFFICIENT_BALANCE` | "Not enough funds. You have $X available." |
| `SAFEGUARD_TX_LIMIT` | "That exceeds your $X per-transaction limit. Adjust with `t2000 config set maxPerTx`." |
| `SAFEGUARD_DAILY_LIMIT` | "You've hit your $X daily limit. Resets tomorrow." |
| `HEALTH_FACTOR_TOO_LOW` | "That would put your health factor below safe levels." |
| Rate limit / API error | "AI is busy. Try again in a moment." |

### Acceptance Criteria
- [ ] No raw error codes shown to users
- [ ] Every error includes a next step
- [ ] LLM errors show a friendly "try again" message

---

## 🗺️ Implementation Order

```
🚀 Phase 1 (wow factor):      Task 1 → Task 2 → Task 3
💬 Phase 2 (Telegram polish):  Task 4 → Task 5
🌐 Phase 3 (WebChat polish):   Task 6 → Task 7
🔧 Phase 4 (details):          Task 8 → Task 9
```

## 🧪 Test Plan

- [ ] Run gateway with each channel and verify response formatting
- [ ] Test Telegram /start with authorized and unauthorized users
- [ ] Test confirmation flow with inline keyboards (Telegram)
- [ ] Test WebChat welcome state and quick actions
- [ ] Test error scenarios (insufficient balance, rate limit)
- [ ] Verify streaming still works in WebChat
- [ ] Verify existing unit tests pass (`pnpm --filter @t2000/gateway test`)
- [ ] Test on mobile Telegram (formatting, button sizing)
