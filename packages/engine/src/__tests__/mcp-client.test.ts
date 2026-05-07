import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import { McpClientManager, McpResponseCache } from '../mcp/client.js';
import { adaptMcpTool, adaptAllMcpTools, adaptAllServerTools } from '../mcp/tool-adapter.js';

// ---------------------------------------------------------------------------
// Helper: create a mock MCP server + linked in-memory transports
// ---------------------------------------------------------------------------

function createMockServer() {
  const server = new McpServer({ name: 'test-server', version: '1.0.0' });

  server.tool('get_balance', 'Get account balance', { address: z.string() }, async ({ address }) => ({
    content: [{ type: 'text', text: JSON.stringify({ available: 100, savings: 50, address }) }],
  }));

  server.tool('get_rates', 'Get lending rates', {}, async () => ({
    content: [{ type: 'text', text: JSON.stringify({ USDC: { saveApy: 0.048, borrowApy: 0.065 } }) }],
  }));

  server.tool('failing_tool', 'Always fails', {}, async () => ({
    content: [{ type: 'text', text: 'Something went wrong' }],
    isError: true,
  }));

  return server;
}

async function connectInMemory(server: McpServer) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
  await client.connect(clientTransport);

  return { client, clientTransport, serverTransport };
}

// ---------------------------------------------------------------------------
// McpResponseCache
// ---------------------------------------------------------------------------

