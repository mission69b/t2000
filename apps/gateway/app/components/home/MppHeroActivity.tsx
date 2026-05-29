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

type Row = {
  key: string;
  service: string;
  amount: string;
  ts: string;
  isNew: boolean;
};

const POLL_MS = 5_000;

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

export function MppHeroActivity() {
  const [rows, setRows] = useState<Row[]>([]);
  const seenIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch("/api/mpp/payments?limit=9", { cache: "no-store" });
        if (!res.ok) return;
        const data: { payments: Payment[] } = await res.json();
        if (cancelled) return;

        const fresh = data.payments.map((p, idx): Row => {
          const isNew = !seenIdsRef.current.has(p.id);
          if (isNew) seenIdsRef.current.add(p.id);
          return {
            key: `${p.id}`,
            service: p.service,
            amount: formatUsd(p.amount),
            ts: relativeTs(p.createdAt),
            isNew: isNew && idx === 0,
          };
        });
        setRows(fresh);
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
    <div
      className="overflow-hidden rounded-[10px] border"
      style={{
        background: "var(--ds-background-200)",
        borderColor: "var(--ds-gray-alpha-400)",
        boxShadow:
          "0 0 0 1px rgba(10,199,180,0.10), 0 24px 60px -20px rgba(10,199,180,0.20)",
      }}
    >
      <div
        className="flex items-center gap-2.5 px-3.5 py-2.5"
        style={{
          borderBottom: "1px solid var(--ds-gray-alpha-300)",
          background: "var(--ds-gray-100)",
        }}
      >
        <span className="t2k-dot" />
        <span
          className="font-mono"
          style={{ fontSize: 12, color: "var(--fg)", letterSpacing: "0.01em" }}
        >
          activity
        </span>
        <span className="flex-1" />
        <span
          className="font-mono uppercase"
          style={{ fontSize: 10, color: "var(--fg-subtle)", letterSpacing: "0.08em" }}
        >
          live · {rows.length}
        </span>
      </div>

      <div
        className="grid gap-3.5 px-4 py-2.5 font-mono uppercase"
        style={{
          gridTemplateColumns: "1.2fr 0.9fr 0.5fr 0.9fr",
          borderBottom: "1px solid var(--ds-gray-alpha-300)",
          fontSize: 10,
          color: "var(--fg-subtle)",
          letterSpacing: "0.08em",
        }}
      >
        <span>Service</span>
        <span>Settled</span>
        <span>Status</span>
        <span className="text-right">When</span>
      </div>

      <div style={{ minHeight: 326, paddingBottom: 4 }}>
        {rows.length === 0 ? (
          <div
            className="px-4 py-12 text-center font-mono"
            style={{ fontSize: 12, color: "var(--fg-subtle)" }}
          >
            Waiting for the first request…
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={row.key}
              className="grid gap-3.5 px-4 font-mono"
              style={{
                gridTemplateColumns: "1.2fr 0.9fr 0.5fr 0.9fr",
                padding: "9px 16px",
                borderBottom: "1px dotted var(--ds-gray-alpha-300)",
                fontSize: 12,
                color: "var(--fg)",
                animation: row.isNew
                  ? "mpp-row-in 600ms var(--ease-out)"
                  : undefined,
              }}
            >
              <span style={{ color: "var(--fg)" }}>{row.service}</span>
              <span style={{ color: "var(--fg-muted)" }} className="t2k-tabular">
                {row.amount}
              </span>
              <span style={{ color: "var(--t2k-accent)" }}>200</span>
              <span
                className="text-right"
                style={{ color: "var(--fg-subtle)" }}
              >
                {row.ts}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
