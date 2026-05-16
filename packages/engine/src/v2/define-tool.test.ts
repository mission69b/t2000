// ---------------------------------------------------------------------------
// v2/define-tool.test.ts — Phase 2 migration template tests
// ---------------------------------------------------------------------------
//
// SPEC 37 v0.7a Phase 2 Batch A Day 17.
//
// Goal of these tests: lock the BEHAVIORAL parity between buildTool +
// hand-written jsonSchema vs. defineTool + auto-generated jsonSchema.
// Tools migrating from buildTool → defineTool should see ZERO
// observable change in their Tool shape (besides jsonSchema source).
//
// The critical property: the auto-generated jsonSchema must be
// EQUIVALENT to what tool authors hand-write today (matching Anthropic's
// expected shape: object with `properties` and `required`).
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineTool } from './define-tool.js';

describe('defineTool', () => {
  describe('jsonSchema auto-generation', () => {
    it('generates jsonSchema matching the hand-written web_search shape', () => {
      // Mirrors the actual web_search Zod schema (pre-migration). The
      // generated jsonSchema should match (modulo additionalProperties /
      // $schema) the hand-written one shipped today.
      const inputSchema = z.object({
        query: z.string().describe('Search query'),
        count: z
          .number()
          .optional()
          .default(5)
          .describe('Number of results (1-10)'),
      });

      const tool = defineTool({
        name: 'web_search',
        description: 'Search the web',
        inputSchema,
        async call() {
          return { data: {}, displayText: 'ok' };
        },
      });

      expect(tool.jsonSchema.type).toBe('object');
      expect(tool.jsonSchema.properties).toHaveProperty('query');
      expect(tool.jsonSchema.properties).toHaveProperty('count');
      const qProp = tool.jsonSchema.properties.query as {
        type: string;
        description?: string;
      };
      expect(qProp.type).toBe('string');
      expect(qProp.description).toBe('Search query');
      const cProp = tool.jsonSchema.properties.count as {
        type: string;
        description?: string;
        default?: number;
      };
      expect(cProp.type).toBe('number');
      expect(cProp.description).toBe('Number of results (1-10)');
      expect(cProp.default).toBe(5);
      // `query` is required; `count` has .default() so is NOT required
      expect(tool.jsonSchema.required).toEqual(['query']);
    });

    it('handles plain objects with no optional fields', () => {
      const inputSchema = z.object({
        address: z.string().describe('Sui address'),
      });
      const tool = defineTool({
        name: 'balance_check',
        description: 'Check balance',
        inputSchema,
        async call() {
          return { data: {}, displayText: 'ok' };
        },
      });
      expect(tool.jsonSchema.required).toEqual(['address']);
    });

    it('handles empty input schemas (no properties)', () => {
      const inputSchema = z.object({});
      const tool = defineTool({
        name: 'no_args',
        description: 'Takes no arguments',
        inputSchema,
        async call() {
          return { data: {}, displayText: 'ok' };
        },
      });
      expect(tool.jsonSchema.type).toBe('object');
      expect(tool.jsonSchema.properties).toEqual({});
      expect(tool.jsonSchema.required).toEqual([]);
    });

    it('handles enum fields', () => {
      const inputSchema = z.object({
        asset: z.enum(['USDC', 'USDsui']).describe('Stable to save'),
      });
      const tool = defineTool({
        name: 'save_test',
        description: 'Save',
        inputSchema,
        async call() {
          return { data: {}, displayText: 'ok' };
        },
      });
      const prop = tool.jsonSchema.properties.asset as {
        type: string;
        enum: string[];
        description?: string;
      };
      expect(prop.type).toBe('string');
      expect(prop.enum).toEqual(['USDC', 'USDsui']);
      expect(prop.description).toBe('Stable to save');
    });

    it('throws if inputSchema is not a z.object', () => {
      // Non-object root would produce a tool spec Anthropic rejects.
      // Better to fail loudly at tool-construction time.
      const badSchema = z.string();
      expect(() =>
        defineTool({
          name: 'bad',
          description: 'Bad',
          inputSchema: badSchema as unknown as z.ZodObject<Record<string, never>>,
          async call() {
            return { data: {}, displayText: 'ok' };
          },
        }),
      ).toThrow(/must be a z\.object/);
    });
  });

  describe('Tool shape parity', () => {
    it('preserves all buildTool defaults', () => {
      const tool = defineTool({
        name: 'read_tool',
        description: 'A read',
        inputSchema: z.object({ x: z.string() }),
        async call() {
          return { data: {}, displayText: 'ok' };
        },
      });
      // Default for read tools — these MUST stay identical to buildTool
      // so engine behavior doesn't shift.
      expect(tool.isReadOnly).toBe(true);
      expect(tool.isConcurrencySafe).toBe(true);
      expect(tool.permissionLevel).toBe('auto');
      expect(tool.flags).toEqual({});
      expect(tool.preflight).toBeUndefined();
      expect(tool.maxResultSizeChars).toBeUndefined();
      expect(tool.cacheable).toBeUndefined();
    });

    it('preserves explicit metadata (maxResultSizeChars, isReadOnly: false, etc.)', () => {
      const tool = defineTool({
        name: 'write_tool',
        description: 'A write',
        inputSchema: z.object({ amount: z.number() }),
        isReadOnly: false,
        maxResultSizeChars: 4_000,
        async call() {
          return { data: {}, displayText: 'ok' };
        },
      });
      expect(tool.isReadOnly).toBe(false);
      expect(tool.isConcurrencySafe).toBe(false);
      expect(tool.permissionLevel).toBe('confirm');
      expect(tool.maxResultSizeChars).toBe(4_000);
    });

    it('preserves preflight', () => {
      const tool = defineTool({
        name: 'with_preflight',
        description: 'has preflight',
        inputSchema: z.object({ amount: z.number() }),
        isReadOnly: false,
        preflight: (input) =>
          input.amount > 0
            ? { valid: true }
            : { valid: false, error: 'amount must be positive' },
        async call() {
          return { data: {}, displayText: 'ok' };
        },
      });
      expect(tool.preflight).toBeDefined();
      expect(tool.preflight!({ amount: 5 })).toEqual({ valid: true });
      expect(tool.preflight!({ amount: -1 })).toEqual({
        valid: false,
        error: 'amount must be positive',
      });
    });

    it('call function is invoked with input + context unchanged', async () => {
      let received: { input: unknown; ctx: unknown } | undefined;
      const tool = defineTool({
        name: 'echo',
        description: 'echoes',
        inputSchema: z.object({ msg: z.string() }),
        async call(input, ctx) {
          received = { input, ctx };
          return { data: input, displayText: input.msg };
        },
      });
      const result = await tool.call(
        { msg: 'hello' },
        { walletAddress: '0xabc' } as never,
      );
      expect(received).toEqual({
        input: { msg: 'hello' },
        ctx: { walletAddress: '0xabc' },
      });
      expect(result).toEqual({ data: { msg: 'hello' }, displayText: 'hello' });
    });
  });
});
