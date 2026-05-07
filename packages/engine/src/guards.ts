import type { Tool, ToolFlags } from './types.js';
import type { PendingToolCall } from './orchestration.js';

// ---------------------------------------------------------------------------
// Guard types
// ---------------------------------------------------------------------------

export type GuardVerdict = 'pass' | 'hint' | 'warn' | 'block';

export type GuardTier = 'safety' | 'financial' | 'ux';

export interface GuardResult {
  verdict: GuardVerdict;
  gate: string;
  tier: GuardTier;
  message?: string;
}

export interface GuardInjection {
  _gate: string;
  _hint?: string;
  _warning?: string;
  _error?: string;
}

export interface GuardCheckResult {
  blocked: boolean;
  blockReason?: string;
  blockGate?: string;
  injections: GuardInjection[];
  events: GuardEvent[];
  /**
   * [SPEC 9 v0.1.3 P9.4] Set when the tool's preflight returned
   * `needsInput` instead of either valid or error. The engine consults
   * this BEFORE checking `blocked`: if present, the engine yields a
   * `pending_input` event and pauses the turn. Distinct from `blocked`
   * because the engine should NOT push a tool_result error back to the
   * LLM — the turn is intentionally paused, not failed.
   */
  needsInput?: {
    schema: import('./pending-input.js').FormSchema;
    description?: string;
  };
}

export interface GuardEvent {
  timestamp: number;
  toolName: string;
  toolUseId: string;
  gate: string;
  verdict: GuardVerdict;
  tier: GuardTier;
  message?: string;
}

/**
 * [v1.4 Item 4] Per-guard metric emitted via `EngineConfig.onGuardFired`.
 * Hosts (e.g. audric `TurnMetricsCollector`) accumulate these for the
 * `TurnMetrics.guardsFired` JSON column. Mirrors `GuardEvent` but with
 * a coarser tri-state action (allow/warn/block) so the host doesn't
 * need to know the engine's verdict vocabulary.
 */
export interface GuardMetric {
  name: string;
  tier: GuardTier;
  action: 'allow' | 'warn' | 'block';
  injectionAdded: boolean;
}

/**
 * Engine-internal mapping from `GuardVerdict` to `GuardMetric.action`.
 * `pass` and `hint` collapse to `allow` because hint is non-blocking —
 * the model just sees a soft note.
 */
function guardVerdictToAction(verdict: GuardVerdict): GuardMetric['action'] {
  if (verdict === 'pass' || verdict === 'hint') return 'allow';
  if (verdict === 'warn') return 'warn';
  return 'block';
}

// ---------------------------------------------------------------------------
// Guard configuration
// ---------------------------------------------------------------------------

export interface GuardConfig {
  balanceValidation?: boolean;
  healthFactor?: { warnBelow: number; blockBelow: number } | false;
  largeTransfer?: { warnAbove: number; strongWarnAbove: number } | false;
  slippage?: boolean;
  staleData?: boolean;
  irreversibility?: boolean;
  artifactPreview?: boolean;
  costWarning?: boolean;
  retryProtection?: boolean;
  inputValidation?: boolean;
  /**
   * Root-cause guard for "LLM types a recipient address from memory and
   * loses funds to a wrong-but-valid address". When enabled (default),
   * `send_transfer.to` is rejected unless the address can be sourced
   * from a saved contact, the user's own wallet, or the user's recent
   * messages. Set to `false` only if the host has its own equivalent
   * upstream guard (e.g. an off-process verifier).
   */
  addressSource?: boolean;
  /**
   * Companion to `addressSource`: blocks send_transfer that defaults to
   * USDC when the user's recent messages clearly named a non-USDC token
   * (SUI, USDT, WAL, etc.). Without this, the LLM would call
   * `send_transfer({ amount, to })` for a "send my SUI" request and the
   * tool would silently ship USDC. Default on.
   */
  assetIntent?: boolean;
  /**
   * Root-cause fix for "LLM hallucinates a stale training-data price
   * (e.g. '$3.50/SUI') and shows the user a wildly wrong estimate before
   * the swap card renders". When enabled (default), `swap_execute` is
   * blocked unless a matching `swap_quote(from, to, amount)` ran in the
   * recent past (60s window, ±1% amount tolerance). The block forces the
   * LLM to fetch a real on-chain quote and cite its actual numbers, not
   * a guess. Set to `false` only if the host has its own pre-execution
   * quote requirement.
   */
  swapPreview?: boolean;
  /**
   * Root-cause fix for "user asks about a watched address (`0x40cd…`)
   * and the LLM calls `balance_check` / `portfolio_analysis` /
   * `transaction_history` without passing `address`, returning the
   * signed-in user's own data instead". The default-to-self behavior is
   * correct when no address is mentioned, but silently wrong when the
   * user names a third-party wallet. When enabled (default), the guard
   * inspects recent user messages for full Sui addresses and blocks
   * any read tool that targets the user's own wallet (or omits
   * `address`) when a different address was named. Disable only if the
   * host has its own equivalent address-resolution layer.
   */
  addressScope?: boolean;
}

