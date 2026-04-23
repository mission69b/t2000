import type { EngineEvent, Tool, ToolContext } from './types.js';
import { findTool } from './tool.js';

// ---------------------------------------------------------------------------
// Pending tool call — accumulated from provider events
// ---------------------------------------------------------------------------

export interface PendingToolCall {
  id: string;
  name: string;
  input: unknown;
}

// ---------------------------------------------------------------------------
// TxMutex — serialises write operations to prevent race conditions
// ---------------------------------------------------------------------------

export class TxMutex {
  private queue: (() => void)[] = [];
  private locked = false;

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }
}

// ---------------------------------------------------------------------------
// runTools — executes tool calls with parallel reads, serial writes
// ---------------------------------------------------------------------------

export async function* runTools(
  pending: PendingToolCall[],
  tools: Tool[],
  context: ToolContext,
  txMutex: TxMutex,
): AsyncGenerator<EngineEvent> {
  const { reads, writes } = partitionToolCalls(pending, tools);

  // Phase 1: execute all read-only tools in parallel
  if (reads.length > 0) {
    const readResults = await Promise.allSettled(
      reads.map(async (call) => {
        const tool = findTool(tools, call.name);
        if (!tool) {
          return { call, result: { data: { error: `Unknown tool: ${call.name}` } }, isError: true };
        }
        const execResult = await executeSingleTool(tool, call, context);
        if (!execResult.isError) {
          execResult.data = budgetToolResult(execResult.data, tool);
        }
        return { call, result: execResult, isError: execResult.isError };
      }),
    );

    for (const settled of readResults) {
      if (settled.status === 'fulfilled') {
        const { call, result, isError } = settled.value;
        yield {
          type: 'tool_result',
          toolName: call.name,
          toolUseId: call.id,
          result: result.data,
          isError,
        };
      } else {
        const idx = readResults.indexOf(settled);
        const call = reads[idx];
        yield {
          type: 'tool_result',
          toolName: call.name,
          toolUseId: call.id,
          result: { error: settled.reason?.message ?? 'Tool execution failed' },
          isError: true,
        };
      }
    }
  }

  // Phase 2: execute write tools sequentially under mutex
  for (const call of writes) {
    const tool = findTool(tools, call.name);
    if (!tool) {
      yield {
        type: 'tool_result',
        toolName: call.name,
        toolUseId: call.id,
        result: { error: `Unknown tool: ${call.name}` },
        isError: true,
      };
      continue;
    }
    await txMutex.acquire();
    try {
      const result = await executeSingleTool(tool, call, context);
      if (!result.isError) {
        result.data = budgetToolResult(result.data, tool);
      }
      yield {
        type: 'tool_result',
        toolName: call.name,
        toolUseId: call.id,
        result: result.data,
        isError: result.isError,
      };
    } catch (err) {
      yield {
        type: 'tool_result',
        toolName: call.name,
        toolUseId: call.id,
        result: { error: err instanceof Error ? err.message : 'Tool execution failed' },
        isError: true,
      };
    } finally {
      txMutex.release();
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function partitionToolCalls(
  pending: PendingToolCall[],
  tools: Tool[],
): { reads: PendingToolCall[]; writes: PendingToolCall[] } {
  const reads: PendingToolCall[] = [];
  const writes: PendingToolCall[] = [];

  for (const call of pending) {
    const tool = findTool(tools, call.name);
    if (!tool) {
      reads.push(call); // unknown tools treated as reads — will fail safely
      continue;
    }
    if (tool.isReadOnly && tool.isConcurrencySafe) {
      reads.push(call);
    } else {
      writes.push(call);
    }
  }

  return { reads, writes };
}

async function executeSingleTool(
  tool: Tool,
  call: PendingToolCall,
  context: ToolContext,
): Promise<{ data: unknown; isError: boolean }> {
  const parsed = tool.inputSchema.safeParse(call.input);
  if (!parsed.success) {
    return {
      data: {
        error: `Invalid input: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
      },
      isError: true,
    };
  }

  const result = await tool.call(parsed.data, context);
  return { data: result.data, isError: false };
}

/**
 * Enforce per-tool result size limits. When a serialized result exceeds
 * `maxResultSizeChars`, truncate it with a hint to re-call with narrower
 * parameters. Uses the tool's custom `summarizeOnTruncate` when available.
 */
export function budgetToolResult(
  data: unknown,
  tool: Tool,
): unknown {
  if (!tool.maxResultSizeChars) return data;

  const serialized = typeof data === 'string' ? data : JSON.stringify(data);
  if (serialized.length <= tool.maxResultSizeChars) return data;

  if (tool.summarizeOnTruncate) {
    const summarized = tool.summarizeOnTruncate(serialized, tool.maxResultSizeChars);
    try { return JSON.parse(summarized); } catch { return summarized; }
  }

  const preview = serialized.slice(0, tool.maxResultSizeChars);
  const linesOmitted = serialized.split('\n').length - preview.split('\n').length;
  const note = `[Truncated — ${linesOmitted} lines omitted. Call ${tool.name} with narrower parameters (e.g. smaller date range or limit) to see more.]`;
  /**
   * [v1.5.2] If the original payload was a JSON object, *don't* return a
   * raw sliced string — the slice is invalid JSON, JSON.parse fails, and
   * downstream consumers (frontend card renderers, history-replay logic,
   * etc.) get a string they cannot destructure. Instead, wrap the
   * preview in a structured `_truncated` envelope so the result stays
   * object-shaped. Tools that genuinely return a string (rare) fall
   * through to the legacy concat behavior.
   */
  if (typeof data === 'object' && data !== null) {
    return { _truncated: true, _preview: preview, _note: note };
  }
  return `${preview}\n\n${note}`;
}
