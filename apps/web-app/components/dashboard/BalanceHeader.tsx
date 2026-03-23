'use client';

import { truncateAddress } from '@/lib/format';

export interface BalanceData {
  total: number;
  checking: number;
  savings: number;
  loading: boolean;
}

interface BalanceHeaderProps {
  address: string;
  balance: BalanceData;
  onSettingsClick: () => void;
}

export function BalanceHeader({ address, balance, onSettingsClick }: BalanceHeaderProps) {
  return (
    <div className="space-y-1 text-center">
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-semibold text-muted tracking-wide">t2000</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-dim">
            {truncateAddress(address)}
          </span>
          <button
            onClick={onSettingsClick}
            className="rounded-lg p-1.5 text-muted hover:text-foreground hover:bg-panel transition"
            aria-label="Settings"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {balance.loading ? (
        <div className="py-4 space-y-2">
          <div className="h-10 w-32 mx-auto rounded-lg bg-panel animate-pulse" />
          <div className="h-4 w-48 mx-auto rounded bg-panel animate-pulse" />
        </div>
      ) : (
        <>
          <p className="text-4xl font-bold tracking-tight font-mono text-foreground">
            ${balance.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-sm text-muted">
            Checking ${balance.checking.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            {' · '}
            Savings ${balance.savings.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
          </p>
        </>
      )}
    </div>
  );
}