export const DEFAULT_GUARD_CONFIG: GuardConfig = {
  balanceValidation: true,
  healthFactor: { warnBelow: 2.0, blockBelow: 1.5 },
  largeTransfer: { warnAbove: 50, strongWarnAbove: 500 },
  slippage: true,
  staleData: true,
  irreversibility: true,
  artifactPreview: true,
  costWarning: true,
  retryProtection: true,
  inputValidation: true,
  addressSource: true,
  assetIntent: true,
  swapPreview: true,
  addressScope: true,
};

// ---------------------------------------------------------------------------
// BalanceTracker — tracks freshness of balance data across the session
// ---------------------------------------------------------------------------

export class BalanceTracker {
  private lastBalanceAt = 0;
  private lastWriteAt = 0;

  recordRead(): void {
    this.lastBalanceAt = Date.now();
  }

  /**
   * [v1.11 F2] Seed `lastBalanceAt` from an external snapshot timestamp.
   * Used by the engine constructor when the host passes
   * `EngineConfig.financialContextSeed.balanceAt` — i.e. the system
   * prompt already embeds a fresh balance snapshot from that time so
   * the LLM has authoritative balance data without the host
   * round-tripping a `balance_check` tool call first. Pre-fix the
   * `Balance has not been checked this session` hint fired on every
   * first-turn write, even when audric had just embedded the daily
   * `<financial_context>` block — pure noise for the LLM and the user.
   */
  recordReadAt(at: number): void {
    if (at > this.lastBalanceAt) {
      this.lastBalanceAt = at;
    }
  }

  recordWrite(): void {
    this.lastWriteAt = Date.now();
  }

  isStale(): boolean {
    return this.lastWriteAt > this.lastBalanceAt;
  }

  hasEverRead(): boolean {
    return this.lastBalanceAt > 0;
  }
}

const BALANCE_READ_TOOLS = new Set([
  'balance_check',
  'savings_info',
  'health_check',
]);

// ---------------------------------------------------------------------------
// RetryTracker — prevents re-execution of paid/non-retryable tool calls
// ---------------------------------------------------------------------------

export class RetryTracker {
  private executed = new Map<string, { result: unknown; paidAt: number }>();

  private key(toolName: string, input: unknown): string {
    const url = (input as Record<string, unknown>)?.url ?? '';
    return `${toolName}:${url}`;
  }

  record(toolName: string, input: unknown, result: unknown): void {
    const r = result as Record<string, unknown>;
    if (r?.paymentConfirmed || r?.doNotRetry) {
      this.executed.set(this.key(toolName, input), { result, paidAt: Date.now() });
    }
  }

  isBlocked(toolName: string, input: unknown): { blocked: boolean; previousResult?: unknown } {
    const prev = this.executed.get(this.key(toolName, input));
    if (!prev) return { blocked: false };
    return { blocked: true, previousResult: prev.result };
  }
}

// ---------------------------------------------------------------------------
// SwapQuoteTracker — records swap_quote calls so swapPreview can verify a
// swap_execute was preceded by a real on-chain quote. Without this, the
// LLM falls back to training-memory prices and gives the user wildly wrong
// estimates (the "$3.50/SUI when SUI is $0.95" class of bugs).
// ---------------------------------------------------------------------------

interface RecordedSwapQuote {
  from: string;
  to: string;
  amount: number;
  ts: number;
}

export class SwapQuoteTracker {
  /** Quotes recorded in the recent window. Trimmed lazily on every check. */
  private quotes: RecordedSwapQuote[] = [];

  /** Match window: 60s is generous enough for slow LLM turns but tight enough
   * to invalidate stale quotes from earlier in the session. */
  private readonly windowMs = 60_000;

  /** Amount tolerance: ±1% (covers gas-padding, integer-rounding, and the
   * rare case where the LLM rounds the input differently between quote and
   * execute). Prices barely move in 60s so 1% is forgiving but meaningful. */
  private readonly amountTolerance = 0.01;

  /**
   * Normalize a token identifier so symbol vs. coinType vs. case don't
   * cause spurious mismatches. Lowercase + trim is sufficient because the
   * SDK's resolver itself is case-insensitive on symbols.
   */
  private normalize(token: string): string {
    return token.trim().toLowerCase();
  }

  record(input: { from: string; to: string; amount: number }): void {
    const now = Date.now();
    this.quotes.push({
      from: this.normalize(input.from),
      to: this.normalize(input.to),
      amount: input.amount,
      ts: now,
    });
    const cutoff = now - this.windowMs;
    this.quotes = this.quotes.filter((q) => q.ts > cutoff);
  }

  hasMatchingQuote(input: { from: string; to: string; amount: number }): boolean {
    const cutoff = Date.now() - this.windowMs;
    const fromN = this.normalize(input.from);
    const toN = this.normalize(input.to);
    const target = input.amount;
    return this.quotes.some(
      (q) =>
        q.ts > cutoff &&
        q.from === fromN &&
        q.to === toN &&
        target > 0 &&
        Math.abs(q.amount - target) / target <= this.amountTolerance,
    );
  }
}

// ---------------------------------------------------------------------------
// Individual guard implementations
// Priority order: Safety > Financial > UX
// ---------------------------------------------------------------------------

