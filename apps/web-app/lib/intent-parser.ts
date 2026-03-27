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
  | { action: 'swap'; from: string; to: string; amount: number }
  | { action: 'claim-rewards' }
  | { action: 'report' }
  | { action: 'history' }
  | { action: 'address' }
  | { action: 'balance' }
  | { action: 'rates' }
  | { action: 'help' }
  | { action: 'invest' }
  | null;

const AMOUNT_PATTERN = /\$?([\d,]+(?:\.\d{1,2})?)/;
const ALL_PATTERN = /\ball\b/i;

const TRADEABLE_ASSETS: Record<string, string> = {
  sui: 'SUI', btc: 'BTC', bitcoin: 'BTC',
  eth: 'ETH', ethereum: 'ETH', gold: 'GOLD',
  usdc: 'USDC', usdt: 'USDT', suiusdt: 'USDT',
  usde: 'USDe', suiusde: 'USDe',
  usdsui: 'USDsui',
};

function stripPreamble(text: string): string {
  return text.replace(/^(can you|could you|please|pls|hey|yo|i want to|i'd like to|i wanna|go ahead and)\s+/i, '');
}

export function parseIntent(input: string): ParsedIntent {
  const text = stripPreamble(input.trim()).toLowerCase();

  // Simple keyword matches
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

  // "dca into bluechip", "invest strategy", "start dca"
  if (/^(dca|invest\s+strategy|start\s+dca|auto.?invest)/i.test(text)) {
    return { action: 'invest' as const };
  }

  // "buy $100 BTC", "invest $100 in SUI", "sell 0.001 BTC"
  const buyMatch = parseBuyIntent(text);
  if (buyMatch) return buyMatch;

  const sellMatch = parseSellIntent(text);
  if (sellMatch) return sellMatch;

  // "swap $50 SUI to ETH", "exchange 100 for ETH"
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

function parseBuyIntent(text: string): ParsedIntent {
  // "buy $100 BTC", "invest $100 in SUI", "buy 200 ETH"
  let match = text.match(/^(invest|buy)\s+\$?([\d,.]+)\s+(?:in\s+|of\s+)?(\w+)/i);
  if (match) {
    const amount = parseFloat(match[2].replace(/,/g, ''));
    const asset = resolveAsset(match[3]);
    if (amount > 0 && asset) return { action: 'swap', from: 'USDC', to: asset, amount };
  }

  // "buy SUI $100", "buy BTC 200"
  match = text.match(/^(invest|buy)\s+(\w+)\s+\$?([\d,.]+)/i);
  if (match) {
    const asset = resolveAsset(match[2]);
    const amount = parseFloat(match[3].replace(/,/g, ''));
    if (amount > 0 && asset) return { action: 'swap', from: 'USDC', to: asset, amount };
  }

  // "buy SUI", "buy gold" (no amount → show amount picker)
  match = text.match(/^(?:buy|get)\s+(\w+)$/i);
  if (match) {
    const asset = resolveAsset(match[1]);
    if (asset && asset !== 'USDC') return { action: 'swap', from: 'USDC', to: asset, amount: 0 };
  }

  return null;
}

function parseSellIntent(text: string): ParsedIntent {
  // "sell all BTC", "sell all USDe"
  let match = text.match(/^sell\s+all\s+(\w+)/i);
  if (match) {
    const asset = resolveAsset(match[1]);
    if (asset && asset !== 'USDC') return { action: 'swap', from: asset, to: 'USDC', amount: -1 };
  }

  // "sell SUI", "sell gold" (no amount → show amount picker)
  match = text.match(/^sell\s+(\w+)$/i);
  if (match) {
    const asset = resolveAsset(match[1]);
    if (asset && asset !== 'USDC') return { action: 'swap', from: asset, to: 'USDC', amount: 0 };
  }

  // "sell 0.001 BTC", "sell $50 ETH"
  match = text.match(/^sell\s+\$?([\d,.]+)\s+(\w+)/i);
  if (match) {
    const amount = parseFloat(match[1].replace(/,/g, ''));
    const asset = resolveAsset(match[2]);
    if (amount > 0 && asset) return { action: 'swap', from: asset, to: 'USDC', amount };
  }

  // "sell BTC 0.001"
  match = text.match(/^sell\s+(\w+)\s+\$?([\d,.]+)/i);
  if (match) {
    const asset = resolveAsset(match[1]);
    const amount = parseFloat(match[2].replace(/,/g, ''));
    if (amount > 0 && asset) return { action: 'swap', from: asset, to: 'USDC', amount };
  }

  return null;
}

function parseSwapIntent(text: string): ParsedIntent {
  // "swap all USDe to USDC", "convert all ETH to USDC"
  let match = text.match(/^(swap|exchange|convert|trade)\s+all\s+(\w+)\s+(?:to|for|into)\s+(\w+)/i);
  if (match) {
    const from = resolveAsset(match[2]);
    const to = resolveAsset(match[3]);
    if (from && to) return { action: 'swap', from, to, amount: -1 };
  }

  // "swap 50 USDC to SUI", "swap 50 SUI for ETH"
  match = text.match(/^(swap|exchange|convert|trade)\s+\$?([\d,.]+)\s+(\w+)\s+(?:to|for|into)\s+(\w+)/i);
  if (match) {
    const amount = parseFloat(match[2].replace(/,/g, ''));
    const from = resolveAsset(match[3]);
    const to = resolveAsset(match[4]);
    if (amount > 0 && from && to) return { action: 'swap', from, to, amount };
  }

  // "swap $50 to SUI" (assumes from USDC)
  match = text.match(/^(swap|exchange|convert|trade)\s+\$?([\d,.]+)\s+(?:to|for|into)\s+(\w+)/i);
  if (match) {
    const amount = parseFloat(match[2].replace(/,/g, ''));
    const to = resolveAsset(match[3]);
    if (amount > 0 && to) return { action: 'swap', from: 'USDC', to, amount };
  }

  return null;
}

function resolveAsset(input: string): string | null {
  return TRADEABLE_ASSETS[input.toLowerCase()] ?? null;
}
