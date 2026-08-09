// Buyer custom-hire spec envelope (S.978) — the ONE write shape for
// buyer-authored jobs across every surface: console hire-custom-prepare,
// Connect t2000_job_hire (S.977) and `t2 job hire` all upload
// `t2-acp-custom@1` {type, title, brief, createdAtMs}. Raw-text READ
// fallbacks stay forever for history; nothing should EMIT raw anymore.
// Behavior is byte-stable with the S.977 mcp builder it canonicalizes
// (audric apps/mcp/lib/hire-order.ts imports this once the version bumps).
//
// Deliveries are NOT wrapped — this envelope is for hire specs only.

const TITLE_PREFIX_RE = /^title\s*:\s*(.+)$/i;
const ENVELOPE_TITLE_MAX = 80;

/** Title rules: an explicit title wins; otherwise the brief's first
 *  non-empty line (a leading "Title: …" prefix is stripped for the title
 *  field — the FULL text always stays in the brief, lossless), hard-capped
 *  at 80 chars. Empty derive → "Custom job". */
export function customHireEnvelope(
  brief: string,
  title: string | undefined,
  now: number,
): string {
  const body = brief.trim();
  let t = title?.trim() ?? '';
  if (!t) {
    const first = body.split('\n').find((l) => l.trim())?.trim() ?? '';
    const prefixed = TITLE_PREFIX_RE.exec(first);
    t = (prefixed ? prefixed[1] : first).trim();
  }
  if (t.length > ENVELOPE_TITLE_MAX) {
    t = `${t.slice(0, ENVELOPE_TITLE_MAX - 1).trimEnd()}…`;
  }
  return JSON.stringify({
    type: 't2-acp-custom@1',
    title: t || 'Custom job',
    brief: body,
    createdAtMs: now,
  });
}

/** Idempotency guard: text that already IS a custom envelope (current or
 *  legacy name) with a usable brief must upload as-is, never double-wrap. */
export function isCustomHireEnvelope(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as { type?: unknown; brief?: unknown };
    return (
      (parsed.type === 't2-acp-custom@1' ||
        parsed.type === 't2-acp-invite@1') &&
      typeof parsed.brief === 'string' &&
      parsed.brief.trim().length > 0
    );
  } catch {
    return false;
  }
}
