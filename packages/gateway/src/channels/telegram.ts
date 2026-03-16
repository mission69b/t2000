import { Bot, type Context } from 'grammy';
import type { Channel, IncomingMessage } from './types.js';

const TELEGRAM_MAX_LENGTH = 4096;

export interface TelegramConfig {
  botToken: string;
  allowedUsers: string[];
}

export class TelegramChannel implements Channel {
  readonly id = 'telegram';
  readonly name = 'Telegram';

  private bot: Bot;
  private allowedUsers: Set<string>;
  private messageHandler: ((msg: IncomingMessage) => Promise<void>) | null = null;
  private pinUnlockHandler: ((pin: string) => Promise<boolean>) | null = null;
  private awaitingPin: Set<string> = new Set();

  constructor(config: TelegramConfig) {
    this.bot = new Bot(config.botToken);
    this.allowedUsers = new Set(config.allowedUsers);
    this.setupHandlers();
  }

  async start(): Promise<void> {
    await this.bot.start({
      onStart: () => {},
      drop_pending_updates: true,
    });
  }

  async stop(): Promise<void> {
    await this.bot.stop();
  }

  async send(userId: string, message: string): Promise<void> {
    const chatId = parseInt(userId, 10);
    const chunks = splitMessage(message);
    for (const chunk of chunks) {
      try {
        await this.bot.api.sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
      } catch {
        // Retry without Markdown if parsing fails
        await this.bot.api.sendMessage(chatId, chunk);
      }
    }
  }

  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  onPinUnlock(handler: (pin: string) => Promise<boolean>): void {
    this.pinUnlockHandler = handler;
  }

  requestPin(userId: string): void {
    this.awaitingPin.add(userId);
  }

  private setupHandlers(): void {
    // Reject non-text messages
    this.bot.on(['message:photo', 'message:video', 'message:voice', 'message:sticker', 'message:document'], async (ctx) => {
      if (!this.isAllowed(ctx)) return;
      await ctx.reply('I can only process text messages. How can I help with your finances?');
    });

    this.bot.on('message:text', async (ctx) => {
      const userId = ctx.from.id.toString();

      // Reject unauthorized users
      if (!this.isAllowed(ctx)) {
        await ctx.reply('This is a private financial agent. Access is restricted to the account owner.');
        return;
      }

      // Handle PIN unlock flow — intercept before agent loop
      if (this.awaitingPin.has(userId)) {
        this.awaitingPin.delete(userId);
        const pin = ctx.message.text.trim();

        // Delete the PIN message immediately
        try {
          await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
        } catch { /* may fail if bot lacks delete permission */ }

        if (this.pinUnlockHandler) {
          const success = await this.pinUnlockHandler(pin);
          if (success) {
            await ctx.reply('✓ Unlocked. How can I help?');
          } else {
            await ctx.reply('Invalid PIN. Try again or unlock via terminal: `t2000 unlock`');
          }
        }
        return;
      }

      // Forward to agent loop
      if (this.messageHandler) {
        await this.messageHandler({
          channelId: this.id,
          userId,
          text: ctx.message.text,
        });
      }
    });

    this.bot.catch((err) => {
      console.error('[telegram] Error:', err.message);
    });
  }

  private isAllowed(ctx: Context): boolean {
    if (!ctx.from) return false;
    if (this.allowedUsers.size === 0) return true;
    return this.allowedUsers.has(ctx.from.id.toString());
  }
}

function splitMessage(text: string): string[] {
  if (text.length <= TELEGRAM_MAX_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= TELEGRAM_MAX_LENGTH) {
      chunks.push(remaining);
      break;
    }

    // Try to split at newline
    let splitIndex = remaining.lastIndexOf('\n', TELEGRAM_MAX_LENGTH);
    if (splitIndex < TELEGRAM_MAX_LENGTH * 0.5) {
      // No good newline break, split at space
      splitIndex = remaining.lastIndexOf(' ', TELEGRAM_MAX_LENGTH);
    }
    if (splitIndex < TELEGRAM_MAX_LENGTH * 0.3) {
      // No good break at all, hard split
      splitIndex = TELEGRAM_MAX_LENGTH;
    }

    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trimStart();
  }

  return chunks;
}

export function formatMarkdownTable(headers: string[], rows: string[][]): string {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => (r[i] ?? '').length)),
  );

  const headerRow = '| ' + headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ') + ' |';
  const separator = '|' + colWidths.map(w => '-'.repeat(w + 2)).join('|') + '|';
  const dataRows = rows.map(r =>
    '| ' + r.map((c, i) => (c ?? '').padEnd(colWidths[i])).join(' | ') + ' |',
  );

  return [headerRow, separator, ...dataRows].join('\n');
}
