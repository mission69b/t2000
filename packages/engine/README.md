# @t2000/engine

The agent **harness library** for conversational finance on Sui. It ships 26 financial tools, a 12-guard reasoning pipeline, a USD-aware permission resolver, 4-layer prompt assembly, MCP client/adapters, and the host-composition primitives a host wires into Vercel AI SDK's agent loop. Powers [Audric](https://audric.ai).

> **[S.391 — 2026-06-09] The runnable `AISDKEngine` loop was retired.** The engine no longer ships a runnable agent (the `AISDKEngine.submitMessage()` async-generator loop + its `EngineEvent` SSE/checkpoint/event-bridge transport had zero live consumers — audric composes AI SDK's `Experimental_Agent` directly; the CLI/MCP are wallet surfaces with no chat loop). The engine is now a **library** of tools/guards/permissions/prompt-assembly/internal-context that hosts compose. See `SPEC_AUDRIC_CODEBASE_AUDIT.md` §1.2A.

[![npm @t2000/engine](https://img.shields.io/npm/v/@t2000/engine?label=%40t2000%2Fengine)](https://www.npmjs.com/package/@t2000/engine)
[![npm @t2000/sdk](https://img.shields.io/npm/v/@t2000/sdk?label=%40t2000%2Fsdk)](https://www.npmjs.com/package/@t2000/sdk)
[![docs](https://img.shields.io/badge/docs-developers.t2000.ai-00D395)](https://developers.t2000.ai/agent-engine)
[![license](https://img.shields.io/badge/license-MIT-blue)](https://github.com/mission69b/t2000/blob/main/LICENSE)

> _Not a chatbot. A financial agent._ Four systems work together to **understand** the user's money (Memory), **reason** about decisions (Reasoning Engine), **act** through 26 financial tools in one conversation (Agent Harness), and **remember what it told them** (AdviceLog). Every action it triggers still waits on user confirmation.

## Install

```bash
npm install @t2000/engine @t2000/sdk
```

Requires Node.js 18+ · TypeScript 5+ recommended.

## Quick start (host composition)

The host owns the AI SDK loop and wires the engine's primitives into it: build the tool set, build the per-turn `ToolContext` + `InternalContext`, and run guard state + post-write refresh via the step-finish handler.

```typescript
import { Experimental_Agent as Agent } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import {
  READ_TOOL_SET,
  WRITE_TOOL_SET,
  buildToolContext,
  buildInternalContext,
  buildStepFinishHandler,
  DEFAULT_GUARD_CONFIG,
} from '@t2000/engine';
import { T2000 } from '@t2000/sdk';

const agent = await T2000.create();

const config = { agent, anthropicApiKey: process.env.ANTHROPIC_API_KEY };
const toolContext = buildToolContext(config, { signal: AbortSignal.timeout(60_000) });
const messages: { role: string; content: unknown }[] = [];
const internalContext = buildInternalContext({
  toolContext,
  walletAddress: agent.address,
  guards: DEFAULT_GUARD_CONFIG,
  getMessages: () => messages,
});

const llm = new Agent({
  model: gateway('anthropic/claude-sonnet-4-5'),
  tools: { ...READ_TOOL_SET, ...WRITE_TOOL_SET },
  experimental_context: internalContext,
  onStepFinish: buildStepFinishHandler(internalContext, { sessionSpendUsd: 0 }),
});

for await (const part of llm.stream({ prompt: 'What is my balance?' }).fullStream) {
  if (part.type === 'text-delta') process.stdout.write(part.text);
}
```

Write tools yield through AI SDK's native `needsApproval` round-trip (every write taps to confirm under zkLogin). See the host contract for the full pattern.

## The 4 systems

| System | One-line |
|---|---|
| 🎛️ **Agent Harness** | 26 tools (18 read + 8 write), one agent. Parallel reads via the AI SDK step model; serial writes via a `needsApproval` round-trip. |
| ⚡ **Reasoning Engine** | Thinks before it acts. Adaptive thinking effort, 12 guards across 3 priority tiers (Safety > Financial > UX), preflight validation, prompt caching. |
| 🧠 **Memory** | Knows your finances. Vector-search-backed `MemoryStore` (recall + write) interface; the host assembles the 4-layer system prompt (base → `<memory_recall>` → skill recipe → conversation) in its `prepareStep`. |
| 📓 **AdviceLog** | Remembers what it told you. Host-side log (`record_advice`); last 30 days hydrate every turn so the chat never contradicts itself. |

The engine package owns Agent Harness and Reasoning Engine, plus the `MemoryStore` interface. Vector backends (e.g. MemWal) and the AdviceLog model live host-side.

## Full reference

Tool surface, USD-aware permission resolver, guard pipeline, memory injection, MCP client + adapters, host composition contract →
**[developers.t2000.ai/agent-engine](https://developers.t2000.ai/agent-engine)**

## License

MIT — see [LICENSE](https://github.com/mission69b/t2000/blob/main/LICENSE).
