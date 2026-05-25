import { describe, it, expect } from 'vitest';
import { spendingAnalyticsTool } from './spending.js';

// SPEC 23B-N3 (2026-05-12): pre-N3 the LLM defaulted to `spending_analytics`
// (flat text response) for every "show me my spending" question — leaving
// `SpendingBreakdownCanvas` (which already exists and renders rich visuals)
// stranded. Inventory matrix `spec/SPEC_23B_INVENTORY.md` row 22 + bullet
// flagged this as engine-prompt-side, not card-side.
//
// These contract assertions lock the directive against future "while I'm
// here" edits. The tool description must (a) tell the LLM to prefer the
// canvas for visual queries, (b) reserve the flat tool for narrow numerical
// questions, and (c) name the exact canvas template so the LLM doesn't
// guess (`spending_breakdown`).

describe('[SPEC 23B-N3] spending_analytics description — canvas-preference directive', () => {
  it('names the render_canvas tool + the spending_breakdown template by exact identifier', () => {
    expect(spendingAnalyticsTool.description).toMatch(/render_canvas/);
    expect(spendingAnalyticsTool.description).toMatch(/spending_breakdown/);
  });

  it('tells the LLM to PREFER the canvas for visual queries', () => {
    expect(spendingAnalyticsTool.description).toMatch(/prefer\s+`?render_canvas/i);
  });

  it('lists at least one of the visual-query phrasings the LLM should pattern-match on', () => {
    const desc = (spendingAnalyticsTool.description ?? '').toLowerCase();
    const phrasings = [
      'show me',
      'breakdown',
      'spending chart',
      'what did i spend on',
    ];
    const hits = phrasings.filter((p) => desc.includes(p));
    expect(hits.length).toBeGreaterThan(0);
  });

  it('still tells the LLM what spending_analytics IS good for (narrow numerical questions)', () => {
    // The directive must NOT make the tool feel forbidden — it's still the
    // right call for "how much on resend last week" style questions.
    expect(spendingAnalyticsTool.description).toMatch(/narrow|numerical|specific|how much/i);
  });

  it('keeps the original "what it does" preamble intact', () => {
    // Surgical add — original tool semantics still describe what the data IS.
    expect(spendingAnalyticsTool.description).toMatch(/MPP service spending/);
    expect(spendingAnalyticsTool.description).toMatch(/total spent/i);
    expect(spendingAnalyticsTool.description).toMatch(/breakdown by service|service\/category/i);
  });
});
