'use client';

interface ChipBarProps {
  onChipClick: (flow: string) => void;
  activeFlow: string | null;
  disabled?: boolean;
}

const ALL_CHIPS = [
  { id: 'save', label: 'Save' },
  { id: 'send', label: 'Send' },
  { id: 'swap', label: 'Swap' },
  { id: 'borrow', label: 'Borrow' },
  { id: 'invest', label: 'Invest' },
  { id: 'receive', label: 'Receive' },
  { id: 'withdraw', label: 'Withdraw' },
  { id: 'repay', label: 'Repay' },
  { id: 'report', label: 'Report' },
  { id: 'history', label: 'History' },
  { id: 'help', label: 'Help' },
];

export function ChipBar({ onChipClick, activeFlow, disabled }: ChipBarProps) {
  return (
    <div
      className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1 md:flex-wrap md:overflow-x-visible"
      role="toolbar"
      aria-label="Quick actions"
    >
      {ALL_CHIPS.map((chip) => (
        <button
          key={chip.id}
          onClick={() => onChipClick(chip.id)}
          disabled={disabled}
          aria-pressed={activeFlow === chip.id}
          className={[
            'shrink-0 md:shrink rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-[0.95] border',
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
    </div>
  );
}
