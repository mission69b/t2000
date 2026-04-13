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

interface DispatchEntry {
  call: PendingToolCall;
  tool: Tool;
  promise: Promise<{ data: unknown; isError: boolean }>;
}

export class EarlyToolDispatcher {
  private entries: DispatchEntry[] = [];
  private readonly tools: Tool[];
  private readonly context: ToolContext;
  private abortController: AbortController;

  constructor(tools: Tool[], context: ToolContext) {
    this.tools = tools;
    this.context = context;
    this.abortController = new AbortController();
  }

  /**
   * Attempt to dispatch a tool call. Returns true if the tool was dispatched
   * (read-only + concurrency-safe), false if it should be queued for later.
   */
  tryDispatch(call: PendingToolCall): boolean {
    const tool = findTool(this.tools, call.name);
    if (!tool || !tool.isReadOnly || !tool.isConcurrencySafe) return false;

    const childContext = { ...this.context, signal: this.abortController.signal };
    const promise = executeTool(tool, call, childContext);

    this.entries.push({ call, tool, promise });
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
        };
      } catch (err) {
        yield {
          type: 'tool_result',
          toolName: entry.call.name,
          toolUseId: entry.call.id,
          result: { error: err instanceof Error ? err.message : 'Tool execution failed' },
          isError: true,
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
