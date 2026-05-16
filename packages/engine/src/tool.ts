// ---------------------------------------------------------------------------
// tool.ts — surviving tool helpers
// ---------------------------------------------------------------------------
//
// The `buildTool` factory and `BuildToolOptions` interface that previously
// lived here were retired in SPEC 37 v0.7a Phase 2 Day 20b (2026-05-17)
// once all 39 in-tree tools migrated to `defineTool` (see
// `v2/define-tool.ts`). The two surviving helpers — `toolsToDefinitions`
// and `findTool` — operate on `Tool[]` and are framework-agnostic; they
// stay here so existing import sites (`engine.ts`, `orchestration.ts`,
// `early-dispatcher.ts`, `regenerate.ts`, `compose-bundle.ts`,
// `v2/engine.ts`, `v2/step-finish.ts`) don't need to chase another
// rename in this cleanup pass.
// ---------------------------------------------------------------------------

import type { Tool, ToolJsonSchema } from './types.js';

export function toolsToDefinitions(tools: Tool[]): {
  name: string;
  description: string;
  input_schema: ToolJsonSchema;
}[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.jsonSchema,
  }));
}

export function findTool(tools: Tool[], name: string): Tool | undefined {
  return tools.find((t) => t.name === name);
}
