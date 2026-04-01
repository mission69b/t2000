---
name: audric-chat
description: >-
  Integrate the Audric streaming chat UI into apps/web-app. Use when
  working on the engine chat components, useEngine hook, SSE streaming,
  session management, permission flow, or the dashboard chat integration.
license: MIT
metadata:
  author: t2000
  version: "1.0"
  requires: "@t2000/engine, @upstash/redis"
---

# Audric Chat UI Integration

## Architecture

The Audric chat system connects `@t2000/engine` to `apps/web-app` via SSE streaming:

```
Client (useEngine hook)
  │
  ├── POST /api/engine/chat → SSE stream
  │   ├── event: session (sessionId)
  │   ├── event: engine (text_delta, tool_start, tool_result, permission_request, usage, error, turn_complete)
  │   └── Session saved to Upstash KV
  │
  ├── POST /api/engine/permission → resolve confirm/deny
  │
  └── GET /api/engine/sessions → list previous conversations
```

## Key Files

| File | Purpose |
|------|---------|
| `hooks/useEngine.ts` | SSE client hook — message state, streaming, retry, session management |
| `components/engine/EngineChat.tsx` | Chat container — messages, skeleton, error display, quick actions |
| `components/engine/ChatMessage.tsx` | Message bubble — user/assistant, tool status, permission cards |
| `components/engine/ToolCard.tsx` | Inline tool execution status indicator |
| `components/engine/PermissionCard.tsx` | Confirm/deny card with 60s timeout countdown |
| `components/engine/QuickActions.tsx` | Suggestion chips for empty chat state |
| `components/dashboard/InputBar.tsx` | Textarea input — Enter to send, Shift+Enter newline, Escape cancel |
| `lib/engine-types.ts` | Client-side types: EngineChatMessage, ToolExecution, PendingPermission |
| `lib/engine/engine-factory.ts` | Server-side QueryEngine + MCP + session store singletons |
| `lib/engine/upstash-session-store.ts` | SessionStore implementation using Upstash Redis |
| `lib/engine/bridge-registry.ts` | In-memory PermissionBridge registry per session |
| `app/api/engine/chat/route.ts` | SSE streaming endpoint (JWT auth, rate limited) |
| `app/api/engine/permission/route.ts` | Permission resolution endpoint |
| `app/api/engine/sessions/route.ts` | Session list endpoint |

## useEngine Hook

```typescript
import { useEngine } from '@/hooks/useEngine';

const engine = useEngine({ address, jwt: session?.jwt });

// Send a message (triggers SSE stream)
engine.sendMessage('What is my balance?');

// Resolve a permission request
engine.resolvePermission(permissionId, true);

// Cancel streaming
engine.cancel();

// Retry last failed message
engine.retry();

// Start new conversation
engine.clearMessages();

// Resume an existing session
engine.loadSession(sessionId);
```

### Returned state

| Field | Type | Description |
|-------|------|-------------|
| `messages` | `EngineChatMessage[]` | All messages in current conversation |
| `status` | `EngineStatus` | `'idle' \| 'connecting' \| 'streaming' \| 'error'` |
| `sessionId` | `string \| null` | Current session ID from server |
| `usage` | `UsageData \| null` | Latest token usage |
| `error` | `string \| null` | Current error message |
| `isStreaming` | `boolean` | True when connecting or streaming |
| `canRetry` | `boolean` | True when last message failed and retry is available |

## SSE Event Types

Events parsed from the stream by `useEngine`:

| Event | Fields | Action |
|-------|--------|--------|
| `session` | `sessionId` | Sets session ID (custom event, not SSEEvent) |
| `text_delta` | `text` | Appends text to assistant message |
| `tool_start` | `toolName, toolUseId, input` | Adds running tool to message |
| `tool_result` | `toolUseId, result, isError` | Updates tool status to done/error |
| `permission_request` | `permissionId, toolName, input, description` | Shows PermissionCard |
| `usage` | `inputTokens, outputTokens, cache*` | Updates token usage |
| `error` | `message` | Sets error state |
| `turn_complete` | — | Marks stream finished |

## Error Handling

- **Connection failures**: Automatic exponential backoff retry (3 attempts, 1s/2s/4s)
- **Auth errors (401)**: Sets `status: 'error'`, shows "Session expired" message, no retry
- **Stream errors**: Displayed in error banner with manual Retry button
- **Permission timeout**: PermissionCard auto-denies after 60 seconds

## Server-Side Configuration

The `engine-factory.ts` configures the QueryEngine with:
- `READ_TOOLS` only (no write tools on server — writes use client-side confirmation)
- `AnthropicProvider` with `ANTHROPIC_API_KEY`
- `McpClientManager` with NAVI MCP (auto-retry on connection failure)
- `UpstashSessionStore` for session persistence (24h TTL)
- Budget limit: $0.50 per conversation
- Max turns: 10
- Max tokens: 4096

## Dashboard Integration

`EngineChat` receives the `useEngine` instance as a prop from `DashboardContent`:

```typescript
const engine = useEngine({ address, jwt: session?.jwt });

// In JSX:
<EngineChat engine={engine} email={email} />

// InputBar wired to engine:
<InputBar
  onSubmit={handleInputSubmit}
  onCancel={engine.isStreaming ? engine.cancel : undefined}
  disabled={engine.isStreaming}
/>
```

The dashboard coexists with chip-based flows (save, send, withdraw, etc.). When `isInFlow` is true, `EngineChat` is hidden and chip UI is shown instead.

## Accessibility

- `aria-live="polite"` on streaming assistant messages
- `role="alertdialog"` on PermissionCard with `aria-describedby`
- `role="status"` on ToolCard with human-readable status labels
- `sr-only` "Audric is typing" indicator during streaming
- `aria-hidden` on decorative elements (icons, "au" label, cursor)
- `role="alert"` on error banners

## Adding New Quick Actions

Edit `components/engine/QuickActions.tsx`:

```typescript
const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Check balance', prompt: 'What is my current balance?' },
  { label: 'View rates', prompt: 'What are the current savings rates?' },
  // Add new actions here
];
```
