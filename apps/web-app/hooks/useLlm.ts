'use client';

import { useCallback, useState } from 'react';
import type { FeedItemData } from '@/lib/feed-types';

export interface UseLlmReturn {
  loading: boolean;
  error: string | null;
  query: (message: string, address: string, balanceContext?: string) => Promise<FeedItemData>;
}

/**
 * LLM integration hook — Tier 3 of the intent routing system.
 *
 * Sends user messages to /api/llm which either calls a real LLM
 * (if LLM_API_KEY is configured) or returns a smart fallback.
 */
export function useLlm(): UseLlmReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useCallback(
    async (message: string, address: string, balanceContext?: string): Promise<FeedItemData> => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch('/api/llm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            context: balanceContext ? { balance: balanceContext } : undefined,
          }),
        });

        if (!res.ok) {
          throw new Error('LLM query failed');
        }

        const data = await res.json();

        return {
          type: 'ai-text',
          text: data.text ?? 'I can help with saving, sending, borrowing, investing, and services.',
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'LLM query failed';
        setError(msg);
        return {
          type: 'ai-text',
          text: 'I can help with saving, sending, borrowing, investing, and services. Try tapping a chip below.',
          chips: [
            { label: 'Save', flow: 'save' },
            { label: 'Services', flow: 'services' },
            { label: 'Help', flow: 'help' },
          ],
        };
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { loading, error, query };
}
