import type {
  EngineConfig,
  EngineEvent,
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
import { TxMutex, runTools, type PendingToolCall } from './orchestration.js';
import { getDefaultTools } from './tools/index.js';
import { getModifiableFields } from './tools/tool-modifiable-fields.js';
import { DEFAULT_SYSTEM_PROMPT } from './prompt.js';
import { CostTracker, type CostSnapshot } from './cost.js';
import { estimatePayApiCost } from './tools/pay.js';
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

    this.tools = config.tools ?? (config.agent ? getDefaultTools() : []);
  }

  /**
   * Submit a user message and stream engine events.
   *
   * Read-only tools execute inline. Write tools that need confirmation yield a
   * `pending_action` event and the stream ends — no persistent connection needed.
   * The caller should save messages + pendingAction to the session store, then
   * call `resumeWithToolResult()` after the user approves/denies and executes.
   */
  async *submitMessage(prompt: string): AsyncGenerator<EngineEvent> {
    if (this.costTracker.isOverBudget()) {
      yield { type: 'error', error: new Error('Session budget exceeded') };
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

    const writeResult: ContentBlock = response.approved
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
        };

    // Reconstruct the full turn atomically:
    // 1. Push the assistant message that was deferred during pending_action
    // 2. Push ALL tool_results (completed reads + write) in one user message
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
      writeResult,
    ];

    this.messages.push({ role: 'user', content: allResults });

    yield {
      type: 'tool_result',
      toolName: action.toolName,
      toolUseId: action.toolUseId,
      result: response.approved
        ? (response.executionResult ?? { success: true })
        : { error: 'User declined this action' },
      isError: !response.approved,
    };

    if (!response.approved) {
      yield { type: 'turn_complete', stopReason: 'end_turn' };
      // Turn ended (user declined) — drop the cache.
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
    const refreshList = this.postWriteRefresh?.[action.toolName];
    if (!refreshList || refreshList.length === 0) return;

    // Refresh only on confirmed success. Failed writes leave on-chain
    // state untouched; refreshing would just surface the pre-write
    // snapshot a second time — wasted RPC + zero new info.
    const exec = response.executionResult;
    const writeFailed =
      exec != null &&
      typeof exec === 'object' &&
      'success' in exec &&
      (exec as { success?: unknown }).success === false;
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
    };

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
            };
          }
          const result = await tool.call(parsed.data, context);
          return { tool, id, isError: false as const, data: result.data };
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
      };
    }
  }

  interrupt(): void {
    this.abortController?.abort();
  }

  getMessages(): readonly Message[] {
    return this.messages;
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
    };

    let turns = 0;
    let hasRetriedWithCleanHistory = false;

    while (turns < this.maxTurns) {
      if (signal.aborted) {
        yield { type: 'error', error: new Error('Aborted') };
        return;
      }

      turns++;
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

        const stream = this.provider.chat({
          messages: this.messages,
          systemPrompt: effectivePrompt,
          tools: toolDefs,
          model: this.model,
          maxTokens: this.maxTokens,
          temperature: this.temperature,
          toolChoice: effectiveToolChoice,
          thinking: this.thinking,
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
        yield { type: 'turn_complete', stopReason: acc.stopReason };
        return;
      }

      if (signal.aborted) {
        this.messages.push({ role: 'assistant', content: acc.assistantBlocks });
        if (hasEarlyResults) {
          this.messages.push({ role: 'user', content: earlyResultBlocks });
        }
        this.addErrorResults(acc.pendingToolCalls, 'Aborted');
        yield { type: 'error', error: new Error('Aborted') };
        return;
      }

      // --- Permission gate (only for non-early-dispatched calls) ---
      const approved: PendingToolCall[] = [];
      const toolResultBlocks: ContentBlock[] = [...earlyResultBlocks];
      let pendingWrite: { call: PendingToolCall; tool: Tool } | null = null;

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

        pendingWrite = { call, tool: tool! };
        break;
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

      // --- Guard check on pending write tool ---
      if (pendingWrite && this.guardConfig) {
        const convCtx = extractConversationText(this.messages);
        const check = runGuards(
          pendingWrite.tool,
          pendingWrite.call,
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
            toolName: pendingWrite.call.name,
            toolUseId: pendingWrite.call.id,
            result: { error: check.blockReason, _gate: check.blockGate },
            isError: true,
          };
          toolResultBlocks.push({
            type: 'tool_result',
            toolUseId: pendingWrite.call.id,
            content: JSON.stringify({ error: check.blockReason, _gate: check.blockGate }),
            isError: true,
          });
          // Blocked write — don't yield pending_action, feed error back to LLM
          this.messages.push({ role: 'assistant', content: acc.assistantBlocks });
          this.messages.push({ role: 'user', content: toolResultBlocks });
          continue;
        }

        if (check.injections.length > 0) {
          (pendingWrite.call as PendingToolCall & { _guardInjections?: unknown[] })._guardInjections = check.injections;
        }
      }

      if (pendingWrite) {
        // Do NOT push assistant message to this.messages — session stays clean.
        // The full assistant content is stored in PendingAction so
        // resumeWithToolResult can reconstruct the turn atomically.
        const writeGuardInjections =
          (pendingWrite.call as PendingToolCall & { _guardInjections?: Array<{ _gate: string; _hint?: string; _warning?: string }> })._guardInjections;

        // [v1.4 Item 6] Stamp the action with the registry's modifiable
        // fields (UI uses this to render editable controls) and a turnIndex
        // derived from the assistant message count so hosts can update the
        // matching `TurnMetrics` row when the action resolves.
        const modifiableFields = getModifiableFields(pendingWrite.call.name);
        const turnIndex = this.messages.filter((m) => m.role === 'assistant').length;

        // [v0.46.8] Mark the turn as paused so the submitMessage /
        // resumeWithToolResult `finally` blocks DON'T clear the cache.
        // The pending write may resume; cache must survive the pause
        // so post-resume execution still benefits from intra-turn dedup.
        this.turnPaused = true;
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
          },
        };
        return;
      }

      // All tools auto-approved — push the complete turn (assistant + results)
      this.messages.push({ role: 'assistant', content: acc.assistantBlocks });
      this.messages.push({ role: 'user', content: toolResultBlocks });

      if (this.costTracker.isOverBudget()) {
        yield { type: 'error', error: new Error('Session budget exceeded') };
        return;
      }
    }

    yield { type: 'turn_complete', stopReason: 'max_turns' };
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
        yield { type: 'thinking_delta', text: event.text };
        break;
      }

      case 'thinking_done': {
        acc.assistantBlocks.push({
          type: 'thinking',
          thinking: event.thinking,
          signature: event.signature,
        });
        yield { type: 'thinking_done', signature: event.signature };
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

  // First message must be user
  while (merged.length > 0 && merged[0].role !== 'user') {
    merged.shift();
  }

  return merged;
}

