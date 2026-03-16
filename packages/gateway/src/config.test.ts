import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { loadGatewayConfig, getDefaultModel, type GatewayConfig } from './config.js';

describe('GatewayConfig', () => {
  describe('getDefaultModel', () => {
    it('returns claude-sonnet-4-20250514 for anthropic', () => {
      expect(getDefaultModel('anthropic')).toBe('claude-sonnet-4-20250514');
    });

    it('returns gpt-4o for openai', () => {
      expect(getDefaultModel('openai')).toBe('gpt-4o');
    });
  });

  describe('loadGatewayConfig', () => {
    it('returns defaults when no config file exists', async () => {
      const config = await loadGatewayConfig();
      expect(config.llm.provider).toBe('anthropic');
      expect(config.llm.apiKey).toBe('');
      expect(config.channels.webchat.enabled).toBe(true);
      expect(config.channels.webchat.port).toBe(2000);
      expect(config.heartbeat.morningBriefing.enabled).toBe(true);
    });

    it('heartbeat defaults have valid cron expressions', async () => {
      const config = await loadGatewayConfig();
      expect(config.heartbeat.morningBriefing.schedule).toBe('0 8 * * *');
      expect(config.heartbeat.yieldMonitor.schedule).toBe('*/30 * * * *');
      expect(config.heartbeat.dcaExecutor.schedule).toBe('0 9 * * 1');
      expect(config.heartbeat.healthCheck.schedule).toBe('*/15 * * * *');
    });

    it('webchat defaults to port 2000', async () => {
      const config = await loadGatewayConfig();
      expect(config.channels.webchat.port).toBe(2000);
    });

    it('telegram is undefined by default', async () => {
      const config = await loadGatewayConfig();
      expect(config.channels.telegram).toBeUndefined();
    });

    it('llm model is undefined by default (uses getDefaultModel at runtime)', async () => {
      const config = await loadGatewayConfig();
      expect(config.llm.model).toBeUndefined();
    });

    it('all heartbeat tasks enabled by default', async () => {
      const config = await loadGatewayConfig();
      expect(config.heartbeat.morningBriefing.enabled).toBe(true);
      expect(config.heartbeat.yieldMonitor.enabled).toBe(true);
      expect(config.heartbeat.dcaExecutor.enabled).toBe(true);
      expect(config.heartbeat.healthCheck.enabled).toBe(true);
    });
  });
});
