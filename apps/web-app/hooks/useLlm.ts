'use client';

import { useCallback, useState } from 'react';
import type { FeedItemData } from '@/lib/feed-types';

export interface UseLlmReturn {
  loading: boolean;
  error: string | null;
  query: (message: string, address: string, balanceContext?: string) => Promise<FeedItemData>;
  queryStream: (
    message: string,
    address: string,
    balanceContext: string | undefined,
    onToken: (text: string) => void,
  ) => Promise<FeedItemData>;
}

const FALLBACK: FeedItemData = {
  type: 'ai-text',
  text: 'I can help with trading, saving, sending, borrowing, and services. Try tapping a chip below.',
  chips: [
    { label: 'Save', flow: 'save' },
    { label: 'Services', flow: 'services' },
    { label: 'Help', flow: 'help' },
  ],
};

function parseSSEChunks(raw: string): string {
  let text = '';
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const payload = line.slice(6).trim();
    if (payload === '[DONE]') break;
    try {
      const parsed = JSON.parse(payload);
      const delta = parsed.choices?.[0]?.delta?.content;
      if (delta) text += delta;
    } catch {
      // skip malformed chunks
    }
  }
  return text;
}

/**
 * LLM integration hook — Tier 3 of the intent routing system.
 *
 * Sends user messages to /api/llm which either calls a real LLM
 * (if LLM_API_KEY is configured) or returns a smart fallback.
 *
 * `queryStream` streams tokens to the UI as they arrive.
 */
export function useLlm(): UseLlmReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useCallback(
    async (message: string, _address: string, balanceContext?: string): Promise<FeedItemData> => {
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

        if (!res.ok) throw new Error('LLM query failed');

        const data = await res.json();
        return {
          type: 'ai-text',
          text: data.text ?? 'I can help with trading, saving, sending, borrowing, and services.',
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'LLM query failed';
        setError(msg);
        return FALLBACK;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const queryStream = useCallback(
    async (
      message: string,
      _address: string,
      balanceContext: string | undefined,
      onToken: (text: string) => void,
    ): Promise<FeedItemData> => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch('/api/llm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            stream: true,
            context: balanceContext ? { balance: balanceContext } : undefined,
          }),
        });

        if (!res.ok) throw new Error('LLM query failed');

        const contentType = res.headers.get('content-type') ?? '';
        if (!contentType.includes('text/event-stream')) {
          const data = await res.json();
          const text = data.text ?? 'I can help with trading, saving, sending, borrowing, and services.';
          return { type: 'ai-text', text };
        }

        if (!res.body) throw new Error('No response body');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const newText = parseSSEChunks(chunk);
          if (newText) {
            fullText += newText;
            onToken(fullText);
          }
        }

        return { type: 'ai-text', text: fullText || 'I can help with trading, saving, sending, borrowing, and services.' };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'LLM query failed';
        setError(msg);
        return FALLBACK;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { loading, error, query, queryStream };
}
