'use client';

import { useState } from 'react';

interface ChipBarProps {
  onChipClick: (flow: string) => void;
  activeFlow: string | null;
  disabled?: boolean;
}

const CORE_CHIPS = [
  { id: 'save', label: 'Save' },
  { id: 'send', label: 'Send' },
  { id: 'borrow', label: 'Borrow' },
  { id: 'receive', label: 'Receive' },
];

const MORE_CHIPS = [
  { id: 'withdraw', label: 'Withdraw' },
  { id: 'repay', label: 'Repay' },
  { id: 'report', label: 'Report' },
  { id: 'history', label: 'History' },
  { id: 'help', label: 'Help' },
];

export function ChipBar({ onChipClick, activeFlow, disabled }: ChipBarProps) {
  const [expanded, setExpanded] = useState(false);
  const chips = expanded ? [...CORE_CHIPS, ...MORE_CHIPS] : CORE_CHIPS;

  return (
    <div className="flex flex-wrap gap-1.5" role="toolbar" aria-label="Quick actions">
      {chips.map((chip) => (
        <button
          key={chip.id}
          onClick={() => onChipClick(chip.id)}
          disabled={disabled}
          aria-pressed={activeFlow === chip.id}
          className={[
            'rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-[0.95] border',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            'focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
            activeFlow === chip.id
              ? 'bg-accent-dim border-accent/40 text-accent'
              : 'bg-panel border-border text-muted hover:border-border-bright hover:text-foreground',
          ].join(' ')}
        >
          {chip.label}
        </button>
      ))}
      <button
        onClick={() => setExpanded(!expanded)}
        disabled={disabled}
        className="rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-[0.95] border bg-panel border-border text-muted hover:border-border-bright hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
        aria-expanded={expanded}
        aria-label={expanded ? 'Show fewer actions' : 'Show more actions'}
      >
        {expanded ? 'Less' : 'More'}
      </button>
    </div>
  );
}
