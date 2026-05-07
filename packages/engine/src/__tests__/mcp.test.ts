import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { buildMcpTools, registerEngineTools } from '../mcp/index.js';
import { buildTool } from '../tool.js';
import type { Tool, ToolContext } from '../types.js';

const testTool: Tool = buildTool({
  name: 'test_action',
  description: 'A test tool',
  inputSchema: z.object({ value: z.string() }),
  jsonSchema: {
    type: 'object',
    properties: { value: { type: 'string' } },
    required: ['value'],
  },
  isReadOnly: true,
  async call(input) {
    return { data: { echoed: input.value } };
  },
});

const failTool: Tool = buildTool({
  name: 'fail_action',
  description: 'Always fails',
  inputSchema: z.object({}),
  jsonSchema: { type: 'object', properties: {} },
  isReadOnly: true,
  async call() {
    throw new Error('Tool crashed');
  },
});

describe('buildMcpTools', () => {
  const context: ToolContext = {};

  it('creates MCP descriptors with audric_ prefix', () => {
    const descriptors = buildMcpTools(context, [testTool]);
    expect(descriptors).toHaveLength(1);
    expect(descriptors[0].name).toBe('audric_test_action');
    expect(descriptors[0].description).toBe('A test tool');
  });

  it('handler returns JSON text content on success', async () => {
    const descriptors = buildMcpTools(context, [testTool]);
    const result = await descriptors[0].handler({ value: 'hello' });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text)).toEqual({ echoed: 'hello' });
    expect(result.isError).toBeUndefined();
  });

  it('handler returns isError on validation failure', async () => {
    const descriptors = buildMcpTools(context, [testTool]);
    const result = await descriptors[0].handler({ value: 123 }); // wrong type

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain('Invalid input');
  });

  it('handler returns isError when tool throws', async () => {
    const descriptors = buildMcpTools(context, [failTool]);
    const result = await descriptors[0].handler({});

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain('Tool crashed');
  });

  it('includes JSON schema from the tool', () => {
    const descriptors = buildMcpTools(context, [testTool]);
    expect(descriptors[0].inputSchema).toEqual({
      type: 'object',
      properties: { value: { type: 'string' } },
      required: ['value'],
    });
  });

  it('builds descriptors for multiple tools', () => {
    const descriptors = buildMcpTools(context, [testTool, failTool]);
    expect(descriptors).toHaveLength(2);
    expect(descriptors.map((d) => d.name)).toEqual(['audric_test_action', 'audric_fail_action']);
  });
});

describe('registerEngineTools', () => {
  it('calls server.tool for each engine tool', () => {
    const registered: { name: string; description: string }[] = [];
    const fakeServer = {
      tool(name: string, description: string, _schema: unknown, _handler: unknown) {
        registered.push({ name, description });
      },
    };

    registerEngineTools(fakeServer, {}, [testTool, failTool]);
    expect(registered).toHaveLength(2);
    expect(registered[0].name).toBe('audric_test_action');
    expect(registered[1].name).toBe('audric_fail_action');
  });
});
