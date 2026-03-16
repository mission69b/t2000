import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_DIR = resolve(homedir(), '.t2000');
const CONFIG_PATH = resolve(CONFIG_DIR, 'config.json');

export interface GatewayConfig {
  llm: {
    provider: 'anthropic' | 'openai';
    apiKey: string;
    model?: string;
  };
  channels: {
    telegram?: {
      enabled: boolean;
      botToken: string;
      allowedUsers: string[];
    };
    webchat: {
      enabled: boolean;
      port: number;
    };
  };
  heartbeat: {
    morningBriefing: { enabled: boolean; schedule: string };
    yieldMonitor: { enabled: boolean; schedule: string };
    dcaExecutor: { enabled: boolean; schedule: string };
    healthCheck: { enabled: boolean; schedule: string };
    timezone?: string;
  };
}

const DEFAULT_CONFIG: GatewayConfig = {
  llm: {
    provider: 'anthropic',
    apiKey: '',
    model: undefined,
  },
  channels: {
    webchat: {
      enabled: true,
      port: 2000,
    },
  },
  heartbeat: {
    morningBriefing: { enabled: true, schedule: '0 8 * * *' },
    yieldMonitor: { enabled: true, schedule: '*/30 * * * *' },
    dcaExecutor: { enabled: true, schedule: '0 9 * * 1' },
    healthCheck: { enabled: true, schedule: '*/15 * * * *' },
  },
};

export async function loadGatewayConfig(): Promise<GatewayConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return mergeConfig(DEFAULT_CONFIG, parsed);
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveGatewayConfig(config: GatewayConfig): Promise<void> {
  const raw = await readFile(CONFIG_PATH, 'utf-8').catch(() => '{}');
  const existing = JSON.parse(raw);
  const merged = { ...existing, ...config };
  await writeFile(CONFIG_PATH, JSON.stringify(merged, null, 2) + '\n');
}

function mergeConfig(defaults: GatewayConfig, overrides: Record<string, unknown>): GatewayConfig {
  return {
    llm: {
      ...defaults.llm,
      ...(overrides.llm as Record<string, unknown> ?? {}),
    } as GatewayConfig['llm'],
    channels: {
      ...defaults.channels,
      ...(overrides.channels as Record<string, unknown> ?? {}),
      webchat: {
        ...defaults.channels.webchat,
        ...((overrides.channels as Record<string, unknown>)?.webchat as Record<string, unknown> ?? {}),
      },
    } as GatewayConfig['channels'],
    heartbeat: {
      ...defaults.heartbeat,
      ...(overrides.heartbeat as Record<string, unknown> ?? {}),
    } as GatewayConfig['heartbeat'],
  };
}

export function getDefaultModel(provider: 'anthropic' | 'openai'): string {
  return provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o';
}
