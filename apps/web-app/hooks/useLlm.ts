'use client';

import { useCallback, useState } from 'react';
import type { FeedItemData } from '@/lib/feed-types';

export interface UseLlmReturn {
  loading: boolean;
  error: string | null;
  query: (message: string, address: string) => Promise<FeedItemData>;
}

const LLM_SYSTEM_PROMPT = `You are t2000, a smart banking assistant. You help users manage their funds, earn yield, pay for services, and invest.

You have access to the user's Sui blockchain account. You can:
- Check balances and positions
- Generate financial reports and earnings summaries
- Explain DeFi concepts in plain language
- Recommend optimizations (better rates, idle fund sweeps)

Keep responses brief, friendly, and actionable. Use concrete numbers when possible. Never use jargon without explanation.

When the user asks to perform an action (save, send, borrow, etc.), respond with a clear summary of what you'll do and the key numbers. The UI will show a confirmation card — you don't need to ask "are you sure?"

Format guidelines:
- Short paragraphs, not walls of text
- Use $ for all amounts
- Percentages with one decimal (6.8%, not 6.7834%)
- No markdown formatting (the UI handles styling)`;

/**
 * LLM integration hook — Tier 3 of the intent routing system.
 *
 * Sends user messages to an LLM endpoint (via MPP gateway).
 * The LLM can respond with text or tool calls.
 *
 * Currently uses a placeholder endpoint. In production, this will
 * route through the MPP gateway for dogfooding.
 */
export function useLlm(): UseLlmReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useCallback(
    async (message: string, _address: string): Promise<FeedItemData> => {
      setLoading(true);
      setError(null);

      try {
        // TODO: Route through MPP gateway once LLM endpoint is configured
        // For now, provide intelligent canned responses based on keywords
        const response = generateLocalResponse(message);
        return response;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'LLM query failed';
        setError(msg);
        return { type: 'error', message: msg };
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { loading, error, query };
}

/**
 * Local response generation for common queries until LLM endpoint is wired.
 * This gives users meaningful responses without requiring an LLM API key.
 */
function generateLocalResponse(message: string): FeedItemData {
  const text = message.toLowerCase();

  if (/report|overview|summary|financial/.test(text)) {
    return {
      type: 'report',
      sections: [
        {
          title: '📊 Account Overview',
          lines: [
            'Connect your account data to see your full financial report.',
            'Tip: Use the [Save] chip to start earning yield on idle funds.',
          ],
        },
      ],
    };
  }

  if (/history|transactions|recent|activity/.test(text)) {
    return {
      type: 'ai-text',
      text: 'Your transaction history will appear here once you make your first transaction. Try saving or sending funds to get started!',
    };
  }

  if (/rates?|apy|yield|interest|earning/.test(text)) {
    return {
      type: 'ai-text',
      text: 'Current savings rates are fetched from Suilend and NAVI protocols in real-time. Tap [Save] to see the best rate available for your deposit.',
      chips: [{ label: 'Save now', flow: 'save' }],
    };
  }

  if (/what.*(can|do)|help|features/.test(text)) {
    return {
      type: 'ai-text',
      text: 'Here\'s what I can help with:\n\n• Save — Earn yield on idle funds\n• Send — Transfer to anyone\n• Borrow — Against your savings\n• Invest — Buy SUI, BTC, ETH, GOLD\n• Services — Gift cards, AI tools, and 90+ endpoints\n• Report — Full financial summary\n\nJust tap a chip below or type a command like "save $100".',
    };
  }

  if (/invest|portfolio|performance/.test(text)) {
    return {
      type: 'ai-text',
      text: 'Your investment portfolio will show here once you start investing. Tap [Invest] to buy SUI, BTC, ETH, or GOLD.',
      chips: [{ label: 'Invest', flow: 'invest' }],
    };
  }

  if (/thank|thanks/.test(text)) {
    return { type: 'ai-text', text: 'Happy to help! Let me know if you need anything else.' };
  }

  // Generic fallback
  return {
    type: 'ai-text',
    text: `I understand you're asking about "${message}". This will be answered by our AI when the LLM integration is fully connected. In the meantime, try using the suggestion chips below for common actions!`,
    chips: [
      { label: 'Save', flow: 'save' },
      { label: 'Send', flow: 'send' },
      { label: 'Help', flow: 'help' },
    ],
  };
}
