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
}

export interface Recipe {
  name: string;
  description: string;
  triggers: string[];
  services?: string[];
  prerequisites?: RecipePrerequisite[];
  steps: RecipeStep[];
}
