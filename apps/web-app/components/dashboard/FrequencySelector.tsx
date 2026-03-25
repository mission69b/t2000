'use client';

interface FrequencySelectorProps {
  onSelect: (frequency: 'daily' | 'weekly' | 'monthly') => void;
  amount: number;
  strategyName: string;
}

const OPTIONS: { value: 'daily' | 'weekly' | 'monthly'; label: string; sublabel: string }[] = [
  { value: 'weekly', label: 'Weekly', sublabel: 'Every Monday' },
  { value: 'daily', label: 'Daily', sublabel: 'Every day' },
  { value: 'monthly', label: 'Monthly', sublabel: '1st of each month' },
];

export function FrequencySelector({ onSelect, amount, strategyName }: FrequencySelectorProps) {
  return (
    <div className="rounded-sm border border-border bg-surface p-4 space-y-3 feed-row">
      <p className="text-sm text-muted">
        Invest ${amount} into {strategyName}. How often?
      </p>
      <div className="flex gap-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onSelect(opt.value)}
            className="flex-1 rounded-sm border border-border bg-panel p-3 text-center transition hover:border-accent/40 hover:bg-accent-dim active:scale-[0.98] space-y-1"
          >
            <p className="text-sm font-medium text-foreground">{opt.label}</p>
            <p className="text-[10px] text-muted">{opt.sublabel}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
