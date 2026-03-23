'use client';

import type { SmartCardData } from '@/lib/smart-cards';

interface SmartCardProps {
  card: SmartCardData;
  onAction: (chipFlow: string) => void;
  onDismiss?: () => void;
}

export function SmartCard({ card, onAction, onDismiss }: SmartCardProps) {
  return (
    <div className="rounded-xl bg-neutral-900 p-4 space-y-3">
      <div className="space-y-1">
        <p className="text-sm">
          <span className="mr-1.5">{card.icon}</span>
          {card.title}
        </p>
        {card.body && (
          <p className="text-sm text-neutral-400">{card.body}</p>
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
                  ? 'rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-950 transition hover:bg-neutral-200 active:scale-[0.97]'
                  : 'rounded-lg bg-neutral-800 px-4 py-2 text-sm text-neutral-400 transition hover:text-white hover:bg-neutral-700 active:scale-[0.97]'
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
