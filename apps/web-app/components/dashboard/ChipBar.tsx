'use client';

interface ChipBarProps {
  onChipClick: (flow: string) => void;
  activeFlow: string | null;
  disabled?: boolean;
}

const CHIPS = [
  { id: 'save', label: 'Save' },
  { id: 'send', label: 'Send' },
  { id: 'services', label: 'Pay' },
  { id: 'borrow', label: 'Borrow' },
  { id: 'withdraw', label: 'Withdraw' },
  { id: 'repay', label: 'Repay' },
  { id: 'swap', label: 'Invest' },
  { id: 'receive', label: 'Receive' },
  { id: 'report', label: 'Report' },
  { id: 'history', label: 'History' },
  { id: 'help', label: 'Help' },
];

export function ChipBar({ onChipClick, activeFlow, disabled }: ChipBarProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CHIPS.map((chip) => (
        <button
          key={chip.id}
          onClick={() => onChipClick(chip.id)}
          disabled={disabled}
          className={[
            'rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-[0.95] border',
            'disabled:opacity-40 disabled:cursor-not-allowed',
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
