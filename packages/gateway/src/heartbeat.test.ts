import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HeartbeatScheduler, createDefaultTasks, type HeartbeatTask, type HeartbeatResult } from './heartbeat.js';
import type { Channel } from './channels/types.js';
import type { GatewayConfig } from './config.js';
import type { T2000 } from '@t2000/sdk';

function createMockAgent(overrides: Record<string, unknown> = {}): T2000 {
  return {
    balance: vi.fn(async () => ({
      available: 1000, savings: 500, debt: 0,
      gasReserve: { sui: 1, usdEquiv: 3 }, net: 1500, total: 1500,
    })),
    getPortfolio: vi.fn(async () => ({
      positions: [
        { asset: 'SUI', currentValue: 300, earning: true, earningApy: 3.5, earningProtocol: 'NAVI' },
      ],
      totalValue: 300, unrealizedPnL: 15,
    })),
    earnings: vi.fn(async () => ({
      totalYieldEarned: 10, dailyEarning: 0.12,
    })),
    healthFactor: vi.fn(async () => ({ healthFactor: 2.5 })),
    rebalance: vi.fn(async () => ({
      executed: false, currentApy: 3.0, newApy: 4.5,
      fromProtocol: 'NAVI', toProtocol: 'Suilend',
    })),
    investRebalance: vi.fn(async () => ({
      moves: [],
    })),
    getAutoInvestStatus: vi.fn(() => ({
      pendingRuns: [],
    })),
    runAutoInvest: vi.fn(async () => ({
      executed: [],
    })),
    ...overrides,
  } as unknown as T2000;
}

function mockChannel(): Channel {
  return {
    id: 'mock',
    name: 'Mock',
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    send: vi.fn(async () => {}),
    onMessage: vi.fn(),
  };
}

function createTestConfig(): GatewayConfig {
  return {
    llm: { provider: 'anthropic', apiKey: 'test' },
    channels: { webchat: { enabled: true, port: 2000 } },
    heartbeat: {
      morningBriefing: { enabled: true, schedule: '0 8 * * *' },
      yieldMonitor: { enabled: true, schedule: '*/30 * * * *' },
      dcaExecutor: { enabled: true, schedule: '0 9 * * 1' },
      healthCheck: { enabled: true, schedule: '*/15 * * * *' },
    },
  };
}

describe('HeartbeatScheduler', () => {
  it('registers tasks', () => {
    const channel = mockChannel();
    const scheduler = new HeartbeatScheduler(createMockAgent(), [channel], () => ({ inputTokens: 0, outputTokens: 0 }));

    const task: HeartbeatTask = {
      id: 'test', name: 'Test', schedule: '* * * * *', enabled: true,
      run: async () => ({ message: 'test' }),
    };
    scheduler.registerTask(task);
    expect(scheduler.getTaskCount()).toBe(1);
  });

  it('counts only enabled tasks', () => {
    const channel = mockChannel();
    const scheduler = new HeartbeatScheduler(createMockAgent(), [channel], () => ({ inputTokens: 0, outputTokens: 0 }));

    scheduler.registerTask({ id: 'a', name: 'A', schedule: '* * * * *', enabled: true, run: async () => ({ message: '' }) });
    scheduler.registerTask({ id: 'b', name: 'B', schedule: '* * * * *', enabled: false, run: async () => ({ message: '' }) });
    scheduler.registerTask({ id: 'c', name: 'C', schedule: '* * * * *', enabled: true, run: async () => ({ message: '' }) });
    expect(scheduler.getTaskCount()).toBe(2);
  });

  it('starts without error', () => {
    const channel = mockChannel();
    const scheduler = new HeartbeatScheduler(createMockAgent(), [channel], () => ({ inputTokens: 0, outputTokens: 0 }));
    scheduler.registerTask({ id: 't', name: 'T', schedule: '0 8 * * *', enabled: true, run: async () => ({ message: '' }) });
    expect(() => scheduler.start()).not.toThrow();
    scheduler.stop();
  });

  it('stops cleanly', () => {
    const channel = mockChannel();
    const scheduler = new HeartbeatScheduler(createMockAgent(), [channel], () => ({ inputTokens: 0, outputTokens: 0 }));
    scheduler.registerTask({ id: 't', name: 'T', schedule: '0 8 * * *', enabled: true, run: async () => ({ message: '' }) });
    scheduler.start();
    expect(() => scheduler.stop()).not.toThrow();
  });

  it('does not start disabled tasks', () => {
    const channel = mockChannel();
    const scheduler = new HeartbeatScheduler(createMockAgent(), [channel], () => ({ inputTokens: 0, outputTokens: 0 }));
    scheduler.registerTask({ id: 't', name: 'T', schedule: '* * * * *', enabled: false, run: async () => ({ message: 'should not fire' }) });
    scheduler.start();
    scheduler.stop();
    expect((channel.send as any).mock.calls).toHaveLength(0);
  });
});

