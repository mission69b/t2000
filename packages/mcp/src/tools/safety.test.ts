import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSafetyTools } from './safety.js';

function createMockAgent() {
  return {
    enforcer: {
      getConfig: vi.fn().mockReturnValue({
        locked: false,
        maxPerTx: 100,
        maxDailySend: 1000,
        dailyUsed: 350,
        dailyResetDate: '2026-02-19',
      }),
      set: vi.fn(),
      lock: vi.fn(),
      unlock: vi.fn(),
    },
  } as any;
}

describe('safety tools', () => {
  let server: McpServer;
  let agent: ReturnType<typeof createMockAgent>;
  let tools: Map<string, Function>;

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '0.0.1' });
    agent = createMockAgent();
    tools = new Map();

    const origTool = server.tool.bind(server) as (...args: any[]) => any;
    server.tool = ((...args: any[]) => {
      const name = args[0] as string;
      const handler = args[args.length - 1] as Function;
      tools.set(name, handler);
      return origTool(...args);
    }) as any;

    registerSafetyTools(server, agent);
  });

  it('should register 2 safety tools', () => {
    expect(tools.size).toBe(2);
    expect(tools.has('t2000_config')).toBe(true);
    expect(tools.has('t2000_lock')).toBe(true);
  });

  describe('t2000_config', () => {
    it('should show current config', async () => {
      const handler = tools.get('t2000_config')!;
      const result = await handler({ action: 'show' });
      const data = JSON.parse(result.content[0].text);
      expect(data.locked).toBe(false);
      expect(data.maxPerTx).toBe(100);
      expect(data.maxDailySend).toBe(1000);
      expect(data.dailyUsed).toBe(350);
    });

    it('should set maxPerTx', async () => {
      const handler = tools.get('t2000_config')!;
      const result = await handler({ action: 'set', key: 'maxPerTx', value: 500 });
      const data = JSON.parse(result.content[0].text);
      expect(data.updated).toBe(true);
      expect(data.key).toBe('maxPerTx');
      expect(data.value).toBe(500);
      expect(agent.enforcer.set).toHaveBeenCalledWith('maxPerTx', 500);
    });

    it('should set maxDailySend', async () => {
      const handler = tools.get('t2000_config')!;
      await handler({ action: 'set', key: 'maxDailySend', value: 2000 });
      expect(agent.enforcer.set).toHaveBeenCalledWith('maxDailySend', 2000);
    });

    it('should reject setting locked via config', async () => {
      const handler = tools.get('t2000_config')!;
      const result = await handler({ action: 'set', key: 'locked', value: true });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.message).toContain('Cannot set "locked"');
    });

    it('should reject unknown keys', async () => {
      const handler = tools.get('t2000_config')!;
      const result = await handler({ action: 'set', key: 'unknown', value: 100 });
      expect(result.isError).toBe(true);
    });

    it('should reject negative values', async () => {
      const handler = tools.get('t2000_config')!;
      const result = await handler({ action: 'set', key: 'maxPerTx', value: -10 });
      expect(result.isError).toBe(true);
    });

    it('should require key and value for set action', async () => {
      const handler = tools.get('t2000_config')!;
      const result = await handler({ action: 'set' });
      expect(result.isError).toBe(true);
    });
  });

  describe('t2000_lock', () => {
    it('should lock the agent', async () => {
      const handler = tools.get('t2000_lock')!;
      const result = await handler({});
      const data = JSON.parse(result.content[0].text);
      expect(data.locked).toBe(true);
      expect(data.message).toContain('t2000 unlock');
      expect(agent.enforcer.lock).toHaveBeenCalled();
    });
  });
});
