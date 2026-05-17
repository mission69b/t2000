// ---------------------------------------------------------------------------
// MCP client manager — thin wrapper around @ai-sdk/mcp's createMCPClient.
//
// **SPEC 37 v0.7a Phase 4 (2026-05-17, engine v2.1.0):** the legacy
// `@modelcontextprotocol/sdk` `Client` + `StreamableHTTPClientTransport`
// pair (~250 LoC of bespoke transport plumbing + retry config) was
// replaced by `@ai-sdk/mcp`'s `createMCPClient`. The PUBLIC contract of
// `McpClientManager` (class name + every public method signature +
// `McpServerConnection` field names) is preserved verbatim — 12+
// production call sites + 27 test cases in `__tests__/mcp-client.test.ts`
// continue to compile and pass without modification.
//
// What changed under the hood:
//   - Production `connect(config)` path: `createMCPClient({ transport })`
//     instead of `new Client(...)` + `new StreamableHTTPClientTransport(...)`.
//   - `conn.client.callTool({ name, arguments })` continues to work; for
//     production-path connections it routes through an internal wrapper
//     that calls `aiClient.tools()[name].execute(...)`. Tests that inject
//     a legacy `Client` directly into `connections` (via `as any`) still
//     work because the legacy `Client` already exposes `.callTool({name,
//     arguments})` with the same shape.
//
// What did NOT change:
//   - `McpResponseCache` (30s default TTL, server-namespaced) is preserved
//     verbatim — `createMCPClient` does not ship a response cache, and
//     the cache is load-bearing for the 40-60% NAVI read hit rate
//     observed in production.
//   - `transport: 'streamable-http' | 'sse'` config field name preserved
//     (AI SDK calls them `'http' | 'sse'`; we map at construction time).
//   - All public method signatures (`connect`, `disconnect`, `disconnectAll`,
//     `getConnection`, `isConnected`, `listAllTools`, `callTool`,
//     `serverCount`, `serverNames`) preserved.
// ---------------------------------------------------------------------------

import { createMCPClient, type MCPClient as AISDKMcpClient } from '@ai-sdk/mcp';

// ---------------------------------------------------------------------------
// Types — preserved verbatim from the legacy surface
// ---------------------------------------------------------------------------

export interface McpServerConfig {
  /** Human-readable server name, used as tool namespace prefix. */
  name: string;
  /** MCP server URL (Streamable HTTP or SSE endpoint). */
  url: string;
  /** Transport type. Defaults to 'streamable-http' (mapped to 'http' for AI SDK). */
  transport?: 'streamable-http' | 'sse';
  /** Response cache TTL in ms. Default 30_000 (30s). */
  cacheTtlMs?: number;
  /** Whether all tools from this server are read-only. Default true. */
  readOnly?: boolean;
  /** Optional HTTP headers (e.g. Authorization for authenticated MCP servers). */
  headers?: Record<string, string>;
}

/**
 * Tool definition shape — preserved from legacy `@modelcontextprotocol/sdk`
 * `Tool` so production callers reading `conn.tools` continue to compile.
 * AI SDK's `listTools()` returns a superset of these fields; we trim down.
 */
export interface McpToolDef {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Minimal client shape that both legacy `@modelcontextprotocol/sdk` `Client`
 * (used by tests via direct injection) and our internal AI SDK wrapper
 * (used by production `connect()` path) satisfy. Return type stays loose
 * (`unknown`) because the legacy SDK `CallToolResult` union also admits a
 * `{ toolResult, _meta }` alternative we don't care about; the manager's
 * `callTool` reads `content` / `isError` defensively via the cast in the
 * adapter at the boundary.
 */
export interface McpUnderlyingClient {
  callTool(args: { name: string; arguments: Record<string, unknown> }): Promise<unknown>;
  close(): Promise<unknown>;
}

export interface McpServerConnection {
  config: McpServerConfig;
  /** Either a legacy `Client` (tests) or our AI-SDK-wrapping shim (production). */
  client: McpUnderlyingClient;
  /** Opaque — production path stores the resolved AI SDK MCPClient; tests inject in-memory transport. */
  transport: unknown;
  tools: McpToolDef[];
  status: 'connected' | 'disconnected' | 'error';
  lastError?: string;
}

export interface McpCallResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
}

