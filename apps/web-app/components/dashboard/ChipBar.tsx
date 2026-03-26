'use client';

import { useState } from 'react';

interface ChipBarProps {
  onChipClick: (flow: string) => void;
  activeFlow: string | null;
  disabled?: boolean;
}

const PAGE_1 = [
  { id: 'save', label: 'Save' },
  { id: 'send', label: 'Send' },
  { id: 'swap', label: 'Swap' },
  { id: 'borrow', label: 'Borrow' },
  { id: 'invest', label: 'Invest' },
  { id: 'receive', label: 'Receive' },
];

const PAGE_2 = [
  { id: 'withdraw', label: 'Withdraw' },
  { id: 'repay', label: 'Repay' },
  { id: 'report', label: 'Report' },
  { id: 'history', label: 'History' },
  { id: 'help', label: 'Help' },
];

export function ChipBar({ onChipClick, activeFlow, disabled }: ChipBarProps) {
  const [page, setPage] = useState(0);
  const chips = page === 0 ? PAGE_1 : PAGE_2;

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
        onClick={() => setPage(page === 0 ? 1 : 0)}
        disabled={disabled}
        className="rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-[0.95] border bg-panel border-border text-muted hover:border-border-bright hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label={page === 0 ? 'More actions' : 'Back to main actions'}
      >
        {page === 0 ? 'More' : 'Back'}
      </button>
    </div>
  );
}