describe('McpResponseCache', () => {
  it('caches and retrieves results', () => {
    const cache = new McpResponseCache(30_000);
    const result = { content: [{ type: 'text', text: '{"ok":true}' }] };

    cache.set('navi', 'get_rates', {}, result);
    expect(cache.get('navi', 'get_rates', {})).toEqual(result);
  });

  it('returns null for missing entries', () => {
    const cache = new McpResponseCache();
    expect(cache.get('navi', 'get_rates', {})).toBeNull();
  });

  it('expires entries after TTL', async () => {
    const cache = new McpResponseCache(50);
    cache.set('navi', 'get_rates', {}, { content: [] });

    expect(cache.get('navi', 'get_rates', {})).not.toBeNull();
    await new Promise((r) => setTimeout(r, 60));
    expect(cache.get('navi', 'get_rates', {})).toBeNull();
  });

  it('differentiates by arguments', () => {
    const cache = new McpResponseCache();
    const r1 = { content: [{ type: 'text', text: 'a' }] };
    const r2 = { content: [{ type: 'text', text: 'b' }] };

    cache.set('s', 'tool', { id: 1 }, r1);
    cache.set('s', 'tool', { id: 2 }, r2);

    expect(cache.get('s', 'tool', { id: 1 })).toEqual(r1);
    expect(cache.get('s', 'tool', { id: 2 })).toEqual(r2);
  });

  it('invalidates by server name', () => {
    const cache = new McpResponseCache();
    cache.set('navi', 'a', {}, { content: [] });
    cache.set('navi', 'b', {}, { content: [] });
    cache.set('other', 'c', {}, { content: [] });

    cache.invalidate('navi');
    expect(cache.get('navi', 'a', {})).toBeNull();
    expect(cache.get('navi', 'b', {})).toBeNull();
    expect(cache.get('other', 'c', {})).not.toBeNull();
  });

  it('invalidates all', () => {
    const cache = new McpResponseCache();
    cache.set('a', 'x', {}, { content: [] });
    cache.set('b', 'y', {}, { content: [] });

    cache.invalidate();
    expect(cache.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// In-memory MCP client+server integration
// ---------------------------------------------------------------------------

describe('MCP client+server integration (in-memory)', () => {
  let server: McpServer;
  let client: Client;

  beforeEach(async () => {
    server = createMockServer();
    const conn = await connectInMemory(server);
    client = conn.client;
  });

  afterEach(async () => {
    await client.close();
  });

  it('discovers tools from the server', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('get_balance');
    expect(names).toContain('get_rates');
    expect(names).toContain('failing_tool');
  });

  it('calls a tool and gets a result', async () => {
    const result = await client.callTool({
      name: 'get_balance',
      arguments: { address: '0xabc' },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.available).toBe(100);
    expect(parsed.address).toBe('0xabc');
  });

  it('returns isError for failing tools', async () => {
    const result = await client.callTool({ name: 'failing_tool', arguments: {} });
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// adaptMcpTool
// ---------------------------------------------------------------------------

describe('adaptMcpTool', () => {
  let server: McpServer;
  let client: Client;
  let manager: McpClientManager;

  beforeEach(async () => {
    server = createMockServer();
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);

    manager = new McpClientManager();
    // Manually set up a connection using in-memory transport
    const mcpClient = new Client({ name: 'test', version: '1.0.0' }, { capabilities: {} });
    await mcpClient.connect(ct);
    client = mcpClient;

    const { tools } = await mcpClient.listTools();
    // Inject connection directly for testing (bypasses HTTP transport)
    (manager as any).connections.set('navi', {
      config: { name: 'navi', url: 'http://localhost', readOnly: true, cacheTtlMs: 0 },
      client: mcpClient,
      transport: ct,
      tools,
      status: 'connected',
    });
  });

  afterEach(async () => {
    await client.close();
  });

  it('creates a namespaced engine Tool', () => {
    const conn = manager.getConnection('navi')!;
    const mcpTool = conn.tools.find((t) => t.name === 'get_balance')!;
    const engineTool = adaptMcpTool(mcpTool, { manager, serverName: 'navi' });

    expect(engineTool.name).toBe('navi_get_balance');
    expect(engineTool.isReadOnly).toBe(true);
    expect(engineTool.permissionLevel).toBe('auto');
    expect(engineTool.isConcurrencySafe).toBe(true);
    expect(engineTool.description).toBe('Get account balance');
  });

  it('calls the MCP server when invoked', async () => {
    const conn = manager.getConnection('navi')!;
    const mcpTool = conn.tools.find((t) => t.name === 'get_balance')!;
    const engineTool = adaptMcpTool(mcpTool, {
      manager,
      serverName: 'navi',
    });

    const result = await engineTool.call({ address: '0x123' }, {});
    const data = result.data as { available: number; address: string };
    expect(data.available).toBe(100);
    expect(data.address).toBe('0x123');
  });

  it('propagates errors from the MCP server', async () => {
    const conn = manager.getConnection('navi')!;
    const mcpTool = conn.tools.find((t) => t.name === 'failing_tool')!;
    const engineTool = adaptMcpTool(mcpTool, { manager, serverName: 'navi' });

    const result = await engineTool.call({}, {});
    expect(result.data).toEqual({ error: 'Something went wrong' });
  });

  it('respects per-tool overrides', () => {
    const conn = manager.getConnection('navi')!;
    const mcpTool = conn.tools.find((t) => t.name === 'get_balance')!;
    const engineTool = adaptMcpTool(mcpTool, {
      manager,
      serverName: 'navi',
      toolOverrides: {
        get_balance: {
          isReadOnly: false,
          permissionLevel: 'confirm',
          description: 'Custom description',
        },
      },
    });

    expect(engineTool.isReadOnly).toBe(false);
    expect(engineTool.permissionLevel).toBe('confirm');
    expect(engineTool.description).toBe('Custom description');
  });
});

// ---------------------------------------------------------------------------
// adaptAllMcpTools / adaptAllServerTools
// ---------------------------------------------------------------------------

describe('adaptAllMcpTools', () => {
  let server: McpServer;
  let client: Client;
  let manager: McpClientManager;

  beforeEach(async () => {
    server = createMockServer();
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);

    manager = new McpClientManager();
    const mcpClient = new Client({ name: 'test', version: '1.0.0' }, { capabilities: {} });
    await mcpClient.connect(ct);
    client = mcpClient;

    const { tools } = await mcpClient.listTools();
    (manager as any).connections.set('navi', {
      config: { name: 'navi', url: 'http://localhost', readOnly: true, cacheTtlMs: 0 },
      client: mcpClient,
      transport: ct,
      tools,
      status: 'connected',
    });
  });

  afterEach(async () => {
    await client.close();
  });

  it('adapts all tools from a server', () => {
    const tools = adaptAllMcpTools({ manager, serverName: 'navi' });
    expect(tools.length).toBe(3);
    expect(tools.map((t) => t.name)).toEqual([
      'navi_get_balance',
      'navi_get_rates',
      'navi_failing_tool',
    ]);
  });

  it('returns empty array for disconnected server', () => {
    const tools = adaptAllMcpTools({ manager, serverName: 'nonexistent' });
    expect(tools).toEqual([]);
  });

  it('adaptAllServerTools works across multiple servers', async () => {
    // Add a second server
    const server2 = new McpServer({ name: 'cetus', version: '1.0.0' });
    server2.tool('get_quote', 'Get swap quote', { tokenIn: z.string(), tokenOut: z.string() }, async () => ({
      content: [{ type: 'text', text: JSON.stringify({ price: 1.05 }) }],
    }));

    const [ct2, st2] = InMemoryTransport.createLinkedPair();
    await server2.connect(st2);
    const client2 = new Client({ name: 'test2', version: '1.0.0' }, { capabilities: {} });
    await client2.connect(ct2);
    const { tools: tools2 } = await client2.listTools();

    (manager as any).connections.set('cetus', {
      config: { name: 'cetus', url: 'http://localhost', readOnly: true, cacheTtlMs: 0 },
      client: client2,
      transport: ct2,
      tools: tools2,
      status: 'connected',
    });

    const allTools = adaptAllServerTools(manager);
    const names = allTools.map((t) => t.name);
    expect(names).toContain('navi_get_balance');
    expect(names).toContain('navi_get_rates');
    expect(names).toContain('cetus_get_quote');
    expect(allTools.length).toBe(4); // 3 from navi + 1 from cetus

    await client2.close();
  });
});

// ---------------------------------------------------------------------------
// McpClientManager (cache integration)
// ---------------------------------------------------------------------------

describe('McpClientManager cache integration', () => {
  let server: McpServer;
  let client: Client;
  let manager: McpClientManager;

  beforeEach(async () => {
    server = createMockServer();
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);

    manager = new McpClientManager({ cacheTtlMs: 30_000 });
    const mcpClient = new Client({ name: 'test', version: '1.0.0' }, { capabilities: {} });
    await mcpClient.connect(ct);
    client = mcpClient;

    const { tools } = await mcpClient.listTools();
    (manager as any).connections.set('navi', {
      config: { name: 'navi', url: 'http://localhost', readOnly: true, cacheTtlMs: 30_000 },
      client: mcpClient,
      transport: ct,
      tools,
      status: 'connected',
    });
  });

  afterEach(async () => {
    await client.close();
  });

  it('caches tool call results for read-only servers', async () => {
    const r1 = await manager.callTool('navi', 'get_rates', {});
    expect(manager.cache.size).toBe(1);

    const r2 = await manager.callTool('navi', 'get_rates', {});
    expect(r2).toEqual(r1);
  });

  it('throws for unknown server', async () => {
    await expect(manager.callTool('unknown', 'tool', {})).rejects.toThrow('not connected');
  });

  it('reports server count and names', () => {
    expect(manager.serverCount).toBe(1);
    expect(manager.serverNames).toEqual(['navi']);
  });

  it('lists all tools across servers', () => {
    const all = manager.listAllTools();
    expect(all.length).toBe(3);
    expect(all.every((t) => t.serverName === 'navi')).toBe(true);
  });

  it('isConnected returns correct status', () => {
    expect(manager.isConnected('navi')).toBe(true);
    expect(manager.isConnected('nonexistent')).toBe(false);
  });

  it('skips cache for non-read-only servers', async () => {
    // Reconfigure as non-read-only
    const conn = manager.getConnection('navi')!;
    (conn.config as any).readOnly = false;

    await manager.callTool('navi', 'get_rates', {});
    expect(manager.cache.size).toBe(0);

    await manager.callTool('navi', 'get_rates', {});
    expect(manager.cache.size).toBe(0);
  });

  it('disconnectAll cleans up all servers', async () => {
    // Add a second injected connection
    const server2 = new McpServer({ name: 's2', version: '1.0.0' });
    server2.tool('ping', 'Ping', {}, async () => ({
      content: [{ type: 'text', text: 'pong' }],
    }));
    const [ct2, st2] = InMemoryTransport.createLinkedPair();
    await server2.connect(st2);
    const client2 = new Client({ name: 't2', version: '1.0.0' }, { capabilities: {} });
    await client2.connect(ct2);
    const { tools: tools2 } = await client2.listTools();

    (manager as any).connections.set('other', {
      config: { name: 'other', url: 'http://localhost', readOnly: true, cacheTtlMs: 30_000 },
      client: client2,
      transport: ct2,
      tools: tools2,
      status: 'connected',
    });

    expect(manager.serverCount).toBe(2);
    await manager.disconnectAll();
    expect(manager.serverCount).toBe(0);
    expect(manager.serverNames).toEqual([]);
  });
});