// ---------------------------------------------------------------------------
// Response cache — preserved verbatim. @ai-sdk/mcp does NOT ship one, and
// the 30s TTL is load-bearing for production NAVI read hit rate.
// ---------------------------------------------------------------------------

interface CacheEntry {
  result: McpCallResult;
  expiresAt: number;
}

export class McpResponseCache {
  private cache = new Map<string, CacheEntry>();
  private readonly defaultTtlMs: number;

  constructor(defaultTtlMs = 30_000) {
    this.defaultTtlMs = defaultTtlMs;
  }

  private key(serverName: string, toolName: string, args: unknown): string {
    return `${serverName}::${toolName}::${JSON.stringify(args)}`;
  }

  get(serverName: string, toolName: string, args: unknown): McpCallResult | null {
    const k = this.key(serverName, toolName, args);
    const entry = this.cache.get(k);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(k);
      return null;
    }
    return entry.result;
  }

  set(serverName: string, toolName: string, args: unknown, result: McpCallResult, ttlMs?: number): void {
    const k = this.key(serverName, toolName, args);
    this.cache.set(k, {
      result,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  invalidate(serverName?: string): void {
    if (!serverName) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${serverName}::`)) {
        this.cache.delete(key);
      }
    }
  }

  get size(): number {
    return this.cache.size;
  }
}

// ---------------------------------------------------------------------------
// AI SDK wrapper — exposes a legacy-Client-shaped `callTool` over an
// `AISDKMcpClient` so `McpServerConnection.client.callTool(...)` works
// uniformly across production + test injection paths.
// ---------------------------------------------------------------------------

function wrapAISDKClient(aiClient: AISDKMcpClient): McpUnderlyingClient {
  // Materialize the AI SDK tool set lazily on first callTool. Cached for
  // the lifetime of the connection (cleared on disconnect via aiClient.close).
  let toolSetPromise: Promise<Record<string, { execute: (input: unknown, opts: unknown) => Promise<unknown> }>> | null = null;
  const getToolSet = () => {
    if (!toolSetPromise) {
      toolSetPromise = aiClient.tools().then((set) => set as unknown as Record<string, { execute: (input: unknown, opts: unknown) => Promise<unknown> }>);
    }
    return toolSetPromise;
  };

  return {
    async callTool({ name, arguments: args }) {
      const set = await getToolSet();
      const tool = set[name];
      if (!tool) {
        throw new Error(`MCP tool "${name}" not found on server`);
      }
      // AI SDK Tool.execute(input, options) returns CallToolResult for MCP
      // tools (matches the legacy { content, isError } shape verbatim per
      // the MCP spec). We pass minimal call options — the toolCallId +
      // messages are AI-SDK-engine-internal concerns that don't apply
      // when invoking out-of-band from the manager. The return is opaque
      // here; the manager re-shapes at the public boundary.
      return await tool.execute(args, {
        toolCallId: `mcp-${name}-${Date.now()}`,
        messages: [],
      } as unknown as Parameters<typeof tool.execute>[1]);
    },
    async close() {
      await aiClient.close();
    },
  };
}

// ---------------------------------------------------------------------------
// McpClientManager — multi-server connection registry. Public surface
// preserved verbatim; internals delegate to @ai-sdk/mcp's createMCPClient.
// ---------------------------------------------------------------------------

export class McpClientManager {
  private connections = new Map<string, McpServerConnection>();
  private readonly responseCache: McpResponseCache;

  constructor(opts?: { cacheTtlMs?: number }) {
    this.responseCache = new McpResponseCache(opts?.cacheTtlMs ?? 30_000);
  }

  /**
   * Connect to an MCP server and discover its tools.
   * If already connected to a server with this name, disconnects first.
   */
  async connect(config: McpServerConfig): Promise<McpServerConnection> {
    if (this.connections.has(config.name)) {
      await this.disconnect(config.name);
    }

    // AI SDK's MCPTransportConfig uses 'http' for streamable HTTP; the
    // legacy public field 'streamable-http' maps onto it.
    const aiTransportType: 'http' | 'sse' =
      config.transport === 'sse' ? 'sse' : 'http';

    let aiClient: AISDKMcpClient;
    try {
      aiClient = await createMCPClient({
        transport: {
          type: aiTransportType,
          url: config.url,
          ...(config.headers ? { headers: config.headers } : {}),
        },
        clientName: 'audric-engine',
        version: '0.1.0',
      });
    } catch (err) {
      throw err;
    }

    let tools: McpToolDef[];
    try {
      const listResult = await aiClient.listTools();
      tools = listResult.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as Record<string, unknown> | undefined,
      }));
    } catch (err) {
      try { await aiClient.close(); } catch { /* best-effort */ }
      throw err;
    }

    const conn: McpServerConnection = {
      config,
      client: wrapAISDKClient(aiClient),
      transport: aiClient, // opaque storage; close path goes through client.close()
      tools,
      status: 'connected',
    };

    this.connections.set(config.name, conn);
    return conn;
  }

  /** Disconnect from a server by name. */
  async disconnect(name: string): Promise<void> {
    const conn = this.connections.get(name);
    if (!conn) return;
    try {
      await conn.client.close();
    } catch { /* best-effort */ }
    conn.status = 'disconnected';
    conn.tools = [];
    this.connections.delete(name);
    this.responseCache.invalidate(name);
  }

  /** Disconnect from all servers. */
  async disconnectAll(): Promise<void> {
    const names = [...this.connections.keys()];
    await Promise.allSettled(names.map((n) => this.disconnect(n)));
  }

  /** Get a connection by server name. */
  getConnection(name: string): McpServerConnection | undefined {
    return this.connections.get(name);
  }

  /** Check if a server is connected. */
  isConnected(name: string): boolean {
    return this.connections.get(name)?.status === 'connected';
  }

  /** List all tool definitions across all connected servers. */
  listAllTools(): Array<{ serverName: string; tool: McpToolDef }> {
    const result: Array<{ serverName: string; tool: McpToolDef }> = [];
    for (const [name, conn] of this.connections) {
      if (conn.status !== 'connected') continue;
      for (const tool of conn.tools) {
        result.push({ serverName: name, tool });
      }
    }
    return result;
  }

  /**
   * Call a tool on a specific server.
   * Uses response cache for read-only servers.
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown> = {},
  ): Promise<McpCallResult> {
    const conn = this.connections.get(serverName);
    if (!conn) throw new Error(`MCP server "${serverName}" not connected`);
    if (conn.status !== 'connected') throw new Error(`MCP server "${serverName}" is ${conn.status}`);

    const cacheTtl = conn.config.cacheTtlMs ?? 30_000;
    if (conn.config.readOnly !== false && cacheTtl > 0) {
      const cached = this.responseCache.get(serverName, toolName, args);
      if (cached) return cached;
    }

    const rawResult = (await conn.client.callTool({ name: toolName, arguments: args })) as {
      content?: McpCallResult['content'];
      isError?: boolean;
    };

    const callResult: McpCallResult = {
      content: rawResult.content ?? [],
      isError: rawResult.isError,
    };

    if (conn.config.readOnly !== false && cacheTtl > 0) {
      this.responseCache.set(serverName, toolName, args, callResult, cacheTtl);
    }

    return callResult;
  }

  /** Get the response cache (for testing / manual invalidation). */
  get cache(): McpResponseCache {
    return this.responseCache;
  }

  /** Number of connected servers. */
  get serverCount(): number {
    let count = 0;
    for (const conn of this.connections.values()) {
      if (conn.status === 'connected') count++;
    }
    return count;
  }

  /** All server names. */
  get serverNames(): string[] {
    return [...this.connections.keys()];
  }
}
