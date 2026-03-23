'use client';

import type { SmartCardData } from '@/lib/smart-cards';

interface SmartCardProps {
  card: SmartCardData;
  onAction: (chipFlow: string) => void;
  onDismiss?: () => void;
}

export function SmartCard({ card, onAction, onDismiss }: SmartCardProps) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3 feed-row">
      <div className="space-y-1">
        <p className="text-sm text-foreground">
          <span className="mr-1.5">{card.icon}</span>
          {card.title}
        </p>
        {card.body && (
          <p className="text-sm text-muted">{card.body}</p>
        )}
      </div>

      {card.actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {card.actions.map((action) => (
            <button
              key={action.label}
              onClick={() => {
                if (action.chipFlow) {
                  onAction(action.chipFlow);
                } else if (action.variant === 'secondary' && card.dismissible) {
                  onDismiss?.();
                }
              }}
              className={
                action.variant === 'primary'
                  ? 'rounded-lg bg-accent px-4 py-2 text-sm font-medium text-background transition hover:bg-accent/90 active:scale-[0.97]'
                  : 'rounded-lg border border-border bg-panel px-4 py-2 text-sm text-muted transition hover:text-foreground hover:border-border-bright active:scale-[0.97]'
              }
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
