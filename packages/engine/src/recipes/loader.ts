import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { z } from 'zod';
import type { Recipe, RecipeStep } from './types.js';
import { isBundleableTool } from '../tool-flags.js';

const StepRequirementSchema = z.object({
  step: z.string().optional(),
  field: z.string().optional(),
  confirmation: z.boolean().optional(),
});

const OnErrorSchema = z.object({
  action: z.enum(['abort', 'refuse', 'report', 'retry']),
  message: z.string(),
  suggest: z.string().optional(),
});

const StepSchema: z.ZodType<RecipeStep> = z.object({
  name: z.string().min(1),
  tool: z.string().optional(),
  service: z.string().optional(),
  purpose: z.string().min(1),
  cost: z.string().optional(),
  output: z.object({ type: z.string(), key: z.string() }).optional(),
  gate: z.enum(['none', 'preview', 'review', 'estimate']).optional(),
  gate_prompt: z.string().optional(),
  requires: z.array(StepRequirementSchema).optional(),
  rules: z.array(z.string()).optional(),
  condition: z.string().optional(),
  notes: z.string().optional(),
  flags: z.record(z.unknown()).optional() as z.ZodType<RecipeStep['flags']>,
  on_error: OnErrorSchema.optional(),
  input_template: z.record(z.string()).optional(),
  cost_per_unit: z.string().optional(),
  bundle: z.boolean().optional(),
});

const RecipeSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  triggers: z.array(z.string().min(1)).min(1),
  services: z.array(z.string()).optional(),
  prerequisites: z.array(z.object({ field: z.string(), prompt: z.string() })).optional(),
  steps: z.array(StepSchema).min(1),
}).refine(
  (r) => {
    const names = r.steps.map((s) => s.name);
    return new Set(names).size === names.length;
  },
  { message: 'Step names must be unique within a recipe' },
).refine(
  (r) => {
    // [SPEC 7 P2.5 Layer 4] `bundle: true` steps MUST reference a
    // bundleable confirm-tier write tool. See `isBundleableTool` in
    // `tool-flags.ts` for the v1 set. Catches: read tools in a bundle,
    // auto-tier writes, `pay_api` / `save_contact` (non-bundleable
    // confirm), unknown tool names, missing `tool:` field.
    for (const step of r.steps) {
      if (step.bundle === true) {
        if (!step.tool) return false;
        if (!isBundleableTool(step.tool)) return false;
      }
    }
    return true;
  },
  {
    message:
      'Steps with bundle: true must reference a bundleable confirm-tier write tool. ' +
      'Allowed: save_deposit, withdraw, borrow, repay_debt, send_transfer, ' +
      'swap_execute, claim_rewards, volo_stake, volo_unstake. ' +
      'Forbidden: pay_api, save_contact, any read tool, any auto-tier write.',
  },
);

/**
 * Load all recipe YAML files from a directory.
 * Throws on validation errors — recipes should fail at load time, not runtime.
 */
export function loadRecipes(yamlDir: string): Recipe[] {
  const files = readdirSync(yamlDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  const recipes: Recipe[] = [];

  for (const file of files) {
    const content = readFileSync(join(yamlDir, file), 'utf-8');
    const raw = yaml.load(content);
    const parsed = RecipeSchema.parse(raw);
    recipes.push(parsed as Recipe);
  }

  return recipes;
}

/**
 * Parse a single recipe from a YAML string (useful for embedded/bundled recipes).
 */
export function parseRecipe(yamlContent: string): Recipe {
  const raw = yaml.load(yamlContent);
  return RecipeSchema.parse(raw) as Recipe;
}
