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

  it('should register 12 prompts', () => {
    expect(prompts.size).toBe(12);
    expect(prompts.has('financial-report')).toBe(true);
    expect(prompts.has('optimize-yield')).toBe(true);
    expect(prompts.has('send-money')).toBe(true);
    expect(prompts.has('budget-check')).toBe(true);
    expect(prompts.has('savings-strategy')).toBe(true);
    expect(prompts.has('morning-briefing')).toBe(true);
    expect(prompts.has('what-if')).toBe(true);
    expect(prompts.has('sweep')).toBe(true);
    expect(prompts.has('risk-check')).toBe(true);
    expect(prompts.has('weekly-recap')).toBe(true);
    expect(prompts.has('dca-advisor')).toBe(true);
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

  it('budget-check should include balance and config tools', async () => {
    const handler = prompts.get('budget-check')!;
    const result = await handler({ amount: 50 });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.text).toContain('t2000_balance');
    expect(result.messages[0].content.text).toContain('t2000_config');
    expect(result.messages[0].content.text).toContain('$50');
  });

  it('budget-check should work without amount', async () => {
    const handler = prompts.get('budget-check')!;
    const result = await handler({});
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.text).toContain('spending check');
  });

  it('savings-strategy should include balance, positions, and rates tools', async () => {
    const handler = prompts.get('savings-strategy')!;
    const result = await handler({});
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.text).toContain('t2000_balance');
    expect(result.messages[0].content.text).toContain('t2000_positions');
    expect(result.messages[0].content.text).toContain('t2000_rates');
    expect(result.messages[0].content.text).toContain('t2000_save');
  });
});
