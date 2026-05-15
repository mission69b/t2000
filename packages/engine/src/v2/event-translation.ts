// ---------------------------------------------------------------------------
// v2/event-translation.ts — re-export of the R8 bridge for v2 use
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 2 Day 3 (2026-05-15).
//
// The Phase 0 R8 bridge (`bridge/event-bridge.ts`) is a stateless
// translator that converts AI SDK `streamText().fullStream` events
// (`TextStreamPart<ToolSet>`) into the legacy `EngineEvent` union.
//
// AISDKEngine consumes that bridge directly. This file is a one-line
// re-export so v2 code can import event translation under the v2/
// namespace without crossing into the bridge/ folder.
//
// Day 1's `translatePart` minimal switch is removed by `engine.ts`
// importing `bridgeAISDKStream` from here instead.
// ---------------------------------------------------------------------------

export { bridgeAISDKStream } from '../bridge/event-bridge.js';
