// ---------------------------------------------------------------------------
// Test helper — invoke a native AI SDK tool's body with legacy
// `{ data, displayText? }` semantics, bypassing guards / preflight.
// ---------------------------------------------------------------------------
//
// SPEC AI SDK HARDENING P4.1 Phase C — 2026-05-25.
//
// Pre-Phase-C every engine tool was a legacy `Tool` object with a
// `.call(input, ctx)` method that returned `{ data, displayText }`. Tests
// called it directly to verify tool-body behavior in isolation
// (no guard pipeline, no LLM, no AI SDK runtime).
//
// Post-Phase-C every tool is a native AI SDK `tool({ execute })` whose
// `.execute(input, options)` runs guards + preflight + unwraps to
// `result.data` (the AI SDK runtime never sees `displayText`). This
// breaks the test pattern.
//
// To keep test rewrites surgical, `wrapEngineExecute` attaches the bare
// `call` body to the returned execute function as a non-enumerable
// `__t2000_callBody` property. This helper reads it and invokes it
// directly, giving tests the same `{ data, displayText? }` envelope
// they had before.
//
// Production code MUST go through `execute()` so guards run. This
// helper is test-only — never import it from `src/` proper.
// ---------------------------------------------------------------------------

import type { Tool } from 'ai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';
import type { ToolContext, ToolResult, PreflightResult } from '../../types.js';

/**
 * Cast a native AI SDK Tool's `inputSchema` to a Zod schema for tests
 * that need `.safeParse`. The AI SDK widens `inputSchema` to a
 * `FlexibleSchema` union (Zod | JSON schema) for provider compatibility,
 * but every engine tool ships with a Zod schema underneath. Tests rely
 * on this property — the helper just narrows the type.
 */
export function zodSchemaOf<T = unknown>(
  tool: { inputSchema?: unknown } | Tool<unknown, unknown>,
): z.ZodType<T> {
  return (tool as { inputSchema: z.ZodType<T> }).inputSchema;
}
import { getToolPolicy } from '../../v2/tool-policy.js';
import { getToolFlags } from '../../tool-flags.js';
import type { PermissionLevel, ToolFlags } from '../../types.js';

/**
 * Invoke the bare call body of a native AI SDK engine tool, bypassing
 * the guard pipeline + preflight gate. Returns the legacy
 * `{ data, displayText? }` shape.
 *
 * Throws if the tool wasn't built via `wrapEngineExecute` (the helper
 * has no body to call). MCP-adapted tools and bare-`execute` tools
 * fall into this category — write a different test pattern for them.
 *
 * @example
 *   const res = await callToolBody(balanceCheckTool, { address: '0x...' }, ctx);
 *   expect(res.data.total).toBe(100);
 *   expect(res.displayText).toContain('Total: $100');
 */
export async function callToolBody<TInput = unknown, TOutput = unknown>(
  tool: Tool<TInput, TOutput> | { execute?: unknown },
  input: TInput,
  ctx: ToolContext,
): Promise<ToolResult<TOutput>> {
  const execute = (tool as { execute?: unknown }).execute;
  if (typeof execute !== 'function') {
    throw new Error(
      'callToolBody: tool has no execute function. Use a different test pattern for MCP-adapted or bare tools.',
    );
  }
  const body = (execute as { __t2000_callBody?: unknown }).__t2000_callBody;
  if (typeof body !== 'function') {
    throw new Error(
      'callToolBody: tool was not built via wrapEngineExecute (no __t2000_callBody attached). Cannot invoke body directly.',
    );
  }
  return (body as (input: TInput, ctx: ToolContext) => Promise<ToolResult<TOutput>>)(
    input,
    ctx,
  );
}

/**
 * Invoke a tool's preflight function in isolation. Returns the
 * `PreflightResult` legacy `tool.preflight(input)` returned.
 *
 * Throws if the tool wasn't built via `wrapEngineExecute` OR if the
 * tool's options didn't include a `preflight` callback. Read tools
 * typically don't have one; preflight tests target write tools.
 */
export function callToolPreflight<TInput = unknown>(
  tool: Tool<TInput, unknown> | { execute?: unknown },
  input: TInput,
): PreflightResult {
  const execute = (tool as { execute?: unknown }).execute;
  if (typeof execute !== 'function') {
    throw new Error('callToolPreflight: tool has no execute function.');
  }
  const preflight = (execute as { __t2000_preflight?: unknown }).__t2000_preflight;
  if (typeof preflight !== 'function') {
    throw new Error(
      'callToolPreflight: tool has no preflight (read tool, or wrapEngineExecute called without `preflight`).',
    );
  }
  return (preflight as (input: TInput) => PreflightResult)(input);
}

