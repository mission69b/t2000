import type { T2000 } from '@t2000/sdk';
import type { LLMProvider } from './llm/types.js';
import type { Channel, IncomingMessage } from './channels/types.js';
import { AnthropicProvider } from './llm/anthropic.js';
import { OpenAIProvider } from './llm/openai.js';
import { WebChatChannel } from './channels/webchat.js';
import { TelegramChannel } from './channels/telegram.js';
import { AgentLoop } from './agent-loop.js';
import { HeartbeatScheduler, createDefaultTasks } from './heartbeat.js';
import { createToolRegistry, toolsToLLMFormat } from './tools.js';
import { loadGatewayConfig, getDefaultModel, type GatewayConfig } from './config.js';
import { Logger } from './logger.js';

export interface GatewayOptions {
  agent: T2000;
  config?: Partial<GatewayConfig>;
  port?: number;
  noTelegram?: boolean;
  noHeartbeat?: boolean;
  verbose?: boolean;
}

export interface GatewayInfo {
  address: string;
  llmProvider: string;
  llmModel: string;
  webchatUrl: string | null;
  telegramConnected: boolean;
  heartbeatTasks: number;
}

export class Gateway {
  private agent: T2000;
  private llm: LLMProvider;
  private channels: Channel[] = [];
  private agentLoops: Map<string, AgentLoop> = new Map();
  private heartbeat: HeartbeatScheduler | null = null;
  private config: GatewayConfig;
  private options: GatewayOptions;
  private logger: Logger;
  private running = false;
  private telegramRetries = 0;
  private readonly MAX_TELEGRAM_RETRIES = 3;

  private constructor(agent: T2000, llm: LLMProvider, config: GatewayConfig, options: GatewayOptions) {
    this.agent = agent;
    this.llm = llm;
    this.config = config;
    this.options = options;
    this.logger = new Logger({
      level: options.verbose ? 'debug' : 'info',
      verbose: options.verbose ?? false,
    });
  }

  static async create(options: GatewayOptions): Promise<Gateway> {
    const config = await loadGatewayConfig();
    if (options.config) Object.assign(config, options.config);
    if (options.port) config.channels.webchat.port = options.port;

    if (!config.llm.apiKey) {
      throw new Error(
        'LLM API key not configured. Run:\n' +
        '  t2000 config set llm.provider anthropic\n' +
        '  t2000 config set llm.apiKey sk-ant-...',
      );
    }

    const model = config.llm.model ?? getDefaultModel(config.llm.provider);
    const llm: LLMProvider = config.llm.provider === 'anthropic'
      ? new AnthropicProvider(config.llm.apiKey, model)
      : new OpenAIProvider(config.llm.apiKey, model);

    return new Gateway(options.agent, llm, config, options);
  }

