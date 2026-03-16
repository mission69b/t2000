import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { Channel, IncomingMessage } from './types.js';

const WEBCHAT_USER_ID = 'webchat-local';

interface WebSocketClient {
  ws: import('node:http').ServerResponse;
  send: (data: string) => void;
}

export class WebChatChannel implements Channel {
  readonly id = 'webchat';
  readonly name = 'WebChat';

  private port: number;
  private app: Hono;
  private server: ReturnType<typeof serve> | null = null;
  private clients: Set<WebSocketClient> = new Set();
  private messageHandler: ((msg: IncomingMessage) => Promise<void>) | null = null;

  constructor(port: number) {
    this.port = port;
    this.app = this.createApp();
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = serve({
          fetch: this.app.fetch,
          port: this.port,
          hostname: '127.0.0.1',
        }, () => resolve());
      } catch (err) {
        reject(err);
      }
    });
  }

  async stop(): Promise<void> {
    for (const client of this.clients) {
      try { client.send(JSON.stringify({ type: 'close' })); } catch { /* ignore */ }
    }
    this.clients.clear();
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  async send(_userId: string, message: string): Promise<void> {
    const data = JSON.stringify({ type: 'message', text: message, timestamp: Date.now() });
    for (const client of this.clients) {
      try { client.send(data); } catch { this.clients.delete(client); }
    }
  }

  sendToken(token: string): void {
    const data = JSON.stringify({ type: 'token', text: token });
    for (const client of this.clients) {
      try { client.send(data); } catch { this.clients.delete(client); }
    }
  }

  sendToolCall(name: string, dryRun: boolean): void {
    const data = JSON.stringify({ type: 'tool_call', name, dryRun });
    for (const client of this.clients) {
      try { client.send(data); } catch { this.clients.delete(client); }
    }
  }

  sendConfirmation(preview: unknown): void {
    const data = JSON.stringify({ type: 'confirmation', preview });
    for (const client of this.clients) {
      try { client.send(data); } catch { this.clients.delete(client); }
    }
  }

  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  getPort(): number {
    return this.port;
  }

  private createApp(): Hono {
    const app = new Hono();

    app.get('/health', (c) => c.json({ status: 'ok', channel: 'webchat' }));

    // SSE endpoint for streaming responses
    app.get('/api/events', (c) => {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      const client: WebSocketClient = {
        ws: null as unknown as import('node:http').ServerResponse,
        send: (data: string) => {
          writer.write(encoder.encode(`data: ${data}\n\n`)).catch(() => {
            this.clients.delete(client);
          });
        },
      };

      this.clients.add(client);

      c.header('Content-Type', 'text/event-stream');
      c.header('Cache-Control', 'no-cache');
      c.header('Connection', 'keep-alive');
      c.header('Access-Control-Allow-Origin', '*');

      // Send keepalive
      const keepalive = setInterval(() => {
        writer.write(encoder.encode(': keepalive\n\n')).catch(() => {
          clearInterval(keepalive);
          this.clients.delete(client);
        });
      }, 15_000);

      // Clean up on close
      c.req.raw.signal.addEventListener('abort', () => {
        clearInterval(keepalive);
        this.clients.delete(client);
        writer.close().catch(() => {});
      });

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        },
      });
    });

    // POST message endpoint
    app.post('/api/message', async (c) => {
      const body = await c.req.json<{ text: string }>();
      if (!body.text?.trim()) {
        return c.json({ error: 'Message text is required' }, 400);
      }

      if (this.messageHandler) {
        // Fire and forget — response comes via SSE
        this.messageHandler({
          channelId: this.id,
          userId: WEBCHAT_USER_ID,
          text: body.text.trim(),
        }).catch(err => {
          const errorMsg = err instanceof Error ? err.message : 'Internal error';
          this.send(WEBCHAT_USER_ID, `Error: ${errorMsg}`);
        });
      }

      return c.json({ ok: true });
    });

    // Serve static WebChat files
    app.get('/*', async (c) => {
      const path = c.req.path === '/' ? '/index.html' : c.req.path;
      try {
        const { readFile } = await import('node:fs/promises');
        const { resolve, join } = await import('node:path');
        const { fileURLToPath } = await import('node:url');
        const __dirname = resolve(fileURLToPath(import.meta.url), '..');
        const distPath = join(__dirname, '..', 'web', 'dist');
        const filePath = join(distPath, path);

        // Basic security check
        if (!filePath.startsWith(distPath)) return c.text('Forbidden', 403);

        const content = await readFile(filePath);
        const ext = path.split('.').pop();
        const mimeTypes: Record<string, string> = {
          html: 'text/html', js: 'application/javascript', css: 'text/css',
          svg: 'image/svg+xml', png: 'image/png', ico: 'image/x-icon',
        };
        c.header('Content-Type', mimeTypes[ext ?? ''] ?? 'application/octet-stream');
        return c.body(content);
      } catch {
        // Fallback to inline HTML for development
        return c.html(getInlineHTML());
      }
    });

    return app;
  }
}

function getInlineHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>t2000 — AI Financial Advisor</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    --bg: #0a0a0b; --surface: #141416; --border: #1e1e22;
    --text: #e4e4e7; --text-muted: #71717a; --accent: #3b82f6;
    --green: #22c55e; --red: #ef4444;
  }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); height: 100vh; display: flex; flex-direction: column; }
  header { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; }
  header h1 { font-size: 16px; font-weight: 600; }
  .status { width: 8px; height: 8px; border-radius: 50%; background: var(--green); }
  .status.disconnected { background: var(--red); }
  #messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 16px; }
  .msg { max-width: 85%; padding: 12px 16px; border-radius: 12px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
  .msg.user { background: var(--accent); color: white; align-self: flex-end; border-bottom-right-radius: 4px; }
  .msg.assistant { background: var(--surface); border: 1px solid var(--border); align-self: flex-start; border-bottom-left-radius: 4px; }
  .msg .tool-badge { display: inline-block; background: #1e293b; border: 1px solid #334155; border-radius: 6px; padding: 2px 8px; font-size: 11px; color: var(--accent); margin: 4px 2px 4px 0; }
  .msg table { border-collapse: collapse; margin: 8px 0; font-size: 13px; }
  .msg th, .msg td { padding: 4px 10px; border: 1px solid var(--border); text-align: left; }
  .msg th { background: rgba(59,130,246,0.1); }
  .confirm-bar { display: flex; gap: 8px; margin-top: 8px; }
  .confirm-bar button { padding: 6px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
  .confirm-bar .accept { background: var(--green); color: white; }
  .confirm-bar .cancel { background: var(--surface); color: var(--text-muted); border: 1px solid var(--border); }
  .typing { align-self: flex-start; color: var(--text-muted); font-size: 13px; padding: 8px 16px; }
  #welcome { padding: 40px 20px; text-align: center; flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 16px; }
  #welcome h2 { font-size: 18px; font-weight: 600; color: var(--text); }
  #welcome p { font-size: 14px; color: var(--text-muted); max-width: 320px; }
  .quick-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; max-width: 380px; }
  .quick-btn { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 10px 16px; color: var(--text); font-size: 13px; cursor: pointer; transition: border-color 0.15s; }
  .quick-btn:hover { border-color: var(--accent); }
  .msg a { color: var(--accent); text-decoration: none; }
  .msg a:hover { text-decoration: underline; }
  .msg code { background: rgba(255,255,255,0.08); padding: 1px 5px; border-radius: 4px; font-family: 'SF Mono', Monaco, monospace; font-size: 0.9em; }
  .msg ul, .msg ol { margin: 4px 0; padding-left: 20px; }
  .msg li { margin: 2px 0; }
  footer { padding: 16px 20px; border-top: 1px solid var(--border); }
  #input-form { display: flex; gap: 8px; }
  #input { flex: 1; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px 16px; color: var(--text); font-size: 14px; outline: none; font-family: inherit; }
  #input:focus { border-color: var(--accent); }
  #send-btn { background: var(--accent); color: white; border: none; border-radius: 10px; padding: 12px 20px; cursor: pointer; font-weight: 500; font-size: 14px; }
  #send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  @media (max-width: 640px) { .msg { max-width: 95%; } }
</style>
</head>
<body>
<header>
  <div class="status" id="status"></div>
  <h1>t2000</h1>
</header>
<div id="welcome">
  <h2>t2000</h2>
  <p>Your AI financial advisor. Ask me anything about your accounts.</p>
  <div class="quick-actions">
    <button class="quick-btn" onclick="quickAction('What\\'s my balance?')">💰 Balance</button>
    <button class="quick-btn" onclick="quickAction('Show my portfolio')">📊 Portfolio</button>
    <button class="quick-btn" onclick="quickAction('What are the best rates?')">📈 Rates</button>
    <button class="quick-btn" onclick="quickAction('Show recent transactions')">💸 Transactions</button>
  </div>
</div>
<div id="messages" style="display:none"></div>
<footer>
  <form id="input-form">
    <input id="input" placeholder="Message your AI financial advisor..." autocomplete="off" />
    <button id="send-btn" type="submit">Send</button>
  </form>
</footer>
<script>
const messages = document.getElementById('messages');
const welcome = document.getElementById('welcome');
const input = document.getElementById('input');
const form = document.getElementById('input-form');
const statusDot = document.getElementById('status');
let currentAssistantMsg = null;
let connected = false;
let welcomeVisible = true;

function hideWelcome() {
  if (!welcomeVisible) return;
  welcomeVisible = false;
  welcome.style.display = 'none';
  messages.style.display = 'flex';
}

function quickAction(text) {
  hideWelcome();
  sendMsg(text);
}

function connect() {
  const es = new EventSource('/api/events');
  es.onopen = () => { connected = true; statusDot.className = 'status'; };
  es.onerror = () => { connected = false; statusDot.className = 'status disconnected'; };
  es.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === 'token') {
      hideWelcome();
      if (!currentAssistantMsg) {
        currentAssistantMsg = addMessage('', 'assistant');
      }
      currentAssistantMsg.textContent += data.text;
      scrollToBottom();
    } else if (data.type === 'message') {
      hideWelcome();
      if (currentAssistantMsg) {
        currentAssistantMsg.innerHTML = renderMarkdown(data.text);
      } else {
        const el = addMessage(data.text, 'assistant');
        el.innerHTML = renderMarkdown(data.text);
      }
      currentAssistantMsg = null;
    } else if (data.type === 'tool_call') {
      hideWelcome();
      if (!currentAssistantMsg) currentAssistantMsg = addMessage('', 'assistant');
      const badge = document.createElement('span');
      badge.className = 'tool-badge';
      badge.textContent = (data.dryRun ? '🔍 ' : '⚡ ') + data.name.replace('t2000_', '');
      currentAssistantMsg.prepend(badge);
    } else if (data.type === 'confirmation') {
      if (currentAssistantMsg) {
        const bar = document.createElement('div');
        bar.className = 'confirm-bar';
        bar.innerHTML = '<button class="accept" onclick="sendMsg(\\'yes\\')">Confirm</button><button class="cancel" onclick="sendMsg(\\'no\\')">Cancel</button>';
        currentAssistantMsg.appendChild(bar);
      }
    }
  };
}

