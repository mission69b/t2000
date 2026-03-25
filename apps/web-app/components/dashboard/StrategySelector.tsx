'use client';

import { STRATEGIES } from '@/lib/strategies';

const ASSET_COLORS: Record<string, string> = {
  BTC: 'bg-amber-500',
  ETH: 'bg-blue-400',
  SUI: 'bg-cyan-400',
  GOLD: 'bg-yellow-400',
};

interface StrategySelectorProps {
  onSelect: (key: string, name: string) => void;
  message?: string;
}

export function StrategySelector({ onSelect, message }: StrategySelectorProps) {
  return (
    <div className="rounded-sm border border-border bg-surface p-4 space-y-3 feed-row">
      {message && <p className="text-sm text-muted whitespace-pre-line">{message}</p>}
      <div className="space-y-2">
        {STRATEGIES.map((s) => (
          <button
            key={s.key}
            onClick={() => onSelect(s.key, s.name)}
            className="w-full rounded-sm border border-border bg-panel p-3 text-left transition hover:border-accent/40 hover:bg-accent-dim active:scale-[0.99] space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">{s.name}</span>
              <span className="text-xs text-muted">{s.description}</span>
            </div>
            <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden">
              {Object.entries(s.allocations).map(([asset, pct]) => (
                <div
                  key={asset}
                  className={`${ASSET_COLORS[asset] ?? 'bg-muted'} opacity-80`}
                  style={{ width: `${pct}%` }}
                  title={`${asset} ${pct}%`}
                />
              ))}
            </div>
            <div className="flex gap-3 text-[10px] text-muted font-mono">
              {Object.entries(s.allocations).map(([asset, pct]) => (
                <span key={asset}>{asset} {pct}%</span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
