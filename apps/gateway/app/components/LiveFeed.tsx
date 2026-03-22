'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatRelativeTime } from '@/lib/format-time';

interface Payment {
  service: string;
  endpoint: string;
  amount: string;
  digest: string | null;
  createdAt: string;
}

const SUISCAN_TX = 'https://suiscan.xyz/testnet/tx/';

export function LiveFeed() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);

  const fetchPayments = useCallback(async () => {
    try {
      const res = await fetch('/api/mpp/payments?limit=5');
      if (res.ok) {
        const data = await res.json();
        setPayments(data.payments);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPayments();
    const poll = setInterval(fetchPayments, 30_000);
    return () => clearInterval(poll);
  }, [fetchPayments]);

  useEffect(() => {
    const tick = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(tick);
  }, []);

  return (
    <div className="border border-border rounded-lg bg-surface/40 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
        <span className="text-xs text-muted font-medium">Live</span>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
        </span>
      </div>

      {loading ? (
        <div className="px-4 py-8 text-center text-xs text-dim animate-pulse">
          Loading...
        </div>
      ) : payments.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-dim">
          <span className="inline-block animate-pulse">Waiting for first payment...</span>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {payments.map((p, i) => (
            <div
              key={`${p.digest ?? i}-${p.createdAt}`}
              className="px-4 py-2.5 flex items-center gap-3 text-xs hover:bg-surface/60 transition-colors"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <span className="text-dim w-14 shrink-0 text-[11px]">
                {formatRelativeTime(p.createdAt)}
              </span>
              <span className="text-foreground font-medium w-24 shrink-0 truncate capitalize">
                {p.service}
              </span>
              <span className="text-muted font-mono truncate flex-1 text-[11px]">
                {p.endpoint}
              </span>
              <span className="text-accent font-medium shrink-0">
                {p.amount} USDC
              </span>
              {p.digest && (
                <a
                  href={`${SUISCAN_TX}${p.digest}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-dim hover:text-accent transition-colors shrink-0"
                  title="View on Suiscan"
                >
                  ↗
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