function addMessage(text, role) {
  const el = document.createElement('div');
  el.className = 'msg ' + role;
  el.textContent = text;
  messages.appendChild(el);
  scrollToBottom();
  return el;
}

function scrollToBottom() { messages.scrollTop = messages.scrollHeight; }

function renderMarkdown(text) {
  let html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
    .replace(/\`([^\`]+)\`/g, '<code>$1</code>');
  const lines = html.split('\\n');
  let result = [];
  let inList = false;
  for (const line of lines) {
    if (line.match(/^\\s*[-*]\\s+/)) {
      if (!inList) { result.push('<ul>'); inList = true; }
      result.push('<li>' + line.replace(/^\\s*[-*]\\s+/, '') + '</li>');
    } else {
      if (inList) { result.push('</ul>'); inList = false; }
      result.push(line);
    }
  }
  if (inList) result.push('</ul>');
  return result.join('<br>').replace(/<br><ul>/g, '<ul>').replace(/<\\/ul><br>/g, '</ul>');
}

function sendMsg(text) {
  if (!text.trim()) return;
  hideWelcome();
  addMessage(text, 'user');
  input.value = '';
  currentAssistantMsg = null;
  fetch('/api/message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
}

form.addEventListener('submit', (e) => { e.preventDefault(); sendMsg(input.value); });
input.addEventListener('keydown', (e) => {
  if (e.key === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); messages.innerHTML = ''; }
});
connect();
</script>
</body>
</html>`;
}
