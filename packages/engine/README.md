# @t2000/engine

The agent engine for conversational finance on Sui. `AISDKEngine` orchestrates LLM conversations, 26 financial tools, user confirmations, and MCP integrations into a single async-generator loop. Powers [Audric](https://audric.ai).

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

## Quick start

```typescript
import { AISDKEngine, getDefaultTools } from '@t2000/engine';
import { T2000 } from '@t2000/sdk';

const agent = await T2000.create();

const engine = new AISDKEngine({
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  agent,
  tools: getDefaultTools(),
});

for await (const event of engine.submitMessage('What is my balance?')) {
  switch (event.type) {
    case 'text_delta':
      process.stdout.write(event.text);
      break;
    case 'tool_start':
      console.log(`\n[calling ${event.toolName}]`);
      break;
    case 'pending_action':
      // Write tool needs approval — client executes, then calls engine.resumeWithToolResult()
      break;
  }
}
```

For custom LLM providers or gateway routing, pass a pre-built `LanguageModel` via `modelInstance` instead of `anthropicApiKey`.

## The 4 systems

| System | One-line |
|---|---|
| 🎛️ **Agent Harness** | 26 tools (18 read + 8 write), one agent. Parallel reads via the AI SDK step model; serial writes via a `needsApproval` round-trip. |
| ⚡ **Reasoning Engine** | Thinks before it acts. Adaptive thinking effort, 12 guards across 3 priority tiers (Safety > Financial > UX), preflight validation, prompt caching. |
| 🧠 **Memory** | Knows your finances. Vector-search-backed `MemoryStore` (recall + write) injected by the host; engine assembles a 4-layer system prompt with `prepareStep` (base → `<memory_recall>` → skill recipe → conversation). |
| 📓 **AdviceLog** | Remembers what it told you. Host-side log (`record_advice`); last 30 days hydrate every turn so the chat never contradicts itself. |

The engine package owns Agent Harness and Reasoning Engine, plus the `MemoryStore` interface. Vector backends (e.g. MemWal) and the AdviceLog model live host-side.

## Full reference

Event types, tool surface, USD-aware permission resolver, stream checkpoint resume, memory injection, MCP client + server adapters, host contract →
**[developers.t2000.ai/agent-engine](https://developers.t2000.ai/agent-engine)**

## License

MIT — see [LICENSE](https://github.com/mission69b/t2000/blob/main/LICENSE).
