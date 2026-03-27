'use client';

interface Asset {
  id: string;
  label: string;
  icon: string;
  description: string;
}

const TRADE_ASSETS: Asset[] = [
  { id: 'USDC', label: 'USDC', icon: '💵', description: 'USD Coin' },
  { id: 'SUI', label: 'SUI', icon: '💧', description: 'Sui Network' },
  { id: 'BTC', label: 'BTC', icon: '₿', description: 'Bitcoin (wBTC)' },
  { id: 'ETH', label: 'ETH', icon: 'Ξ', description: 'Ethereum (wETH)' },
  { id: 'GOLD', label: 'GOLD', icon: '🥇', description: 'Gold (XAUM)' },
];

interface AssetSelectorProps {
  flow: 'swap';
  selectedFrom?: string | null;
  message?: string;
  onSelect: (asset: string) => void;
}

export function AssetSelector({ flow, selectedFrom, message, onSelect }: AssetSelectorProps) {
  const assets = TRADE_ASSETS.filter((a) => a.id !== selectedFrom);

  return (
    <div className="rounded-sm border border-border bg-surface p-4 space-y-3 feed-row">
      {message && (
        <p className="text-sm text-muted whitespace-pre-line">{message}</p>
      )}
      <div className={`grid gap-2 ${assets.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {assets.map((asset) => (
          <button
            key={asset.id}
            onClick={() => onSelect(asset.id)}
            className="flex flex-col items-center gap-1.5 rounded-sm border border-border bg-panel p-3 transition hover:border-accent/50 hover:bg-accent-dim active:scale-[0.97]"
          >
            <span className="text-xl">{asset.icon}</span>
            <span className="text-sm font-semibold text-foreground">{asset.label}</span>
            <span className="text-[10px] text-muted leading-tight">{asset.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