function guardRetryProtection(
  tool: Tool,
  call: PendingToolCall,
  retryTracker: RetryTracker,
): GuardResult {
  const check = retryTracker.isBlocked(tool.name, call.input);
  if (check.blocked) {
    return {
      verdict: 'block',
      gate: 'retry_blocked',
      tier: 'safety',
      message: `Blocked: ${tool.name} was already called and payment was confirmed. Do not retry.`,
    };
  }
  return { verdict: 'pass', gate: 'retry_blocked', tier: 'safety' };
}

function guardIrreversibility(
  tool: Tool,
  _call: PendingToolCall,
  conversationText: string,
): GuardResult {
  if (!tool.flags.irreversible) {
    return { verdict: 'pass', gate: 'irreversibility', tier: 'safety' };
  }

  // [security] `confirm.*send` was rewritten to bound the wildcard
  // span (`.{0,200}`) so the regex is linear-time on degenerate inputs
  // like a 100KB string starting with "confirm" but never containing
  // "send". CodeQL flagged the unbounded `.*` as polynomial-redos.
  const hasPreview = /preview|here.{0,2}s what|confirm.{0,200}send|looks? good/i.test(conversationText);
  if (hasPreview) {
    return { verdict: 'pass', gate: 'irreversibility', tier: 'safety' };
  }

  return {
    verdict: 'hint',
    gate: 'irreversibility',
    tier: 'safety',
    message: 'This action is irreversible. Show a preview and ask the user to confirm before proceeding.',
  };
}

function guardBalanceValidation(
  tool: Tool,
  _call: PendingToolCall,
  balanceTracker: BalanceTracker,
): GuardResult {
  if (!tool.flags.requiresBalance) {
    return { verdict: 'pass', gate: 'balance_required', tier: 'financial' };
  }

  if (!balanceTracker.hasEverRead()) {
    return {
      verdict: 'hint',
      gate: 'balance_required',
      tier: 'financial',
      message: 'Balance has not been checked this session. Call balance_check first to verify sufficient funds.',
    };
  }

  if (balanceTracker.isStale()) {
    return {
      verdict: 'hint',
      gate: 'balance_required',
      tier: 'financial',
      message: 'Balance data is stale (a write action occurred since last check). Call balance_check first to verify sufficient funds.',
    };
  }

  return { verdict: 'pass', gate: 'balance_required', tier: 'financial' };
}

function guardHealthFactor(
  tool: Tool,
  _call: PendingToolCall,
  lastHealthFactor: number | null,
  config: { warnBelow: number; blockBelow: number },
): GuardResult {
  if (!tool.flags.affectsHealth) {
    return { verdict: 'pass', gate: 'health_factor', tier: 'financial' };
  }

  if (lastHealthFactor === null) {
    return {
      verdict: 'hint',
      gate: 'health_factor',
      tier: 'financial',
      message: 'Health factor has not been checked this session. Call health_check before this action.',
    };
  }

  if (lastHealthFactor < config.blockBelow) {
    return {
      verdict: 'block',
      gate: 'health_factor',
      tier: 'financial',
      message: `Health factor is ${lastHealthFactor.toFixed(2)} — this action risks liquidation. Refusing.`,
    };
  }

  if (lastHealthFactor < config.warnBelow) {
    return {
      verdict: 'warn',
      gate: 'health_factor',
      tier: 'financial',
      message: `Health factor is ${lastHealthFactor.toFixed(2)} — this action may reduce it further.`,
    };
  }

  return { verdict: 'pass', gate: 'health_factor', tier: 'financial' };
}

function guardLargeTransfer(
  tool: Tool,
  call: PendingToolCall,
  config: { warnAbove: number; strongWarnAbove: number },
): GuardResult {
  if (tool.name !== 'send_transfer') {
    return { verdict: 'pass', gate: 'large_transfer', tier: 'financial' };
  }

  const input = call.input as Record<string, unknown>;
  const amount = Number(input.amount ?? 0);
  if (!amount || amount <= 0) {
    return { verdict: 'pass', gate: 'large_transfer', tier: 'financial' };
  }

  const recipient = String(input.recipient ?? input.to ?? '');
  const shortAddr = recipient.length > 10
    ? `${recipient.slice(0, 6)}...${recipient.slice(-4)}`
    : recipient;

  if (amount > config.strongWarnAbove) {
    return {
      verdict: 'warn',
      gate: 'large_transfer',
      tier: 'financial',
      message: `High-value transfer ($${amount}). Double-check the address: ${shortAddr}`,
    };
  }

  if (amount > config.warnAbove) {
    return {
      verdict: 'hint',
      gate: 'large_transfer',
      tier: 'financial',
      message: `This is a large transfer ($${amount}). Verify the recipient address.`,
    };
  }

  return { verdict: 'pass', gate: 'large_transfer', tier: 'financial' };
}

