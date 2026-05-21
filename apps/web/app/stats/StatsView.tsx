"use client";

// [v0.7d Phase 6 Block C.1 — 2026-05-21 / S.223] Refactored to match the
// post-indexer-retirement `/api/stats` shape. Live Sui RPC reads for the
// treasury + MPP gateway wallets; static marketing tiles for network-scale
// totals. Pre-refactor history at git ref pre-S.223 (commit `<TBD>`).
//
// Removed sections (no longer have a data source):
//   - "Agents" KPI tile (Agent.count dropped with indexer)
//   - "Fees Collected" KPI tile (ProtocolFeeLedger dropped with indexer)
//   - "Transactions by Action" bar chart (Transaction.groupBy dropped)
//   - "Protocol Fees by Operation" breakdown (ProtocolFeeLedger dropped)
//   - "Recent Agents" table (Agent.lastSeen dropped)
//
// What stayed:
//   - "Infrastructure Wallets" — live Sui RPC against treasury + gateway
//   - "Network Scale" — static marketing tiles from /api/stats `static` block
import { useCallback, useEffect, useState } from "react";

interface Stats {
  timestamp: string;
  wallets: {
    treasury: { address: string; balanceSui: number; balanceUsdc: number };
    mppGateway: { address: string; balanceUsdc: number };
  } | null;
  static: {
    agentsRegistered: number;
    agentsActiveLast30d: number;
    totalFeesUsdcCollected: number;
    totalTransactionsProcessed: number;
    lastRefreshed: string;
  };
}

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
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

function WalletRow({
  label,
  address,
  balance,
}: {
  label: string;
  address?: string;
  balance: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="text-[11px] font-mono text-muted">{label}</span>
        {address ? (
          <a
            href={`https://suiscan.xyz/mainnet/account/${address}`}
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

  const treasuryUsdc = stats.wallets?.treasury?.balanceUsdc ?? 0;
  const gatewayUsdc = stats.wallets?.mppGateway?.balanceUsdc ?? 0;

  return (
    <div className="space-y-10">
      {/* Network Scale (static marketing tiles) */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Agents"
          value={`${stats.static.agentsRegistered.toLocaleString()}+`}
          sub={`${stats.static.agentsActiveLast30d}+ active last 30d`}
          accent
        />
        <KpiCard
          label="Transactions"
          value={`${stats.static.totalTransactionsProcessed.toLocaleString()}+`}
          sub="On Sui mainnet"
        />
        <KpiCard
          label="Treasury"
          value={`$${treasuryUsdc.toFixed(2)}`}
          sub="Live USDC balance"
        />
        <KpiCard
          label="Fees Collected"
          value={`$${stats.static.totalFeesUsdcCollected.toFixed(2)}+`}
          sub="Total protocol fees"
        />
      </section>

      {/* Infrastructure Wallets (live Sui RPC) */}
      {stats.wallets && (
        <section className="bg-panel border border-border rounded-md p-5">
          <div className="text-[10px] tracking-[0.15em] uppercase text-accent mb-4">
            Infrastructure Wallets
          </div>
          <div className="space-y-3">
            <WalletRow
              label="Treasury"
              address={stats.wallets.treasury?.address}
              balance={`$${treasuryUsdc.toFixed(4)} USDC`}
            />
            <WalletRow
              label="MPP Gateway"
              address={stats.wallets.mppGateway?.address}
              balance={`$${gatewayUsdc.toFixed(4)} USDC`}
            />
          </div>
        </section>
      )}

      {/* Footer */}
      <div className="text-center text-[10px] text-dim font-mono space-y-1">
        <div>
          Last updated:{" "}
          {lastFetch ? lastFetch.toLocaleTimeString() : "—"} · Wallet balances
          refresh every 60s
        </div>
        <div>
          Network-scale totals last refreshed: {stats.static.lastRefreshed}
        </div>
      </div>
    </div>
  );
}
