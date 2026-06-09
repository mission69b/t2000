// ---------------------------------------------------------------------------
// v2/index.ts — barrel export for the AI-SDK-native engine
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 2-4 (consolidated rewrite, 2026-05-15).
//
// Behind the USE_AI_SDK_NATIVE_ENGINE feature flag — audric chooses at
// engine factory time which engine class to instantiate. Legacy
// QueryEngine stays exported from the root `index.ts` so production
// traffic is untouched until cutover.
//
// Day 1: AISDKEngine + tool-policy registry + tool() re-export.
// Day 2-9: prepareStep/needsApproval/onStepFinish helpers, tool wrappers,
//          guard pipeline composition.
// ---------------------------------------------------------------------------

// [S.391 — 2026-06-09] `AISDKEngine` + `tool` re-export + `bridgeAISDKStream`
// removed: the runnable engine loop + SSE/checkpoint/event-bridge surface was
// retired (zero live consumers — audric composes `Experimental_Agent`
// directly via `buildInternalContext` + `buildStepFinishHandler`; CLI/MCP
// don't run a chat loop). The engine is now a harness LIBRARY.
// `AISDKEngineConfig` survives in `./config.js` because `buildToolContext`
// takes it. See the S.390 audit `SPEC_AUDRIC_CODEBASE_AUDIT.md` §1.2A.
export type { AISDKEngineConfig } from './config.js';
export {
  TOOL_POLICY,
  getToolPolicy,
  registerToolPolicy,
  type ToolPolicy,
} from './tool-policy.js';
// Day 3: internal context + guard runner + step-finish handler are
// engine-internal helpers; not exported from the package root. They
// live behind v2/index.ts so tests + future tool migrations can import
// them under the v2/ namespace, but downstream consumers don't see them.
export type { InternalContext, ConfigSubsetForStepFinish } from './internal-context.js';
export { asInternalContext, tryGetInternalContext } from './internal-context.js';
export { runGuardsForTool, GuardBlockedError } from './guard-runner.js';
export type { GuardRunnerOutcome } from './guard-runner.js';
export { buildStepFinishHandler } from './step-finish.js';
export type { StepFinishMutableState } from './step-finish.js';