function guardSlippage(
  tool: Tool,
  _call: PendingToolCall,
  lastAssistantText: string,
): GuardResult {
  if (tool.name !== 'swap_execute') {
    return { verdict: 'pass', gate: 'slippage_warning', tier: 'financial' };
  }

  // [security] Rewritten to non-overlapping form (`\d[\d,]{0,30}`
   // followed by an optional `\.\d{1,10}`) so the digit/decimal section
  // matches in linear time. Previously `[\d,]+\.?\d*` could ambiguously
  // distribute digits across the two pieces, triggering CodeQL's
  // polynomial-redos rule on a long input like "1234,1234,...".
  const hasEstimate = /~?\$?\d[\d,]{0,30}(?:\.\d{1,10})?\s*(SUI|USDC|USDT|WETH)/i.test(lastAssistantText)
    || /approximately|≈|about|expect|receive/i.test(lastAssistantText);

  if (hasEstimate) {
    return { verdict: 'pass', gate: 'slippage_warning', tier: 'financial' };
  }

  return {
    verdict: 'hint',
    gate: 'slippage_warning',
    tier: 'financial',
    message: 'State the expected output amount to the user before executing the swap.',
  };
}

function guardCostWarning(
  tool: Tool,
  _call: PendingToolCall,
  conversationText: string,
): GuardResult {
  if (!tool.flags.costAware) {
    return { verdict: 'pass', gate: 'cost_warning', tier: 'ux' };
  }

  const hasCostMention = /\$\d+\.?\d*|cost|fee|charge|price|pay/i.test(conversationText);
  if (hasCostMention) {
    return { verdict: 'pass', gate: 'cost_warning', tier: 'ux' };
  }

  return {
    verdict: 'hint',
    gate: 'cost_warning',
    tier: 'ux',
    message: 'This action has a monetary cost. Confirm the user is aware before proceeding.',
  };
}

// ---------------------------------------------------------------------------
// guardAddressSource — root-cause fix for the "LLM mistypes a recipient
// address from memory and ships funds to a wrong-but-valid address"
// failure mode. We trust the user, never the model, with addresses.
//
// Accepts the `to` field on `send_transfer` only when it can be sourced
// from one of three trusted origins:
//   1. A saved contact's address (case-insensitive, normalized)
//   2. The user's own wallet (sending to self)
//   3. Verbatim presence in the user's recent messages
//      (case-insensitive substring match on the raw 0x...64-hex string)
//
// Anything else → block with a structured error so the LLM is forced to
// ask the user to paste the address again rather than re-typing it.
// ---------------------------------------------------------------------------

const SUI_ADDRESS_REGEX = /^0x[a-fA-F0-9]{64}$/;

function normalizeAddress(addr: string): string {
  return addr.trim().toLowerCase();
}

/**
 * [send-safety v2] Bound the failure mode where the LLM was asked to
 * send a non-USDC token (e.g. just-swapped SUI) but called send_transfer
 * with no `asset` field. The tool defaults `asset` to USDC, so the user
 * lost real money: "Done! Sent your SUI" while only USDC moved.
 *
 * Heuristic: if any of the supported NON-USDC tokens appears as a word
 * in the user's recent messages AND the call has no `asset` (or asset
 * is USDC while a different token is mentioned), block the call and
 * force the LLM to re-issue with an explicit `asset`.
 *
 * Tokens are matched as standalone words (`\bSUI\b`, `\bWAL\b`, etc.)
 * to avoid false positives on things like "USDC" or addresses that
 * happen to contain the substring "sui".
 */
const NON_USDC_TOKEN_WORDS: ReadonlyArray<{ symbol: string; pattern: RegExp }> = [
  // Patterns are anchored with \b on both sides. Case-insensitive.
  { symbol: 'SUI', pattern: /\bSUI\b/i },
  { symbol: 'USDT', pattern: /\bUSDT\b/i },
  { symbol: 'USDe', pattern: /\bUSDe\b/i },
  { symbol: 'USDsui', pattern: /\bUSDsui\b/i },
  { symbol: 'WAL', pattern: /\bWAL\b/i },
  { symbol: 'ETH', pattern: /\bETH\b/i },
  { symbol: 'NAVX', pattern: /\bNAVX\b/i },
  { symbol: 'GOLD', pattern: /\bGOLD\b/i },
];

function guardAssetIntent(
  tool: Tool,
  call: PendingToolCall,
  userText: string,
): GuardResult {
  if (tool.name !== 'send_transfer') {
    return { verdict: 'pass', gate: 'asset_intent', tier: 'safety' };
  }

  const input = call.input as Record<string, unknown>;
  const assetWasSet = !(input.asset === undefined || input.asset === null || input.asset === '');

  // If the LLM made any explicit asset choice, trust it — even if it's
  // USDC. The danger we're guarding against is the *silent default* to
  // USDC when the schema didn't expose `asset` at all (the original
  // failure mode). Once the LLM has explicitly committed to a token,
  // the user can verify and cancel at the permission card.
  if (assetWasSet) {
    return { verdict: 'pass', gate: 'asset_intent', tier: 'safety' };
  }

  // Asset was omitted. Block iff the user named a non-USDC token in
  // their recent messages, since the omitted-asset path defaults to
  // USDC and would silently ship the wrong token.
  const mentioned = NON_USDC_TOKEN_WORDS.find((t) => t.pattern.test(userText));
  if (!mentioned) {
    return { verdict: 'pass', gate: 'asset_intent', tier: 'safety' };
  }

  return {
    verdict: 'block',
    gate: 'asset_intent',
    tier: 'safety',
    message:
      `Asset mismatch: the user's recent messages mention "${mentioned.symbol}" but send_transfer was called without an \`asset\` field (defaults to USDC). ` +
      `If the user asked you to send ${mentioned.symbol}, re-issue send_transfer with \`asset: "${mentioned.symbol}"\`. ` +
      `If the user really meant USDC, set \`asset: "USDC"\` explicitly to confirm intent. Never default to USDC when the user named a different token.`,
  };
}

