'use client';

import { useState, useEffect } from 'react';
import { services } from '@/lib/services';

interface StatsData {
  totalPayments: number;
  totalVolume: string;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function StatsBar() {
  const [stats, setStats] = useState<StatsData | null>(null);

  useEffect(() => {
    fetch('/api/mpp/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats)
      .catch(() => {});
  }, []);

  const items = [
    {
      label: 'payments',
      value: stats && stats.totalPayments > 0 ? formatNumber(stats.totalPayments) : '—',
    },
    {
      label: 'USDC',
      value: stats && stats.totalPayments > 0 ? `$${stats.totalVolume}` : '—',
      accent: true,
    },
    {
      label: 'services',
      value: String(services.length),
    },
    {
      label: 'settlement',
      value: '~400ms',
    },
  ];

  return (
    <div className="border border-border rounded-lg bg-surface/40 px-5 py-3 flex items-center justify-center gap-6 sm:gap-10 flex-wrap">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2 text-xs">
          <span className={item.accent ? 'text-accent font-medium' : 'text-foreground font-medium'}>
            {item.value}
          </span>
          <span className="text-dim">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
