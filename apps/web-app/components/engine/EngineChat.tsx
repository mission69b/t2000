'use client';

import { useCallback, useEffect, useRef } from 'react';
import { ChatMessage } from './ChatMessage';
import { QuickActions } from './QuickActions';
import type { useEngine } from '@/hooks/useEngine';

type EngineInstance = ReturnType<typeof useEngine>;

interface EngineChatProps {
  engine: EngineInstance;
  email: string | null;
}

function ConnectingSkeleton() {
  return (
    <div className="space-y-2 animate-pulse" role="status" aria-label="Connecting to Audric">
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          <span className="h-3 w-3 shrink-0 animate-spin rounded-full border border-border-bright border-t-foreground" />
          <span>Thinking...</span>
        </span>
      </div>
      <div className="rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-3">
        <div className="h-3 w-2/3 rounded bg-border" />
      </div>
    </div>
  );
}

export function EngineChat({ engine, email }: EngineChatProps) {
  const feedEndRef = useRef<HTMLDivElement>(null);
  const lastMsgCount = useRef(0);

  useEffect(() => {
    if (engine.messages.length > lastMsgCount.current) {
      feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      lastMsgCount.current = engine.messages.length;
    }
  }, [engine.messages.length]);

  useEffect(() => {
    if (engine.isStreaming) {
      feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [engine.isStreaming, engine.messages[engine.messages.length - 1]?.content.length]);

  const handleQuickAction = useCallback(
    (prompt: string) => {
      engine.sendMessage(prompt);
    },
    [engine.sendMessage],
  );

  const handlePermissionResolve = useCallback(
    (permissionId: string, approved: boolean) => {
      engine.resolvePermission(permissionId, approved);
    },
    [engine.resolvePermission],
  );

  const isEmpty = engine.messages.length === 0;
  const greeting = getGreeting(email);
  const isConnecting = engine.status === 'connecting';
  const lastMsg = engine.messages[engine.messages.length - 1];
  const showSkeleton = isConnecting && lastMsg?.role === 'assistant' && !lastMsg.content;

  return (
    <div className="space-y-3">
      {isEmpty && !engine.isStreaming && (
        <div className="flex flex-col items-center py-8 space-y-4">
          <p className="text-sm text-muted">{greeting}</p>
          <QuickActions onSelect={handleQuickAction} disabled={engine.isStreaming} />
        </div>
      )}

      {engine.messages.map((msg) => {
        if (showSkeleton && msg.id === lastMsg?.id) {
          return <ConnectingSkeleton key={msg.id} />;
        }
        return (
          <ChatMessage
            key={msg.id}
            message={msg}
            onPermissionResolve={handlePermissionResolve}
          />
        );
      })}

      {engine.error && !engine.isStreaming && (
        <div
          className="rounded-lg bg-error/5 border border-error/20 px-4 py-3 text-sm flex items-center justify-between gap-2"
          role="alert"
        >
          <span className="text-error">{engine.error}</span>
          <div className="flex gap-2 shrink-0">
            {engine.canRetry && (
              <button
                onClick={engine.retry}
                className="rounded-lg border border-error/30 px-3 py-1 text-xs text-error hover:bg-error/5 transition"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      <div ref={feedEndRef} />
    </div>
  );
}

function getGreeting(email: string | null): string {
  const hour = new Date().getHours();
  const name = email?.split('@')[0] ?? '';
  const nameStr = name ? `, ${name}` : '';

  if (hour < 12) return `Good morning${nameStr}`;
  if (hour < 18) return `Good afternoon${nameStr}`;
  return `Good evening${nameStr}`;
}