  async start(): Promise<GatewayInfo> {
    if (this.running) throw new Error('Gateway is already running');
    this.running = true;

    const tools = createToolRegistry();
    const toolDefs = toolsToLLMFormat(tools);
    const results: GatewayInfo = {
      address: this.agent.address(),
      llmProvider: this.llm.id,
      llmModel: this.llm.model,
      webchatUrl: null,
      telegramConnected: false,
      heartbeatTasks: 0,
    };

    this.logger.info('Starting gateway', { address: this.agent.address() });

    // Start WebChat
    if (this.config.channels.webchat.enabled) {
      const webchat = new WebChatChannel(this.config.channels.webchat.port);
      const loop = new AgentLoop({ agent: this.agent, llm: this.llm, tools, toolDefinitions: toolDefs });

      webchat.onMessage(async (msg: IncomingMessage) => {
        await this.handleMessage(msg, loop, webchat);
      });

      try {
        await webchat.start();
        this.channels.push(webchat);
        this.agentLoops.set(webchat.id, loop);
        results.webchatUrl = `http://localhost:${webchat.getPort()}`;
        this.logger.info(`WebChat started at ${results.webchatUrl}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('EADDRINUSE')) {
          this.logger.error('Port conflict — another gateway may be running', {
            port: this.config.channels.webchat.port,
          });
          throw err;
        }
        this.logger.error(`WebChat failed to start: ${msg}`);
      }
    }

    // Start Telegram (with retry)
    if (!this.options.noTelegram && this.config.channels.telegram?.enabled && this.config.channels.telegram.botToken) {
      await this.startTelegram(tools, toolDefs, results);
    }

    // Start Heartbeat
    if (!this.options.noHeartbeat) {
      const getUsage = () => {
        let total = { inputTokens: 0, outputTokens: 0 };
        for (const loop of this.agentLoops.values()) {
          const usage = loop.getTotalUsage();
          total.inputTokens += usage.inputTokens;
          total.outputTokens += usage.outputTokens;
        }
        return total;
      };

      this.heartbeat = new HeartbeatScheduler(this.agent, this.channels, getUsage);
      const tasks = createDefaultTasks(this.config);
      for (const task of tasks) {
        this.heartbeat.registerTask(task);
      }
      this.heartbeat.start();
      results.heartbeatTasks = this.heartbeat.getTaskCount();
      this.logger.info(`Heartbeat started (${results.heartbeatTasks} tasks)`);
    }

    // Graceful shutdown
    const shutdown = async () => {
      this.logger.info('Shutting down...');
      this.running = false;

      if (this.heartbeat) {
        this.heartbeat.stop();
        this.logger.info('Heartbeat stopped');
      }

      for (const channel of this.channels) {
        try {
          await channel.stop();
          this.logger.info(`${channel.name} stopped`);
        } catch { /* best effort */ }
      }

      this.logger.info('Goodbye.');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    this.logger.info('Gateway ready', {
      webchat: results.webchatUrl,
      telegram: results.telegramConnected,
      heartbeat: results.heartbeatTasks,
    });

    return results;
  }

  private async startTelegram(
    tools: ReturnType<typeof createToolRegistry>,
    toolDefs: ReturnType<typeof toolsToLLMFormat>,
    results: GatewayInfo,
  ): Promise<void> {
    const telegramConfig = this.config.channels.telegram!;
    const telegram = new TelegramChannel({
      botToken: telegramConfig.botToken,
      allowedUsers: telegramConfig.allowedUsers ?? [],
    });
    const loop = new AgentLoop({ agent: this.agent, llm: this.llm, tools, toolDefinitions: toolDefs });

    telegram.onMessage(async (msg: IncomingMessage) => {
      if (this.agent.enforcer.getConfig().locked) {
        telegram.requestPin(msg.userId);
        await telegram.send(msg.userId, 'Agent is locked. Enter your PIN to unlock.');
        return;
      }
      await this.handleMessage(msg, loop, telegram);
    });

    telegram.onPinUnlock(async (_pin: string) => {
      try {
        this.agent.enforcer.unlock();
        this.logger.info('Agent unlocked via Telegram PIN');
        return true;
      } catch {
        return false;
      }
    });

    const attemptConnect = async (): Promise<boolean> => {
      try {
        await telegram.start();
        this.channels.push(telegram);
        this.agentLoops.set(telegram.id, loop);
        results.telegramConnected = true;
        this.telegramRetries = 0;
        this.logger.info('Telegram connected');
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('401') || msg.includes('Unauthorized')) {
          this.logger.error('Telegram bot token is invalid — update with: t2000 config set channels.telegram.botToken <token>');
          return false;
        }
        this.telegramRetries++;
        this.logger.warn(`Telegram connection failed (attempt ${this.telegramRetries}/${this.MAX_TELEGRAM_RETRIES}): ${msg}`);
        return false;
      }
    };

    if (await attemptConnect()) return;

    // Background retry for transient network errors
    if (this.telegramRetries < this.MAX_TELEGRAM_RETRIES) {
      const retryInterval = setInterval(async () => {
        if (this.telegramRetries >= this.MAX_TELEGRAM_RETRIES || !this.running) {
          clearInterval(retryInterval);
          if (this.telegramRetries >= this.MAX_TELEGRAM_RETRIES) {
            this.logger.error('Telegram retry limit reached — continuing without Telegram');
          }
          return;
        }
        if (await attemptConnect()) clearInterval(retryInterval);
      }, 10_000);
    }
  }

  private async handleMessage(msg: IncomingMessage, loop: AgentLoop, channel: Channel): Promise<void> {
    const isWebChat = channel instanceof WebChatChannel;

    try {
      const response = await loop.processMessage(msg.text, {
        stream: isWebChat,
        onToken: isWebChat ? (token) => (channel as WebChatChannel).sendToken(token) : undefined,
      });

      if (isWebChat) {
        for (const tc of response.toolCalls) {
          (channel as WebChatChannel).sendToolCall(tc.name, tc.dryRun);
        }
        if (response.needsConfirmation) {
          (channel as WebChatChannel).sendConfirmation(response.needsConfirmation.preview);
        }
      }

      await channel.send(msg.userId, response.text);

      const cost = this.estimateCost(response.usage);
      this.logger.debug(`Message handled`, {
        channel: channel.name,
        tools: response.toolCalls.length,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        cost: `$${cost.toFixed(4)}`,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Internal error';

      if (this.isLLMError(err)) {
        this.logger.error('LLM call failed', { error: errorMsg });
        await channel.send(msg.userId, 'AI is temporarily unavailable. Please try again in a moment.');
      } else {
        this.logger.error(`Message error: ${errorMsg}`);
        await channel.send(msg.userId, `Sorry, something went wrong: ${errorMsg}`);
      }
    }
  }

  private isLLMError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const msg = err.message.toLowerCase();
    return msg.includes('api') || msg.includes('rate limit') ||
      msg.includes('429') || msg.includes('500') || msg.includes('503') ||
      msg.includes('overloaded') || msg.includes('timeout');
  }

  private estimateCost(usage: { inputTokens: number; outputTokens: number }): number {
    if (this.llm.id === 'anthropic') {
      return (usage.inputTokens * 3 + usage.outputTokens * 15) / 1_000_000;
    }
    return (usage.inputTokens * 2.5 + usage.outputTokens * 10) / 1_000_000;
  }

  isRunning(): boolean {
    return this.running;
  }

  getLogger(): Logger {
    return this.logger;
  }
}
