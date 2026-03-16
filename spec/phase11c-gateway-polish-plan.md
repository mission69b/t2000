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
6. 🔧 **Keep it simple** — No libraries where 20 lines of code will do. No over-abstraction.

---

## 🏗️ Architecture Decision: Channel-Aware Formatting

**Problem:** The LLM produces one response, but Telegram and WebChat render differently:
- Aligned text (spaces) needs monospace — works in WebChat, breaks in Telegram (proportional font)
- Markdown `**bold**` works in WebChat, but shows literally in Telegram HTML mode
- Unicode `─────` renders inconsistently across clients (we already hit this on the homepage)

**Solution — keep it simple:**
- LLM always outputs **standard markdown** (bold, links, lists). One prompt, one format.
- WebChat: improve the existing `renderMarkdown()` to handle links, code, bold (no CDN library)
- Telegram: add a small `markdownToTelegramHTML()` function that converts `**bold**` → `<b>bold</b>`, `[text](url)` → `<a href="url">text</a>`, `` `code` `` → `<code>code</code>` before sending
- No aligned-column formatting — use simple line-per-item format that works everywhere
- No Unicode box-drawing characters anywhere

This keeps one system prompt, one LLM output format, and thin per-channel adapters.

---

## 🎯 Task 1: System Prompt Rewrite — `🔴 HIGH IMPACT` `🟢 LOW EFFORT`

**File:** `packages/gateway/src/system-prompt.ts`

The system prompt controls how every single response looks and feels. Currently 30 lines of generic rules ("be concise", "use markdown tables"). Needs to become the personality engine.

### Changes

1. **Response templates** — Give Claude exact formatting patterns for:
   - Balance (line-per-item, not a markdown table)
   - Transaction receipt (amount, protocol, APY, tx link, updated balance)
   - Portfolio (inline for ≤3 positions, structured for 4+)
   - Error (what happened + what to do)

2. **Formatting rules:**
   - NEVER use markdown tables — they render poorly on mobile
   - Use **bold** for key values, standard markdown for everything
   - One data point per line, emoji prefix for scannability
   - Transaction links: `[View on explorer](suiscan.xyz/tx/...)`
   - Currency: always 2 decimal places
   - APY: always show % with 1-2 decimals
   - No Unicode box-drawing characters (inconsistent rendering)
   - No column-aligned text (breaks on proportional fonts)

3. **Personality:**
   - Opinionated — notice inefficiencies, suggest improvements
   - Brief — 3-5 lines for simple queries, never an essay
   - Suggest next actions only when you notice something actionable (idle funds, rate changes, risky positions) — NOT on every response
   - Financial advisor tone, not chatbot tone

4. **Example responses in prompt** (Claude pattern-matches):

```
BALANCE EXAMPLE:
💳 Checking: **$52.67**
🏦 Savings: **$19.24** (earning 4.2%)
💸 Debt: **-$2.01**
📈 Investment: **$0.05**

Net: **$70.95**

Your debt ($2.01) costs more than it earns. Pay it off from checking? Just say "repay all."
```

```
TRANSACTION RECEIPT EXAMPLE:
✅ Saved **$80.00**

Protocol: NAVI
APY: 5.57%
Monthly yield: ~$3.71
[View on explorer](https://suiscan.xyz/tx/abc123...)

Savings balance: **$99.24** (+$80.00)
```

```
PORTFOLIO EXAMPLE:
Your portfolio: **$152.30** (+2.3%)

📈 **SUI** — 45.2 tokens ($48.00, +3.1%) — earning 2.6% on Suilend
📈 **BTC** — 0.0012 ($89.30, +1.8%)
📉 **ETH** — 0.025 ($15.00, -0.5%)

💡 ETH is the only position losing. Rebalance into SUI?
```

### Acceptance Criteria
- [ ] Balance response uses line-per-item format, not markdown table
- [ ] Suggestions only appear when there's something actionable
- [ ] Transaction receipts show amount, protocol, APY, tx link, updated balance
- [ ] All formatting uses standard markdown (renders on any channel)
- [ ] Personality feels like a knowledgeable friend, not a bot

---

## 🤖 Task 2: Telegram /start + Typing Indicator — `🔴 HIGH IMPACT` `🟢 LOW EFFORT`

**File:** `packages/gateway/src/channels/telegram.ts`, `packages/gateway/src/gateway.ts`

### Changes

**a) /start command handler:**
- Add `bot.command('start', ...)` handler (separate from `message:text`)
- Accept an `onStart` callback in constructor config, set by gateway with a balance-fetching function — avoids passing the agent into the channel
- Welcome message with current balance + 4 inline keyboard buttons
- Keyboard buttons send their text as a regular message (not callback_query — keeps it simple)

```
Welcome to t2000 — your AI financial advisor.

💳 Checking: $52.67
🏦 Savings: $19.24 (4.2% APY)
Net: $70.95

Ask me anything, or tap a button below.

[💰 Balance] [📊 Portfolio] [📈 Rates] [❓ Help]
```

> **Note:** Inline keyboard buttons use `switch_inline_current_chat` or just send the button label as a new message via the handler. Keeps the flow through the existing `messageHandler` pipeline — no new callback_query plumbing needed.

