/**
 * Client-side intent parser — Tier 2 of the intent routing system.
 *
 * Parses typed commands into structured intents using regex + fuzzy matching.
 * Returns null for anything it can't parse → falls through to LLM (Tier 3).
 *
 * Coverage: ~80% of typed inputs. Most users won't type at all (chips).
 */

export type ParsedIntent =
  | { action: 'save'; amount: number }
  | { action: 'send'; to: string; amount: number }
  | { action: 'withdraw'; amount: number }
  | { action: 'borrow'; amount: number }
  | { action: 'repay'; amount: number }
  | { action: 'claim-rewards' }
  | { action: 'report' }
  | { action: 'history' }
  | { action: 'address' }
  | { action: 'balance' }
  | { action: 'rates' }
  | { action: 'help' }
  | null;

const AMOUNT_PATTERN = /\$?([\d,]+(?:\.\d{1,2})?)/;
const ALL_PATTERN = /\ball\b/i;

function stripPreamble(text: string): string {
  return text.replace(/^(can you|could you|please|pls|hey|yo|i want to|i'd like to|i wanna|go ahead and)\s+/i, '');
}

export function parseIntent(input: string): ParsedIntent {
  const text = stripPreamble(input.trim()).toLowerCase();

  if (/^(help|what can (you|i) do|commands)$/i.test(text)) {
    return { action: 'help' };
  }

  if (/^(my )?(address|wallet address|receive)\b/i.test(text)) {
    return { action: 'address' };
  }

  if (/^(balance|how much|what'?s? my balance)\b/i.test(text)) {
    return { action: 'balance' };
  }

  if (/^(report|financial report|overview|summary)\b/i.test(text)) {
    return { action: 'report' };
  }

  if (/^(history|transactions|recent|activity)\b/i.test(text)) {
    return { action: 'history' };
  }

  if (/^(rates?|interest rates?|apy|yields?)\b/i.test(text)) {
    return { action: 'rates' };
  }

  if (/^(claim|claim rewards?)\b/i.test(text)) {
    return { action: 'claim-rewards' };
  }

  const saveMatch = text.match(/^(save|deposit)\s+(.+)/i);
  if (saveMatch) {
    const amount = parseAmount(saveMatch[2]);
    if (amount !== null) return { action: 'save', amount };
  }

  const withdrawMatch = text.match(/^(withdraw|pull out)\s+(.+)/i);
  if (withdrawMatch) {
    const amount = parseAmount(withdrawMatch[2]);
    if (amount !== null) return { action: 'withdraw', amount };
  }

  const borrowMatch = text.match(/^borrow\s+(.+)/i);
  if (borrowMatch) {
    const amount = parseAmount(borrowMatch[1]);
    if (amount !== null) return { action: 'borrow', amount };
  }

  const repayMatch = text.match(/^(repay|pay back)\s+(.+)/i);
  if (repayMatch) {
    const amount = parseAmount(repayMatch[2]);
    if (amount !== null) return { action: 'repay', amount };
  }

  const sendMatch = parseSendIntent(text);
  if (sendMatch) return sendMatch;

  return null;
}

function parseAmount(text: string): number | null {
  if (ALL_PATTERN.test(text)) return -1;
  const match = text.match(AMOUNT_PATTERN);
  if (match) {
    const n = parseFloat(match[1].replace(/,/g, ''));
    return n > 0 ? n : null;
  }
  return null;
}

function parseSendIntent(text: string): ParsedIntent {
  let match = text.match(/^send\s+\$?([\d,.]+)\s+to\s+(.+)/i);
  if (match) {
    const amount = parseFloat(match[1].replace(/,/g, ''));
    if (amount > 0) return { action: 'send', amount, to: match[2].trim() };
  }

  match = text.match(/^send\s+(\S+)\s+\$?([\d,.]+)/i);
  if (match) {
    const amount = parseFloat(match[2].replace(/,/g, ''));
    if (amount > 0) return { action: 'send', amount, to: match[1].trim() };
  }

  return null;
}
