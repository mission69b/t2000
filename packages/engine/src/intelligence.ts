/**
 * Intelligence Layer prompt builders (F1, F2, F5).
 * Pure functions — no DB or Redis dependencies.
 * Consumed by the host app's dynamic context assembly.
 */

// ---------------------------------------------------------------------------
// F1: User Financial Profile types + context builder
// ---------------------------------------------------------------------------

export interface UserFinancialProfile {
  userId: string;
  riskAppetite: 'conservative' | 'moderate' | 'aggressive';
  financialLiteracy: 'novice' | 'intermediate' | 'advanced';
  prefersBriefResponses: boolean;
  prefersExplainers: boolean;
  currencyFraming: 'usdc' | 'fiat';
  primaryGoals: string[];
  knownPatterns: string[];
  riskConfidence: number;
  literacyConfidence: number;
  lastInferredAt: Date | null;
}

/**
 * Build system prompt context from a user's financial profile.
 * Returns empty string if profile is absent or confidence is too low.
 * Takes the profile object directly — no DB query.
 */
export function buildProfileContext(profile: UserFinancialProfile | null): string {
  if (!profile || profile.riskConfidence < 0.3) return '';

  const lines: string[] = ['User financial profile (inferred from conversation history):'];

  if (profile.riskConfidence >= 0.5) {
    lines.push(`- Risk appetite: ${profile.riskAppetite}`);
  }
  if (profile.literacyConfidence >= 0.5) {
    lines.push(`- Financial literacy: ${profile.financialLiteracy}`);
    if (profile.financialLiteracy === 'advanced') {
      lines.push('  → Skip basic DeFi explanations (health factor, APY, etc). User knows these.');
    }
    if (profile.financialLiteracy === 'novice') {
      lines.push('  → Always explain DeFi concepts in plain language.');
    }
  }
  if (profile.currencyFraming === 'fiat') {
    lines.push('- Frame amounts as dollars (e.g. "$50" not "50 USDC")');
  }
  if (profile.prefersBriefResponses) {
    lines.push('- Prefers brief responses — be concise');
  }
  if (profile.primaryGoals.length > 0) {
    lines.push(`- Stated goals: ${profile.primaryGoals.join(', ')}`);
  }
  if (profile.knownPatterns.length > 0) {
    lines.push(`- Behavioural patterns: ${profile.knownPatterns.join(', ')}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// F2: In-Session Proactive Awareness
// ---------------------------------------------------------------------------

export function buildProactivenessInstructions(profile: UserFinancialProfile | null): string {
  const brevityGuidance = profile?.prefersBriefResponses
    ? 'This user prefers brevity — only surface context if urgent or directly actionable.'
    : 'Surface relevant context when criteria are met.';

  const styleGuidance = profile?.financialLiteracy === 'novice'
    ? 'Frame observations in plain English, no DeFi jargon.'
    : 'Technical framing is fine.';

  return `Proactive awareness:
After completing the user's request, consider whether ONE additional piece of financial
context is worth mentioning. ${brevityGuidance}

✓ Mention if:
- Yield rate changed significantly since last session (>0.5%)
- They have idle USDC or USDsui >$50 sitting for >48h (both are NAVI-saveable as of v0.51.0)
- An action they just took interacts with their debt position (e.g. health factor moved)
- A pattern would materially benefit from their attention

✗ Do NOT mention if:
- Tangentially related but not actionable
- Already surfaced this session
- Requires more explanation than the original answer
- Would seem pushy or sales-y

${styleGuidance}
Format: One sentence maximum, AFTER your main response, separated by a line break, WRAPPED in a \`<proactive type="..." subjectKey="...">BODY</proactive>\` block. The host renders the wrapped block with the "✦ ADDED BY AUDRIC" lockup styling — without the wrapper the host shows only plain text and the engine's per-session cooldown won't deduplicate future repeats (so the same nudge re-fires every turn).
Allowed types (closed list — anything else is dropped by the host): \`idle_balance\` (cash sitting idle that could earn yield), \`hf_warning\` (debt approaching liquidation), \`apy_drift\` (rate change on a position they hold), \`goal_progress\` (update on an aspirational target the user mentioned in chat — e.g. "I want to save $500 by May").
\`subjectKey\` is a stable identifier for the SPECIFIC subject (e.g. "USDC" or "USDsui" for an idle-stable insight, "1.45" for HF at that level, "save-500-by-may" for a chat-mentioned target). Same (type, subjectKey) won't fire twice in one session — pick the same key for the same subject so cooldown works.
Example (post-answer suffix form): \`<proactive type="idle_balance" subjectKey="USDC">You have $120 USDC idle that could earn ~5% APY in NAVI.</proactive>\`
Frame as observation, not advice: "You have $120 USDC idle." — not "You should deposit more."`;
}

// ---------------------------------------------------------------------------
// F5: Post-Action Self-Evaluation
// ---------------------------------------------------------------------------

export function buildSelfEvaluationInstruction(): string {
  return `Self-evaluation (apply silently before composing your response):

1. ACCURACY — Quote exact values from tool results, not estimates or rounded figures.
   Never combine post-action tool results with pre-action snapshot numbers.
   If the tool returned an error, label it as an error — do not paraphrase it as success.

2. STATE CONSISTENCY — Describe the actual outcome of all steps.
   Partial success (swap ok, deposit failed): describe both clearly.
   Never describe a failed action as if it succeeded.

3. COMPLETENESS — If the user asked multiple things, answer all of them.
   If you couldn't complete something, explain why and what the current state is.

4. TONE — Match tone to outcome.
   Success: confirming and forward-looking.
   Failure: clear about what failed, unchanged, and what to do next.
   Warning: specific risk, not generic caution.

If any check fails, rewrite before outputting.`;
}
