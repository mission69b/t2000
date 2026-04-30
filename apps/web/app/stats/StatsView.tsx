"use client";

import { useEffect, useState, useCallback } from "react";

interface Stats {
  timestamp: string;
  wallets: {
    treasury: { address?: string; balanceSui: number; balanceUsdc?: number };
  } | null;
  agents: {
    total: number;
    last24h: number;
    last7d: number;
    last30d: number;
    recent?: { address: string; createdAt: string; lastSeen: string | null }[];
  };
  fees: {
    totalRecords: number;
    totalUsdcCollected: number;
    byOperation: Record<string, { count: number; totalUsdc: number }>;
    byAsset: Record<string, { count: number; rawAmount: string }>;
    last24h: { count: number; usdc: number };
    last7d: { count: number; usdc: number };
  };
  mpp: {
    total: number;
    settled: number;
    totalAmount: number;
    last24h: number;
    last7d: number;
    gatewayAddress?: string;
    gatewayBalance?: number;
  };
  transactions: {
    total: number;
    last24h: number;
    last7d: number;
    byAction: Record<string, number>;
    uniqueAgents: number;
  };
}

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-panel border border-border rounded-md p-5">
      <div className="text-[10px] tracking-[0.15em] uppercase text-muted mb-2">
        {label}
      </div>
      <div
        className={`text-2xl font-mono font-medium ${accent ? "text-accent" : "text-foreground"}`}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[11px] text-muted mt-1 font-mono">{sub}</div>
      )}
    </div>
  );
}

function BarRow({
  label,
  count,
  max,
  color = "bg-accent",
}: {
  label: string;
  count: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-20 text-[11px] text-muted font-mono text-right shrink-0">
        {label}
      </div>
      <div className="flex-1 h-5 bg-surface rounded overflow-hidden">
        <div
          className={`h-full ${color} rounded transition-all duration-500`}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      <div className="w-10 text-[11px] text-foreground font-mono text-right shrink-0">
        {count}
      </div>
    </div>
  );
}