// ---------------------------------------------------------------------------
// Legacy "view" of a native tool — for tests that still want
// `tool.isReadOnly` / `tool.permissionLevel` / `tool.jsonSchema` shape.
// ---------------------------------------------------------------------------
//
// Each lookup is a thin pass-through to the canonical source:
//   - `isReadOnly` / `permissionLevel` / `cacheable` → `getToolPolicy(name)`
//   - `flags`                                       → `getToolFlags(name)`
//   - `preflight`                                   → wrapEngineExecute side door
//   - `jsonSchema`                                  → `zodToJsonSchema(inputSchema)`
//
// Tests should use this in lieu of asserting on the native `Tool<…>`
// object directly, since native AI SDK tools no longer carry those
// fields after P4.1 Phase C.
//
// NOT for production use — `legacyToolView` reaches into the test-only
// side door and is intended as a migration aid for the test suite.

export interface LegacyToolView<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  isReadOnly: boolean;
  isConcurrencySafe: boolean;
  permissionLevel: PermissionLevel;
  cacheable: boolean;
  flags: ToolFlags;
  preflight?: (input: TInput) => PreflightResult;
  /**
   * JSON Schema view of the tool's input schema. Typed as
   * `Record<string, unknown>` so tests can reach into
   * `.properties` / `.required` without ceremony (the result of
   * `zodToJsonSchema` is a union the type system can't narrow to
   * "always has properties").
   */
  jsonSchema: Record<string, unknown> & {
    properties?: Record<string, Record<string, unknown>>;
    required?: string[];
  };
  call: (input: TInput, ctx: ToolContext) => Promise<ToolResult<TOutput>>;
}

/**
 * Return a legacy-shaped read-only view of a native AI SDK engine tool,
 * pulling each field from its canonical source. The `name` argument is
 * required because native AI SDK `tool({...})` doesn't carry the name —
 * the engine looks it up by the registry key.
 */
export function legacyToolView<TInput = unknown, TOutput = unknown>(
  tool: Tool<TInput, TOutput> | { execute?: unknown; inputSchema?: unknown; description?: unknown },
  name: string,
): LegacyToolView<TInput, TOutput> {
  const policy = getToolPolicy(name);
  const flags = getToolFlags(name);
  const execute = (tool as { execute?: unknown }).execute;
  const preflight =
    typeof execute === 'function'
      ? ((execute as { __t2000_preflight?: unknown }).__t2000_preflight as
          | ((input: TInput) => PreflightResult)
          | undefined)
      : undefined;
  const inputSchema = (tool as { inputSchema?: z.ZodTypeAny }).inputSchema as z.ZodTypeAny;
  return {
    name,
    description: ((tool as { description?: string }).description ?? '') as string,
    inputSchema,
    isReadOnly: policy.isReadOnly,
    isConcurrencySafe: policy.isConcurrencySafe ?? policy.isReadOnly,
    permissionLevel: policy.permissionLevel,
    cacheable: policy.cacheable ?? true,
    flags,
    preflight,
    jsonSchema: zodToJsonSchema(inputSchema) as LegacyToolView['jsonSchema'],
    call: (input: TInput, ctx: ToolContext) =>
      callToolBody<TInput, TOutput>(tool as Tool<TInput, TOutput>, input, ctx),
  };
}

// ---------------------------------------------------------------------------
// makeGuardView — minimal `GuardToolView` stub for guard tests.
// ---------------------------------------------------------------------------
//
// Pre-Phase-C guard tests fed `defineTool({...})` stubs into `runGuards`.
// Phase C narrowed `runGuards` to accept only `GuardToolView`
// (`{name, flags, preflight?}`), so the stubs got smaller. This helper
// builds the view from a canonical tool name (real flags pulled from
// `getToolFlags`) with an optional `preflight` override.
//
// Use this in guard regression tests in lieu of `defineTool` stubs.

import type { GuardToolView } from '../../guards.js';

export function makeGuardView(
  name: string,
  opts?: { preflight?: (input: unknown) => PreflightResult },
): GuardToolView {
  return {
    name,
    flags: getToolFlags(name),
    preflight: opts?.preflight,
  };
}