**b) Typing indicator:**
- Call `ctx.replyWithChatAction('typing')` immediately when a message arrives
- Telegram typing expires after ~5s. For long requests, re-send every 4s via `setInterval`, cleared when response is sent
- Wrap in the `handleMessage` flow in `gateway.ts`, not inside the channel (gateway knows when the response finishes)

### Acceptance Criteria
- [ ] /start sends welcome message with current balance
- [ ] /start includes inline keyboard buttons
- [ ] Typing indicator shows continuously while processing (re-sent every 4s)
- [ ] Unauthorized users get rejection on /start too
- [ ] /start doesn't burn LLM tokens (balance fetched directly)

---

## 🖥️ Task 3: Gateway Default Verbose Output — `🟠 MEDIUM IMPACT` `🟢 TINY EFFORT`

**File:** `packages/gateway/src/gateway.ts`, `packages/cli/src/commands/gateway.ts`

### Changes

- Startup logs (`[gateway] · Starting...`, `[gateway] · WebChat started`) show by DEFAULT
- `--verbose` adds debug-level detail (token counts, timing, cost per message)
- Logger already defaults to `'info'` level — just ensure startup messages use `logger.info()` (they already do, verify the CLI isn't suppressing output)

### Acceptance Criteria
- [ ] `t2000 gateway` (no flags) shows startup progress
- [ ] Users don't need `--verbose` to know it's working
- [ ] `--verbose` adds per-message debug info

---

## 🔤 Task 4: Telegram Markdown → HTML Adapter — `🟠 MEDIUM IMPACT` `🟢 LOW EFFORT`

**File:** `packages/gateway/src/channels/telegram.ts`

### Changes

- Switch from `parse_mode: 'Markdown'` to `parse_mode: 'HTML'`
- Add a simple `markdownToTelegramHTML()` function (~20 lines) that converts:
  - `**bold**` → `<b>bold</b>`
  - `` `code` `` → `<code>code</code>`
  - `[text](url)` → `<a href="url">text</a>`
  - Escape `<`, `>`, `&` in remaining text
- Apply this transform in `send()` before calling `bot.api.sendMessage()`
- Fallback: if HTML send fails, retry with plain text (already exists)

> **Why not keep Markdown parse mode?** Telegram's "Markdown" mode is legacy and fragile — underscores in addresses break it, unmatched `*` breaks it. HTML is more reliable and we control the conversion.

### Acceptance Criteria
- [ ] All Telegram messages use HTML parse mode
- [ ] Transaction links are clickable `<a href>` elements
- [ ] Addresses in backticks render as `<code>` blocks
- [ ] Fallback to plain text on HTML parse failure
- [ ] No double-encoding issues (& → &amp;amp; etc.)

---

## ⌨️ Task 5: Telegram Inline Keyboards for Confirmations — `🟠 MEDIUM IMPACT` `🟡 MEDIUM EFFORT`

**File:** `packages/gateway/src/channels/telegram.ts`

### Changes

- When a confirmation message is sent, attach an inline keyboard: `[✅ Confirm] [❌ Cancel]`
- Add `bot.on('callback_query:data', ...)` handler
- On callback: convert to synthetic text message ("yes" / "no") and route through existing `messageHandler` — reuses the AgentLoop confirmation flow, no new logic
- Call `ctx.answerCallbackQuery()` immediately to dismiss Telegram's loading spinner
- Remove the inline keyboard after tap via `editMessageReplyMarkup`
- Guard against double-tap: if `pendingConfirmation` is already consumed, answer with "Already processed"

> **Keep it simple:** We don't edit the original message to show the result inline. The result comes as a new message from the agent, same as today. Just removes the keyboard after tap.

### Acceptance Criteria
- [ ] Confirmations show inline keyboard buttons
- [ ] Tapping Confirm routes "yes" through existing handler
- [ ] Tapping Cancel routes "no" through existing handler
- [ ] Keyboard removed after tap
- [ ] Double-tap handled gracefully (no duplicate executions)
- [ ] `answerCallbackQuery` called to dismiss spinner

---

## 👋 Task 6: WebChat Welcome State + Quick Actions — `🟠 MEDIUM IMPACT` `🟢 LOW EFFORT`

**File:** `packages/gateway/src/channels/webchat.ts` (inline HTML)

### Changes

- On first load, show a welcome message with quick action buttons:
  - `💰 What's my balance?`
  - `📊 Show portfolio`
  - `📈 Best savings rate`
  - `💸 Recent transactions`
- Buttons call `sendMsg(label)` on click — reuses existing message flow
- Welcome disappears on first message OR first button click
- Pure HTML/CSS/JS additions to the existing inline template, no libraries

### Acceptance Criteria
- [ ] WebChat shows welcome state on open
- [ ] Quick action buttons work and send messages
- [ ] Welcome disappears after first interaction (message or button click)
- [ ] Buttons are styled consistently with the dark theme

---

## ✍️ Task 7: WebChat Improved Markdown Rendering — `🟠 MEDIUM IMPACT` `🟢 LOW EFFORT`

**File:** `packages/gateway/src/channels/webchat.ts` (inline HTML)

### Changes

- Improve the existing `renderMarkdown()` function (currently handles bold + tables + newlines)
- Add support for:
  - `[text](url)` → `<a href="url" target="_blank">text</a>` (clickable tx links)
  - `` `code` `` → `<code>code</code>` (addresses, amounts)
  - `- item` → `<li>` list rendering
- Add CSS for: links (accent color), inline code (monospace + bg), list styling
- ~15 more lines of regex, no external library needed

> **Why no CDN library?** WebChat runs on localhost. CDN requires internet. Bundling a library adds weight. The markdown subset we need (bold, links, code, lists) is small enough notepad can handle it.

### Acceptance Criteria
- [ ] Links are clickable (open in new tab)
- [ ] Inline code styled with monospace + background
- [ ] Bold renders correctly
- [ ] Lists render as proper HTML lists
- [ ] Works fully offline (no CDN dependency)

---

## 📡 Task 8: Activity Feed in Gateway CLI — `🟢 LOW IMPACT` `🟢 LOW EFFORT`

**File:** `packages/gateway/src/gateway.ts`

### Changes

- After startup, log one-line activity entries as messages arrive:
  ```
  [12:34] webchat · "what's my balance?" → 2 tools, 1.2s
  [12:35] telegram · "save 50" → confirmation pending
  [12:36] telegram · "yes" → executed, 0.8s
  ```
- Add timing + tool count logging in `handleMessage` (already has `logger.debug` — promote key info to `logger.info`)
- Shows channel, query preview (truncated to 40 chars), tool count, response time
- `--verbose` adds token counts and estimated cost

### Acceptance Criteria
- [ ] Activity lines appear in real-time as messages are processed
- [ ] Shows channel, truncated query, tool count, response time
- [ ] Does not clutter the terminal (one line per message)
- [ ] `--verbose` adds token/cost detail

---

## 🚨 Task 9: Actionable Error Messages — `🟢 LOW IMPACT` `🟢 LOW EFFORT`

**File:** `packages/gateway/src/system-prompt.ts`, `packages/gateway/src/gateway.ts`

### Changes

- System prompt includes error formatting rules:
  - Never show raw error codes to the user
  - Always explain what happened in plain English
  - Always suggest what to do next
  - Example: "Not enough funds. You have $52.67 available. Try a smaller amount?"
- Improve the existing `handleMessage` catch block in `gateway.ts` — it already maps LLM errors, extend to cover SDK errors too

### ⚠️ Error mapping:
| SDK Error | User Message |
|-----------|-------------|
| `INSUFFICIENT_BALANCE` | "Not enough funds. You have $X available." |
| `SAFEGUARD_TX_LIMIT` | "That exceeds your $X per-transaction limit." |
| `SAFEGUARD_DAILY_LIMIT` | "You've hit your $X daily limit. Resets tomorrow." |
| `HEALTH_FACTOR_TOO_LOW` | "That would put your health factor below safe levels." |
| Rate limit / API error | "AI is busy. Try again in a moment." |

> **Note:** Verify actual error codes from `@t2000/sdk` before implementing the mapping.

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

> **Note:** Task 1 (system prompt) and Task 4 (markdown→HTML adapter) are tightly coupled. The system prompt tells the LLM to output standard markdown, and Task 4 converts it for Telegram. Implement Task 4 immediately after Task 1 to test the full flow.

---

## ⚠️ Edge Cases & Gotchas

1. **Typing indicator timeout** — Telegram typing expires after ~5s. Must re-send every 4s via `setInterval` for long LLM calls. Clear interval when response is sent.
2. **Inline keyboard double-tap** — User taps Confirm twice before first processes. Guard with `answerCallbackQuery("Already processed")` if `pendingConfirmation` is null.
3. **No `/start` without agent** — `/start` needs balance data but the channel doesn't have the agent. Solved with an `onStart` callback injected by the gateway.
4. **Markdown→HTML edge cases** — URLs containing `&` need escaping. Nested formatting (`**bold `code`**`) is uncommon in our responses; handle the simple cases only.
5. **Token streaming + tool badges** — WebChat tool badges currently sent after streaming finishes, causing visual jump. Acceptable for now; can emit in real-time as a follow-up optimization.
6. **Cost estimation accuracy** — Hardcoded token prices are approximate. Fine for UX, not for billing. Label as "~$0.003" (with tilde).

---

## 🧪 Test Plan

- [ ] Run gateway with each channel and verify response formatting
- [ ] Test Telegram /start with authorized and unauthorized users
- [ ] Test confirmation flow with inline keyboards (Telegram)
- [ ] Test double-tap on inline keyboard buttons
- [ ] Test WebChat welcome state and quick actions
- [ ] Test error scenarios (insufficient balance, rate limit)
- [ ] Verify streaming still works in WebChat
- [ ] Verify existing unit tests pass (`pnpm --filter @t2000/gateway test`)
- [ ] Test on mobile Telegram (formatting, button sizing)
- [ ] Test WebChat fully offline (no CDN dependencies)
- [ ] Verify typing indicator persists for 15+ second LLM calls
