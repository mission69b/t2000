import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPrompts } from './prompts.js';

describe('prompts', () => {
  let server: McpServer;
  let prompts: Map<string, Function>;

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '0.0.1' });
    prompts = new Map();

    const origPrompt = server.prompt.bind(server) as (...args: any[]) => any;
    server.prompt = ((...args: any[]) => {
      const name = args[0] as string;
      const handler = args[args.length - 1] as Function;
      prompts.set(name, handler);
      return origPrompt(...args);
    }) as any;

    registerPrompts(server);
  });

  it('should register 16 prompts', () => {
    expect(prompts.size).toBe(15);
    expect(prompts.has('financial-report')).toBe(true);
    expect(prompts.has('optimize-yield')).toBe(true);
    expect(prompts.has('send-money')).toBe(true);
    expect(prompts.has('budget-check')).toBe(true);
    expect(prompts.has('savings-strategy')).toBe(true);
    expect(prompts.has('what-if')).toBe(true);
    expect(prompts.has('sweep')).toBe(true);
    expect(prompts.has('risk-check')).toBe(true);
    expect(prompts.has('weekly-recap')).toBe(true);
    expect(prompts.has('claim-rewards')).toBe(true);
    expect(prompts.has('safeguards')).toBe(true);
    expect(prompts.has('onboarding')).toBe(true);
    expect(prompts.has('emergency')).toBe(true);
    expect(prompts.has('optimize-all')).toBe(true);
    expect(prompts.has('savings-goal')).toBe(true);
  });

  it('financial-report should return valid message array', async () => {
    const handler = prompts.get('financial-report')!;
    const result = await handler({});
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[0].content.text).toContain('t2000_overview');
    expect(result.messages[0].content.text).toContain('t2000_rates');
  });

  it('optimize-yield should return valid message array', async () => {
    const handler = prompts.get('optimize-yield')!;
    const result = await handler({});
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.text).toContain('t2000_overview');
    expect(result.messages[0].content.text).toContain('t2000_all_rates');
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

  it('savings-strategy should use t2000_overview and t2000_all_rates', async () => {
    const handler = prompts.get('savings-strategy')!;
    const result = await handler({});
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.text).toContain('t2000_overview');
    expect(result.messages[0].content.text).toContain('t2000_all_rates');
    expect(result.messages[0].content.text).toContain('t2000_save');
  });

  it('claim-rewards should reference claim tool and positions', async () => {
    const handler = prompts.get('claim-rewards')!;
    const result = await handler({});
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.text).toContain('t2000_claim_rewards');
    expect(result.messages[0].content.text).toContain('t2000_positions');
  });

  it('safeguards should reference config and lock tools', async () => {
    const handler = prompts.get('safeguards')!;
    const result = await handler({});
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.text).toContain('t2000_config');
    expect(result.messages[0].content.text).toContain('t2000_lock');
  });

  it('morning-briefing prompt was retired in April 2026 simplification', () => {
    expect(prompts.has('morning-briefing')).toBe(false);
  });

  it('financial-report should use t2000_overview', async () => {
    const handler = prompts.get('financial-report')!;
    const result = await handler({});
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.text).toContain('t2000_overview');
    expect(result.messages[0].content.text).toContain('t2000_rates');
  });

  it('onboarding should reference t2000_overview and t2000_deposit_info', async () => {
    const handler = prompts.get('onboarding')!;
    const result = await handler({});
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.text).toContain('t2000_overview');
    expect(result.messages[0].content.text).toContain('t2000_deposit_info');
  });

  it('emergency should reference t2000_lock immediately', async () => {
    const handler = prompts.get('emergency')!;
    const result = await handler({});
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.text).toContain('t2000_lock');
    expect(result.messages[0].content.text).toContain('EMERGENCY');
  });

  it('optimize-all should reference all optimization levers', async () => {
    const handler = prompts.get('optimize-all')!;
    const result = await handler({});
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.text).toContain('t2000_overview');
    expect(result.messages[0].content.text).toContain('t2000_all_rates');
  });

  it('savings-goal should accept target and months parameters', async () => {
    const handler = prompts.get('savings-goal')!;
    const result = await handler({ target: 1000, months: 6 });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.text).toContain('$1000');
    expect(result.messages[0].content.text).toContain('6 months');
    expect(result.messages[0].content.text).toContain('t2000_overview');
  });
});