// ---------------------------------------------------------------------------
// guardSwapPreview — root-cause fix for "LLM hallucinates a stale price
// (e.g. '$3.50/SUI' when SUI is $0.95) and shows the user a wildly wrong
// estimate before the swap card renders". We require swap_execute to be
// preceded by a real on-chain swap_quote so the LLM has authoritative
// numbers (price impact, route, exact output) to cite.
//
// Match rule:
//   - Same `from` and `to` token identifiers (case-insensitive).
//   - `amount` within ±1% of the quoted amount.
//   - swap_quote ran within the last 60s (current turn is well within).
//
// Anything else → block with a structured error so the LLM is forced to
// call swap_quote first and re-issue swap_execute with the same params.
// ---------------------------------------------------------------------------

function guardSwapPreview(
  tool: Tool,
  call: PendingToolCall,
  swapQuoteTracker: SwapQuoteTracker,
): GuardResult {
  if (tool.name !== 'swap_execute') {
    return { verdict: 'pass', gate: 'swap_preview', tier: 'safety' };
  }

  const input = call.input as { from?: unknown; to?: unknown; amount?: unknown };
  const from = typeof input.from === 'string' ? input.from : '';
  const to = typeof input.to === 'string' ? input.to : '';
  const amount = Number(input.amount ?? 0);

  // If inputs are malformed, let `inputValidation`/`preflight` handle it —
  // this guard is specifically about quote freshness, not input shape.
  if (!from || !to || !(amount > 0)) {
    return { verdict: 'pass', gate: 'swap_preview', tier: 'safety' };
  }

  if (swapQuoteTracker.hasMatchingQuote({ from, to, amount })) {
    return { verdict: 'pass', gate: 'swap_preview', tier: 'safety' };
  }

  return {
    verdict: 'block',
    gate: 'swap_preview',
    tier: 'safety',
    message:
      `swap_execute requires a recent matching swap_quote so the user sees an accurate preview. ` +
      `Call swap_quote({ from: "${from}", to: "${to}", amount: ${amount} }) first, then re-issue swap_execute with the same params. ` +
      `swap_quote is read-only and returns the real on-chain output, route, and price impact — never estimate from memory.`,
  };
}

function guardAddressSource(
  tool: Tool,
  call: PendingToolCall,
  userText: string,
  contacts: ReadonlyArray<{ name: string; address: string }>,
  walletAddress: string | undefined,
): GuardResult {
  if (tool.name !== 'send_transfer') {
    return { verdict: 'pass', gate: 'address_source', tier: 'safety' };
  }

  const input = call.input as Record<string, unknown>;
  const rawTo = String(input.to ?? '');
  if (!rawTo) {
    return { verdict: 'pass', gate: 'address_source', tier: 'safety' };
  }

  // Contact-name passthrough: send_transfer accepts either a 0x address
  // or a contact name. If it's not in 0x...64-hex form, leave it alone —
  // the SDK's contact resolver handles names and will throw if unknown.
  if (!SUI_ADDRESS_REGEX.test(rawTo)) {
    return { verdict: 'pass', gate: 'address_source', tier: 'safety' };
  }

  const normalizedTo = normalizeAddress(rawTo);

  if (walletAddress && normalizeAddress(walletAddress) === normalizedTo) {
    return { verdict: 'pass', gate: 'address_source', tier: 'safety' };
  }

  for (const c of contacts) {
    if (normalizeAddress(c.address) === normalizedTo) {
      return { verdict: 'pass', gate: 'address_source', tier: 'safety' };
    }
  }

  if (userText.toLowerCase().includes(normalizedTo)) {
    return { verdict: 'pass', gate: 'address_source', tier: 'safety' };
  }

  return {
    verdict: 'block',
    gate: 'address_source',
    tier: 'safety',
    message:
      `Safety check failed: the recipient address "${rawTo}" was not provided by the user (no saved contact matches, address is not the user's own wallet, and it does not appear verbatim in the user's recent messages). For safety, addresses must be supplied directly by the user — never reconstructed from memory or partial recall. Ask the user to paste the destination address again exactly.`,
  };
}

// ---------------------------------------------------------------------------
// guardAddressScope — symmetric companion to `guardAddressSource`, but for
// READ tools. Bounds the failure mode where the LLM is asked about a
// third-party wallet (`"what's the balance of 0x40cd..."`) and silently
// drops the address parameter, returning the signed-in user's own data
// instead. The default-to-self behavior of these tools is correct when
// no address is mentioned, but wrong when the user named a third party.
//
// Read tools whose schema accepts an optional `address` field. Mirrors
// the SDK's "default to context.walletAddress" pattern in `balance.ts`,
// `portfolio-analysis.ts`, and `history.ts`. Tools not in this set
// always pass through (they either don't take an address or use a
// different param name).
// ---------------------------------------------------------------------------
const READ_TOOLS_WITH_ADDRESS_PARAM = new Set([
  'balance_check',
  'portfolio_analysis',
  'transaction_history',
  'savings_info',
  'health_check',
  'spending_analytics',
  'yield_summary',
  'activity_summary',
  'explain_tx',
]);

