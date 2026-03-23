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
  | { action: 'invest'; asset: string; amount: number }
  | { action: 'swap'; to: string; amount: number }
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

const INVESTMENT_ASSETS: Record<string, string> = {
  sui: 'SUI', btc: 'BTC', bitcoin: 'BTC',
  eth: 'ETH', ethereum: 'ETH', gold: 'GOLD',
};

export function parseIntent(input: string): ParsedIntent {
  const text = input.trim().toLowerCase();

  // Simple keyword matches
  if (/^(help|what can (you|i) do|commands)\b/i.test(text)) {
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

  // "save $500", "save 500", "deposit 200"
  const saveMatch = text.match(/^(save|deposit)\s+(.+)/i);
  if (saveMatch) {
    const amount = parseAmount(saveMatch[2]);
    if (amount !== null) return { action: 'save', amount };
  }

  // "withdraw $200", "withdraw all"
  const withdrawMatch = text.match(/^(withdraw|pull out)\s+(.+)/i);
  if (withdrawMatch) {
    const amount = parseAmount(withdrawMatch[2]);
    if (amount !== null) return { action: 'withdraw', amount };
  }

  // "borrow $100"
  const borrowMatch = text.match(/^borrow\s+(.+)/i);
  if (borrowMatch) {
    const amount = parseAmount(borrowMatch[1]);
    if (amount !== null) return { action: 'borrow', amount };
  }

  // "repay $50", "pay back 50"
  const repayMatch = text.match(/^(repay|pay back)\s+(.+)/i);
  if (repayMatch) {
    const amount = parseAmount(repayMatch[2]);
    if (amount !== null) return { action: 'repay', amount };
  }

  // "send $50 to alice", "send 50 to 0x...", "send alice $50"
  const sendMatch = parseSendIntent(text);
  if (sendMatch) return sendMatch;

  // "invest $100 in SUI", "buy $200 SUI", "buy SUI $100"
  const investMatch = parseInvestIntent(text);
  if (investMatch) return investMatch;

  // "swap $50 to SUI", "exchange 100 for ETH"
  const swapMatch = parseSwapIntent(text);
  if (swapMatch) return swapMatch;

  return null;
}

function parseAmount(text: string): number | null {
  if (ALL_PATTERN.test(text)) return -1; // sentinel for "all"
  const match = text.match(AMOUNT_PATTERN);
  if (match) {
    const n = parseFloat(match[1].replace(/,/g, ''));
    return n > 0 ? n : null;
  }
  return null;
}

function parseSendIntent(text: string): ParsedIntent {
  // "send $50 to alice"
  let match = text.match(/^send\s+\$?([\d,.]+)\s+to\s+(.+)/i);
  if (match) {
    const amount = parseFloat(match[1].replace(/,/g, ''));
    if (amount > 0) return { action: 'send', amount, to: match[2].trim() };
  }

  // "send alice $50"
  match = text.match(/^send\s+(\S+)\s+\$?([\d,.]+)/i);
  if (match) {
    const amount = parseFloat(match[2].replace(/,/g, ''));
    if (amount > 0) return { action: 'send', amount, to: match[1].trim() };
  }

  return null;
}

function parseInvestIntent(text: string): ParsedIntent {
  // "invest $100 in SUI"
  let match = text.match(/^(invest|buy)\s+\$?([\d,.]+)\s+(?:in\s+)?(\w+)/i);
  if (match) {
    const amount = parseFloat(match[2].replace(/,/g, ''));
    const asset = resolveAsset(match[3]);
    if (amount > 0 && asset) return { action: 'invest', amount, asset };
  }

  // "buy SUI $100", "invest SUI 200"
  match = text.match(/^(invest|buy)\s+(\w+)\s+\$?([\d,.]+)/i);
  if (match) {
    const asset = resolveAsset(match[2]);
    const amount = parseFloat(match[3].replace(/,/g, ''));
    if (amount > 0 && asset) return { action: 'invest', amount, asset };
  }

  return null;
}

function parseSwapIntent(text: string): ParsedIntent {
  // "swap $50 to SUI", "exchange 100 for ETH"
  const match = text.match(/^(swap|exchange|convert)\s+\$?([\d,.]+)\s+(?:to|for|into)\s+(\w+)/i);
  if (match) {
    const amount = parseFloat(match[2].replace(/,/g, ''));
    const asset = resolveAsset(match[3]);
    if (amount > 0 && asset) return { action: 'swap', amount, to: asset };
  }
  return null;
}

function resolveAsset(input: string): string | null {
  return INVESTMENT_ASSETS[input.toLowerCase()] ?? null;
}
