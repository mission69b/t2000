'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from '../components/Header';
import { formatRelativeTime } from '@/lib/format-time';

interface Payment {
  id: number;
  service: string;
  endpoint: string;
  amount: string;
  digest: string | null;
  sender: string | null;
  createdAt: string;
}

interface Stats {
  totalPayments: number;
  totalVolume: string;
  services: { service: string; count: number; volume: string }[];
}

interface VolumeDay {
  date: string;
  label: string;
  count: number;
  volume: number;
}

const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet';
const SUISCAN_TX = `https://suiscan.xyz/${NETWORK}/tx/`;
const PER_PAGE = 20;

function truncate(s: string, len = 12): string {
  if (s.length <= len) return s;
  return s.slice(0, 6) + '...' + s.slice(-4);
}

export default function ExplorerPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [volume, setVolume] = useState<VolumeDay[]>([]);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: String(PER_PAGE),
      offset: String(page * PER_PAGE),
    });
    if (serviceFilter) params.set('service', serviceFilter);
    if (search) params.set('search', search);

    try {
      const res = await fetch(`/api/mpp/payments?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPayments(data.payments);
        setTotal(data.total);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [page, serviceFilter, search]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  useEffect(() => {
    fetch('/api/mpp/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (s) setStats(s); })
      .catch(() => {});
    fetch('/api/mpp/volume')
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => { if (v?.days) setVolume(v.days); })
      .catch(() => {});
  }, []);

  const totalPages = Math.ceil(total / PER_PAGE);
  const maxVolume = useMemo(
    () => Math.max(...volume.map((d) => d.count), 1),
    [volume],
  );

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(0);
    setExpandedId(null);
  };

  const handleServiceFilter = (value: string) => {
    setServiceFilter(value);
    setPage(0);
    setExpandedId(null);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-6 py-10">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-xl font-medium text-foreground mb-1">
              Payment Explorer
            </h1>
            {stats && (
              <p className="text-sm text-muted">
                {stats.totalPayments.toLocaleString()} payments · {stats.totalVolume} USDC total
              </p>
            )}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {/* Volume chart */}
            <div className="border border-border rounded-lg bg-surface/40 p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted mb-3">
                Volume (30d)
              </div>
              {volume.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <div className="flex items-end gap-px h-28">
                    {volume.map((d) => {
                      const pct = d.count > 0 ? Math.max((d.count / maxVolume) * 100, 6) : 0;
                      return (
                        <div
                          key={d.date}
                          className={`flex-1 rounded-sm transition-all ${d.count > 0 ? 'bg-accent/70 hover:bg-accent' : 'bg-border/10'}`}
                          style={{ height: d.count > 0 ? `${pct}%` : '2px' }}
                          title={`${d.label} ${d.date}\n${d.count} payments · ${d.volume} USDC`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[9px] text-dim px-px">
                    <span>{volume[0]?.label}</span>
                    <span>{volume[Math.floor(volume.length / 2)]?.label}</span>
                    <span>{volume[volume.length - 1]?.label}</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-28 text-xs text-dim">
                  Loading...
                </div>
              )}
            </div>

            {/* Service breakdown */}
            <div className="border border-border rounded-lg bg-surface/40 p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted mb-3">
                By Service
              </div>
              {stats && stats.services.length > 0 ? (
                <div className="space-y-2">
                  {stats.services.slice(0, 5).map((s) => {
                    const pct =
                      stats.totalPayments > 0
                        ? (s.count / stats.totalPayments) * 100
                        : 0;
                    return (
                      <div key={s.service} className="flex items-center gap-2 text-xs">
                        <span className="text-foreground w-20 truncate capitalize">
                          {s.service}
                        </span>
                        <div className="flex-1 h-1.5 bg-panel rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent/70 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-muted text-[11px] w-10 text-right">
                          {Math.round(pct)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-dim">No data yet</div>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search by digest or address..."
                className="w-full bg-surface/60 border border-border rounded-lg text-xs text-foreground placeholder:text-dim px-3 py-2.5 pl-9 outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all"
              />
              {search && (
                <button
                  onClick={() => handleSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            <select
              value={serviceFilter}
              onChange={(e) => handleServiceFilter(e.target.value)}
              className="bg-surface/60 border border-border rounded-lg text-xs text-foreground px-3 py-2.5 outline-none focus:border-accent/50 cursor-pointer appearance-none"
            >
              <option value="">All services</option>
              {stats?.services.map((s) => (
                <option key={s.service} value={s.service}>
                  {s.service} ({s.count})
                </option>
              ))}
            </select>
          </div>

          {/* Results count */}
          {(search || serviceFilter) && (
            <div className="text-[11px] text-muted mb-3">
              {total} result{total !== 1 ? 's' : ''}
              {serviceFilter && (
                <span>
                  {' '}in <span className="text-foreground capitalize">{serviceFilter}</span>
                </span>
              )}
              {search && (
                <span>
                  {' '}matching &ldquo;<span className="text-foreground">{search}</span>&rdquo;
                </span>
              )}
            </div>
          )}

          {/* Payment table */}
          <div className="border border-border rounded-lg overflow-hidden bg-surface/40">
            {/* Header */}
            <div className="hidden sm:grid grid-cols-[100px_1fr_1fr_80px_40px] gap-3 px-4 py-2.5 border-b border-border text-[10px] uppercase tracking-wider text-muted">
              <span>Time</span>
              <span>Service</span>
              <span>Endpoint</span>
              <span className="text-right">Amount</span>
              <span />
            </div>

            {loading ? (
              <div className="px-4 py-12 text-center text-xs text-dim animate-pulse">
                Loading...
              </div>
            ) : payments.length === 0 ? (
              <div className="px-4 py-12 text-center text-xs text-dim">
                No payments found.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {payments.map((p) => (
                  <div key={p.id}>
                    <button
                      onClick={() =>
                        setExpandedId(expandedId === p.id ? null : p.id)
                      }
                      className="w-full grid grid-cols-1 sm:grid-cols-[100px_1fr_1fr_80px_40px] gap-1 sm:gap-3 px-4 py-3 text-left hover:bg-surface/60 transition-colors cursor-pointer text-xs"
                    >
                      <span className="text-dim text-[11px]">
                        {formatRelativeTime(p.createdAt)}
                      </span>
                      <span className="text-foreground font-medium capitalize truncate">
                        {p.service}
                      </span>
                      <span className="text-muted font-mono text-[11px] truncate">
                        {p.endpoint}
                      </span>
                      <span className="text-accent font-medium text-right">
                        {p.amount} USDC
                      </span>
                      <span className="text-right">
                        {p.digest && (
                          <a
                            href={`${SUISCAN_TX}${p.digest}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-dim hover:text-accent transition-colors"
                            title="View on Suiscan"
                            onClick={(e) => e.stopPropagation()}
                          >
                            ↗
                          </a>
                        )}
                      </span>
                    </button>

                    {expandedId === p.id && (
                      <div className="px-4 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] border-t border-border/50 pt-3 mx-4 mb-1">
                        <div>
                          <span className="text-muted">Service:</span>{' '}
                          <span className="text-foreground capitalize">{p.service}</span>
                        </div>
                        <div>
                          <span className="text-muted">Endpoint:</span>{' '}
                          <span className="text-foreground font-mono">{p.endpoint}</span>
                        </div>
                        <div>
                          <span className="text-muted">Amount:</span>{' '}
                          <span className="text-accent">{p.amount} USDC</span>
                        </div>
                        <div>
                          <span className="text-muted">Time:</span>{' '}
                          <span className="text-foreground">
                            {new Date(p.createdAt).toLocaleString()}
                          </span>
                        </div>
                        {p.digest && (
                          <div className="sm:col-span-2">
                            <span className="text-muted">Digest:</span>{' '}
                            <a
                              href={`${SUISCAN_TX}${p.digest}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-accent hover:underline font-mono"
                            >
                              {truncate(p.digest, 24)}
                            </a>
                          </div>
                        )}
                        {p.sender && (
                          <div className="sm:col-span-2">
                            <span className="text-muted">Sender:</span>{' '}
                            <span className="text-foreground font-mono">
                              {truncate(p.sender, 24)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4 text-xs">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-2.5 py-1.5 rounded border border-border text-muted hover:text-foreground hover:border-border-bright disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                ←
              </button>
              <span className="text-muted px-2">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-2.5 py-1.5 rounded border border-border text-muted hover:text-foreground hover:border-border-bright disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                →
              </button>
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between text-xs text-muted">
          <span>t2000</span>
          <span>
            Powered by{' '}
            <a href="https://mpp.dev" className="text-accent hover:underline">
              MPP
            </a>{' '}
            +{' '}
            <a href="https://sui.io" className="text-accent hover:underline">
              Sui
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
