'use client';

import type { EngineChatMessage } from '@/lib/engine-types';
import { ToolCard } from './ToolCard';
import { PermissionCard } from './PermissionCard';

interface ChatMessageProps {
  message: EngineChatMessage;
  onPermissionResolve?: (permissionId: string, approved: boolean) => void;
}

export function ChatMessage({ message, onPermissionResolve }: ChatMessageProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end" role="log" aria-label="Your message">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-foreground px-4 py-2.5 text-sm text-background break-words overflow-hidden">
          {message.content}
        </div>
      </div>
    );
  }

  const hasTools = message.tools && message.tools.length > 0;
  const hasPermission = message.permission && message.permission.status === 'pending';
  const hasContent = message.content.length > 0;

  return (
    <div className="space-y-2" role="log" aria-label="Audric response">
      {hasTools && (
        <div className="flex flex-wrap gap-x-3 gap-y-1.5" role="status" aria-label="Tool activity">
          {message.tools!.map((tool) => (
            <ToolCard key={tool.toolUseId} tool={tool} />
          ))}
        </div>
      )}

      {hasPermission && onPermissionResolve && (
        <PermissionCard
          permission={message.permission!}
          onResolve={onPermissionResolve}
        />
      )}

      {(hasContent || message.isStreaming) && (
        <div
          className="rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-3 text-sm overflow-hidden shadow-[var(--shadow-card)]"
          aria-live={message.isStreaming ? 'polite' : 'off'}
          aria-atomic="false"
        >
          <span className="text-dim font-mono text-xs mr-1.5 float-left leading-relaxed uppercase" aria-hidden="true">au</span>
          <span className="text-foreground leading-relaxed whitespace-pre-wrap">
            {message.content}
            {message.isStreaming && (
              <span
                className="inline-block w-1.5 h-4 bg-foreground/40 animate-pulse ml-0.5 align-text-bottom"
                aria-hidden="true"
              />
            )}
          </span>
          {message.isStreaming && (
            <span className="sr-only">Audric is typing</span>
          )}
        </div>
      )}

      {message.usage && !message.isStreaming && (
        <div className="flex justify-end">
          <span className="text-[10px] text-dim font-mono" aria-label={`${message.usage.inputTokens + message.usage.outputTokens} tokens used`}>
            {message.usage.inputTokens + message.usage.outputTokens} tokens
          </span>
        </div>
      )}
    </div>
  );
}