function WalletRow({
  label,
  address,
  balance,
  linkType = "account",
}: {
  label: string;
  address?: string;
  balance: string;
  linkType?: "account" | "object";
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="text-[11px] font-mono text-muted">{label}</span>
        {address ? (
          <a
            href={`https://suiscan.xyz/mainnet/${linkType}/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-mono text-foreground hover:text-accent transition-colors"
          >
            {truncateAddress(address)}
          </a>
        ) : (
          <span className="text-[11px] font-mono text-dim">—</span>
        )}
      </div>
      <span className="text-[11px] font-mono text-foreground">{balance}</span>
    </div>
  );
}

export function StatsView() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/stats");
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setStats(data);
      setError(null);
      setLastFetch(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 60_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  if (error && !stats) {
    return (
      <div className="text-center py-20">
        <div className="text-danger text-sm font-mono">
          Failed to load stats: {error}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-20">
        <div className="text-muted text-sm font-mono animate-pulse">
          Loading stats...
        </div>
      </div>
    );
  }

  const txMax = Math.max(...Object.values(stats.transactions.byAction), 1);

  return (
    <div className="space-y-10">
      {/* KPI Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Agents"
          value={stats.agents.total.toString()}
          sub={`+${stats.agents.last24h} today · +${stats.agents.last7d} this week`}
          accent
        />
        <KpiCard
          label="Transactions"
          value={stats.transactions.total.toString()}
          sub={`${stats.transactions.last24h} today · ${stats.transactions.uniqueAgents} active agents`}
        />
        <KpiCard
          label="Treasury"
          value={`$${(stats.wallets?.treasury?.balanceUsdc ?? 0).toFixed(2)}`}
          sub={`On-chain USDC across ${stats.fees.totalRecords} operations`}
        />
        <KpiCard
          label="Fees Collected"
          value={`$${stats.fees.totalUsdcCollected.toFixed(4)}`}
          sub={`${stats.fees.totalRecords} operations · $${stats.fees.last24h.usdc.toFixed(4)} today`}
        />
      </section>

      {/* Transaction Breakdown */}
      <section>
        <div className="bg-panel border border-border rounded-md p-5">
          <div className="text-[10px] tracking-[0.15em] uppercase text-accent mb-4">
            Transactions by Action
          </div>
          <div className="space-y-2">
            {Object.entries(stats.transactions.byAction)
              .sort(([, a], [, b]) => b - a)
              .map(([action, count]) => (
                <BarRow
                  key={action}
                  label={action}
                  count={count}
                  max={txMax}
                />
              ))}
          </div>
        </div>
      </section>

      {/* Fee Breakdown + MPP Payments */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-panel border border-border rounded-md p-5">
          <div className="text-[10px] tracking-[0.15em] uppercase text-accent mb-4">
            Protocol Fees by Operation
          </div>
          {Object.keys(stats.fees.byOperation).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(stats.fees.byOperation)
                .sort(([, a], [, b]) => b.totalUsdc - a.totalUsdc)
                .map(([op, data]) => (
                  <div
                    key={op}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-mono text-muted w-16">
                        {op}
                      </span>
                      <span className="text-[11px] font-mono text-dim">
                        {data.count} ops
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-foreground">
                      ${data.totalUsdc.toFixed(6)}
                    </span>
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-[11px] text-muted font-mono">
              No fees recorded yet
            </div>
          )}
        </div>

        <div className="bg-panel border border-border rounded-md p-5">
          <div className="text-[10px] tracking-[0.15em] uppercase text-accent mb-4">
            MPP Payments
          </div>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <div className="text-2xl font-mono text-foreground">
                {stats.mpp.total}
              </div>
              <div className="text-[10px] text-muted uppercase tracking-wider mt-1">
                Total
              </div>
            </div>
            <div>
              <div className="text-2xl font-mono text-foreground">
                {stats.mpp.settled}
              </div>
              <div className="text-[10px] text-muted uppercase tracking-wider mt-1">
                Settled
              </div>
            </div>
            <div>
              <div className="text-2xl font-mono text-foreground">
                ${stats.mpp.totalAmount.toFixed(2)}
              </div>
              <div className="text-[10px] text-muted uppercase tracking-wider mt-1">
                Volume (USDC)
              </div>
            </div>
          </div>
          <div className="border-t border-border pt-3 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-muted">24h</span>
              <span className="text-foreground">{stats.mpp.last24h} payments</span>
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-muted">7d</span>
              <span className="text-foreground">{stats.mpp.last7d} payments</span>
            </div>
            {stats.mpp.gatewayAddress && (
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-muted">Treasury</span>
                <a
                  href={`https://suiscan.xyz/mainnet/account/${stats.mpp.gatewayAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground hover:text-accent transition-colors"
                >
                  {truncateAddress(stats.mpp.gatewayAddress)}
                </a>
              </div>
            )}
            {stats.mpp.gatewayBalance !== undefined && (
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-muted">Balance</span>
                <span className="text-foreground">${stats.mpp.gatewayBalance.toFixed(4)} USDC</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Recent Agents */}
      {stats.agents.recent && stats.agents.recent.length > 0 && (
        <section className="bg-panel border border-border rounded-md p-5">
          <div className="text-[10px] tracking-[0.15em] uppercase text-accent mb-4">
            Recent Agents
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="text-muted text-left">
                  <th className="pb-2 font-normal">#</th>
                  <th className="pb-2 font-normal">Address</th>
                  <th className="pb-2 font-normal text-right">Registered</th>
                </tr>
              </thead>
              <tbody>
                {stats.agents.recent.map((agent, i) => (
                  <tr
                    key={agent.address}
                    className="border-t border-border hover:bg-white/[0.02]"
                  >
                    <td className="py-2.5 text-dim">{i + 1}</td>
                    <td className="py-2.5">
                      <a
                        href={`https://suiscan.xyz/mainnet/account/${agent.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-foreground hover:text-accent transition-colors"
                      >
                        {truncateAddress(agent.address)}
                      </a>
                    </td>
                    <td className="py-2.5 text-muted text-right">
                      {timeAgo(agent.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Wallet Addresses */}
      {stats.wallets && (
        <section className="bg-panel border border-border rounded-md p-5">
          <div className="text-[10px] tracking-[0.15em] uppercase text-accent mb-4">
            Infrastructure Wallets
          </div>
          <div className="space-y-3">
            <WalletRow
              label="Treasury"
              address={stats.wallets.treasury?.address}
              linkType="account"
              balance={`$${(stats.wallets.treasury?.balanceUsdc ?? 0).toFixed(4)} USDC`}
            />
            {stats.mpp.gatewayAddress && (
              <WalletRow
                label="MPP Gateway"
                address={stats.mpp.gatewayAddress}
                balance={`$${(stats.mpp.gatewayBalance ?? 0).toFixed(4)} USDC`}
              />
            )}
          </div>
        </section>
      )}

      {/* Last updated */}
      <div className="text-center text-[10px] text-dim font-mono">
        Last updated:{" "}
        {lastFetch
          ? lastFetch.toLocaleTimeString()
          : "—"}{" "}
        · Refreshes every 60s
      </div>
    </div>
  );
}
