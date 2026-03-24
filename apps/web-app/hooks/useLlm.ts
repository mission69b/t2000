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

function generateLocalResponse(message: string): FeedItemData {
  const text = message.toLowerCase();

  if (/report|overview|summary|financial/.test(text)) {
    return {
      type: 'ai-text',
      text: 'Use the Report chip to see your full account breakdown, or type "balance" for a quick check.',
      chips: [{ label: 'Report', flow: 'report' }, { label: 'Balance', flow: 'balance' }],
    };
  }

  if (/history|transactions|recent|activity/.test(text)) {
    return {
      type: 'ai-text',
      text: 'Transaction history is coming soon. You can view your on-chain activity on Suiscan in the meantime.',
      chips: [{ label: 'Report', flow: 'report' }],
    };
  }

  if (/rates?|apy|yield|interest|earning/.test(text)) {
    return {
      type: 'ai-text',
      text: 'Savings rates are fetched from NAVI Protocol in real-time. Tap Save to see the current rate and start earning yield.',
      chips: [{ label: 'Save', flow: 'save' }],
    };
  }

  if (/what.*(can|do)|help|features|how/.test(text)) {
    return {
      type: 'ai-text',
      text: 'Here\'s what I can do:\n\n• Save — Earn yield on idle funds\n• Send — Transfer to anyone\n• Borrow — Against your savings\n• Invest — Buy SUI, BTC, ETH, GOLD\n• Services — Gift cards, AI tools, 90+ endpoints\n• Report — Full financial summary\n\nType a command like "save $100" or tap a chip below.',
    };
  }

  if (/invest|portfolio|performance/.test(text)) {
    return {
      type: 'ai-text',
      text: 'Tap Invest to browse assets. You can buy SUI, BTC, ETH, or GOLD.',
      chips: [{ label: 'Invest', flow: 'invest' }],
    };
  }

  if (/gift.?card|uber|starbucks|netflix|amazon/.test(text)) {
    return {
      type: 'ai-text',
      text: 'Gift cards are available through Services. Browse the catalog to find Uber Eats, Starbucks, Netflix, and more.',
      chips: [{ label: 'Services', flow: 'services' }],
    };
  }

  if (/service|pay.*for|api|tool/.test(text)) {
    return {
      type: 'ai-text',
      text: 'Browse 41 services including AI models, gift cards, email, and more. Tap Services to see the full catalog.',
      chips: [{ label: 'Services', flow: 'services' }],
    };
  }

  if (/safe|security|protect|secure/.test(text)) {
    return {
      type: 'ai-text',
      text: 'Your account is non-custodial — only you control your funds via your Google account. Keys are ephemeral and never stored. All transactions are gas-sponsored (free).',
    };
  }

  if (/address|receive|deposit|fund|add.*money/.test(text)) {
    return {
      type: 'ai-text',
      text: 'To add funds, send USDC or SUI to your wallet address. Tap below to see it.',
      chips: [{ label: 'Show address', flow: 'receive' }],
    };
  }

  if (/thank|thanks/.test(text)) {
    return { type: 'ai-text', text: 'Happy to help! Let me know if you need anything else.' };
  }

  if (/hello|hey|hi|gm/.test(text)) {
    return {
      type: 'ai-text',
      text: 'Hey! What would you like to do? You can save, send, borrow, or browse services.',
      chips: [{ label: 'Save', flow: 'save' }, { label: 'Services', flow: 'services' }],
    };
  }

  return {
    type: 'ai-text',
    text: `I can help with saving, sending, borrowing, investing, and services. Try one of these actions or rephrase your question.`,
    chips: [
      { label: 'Save', flow: 'save' },
      { label: 'Services', flow: 'services' },
      { label: 'Help', flow: 'help' },
    ],
  };
}
