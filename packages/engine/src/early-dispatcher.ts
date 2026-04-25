/**
 * EarlyToolDispatcher — dispatches read-only tools mid-stream.
 *
 * When the LLM emits `tool_use_done` for a read-only tool, the dispatcher
 * fires it immediately in the background rather than waiting for the full
 * stream to finish. Results are collected in original call order after the
 * stream exits.
 *
 * Write tools are NOT dispatched — they go through the existing permission
 * gate and TxMutex flow.
 */

import type { EngineEvent, Tool, ToolContext } from './types.js';
import { findTool } from './tool.js';
import { budgetToolResult, type PendingToolCall } from './orchestration.js';
import { TurnReadCache } from './turn-read-cache.js';

interface DispatchEntry {
  call: PendingToolCall;
  tool: Tool;
  promise: Promise<{ data: unknown; isError: boolean }>;
  /**
   * [v0.46.8] True when this entry was satisfied from the
   * `TurnReadCache` rather than a fresh tool execution. The
   * `collectResults` stream surfaces these as `resultDeduped: true` so
   * hosts can skip rendering a duplicate card while the LLM still gets
   * the data it needs to answer its `tool_use_id`.
   */
  deduped: boolean;
}

export class EarlyToolDispatcher {
  private entries: DispatchEntry[] = [];
  private readonly tools: Tool[];
  private readonly context: ToolContext;
  private readonly turnReadCache: TurnReadCache | undefined;
  private abortController: AbortController;

  constructor(tools: Tool[], context: ToolContext, turnReadCache?: TurnReadCache) {
    this.tools = tools;
    this.context = context;
    this.turnReadCache = turnReadCache;
    this.abortController = new AbortController();
  }

  /**
   * Attempt to dispatch a tool call. Returns true if the tool was dispatched
   * (read-only + concurrency-safe), false if it should be queued for later.
   *
   * [v0.46.8] Cache-aware: if a `TurnReadCache` was supplied at
   * construction and a prior call this turn already produced a result
   * for the same `(toolName, input)`, the dispatcher returns true (the
   * call IS handled here, not queued for the post-stream loop) but
   * skips the tool execution entirely — `collectResults` will surface
   * the cached value with `resultDeduped: true`. On a cache miss for
   * a successful real execution, the result is written back to the
   * cache so any later call within the same turn dedups too.
   */
  tryDispatch(call: PendingToolCall): boolean {
    const tool = findTool(this.tools, call.name);
    if (!tool || !tool.isReadOnly || !tool.isConcurrencySafe) return false;

    if (this.turnReadCache) {
      const cacheKey = TurnReadCache.keyFor(call.name, call.input);
      const cached = this.turnReadCache.get(cacheKey);
      if (cached) {
        this.entries.push({
          call,
          tool,
          promise: Promise.resolve({ data: cached.result, isError: false }),
          deduped: true,
        });
        return true;
      }
    }

    const childContext = { ...this.context, signal: this.abortController.signal };
    const promise = executeTool(tool, call, childContext).then((result) => {
      // Populate the cache on a successful, non-cached execution so a
      // later identical call this turn dedups instead of re-running.
      if (!result.isError && this.turnReadCache) {
        const cacheKey = TurnReadCache.keyFor(call.name, call.input);
        this.turnReadCache.set(cacheKey, {
          result: result.data,
          sourceToolUseId: call.id,
        });
      }
      return result;
    });

    this.entries.push({ call, tool, promise, deduped: false });
    return true;
  }

  /** True if any tools have been dispatched. */
  hasPending(): boolean {
    return this.entries.length > 0;
  }

  /** List of call IDs that were early-dispatched. */
  dispatchedIds(): Set<string> {
    return new Set(this.entries.map((e) => e.call.id));
  }

  /**
   * Look up the original tool input by `tool_use_id`. Used by the engine to
   * feed `updateGuardStateAfterToolResult` (which needs the call input to
   * record swap_quote → swap_execute pairing, etc.) for tools that were
   * dispatched here instead of going through the normal post-stream loop.
   */
  getInputById(toolUseId: string): unknown | undefined {
    return this.entries.find((e) => e.call.id === toolUseId)?.call.input;
  }

  /**
   * Collect all results in original dispatch order.
   * Yields `tool_result` events as each promise resolves.
   */
  async *collectResults(): AsyncGenerator<EngineEvent> {
    for (const entry of this.entries) {
      try {
        const result = await entry.promise;
        const budgeted = result.isError
          ? result.data
          : budgetToolResult(result.data, entry.tool);

        yield {
          type: 'tool_result',
          toolName: entry.call.name,
          toolUseId: entry.call.id,
          result: budgeted,
          isError: result.isError,
          wasEarlyDispatched: true,
          ...(entry.deduped ? { resultDeduped: true } : {}),
        };
      } catch (err) {
        yield {
          type: 'tool_result',
          toolName: entry.call.name,
          toolUseId: entry.call.id,
          result: { error: err instanceof Error ? err.message : 'Tool execution failed' },
          isError: true,
          wasEarlyDispatched: true,
        };
      }
    }
  }

  /** Cancel all in-flight tool calls. */
  abort(): void {
    this.abortController.abort();
  }
}

async function executeTool(
  tool: Tool,
  call: PendingToolCall,
  context: ToolContext,
): Promise<{ data: unknown; isError: boolean }> {
  const parsed = tool.inputSchema.safeParse(call.input);
  if (!parsed.success) {
    return {
      data: { error: `Invalid input: ${parsed.error.issues.map((i) => i.message).join(', ')}` },
      isError: true,
    };
  }

  const result = await tool.call(parsed.data, context);
  return { data: result.data, isError: false };
}
