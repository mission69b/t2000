"use client";

import { useEffect, useState, useCallback } from "react";

interface Stats {
  timestamp: string;
  wallets: {
    sponsor: { address: string; balanceSui: number };
    gasStation: { address: string; balanceSui: number };
    treasury: { address: string; balanceSui: number; balanceUsdc?: number };
    rebate: { address: string; balanceSui: number; balanceUsdc?: number };
    totalSui: number;
  } | null;
  agents: {
    total: number;
    last24h: number;
    last7d: number;
    last30d: number;
    recent: { address: string; name: string | null; createdAt: string; lastSeen: string | null }[];
  };
  gas: {
    totalRecords: number;
    byType: { bootstrap: number; fallback: number; autoTopup: number };
    totalSuiSpent: number;
    bootstrapSuiSpent: number;
    last24h: { count: number; suiSpent: number };
    last7d: { count: number; suiSpent: number };
  };
  fees: {
    totalRecords: number;
    totalUsdcCollected: number;
    byOperation: Record<string, { count: number; totalUsdc: number }>;
    last24h: { count: number; usdc: number };
    last7d: { count: number; usdc: number };
  };
  x402: {
    total: number;
    settled: number;
    totalAmount: number;
    last24h: number;
    last7d: number;
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
  const gasMax = Math.max(
    stats.gas.byType.bootstrap,
    stats.gas.byType.fallback,
    stats.gas.byType.autoTopup,
    1
  );

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
          label="SUI Reserves"
          value={`${stats.wallets?.totalSui.toFixed(1) ?? "—"}`}
          sub={
            stats.wallets
              ? `Sponsor: ${stats.wallets.sponsor.balanceSui.toFixed(1)} · Gas: ${stats.wallets.gasStation.balanceSui.toFixed(1)}`
              : undefined
          }
        />
        <KpiCard
          label="Fees Collected"
          value={`$${stats.fees.totalUsdcCollected.toFixed(4)}`}
          sub={`${stats.fees.totalRecords} operations · $${stats.fees.last24h.usdc.toFixed(4)} today`}
        />
      </section>

      {/* Transaction Breakdown + Gas Breakdown */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

        <div className="bg-panel border border-border rounded-md p-5">
          <div className="text-[10px] tracking-[0.15em] uppercase text-accent mb-4">
            Gas Sponsorship
          </div>
          <div className="space-y-2 mb-5">
            <BarRow
              label="bootstrap"
              count={stats.gas.byType.bootstrap}
              max={gasMax}
            />
            <BarRow
              label="auto-topup"
              count={stats.gas.byType.autoTopup}
              max={gasMax}
              color="bg-blue"
            />
            <BarRow
              label="fallback"
              count={stats.gas.byType.fallback}
              max={gasMax}
              color="bg-warning"
            />
          </div>
          <div className="border-t border-border pt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] text-muted uppercase tracking-wider">
                Total SUI Spent
              </div>
              <div className="text-sm font-mono text-foreground">
                {stats.gas.totalSuiSpent.toFixed(4)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-muted uppercase tracking-wider">
                Bootstrap Cost
              </div>
              <div className="text-sm font-mono text-foreground">
                {stats.gas.bootstrapSuiSpent.toFixed(4)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Fee Breakdown + x402 Payments */}
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
            x402 Payments
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-2xl font-mono text-foreground">
                {stats.x402.total}
              </div>
              <div className="text-[10px] text-muted uppercase tracking-wider mt-1">
                Total
              </div>
            </div>
            <div>
              <div className="text-2xl font-mono text-foreground">
                {stats.x402.settled}
              </div>
              <div className="text-[10px] text-muted uppercase tracking-wider mt-1">
                Settled
              </div>
            </div>
            <div>
              <div className="text-2xl font-mono text-foreground">
                ${stats.x402.totalAmount.toFixed(2)}
              </div>
              <div className="text-[10px] text-muted uppercase tracking-wider mt-1">
                Volume
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Recent Agents */}
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
                <th className="pb-2 font-normal">Name</th>
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
                  <td className="py-2.5 text-muted">
                    {agent.name ?? "—"}
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

      {/* Wallet Addresses */}
      {stats.wallets && (
        <section className="bg-panel border border-border rounded-md p-5">
          <div className="text-[10px] tracking-[0.15em] uppercase text-accent mb-4">
            Infrastructure Wallets
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-muted">
                  Sponsor
                </span>
                <a
                  href={`https://suiscan.xyz/mainnet/account/${stats.wallets.sponsor.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-mono text-foreground hover:text-accent transition-colors"
                >
                  {truncateAddress(stats.wallets.sponsor.address)}
                </a>
              </div>
              <span className="text-[11px] font-mono text-foreground">
                {stats.wallets.sponsor.balanceSui.toFixed(2)} SUI
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-muted">
                  Gas Station
                </span>
                <a
                  href={`https://suiscan.xyz/mainnet/account/${stats.wallets.gasStation.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-mono text-foreground hover:text-accent transition-colors"
                >
                  {truncateAddress(stats.wallets.gasStation.address)}
                </a>
              </div>
              <span className="text-[11px] font-mono text-foreground">
                {stats.wallets.gasStation.balanceSui.toFixed(2)} SUI
              </span>
            </div>
            {stats.wallets.treasury && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-mono text-muted">
                    Treasury
                  </span>
                  <a
                    href={`https://suiscan.xyz/mainnet/object/${stats.wallets.treasury.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-mono text-foreground hover:text-accent transition-colors"
                  >
                    {truncateAddress(stats.wallets.treasury.address)}
                  </a>
                </div>
                <span className="text-[11px] font-mono text-foreground">
                  ${(stats.wallets.treasury.balanceUsdc ?? 0).toFixed(4)} USDC
                </span>
              </div>
            )}
            {stats.wallets.rebate && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-mono text-muted">
                    Rebate
                  </span>
                  <a
                    href={`https://suiscan.xyz/mainnet/account/${stats.wallets.rebate.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-mono text-foreground hover:text-accent transition-colors"
                  >
                    {truncateAddress(stats.wallets.rebate.address)}
                  </a>
                </div>
                <span className="text-[11px] font-mono text-foreground">
                  {(stats.wallets.rebate.balanceUsdc ?? 0) > 0
                    ? `$${stats.wallets.rebate.balanceUsdc!.toFixed(4)} USDC`
                    : `${stats.wallets.rebate.balanceSui.toFixed(2)} SUI`}
                </span>
              </div>
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
