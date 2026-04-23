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
export function guardVerdictToAction(verdict: GuardVerdict): GuardMetric['action'] {
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

  const hasPreview = /preview|here.s what|confirm.*send|looks? good/i.test(conversationText);
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

  const hasEstimate = /~?\$?[\d,]+\.?\d*\s*(SUI|USDC|USDT|WETH)/i.test(lastAssistantText)
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
  lastHealthFactor: number | null;
}

export function createGuardRunnerState(): GuardRunnerState {
  return {
    balanceTracker: new BalanceTracker(),
    retryTracker: new RetryTracker(),
    lastHealthFactor: null,
  };
}

export function runGuards(
  tool: Tool,
  call: PendingToolCall,
  state: GuardRunnerState,
  config: GuardConfig,
  conversationContext: { fullText: string; lastAssistantText: string },
  /**
   * [v1.4 Item 4] Optional per-guard observation hook. Fired exactly
   * once per non-`pass` guard verdict (i.e. for every event that ends
   * up in `events`/`injections`/`block`). Errors thrown by the host
   * are caught so a misbehaving collector can't break tool execution.
   */
  onGuardFired?: (guard: GuardMetric) => void,
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

  // Tier 0: Input validation (preflight) — runs first, invalid input = immediate block
  if (config.inputValidation !== false && tool.preflight) {
    const check = tool.preflight(call.input);
    if (!check.valid) {
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

  state.retryTracker.record(toolName, input, result);
}

// ---------------------------------------------------------------------------
// Conversation text extraction (for guard context)
// ---------------------------------------------------------------------------

export function extractConversationText(
  messages: Array<{ role: string; content: unknown }>,
): { fullText: string; lastAssistantText: string } {
  const textParts: string[] = [];
  let lastAssistantText = '';

  for (const msg of messages) {
    if (!Array.isArray(msg.content)) continue;
    for (const block of msg.content as Array<Record<string, unknown>>) {
      if (block.type === 'text' && typeof block.text === 'string') {
        textParts.push(block.text);
        if (msg.role === 'assistant') {
          lastAssistantText = block.text;
        }
      }
    }
  }

  return {
    fullText: textParts.join('\n'),
    lastAssistantText,
  };
}