// ---------------------------------------------------------------------------
// defineTool — test-only AI SDK tool factory.
// ---------------------------------------------------------------------------
//
// The legacy `defineTool` from `packages/engine/src/v2/define-tool.ts` was
// deleted in P4.1 Phase C. Test files that synthesized stub tools (engine
// dispatch tests, guard-runner tests, step-finish tests, etc.) need a
// replacement that returns a native AI SDK `tool()` with the engine's
// `wrapEngineExecute` defense-in-depth applied.
//
// Returns the native tool with the canonical name attached as a
// non-enumerable `__name` property so `asToolSet(...)` can build a
// ToolSet object from a list of these. The engine itself never reads
// `__name`; the AI SDK ignores extra properties on `tool({})`.
//
// Optionally registers `flags` + `policy` (permissionLevel,
// isReadOnly, cacheable, maxResultSizeChars) at the central registries
// so guards / cache layer / dispatcher see the same metadata they
// would for a production tool.

import { tool } from 'ai';
import { wrapEngineExecute } from '../../v2/tool-helpers.js';
import { buildNeedsApproval } from '../../v2/need-approval.js';
import { registerToolPolicy, type ToolPolicy } from '../../v2/tool-policy.js';
import { TOOL_FLAGS } from '../../tool-flags.js';

export interface DefineToolForTestOptions<TInput, TOutput> {
  name: string;
  description?: string;
  inputSchema: z.ZodType<TInput>;
  /** Tool body. Returns `{ data, displayText? }`. */
  call: (input: TInput, ctx: ToolContext) => Promise<ToolResult<TOutput>>;
  preflight?: (input: TInput) => PreflightResult;
  // Optional metadata — registered at central registries for the test run.
  flags?: ToolFlags;
  permissionLevel?: PermissionLevel;
  isReadOnly?: boolean;
  isConcurrencySafe?: boolean;
  cacheable?: boolean;
  maxResultSizeChars?: number;
}

// The AI SDK `Tool` type is a union of several overlapping shapes
// (input/output variance, with/without execute). We can't extend it via
// an `interface … extends Tool` declaration — TS rejects that — but we
// can build a value whose runtime shape carries an extra `__name`. The
// type below is a structural marker the helper uses to remember which
// tool came from which name; everything else is a plain AI SDK `Tool`.
export type TestDefinedTool<_TInput = unknown, _TOutput = unknown> = Tool<any, any> & {
  readonly __name: string;
};

export function defineToolForTest<TInput = unknown, TOutput = unknown>(
  opts: DefineToolForTestOptions<TInput, TOutput>,
): TestDefinedTool<TInput, TOutput> {
  if (opts.flags && TOOL_FLAGS[opts.name] === undefined) {
    TOOL_FLAGS[opts.name] = opts.flags;
  }
  const policy: ToolPolicy = {
    isReadOnly: opts.isReadOnly ?? opts.permissionLevel !== 'confirm',
    isConcurrencySafe: opts.isConcurrencySafe,
    permissionLevel: opts.permissionLevel ?? 'auto',
    cacheable: opts.cacheable,
    maxResultSizeChars: opts.maxResultSizeChars,
  };
  registerToolPolicy(opts.name, policy);

  const aiTool = tool({
    description: opts.description ?? '',
    inputSchema: opts.inputSchema as z.ZodTypeAny,
    // Mirror production wiring: confirm / explicit tier needs the
    // `needsApproval` gate so the engine yields `pending_action`
    // (or `tool-approval-request` upstream). Auto-tier reads skip it.
    ...(policy.permissionLevel !== 'auto'
      ? { needsApproval: buildNeedsApproval(opts.name) }
      : {}),
    execute: wrapEngineExecute<TInput, TOutput>(opts.name, {
      preflight: opts.preflight,
      call: opts.call,
    }) as unknown as Parameters<typeof tool>[0]['execute'],
  });
  Object.defineProperty(aiTool, '__name', {
    value: opts.name,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return aiTool as TestDefinedTool<TInput, TOutput>;
}

/**
 * Build a `ToolSet` (`Record<string, Tool>`) from a list of tools
 * defined via `defineToolForTest`. The native AI SDK Tool doesn't
 * carry its name, so this helper relies on the `__name` accessor
 * that `defineToolForTest` attached.
 */
export function asToolSet(
  ...tools: Array<TestDefinedTool<any, any>>
): Record<string, Tool<any, any>> {
  const out: Record<string, Tool<any, any>> = {};
  for (const t of tools) {
    if (!t.__name) {
      throw new Error('asToolSet: tool has no __name. Build it with defineToolForTest().');
    }
    out[t.__name] = t as Tool<any, any>;
  }
  return out;
}



