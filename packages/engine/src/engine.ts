import type {
  EngineConfig,
  EngineEvent,
  HarnessShape,
  Message,
  ContentBlock,
  PendingAction,
  SystemPrompt,
  Tool,
  ToolContext,
  PermissionResponse,
  ProviderEvent,
  StopReason,
} from './types.js';
import { toolsToDefinitions, findTool } from './tool.js';
import { TxMutex, runTools, withRetryStats, type PendingToolCall } from './orchestration.js';
import { getDefaultTools } from './tools/index.js';
import { getModifiableFields } from './tools/tool-modifiable-fields.js';
import { DEFAULT_SYSTEM_PROMPT } from './prompt.js';
import { clearPortfolioCacheFor } from './blockvision-prices.js';
import { getTelemetrySink } from './telemetry.js';
import { randomUUID } from 'node:crypto';
import { CostTracker, type CostSnapshot } from './cost.js';
import { describeAction } from './describe-action.js';
import { clampThinkingForEffort } from './thinking-budget.js';
import {
  type GuardConfig,
  type GuardRunnerState,
  type GuardEvent,
  createGuardRunnerState,
  runGuards,
  updateGuardStateAfterToolResult,
  extractConversationText,
  guardArtifactPreview,
  guardStaleData,
} from './guards.js';
import type { RecipeRegistry, Recipe } from './recipes/index.js';
import { ContextBudget, compactMessages } from './context.js';
import { microcompact } from './compact/microcompact.js';
import { resolvePermissionTier, resolveUsdValue, toolNameToOperation } from './permission-rules.js';
import { EarlyToolDispatcher } from './early-dispatcher.js';
import { TurnReadCache } from './turn-read-cache.js';
import {
  composeBundleFromToolResults,
  MAX_BUNDLE_OPS,
  VALID_PAIRS,
  checkValidPair,
} from './compose-bundle.js';

const DEFAULT_MAX_TURNS = 10;
const DEFAULT_MAX_TOKENS = 4096;

interface TurnAccumulator {
  text: string;
  stopReason: StopReason;
  assistantBlocks: ContentBlock[];
  pendingToolCalls: PendingToolCall[];
}

export class QueryEngine {
  private readonly provider: EngineConfig['provider'];
  private readonly tools: Tool[];
  private readonly systemPrompt: SystemPrompt;
  private readonly model: string | undefined;
  private readonly maxTurns: number;
  private readonly maxTokens: number;
  private readonly temperature: number | undefined;
  private readonly toolChoice: EngineConfig['toolChoice'];
  private readonly thinking: EngineConfig['thinking'];
  private readonly outputConfig: EngineConfig['outputConfig'];
  private readonly agent: unknown;
  private readonly mcpManager: unknown;
  private readonly walletAddress: string | undefined;
  private readonly suiRpcUrl: string | undefined;
  private serverPositions: EngineConfig['serverPositions'];
  private readonly positionFetcher: EngineConfig['positionFetcher'];
  private readonly env: Record<string, string> | undefined;
  private readonly txMutex = new TxMutex();
  private readonly costTracker: CostTracker;
  private readonly guardConfig: GuardConfig | undefined;
  private readonly guardState: GuardRunnerState;
  private readonly recipes: RecipeRegistry | undefined;
  private readonly contextBudget: ContextBudget;
  private readonly contextSummarizer: EngineConfig['contextSummarizer'];
  private readonly priceCache: Map<string, number> | undefined;
  private readonly permissionConfig: import('./permission-rules.js').UserPermissionConfig | undefined;
  // Saved contacts — consulted by `guardAddressSource` and the permission
  // tier resolver (sends to non-contact addresses always require confirm).
  private readonly contacts: ReadonlyArray<{ name: string; address: string }>;
  // [v1.4] Session-scoped autonomous spend tracking.
  private readonly sessionSpendUsd: number | undefined;
  private readonly onAutoExecuted: EngineConfig['onAutoExecuted'];
  private readonly onGuardFired: EngineConfig['onGuardFired'];
  // [v1.4 BlockVision] BlockVision Indexer API key + per-request portfolio
  // cache. Forwarded into every `ToolContext` build site so read tools
  // (`balance_check`, `portfolio_analysis`, future `token_prices`) hit the
  // shared host-paid endpoint and dedupe across each other within a turn.
  private readonly blockvisionApiKey: string | undefined;
  private readonly portfolioCache: EngineConfig['portfolioCache'];
  // [v1.5] See `EngineConfig.postWriteRefresh` — drives the post-write
  // synthetic read injection in `resumeWithToolResult`.
  private readonly postWriteRefresh: EngineConfig['postWriteRefresh'];
  private matchedRecipe: Recipe | null = null;

  private messages: Message[] = [];
  private abortController: AbortController | null = null;
  private guardEvents: GuardEvent[] = [];
  // [v0.46.8] Intra-turn dedup cache for read-only tool calls. See
  // `turn-read-cache.ts` for the full lifecycle. Key takeaway: the cache
  // lives across the host's pre-dispatch (`invokeReadTool`) and the
  // agent loop's LLM-driven tool execution within ONE user turn, then
  // clears on `turn_complete` or after any successful write.
  private readonly turnReadCache = new TurnReadCache();
  // [v0.46.8] Set to `true` when the agent loop yields `pending_action`
  // and returns (turn is paused awaiting user confirmation). The
  // submitMessage / resumeWithToolResult wrappers consult this flag in
  // their `finally` block so they DON'T clear the cache mid-turn — the
  // pending write may resume, and the cache should survive the pause.
  private turnPaused = false;

  constructor(config: EngineConfig) {
    this.provider = config.provider;
    this.agent = config.agent;
    this.mcpManager = config.mcpManager;
    this.walletAddress = config.walletAddress;
    this.suiRpcUrl = config.suiRpcUrl;
    this.serverPositions = config.serverPositions;
    this.positionFetcher = config.positionFetcher;
    this.env = config.env;
    this.model = config.model;
    this.maxTurns = config.maxTurns ?? DEFAULT_MAX_TURNS;
    this.maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.temperature = config.temperature;
    this.toolChoice = config.toolChoice;
    this.thinking = config.thinking;
    this.outputConfig = config.outputConfig;
    this.systemPrompt = config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    this.costTracker = new CostTracker(config.costTracker);
    this.guardConfig = config.guards;
    this.guardState = createGuardRunnerState();
    if (config.financialContextSeed) {
      const { balanceAt, healthFactor } = config.financialContextSeed;
      if (typeof balanceAt === 'number' && balanceAt > 0) {
        this.guardState.balanceTracker.recordReadAt(balanceAt);
      }
      if (typeof healthFactor === 'number') {
        this.guardState.lastHealthFactor = healthFactor;
      }
    }
    this.recipes = config.recipes;
    this.contextBudget = new ContextBudget(config.contextBudget);
    this.contextSummarizer = config.contextSummarizer;
    this.priceCache = config.priceCache;
    this.permissionConfig = config.permissionConfig;
    this.contacts = config.contacts ?? [];
    this.sessionSpendUsd = config.sessionSpendUsd;
    this.onAutoExecuted = config.onAutoExecuted;
    this.onGuardFired = config.onGuardFired;
    this.postWriteRefresh = config.postWriteRefresh;
    this.blockvisionApiKey = config.blockvisionApiKey;
    this.portfolioCache = config.portfolioCache;

    this.tools = config.tools ?? (config.agent ? getDefaultTools() : []);
  }

  /**
   * Submit a user message and stream engine events.
   *
   * Read-only tools execute inline. Write tools that need confirmation yield a
   * `pending_action` event and the stream ends — no persistent connection needed.
   * The caller should save messages + pendingAction to the session store, then
   * call `resumeWithToolResult()` after the user approves/denies and executes.
   *
   * [SPEC 8 v0.5.1 B3.2] Optional `options.harnessShape` + `options.harnessRationale`
   * cause a one-shot `harness_shape` event to be yielded BEFORE the agent loop
   * begins. The engine itself doesn't classify — the host calls
   * `classifyEffort()` (host already does this for thinking-budget routing)
   * and maps via `harnessShapeForEffort()` before calling `submitMessage`.
   * Hosts that don't pass `harnessShape` won't see the event (existing
   * pre-SPEC-8 hosts continue to work; their `TurnMetrics.harnessShape`
   * defaults to `'legacy'`).
   */
  async *submitMessage(
    prompt: string,
    options?: {
      harnessShape?: HarnessShape;
      harnessRationale?: string;
    },
  ): AsyncGenerator<EngineEvent> {
    if (this.costTracker.isOverBudget()) {
      yield { type: 'error', error: new Error('Session budget exceeded') };
      // [Phase 0 / SPEC 13] Pre-agentLoop budget exit. Engine.ts:1717
      // catches the post-agentLoop budget case via the in-loop helper.
      getTelemetrySink().counter('engine.turn_outcome', {
        entry: 'submit',
        outcome: 'error_budget',
      });
      return;
    }

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // RE-3.1: Match recipe before pushing message
    this.matchedRecipe = this.recipes?.match(prompt) ?? null;

    this.messages.push({
      role: 'user',
      content: [{ type: 'text', text: prompt }],
    });

    // [SPEC 8 v0.5.1 B3.2] Emit the per-turn harness shape declaration
    // BEFORE agentLoop runs. Single emission per `submitMessage` call;
    // `resumeWithToolResult` does NOT re-emit (resume continues the same
    // turn under the same shape). Empty rationale falls back to the
    // shape name so dashboards always have non-null context.
    if (options?.harnessShape) {
      yield {
        type: 'harness_shape',
        shape: options.harnessShape,
        rationale:
          options.harnessRationale && options.harnessRationale.trim().length > 0
            ? options.harnessRationale
            : `host-classified ${options.harnessShape}`,
      };
    }

    // [v0.46.8] Reset the pause flag at turn start. Any cache entries
    // populated by the host's pre-dispatch (`invokeReadTool`) BEFORE
    // this call MUST survive into the agent loop so LLM-driven calls
    // for the same tools dedup. We do NOT clear the cache here.
    this.turnPaused = false;
    try {
      yield* this.agentLoop(prompt, signal);
    } finally {
      // Turn boundary cleanup: drop the cache so the next user turn
      // starts with a clean slate. Skip when the turn was paused via
      // `pending_action` — the cache must survive the pause so the
      // resumed turn (which is the SAME turn) keeps deduping.
      if (!this.turnPaused) {
        this.turnReadCache.clear();
      }
    }
  }

