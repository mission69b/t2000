import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./config.js', () => ({
  loadGatewayConfig: vi.fn(),
  getDefaultModel: vi.fn((provider: string) =>
    provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o',
  ),
}));

vi.mock('./llm/anthropic.js', () => ({
  AnthropicProvider: vi.fn().mockImplementation((apiKey: string, model?: string) => ({
    id: 'anthropic',
    model: model ?? 'claude-sonnet-4-20250514',
    chat: vi.fn(async () => ({ text: 'ok', usage: { inputTokens: 0, outputTokens: 0 } })),
  })),
}));

vi.mock('./llm/openai.js', () => ({
  OpenAIProvider: vi.fn().mockImplementation((apiKey: string, model?: string) => ({
    id: 'openai',
    model: model ?? 'gpt-4o',
    chat: vi.fn(async () => ({ text: 'ok', usage: { inputTokens: 0, outputTokens: 0 } })),
  })),
}));

vi.mock('./channels/webchat.js', () => ({
  WebChatChannel: vi.fn().mockImplementation((port: number) => ({
    id: 'webchat',
    name: 'WebChat',
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    send: vi.fn(async () => {}),
    onMessage: vi.fn(),
    getPort: vi.fn(() => port),
    sendToken: vi.fn(),
    sendToolCall: vi.fn(),
    sendConfirmation: vi.fn(),
  })),
}));

vi.mock('./channels/telegram.js', () => ({
  TelegramChannel: vi.fn().mockImplementation(() => ({
    id: 'telegram',
    name: 'Telegram',
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    send: vi.fn(async () => {}),
    onMessage: vi.fn(),
    onPinUnlock: vi.fn(),
    requestPin: vi.fn(),
  })),
}));

vi.mock('./agent-loop.js', () => ({
  AgentLoop: vi.fn().mockImplementation(() => ({
    processMessage: vi.fn(async () => ({
      text: 'Response',
      toolCalls: [],
      usage: { inputTokens: 10, outputTokens: 5 },
    })),
    getTotalUsage: vi.fn(() => ({ inputTokens: 100, outputTokens: 50 })),
  })),
}));

vi.mock('./heartbeat.js', () => ({
  HeartbeatScheduler: vi.fn().mockImplementation(() => ({
    registerTask: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    getTaskCount: vi.fn(() => 4),
  })),
  createDefaultTasks: vi.fn(() => [
    { name: 'morning-briefing' },
    { name: 'yield-monitor' },
    { name: 'dca-executor' },
    { name: 'health-check' },
  ]),
}));

vi.mock('./tools.js', () => ({
  createToolRegistry: vi.fn(() => []),
  toolsToLLMFormat: vi.fn(() => []),
}));

vi.mock('./logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { Gateway } from './gateway.js';
import { loadGatewayConfig } from './config.js';
import { WebChatChannel } from './channels/webchat.js';
import { TelegramChannel } from './channels/telegram.js';
import { AnthropicProvider } from './llm/anthropic.js';
import { OpenAIProvider } from './llm/openai.js';
import type { GatewayConfig } from './config.js';

function defaultConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return {
    llm: { provider: 'anthropic', apiKey: 'sk-ant-test', ...overrides.llm },
    channels: {
      webchat: { enabled: true, port: 2000, ...overrides.channels?.webchat },
      telegram: { enabled: false, botToken: '', allowedUsers: [], ...overrides.channels?.telegram },
    },
    heartbeat: {
      morningBriefing: { enabled: true, schedule: '0 8 * * *' },
      yieldMonitor: { enabled: true, schedule: '0 */4 * * *' },
      dcaExecutor: { enabled: true, schedule: '0 9 * * 1' },
      healthCheck: { enabled: true, schedule: '*/30 * * * *' },
      timezone: 'UTC',
      ...overrides.heartbeat,
    },
  } as GatewayConfig;
}

const mockAgent = {
  address: () => '0x1234567890abcdef',
  balance: vi.fn(async () => ({ available: 1000 })),
  enforcer: {
    getConfig: () => ({ locked: false, maxPerTx: 500, maxDailySend: 1000 }),
    unlock: vi.fn(),
  },
} as any;

describe('Gateway.create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws if no LLM API key configured', async () => {
    (loadGatewayConfig as any).mockResolvedValueOnce(defaultConfig({ llm: { provider: 'anthropic', apiKey: '' } }));

    await expect(Gateway.create({ agent: mockAgent })).rejects.toThrow('LLM API key not configured');
  });

  it('creates Anthropic provider when configured', async () => {
    (loadGatewayConfig as any).mockResolvedValueOnce(defaultConfig());

    const gw = await Gateway.create({ agent: mockAgent });
    expect(gw).toBeDefined();
    expect(AnthropicProvider).toHaveBeenCalledWith('sk-ant-test', 'claude-sonnet-4-20250514');
  });

  it('creates OpenAI provider when configured', async () => {
    (loadGatewayConfig as any).mockResolvedValueOnce(
      defaultConfig({ llm: { provider: 'openai', apiKey: 'sk-openai-test' } }),
    );

    const gw = await Gateway.create({ agent: mockAgent });
    expect(gw).toBeDefined();
    expect(OpenAIProvider).toHaveBeenCalledWith('sk-openai-test', 'gpt-4o');
  });

  it('overrides port from options', async () => {
    (loadGatewayConfig as any).mockResolvedValueOnce(defaultConfig());

    const gw = await Gateway.create({ agent: mockAgent, port: 3000 });
    expect(gw).toBeDefined();
  });
});