// Loose match for Sui addresses inside conversational text. The strict
// `SUI_ADDRESS_REGEX` is anchored (`^…$`) and matches a single, full
// 0x...64-hex string only. For substring scanning we accept 60-64 hex
// characters since some clients normalize away leading zeros.
const SUI_ADDRESS_IN_TEXT_REGEX = /0x[a-fA-F0-9]{60,64}/g;

function guardAddressScope(
  tool: Tool,
  call: PendingToolCall,
  userText: string,
  walletAddress: string | undefined,
): GuardResult {
  if (!READ_TOOLS_WITH_ADDRESS_PARAM.has(tool.name)) {
    return { verdict: 'pass', gate: 'address_scope', tier: 'safety' };
  }

  const matches = userText.match(SUI_ADDRESS_IN_TEXT_REGEX);
  if (!matches || matches.length === 0) {
    return { verdict: 'pass', gate: 'address_scope', tier: 'safety' };
  }

  // Filter out references to the user's own wallet — those are not bugs.
  // Dedupe so a user message like "compare 0xabc to 0xabc" only carries
  // one address through the rest of the check.
  const ownWallet = walletAddress ? normalizeAddress(walletAddress) : null;
  const thirdPartyAddresses = Array.from(
    new Set(matches.map(normalizeAddress).filter((a) => a !== ownWallet)),
  );

  if (thirdPartyAddresses.length === 0) {
    return { verdict: 'pass', gate: 'address_scope', tier: 'safety' };
  }

  const input = call.input as Record<string, unknown>;
  const callAddress =
    typeof input.address === 'string' && input.address.length > 0
      ? normalizeAddress(input.address)
      : null;

  // Pass if the call already targets one of the user-mentioned third
  // parties. The LLM might pick any of multiple mentioned addresses on
  // any given turn — that's a UX choice, not a safety issue.
  if (callAddress && thirdPartyAddresses.includes(callAddress)) {
    return { verdict: 'pass', gate: 'address_scope', tier: 'safety' };
  }

  // Block: user named at least one third-party address but the call
  // either omitted `address` (defaults to signed-in user) or targeted
  // a different wallet (likely the signed-in user's, also wrong).
  const target = thirdPartyAddresses[0];
  const omittedHint = callAddress
    ? `with address: "${callAddress}"`
    : 'without an `address` field (which defaults to the signed-in user)';
  const mentionedHint =
    thirdPartyAddresses.length === 1
      ? `address ${target}`
      : `${thirdPartyAddresses.length} third-party addresses (first: ${target})`;
  return {
    verdict: 'block',
    gate: 'address_scope',
    tier: 'safety',
    message:
      `Address-scope mismatch: the user's recent messages mention ${mentionedHint} but ${tool.name} was called ${omittedHint}. ` +
      `Re-issue ${tool.name} with \`address: "${target}"\` to inspect the wallet the user actually asked about. ` +
      `Never default to the signed-in user when the user named a different wallet.`,
  };
}

// ---------------------------------------------------------------------------
// Post-execution guards — run after tool result is available
// ---------------------------------------------------------------------------

export function guardArtifactPreview(result: unknown): GuardInjection | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;

  const hasImage =
    (typeof r.url === 'string' && /\.(png|jpg|jpeg|webp|gif|svg)(\?|$)/i.test(r.url))
    || (Array.isArray(r.images) && r.images.length > 0)
    || typeof r.image_url === 'string';

  const hasPdf = typeof r.url === 'string' && /\.pdf(\?|$)/i.test(r.url);

  if (hasImage || hasPdf) {
    return {
      _gate: 'artifact_preview',
      _hint: 'Show this to the user before proceeding. Output as ![description](url).',
    };
  }

  return null;
}

export function guardStaleData(toolFlags: ToolFlags): GuardInjection | null {
  if (!toolFlags.mutating) return null;
  return {
    _gate: 'stale_data',
    _hint: 'A write action just completed. The balance snapshot is outdated. Do NOT calculate new balances from old data — call balance_check for fresh numbers, or use only the data returned by the write tool.',
  };
}

// ---------------------------------------------------------------------------
// Guard runner — orchestrates all pre-execution guards
// ---------------------------------------------------------------------------

export interface GuardRunnerState {
  balanceTracker: BalanceTracker;
  retryTracker: RetryTracker;
  swapQuoteTracker: SwapQuoteTracker;
  lastHealthFactor: number | null;
}

export function createGuardRunnerState(): GuardRunnerState {
  return {
    balanceTracker: new BalanceTracker(),
    retryTracker: new RetryTracker(),
    swapQuoteTracker: new SwapQuoteTracker(),
    lastHealthFactor: null,
  };
}

