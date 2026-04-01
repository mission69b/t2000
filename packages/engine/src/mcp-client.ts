import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { Tool as McpToolDef } from '@modelcontextprotocol/sdk/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface McpServerConfig {
  /** Human-readable server name, used as tool namespace prefix. */
  name: string;
  /** MCP server URL (Streamable HTTP or SSE endpoint). */
  url: string;
  /** Transport type. Defaults to 'streamable-http'. */
  transport?: 'streamable-http' | 'sse';
  /** Response cache TTL in ms. Default 30_000 (30s). */
  cacheTtlMs?: number;
  /** Whether all tools from this server are read-only. Default true. */
  readOnly?: boolean;
}

export interface McpServerConnection {
  config: McpServerConfig;
  client: Client;
  transport: Transport;
  tools: McpToolDef[];
  status: 'connected' | 'disconnected' | 'error';
  lastError?: string;
}

export interface McpCallResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
}

// ---------------------------------------------------------------------------
// Response cache
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
// McpClientManager — multi-server connection registry
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

    const client = new Client(
      { name: 'audric-engine', version: '0.1.0' },
      { capabilities: {} },
    );

    const transportType = config.transport ?? 'streamable-http';
    const url = new URL(config.url);

    const transport = transportType === 'sse'
      ? new SSEClientTransport(url)
      : new StreamableHTTPClientTransport(url, {
          reconnectionOptions: {
            maxReconnectionDelay: 30_000,
            initialReconnectionDelay: 1_000,
            reconnectionDelayGrowFactor: 1.5,
            maxRetries: 3,
          },
        });

    const conn: McpServerConnection = {
      config,
      client,
      transport,
      tools: [],
      status: 'disconnected',
    };

    try {
      await client.connect(transport);
      conn.status = 'connected';

      const { tools } = await client.listTools();
      conn.tools = tools;
    } catch (err) {
      try { await client.close(); } catch { /* best-effort */ }
      throw err;
    }

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

    const result = await conn.client.callTool({ name: toolName, arguments: args });

    const callResult: McpCallResult = {
      content: (result.content ?? []) as McpCallResult['content'],
      isError: result.isError as boolean | undefined,
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
