import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { buildTool, toolsToDefinitions, findTool } from '../tool.js';

describe('buildTool', () => {
  const echoTool = buildTool({
    name: 'echo',
    description: 'Echoes input',
    inputSchema: z.object({ message: z.string() }),
    jsonSchema: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    },
    async call(input) {
      return { data: { echoed: input.message } };
    },
  });

  it('creates a read-only tool by default', () => {
    expect(echoTool.isReadOnly).toBe(true);
    expect(echoTool.isConcurrencySafe).toBe(true);
    expect(echoTool.permissionLevel).toBe('auto');
  });

  it('creates a write tool with confirm permission', () => {
    const writeTool = buildTool({
      name: 'transfer',
      description: 'Transfers funds',
      inputSchema: z.object({ to: z.string(), amount: z.number() }),
      jsonSchema: {
        type: 'object',
        properties: {
          to: { type: 'string' },
          amount: { type: 'number' },
        },
        required: ['to', 'amount'],
      },
      isReadOnly: false,
      async call() {
        return { data: { success: true } };
      },
    });

    expect(writeTool.isReadOnly).toBe(false);
    expect(writeTool.isConcurrencySafe).toBe(false);
    expect(writeTool.permissionLevel).toBe('confirm');
  });

  it('calls the tool and returns result', async () => {
    const result = await echoTool.call({ message: 'hello' }, {});
    expect(result.data).toEqual({ echoed: 'hello' });
  });
});

describe('toolsToDefinitions', () => {
  it('converts tools to LLM-compatible definitions', () => {
    const tool = buildTool({
      name: 'test_tool',
      description: 'A test tool',
      inputSchema: z.object({}),
      jsonSchema: { type: 'object', properties: {} },
      async call() {
        return { data: {} };
      },
    });

    const defs = toolsToDefinitions([tool]);
    expect(defs).toHaveLength(1);
    expect(defs[0]).toEqual({
      name: 'test_tool',
      description: 'A test tool',
      input_schema: { type: 'object', properties: {} },
    });
  });
});

describe('findTool', () => {
  const tools = [
    buildTool({
      name: 'alpha',
      description: 'Alpha tool',
      inputSchema: z.object({}),
      jsonSchema: { type: 'object', properties: {} },
      async call() {
        return { data: 'a' };
      },
    }),
    buildTool({
      name: 'beta',
      description: 'Beta tool',
      inputSchema: z.object({}),
      jsonSchema: { type: 'object', properties: {} },
      async call() {
        return { data: 'b' };
      },
    }),
  ];

  it('finds a tool by name', () => {
    expect(findTool(tools, 'alpha')?.name).toBe('alpha');
    expect(findTool(tools, 'beta')?.name).toBe('beta');
  });

  it('returns undefined for unknown tools', () => {
    expect(findTool(tools, 'gamma')).toBeUndefined();
  });
});