export function runGuards(
  tool: Tool,
  call: PendingToolCall,
  state: GuardRunnerState,
  config: GuardConfig,
  conversationContext: { fullText: string; lastAssistantText: string; recentUserText: string },
  /**
   * [v1.4 Item 4] Optional per-guard observation hook. Fired exactly
   * once per non-`pass` guard verdict (i.e. for every event that ends
   * up in `events`/`injections`/`block`). Errors thrown by the host
   * are caught so a misbehaving collector can't break tool execution.
   */
  onGuardFired?: (guard: GuardMetric) => void,
  /**
   * Identity context for the address-source safety guard. The guard
   * accepts `send_transfer.to` only when sourced from a saved contact,
   * the user's own wallet, or the user's recent messages — preventing
   * the LLM from typing addresses from memory and shipping funds to a
   * wrong-but-syntactically-valid recipient.
   */
  identity?: {
    contacts?: ReadonlyArray<{ name: string; address: string }>;
    walletAddress?: string;
  },
): GuardCheckResult {
  const results: GuardResult[] = [];
  const now = Date.now();
  const fire = (verdict: GuardVerdict, tier: GuardTier, gate: string, hadInjection: boolean) => {
    if (!onGuardFired) return;
    try {
      onGuardFired({
        name: gate,
        tier,
        action: guardVerdictToAction(verdict),
        injectionAdded: hadInjection,
      });
    } catch (err) {
      console.warn('[guards] onGuardFired threw (ignored):', err);
    }
  };

  // Tier 0: Input validation (preflight) — runs first, invalid input = immediate block.
  // [SPEC 9 v0.1.3 P9.4] When preflight returns `needsInput`, the engine
  // pauses the turn instead of feeding an error back to the LLM. Surfaced
  // via a discrete `needsInput` field on the result; the engine consults
  // it BEFORE the `blocked` check.
  if (config.inputValidation !== false && tool.preflight) {
    const check = tool.preflight(call.input);
    if (!check.valid) {
      // Branch A: tool wants structured input — pause the turn, don't block.
      // [SPEC 9 v0.1.3 P9.4] Reuse the existing `pass` verdict for the
      // "pause for user input" case. Strictly speaking the call doesn't
      // pass (it pauses), but adding a 5th verdict ('pause') would force
      // every host that switches on `GuardVerdict` to add a new branch.
      // Hosts that segment dashboards on "pause-for-input rate" can key
      // on the dedicated `audric.harness.pending_input_emitted_count`
      // telemetry counter the engine fires on this branch.
      if ('needsInput' in check && check.needsInput) {
        const event: GuardEvent = {
          timestamp: now,
          toolName: tool.name,
          toolUseId: call.id,
          gate: 'input_validation',
          verdict: 'pass',
          tier: 'safety',
          message: check.needsInput.description,
        };
        fire('pass', 'safety', 'input_validation', false);
        return {
          blocked: false,
          injections: [],
          events: [event],
          needsInput: check.needsInput,
        };
      }
      // Branch B: classical block — bad input the LLM should re-ask.
      // We've already handled the `needsInput` branch above, so this is
      // the `{ valid: false; error: string }` branch. Narrow explicitly.
      if (!('error' in check)) {
        // Unreachable — needsInput branch already returned. Defensive throw
        // so a future PreflightResult union extension fails loudly here
        // instead of silently dropping into the block branch with an
        // undefined message.
        throw new Error(
          `Preflight returned a non-needsInput, non-error invalid result for tool ${tool.name}`,
        );
      }
      const event: GuardEvent = {
        timestamp: now,
        toolName: tool.name,
        toolUseId: call.id,
        gate: 'input_validation',
        verdict: 'block',
        tier: 'safety',
        message: check.error,
      };
      fire('block', 'safety', 'input_validation', false);
      return {
        blocked: true,
        blockReason: check.error,
        blockGate: 'input_validation',
        injections: [],
        events: [event],
      };
    }
  }

  // Tier 1: Safety guards
  if (config.retryProtection !== false) {
    results.push(guardRetryProtection(tool, call, state.retryTracker));
  }
  if (config.addressSource !== false) {
    results.push(
      guardAddressSource(
        tool,
        call,
        conversationContext.recentUserText,
        identity?.contacts ?? [],
        identity?.walletAddress,
      ),
    );
  }
  if (config.assetIntent !== false) {
    results.push(guardAssetIntent(tool, call, conversationContext.recentUserText));
  }
  if (config.addressScope !== false) {
    results.push(
      guardAddressScope(
        tool,
        call,
        conversationContext.recentUserText,
        identity?.walletAddress,
      ),
    );
  }
  if (config.swapPreview !== false) {
    results.push(guardSwapPreview(tool, call, state.swapQuoteTracker));
  }
  if (config.irreversibility !== false) {
    results.push(guardIrreversibility(tool, call, conversationContext.fullText));
  }

  // Tier 2: Financial guards
  if (config.balanceValidation !== false) {
    results.push(guardBalanceValidation(tool, call, state.balanceTracker));
  }
  if (config.healthFactor) {
    results.push(guardHealthFactor(tool, call, state.lastHealthFactor, config.healthFactor));
  }
  if (config.largeTransfer) {
    results.push(guardLargeTransfer(tool, call, config.largeTransfer));
  }
  if (config.slippage !== false) {
    results.push(guardSlippage(tool, call, conversationContext.lastAssistantText));
  }

  // Tier 3: UX guards
  if (config.costWarning !== false) {
    results.push(guardCostWarning(tool, call, conversationContext.fullText));
  }

  // Process results — first block wins, collect all hints/warnings
  const events: GuardEvent[] = results
    .filter((r) => r.verdict !== 'pass')
    .map((r) => ({
      timestamp: now,
      toolName: tool.name,
      toolUseId: call.id,
      gate: r.gate,
      verdict: r.verdict,
      tier: r.tier,
      message: r.message,
    }));

  const block = results.find((r) => r.verdict === 'block');
  if (block) {
    // Fire once for the block winner; non-blocking warnings/hints from
    // earlier in the chain are surfaced too so the host sees the full
    // picture per turn.
    for (const r of results) {
      if (r.verdict === 'pass') continue;
      fire(r.verdict, r.tier, r.gate, false);
    }
    return {
      blocked: true,
      blockReason: block.message ?? `Blocked by ${block.gate}`,
      blockGate: block.gate,
      injections: [],
      events,
    };
  }

  const injections: GuardInjection[] = results
    .filter((r) => r.verdict === 'hint' || r.verdict === 'warn')
    .map((r) => ({
      _gate: r.gate,
      ...(r.verdict === 'hint' ? { _hint: r.message } : { _warning: r.message }),
    }));

  for (const r of results) {
    if (r.verdict === 'pass') continue;
    fire(r.verdict, r.tier, r.gate, r.verdict === 'hint' || r.verdict === 'warn');
  }

  return { blocked: false, injections, events };
}

