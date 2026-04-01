'use client';

import type { ContextualChip } from '@/lib/contextual-chips';

interface ContextualChipsProps {
  chips: ContextualChip[];
  onChipFlow: (flow: string) => void;
  onAgentPrompt: (prompt: string) => void;
  onDismiss: (id: string) => void;
}

export function ContextualChips({ chips, onChipFlow, onAgentPrompt, onDismiss }: ContextualChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div
      className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1"
      role="toolbar"
      aria-label="Suggestions"
    >
      {chips.map((chip) => (
        <button
          key={chip.id}
          onClick={() => {
            onDismiss(chip.id);
            if (chip.chipFlow) {
              onChipFlow(chip.chipFlow);
            } else if (chip.agentPrompt !== undefined) {
              onAgentPrompt(chip.agentPrompt || chip.label);
            }
          }}
          className="group relative flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-border/30 hover:border-border-bright active:scale-[0.97]"
        >
          <span className="text-sm leading-none">{chip.icon}</span>
          <span className="whitespace-nowrap">{chip.label}</span>
          {chip.dismissible && (
            <span
              role="button"
              aria-label={`Dismiss ${chip.label}`}
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(chip.id);
              }}
              className="ml-0.5 text-muted hover:text-foreground transition opacity-0 group-hover:opacity-100"
            >
              ×
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