function resolveTokenSymbol(nameOrType: string): string {
  if (!nameOrType.includes('::')) return nameOrType;
  const parts = nameOrType.split('::');
  return parts[parts.length - 1];
}

function describeAction(tool: Tool, call: PendingToolCall): string {
  const input = call.input as Record<string, unknown>;
  switch (tool.name) {
    case 'save_deposit': {
      return `Save ${input.amount} USDC into lending`;
    }
    case 'withdraw': {
      const wAsset = input.asset ?? '';
      return `Withdraw ${input.amount}${wAsset ? ' ' + wAsset : ''} from lending`;
    }
    case 'send_transfer':
      return `Send $${input.amount} to ${input.to}`;
    case 'borrow':
      return `Borrow $${input.amount} against collateral`;
    case 'repay_debt':
      return `Repay $${input.amount} of outstanding debt`;
    case 'claim_rewards':
      return 'Claim all pending protocol rewards';
    case 'pay_api': {
      const url = String(input.url ?? '');
      const cost = estimatePayApiCost(url);
      return `Pay for API call to ${url} (~$${cost})`;
    }
    case 'swap_execute': {
      const from = resolveTokenSymbol(String(input.from ?? '?'));
      const to = resolveTokenSymbol(String(input.to ?? '?'));
      const amt = input.amount ?? '?';
      const slippagePct = ((input.slippage as number) ?? 0.01) * 100;
      return `Swap ${amt} ${from} for ${to} (${slippagePct}% max slippage)`;
    }
    case 'volo_stake':
      return `Stake ${input.amount} SUI for vSUI`;
    case 'volo_unstake':
      return `Unstake ${input.amount === 'all' ? 'all' : input.amount} vSUI`;
    default:
      return `Execute ${tool.name}`;
  }
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