describe('Gateway.start', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts WebChat when enabled', async () => {
    (loadGatewayConfig as any).mockResolvedValueOnce(defaultConfig());
    const gw = await Gateway.create({ agent: mockAgent, noTelegram: true, noHeartbeat: true });

    const info = await gw.start();

    expect(WebChatChannel).toHaveBeenCalledWith(2000);
    expect(info.webchatUrl).toBe('http://localhost:2000');
  });

  it('starts heartbeat with default tasks', async () => {
    (loadGatewayConfig as any).mockResolvedValueOnce(defaultConfig());
    const gw = await Gateway.create({ agent: mockAgent, noTelegram: true });

    const info = await gw.start();

    expect(info.heartbeatTasks).toBe(4);
  });

  it('skips Telegram when noTelegram=true', async () => {
    (loadGatewayConfig as any).mockResolvedValueOnce(defaultConfig());
    const gw = await Gateway.create({ agent: mockAgent, noTelegram: true, noHeartbeat: true });

    const info = await gw.start();

    expect(TelegramChannel).not.toHaveBeenCalled();
    expect(info.telegramConnected).toBe(false);
  });

  it('skips heartbeat when noHeartbeat=true', async () => {
    (loadGatewayConfig as any).mockResolvedValueOnce(defaultConfig());
    const gw = await Gateway.create({ agent: mockAgent, noTelegram: true, noHeartbeat: true });

    const info = await gw.start();

    expect(info.heartbeatTasks).toBe(0);
  });

  it('returns complete GatewayInfo', async () => {
    (loadGatewayConfig as any).mockResolvedValueOnce(defaultConfig());
    const gw = await Gateway.create({ agent: mockAgent, noTelegram: true });

    const info = await gw.start();

    expect(info.address).toBe('0x1234567890abcdef');
    expect(info.llmProvider).toBe('anthropic');
    expect(info.llmModel).toBe('claude-sonnet-4-20250514');
    expect(info.webchatUrl).toBe('http://localhost:2000');
  });

  it('throws when started twice', async () => {
    (loadGatewayConfig as any).mockResolvedValueOnce(defaultConfig());
    const gw = await Gateway.create({ agent: mockAgent, noTelegram: true, noHeartbeat: true });

    await gw.start();
    await expect(gw.start()).rejects.toThrow('already running');
  });

  it('reports running state', async () => {
    (loadGatewayConfig as any).mockResolvedValueOnce(defaultConfig());
    const gw = await Gateway.create({ agent: mockAgent, noTelegram: true, noHeartbeat: true });

    expect(gw.isRunning()).toBe(false);
    await gw.start();
    expect(gw.isRunning()).toBe(true);
  });

  it('handles WebChat start failure gracefully when not EADDRINUSE', async () => {
    const config = defaultConfig();
    (loadGatewayConfig as any).mockResolvedValueOnce(config);

    const mockWebChat = {
      id: 'webchat', name: 'WebChat',
      start: vi.fn(async () => { throw new Error('some network error'); }),
      stop: vi.fn(async () => {}),
      send: vi.fn(async () => {}),
      onMessage: vi.fn(),
      getPort: vi.fn(() => 2000),
    };
    (WebChatChannel as any).mockImplementationOnce(() => mockWebChat);

    const gw = await Gateway.create({ agent: mockAgent, noTelegram: true, noHeartbeat: true });
    const info = await gw.start();

    expect(info.webchatUrl).toBeNull();
  });

  it('throws when WebChat fails with EADDRINUSE', async () => {
    const config = defaultConfig();
    (loadGatewayConfig as any).mockResolvedValueOnce(config);

    const mockWebChat = {
      id: 'webchat', name: 'WebChat',
      start: vi.fn(async () => { throw new Error('EADDRINUSE'); }),
      stop: vi.fn(async () => {}),
      send: vi.fn(async () => {}),
      onMessage: vi.fn(),
      getPort: vi.fn(() => 2000),
    };
    (WebChatChannel as any).mockImplementationOnce(() => mockWebChat);

    const gw = await Gateway.create({ agent: mockAgent, noTelegram: true, noHeartbeat: true });
    await expect(gw.start()).rejects.toThrow('EADDRINUSE');
  });
});

describe('Gateway — Telegram integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts Telegram when configured with token and enabled', async () => {
    const config = defaultConfig({
      channels: {
        webchat: { enabled: true, port: 2000 },
        telegram: { enabled: true, botToken: 'bot123:token', allowedUsers: ['12345'] },
      },
    });
    (loadGatewayConfig as any).mockResolvedValueOnce(config);

    const gw = await Gateway.create({ agent: mockAgent, noHeartbeat: true });
    const info = await gw.start();

    expect(TelegramChannel).toHaveBeenCalled();
    expect(info.telegramConnected).toBe(true);
  });

  it('skips Telegram when no bot token', async () => {
    const config = defaultConfig({
      channels: {
        webchat: { enabled: true, port: 2000 },
        telegram: { enabled: true, botToken: '', allowedUsers: [] },
      },
    });
    (loadGatewayConfig as any).mockResolvedValueOnce(config);

    const gw = await Gateway.create({ agent: mockAgent, noHeartbeat: true });
    const info = await gw.start();

    expect(info.telegramConnected).toBe(false);
  });
});