// ---------------------------------------------------------------------------
// Post-execution hooks — update tracker state after tools run
// ---------------------------------------------------------------------------

export function updateGuardStateAfterToolResult(
  toolName: string,
  tool: Tool | undefined,
  input: unknown,
  result: unknown,
  isError: boolean,
  state: GuardRunnerState,
): void {
  if (isError) return;

  if (BALANCE_READ_TOOLS.has(toolName)) {
    state.balanceTracker.recordRead();
  }

  if (tool?.flags.mutating) {
    state.balanceTracker.recordWrite();
  }

  if (toolName === 'health_check' && result && typeof result === 'object') {
    const r = result as Record<string, unknown>;
    const hf = Number(r.healthFactor ?? r.health_factor ?? r.hf);
    if (!isNaN(hf) && hf > 0) {
      state.lastHealthFactor = hf;
    }
  }

  // Record successful swap_quote calls so guardSwapPreview can verify a
  // matching quote ran before swap_execute. We key off the *input* (not
  // the result) so the LLM can use the same params for both calls and
  // the match is unambiguous.
  if (toolName === 'swap_quote' && input && typeof input === 'object') {
    const i = input as { from?: unknown; to?: unknown; amount?: unknown };
    const from = typeof i.from === 'string' ? i.from : '';
    const to = typeof i.to === 'string' ? i.to : '';
    const amount = Number(i.amount ?? 0);
    if (from && to && amount > 0) {
      state.swapQuoteTracker.record({ from, to, amount });
    }
  }

  state.retryTracker.record(toolName, input, result);
}

// ---------------------------------------------------------------------------
// Conversation text extraction (for guard context)
// ---------------------------------------------------------------------------

export function extractConversationText(
  messages: Array<{ role: string; content: unknown }>,
): { fullText: string; lastAssistantText: string; recentUserText: string } {
  const textParts: string[] = [];
  const userParts: string[] = [];
  let lastAssistantText = '';

  for (const msg of messages) {
    if (!Array.isArray(msg.content)) continue;
    for (const block of msg.content as Array<Record<string, unknown>>) {
      if (block.type === 'text' && typeof block.text === 'string') {
        textParts.push(block.text);
        if (msg.role === 'assistant') {
          lastAssistantText = block.text;
        } else if (msg.role === 'user') {
          userParts.push(block.text);
        }
      }
    }
  }

  // Only the most recent ~10 user turns are considered an authoritative
  // source for `guardAddressSource`. Older addresses fall out of the
  // window so a user can't accidentally re-use a stale address from
  // 50 messages ago without re-pasting it.
  const RECENT_USER_TURN_WINDOW = 10;
  const recentUserParts = userParts.slice(-RECENT_USER_TURN_WINDOW);

  // [security] Cap each returned string at ~16KB before guards run any
  // regex over them. A few of the heuristic regexes downstream (e.g.
  // `/preview|...|confirm.*send|.../`, `/[\d,]+\.?\d*\s*(SUI|USDC|...)/`)
  // backtrack super-linearly on degenerate inputs — bounding the input
  // here keeps CodeQL's polynomial-regex alert at bay AND removes the
  // theoretical ReDoS surface from a maliciously crafted long message.
  // 16KB is comfortably larger than any realistic conversation slice we
  // need for the heuristic checks (which only look for keywords/numbers).
  const MAX_REGEX_INPUT = 16 * 1024;
  const cap = (s: string): string =>
    s.length <= MAX_REGEX_INPUT ? s : s.slice(-MAX_REGEX_INPUT);

  return {
    fullText: cap(textParts.join('\n')),
    lastAssistantText: cap(lastAssistantText),
    recentUserText: cap(recentUserParts.join('\n')),
  };
}
