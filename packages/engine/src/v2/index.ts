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

export { AISDKEngine, tool } from './engine.js';
export type { AISDKEngineConfig } from './engine.js';
export {
  TOOL_POLICY,
  getToolPolicy,
  registerToolPolicy,
  type ToolPolicy,
} from './tool-policy.js';
