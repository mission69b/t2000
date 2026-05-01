import { describe, it, expect } from 'vitest';
import { parseEvalSummary } from '../eval-summary.js';

describe('parseEvalSummary', () => {
  it('returns null when no marker is present', () => {
    expect(parseEvalSummary('I checked the balance and proceeded.')).toBeNull();
    expect(parseEvalSummary('')).toBeNull();
  });

  it('parses a single valid marker', () => {
    const text = `
After thinking through the trade-offs:

<eval_summary>
{
  "items": [
    { "label": "Health Factor", "status": "good", "note": "1.85 → 1.62" },
    { "label": "Slippage cap", "status": "good" }
  ]
}
</eval_summary>

I'll proceed with the swap.
    `;
    const result = parseEvalSummary(text);
    expect(result).not.toBeNull();
    expect(result?.summaryMode).toBe(true);
    expect(result?.markerCount).toBe(1);
    expect(result?.evaluationItems).toHaveLength(2);
    expect(result?.evaluationItems[0]).toEqual({
      label: 'Health Factor',
      status: 'good',
      note: '1.85 → 1.62',
    });
    expect(result?.evaluationItems[1]).toEqual({
      label: 'Slippage cap',
      status: 'good',
    });
  });

  it('extracts the FIRST marker and reports the violation count', () => {
    const text = `
<eval_summary>
{ "items": [{ "label": "First", "status": "good" }] }
</eval_summary>

Some more thinking...

<eval_summary>
{ "items": [{ "label": "Second", "status": "warning" }] }
</eval_summary>
    `;
    const result = parseEvalSummary(text);
    expect(result?.markerCount).toBe(2);
    expect(result?.evaluationItems).toHaveLength(1);
    expect(result?.evaluationItems[0].label).toBe('First');
  });

  it('returns null when the marker JSON is malformed', () => {
    const text = `
<eval_summary>
{ this is not json
</eval_summary>
    `;
    expect(parseEvalSummary(text)).toBeNull();
  });

  it('returns null when items is not an array', () => {
    const text = `
<eval_summary>
{ "items": "not an array" }
</eval_summary>
    `;
    expect(parseEvalSummary(text)).toBeNull();
  });

  it('returns null when items array is empty after filtering', () => {
    const text = `
<eval_summary>
{ "items": [{ "label": "", "status": "good" }, { "status": "warning" }] }
</eval_summary>
    `;
    expect(parseEvalSummary(text)).toBeNull();
  });

  it('drops items with invalid status', () => {
    const text = `
<eval_summary>
{
  "items": [
    { "label": "Good one", "status": "good" },
    { "label": "Bad status", "status": "PURPLE" },
    { "label": "Critical one", "status": "critical", "note": "danger zone" }
  ]
}
</eval_summary>
    `;
    const result = parseEvalSummary(text);
    expect(result?.evaluationItems).toHaveLength(2);
    expect(result?.evaluationItems.map((i) => i.label)).toEqual(['Good one', 'Critical one']);
  });

  it('accepts all four valid status values', () => {
    const text = `
<eval_summary>
{
  "items": [
    { "label": "G", "status": "good" },
    { "label": "W", "status": "warning" },
    { "label": "C", "status": "critical" },
    { "label": "I", "status": "info" }
  ]
}
</eval_summary>
    `;
    const result = parseEvalSummary(text);
    expect(result?.evaluationItems).toHaveLength(4);
  });

  it('omits empty notes', () => {
    const text = `
<eval_summary>
{
  "items": [
    { "label": "With note", "status": "good", "note": "all clear" },
    { "label": "Empty note", "status": "info", "note": "" },
    { "label": "No note", "status": "warning" }
  ]
}
</eval_summary>
    `;
    const result = parseEvalSummary(text);
    expect(result?.evaluationItems[0].note).toBe('all clear');
    expect(result?.evaluationItems[1].note).toBeUndefined();
    expect(result?.evaluationItems[2].note).toBeUndefined();
  });

  it('tolerates whitespace and newlines around the JSON payload', () => {
    const text = `<eval_summary>


  { "items": [{ "label": "Test", "status": "good" }] }


</eval_summary>`;
    const result = parseEvalSummary(text);
    expect(result?.evaluationItems[0].label).toBe('Test');
  });
});
