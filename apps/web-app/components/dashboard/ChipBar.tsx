'use client';

import { useState } from 'react';

interface ChipBarProps {
  onChipClick: (flow: string) => void;
  activeFlow: string | null;
  disabled?: boolean;
}

const L1_CHIPS = [
  { id: 'save', label: 'Save' },
  { id: 'send', label: 'Send' },
  { id: 'services', label: 'Services' },
  { id: 'more', label: 'More...' },
];

const MORE_CHIPS = [
  { id: 'borrow', label: 'Borrow' },
  { id: 'invest', label: 'Invest' },
  { id: 'swap', label: 'Swap' },
  { id: 'withdraw', label: 'Withdraw' },
  { id: 'repay', label: 'Repay' },
  { id: 'report', label: 'Report' },
  { id: 'history', label: 'History' },
  { id: 'receive', label: 'Receive' },
  { id: 'help', label: 'Help' },
];

export function ChipBar({ onChipClick, activeFlow, disabled }: ChipBarProps) {
  const [showMore, setShowMore] = useState(false);

  const chips = showMore ? MORE_CHIPS : L1_CHIPS;

  const handleClick = (id: string) => {
    if (id === 'more') {
      setShowMore(!showMore);
      return;
    }
    setShowMore(false);
    onChipClick(id);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <button
          key={chip.id}
          onClick={() => handleClick(chip.id)}
          disabled={disabled}
          className={[
            'rounded-full px-4 py-2 text-sm font-medium transition active:scale-[0.95]',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            activeFlow === chip.id
              ? 'bg-white text-neutral-950'
              : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white',
          ].join(' ')}
        >
          {chip.label}
        </button>
      ))}
      {showMore && (
        <button
          onClick={() => setShowMore(false)}
          className="rounded-full px-4 py-2 text-sm font-medium bg-neutral-800 text-neutral-500 hover:text-white transition"
        >
          ← Back
        </button>
      )}
    </div>
  );
}