  /**
   * Resume the conversation after a pending action is resolved.
   * Called with the user's approval/denial and optional client-side execution result.
   *
   * This is a separate HTTP request — no persistent connection from submitMessage.
   */
  async *resumeWithToolResult(
    action: PendingAction,
    response: PermissionResponse,
  ): AsyncGenerator<EngineEvent> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // [SPEC 7 P2.3 Layer 2] Bundle resume vs single-write resume.
    // - Bundle: action.steps is an array of N steps; response.stepResults
    //   carries one outcome per step. We push N `tool_result` blocks back
    //   into the conversation (one per step's tool_use_id) so the LLM has
    //   complete context for the bundle's atomic outcome.
    // - Single-write (legacy): action.steps is undefined; response.executionResult
    //   carries the singular outcome. Behavior unchanged from pre-P2.3.
    const isBundle = Array.isArray(action.steps) && action.steps.length > 0;

    // Build the write tool_result blocks (N for bundles, 1 for single-write).
    const writeResultBlocks: ContentBlock[] = [];
    if (isBundle) {
      const steps = action.steps!;
      const stepResults = response.stepResults ?? [];

      // Build a quick lookup so step ordering doesn't depend on host
      // ordering. Hosts that return stepResults in a different order
      // (or omit one) still produce correct LLM context.
      const resultByToolUseId = new Map(stepResults.map((r) => [r.toolUseId, r]));

      for (const step of steps) {
        if (response.approved) {
          const stepResult = resultByToolUseId.get(step.toolUseId);
          if (stepResult) {
            writeResultBlocks.push({
              type: 'tool_result',
              toolUseId: step.toolUseId,
              content: JSON.stringify(stepResult.result),
              isError: stepResult.isError,
            });
          } else {
            // [SPEC 7 P2.3 audit fix — BUG 11] Host approved the bundle
            // but didn't supply this step's result. Fail closed — treat
            // as an error so the LLM narrates "this step's outcome is
            // unknown" instead of fake-success. PTB execution is atomic
            // at the Sui layer, so an approved+missing-result is a host
            // bug; surfacing it to the LLM as an error is safer than
            // pretending success and locking the user into a bad state.
            writeResultBlocks.push({
              type: 'tool_result',
              toolUseId: step.toolUseId,
              content: JSON.stringify({
                error:
                  'Host omitted this step\'s execution result. Treating ' +
                  'as failure — actual on-chain state is unknown. Re-check ' +
                  'wallet via balance_check before re-attempting.',
                _hostBugMissingStepResult: true,
              }),
              isError: true,
            });
          }
        } else {
          writeResultBlocks.push({
            type: 'tool_result',
            toolUseId: step.toolUseId,
            content: JSON.stringify({ error: 'User declined this action' }),
            isError: true,
          });
        }
      }
    } else {
      writeResultBlocks.push(
        response.approved
          ? {
              type: 'tool_result',
              toolUseId: action.toolUseId,
              content: JSON.stringify(response.executionResult ?? { success: true }),
              isError: false,
            }
          : {
              type: 'tool_result',
              toolUseId: action.toolUseId,
              content: JSON.stringify({ error: 'User declined this action' }),
              isError: true,
            },
      );
    }

    // Reconstruct the full turn atomically:
    // 1. Push the assistant message that was deferred during pending_action
    // 2. Push ALL tool_results (completed reads + writes) in one user message
    if (action.assistantContent?.length) {
      this.messages.push({ role: 'assistant', content: action.assistantContent });
    }

    const allResults: ContentBlock[] = [
      ...(action.completedResults ?? []).map((r) => ({
        type: 'tool_result' as const,
        toolUseId: r.toolUseId,
        content: r.content,
        isError: r.isError,
      })),
      ...writeResultBlocks,
    ];

    this.messages.push({ role: 'user', content: allResults });

    // Yield a `tool_result` event per write step (or single write for
    // legacy). Hosts use these to render per-step outcome rows in the
    // PermissionCard UI.
    if (isBundle) {
      const steps = action.steps!;
      const stepResults = response.stepResults ?? [];
      const resultByToolUseId = new Map(stepResults.map((r) => [r.toolUseId, r]));
      for (const step of steps) {
        const stepResult = resultByToolUseId.get(step.toolUseId);
        // [SPEC 7 P2.3 audit fix — BUG 11] When approved+missing-result,
        // mirror the writeResultBlocks fail-closed semantics on the event
        // stream: emit an error event so host UI flags the step as failed
        // (not pretend-success).
        let eventResult: unknown;
        let eventIsError: boolean;
        if (!response.approved) {
          eventResult = { error: 'User declined this action' };
          eventIsError = true;
        } else if (stepResult) {
          eventResult = stepResult.result;
          eventIsError = stepResult.isError;
        } else {
          eventResult = {
            error: 'Host omitted this step\'s execution result.',
            _hostBugMissingStepResult: true,
          };
          eventIsError = true;
        }
        yield {
          type: 'tool_result',
          toolName: step.toolName,
          toolUseId: step.toolUseId,
          result: eventResult,
          isError: eventIsError,
        };
      }
    } else {
      yield {
        type: 'tool_result',
        toolName: action.toolName,
        toolUseId: action.toolUseId,
        result: response.approved
          ? (response.executionResult ?? { success: true })
          : { error: 'User declined this action' },
        isError: !response.approved,
      };
    }

    if (!response.approved) {
      yield { type: 'turn_complete', stopReason: 'end_turn' };
      // [Phase 0 / SPEC 13] resumeWithToolResult decline path — turn
      // ends here without entering agentLoop. Counter mirrors the
      // in-loop turn_complete shape but tags `outcome=pending_action_decline`
      // to disambiguate the user-declined case from a natural end_turn.
      getTelemetrySink().counter('engine.turn_outcome', {
        entry: 'resume',
        outcome: 'pending_action_decline',
      });
      this.turnReadCache.clear();
      return;
    }

    // [v0.46.8] A successful approved write MUTATES on-chain state, so
    // any read-tool result cached during the pre-pause portion of this
    // turn is now stale. Drop it before the post-write refresh fires —
    // refresh tools will re-execute and re-populate with fresh data.
    this.turnReadCache.clear();

    // [v1.5] Post-write refresh — eliminate the "LLM invents a wallet
    // total in the post-write narration" hallucination class by
    // physically injecting authoritative ground truth into the
    // conversation BEFORE the LLM gets to narrate. Tools are configured
    // per write via `EngineConfig.postWriteRefresh`. Errors are
    // non-fatal: we still advance to agentLoop so the user gets *some*
    // narration even if RPC blips.
    yield* this.runPostWriteRefresh(action, response, signal);

