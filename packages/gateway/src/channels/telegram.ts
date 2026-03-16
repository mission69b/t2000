import { Bot, InlineKeyboard, type Context } from 'grammy';
import type { Channel, IncomingMessage } from './types.js';

const TELEGRAM_MAX_LENGTH = 4096;
const TYPING_INTERVAL_MS = 4_000;

export interface TelegramConfig {
  botToken: string;
  allowedUsers: string[];
}

export type StartHandler = (userId: string) => Promise<string>;

export class TelegramChannel implements Channel {
  readonly id = 'telegram';
  readonly name = 'Telegram';

  private bot: Bot;
  private allowedUsers: Set<string>;
  private messageHandler: ((msg: IncomingMessage) => Promise<void>) | null = null;
  private pinUnlockHandler: ((pin: string) => Promise<boolean>) | null = null;
  private startHandler: StartHandler | null = null;
  private awaitingPin: Set<string> = new Set();
  private typingIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

  constructor(config: TelegramConfig) {
    this.bot = new Bot(config.botToken);
    this.allowedUsers = new Set(config.allowedUsers);
    this.setupHandlers();
  }

  async start(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.bot.start({
        onStart: () => resolve(),
        drop_pending_updates: true,
      });
    });
  }

  async stop(): Promise<void> {
    await this.bot.stop();
  }

  async send(userId: string, message: string): Promise<void> {
    const chatId = parseInt(userId, 10);
    const html = markdownToTelegramHTML(message);
    const chunks = splitMessage(html);
    for (const chunk of chunks) {
      try {
        await this.bot.api.sendMessage(chatId, chunk, { parse_mode: 'HTML' });
      } catch {
        await this.bot.api.sendMessage(chatId, stripHtml(chunk));
      }
    }
  }

  async sendWithConfirmation(userId: string, message: string): Promise<void> {
    const chatId = parseInt(userId, 10);
    const html = markdownToTelegramHTML(message);
    const keyboard = new InlineKeyboard()
      .text('✅ Confirm', 'confirm:yes')
      .text('❌ Cancel', 'confirm:no');
    try {
      await this.bot.api.sendMessage(chatId, html, { parse_mode: 'HTML', reply_markup: keyboard });
    } catch {
      await this.bot.api.sendMessage(chatId, stripHtml(html), { reply_markup: keyboard });
    }
  }

  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  onPinUnlock(handler: (pin: string) => Promise<boolean>): void {
    this.pinUnlockHandler = handler;
  }

  onStart(handler: StartHandler): void {
    this.startHandler = handler;
  }

  requestPin(userId: string): void {
    this.awaitingPin.add(userId);
  }

  startTyping(userId: string): void {
    const chatId = parseInt(userId, 10);
    this.bot.api.sendChatAction(chatId, 'typing').catch(() => {});
    const interval = setInterval(() => {
      this.bot.api.sendChatAction(chatId, 'typing').catch(() => {});
    }, TYPING_INTERVAL_MS);
    this.typingIntervals.set(userId, interval);
  }

  stopTyping(userId: string): void {
    const interval = this.typingIntervals.get(userId);
    if (interval) {
      clearInterval(interval);
      this.typingIntervals.delete(userId);
    }
  }

  private setupHandlers(): void {
    this.bot.command('start', async (ctx) => {
      if (!this.isAllowed(ctx)) {
        await ctx.reply('This is a private financial agent. Access is restricted to the account owner.');
        return;
      }

      const userId = ctx.from!.id.toString();
      let welcomeText = 'Welcome to t2000 — your AI financial advisor.\n\nAsk me anything about your accounts.';

      if (this.startHandler) {
        try {
          welcomeText = await this.startHandler(userId);
        } catch { /* fall through to default */ }
      }

      const keyboard = new InlineKeyboard()
        .text('💰 Balance', 'quick:What\'s my balance?')
        .text('📊 Portfolio', 'quick:Show my portfolio').row()
        .text('📈 Rates', 'quick:What are the best rates?')
        .text('❓ Help', 'quick:What can you do?');

      await ctx.reply(welcomeText, { reply_markup: keyboard });
    });

    this.bot.on('callback_query:data', async (ctx) => {
      if (!this.isAllowed(ctx)) {
        await ctx.answerCallbackQuery({ text: 'Unauthorized' });
        return;
      }

      const data = ctx.callbackQuery.data;
      const userId = ctx.from.id.toString();

      if (data.startsWith('confirm:')) {
        const answer = data.slice(8);
        await ctx.answerCallbackQuery();
        try {
          await ctx.editMessageReplyMarkup({ reply_markup: undefined });
        } catch { /* message may be too old to edit */ }

        if (this.messageHandler) {
          await this.messageHandler({ channelId: this.id, userId, text: answer });
        }
        return;
      }

      if (data.startsWith('quick:')) {
        await ctx.answerCallbackQuery();
        if (this.messageHandler) {
          const text = data.slice(6);
          await this.messageHandler({ channelId: this.id, userId, text });
        }
        return;
      }

      await ctx.answerCallbackQuery({ text: 'Unknown action' });
    });

    this.bot.on(['message:photo', 'message:video', 'message:voice', 'message:sticker', 'message:document'], async (ctx) => {
      if (!this.isAllowed(ctx)) return;
      await ctx.reply('I can only process text messages. How can I help with your finances?');
    });

    this.bot.on('message:text', async (ctx) => {
      const userId = ctx.from.id.toString();

      if (!this.isAllowed(ctx)) {
        await ctx.reply('This is a private financial agent. Access is restricted to the account owner.');
        return;
      }

      if (this.awaitingPin.has(userId)) {
        this.awaitingPin.delete(userId);
        const pin = ctx.message.text.trim();

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

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function markdownToTelegramHTML(text: string): string {
  let result = escapeHtml(text);
  // Links: [text](url) → <a href="url">text</a>
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // Bold: **text** → <b>text</b>
  result = result.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  // Inline code: `text` → <code>text</code>
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
  return result;
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, '');
}
