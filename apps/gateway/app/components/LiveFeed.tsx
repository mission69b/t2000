'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { formatRelativeTime } from '@/lib/format-time';

interface Payment {
  service: string;
  endpoint: string;
  amount: string;
  digest: string | null;
  createdAt: string;
}

const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet';
const SUISCAN_TX = `https://suiscan.xyz/${NETWORK}/tx/`;
const MIN_ROWS = 4;

export function LiveFeed() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);
  const prevDigestsRef = useRef<Set<string>>(new Set());
  const [newDigests, setNewDigests] = useState<Set<string>>(new Set());

  const fetchPayments = useCallback(async () => {
    try {
      const res = await fetch('/api/mpp/payments?limit=5');
      if (res.ok) {
        const data = await res.json();
        const incoming: Payment[] = data.payments;

        const prevSet = prevDigestsRef.current;
        const freshKeys = new Set<string>();

        if (prevSet.size > 0) {
          for (const p of incoming) {
            const key = p.digest ?? p.createdAt;
            if (!prevSet.has(key)) freshKeys.add(key);
          }
        }

        prevDigestsRef.current = new Set(
          incoming.map((p) => p.digest ?? p.createdAt),
        );

        if (freshKeys.size > 0) {
          setNewDigests(freshKeys);
          setTimeout(() => setNewDigests(new Set()), 600);
        }

        setPayments(incoming);
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

  const emptyRowCount = Math.max(0, MIN_ROWS - payments.length);

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
          <span className="inline-block animate-pulse">
            Waiting for first payment...
          </span>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {payments.map((p, i) => {
            const key = p.digest ?? p.createdAt;
            const isNew = newDigests.has(key);
            return (
              <div
                key={`${key}-${i}`}
                className={`px-4 py-2.5 flex items-center gap-3 text-xs hover:bg-surface/60 transition-colors ${
                  isNew ? 'feed-row' : ''
                }`}
                style={{ animationDelay: `${i * 60}ms` }}
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
            );
          })}
          {Array.from({ length: emptyRowCount }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="px-4 py-2.5 flex items-center gap-3 text-xs"
            >
              <span className="text-dim/40 w-14 shrink-0 text-[11px]">—</span>
              <span className="text-dim/40 w-24 shrink-0">—</span>
              <span className="text-dim/40 font-mono flex-1 text-[11px]">—</span>
              <span className="text-dim/40 shrink-0">—</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