    // [v0.46.8] Reset the pause flag and wrap the resumed agentLoop in
    // try/finally for cache cleanup, mirroring submitMessage. The
    // post-write refresh above re-populated the cache with fresh
    // post-write reads; agentLoop may add more during follow-up tool
    // calls; finally clears it at turn end (skipping when paused).
    this.turnPaused = false;
    try {
      yield* this.agentLoop(null, signal, false);
    } finally {
      if (!this.turnPaused) {
        this.turnReadCache.clear();
      }
    }
  }

  /**
   * [v1.5] Auto-run configured read tools after a successful write,
   * push their results into the conversation, and yield `tool_result`
   * events so hosts/UI render them in the timeline. See
   * `EngineConfig.postWriteRefresh`.
   *
   * Pure injection — no LLM call here. The next `agentLoop` turn sees
   * the fresh tool results and narrates from them.
   */
  private async *runPostWriteRefresh(
    action: PendingAction,
    response: PermissionResponse,
    signal: AbortSignal,
  ): AsyncGenerator<EngineEvent> {
    // [SPEC 7 P2.3 Layer 2] Bundle-aware refresh.
    // - Bundle: union of refresh tools across every step's
    //   `postWriteRefresh` entry, deduped (Set semantics).
    // - Single-write: per-tool list as before.
    const isBundle = Array.isArray(action.steps) && action.steps.length > 0;
    const refreshSet = new Set<string>();
    if (isBundle) {
      for (const step of action.steps!) {
        const stepRefresh = this.postWriteRefresh?.[step.toolName];
        if (stepRefresh) for (const t of stepRefresh) refreshSet.add(t);
      }
    } else {
      const singleRefresh = this.postWriteRefresh?.[action.toolName];
      if (singleRefresh) for (const t of singleRefresh) refreshSet.add(t);
    }
    if (refreshSet.size === 0) return;
    const refreshList = Array.from(refreshSet);

    // Refresh only on confirmed success. For bundles, treat as failed
    // when ANY step's stepResult.isError is true (atomic semantics —
    // PTB execution fails as a whole, so partial success is impossible
    // on-chain; if the host reports any step error we honor it).
    const writeFailed = (() => {
      if (isBundle) {
        const stepResults = response.stepResults ?? [];
        return stepResults.some((r) => r.isError);
      }
      const exec = response.executionResult;
      return (
        exec != null &&
        typeof exec === 'object' &&
        'success' in exec &&
        (exec as { success?: unknown }).success === false
      );
    })();
    if (writeFailed) return;

    // Resolve & filter — silently drop unknown / non-readonly entries
    // so config drift between host & engine never breaks resume.
    const refreshTools = refreshList
      .map((name) => findTool(this.tools, name))
      .filter((t): t is Tool =>
        t !== undefined && t.isReadOnly && t.isConcurrencySafe,
      );
    if (refreshTools.length === 0) return;

    const context: ToolContext = {
      agent: this.agent,
      mcpManager: this.mcpManager,
      walletAddress: this.walletAddress,
      suiRpcUrl: this.suiRpcUrl,
      serverPositions: this.serverPositions,
      positionFetcher: this.positionFetcher,
      env: this.env,
      signal,
      priceCache: this.priceCache,
      permissionConfig: this.permissionConfig,
      sessionSpendUsd: this.sessionSpendUsd,
      blockvisionApiKey: this.blockvisionApiKey,
      portfolioCache: this.portfolioCache,
    };

    // [v1.4 — Day 2.5] Bust both portfolio caches for this address before
    // the 1.5s Sui-RPC-indexer-lag delay. The v1.4 BlockVision swap
    // introduced two caching layers — `ToolContext.portfolioCache`
    // (per-request Map, no TTL) and the module-level cache in
    // `blockvision-prices.ts` (60s TTL). Without explicit invalidation,
    // `runPostWriteRefresh` re-runs `balance_check`, which calls
    // `fetchAddressPortfolio()`, which returns the *cached pre-write
    // snapshot* — defeating the entire point of post-write refresh and
    // resurrecting the v0.46.16-era class of "I deposited 20 USDC but
    // the agent says my balance didn't change" bug. Pre-v1.4 the same
    // path called `fetchWalletCoins` (Sui RPC, no cache) so the 1.5s
    // delay alone was sufficient; post-v1.4 we MUST invalidate or no
    // amount of waiting will help.
    //
    // [PR 1 — v0.55] `clearPortfolioCacheFor` is now async (Upstash-backed
    // when Audric injects the store) — MUST be awaited or the next
    // `balance_check` races the Redis delete and refetches the stale
    // pre-write balance. Pre-PR-1 it was a sync Map.delete and
    // fire-and-forget worked; under Redis the network round-trip is
    // load-bearing.
    if (this.walletAddress) {
      this.portfolioCache?.delete(this.walletAddress);
      await clearPortfolioCacheFor(this.walletAddress);
    }

    // [v0.46.16] Sui RPC indexer lag — `executeTransactionBlock` returns
    // as soon as the tx is included in a checkpoint, but the public RPC's
    // owned-coin index trails by ~500-1500ms. Without this delay the
    // injected `balance_check` returns the *pre-write* snapshot and the
    // LLM either trusts it (wrong) or has to reason around it (noisy).
    // 1500ms catches ~99% of cases on Sui mainnet; the refresh is async
    // anyway so this doesn't block the UI's pending_action resolution.
    if (!signal.aborted) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 1500);
        signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
      });
    }
    if (signal.aborted) return;

    // Run all refreshes in parallel — they're read-only and target
    // different RPC endpoints (wallet, NAVI positions, health). The
    // common case (1-3 tools) finishes well under 1s.
    const idStem = `pwr_${action.toolUseId.slice(-6)}`;
    const refreshes = await Promise.all(
      refreshTools.map(async (tool, idx) => {
        const id = `${idStem}_${idx}_${tool.name}`;
        try {
          const parsed = tool.inputSchema.safeParse({});
          if (!parsed.success) {
            return {
              tool,
              id,
              isError: true as const,
              data: {
                error: `Post-write refresh: invalid input for ${tool.name}`,
              },
              attemptCount: undefined as number | undefined,
            };
          }
          // [SPEC 8 v0.5.1 B3.2] Per-tool retry counter — each refresh
          // gets its own context override so attemptCount doesn't bleed
          // across the parallel batch.
          const { context: toolCtx, readAttemptCount } = withRetryStats(context);
          const result = await tool.call(parsed.data, toolCtx);
          return {
            tool,
            id,
            isError: false as const,
            data: result.data,
            attemptCount: readAttemptCount(),
          };
        } catch (err) {
          return {
            tool,
            id,
            isError: true as const,
            data: {
              error:
                err instanceof Error
                  ? err.message
                  : 'Post-write refresh failed',
            },
            attemptCount: undefined as number | undefined,
          };
        }
      }),
    );

    // Push synthetic conversation pair so the LLM sees:
    //   assistant(refresh tool_uses) → user(refresh tool_results)
    // Anthropic accepts back-to-back assistant/user blocks; this is the
    // same shape `buildSyntheticPrefetch` uses at session start.
    const refreshUses: ContentBlock[] = refreshes.map((r) => ({
      type: 'tool_use',
      id: r.id,
      name: r.tool.name,
      input: {},
    }));
    this.messages.push({ role: 'assistant', content: refreshUses });

    const refreshResults: ContentBlock[] = refreshes.map((r) => ({
      type: 'tool_result',
      toolUseId: r.id,
      content: typeof r.data === 'string' ? r.data : JSON.stringify(r.data),
      isError: r.isError,
    }));
    this.messages.push({ role: 'user', content: refreshResults });

    // Yield events so hosts log them in `TurnMetrics.toolsCalled[]` and
    // the UI renders the refreshed cards in-line. Also populate the
    // intra-turn cache so any LLM-driven `tool_use` for the same
    // (name, input) during the resumed agent loop dedups instead of
    // double-rendering on top of the refresh card.
    for (const r of refreshes) {
      if (!r.isError) {
        this.turnReadCache.set(
          TurnReadCache.keyFor(r.tool.name, {}),
          { result: r.data, sourceToolUseId: r.id },
        );
      }
      yield {
        type: 'tool_result',
        toolName: r.tool.name,
        toolUseId: r.id,
        result: r.data,
        isError: r.isError,
        wasPostWriteRefresh: true,
        ...(r.attemptCount !== undefined ? { attemptCount: r.attemptCount } : {}),
      };
    }
  }

  interrupt(): void {
    this.abortController?.abort();
  }

  getMessages(): readonly Message[] {
    return this.messages;
  }

  /**
   * [SPEC 7 P2.4b] Read-only access to the engine's tool registry.
   * Exposed so out-of-band utilities like `regenerateBundle` can call
   * `composeBundleFromToolResults({ tools: engine.getTools(), ... })`
   * without forcing the host to hand-thread the tool array. Mirrors
   * `getMessages()` access pattern.
   */
  getTools(): readonly Tool[] {
    return this.tools;
  }

  getMatchedRecipe(): Recipe | null {
    return this.matchedRecipe;
  }

  getContextBudget(): ContextBudget {
    return this.contextBudget;
  }

  reset(): void {
    this.messages = [];
    this.costTracker.reset();
    this.contextBudget.reset();
    this.guardEvents = [];
    this.matchedRecipe = null;
  }

  getGuardEvents(): readonly GuardEvent[] {
    return this.guardEvents;
  }

  loadMessages(messages: Message[]): void {
    this.messages = [...messages];
  }

  /**
   * [v0.46.7] Run a read-only tool out-of-band, using the engine's tool
   * registry and ToolContext. Used by hosts to deterministically pre-dispatch
   * tools based on user-message intent (e.g. always call `balance_check` when
   * the user says "what's my net worth?", regardless of whether the LLM would
   * have otherwise re-called it).
   *
   * The host is responsible for:
   *  - Streaming the synthetic `tool_start` + `tool_result` events to the UI
   *    (so cards render as if the LLM had called the tool).
   *  - Appending matching `tool_use` + `tool_result` ContentBlocks to the
   *    engine's message history via `loadMessages([...getMessages(), ...synth])`
   *    BEFORE calling `submitMessage`, so the LLM sees the fresh data and
   *    doesn't re-call.
   *
   * Throws if the tool isn't registered, isn't read-only, or fails input
   * validation. Tool execution errors are returned as `{ data, isError: true }`
   * for the caller to handle (typically: skip the injection so the LLM falls
   * back to its normal flow).
   */
  async invokeReadTool(
    toolName: string,
    input: unknown,
    options: { signal?: AbortSignal } = {},
  ): Promise<{ data: unknown; isError: boolean }> {
    const tool = findTool(this.tools, toolName);
    if (!tool) throw new Error(`invokeReadTool: tool not found: ${toolName}`);
    if (!tool.isReadOnly) {
      throw new Error(`invokeReadTool: tool is not read-only: ${toolName} (write tools must go through the permission gate)`);
    }

    const parsed = tool.inputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(
        `invokeReadTool: invalid input for ${toolName}: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
      );
    }

    // [v0.46.8] Intra-turn cache: if the same tool was already invoked
    // (either via a prior `invokeReadTool` call or by the LLM mid-turn),
    // return the cached result without re-fetching. Makes pre-dispatch
    // idempotent — calling `invokeReadTool('balance_check', {})` twice
    // back-to-back hits RPC once, not twice.
    const cacheKey = TurnReadCache.keyFor(toolName, parsed.data);
    const cached = this.turnReadCache.get(cacheKey);
    if (cached) {
      return { data: cached.result, isError: false };
    }

    const signal = options.signal ?? new AbortController().signal;
    const context: ToolContext = {
      agent: this.agent,
      mcpManager: this.mcpManager,
      walletAddress: this.walletAddress,
      suiRpcUrl: this.suiRpcUrl,
      serverPositions: this.serverPositions,
      positionFetcher: this.positionFetcher,
      env: this.env,
      signal,
      priceCache: this.priceCache,
      permissionConfig: this.permissionConfig,
      sessionSpendUsd: this.sessionSpendUsd,
      blockvisionApiKey: this.blockvisionApiKey,
      portfolioCache: this.portfolioCache,
    };

    try {
      const result = await tool.call(parsed.data, context);
      // Cache the successful result so a subsequent LLM-driven
      // `tool_use` for the same (name, input) hits the dedup path in
      // the agent loop and the host doesn't render a duplicate card.
      this.turnReadCache.set(cacheKey, {
        result: result.data,
        sourceToolUseId: 'invokeReadTool',
      });
      return { data: result.data, isError: false };
    } catch (err) {
      // Errors are NOT cached — the next call should retry, not see a
      // stale failure.
      return {
        data: { error: err instanceof Error ? err.message : 'Tool execution failed' },
        isError: true,
      };
    }
  }

  setServerPositions(data: EngineConfig['serverPositions']): void {
    this.serverPositions = data;
  }

  getUsage(): CostSnapshot {
    return this.costTracker.getSnapshot();
  }

  // ---------------------------------------------------------------------------
  // Core agent loop — shared by submitMessage and resumeWithToolResult
  // ---------------------------------------------------------------------------

  /**
   * Run the LLM → tool → LLM loop. When a write tool needs confirmation,
   * yields `pending_action` and returns immediately (stream ends cleanly).
   *
   * @param freshPrompt - The original user prompt (for corrupt-history retry). Null on resume.
   */
  private async *agentLoop(
    freshPrompt: string | null,
    signal: AbortSignal,
    applyToolChoice = true,
  ): AsyncGenerator<EngineEvent> {
    const context: ToolContext = {
      agent: this.agent,
      mcpManager: this.mcpManager,
      walletAddress: this.walletAddress,
      suiRpcUrl: this.suiRpcUrl,
      serverPositions: this.serverPositions,
      positionFetcher: this.positionFetcher,
      env: this.env,
      signal,
      priceCache: this.priceCache,
      permissionConfig: this.permissionConfig,
      sessionSpendUsd: this.sessionSpendUsd,
      blockvisionApiKey: this.blockvisionApiKey,
      portfolioCache: this.portfolioCache,
    };

    let turns = 0;
    let hasRetriedWithCleanHistory = false;
    let turnStartMs = Date.now();

    // [Phase 0 / SPEC 13 / 2026-05-03 evening] agentLoop exit-point
    // instrumentation. Every termination of this generator emits a
    // structured `engine.turn_outcome` counter with:
    //   - `entry`: 'submit' (user message) | 'resume' (host post-write)
    //   - `outcome`: which exit path fired (see `LoopOutcome` below)
    //   - `turns`: how many LLM round-trips happened in this loop
    //   - `durationMs`: wall-clock time from loop entry to exit
    //
    // The host pairs this with stream-close logging in chat/resume
    // routes + useEngine reader so we can diagnose the "Response
    // interrupted · retry" bug from real traffic. Three failure modes
    // we're looking for:
    //   (a) outcome=error_* emitted but host stream closed without an
    //       `error` event reaching the client (engine→host plumbing
    //       gap).
    //   (b) outcome=turn_complete OR outcome=pending_action_* emitted
    //       but client `useEngine` flagged the message as interrupted
    //       (SSE flush gap, CDN cut, or a client gate bug).
    //   (c) NO outcome counter emitted at all (silent generator return
    //       — should be unreachable; if it fires, an unhandled return
    //       path slipped past the recordTurnOutcome calls below).
    const recordTurnOutcome = (
      outcome:
        | 'turn_complete'
        | 'pending_action_single'
        | 'pending_action_bundle'
        | 'pending_action_decline'
        | 'error_aborted'
        | 'error_budget'
        | 'error_other'
        | 'max_turns'
        | 'guard_block_continue'
        | 'pair_not_whitelisted_continue'
        | 'max_bundle_ops_continue',
      extra: { stopReason?: string } = {},
    ): void => {
      const tags: Record<string, string> = {
        entry: freshPrompt !== null ? 'submit' : 'resume',
        outcome,
      };
      if (extra.stopReason) tags.stopReason = extra.stopReason;
      const sink = getTelemetrySink();
      sink.counter('engine.turn_outcome', tags);
      sink.histogram('engine.turn_duration_ms', Date.now() - turnStartMs, tags);
      sink.gauge('engine.turn_turns_used', turns, tags);
    };

    // [SPEC 7 P2.3 Layer 2 — P2.6 Gate C fix] Track every read tool that lands
    // during the user's turn so the bundle composer can populate
    // `regenerateInput.toolUseIds` when ≥2 confirm-tier bundleable writes
    // follow. Scoped to the entire `agentLoop` invocation (one user message),
    // NOT to a single LLM response — the canonical bundle pattern is "LLM
    // response 1 emits the read, LLM response 2 emits the writes", and
    // resetting per-iteration means response 2 sees an empty `readResults`
    // and emits `canRegenerate: false`. Contributing reads are filtered to
    // the canonical regeneratable set inside the composer; we collect
    // everything here.
    const turnReadToolResults: Array<{
      toolUseId: string;
      toolName: string;
      timestamp: number;
    }> = [];

    while (turns < this.maxTurns) {
      if (signal.aborted) {
        yield { type: 'error', error: new Error('Aborted') };
        recordTurnOutcome('error_aborted');
        return;
      }

      turns++;
      turnStartMs = Date.now();
      const toolDefs = toolsToDefinitions(this.tools);

      const acc: TurnAccumulator = {
        text: '',
        stopReason: 'end_turn',
        assistantBlocks: [],
        pendingToolCalls: [],
      };

      const dispatcher = new EarlyToolDispatcher(this.tools, context, this.turnReadCache);

      try {
        // B.3: Zero-cost dedup of identical tool calls every turn.
        // [v1.4 Item 4] Emit a synthetic tool_result event for each
        // deduped prior call so hosts can flip `resultDeduped` on the
        // matching `TurnMetrics.toolsCalled[]` row. Marker shape is
        // explicit so collectors don't double-count emissions.
        // [v1.5.1] Pass the tool registry so microcompact honors per-tool
        // `cacheable` flags. Mutable-state reads (balance_check etc.)
        // never dedupe, so post-write refreshes always surface fresh
        // data instead of a "[Same result as call #N]" marker that the
        // LLM previously misread as "stale snapshot, fall back to math".
        const microcompacted = microcompact(this.messages, this.tools);
        this.messages = microcompacted;
        for (const dedupedId of microcompacted.dedupedToolUseIds) {
          yield {
            type: 'tool_result',
            toolName: '__deduped__',
            toolUseId: dedupedId,
            result: null,
            isError: false,
            resultDeduped: true,
          };
        }

        // RE-3.3: Compact context if budget is exceeded
        if (this.contextBudget.shouldCompact()) {
          this.messages = await compactMessages(this.messages, {
            maxTokens: 100_000,
            keepRecentCount: 8,
            summarizer: this.contextSummarizer,
          });
          // [v1.4 Item 4] Notify hosts that compaction fired this turn.
          // `compactMessages` stays a pure function; the event keeps the
          // signal observable without coupling.
          yield { type: 'compaction' };
        }

        this.messages = validateHistory(this.messages);

        if (process.env.NODE_ENV !== 'test') {
          const summary = this.messages.map((m, idx) => {
            const blocks = m.content.map((b) => {
              if (b.type === 'text') return `text(${b.text.slice(0, 40)}…)`;
              if (b.type === 'thinking') return `thinking(${b.thinking.length}ch)`;
              if (b.type === 'redacted_thinking') return `redacted_thinking`;
              if (b.type === 'tool_use') return `tool_use:${b.id.slice(-8)}/${b.name}`;
              return `tool_result:${(b as { toolUseId: string }).toolUseId.slice(-8)}`;
            });
            return `  [${idx}] ${m.role}: [${blocks.join(', ')}]`;
          });
          console.log(`[engine] provider.chat turn=${turns} msgs=${this.messages.length}\n${summary.join('\n')}`);
        }

        const thinkingEnabled = this.thinking && this.thinking.type !== 'disabled';
        // Anthropic requires toolChoice 'auto' (not 'any') when thinking is enabled
        const effectiveToolChoice = thinkingEnabled
          ? ((applyToolChoice && turns === 1) ? 'auto' as const : undefined)
          : ((applyToolChoice && turns === 1) ? this.toolChoice : undefined);

        // RE-3.1: Inject matched recipe context into system prompt for this turn
        let effectivePrompt = this.systemPrompt;
        if (this.matchedRecipe && this.recipes) {
          const recipeCtx = this.recipes.toPromptContext(this.matchedRecipe);
          if (typeof effectivePrompt === 'string') {
            effectivePrompt = `${effectivePrompt}\n\n${recipeCtx}`;
          } else if (Array.isArray(effectivePrompt)) {
            effectivePrompt = [
              ...effectivePrompt,
              { type: 'text' as const, text: recipeCtx },
            ];
          }
        }

        // [SPEC 8 v0.5.1] HARD-cap thinking budget per effort tier.
        // lean=disabled, standard=8k, rich=16k, max=32k. Hosts that pass
        // a smaller budget keep it; the engine only ever clamps DOWN.
        // See thinking-budget.ts for the full rationale.
        const cappedThinking = clampThinkingForEffort(this.thinking, this.outputConfig?.effort);

        const stream = this.provider.chat({
          messages: this.messages,
          systemPrompt: effectivePrompt,
          tools: toolDefs,
          model: this.model,
          maxTokens: this.maxTokens,
          temperature: this.temperature,
          toolChoice: effectiveToolChoice,
          thinking: cappedThinking,
          outputConfig: this.outputConfig,
          signal,
        });

        for await (const event of stream) {
          yield* this.handleProviderEvent(event, acc, dispatcher);
        }
      } catch (err) {
        if (freshPrompt && !hasRetriedWithCleanHistory && isCorruptHistoryError(err)) {
          hasRetriedWithCleanHistory = true;
          console.warn('[engine] Corrupt session history detected, resetting to fresh conversation');
          this.messages = [
            { role: 'user', content: [{ type: 'text', text: freshPrompt }] },
          ];
          turns--;
          continue;
        }
        throw err;
      }

      if (acc.text) {
        acc.assistantBlocks.push({ type: 'text', text: acc.text });
      }

      // B.1: Collect results from early-dispatched tools
      const earlyResultBlocks: ContentBlock[] = [];
      if (dispatcher.hasPending()) {
        if (signal.aborted) {
          dispatcher.abort();
        }
        for await (const earlyEvent of dispatcher.collectResults()) {
          if (earlyEvent.type === 'tool_result') {
            if (!earlyEvent.isError) {
              const warning = flagSuspiciousResult(earlyEvent.toolName, earlyEvent.result);
              if (warning) {
                const flagged = {
                  ...earlyEvent,
                  result: typeof earlyEvent.result === 'object' && earlyEvent.result
                    ? { ...earlyEvent.result as Record<string, unknown>, _warning: warning }
                    : { data: earlyEvent.result, _warning: warning },
                };
                yield flagged;
                earlyResultBlocks.push({
                  type: 'tool_result',
                  toolUseId: flagged.toolUseId,
                  content: JSON.stringify(flagged.result),
                  isError: flagged.isError,
                });
                continue;
              }
            }
            const tool = findTool(this.tools, earlyEvent.toolName);
            // Pull the original input back off the dispatcher so guard state
            // (e.g. SwapQuoteTracker) can key off it. Passing `null` here was
            // a silent regression that made guardSwapPreview block every
            // swap_execute even after a successful early-dispatched
            // swap_quote.
            const earlyInput = dispatcher.getInputById(earlyEvent.toolUseId) ?? null;
            updateGuardStateAfterToolResult(
              earlyEvent.toolName, tool, earlyInput, earlyEvent.result, earlyEvent.isError, this.guardState,
            );

            let enrichedResult = earlyEvent.result;
            if (this.guardConfig && !earlyEvent.isError && tool) {
              const artifactInj = this.guardConfig.artifactPreview !== false
                ? guardArtifactPreview(earlyEvent.result)
                : null;
              const staleInj = this.guardConfig.staleData !== false
                ? guardStaleData(tool.flags)
                : null;
              const allInjections = [
                ...(artifactInj ? [artifactInj] : []),
                ...(staleInj ? [staleInj] : []),
              ];
              if (allInjections.length > 0 && typeof enrichedResult === 'object' && enrichedResult) {
                enrichedResult = { ...enrichedResult as Record<string, unknown>, _guards: allInjections };
              }
            }

            const finalEvent = enrichedResult !== earlyEvent.result
              ? { ...earlyEvent, result: enrichedResult }
              : earlyEvent;

            yield finalEvent;

            if (!finalEvent.isError) {
              const r = finalEvent.result as Record<string, unknown> | null;
              if (r && r.__canvas === true) {
                yield {
                  type: 'canvas',
                  template: String(r.template ?? ''),
                  title: String(r.title ?? ''),
                  data: r.templateData ?? null,
                  toolUseId: finalEvent.toolUseId,
                };
              }
              // [SPEC 8 v0.5.1] Side-channel todo_update event paired to
              // every update_todo tool result. Mirrors the __canvas
              // pattern above; see tools/update-todo.ts for rationale.
              if (r && r.__todoUpdate === true && Array.isArray(r.items)) {
                yield {
                  type: 'todo_update',
                  items: r.items as { id: string; label: string; status: 'pending' | 'in_progress' | 'completed' }[],
                  toolUseId: finalEvent.toolUseId,
                };
              }
            }

            // [SPEC 7 P2.3 Layer 2] Track successful reads for bundle
            // composition. The composer filters to the canonical
            // regeneratable set; collecting all reads here is fine.
            if (!finalEvent.isError && tool && tool.isReadOnly) {
              turnReadToolResults.push({
                toolUseId: finalEvent.toolUseId,
                toolName: finalEvent.toolName,
                timestamp: Date.now(),
              });
            }

            earlyResultBlocks.push({
              type: 'tool_result',
              toolUseId: finalEvent.toolUseId,
              content: JSON.stringify(finalEvent.result),
              isError: finalEvent.isError,
            });
          }
        }
      }

      const hasEarlyResults = earlyResultBlocks.length > 0;
      const hasRemainingCalls = acc.pendingToolCalls.length > 0;

      if (!hasEarlyResults && !hasRemainingCalls) {
        this.messages.push({ role: 'assistant', content: acc.assistantBlocks });
        getTelemetrySink().histogram('anthropic.latency_ms', Date.now() - turnStartMs);
        yield { type: 'turn_complete', stopReason: acc.stopReason };
        recordTurnOutcome('turn_complete', { stopReason: acc.stopReason });
        return;
      }

      if (signal.aborted) {
        this.messages.push({ role: 'assistant', content: acc.assistantBlocks });
        if (hasEarlyResults) {
          this.messages.push({ role: 'user', content: earlyResultBlocks });
        }
        this.addErrorResults(acc.pendingToolCalls, 'Aborted');
        yield { type: 'error', error: new Error('Aborted') };
        recordTurnOutcome('error_aborted');
        return;
      }

      // --- Permission gate (only for non-early-dispatched calls) ---
      // [SPEC 7 P2.3 Layer 2] Refactored from `pendingWrite` singular →
      // `pendingWrites` array. The pre-P2.3 loop did `pendingWrite = ...;
      // break;` on the first confirm-tier write, silently dropping any
      // siblings (gap G2 in spec v0.3.1). Now we collect ALL confirm
      // writes; bundle composition runs AFTER guards (below) so the
      // bundleable + non-bundleable partition can be made on guard-passed
      // calls only.
      const approved: PendingToolCall[] = [];
      const toolResultBlocks: ContentBlock[] = [...earlyResultBlocks];
      const pendingWrites: Array<{ call: PendingToolCall; tool: Tool }> = [];

      for (const call of acc.pendingToolCalls) {
        const tool = findTool(this.tools, call.name);

        // [v0.46.8] Intra-turn dedup for read-only tools. If the host
        // pre-dispatched this tool (via `invokeReadTool`) or the LLM
        // already called it earlier in the same turn, skip execution
        // and emit a deduped `tool_result` so the host can suppress
        // a duplicate card render. The LLM still gets a valid
        // `tool_result` block keyed to ITS `tool_use_id`, satisfying
        // the Anthropic protocol requirement that every `tool_use`
        // be answered by a matching `tool_result`.
        if (tool && tool.isReadOnly) {
          const cacheKey = TurnReadCache.keyFor(call.name, call.input);
          const cached = this.turnReadCache.get(cacheKey);
          if (cached) {
            yield {
              type: 'tool_result',
              toolName: call.name,
              toolUseId: call.id,
              result: cached.result,
              isError: false,
              resultDeduped: true,
            };
            toolResultBlocks.push({
              type: 'tool_result',
              toolUseId: call.id,
              content: JSON.stringify(cached.result),
              isError: false,
            });
            continue;
          }
        }

        const needsConfirmation = (() => {
          if (!tool || tool.isReadOnly) return false;
          if (tool.permissionLevel === 'explicit') return true;
          // [v0.46.15] Honor `permissionLevel: 'auto'` on write tools even
          // when no agent is present. These are custom tools (e.g. audric's
          // server-owned save_contact / savings_goal_*) that persist via
          // their own data layer (Prisma) and never need on-chain signing.
          // They explicitly opted into auto by setting the permission
          // level — gating them on `context.agent` here silently broke
          // every audric Prisma-backed write tool. Tools that DO need
          // an agent must NOT set permissionLevel: 'auto'.
          if (tool.permissionLevel === 'auto' && !toolNameToOperation(call.name)) {
            return false;
          }
          // Without an agent, write tools can't execute server-side —
          // always require confirmation so the client handles execution.
          if (!context.agent && !tool.isReadOnly) return true;
          if (context.permissionConfig && context.priceCache) {
            const operation = toolNameToOperation(call.name);
            if (operation) {
              const usdValue = resolveUsdValue(call.name, call.input as Record<string, unknown>, context.priceCache);
              const callInput = call.input as Record<string, unknown>;
              // [v1.4] sessionSpendUsd enforces daily cap.
              // Send-safety: a raw 0x recipient with no contact match
              // forces `confirm` regardless of amount (see permission-rules).
              const tier = resolvePermissionTier(
                operation,
                usdValue,
                context.permissionConfig,
                context.sessionSpendUsd,
                operation === 'send'
                  ? { to: typeof callInput.to === 'string' ? callInput.to : undefined, contacts: this.contacts }
                  : undefined,
              );
              return tier !== 'auto';
            }
          }
          return tool.permissionLevel !== 'auto';
        })();

        if (!needsConfirmation) {
          approved.push(call);
          yield { type: 'tool_start', toolName: call.name, toolUseId: call.id, input: call.input };
          continue;
        }

        // [SPEC 7 P2.3 Layer 2] Collect every confirm-tier write — no break.
        // Bundle vs single-write decision happens after guards (below).
        pendingWrites.push({ call, tool: tool! });
      }

      // --- Guard checks (pre-execution) ---
      const guardedApproved: PendingToolCall[] = [];

      if (this.guardConfig) {
        const convCtx = extractConversationText(this.messages);

        for (const call of approved) {
          const tool = findTool(this.tools, call.name);
          if (!tool) { guardedApproved.push(call); continue; }

          const check = runGuards(
            tool,
            call,
            this.guardState,
            this.guardConfig,
            convCtx,
            this.onGuardFired,
            { contacts: this.contacts, walletAddress: this.walletAddress },
          );
          this.guardEvents.push(...check.events);

          if (check.blocked) {
            yield {
              type: 'tool_result',
              toolName: call.name,
              toolUseId: call.id,
              result: { error: check.blockReason, _gate: check.blockGate },
              isError: true,
            };
            toolResultBlocks.push({
              type: 'tool_result',
              toolUseId: call.id,
              content: JSON.stringify({ error: check.blockReason, _gate: check.blockGate }),
              isError: true,
            });
            continue;
          }

          if (check.injections.length > 0) {
            (call as PendingToolCall & { _guardInjections?: unknown[] })._guardInjections = check.injections;
          }
          guardedApproved.push(call);
        }
      } else {
        guardedApproved.push(...approved);
      }

      // Execute auto-approved tool calls (reads) even if a write is pending
      for await (const toolEvent of runTools(guardedApproved, this.tools, context, this.txMutex)) {
        if (toolEvent.type === 'tool_result' && !toolEvent.isError) {
          const warning = flagSuspiciousResult(toolEvent.toolName, toolEvent.result);
          if (warning) {
            const flagged = {
              ...toolEvent,
              result: typeof toolEvent.result === 'object' && toolEvent.result
                ? { ...toolEvent.result as Record<string, unknown>, _warning: warning }
                : { data: toolEvent.result, _warning: warning },
            };
            yield flagged;
            toolResultBlocks.push({
              type: 'tool_result',
              toolUseId: flagged.toolUseId,
              content: JSON.stringify(flagged.result),
              isError: flagged.isError,
            });
            continue;
          }
        }

        // Post-execution: update guard state & apply injections
        if (toolEvent.type === 'tool_result') {
          const tool = findTool(this.tools, toolEvent.toolName);
          const originalCall = guardedApproved.find((c) => c.id === toolEvent.toolUseId);
          updateGuardStateAfterToolResult(
            toolEvent.toolName, tool, originalCall?.input ?? null, toolEvent.result, toolEvent.isError, this.guardState,
          );

          let enrichedResult = toolEvent.result;

          if (this.guardConfig && !toolEvent.isError && tool) {
            // Post-execution guards: artifact preview, stale data hint
            const artifactInj = this.guardConfig.artifactPreview !== false
              ? guardArtifactPreview(toolEvent.result)
              : null;
            const staleInj = this.guardConfig.staleData !== false
              ? guardStaleData(tool.flags)
              : null;

            // Merge pre-execution injections from guard check
            const preInjections =
              (guardedApproved.find((c) => c.id === toolEvent.toolUseId) as
                PendingToolCall & { _guardInjections?: unknown[] })?._guardInjections ?? [];

            const allInjections = [
              ...preInjections,
              ...(artifactInj ? [artifactInj] : []),
              ...(staleInj ? [staleInj] : []),
            ];

            if (allInjections.length > 0 && typeof enrichedResult === 'object' && enrichedResult) {
              enrichedResult = { ...enrichedResult as Record<string, unknown>, _guards: allInjections };
            }
          }

          const finalEvent = enrichedResult !== toolEvent.result
            ? { ...toolEvent, result: enrichedResult }
            : toolEvent;

          // [v0.46.8] Maintain the intra-turn read cache:
          //  - Successful read → populate so subsequent identical
          //    calls within the same turn dedup.
          //  - Successful write → invalidate the entire cache; on-chain
          //    state has changed, any prior read snapshot is stale.
          //  - Errored result → leave cache untouched; retry should
          //    re-execute.
          if (!finalEvent.isError && tool) {
            if (tool.isReadOnly) {
              const inputForKey = originalCall?.input ?? {};
              const cacheKey = TurnReadCache.keyFor(finalEvent.toolName, inputForKey);
              this.turnReadCache.set(cacheKey, {
                result: finalEvent.result,
                sourceToolUseId: finalEvent.toolUseId,
              });
              // [SPEC 7 P2.3 Layer 2] Track late-dispatched reads too —
              // mirrors the early-dispatch path above so the bundle
              // composer sees every contributing read regardless of
              // dispatch timing.
              turnReadToolResults.push({
                toolUseId: finalEvent.toolUseId,
                toolName: finalEvent.toolName,
                timestamp: Date.now(),
              });
            } else {
              this.turnReadCache.clear();
            }
          }

          yield finalEvent;

          if (finalEvent.type === 'tool_result' && !finalEvent.isError) {
            const r = finalEvent.result as Record<string, unknown> | null;
            if (r && r.__canvas === true) {
              yield {
                type: 'canvas',
                template: String(r.template ?? ''),
                title: String(r.title ?? ''),
                data: r.templateData ?? null,
                toolUseId: finalEvent.toolUseId,
              };
            }
            // [SPEC 8 v0.5.1] Side-channel todo_update event for the
            // late-dispatch path. Mirrors the early-dispatch emission
            // ~250 lines above.
            if (r && r.__todoUpdate === true && Array.isArray(r.items)) {
              yield {
                type: 'todo_update',
                items: r.items as { id: string; label: string; status: 'pending' | 'in_progress' | 'completed' }[],
                toolUseId: finalEvent.toolUseId,
              };
            }

            // [v1.4] Fire onAutoExecuted for write tools that auto-executed
            // (non-readonly tools that reach this loop have already passed the
            // auto-tier check). Wrapped in try/catch so any host error never
            // propagates back into the engine — the tool result already shipped.
            if (
              tool && !tool.isReadOnly && this.onAutoExecuted &&
              this.permissionConfig && this.priceCache
            ) {
              const operation = toolNameToOperation(toolEvent.toolName);
              if (operation && originalCall) {
                const usdValue = resolveUsdValue(
                  toolEvent.toolName,
                  originalCall.input as Record<string, unknown>,
                  this.priceCache,
                );
                Promise.resolve()
                  .then(() => this.onAutoExecuted!({
                    toolName: toolEvent.toolName,
                    usdValue,
                    walletAddress: this.walletAddress,
                  }))
                  .catch((err) => {
                    console.warn('[engine] onAutoExecuted callback failed:', err);
                  });
              }
            }
          }

          toolResultBlocks.push({
            type: 'tool_result',
            toolUseId: finalEvent.toolUseId,
            content: JSON.stringify(finalEvent.result),
            isError: finalEvent.isError,
          });
          continue;
        }

        yield toolEvent;
      }

      // --- Guard check on every pending write ---
      // [SPEC 7 P2.3 Layer 2] Run guards on each pending write. Blocked
      // writes feed an error tool_result back to the LLM and are dropped
      // from the bundle/single-write yield. Pre-P2.3 the loop only ran
      // guards on the first (singular) pendingWrite; now we run guards
      // on every collected confirm-tier write so a bundleable trio
      // doesn't silently skip guard checks on steps 2 and 3.
      const guardPassedWrites: Array<{ call: PendingToolCall; tool: Tool }> = [];
      const guardInjectionsByCallId: Record<string, Array<{ _gate: string; _hint?: string; _warning?: string }>> = {};
      let anyGuardBlocked = false;

      if (this.guardConfig && pendingWrites.length > 0) {
        const convCtx = extractConversationText(this.messages);
        for (const write of pendingWrites) {
          const check = runGuards(
            write.tool,
            write.call,
            this.guardState,
            this.guardConfig,
            convCtx,
            this.onGuardFired,
            { contacts: this.contacts, walletAddress: this.walletAddress },
          );
          this.guardEvents.push(...check.events);

          if (check.blocked) {
            anyGuardBlocked = true;
            yield {
              type: 'tool_result',
              toolName: write.call.name,
              toolUseId: write.call.id,
              result: { error: check.blockReason, _gate: check.blockGate },
              isError: true,
            };
            toolResultBlocks.push({
              type: 'tool_result',
              toolUseId: write.call.id,
              content: JSON.stringify({ error: check.blockReason, _gate: check.blockGate }),
              isError: true,
            });
            continue;
          }

          if (check.injections.length > 0) {
            guardInjectionsByCallId[write.call.id] = check.injections;
            (write.call as PendingToolCall & { _guardInjections?: unknown[] })._guardInjections = check.injections;
          }
          guardPassedWrites.push(write);
        }

        // If ANY write was blocked, feed errors back to the LLM and
        // re-prompt — don't surface a partial bundle/single-write
        // pending_action with missing pieces. The LLM will narrate the
        // block and either retry with corrected input or refuse cleanly.
        if (anyGuardBlocked) {
          this.messages.push({ role: 'assistant', content: acc.assistantBlocks });
          this.messages.push({ role: 'user', content: toolResultBlocks });
          getTelemetrySink().counter('engine.turn_outcome', {
            entry: freshPrompt !== null ? 'submit' : 'resume',
            outcome: 'guard_block_continue',
          });
          continue;
        }
      } else {
        // No guard config — all collected writes pass through.
        guardPassedWrites.push(...pendingWrites);
      }

      // [Phase 0 / SPEC 13 / 2026-05-03 evening] MAX_BUNDLE_OPS=2 cap.
      // Compound flows the LLM tries to atomize into a bundle of more
      // than MAX_BUNDLE_OPS writes get refused; the LLM splits and
      // re-plans sequentially. See `compose-bundle.ts:MAX_BUNDLE_OPS`
      // JSDoc for the rationale (chain-handoff is the real gap, cap=2
      // is the strict tightening until Phase 1 lands the foundation).
      if (guardPassedWrites.length > MAX_BUNDLE_OPS) {
        const cappedError = {
          error:
            `Atomic bundles are capped at ${MAX_BUNDLE_OPS} ops in Phase 0. ` +
            `You attempted ${guardPassedWrites.length}. ` +
            `Execute these as ${guardPassedWrites.length} sequential single-write transactions: ` +
            `tell the user "I'll do this in ${guardPassedWrites.length} steps", then emit only the FIRST write. ` +
            `After it lands and the user confirms each step, emit the next.`,
          _gate: 'max_bundle_ops',
        };
        for (const write of guardPassedWrites) {
          yield {
            type: 'tool_result',
            toolName: write.call.name,
            toolUseId: write.call.id,
            result: cappedError,
            isError: true,
          };
          toolResultBlocks.push({
            type: 'tool_result',
            toolUseId: write.call.id,
            content: JSON.stringify(cappedError),
            isError: true,
          });
        }
        this.messages.push({ role: 'assistant', content: acc.assistantBlocks });
        this.messages.push({ role: 'user', content: toolResultBlocks });
        getTelemetrySink().counter('engine.turn_outcome', {
          entry: freshPrompt !== null ? 'submit' : 'resume',
          outcome: 'max_bundle_ops_continue',
        });
        continue;
      }


      // [SPEC 7 P2.3 Layer 2] Bundle vs single-write decision.
      //
      // After guards, partition guardPassedWrites into bundleable + non-
      // bundleable. Bundling rules:
      //  - 0 writes → fall through to "all auto-approved" path below.
      //  - 1 write (any kind) → emit legacy single-write pending_action.
      //  - ≥2 writes, all bundleable → emit bundle with steps[].
      //  - ≥2 writes, mixed → emit FIRST as single-write (matches pre-
      //    P2.3 break-on-first behavior); the LLM will re-emit the rest
      //    in a follow-up turn after this one resolves.
      if (guardPassedWrites.length > 0) {
        const allBundleable =
          guardPassedWrites.length >= 2 &&
          guardPassedWrites.every((w) => w.tool.flags?.bundleable === true);

        const turnIndex = this.messages.filter((m) => m.role === 'assistant').length;
        // [v0.46.8] Mark the turn as paused so the submitMessage /
        // resumeWithToolResult `finally` blocks DON'T clear the cache.
        this.turnPaused = true;

        if (allBundleable) {
          // [Phase 0 → Phase 2 / SPEC 13] VALID_PAIRS strict-adjacency check.
          //
          // For multi-write bundles (N ≥ 2), every (step[i], step[i+1])
          // pair must be in the whitelist. Pairs outside it (swap→swap,
          // borrow→swap, save→send, etc.) fail in production because of
          // the chained-asset gap — refusing up front is cheaper than a
          // guaranteed-revert PREPARE round-trip.
          //
          // Phase 0 (1.12.0): cap was 2, this loop ran once.
          // Phase 2 (1.14.0): cap is 3, this loop runs up to twice.
          // First non-whitelisted pair fails the entire bundle (atomic
          // — all-or-nothing — there's no "salvage the prefix" path).
          //
          // Phase 3 work: relax to DAG-aware (only validate pairs that
          // actually chain via inputCoinFromStep). Until then, strict
          // adjacency is the spec.
          if (guardPassedWrites.length >= 2) {
            let badPair: { ok: false; pair: string } | null = null;
            for (let i = 0; i < guardPassedWrites.length - 1; i++) {
              const producer = guardPassedWrites[i].call.name;
              const consumer = guardPassedWrites[i + 1].call.name;
              const check = checkValidPair(producer, consumer);
              if (!check.ok) {
                badPair = check;
                break;
              }
            }
            if (badPair !== null) {
              const N = guardPassedWrites.length;
              const stepsPhrase = N === 2 ? 'two steps' : `${N} steps`;
              const pairError = {
                error:
                  `Bundle pair '${badPair.pair}' is not in the chaining whitelist. ` +
                  `Whitelisted pairs: ${[...VALID_PAIRS].join(', ')}. ` +
                  `Run these ${N} writes sequentially: tell the user "I'll do this in ${stepsPhrase}", ` +
                  `emit only the first write, then the next after it lands and confirms.`,
                _gate: 'pair_not_whitelisted',
              };
              for (const write of guardPassedWrites) {
                yield {
                  type: 'tool_result',
                  toolName: write.call.name,
                  toolUseId: write.call.id,
                  result: pairError,
                  isError: true,
                };
                toolResultBlocks.push({
                  type: 'tool_result',
                  toolUseId: write.call.id,
                  content: JSON.stringify(pairError),
                  isError: true,
                });
              }
              this.turnPaused = false;
              this.messages.push({ role: 'assistant', content: acc.assistantBlocks });
              this.messages.push({ role: 'user', content: toolResultBlocks });
              getTelemetrySink().counter('engine.turn_outcome', {
                entry: freshPrompt !== null ? 'submit' : 'resume',
                outcome: 'pair_not_whitelisted_continue',
                pair: badPair.pair,
              });
              continue;
            }
          }

          // Multi-write Payment Stream — compose bundle.
          const completedResults = toolResultBlocks.map((b) => ({
            toolUseId: (b as { toolUseId: string }).toolUseId,
            content: (b as { content: string }).content,
            isError: (b as { isError?: boolean }).isError ?? false,
          }));
          const bundleAction = composeBundleFromToolResults({
            pendingWrites: guardPassedWrites.map((w) => w.call),
            tools: this.tools,
            readResults: turnReadToolResults,
            assistantContent: acc.assistantBlocks,
            completedResults,
            guardInjectionsByCallId,
            turnIndex,
          });
          yield { type: 'pending_action', action: bundleAction };
          recordTurnOutcome('pending_action_bundle');
          return;
        }

        // Single-write (legacy shape). Honors backwards compat — pre-P2.3
        // hosts that key off `attemptId` continue to work.
        //
        // [SPEC 7 P2.3 audit fix — BUG 1] When mixed-bundleability forces
        // single-write fallback (≥2 writes guard-passed but not all
        // bundleable), the dropped writes' `tool_use` blocks are still
        // present in `assistantContent`. Without a matching `tool_result`,
        // the next Anthropic call rejects the turn (orphan tool_use).
        // Synthesize error `tool_result` blocks for every dropped write
        // and append to `toolResultBlocks` BEFORE pulling completedResults.
        // The LLM sees "this write didn't run, ask user again next turn".
        // Pre-existing bug class (pre-P2.3 had the same `break;` shape) —
        // we fix it here while we have visibility.
        const pendingWrite = guardPassedWrites[0];
        if (guardPassedWrites.length > 1) {
          for (let i = 1; i < guardPassedWrites.length; i++) {
            const dropped = guardPassedWrites[i];
            const errBody = JSON.stringify({
              error:
                'This write was emitted alongside another write that requires a separate confirmation. ' +
                'Re-emit it after the first write resolves.',
              _droppedDueToMixedBundleability: true,
            });
            yield {
              type: 'tool_result',
              toolName: dropped.call.name,
              toolUseId: dropped.call.id,
              result: { error: errBody },
              isError: true,
            };
            toolResultBlocks.push({
              type: 'tool_result',
              toolUseId: dropped.call.id,
              content: errBody,
              isError: true,
            });
          }
        }
        const writeGuardInjections = guardInjectionsByCallId[pendingWrite.call.id];
        const modifiableFields = getModifiableFields(pendingWrite.call.name);
        // [v1.4.2 — Day 3] Per-yield UUID. Hosts write this onto the
        // `TurnMetrics` row at chat-time and key the resume route's
        // update on it instead of `(sessionId, turnIndex)`.
        const attemptId = randomUUID();

        yield {
          type: 'pending_action',
          action: {
            toolName: pendingWrite.call.name,
            toolUseId: pendingWrite.call.id,
            input: pendingWrite.call.input,
            description: describeAction(pendingWrite.tool, pendingWrite.call),
            assistantContent: acc.assistantBlocks,
            completedResults: toolResultBlocks.map((b) => ({
              toolUseId: (b as { toolUseId: string }).toolUseId,
              content: (b as { content: string }).content,
              isError: (b as { isError?: boolean }).isError ?? false,
            })),
            ...(writeGuardInjections?.length ? { guardInjections: writeGuardInjections } : {}),
            ...(modifiableFields?.length ? { modifiableFields } : {}),
            turnIndex,
            attemptId,
          },
        };
        recordTurnOutcome('pending_action_single');
        return;
      }

      // All tools auto-approved — push the complete turn (assistant + results)
      this.messages.push({ role: 'assistant', content: acc.assistantBlocks });
      this.messages.push({ role: 'user', content: toolResultBlocks });

      // [SPEC 8 v0.5.1] update_todo maxTurns exemption.
      //
      // Calling update_todo documents work; it doesn't advance work. If the
      // LLM fires it 4× during a 5-tool plan, that's 4 of its 10-turn budget
      // gone to narration before any real action. We exempt iterations
      // whose only tool calls were update_todo by decrementing the counter.
      //
      // The check looks at every `tool_use` block in this iteration's
      // `acc.assistantBlocks` (covers both early-dispatched and late-
      // dispatched calls). If every one was `update_todo`, decrement.
      // Mixed iterations (e.g. balance_check + update_todo) DO count —
      // that's a real piece of work the LLM is doing.
      const toolUseBlocks = acc.assistantBlocks.filter((b) => b.type === 'tool_use') as { name: string }[];
      const allUpdateTodo =
        toolUseBlocks.length > 0 && toolUseBlocks.every((b) => b.name === 'update_todo');
      if (allUpdateTodo) {
        turns--;
      }

      if (this.costTracker.isOverBudget()) {
        yield { type: 'error', error: new Error('Session budget exceeded') };
        recordTurnOutcome('error_budget');
        return;
      }
    }

    yield { type: 'turn_complete', stopReason: 'max_turns' };
    recordTurnOutcome('max_turns');
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private addErrorResults(pendingCalls: PendingToolCall[], reason: string): void {
    const errorBlocks: ContentBlock[] = pendingCalls.map((call) => ({
      type: 'tool_result' as const,
      toolUseId: call.id,
      content: JSON.stringify({ error: reason }),
      isError: true,
    }));
    if (errorBlocks.length > 0) {
      this.messages.push({ role: 'user', content: errorBlocks });
    }
  }

  private *handleProviderEvent(
    event: ProviderEvent,
    acc: TurnAccumulator,
    dispatcher?: EarlyToolDispatcher,
  ): Generator<EngineEvent> {
    switch (event.type) {
      case 'thinking_delta': {
        yield { type: 'thinking_delta', text: event.text, blockIndex: event.blockIndex };
        break;
      }

      case 'thinking_done': {
        acc.assistantBlocks.push({
          type: 'thinking',
          thinking: event.thinking,
          signature: event.signature,
        });
        yield {
          type: 'thinking_done',
          blockIndex: event.blockIndex,
          signature: event.signature,
          // [SPEC 8 v0.5.1] forward HowIEvaluated structured fields when
          // the provider parsed an <eval_summary> marker.
          ...(event.summaryMode && event.evaluationItems
            ? { summaryMode: true, evaluationItems: event.evaluationItems }
            : {}),
        };
        break;
      }

      case 'redacted_thinking': {
        acc.assistantBlocks.push({
          type: 'redacted_thinking',
          data: event.data,
        });
        break;
      }

      case 'text_delta': {
        acc.text += event.text;
        yield { type: 'text_delta', text: event.text };
        break;
      }

      case 'tool_use_done': {
        if (acc.text) {
          acc.assistantBlocks.push({ type: 'text', text: acc.text });
          acc.text = '';
        }
        acc.assistantBlocks.push({
          type: 'tool_use',
          id: event.id,
          name: event.name,
          input: event.input,
        });

        const call: PendingToolCall = { id: event.id, name: event.name, input: event.input };

        // B.1: Try early dispatch for read-only tools mid-stream
        if (dispatcher?.tryDispatch(call)) {
          yield { type: 'tool_start', toolName: call.name, toolUseId: call.id, input: call.input };
        } else {
          acc.pendingToolCalls.push(call);
        }
        break;
      }

      case 'usage': {
        this.costTracker.track(
          event.inputTokens,
          event.outputTokens,
          event.cacheReadTokens,
          event.cacheWriteTokens,
        );
        this.contextBudget.update(event.inputTokens);
        const sink = getTelemetrySink();
        if (event.inputTokens) sink.counter('anthropic.tokens', { kind: 'input' }, event.inputTokens);
        if (event.outputTokens) sink.counter('anthropic.tokens', { kind: 'output' }, event.outputTokens);
        if (event.cacheReadTokens) sink.counter('anthropic.tokens', { kind: 'cache_read' }, event.cacheReadTokens);
        if (event.cacheWriteTokens) sink.counter('anthropic.tokens', { kind: 'cache_write' }, event.cacheWriteTokens);
        yield {
          type: 'usage',
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          cacheReadTokens: event.cacheReadTokens,
          cacheWriteTokens: event.cacheWriteTokens,
        };
        break;
      }

      case 'stop': {
        acc.stopReason = event.reason;
        break;
      }

      default:
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isCorruptHistoryError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    (msg.includes('tool_use') && msg.includes('tool_result')) ||
    msg.includes('roles must alternate') ||
    (msg.includes('400') && msg.includes('invalid_request_error'))
  );
}

/**
 * Pre-flight validation: ensures message history meets Anthropic's requirements
 * right before every API call. Anthropic requires that every tool_use in an
 * assistant message has a matching tool_result in the IMMEDIATELY NEXT user
 * message — not just anywhere in the history. This function strips any
 * tool_use/tool_result blocks that violate this positional constraint and
 * fixes role alternation. Single point of defense — no corrupt messages can
 * reach the API regardless of how they got into the session.
 */
export function validateHistory(messages: Message[]): Message[] {
  const result: Message[] = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];

    // For assistant messages with tool_use, verify the next message has ALL results
    const toolUseIds = msg.content
      .filter((b): b is { type: 'tool_use'; id: string; name: string; input: unknown } => b.type === 'tool_use')
      .map((b) => b.id);

    if (toolUseIds.length > 0 && msg.role === 'assistant') {
      const next = messages[i + 1];
      const nextResultIds = new Set(
        (next?.content ?? [])
          .filter((b): b is { type: 'tool_result'; toolUseId: string; content: string } => b.type === 'tool_result')
          .map((b) => b.toolUseId),
      );

      // Strip tool_use blocks that have no result in the next message
      const cleanAssistant = msg.content.filter((b) => {
        if (b.type === 'tool_use') return nextResultIds.has(b.id);
        return true;
      });

      // Strip tool_result blocks from next message whose tool_use was removed
      const keptToolUseIds = new Set(
        cleanAssistant
          .filter((b): b is { type: 'tool_use'; id: string; name: string; input: unknown } => b.type === 'tool_use')
          .map((b) => b.id),
      );
      const cleanNext = next?.content.filter((b) => {
        if (b.type === 'tool_result') return keptToolUseIds.has(b.toolUseId);
        return true;
      });

      if (cleanAssistant.length > 0) {
        result.push({ role: msg.role, content: cleanAssistant });
      }
      if (cleanNext && cleanNext.length > 0) {
        result.push({ role: next!.role, content: cleanNext });
      }
      i += 2;
      continue;
    }

    // For user messages: strip any tool_result blocks that reference a tool_use
    // not present in the immediately preceding assistant message
    if (msg.role === 'user' && msg.content.some((b) => b.type === 'tool_result')) {
      const prevAssistant = result[result.length - 1];
      const prevToolUseIds = new Set(
        (prevAssistant?.role === 'assistant' ? prevAssistant.content : [])
          .filter((b): b is { type: 'tool_use'; id: string; name: string; input: unknown } => b.type === 'tool_use')
          .map((b) => b.id),
      );
      const cleanContent = msg.content.filter((b) => {
        if (b.type === 'tool_result') return prevToolUseIds.has(b.toolUseId);
        return true;
      });
      if (cleanContent.length > 0) {
        result.push({ role: msg.role, content: cleanContent });
      }
      i++;
      continue;
    }

    result.push(msg);
    i++;
  }

  // Merge consecutive same-role messages (can happen after stripping)
  const merged: Message[] = [];
  for (const msg of result) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role) {
      last.content = [...last.content, ...msg.content];
    } else {
      merged.push({ role: msg.role, content: [...msg.content] });
    }
  }

  // First message must be user, AND it must not consist solely of
  // orphan `tool_result` blocks whose matching `tool_use` lived in an
  // assistant turn we're about to shift off. Anthropic rejects any
  // user message containing a tool_result that doesn't reference a
  // preceding assistant tool_use.
  //
  // The most common trigger is host code that seeds the conversation
  // with prefetched tool calls (see audric's `buildSyntheticPrefetch`):
  // `[assistant tool_uses, user tool_results, assistant text]`. After
  // shifting off the leading assistant, the user message's tool_results
  // are now orphaned. Strip them; if that empties the user message,
  // shift it off too — the next message may be assistant, in which
  // case we loop again.
  while (merged.length > 0) {
    if (merged[0].role !== 'user') {
      merged.shift();
      continue;
    }
    const cleaned = merged[0].content.filter((b) => b.type !== 'tool_result');
    if (cleaned.length === 0) {
      merged.shift();
      continue;
    }
    if (cleaned.length !== merged[0].content.length) {
      merged[0] = { role: 'user', content: cleaned };
    }
    break;
  }

  return merged;
}


function flagSuspiciousResult(toolName: string, result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;
  if (toolName === 'swap_execute') {
    const outAmt = Number(r.toAmount ?? r.outputAmount ?? 0);
    const inAmt = Number(r.fromAmount ?? r.inputAmount ?? 1);
    if (inAmt > 0 && outAmt / inAmt > 1_000_000) {
      return '[Warning: This quote may contain inaccurate data. Verify on-chain before executing.]';
    }
  }
  const apy = Number(r.apy ?? r.APY ?? NaN);
  if (!isNaN(apy) && apy < 0) {
    return '[Warning: Negative APY detected — data may be stale.]';
  }
  return null;
}
