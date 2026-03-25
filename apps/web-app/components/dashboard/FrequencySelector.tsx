'use client';

export type InvestFrequency = 'once' | 'daily' | 'weekly' | 'monthly';

interface FrequencySelectorProps {
  onSelect: (frequency: InvestFrequency) => void;
  amount: number;
  strategyName: string;
}

const OPTIONS: { value: InvestFrequency; label: string; sublabel: string }[] = [
  { value: 'once', label: 'One-time', sublabel: 'Buy now' },
  { value: 'weekly', label: 'Weekly', sublabel: 'Every Monday' },
  { value: 'monthly', label: 'Monthly', sublabel: '1st of month' },
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
            className={`flex-1 rounded-sm border p-3 text-center transition active:scale-[0.98] space-y-1 ${
              opt.value === 'once'
                ? 'border-accent/40 bg-accent-dim hover:bg-accent/20'
                : 'border-border bg-panel hover:border-accent/40 hover:bg-accent-dim'
            }`}
          >
            <p className="text-sm font-medium text-foreground">{opt.label}</p>
            <p className="text-[10px] text-muted">{opt.sublabel}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
