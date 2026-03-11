import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPrompts } from './prompts.js';

describe('prompts', () => {
  let server: McpServer;
  let prompts: Map<string, Function>;

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '0.0.1' });
    prompts = new Map();

    const origPrompt = server.prompt.bind(server);
    server.prompt = ((...args: any[]) => {
      const name = args[0] as string;
      const handler = args[args.length - 1] as Function;
      prompts.set(name, handler);
      return origPrompt(...args);
    }) as any;

    registerPrompts(server);
  });

  it('should register 3 prompts', () => {
    expect(prompts.size).toBe(3);
    expect(prompts.has('financial-report')).toBe(true);
    expect(prompts.has('optimize-yield')).toBe(true);
    expect(prompts.has('send-money')).toBe(true);
  });

  it('financial-report should return valid message array', async () => {
    const handler = prompts.get('financial-report')!;
    const result = await handler({});
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[0].content.text).toContain('t2000_balance');
    expect(result.messages[0].content.text).toContain('t2000_positions');
  });

  it('optimize-yield should return valid message array', async () => {
    const handler = prompts.get('optimize-yield')!;
    const result = await handler({});
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.text).toContain('t2000_rebalance');
  });

  it('send-money should return valid message with context', async () => {
    const handler = prompts.get('send-money')!;
    const result = await handler({ to: '0xabc', amount: 25 });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.text).toContain('0xabc');
    expect(result.messages[0].content.text).toContain('$25');
  });

  it('send-money should work without args', async () => {
    const handler = prompts.get('send-money')!;
    const result = await handler({});
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.text).toContain('t2000_send');
  });
});
