import {
  QueryEngine,
  AnthropicProvider,
  McpClientManager,
  NAVI_MCP_CONFIG,
  READ_TOOLS,
  type SessionData,
  type SessionStore,
} from '@t2000/engine';
import { UpstashSessionStore } from './upstash-session-store';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.AGENT_MODEL ?? 'claude-sonnet-4-20250514';

let sessionStore: SessionStore | null = null;
let mcpManager: McpClientManager | null = null;
let mcpConnecting: Promise<void> | null = null;

export function getSessionStore(): SessionStore {
  if (!sessionStore) {
    sessionStore = new UpstashSessionStore();
  }
  return sessionStore;
}

let mcpFailedAt = 0;
const MCP_RETRY_MS = 60_000; // retry MCP connection after 1 minute

async function ensureMcpConnected(): Promise<McpClientManager> {
  if (mcpManager && mcpManager.isConnected(NAVI_MCP_CONFIG.name)) {
    return mcpManager;
  }

  if (mcpManager && Date.now() - mcpFailedAt < MCP_RETRY_MS) {
    return mcpManager;
  }

  if (!mcpConnecting) {
    mcpConnecting = (async () => {
      const mgr = mcpManager ?? new McpClientManager();
      try {
        await mgr.connect(NAVI_MCP_CONFIG);
        mcpManager = mgr;
        mcpFailedAt = 0;
      } catch (err) {
        console.warn('[engine] NAVI MCP connection failed, SDK fallback:', err);
        mcpManager = mgr;
        mcpFailedAt = Date.now();
      } finally {
        mcpConnecting = null;
      }
    })();
  }

  await mcpConnecting;
  return mcpManager!;
}

export async function createEngine(
  address: string,
  session?: SessionData | null,
): Promise<QueryEngine> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const mgr = await ensureMcpConnected();

  const engine = new QueryEngine({
    provider: new AnthropicProvider({ apiKey: ANTHROPIC_API_KEY }),
    mcpManager: mgr,
    walletAddress: address,
    tools: READ_TOOLS,
    model: MODEL,
    maxTurns: 10,
    maxTokens: 4096,
    costTracker: {
      budgetLimitUsd: 0.50,
    },
  });

  if (session?.messages?.length) {
    engine.loadMessages(session.messages);
  }

  return engine;
}

export function generateSessionId(): string {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
