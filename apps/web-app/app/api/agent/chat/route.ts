import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import {
  buildSystemPrompt,
  getAnthropicTools,
  normalizeAnthropicResponse,
  toAnthropicMessages,
} from '@/lib/agent-tools';

export const runtime = 'nodejs';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.AGENT_MODEL ?? 'claude-sonnet-4-20250514';

export async function POST(request: NextRequest) {
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { content: 'Agent is not configured. Try using the chips below to get started.' },
      { status: 200 },
    );
  }

  let body: {
    messages: Array<{
      role: 'user' | 'assistant' | 'tool';
      content?: string;
      tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
      tool_call_id?: string;
    }>;
    address: string;
    email: string;
    balanceSummary?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { messages, address, email, balanceSummary } = body;

  if (!messages?.length || !address) {
    return NextResponse.json({ error: 'Messages and address required' }, { status: 400 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = rateLimit(`agent:${ip}`, 30, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const systemPrompt = buildSystemPrompt(address, email, balanceSummary);
    const tools = getAnthropicTools();
    const anthropicMessages = toAnthropicMessages(messages);

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: anthropicMessages,
      tools,
    });

    return NextResponse.json(normalizeAnthropicResponse(response));
  } catch (err) {
    console.error('[agent/chat] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { content: 'Something went wrong. Try again or use the chips below.' },
      { status: 200 },
    );
  }
}
