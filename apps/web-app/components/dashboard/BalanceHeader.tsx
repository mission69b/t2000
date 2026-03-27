'use client';

import { useState, useCallback, useEffect } from 'react';
import { truncateAddress } from '@/lib/format';

export interface BalanceHeaderData {
  total: number;
  cash: number;
  investments: number;
  savings: number;
  borrows: number;
  savingsRate: number;
  healthFactor: number | null;
  sui: number;
  suiUsd: number;
  usdc: number;
  assetBalances: Record<string, number>;
  assetUsdValues: Record<string, number>;
  bestSaveRate: { protocol: string; rate: number } | null;
  loading: boolean;
}

interface BalanceHeaderProps {
  address: string;
  balance: BalanceHeaderData;
  compact?: boolean;
  onSettingsClick: () => void;
}

function fmtUsd(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtToken(n: number): string {
  if (n > 0 && n < 0.01) return n.toFixed(8);
  if (n < 1) return n.toFixed(6);
  return n.toFixed(4);
}

export function BalanceHeader({ address, balance, compact, onSettingsClick }: BalanceHeaderProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (compact) setExpanded(false);
  }, [compact]);

  const copyAddress = useCallback(() => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [address]);

  const holdings: { symbol: string; amount: string; usd: string }[] = [];
  if (balance.sui > 0) {
    holdings.push({ symbol: 'SUI', amount: fmtToken(balance.sui), usd: `$${fmtUsd(balance.suiUsd)}` });
  }
  if (balance.usdc > 0) {
    holdings.push({ symbol: 'USDC', amount: fmtUsd(balance.usdc), usd: `$${fmtUsd(balance.usdc)}` });
  }
  for (const [symbol, amt] of Object.entries(balance.assetBalances)) {
    if (amt > 0) {
      const usdVal = balance.assetUsdValues[symbol] ?? 0;
      holdings.push({
        symbol,
        amount: fmtToken(amt),
        usd: `$${fmtUsd(usdVal)}`,
      });
    }
  }

  return (
    <div className="space-y-1 text-center">
      <div className="flex items-center justify-between px-1">
        <button
          onClick={() => window.location.reload()}
          className="font-mono font-semibold text-sm text-accent tracking-tight flex items-center gap-2 hover:opacity-80 transition cursor-pointer"
          aria-label="Refresh page"
        >
          <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse shadow-[0_0_8px_var(--accent)]" />
          t2000
          <span className="text-[9px] uppercase tracking-widest font-medium text-muted border border-border rounded px-1.5 py-0.5 leading-none">
            beta
          </span>
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={copyAddress}
            className="text-xs font-mono text-muted hover:text-foreground transition cursor-pointer"
            title="Copy address"
          >
            {copied ? (
              <span className="text-accent">copied ✓</span>
            ) : (
              truncateAddress(address)
            )}
          </button>
          <button
            onClick={onSettingsClick}
            className="rounded-sm p-1.5 text-muted hover:text-foreground hover:bg-panel transition"
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
          <div className="h-10 w-32 mx-auto rounded-sm bg-panel animate-pulse" />
          <div className="h-4 w-48 mx-auto rounded-sm bg-panel animate-pulse" />
        </div>
      ) : (
        <button
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-label={`Balance $${fmtUsd(balance.total)}, ${expanded ? 'collapse' : 'expand'} details`}
          className="w-full text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm group"
        >
          <p className="text-4xl font-bold tracking-tight font-mono text-foreground">
            ${fmtUsd(balance.total)}
          </p>
          <p className="text-xs font-mono text-muted tracking-wide">
            <span className="uppercase text-[10px] tracking-[0.1em]">cash</span> ${Math.floor(balance.cash)}
            {balance.investments > 0 && (
              <>
                {' · '}
                <span className="uppercase text-[10px] tracking-[0.1em]">inv</span> ${Math.floor(balance.investments)}
              </>
            )}
            {' · '}
            <span className="uppercase text-[10px] tracking-[0.1em]">sav</span> ${Math.floor(balance.savings)}
            {balance.borrows > 0 && (
              <>
                {' · '}
                <span className="text-amber-400">
                  <span className="uppercase text-[10px] tracking-[0.1em]">debt</span> ${Math.floor(balance.borrows)}
                </span>
              </>
            )}
            {' '}
            <span className={`inline-block transition-transform duration-200 text-dim ${expanded ? 'rotate-180' : ''}`}>
              ▾
            </span>
          </p>
        </button>
      )}

      {expanded && !balance.loading && (
        <div className="mt-2 rounded-sm border border-border bg-surface/60 text-left text-xs font-mono divide-y divide-border/50 overflow-hidden transition-all">
          {/* Account breakdown */}
          <div className="px-4 py-3 space-y-1.5">
            <Row label="Cash" value={`$${fmtUsd(balance.cash)}`} />
            {balance.investments > 0 && (
              <Row label="Investments" value={`$${fmtUsd(balance.investments)}`} />
            )}
            <Row label="Savings" value={`$${fmtUsd(balance.savings)}`} />
            {balance.savingsRate > 0 && (
              <Row label="Savings APY" value={`${balance.savingsRate.toFixed(1)}%`} accent />
            )}
            {balance.borrows > 0 && (
              <>
                <Row label="Debt" value={`$${fmtUsd(balance.borrows)}`} warn />
                {balance.healthFactor && balance.healthFactor !== Infinity && (
                  <Row
                    label="Health Factor"
                    value={balance.healthFactor.toFixed(1)}
                    warn={balance.healthFactor < 1.5}
                  />
                )}
              </>
            )}
          </div>

          {/* Holdings detail */}
          {holdings.length > 0 && (
            <div className="px-4 py-3 space-y-1.5">
              <p className="text-[10px] uppercase tracking-[0.1em] text-muted mb-1">Assets</p>
              {holdings.map((h) => (
                <Row key={h.symbol} label={h.symbol} value={h.amount} sublabel={h.usd} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, sublabel, accent, warn }: { label: string; value: string; sublabel?: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted">{label}</span>
      <span className={accent ? 'text-accent' : warn ? 'text-amber-400' : 'text-foreground'}>
        {value}
        {sublabel && <span className="text-muted ml-1.5">{sublabel}</span>}
      </span>
    </div>
  );
}