describe('createDefaultTasks', () => {
  const config = createTestConfig();
  const tasks = createDefaultTasks(config);

  it('creates 4 default tasks', () => {
    expect(tasks).toHaveLength(4);
  });

  it('includes morning briefing', () => {
    expect(tasks.find(t => t.id === 'morning-briefing')).toBeTruthy();
  });

  it('includes yield monitor', () => {
    expect(tasks.find(t => t.id === 'yield-monitor')).toBeTruthy();
  });

  it('includes dca executor', () => {
    expect(tasks.find(t => t.id === 'dca-executor')).toBeTruthy();
  });

  it('includes health check', () => {
    expect(tasks.find(t => t.id === 'health-check')).toBeTruthy();
  });

  it('inherits enabled state from config', () => {
    const disabledConfig = createTestConfig();
    disabledConfig.heartbeat.morningBriefing.enabled = false;
    const tasks = createDefaultTasks(disabledConfig);
    const morning = tasks.find(t => t.id === 'morning-briefing')!;
    expect(morning.enabled).toBe(false);
  });
});

describe('Morning Briefing Task', () => {
  it('generates a briefing message', async () => {
    const config = createTestConfig();
    const tasks = createDefaultTasks(config);
    const task = tasks.find(t => t.id === 'morning-briefing')!;

    const result = await task.run(createMockAgent(), { totalUsage: { inputTokens: 1000, outputTokens: 500 } });
    expect(result.message).toContain('Good morning');
    expect(result.message).toContain('Net worth');
    expect(result.message).toContain('$1500');
  });

  it('includes portfolio info when positions exist', async () => {
    const config = createTestConfig();
    const tasks = createDefaultTasks(config);
    const task = tasks.find(t => t.id === 'morning-briefing')!;

    const result = await task.run(createMockAgent(), { totalUsage: { inputTokens: 0, outputTokens: 0 } });
    expect(result.message).toContain('SUI');
    expect(result.message).toContain('NAVI');
  });
});

describe('Yield Monitor Task', () => {
  it('returns silent when no opportunity found', async () => {
    const noOppAgent = createMockAgent({
      rebalance: vi.fn(async () => ({
        executed: false, currentApy: 3.0, newApy: 3.0,
        fromProtocol: 'NAVI', toProtocol: 'NAVI',
      })),
      investRebalance: vi.fn(async () => ({ moves: [] })),
    });

    const config = createTestConfig();
    const tasks = createDefaultTasks(config);
    const task = tasks.find(t => t.id === 'yield-monitor')!;

    const result = await task.run(noOppAgent, { totalUsage: { inputTokens: 0, outputTokens: 0 } });
    expect(result.silent).toBe(true);
  });

  it('notifies when better yield is available', async () => {
    const config = createTestConfig();
    const tasks = createDefaultTasks(config);
    const task = tasks.find(t => t.id === 'yield-monitor')!;

    const result = await task.run(createMockAgent(), { totalUsage: { inputTokens: 0, outputTokens: 0 } });
    expect(result.message).toContain('Yield opportunity');
    expect(result.message).toContain('Suilend');
    expect(result.message).toContain('4.5%');
  });
});

describe('Health Check Task', () => {
  it('returns silent when health is good', async () => {
    const config = createTestConfig();
    const tasks = createDefaultTasks(config);
    const task = tasks.find(t => t.id === 'health-check')!;

    const result = await task.run(createMockAgent(), { totalUsage: { inputTokens: 0, outputTokens: 0 } });
    expect(result.silent).toBe(true);
  });

  it('warns when health factor is low', async () => {
    const lowHealthAgent = createMockAgent({
      healthFactor: vi.fn(async () => ({ healthFactor: 1.3 })),
    });

    const config = createTestConfig();
    const tasks = createDefaultTasks(config);
    const task = tasks.find(t => t.id === 'health-check')!;

    const result = await task.run(lowHealthAgent, { totalUsage: { inputTokens: 0, outputTokens: 0 } });
    expect(result.message).toContain('Warning');
    expect(result.message).toContain('1.30');
  });

  it('sends critical alert when health factor is below 1.2', async () => {
    const criticalAgent = createMockAgent({
      healthFactor: vi.fn(async () => ({ healthFactor: 1.1 })),
    });

    const config = createTestConfig();
    const tasks = createDefaultTasks(config);
    const task = tasks.find(t => t.id === 'health-check')!;

    const result = await task.run(criticalAgent, { totalUsage: { inputTokens: 0, outputTokens: 0 } });
    expect(result.message).toContain('CRITICAL');
    expect(result.message).toContain('1.10');
  });
});

describe('DCA Executor Task', () => {
  it('returns silent when no pending runs', async () => {
    const config = createTestConfig();
    const tasks = createDefaultTasks(config);
    const task = tasks.find(t => t.id === 'dca-executor')!;

    const result = await task.run(createMockAgent(), { totalUsage: { inputTokens: 0, outputTokens: 0 } });
    expect(result.silent).toBe(true);
  });
});
