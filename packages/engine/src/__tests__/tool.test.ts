import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineTool } from '../v2/define-tool.js';
import { toolsToDefinitions, findTool } from '../tool.js';

// ---------------------------------------------------------------------------
// Tool helper tests
//
// The `defineTool` factory itself is covered by `v2/define-tool.test.ts`.
// This file covers the two surviving helpers in `tool.ts` —
// `toolsToDefinitions` (Tool[] → Anthropic tool definition shape) and
// `findTool` (Tool[] → Tool | undefined by name).
// ---------------------------------------------------------------------------

describe('toolsToDefinitions', () => {
  it('converts tools to LLM-compatible definitions', () => {
    const tool = defineTool({
      name: 'test_tool',
      description: 'A test tool',
      inputSchema: z.object({}),
      async call() {
        return { data: {} };
      },
    });

    const defs = toolsToDefinitions([tool]);
    expect(defs).toHaveLength(1);
    expect(defs[0]).toEqual({
      name: 'test_tool',
      description: 'A test tool',
      input_schema: { type: 'object', properties: {}, required: [] },
    });
  });
});

describe('findTool', () => {
  const tools = [
    defineTool({
      name: 'alpha',
      description: 'Alpha tool',
      inputSchema: z.object({}),
      async call() {
        return { data: 'a' };
      },
    }),
    defineTool({
      name: 'beta',
      description: 'Beta tool',
      inputSchema: z.object({}),
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
