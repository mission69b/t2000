import type { ToolFlags } from '../types.js';

export interface RecipeStepRequirement {
  step?: string;
  field?: string;
  confirmation?: boolean;
}

export interface RecipeStepOnError {
  action: 'abort' | 'refuse' | 'report' | 'retry';
  message: string;
  suggest?: string;
}

export interface RecipePrerequisite {
  field: string;
  prompt: string;
}

export interface RecipeStep {
  name: string;
  tool?: string;
  service?: string;
  purpose: string;
  cost?: string;
  output?: { type: string; key: string };
  gate?: 'none' | 'preview' | 'review' | 'estimate';
  gate_prompt?: string;
  requires?: RecipeStepRequirement[];
  rules?: string[];
  condition?: string;
  notes?: string;
  flags?: Partial<ToolFlags>;
  on_error?: RecipeStepOnError;
  input_template?: Record<string, string>;
  cost_per_unit?: string;
  /**
   * [SPEC 7 P2.5 Layer 4] When true, this step is part of a multi-write
   * Payment Stream bundle group. Steps with `bundle: true` MUST resolve
   * to confirm-tier write tools that carry `bundleable: true` in
   * `TOOL_FLAGS` (validated at recipe load time). The loader fails fast
   * on auto-tier writes / read-only tools / non-bundleable confirm tools
   * (`pay_api`, `save_contact`) inside a `bundle: true` group.
   *
   * The engine emits parallel `tool_use` blocks for `bundle: true`
   * steps in the same turn; the permission gate (Layer 2) collapses
   * them into a single bundled `pending_action`.
   */
  bundle?: boolean;
}

export interface Recipe {
  name: string;
  description: string;
  triggers: string[];
  services?: string[];
  prerequisites?: RecipePrerequisite[];
  steps: RecipeStep[];
}
