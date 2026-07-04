"use client";
import { useEffect, useRef, useState } from "react";
import { formatUsd } from "@/lib/format";

type Payment = {
  id: number;
  service: string;
  endpoint: string;
  amount: string;
  digest: string | null;
  sender: string | null;
  createdAt: string;
};

const POLL_MS = 4_000;
const MAX_ROWS = 30;

function relativeTs(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function abbreviateEndpoint(endpoint: string): string {
  // Agent-commerce rows carry the seller ADDRESS as the endpoint.
  if (/^0x[a-f0-9]{40,}$/i.test(endpoint)) {
    return `${endpoint.slice(0, 6)}…${endpoint.slice(-4)}`;
  }
  return endpoint.replace(/^\/+/, "").slice(0, 32);
}

function serviceLabel(service: string): string {
  return service === "commerce" ? "agent store" : service;
}

export function MppActivityPage() {
  const [rows, setRows] = useState<Payment[]>([]);
  const [stats, setStats] = useState<{
    totalCalls: number;
    totalVolume: number;
    uniqueWallets: number;
  }>({
    totalCalls: 0,
    totalVolume: 0,
    uniqueWallets: 0,
  });
  const [loaded, setLoaded] = useState(false);
  const seenIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const [pRes, sRes] = await Promise.all([
          fetch(`/api/mpp/payments?limit=${MAX_ROWS}`, { cache: "no-store" }),
          fetch("/api/mpp/stats", { cache: "no-store" }),
        ]);
        if (!pRes.ok || !sRes.ok) return;
        const pData: { payments: Payment[] } = await pRes.json();
        const sData: {
          totalPayments: number;
          totalVolume: string;
          uniqueWallets?: number;
        } = await sRes.json();
        if (cancelled) return;
        for (const row of pData.payments) seenIdsRef.current.add(row.id);
        setRows(pData.payments);
        setStats({
          totalCalls: sData.totalPayments,
          totalVolume: parseFloat(sData.totalVolume) || 0,
          uniqueWallets: sData.uniqueWallets ?? 0,
        });
        setLoaded(true);
      } catch {
        // Silent — keep last good state.
      }
    };

    void tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <section style={{ padding: "60px 0 96px" }}>
      <div className="t2k-container">
        <header style={{ marginBottom: 36 }}>
          <div className="mb-3 flex items-center gap-3">
            <span className="mpp-live-pill">
              <span className="dot" />
              Live
            </span>
            <span className="t2k-eyebrow" style={{ fontSize: 10.5 }}>
              // LIFETIME
            </span>
          </div>
          <h1 className="t2k-section-title m-0" style={{ lineHeight: 1.0 }}>
            Live activity.
            <br />
            <span style={{ color: "var(--t2k-accent)" }}>On Sui.</span>
          </h1>
        </header>

        <div className="mb-8 grid gap-3 md:grid-cols-4">
          <CounterCard
            label="Calls settled"
            value={loaded ? stats.totalCalls.toLocaleString() : null}
            loading={!loaded}
          />
          <CounterCard
            label="USDC settled"
            value={loaded ? `$${stats.totalVolume.toFixed(2)}` : null}
            loading={!loaded}
          />
          <CounterCard
            label="Paying wallets"
            value={loaded ? stats.uniqueWallets.toLocaleString() : null}
            loading={!loaded}
          />
          <CounterCard label="Settle" value="~400" suffix="ms" />
        </div>


        <div className="t2k-card overflow-hidden">
          <div
            className="grid gap-4 px-5 py-2.5 font-mono uppercase"
            style={{
              gridTemplateColumns: "1.3fr 1fr 0.8fr 0.7fr 0.8fr",
              borderBottom: "1px solid var(--ds-gray-alpha-300)",
              background: "var(--ds-gray-100)",
              fontSize: 10.5,
              color: "var(--fg-subtle)",
              letterSpacing: "0.08em",
            }}
          >
            <span>Service</span>
            <span>Endpoint</span>
            <span className="text-right">Settled</span>
            <span className="text-right">Status</span>
            <span className="text-right">When</span>
          </div>
          <div>
            {rows.length === 0 ? (
              <div
                className="px-5 py-14 text-center font-mono"
                style={{ fontSize: 13, color: "var(--fg-subtle)" }}
              >
                Waiting for the first request to settle…
              </div>
            ) : (
              rows.map((r) => (
                <div
                  key={r.id}
                  className="grid items-center gap-4 font-mono"
                  style={{
                    gridTemplateColumns: "1.3fr 1fr 0.8fr 0.7fr 0.8fr",
                    padding: "11px 18px",
                    borderBottom: "1px dotted var(--ds-gray-alpha-300)",
                    fontSize: 12,
                    color: "var(--fg)",
                  }}
                >
                  <span style={{ color: "var(--fg)" }}>
                    {serviceLabel(r.service)}
                  </span>
                  <span
                    className="truncate"
                    style={{ color: "var(--fg-muted)" }}
                  >
                    {abbreviateEndpoint(r.endpoint)}
                  </span>
                  <span
                    className="text-right t2k-tabular"
                    style={{ color: "var(--fg-muted)" }}
                  >
                    {formatUsd(r.amount)}
                  </span>
                  <span
                    className="text-right"
                    style={{ color: "var(--t2k-accent)" }}
                  >
                    200
                  </span>
                  <span
                    className="text-right"
                    style={{ color: "var(--fg-subtle)" }}
                  >
                    {relativeTs(r.createdAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div
          className="mt-5 text-center font-mono"
          style={{ fontSize: 11.5, color: "var(--fg-subtle)" }}
        >
          Showing last {Math.min(rows.length, MAX_ROWS)}. Tx hashes scrubbed for privacy. Stream resumes on every visit.
        </div>
      </div>
    </section>
  );
}

function CounterCard({
  label,
  value,
  suffix,
  loading,
}: {
  label: string;
  value: string | null;
  suffix?: string;
  loading?: boolean;
}) {
  return (
    <div
      className="t2k-card flex flex-col gap-1.5"
      style={{ padding: "20px 22px" }}
    >
      <div className="t2k-eyebrow" style={{ fontSize: 10.5 }}>
        {label}
      </div>
      <div
        className="flex items-baseline gap-1.5"
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: 36,
          lineHeight: 1.05,
          letterSpacing: "-0.035em",
          color: "var(--fg)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {loading ? (
          <span
            aria-hidden="true"
            className="inline-block animate-pulse rounded"
            style={{
              width: "5ch",
              height: "0.7em",
              background: "var(--ds-gray-alpha-300)",
            }}
          />
        ) : (
          <>
            {value}
            {suffix && (
              <span style={{ fontSize: 18, color: "var(--fg-muted)" }}>
                {suffix}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
