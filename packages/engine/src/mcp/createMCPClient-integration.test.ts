import { describe, it, expect, afterEach } from 'vitest';
import { createMCPClient, type MCPClient as AISDKMcpClient, type MCPTransport } from '@ai-sdk/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import { buildMcpTools } from './index.js';
import type { ToolContext, Tool } from '../types.js';

// ---------------------------------------------------------------------------
// SPEC 37 v0.7a Phase 4 (3.5) — `@t2000/mcp` consumed via createMCPClient
//
// Phase 4 proves the WIRE: @ai-sdk/mcp's `createMCPClient` can speak to
// any MCP server that exposes engine tools via the existing
// `buildMcpTools` descriptor format (which is what @t2000/mcp publishes).
// Phase 6 will close the "drink your own champagne" loop by wiring
// engine → @t2000/mcp → engine consumption end-to-end. Phase 4 only
// has to prove the wire — surgical-changes principle.
//
// The test uses the legacy `@modelcontextprotocol/sdk` `McpServer` +
// `InMemoryTransport` because:
//   - Standing up @t2000/mcp in-process would create a workspace cycle
//     (@t2000/mcp depends on @t2000/engine; engine cannot depend back
//     on @t2000/mcp without churning the build graph).
//   - The shape we care about is the JSON-RPC wire protocol, which is
//     identical regardless of which server library exposes it. If @ai-sdk/mcp's
//     `createMCPClient` can list + call tools registered via
//     `server.tool(name, desc, schema, handler)`, then it can consume
//     @t2000/mcp's `registerEngineTools(server, ctx)` output verbatim
//     (the latter is just a loop calling `server.tool(...)` for every
//     engine tool — see `mcp/index.ts:registerEngineTools`).
//
// The transports from @modelcontextprotocol/sdk's `InMemoryTransport`
// are structurally compatible with @ai-sdk/mcp's `MCPTransport` interface
// (both speak the same JSON-RPC `start`/`send`/`close`/`onmessage` shape).
// The cast through `unknown` is the boundary marker.
// ---------------------------------------------------------------------------

// Lightweight engine tool shape — used to exercise `buildMcpTools` and
// confirm its descriptor output round-trips through createMCPClient.
function fakeEngineTool(name: string, description: string): Tool {
  return {
    name,
    description,
    inputSchema: z.object({ amount: z.number() }) as unknown as Tool['inputSchema'],
    jsonSchema: {
      type: 'object',
      properties: { amount: { type: 'number' } },
      required: ['amount'],
    } as unknown as Tool['jsonSchema'],
    isReadOnly: true,
    isConcurrencySafe: true,
    permissionLevel: 'auto',
    flags: {},
    async call(input) {
      const parsed = input as { amount: number };
      return { data: { ok: true, doubled: parsed.amount * 2 } };
    },
  };
}

async function standUpServerWithTools(tools: Tool[]): Promise<{
  server: McpServer;
  clientTransport: InMemoryTransport;
  serverTransport: InMemoryTransport;
}> {
  const server = new McpServer({ name: 't2000-mcp-fixture', version: '0.0.1' });

  // Use buildMcpTools — the exact path @t2000/mcp uses to publish engine
  // tools. Proves the descriptor format round-trips through the AI SDK
  // client wire.
  const descriptors = buildMcpTools({} as ToolContext, tools);
  for (const desc of descriptors) {
    server.tool(
      desc.name,
      desc.description,
      // McpServer.tool() expects a Zod shape, not a JSON schema. For the
      // fixture we recreate the trivial Zod object from the engine tool's
      // input schema. Real @t2000/mcp publishes via the same descriptor
      // factory — the wire test below only asserts that AI SDK's
      // createMCPClient can discover + call these.
      { amount: z.number() },
      async (args) => desc.handler(args as Record<string, unknown>),
    );
  }

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  return { server, clientTransport, serverTransport };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createMCPClient ↔ buildMcpTools (Phase 4 wire test)', () => {
  let aiClient: AISDKMcpClient | null = null;

  afterEach(async () => {
    if (aiClient) {
      try { await aiClient.close(); } catch { /* best-effort */ }
      aiClient = null;
    }
  });

  it('discovers tools published via buildMcpTools (the @t2000/mcp publish path)', async () => {
    const tools = [
      fakeEngineTool('balance_check', 'Get wallet balance'),
      fakeEngineTool('send_transfer', 'Send USDC to a recipient'),
    ];

    const { clientTransport } = await standUpServerWithTools(tools);

    aiClient = await createMCPClient({
      transport: clientTransport as unknown as MCPTransport,
    });

    const listed = await aiClient.listTools();
    const names = listed.tools.map((t) => t.name).sort();
    // buildMcpTools prefixes engine tool names with `audric_`.
    expect(names).toEqual(['audric_balance_check', 'audric_send_transfer']);
  });

  it('round-trips an actual tool call through createMCPClient', async () => {
    const tools = [fakeEngineTool('doubler', 'Doubles a number')];

    const { clientTransport } = await standUpServerWithTools(tools);
    aiClient = await createMCPClient({
      transport: clientTransport as unknown as MCPTransport,
    });

    const toolSet = await aiClient.tools();
    const doubler = toolSet['audric_doubler'];
    expect(doubler).toBeDefined();

    const result = await doubler.execute(
      { amount: 21 },
      // Minimal options — see mcp/client.ts wrapAISDKClient for the
      // production equivalent.
      { toolCallId: 'test-1', messages: [] } as unknown as Parameters<typeof doubler.execute>[1],
    );

    // CallToolResult shape: { content: [{ type: 'text', text: '...' }], ... }
    const content = (result as { content: Array<{ type: string; text?: string }> }).content;
    expect(content[0].type).toBe('text');
    const parsed = JSON.parse(content[0].text!);
    expect(parsed).toEqual({ ok: true, doubled: 42 });
  });
});
