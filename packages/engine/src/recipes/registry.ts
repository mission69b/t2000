import type { Recipe } from './types.js';
import { loadRecipes, parseRecipe } from './loader.js';

/**
 * Stores loaded recipes and matches user messages to the most specific recipe
 * using longest-trigger-match-wins.
 */
export class RecipeRegistry {
  private recipes: Recipe[] = [];

  /** Load all recipes from a directory of YAML files. */
  loadDir(yamlDir: string): void {
    this.recipes.push(...loadRecipes(yamlDir));
  }

  /** Register a single recipe from a YAML string. */
  loadYaml(yamlContent: string): void {
    this.recipes.push(parseRecipe(yamlContent));
  }

  /** Register a pre-parsed Recipe object. */
  register(recipe: Recipe): void {
    this.recipes.push(recipe);
  }

  /** All loaded recipes. */
  all(): readonly Recipe[] {
    return this.recipes;
  }

  /**
   * Match a user message to the most specific recipe.
   * Longest trigger phrase match wins. Returns null if no match.
   */
  match(userMessage: string): Recipe | null {
    const normalized = userMessage.toLowerCase().trim();
    let best: Recipe | null = null;
    let bestLength = 0;

    for (const recipe of this.recipes) {
      for (const trigger of recipe.triggers) {
        const triggerLower = trigger.toLowerCase();
        if (normalized.includes(triggerLower) && triggerLower.length > bestLength) {
          best = recipe;
          bestLength = triggerLower.length;
        }
      }
    }

    return best;
  }

  /**
   * Format a matched recipe as a compact context block for the system prompt.
   * Injected dynamically — only when the recipe matches.
   */
  toPromptContext(recipe: Recipe): string {
    const lines: string[] = [
      `## Active Recipe: ${recipe.name}`,
      recipe.description,
      'Follow these steps:',
    ];

    // [SPEC 7 P2.5 Layer 4] Steps marked `bundle: true` form a Payment
    // Stream group — surface them as ONE bracketed "PAYMENT STREAM —
    // emit in parallel" block inline with the step list so the LLM sees
    // the explicit bundle instruction next to the affected steps. Without
    // this, recipes that mark write steps as bundleable would still drive
    // sequential emission because the LLM only reads the numbered list.
    const bundleSteps = recipe.steps.filter((s) => s.bundle === true);
    const bundleStepNames = new Set(bundleSteps.map((s) => s.name));
    const showBundleHeader = bundleStepNames.size >= 2;

    let openedBundleHeader = false;

    for (let i = 0; i < recipe.steps.length; i++) {
      const step = recipe.steps[i];
      const num = i + 1;
      const toolNote = step.tool ? ` → ${step.tool}` : '';
      const serviceNote = step.service ? ` (${step.service})` : '';
      const costNote = step.cost ? ` — ${step.cost}` : '';
      const gateNote = step.gate && step.gate !== 'none'
        ? ` [GATE: ${step.gate}]`
        : '';

      // Open the bundle block on the first bundle step.
      if (showBundleHeader && step.bundle === true && !openedBundleHeader) {
        lines.push(
          'PAYMENT INTENT — emit ALL the following composable writes as parallel `tool_use` blocks IN THE SAME ASSISTANT TURN. The engine compiles them into ONE atomic Payment Intent the user signs once. Do NOT execute step-by-step across turns:',
        );
        openedBundleHeader = true;
      }

      // The per-step tag rides on the same `≥2 bundle: true` gate as the
      // header — a lone `bundle: true` marker is reserved for future
      // paired-write composition (e.g. emergency_withdraw will pair with
      // repay_debt in close-position flows) and is a no-op at LLM-prompt
      // time. Tagging it would be confusing.
      const bundleTag = showBundleHeader && step.bundle === true ? ' [PAYMENT INTENT]' : '';
      let line = `${num}. ${step.name}${toolNote}${serviceNote}${costNote}${gateNote}${bundleTag}`;

      if (step.gate_prompt) {
        line += ` — "${step.gate_prompt}"`;
      }

      lines.push(line);

      if (step.rules?.length) {
        for (const rule of step.rules) {
          lines.push(`   - ${rule}`);
        }
      }

      if (step.notes) {
        lines.push(`   Note: ${step.notes}`);
      }

      if (step.on_error) {
        lines.push(`   On error: ${step.on_error.action} — ${step.on_error.message}`);
      }

      if (step.condition) {
        lines.push(`   Condition: ${step.condition}`);
      }
    }

    if (recipe.prerequisites?.length) {
      lines.push('Prerequisites (ask before starting):');
      for (const pre of recipe.prerequisites) {
        lines.push(`- ${pre.field}: "${pre.prompt}"`);
      }
    }

    return lines.join('\n');
  }
}
