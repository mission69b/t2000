import { type T2000, T2000Error } from '@t2000/sdk';
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

    // Start Telegram
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

    telegram.onStart(async (_userId: string) => {
      try {
        const balance = await this.agent.balance();
        return [
          'Welcome to t2000 — your AI financial advisor.\n',
          `💳 Checking: $${balance.available.toFixed(2)}`,
          `🏦 Savings: $${balance.savings.toFixed(2)}`,
          `Net: $${(balance.available + balance.savings - balance.debt).toFixed(2)}`,
          '\nAsk me anything, or tap a button below.',
        ].join('\n');
      } catch {
        return 'Welcome to t2000 — your AI financial advisor.\n\nAsk me anything about your accounts.';
      }
    });

    telegram.onMessage(async (msg: IncomingMessage) => {
      if (this.agent.enforcer.getConfig().locked) {
        telegram.requestPin(msg.userId);
        await telegram.send(msg.userId, 'Agent is locked. Enter your PIN to unlock.');
        return;
      }
      telegram.startTyping(msg.userId);
      try {
        await this.handleMessage(msg, loop, telegram);
      } finally {
        telegram.stopTyping(msg.userId);
      }
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
      this.logger.info('Connecting to Telegram...');
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
    const isTelegram = channel instanceof TelegramChannel;
    const startTime = Date.now();
    const queryPreview = msg.text.length > 40 ? msg.text.slice(0, 40) + '...' : msg.text;

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

      if (isTelegram && response.needsConfirmation) {
        await (channel as TelegramChannel).sendWithConfirmation(msg.userId, response.text);
      } else {
        await channel.send(msg.userId, response.text);
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const toolCount = response.toolCalls.length;
      const suffix = response.needsConfirmation ? 'confirmation pending' : `${toolCount} tool${toolCount !== 1 ? 's' : ''}, ${elapsed}s`;

      this.logger.info(`${channel.id} · "${queryPreview}" → ${suffix}`);

      if (this.options.verbose) {
        const cost = this.estimateCost(response.usage);
        this.logger.debug(`  tokens: ${response.usage.inputTokens}in/${response.usage.outputTokens}out, ~$${cost.toFixed(4)}`);
      }
    } catch (err) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const friendlyMsg = this.friendlyError(err);

      this.logger.error(`${channel.id} · "${queryPreview}" → error (${elapsed}s): ${err instanceof Error ? err.message : String(err)}`);
      await channel.send(msg.userId, friendlyMsg);
    }
  }

  private friendlyError(err: unknown): string {
    if (!(err instanceof Error)) return 'Something went wrong. Try again?';

    const msg = err.message.toLowerCase();

    if (msg.includes('rate limit') || msg.includes('429') || msg.includes('overloaded')) {
      return 'AI is busy. Try again in a moment.';
    }
    if (msg.includes('api') || msg.includes('500') || msg.includes('503') || msg.includes('timeout')) {
      return 'AI is temporarily unavailable. Please try again in a moment.';
    }

    if (err instanceof T2000Error) {
      switch (err.code) {
        case 'INSUFFICIENT_BALANCE':
        case 'INSUFFICIENT_GAS':
          return `Not enough funds. ${err.message}`;
        case 'SAFEGUARD_BLOCKED':
          return `${err.message}`;
        case 'HEALTH_FACTOR_TOO_LOW':
        case 'WITHDRAW_WOULD_LIQUIDATE':
          return 'That would put your health factor below safe levels. Try a smaller amount.';
        case 'SLIPPAGE_EXCEEDED':
          return 'Price moved too much during the swap. Try again or increase slippage.';
        case 'PROTOCOL_PAUSED':
          return 'The protocol is temporarily paused. Try again later.';
        case 'INVALID_ADDRESS':
          return 'That address doesn\'t look right. Check it and try again.';
        case 'INVALID_AMOUNT':
          return 'Invalid amount. Please enter a positive number.';
        default:
          return `${err.message}`;
      }
    }

    return `Something went wrong: ${err.message}`;
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
