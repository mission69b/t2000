import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const GATEWAY_BASE = process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'https://mpp.t2000.ai';
const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_MODEL = process.env.LLM_MODEL ?? 'gpt-4o-mini';
const LLM_ENDPOINT = process.env.LLM_ENDPOINT ?? `${GATEWAY_BASE}/openai/v1/chat/completions`;

const SYSTEM_PROMPT = `You are t2000, a smart banking assistant for a Web3 wallet app on Sui blockchain.

You help users manage funds, earn yield, send money, trade crypto, borrow, and use 40+ paid services via the MPP gateway.

Available actions (users trigger via chips or typed commands):
- Swap: Buy, sell, or swap between SUI, BTC, ETH, GOLD, USDC (via Cetus DEX)
- Save: Earn yield on idle USDC (via NAVI Protocol)
- Send: Transfer USDC/SUI to any address
- Withdraw: Pull funds from savings
- Borrow: Borrow against savings collateral
- Repay: Repay outstanding debt
- Services: Gift cards, AI, search, email, and 40+ APIs (paid via MPP)

Rules:
- Keep responses brief (2-4 sentences max)
- Use $ for amounts, one decimal for percentages
- Be actionable: tell the user what to do next
- Don't use markdown formatting (the UI handles styling)
- When asked to perform an action, just confirm what will happen — the UI shows a confirmation card
- For services, mention the Pay/Services chip`;

/**
 * POST /api/llm
 *
 * Sends a user message to an LLM and returns the response.
 * Uses a server-side API key (free for the user) or routes through MPP gateway.
 */
export async function POST(request: NextRequest) {
  let body: { message: string; context?: { balance?: string }; stream?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { message, context } = body;

  if (!message?.trim()) {
    return NextResponse.json({ error: 'Message required' }, { status: 400 });
  }

  // 20 LLM queries per minute (IP-based since no address in body)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = rateLimit(`llm:${ip}`, 20, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  const wantsStream = body.stream === true;

  if (!LLM_API_KEY) {
    return NextResponse.json({ text: fallbackResponse(message) });
  }

  const systemContent = context?.balance
    ? `${SYSTEM_PROMPT}\n\nUser's current account state:\n${context.balance}`
    : SYSTEM_PROMPT;

  const llmBody = {
    model: LLM_MODEL,
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: message },
    ],
    max_tokens: 300,
    temperature: 0.7,
    stream: wantsStream,
  };

  if (!wantsStream) {
    try {
      const res = await fetch(LLM_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${LLM_API_KEY}`,
        },
        body: JSON.stringify(llmBody),
      });

      if (!res.ok) {
        console.error('[llm] API error:', res.status, await res.text().catch(() => ''));
        return NextResponse.json({ text: fallbackResponse(message) });
      }

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content ?? fallbackResponse(message);

      return NextResponse.json({ text });
    } catch (err) {
      console.error('[llm] Error:', err instanceof Error ? err.message : err);
      return NextResponse.json({ text: fallbackResponse(message) });
    }
  }

  try {
    const res = await fetch(LLM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify(llmBody),
    });

    if (!res.ok || !res.body) {
      console.error('[llm] Stream error:', res.status);
      return NextResponse.json({ text: fallbackResponse(message) });
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }

          const chunk = decoder.decode(value, { stream: true });
          controller.enqueue(new TextEncoder().encode(chunk));
        } catch {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    console.error('[llm] Stream error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ text: fallbackResponse(message) });
  }
}

function fallbackResponse(message: string): string {
  const text = message.toLowerCase();
  if (/rate|apy|yield/.test(text)) return 'Tap Save to see current yield rates from NAVI Protocol.';
  if (/invest|buy|sell|trade|swap|portfolio/.test(text)) return 'Tap Swap to buy, sell, or swap assets — SUI, BTC, ETH, GOLD available.';
  if (/service|gift|pay/.test(text)) return 'Tap Pay to browse 40+ services including gift cards, AI, and more.';
  if (/safe|secure/.test(text)) return 'Your account is non-custodial — only you control your funds via Google login. All transactions are gas-free.';
  return 'I can help with swapping, saving, sending, borrowing, and services. Try tapping a chip below or typing a specific command.';
}
