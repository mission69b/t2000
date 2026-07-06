"use client";

import type { VerifyCheck, VerifyResult } from "@t2000/sdk";
import { useCallback, useEffect, useState } from "react";

// Live port of the designer's VerifyHero + VerifyLedger (t2000-design/verify/
// VerifyPage.jsx). Layout + chrome verbatim; the data is real: /api/verify
// runs the checks, /api/receipts feeds the public ledger.

type AnchoredReceipt = {
  receiptId: string;
  wireHash: string;
  workloadId: string;
  anchoredAtMs: number;
  txDigest: string;
  explorer: string;
};

type FeedData = {
  receipts: AnchoredReceipt[];
  total: number;
  capped: boolean;
};

const LEDGER_ROWS = 14;

function timeAgo(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) {
    return `${s}s ago`;
  }
  if (s < 3600) {
    return `${Math.floor(s / 60)}m ago`;
  }
  if (s < 86_400) {
    return `${Math.floor(s / 3600)}h ago`;
  }
  return `${Math.floor(s / 86_400)}d ago`;
}

function short(s: string, head = 9, tail = 6): string {
  return s.length > head + tail + 1 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s;
}

export function VerifyLive() {
  const [feed, setFeed] = useState<FeedData | null>(null);
  const [value, setValue] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/receipts");
        const json = (await res.json()) as FeedData;
        if (alive) {
          setFeed(json);
        }
      } catch {
        // keep the last good feed
      }
    };
    load();
    const t = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const run = useCallback(async (id: string) => {
    const trimmed = id.trim();
    if (!trimmed) {
      return;
    }
    setChecking(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/verify?id=${encodeURIComponent(trimmed)}`);
      const json = await res.json();
      if (res.ok) {
        setResult(json as VerifyResult);
      } else {
        setError(json.error ?? "Verification failed.");
      }
    } catch {
      setError("Could not reach the verifier.");
    } finally {
      setChecking(false);
    }
  }, []);

  // Deep link: /?rcpt=rcpt-… prefills and verifies (design behavior).
  useEffect(() => {
    const rcpt = new URLSearchParams(window.location.search).get("rcpt");
    if (rcpt) {
      setValue(rcpt);
      run(rcpt);
    }
  }, [run]);

  const pick = (id: string) => {
    setValue(id);
    run(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <VerifyHero
        value={value}
        onChange={(v) => {
          setValue(v);
          setError(null);
        }}
        onRun={() => run(value)}
        checking={checking}
        result={result}
        error={error}
      />
      <VerifyLedger feed={feed} onPick={pick} />
    </>
  );
}

// ── Hero — interactive verifier ──────────────────────────────
function VerifyHero({
  value,
  onChange,
  onRun,
  checking,
  result,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  onRun: () => void;
  checking: boolean;
  result: VerifyResult | null;
  error: string | null;
}) {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        padding: "92px 0 64px",
        borderBottom: "1px solid var(--ds-gray-alpha-300)",
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          right: "-8%",
          top: "6%",
          width: 700,
          height: 500,
          background:
            "radial-gradient(45% 50% at 50% 50%, rgba(29,168,96,0.10) 0%, transparent 70%)",
          filter: "blur(24px)",
        }}
      />
      <div className="t2k-container relative">
        <div className="mx-auto mb-10 max-w-[700px] text-center">
          <div className="t2k-eyebrow" style={{ marginBottom: 20 }}>
            {"// VERIFY · verify.t2000.ai"}
          </div>
          <h1
            className="t2k-display mx-auto"
            style={{ fontSize: "clamp(40px, 5.6vw, 72px)", color: "var(--fg)" }}
          >
            Trust nothing.
            <br />
            <span style={{ color: "var(--t2k-success)" }}>Verify everything.</span>
          </h1>
          <p
            className="mx-auto"
            style={{
              fontSize: 18,
              lineHeight: 1.5,
              color: "var(--fg-muted)",
              margin: "22px auto 0",
              maxWidth: 520,
              letterSpacing: "-0.014em",
            }}
          >
            Every confidential response ships a signed receipt, anchored on
            Sui. Paste one to check it yourself — the anchor and signature
            here, the Intel TDX quote via the CLI on your machine.
          </p>
        </div>

        {/* Verifier card */}
        <div className="t2k-card mx-auto overflow-hidden p-0" style={{ maxWidth: 760 }}>
          <form
            className="flex flex-wrap"
            style={{
              gap: 10,
              padding: 14,
              borderBottom: "1px solid var(--ds-gray-alpha-300)",
            }}
            onSubmit={(e) => {
              e.preventDefault();
              onRun();
            }}
          >
            <div
              className="flex items-center"
              style={{
                flex: 1,
                minWidth: 240,
                gap: 10,
                padding: "0 14px",
                background: "var(--ds-background-200)",
                border: "1px solid var(--ds-gray-alpha-300)",
                borderRadius: 7,
              }}
            >
              <span
                className="font-mono"
                style={{ fontSize: 12, color: "var(--fg-subtle)" }}
              >
                receipt
              </span>
              <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="rcpt-…"
                spellCheck={false}
                className="font-mono"
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: "transparent",
                  border: 0,
                  outline: "none",
                  color: "var(--fg)",
                  fontSize: 12.5,
                  padding: "12px 0",
                  textOverflow: "ellipsis",
                }}
              />
            </div>
            <button
              type="submit"
              disabled={checking || !value.trim()}
              className="t2k-btn t2k-btn--blue whitespace-nowrap disabled:opacity-50"
            >
              {checking ? "Checking…" : "Verify →"}
            </button>
          </form>

          <div style={{ padding: 22, minHeight: 220 }}>
            {error && (
              <div
                className="rounded-lg px-4 py-3 text-sm"
                style={{
                  background: "rgba(238,0,0,0.08)",
                  border: "1px solid rgba(238,0,0,0.3)",
                  color: "var(--ds-red-900)",
                }}
              >
                {error}
              </div>
            )}
            {!(result || error) && (
              <div
                className="flex items-center justify-center font-mono"
                style={{ height: 220, color: "var(--fg-subtle)", fontSize: 13 }}
              >
                {checking ? "reading the Sui anchor…" : "paste a receipt to verify"}
              </div>
            )}
            {result && <VerifyResultPanel result={result} />}
          </div>
        </div>
      </div>
    </section>
  );
}

function VerifyResultPanel({ result }: { result: VerifyResult }) {
  return (
    <div style={{ animation: "t2k-fade-in 200ms var(--ease-out)" }}>
      {/* Result banner */}
      <div
        className="flex items-center"
        style={{
          gap: 10,
          padding: "12px 16px",
          marginBottom: 18,
          borderRadius: 8,
          background: result.verified ? "rgba(29,168,96,0.10)" : "rgba(238,0,0,0.08)",
          border: result.verified
            ? "1px solid rgba(29,168,96,0.3)"
            : "1px solid rgba(238,0,0,0.3)",
        }}
      >
        <span
          style={{
            color: result.verified ? "var(--t2k-success)" : "var(--ds-red-900)",
            fontSize: 15,
          }}
        >
          {result.verified ? "✓" : "✗"}
        </span>
        <span
          style={{
            fontWeight: 600,
            fontSize: 15,
            letterSpacing: "-0.011em",
            color: result.verified ? "var(--t2k-success)" : "var(--ds-red-900)",
          }}
        >
          {result.verified
            ? "Verified — TEE-signed receipt + trustless Sui anchor."
            : "Not verified — see the failed check below."}
        </span>
      </div>

      {/* Checks */}
      <div className="flex flex-col" style={{ gap: 14 }}>
        {result.checks.map((c) => (
          <CheckRow key={c.name} check={c} />
        ))}
      </div>

      {result.anchor?.explorer && (
        <a
          href={result.anchor.explorer}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center font-mono no-underline transition-colors hover:text-[color:var(--t2k-success)]"
          style={{
            gap: 6,
            marginTop: 18,
            fontSize: 12,
            color: "var(--fg)",
            borderBottom: "1px solid var(--ds-gray-alpha-500)",
            paddingBottom: 2,
          }}
        >
          View the anchor on Suiscan ↗
        </a>
      )}

      {/* Verify it yourself */}
      <div
        className="overflow-hidden"
        style={{
          marginTop: 18,
          border: "1px solid var(--ds-gray-alpha-300)",
          borderRadius: 8,
          background: "var(--ds-background-200)",
        }}
      >
        <div style={{ padding: "10px 16px 6px", fontWeight: 600, fontSize: 13, color: "var(--fg)" }}>
          Verify it yourself (fully trustless):
        </div>
        <div className="font-mono" style={{ padding: "0 16px 14px", fontSize: 12.5, color: "var(--fg)" }}>
          <span className="select-all" style={{ color: "var(--t2k-success)" }}>
            npx @t2000/cli verify
          </span>{" "}
          {result.receiptId}
          <div className="font-mono" style={{ fontSize: 11.5, color: "var(--fg-subtle)", marginTop: 8 }}>
            The CLI checks the Intel TDX quote client-side too — no trust in any server.
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckRow({ check }: { check: VerifyCheck }) {
  const isDeferredQuote = check.name.startsWith("TDX quote") && check.status === "skip";
  const detail = isDeferredQuote
    ? "Verified client-side by the CLI — run the command below to check the Intel TDX quote locally."
    : check.detail;
  const mark =
    check.status === "pass" ? (
      <span style={{ color: "var(--t2k-success)" }}>✓</span>
    ) : check.status === "fail" ? (
      <span style={{ color: "var(--ds-red-900)" }}>✗</span>
    ) : (
      <span style={{ color: "var(--fg-subtle)" }}>•</span>
    );
  return (
    <div className="flex" style={{ gap: 12 }}>
      <span style={{ fontSize: 13, flex: "0 0 auto", marginTop: 1 }}>{mark}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14, letterSpacing: "-0.011em", color: "var(--fg)" }}>
            {check.name}
          </span>
          {check.trust === "trustless" && (
            <span
              className="font-mono"
              style={{
                fontSize: 9.5,
                letterSpacing: "0.04em",
                color: "var(--t2k-success)",
                padding: "1px 7px",
                borderRadius: 4,
                background: "rgba(29,168,96,0.12)",
                border: "1px solid rgba(29,168,96,0.28)",
              }}
            >
              trustless
            </span>
          )}
        </div>
        <div
          className="font-mono break-words"
          style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 3, lineHeight: 1.5 }}
        >
          {detail}
        </div>
      </div>
    </div>
  );
}

// ── Verification ledger (live) ───────────────────────────────
function VerifyLedger({
  feed,
  onPick,
}: {
  feed: FeedData | null;
  onPick: (id: string) => void;
}) {
  const rows = feed?.receipts.slice(0, LEDGER_ROWS) ?? [];
  const gridCols = "grid-cols-[1.2fr_0.9fr_0.7fr] sm:grid-cols-[1.1fr_1.3fr_1fr_0.7fr_0.7fr]";

  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header
          className="flex flex-wrap items-end justify-between"
          style={{ marginBottom: 32, gap: 24 }}
        >
          <div>
            <div className="flex items-center" style={{ gap: 12, marginBottom: 12 }}>
              <span
                className="inline-flex items-center font-mono"
                style={{
                  gap: 7,
                  padding: "4px 10px",
                  borderRadius: 9999,
                  border: "1px solid var(--ds-gray-alpha-300)",
                  background: "var(--ds-gray-alpha-100)",
                  fontSize: 11,
                  color: "var(--fg-muted)",
                }}
              >
                <span className="t2k-dot" /> Live
              </span>
              <span className="t2k-eyebrow">{"// PUBLIC LEDGER"}</span>
            </div>
            <h2 className="t2k-section-title">Every confidential response, anchored.</h2>
          </div>
          <div className="text-right">
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: 40,
                letterSpacing: "-0.04em",
                color: "var(--fg)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {feed ? `${feed.total.toLocaleString()}${feed.capped ? "+" : ""}` : "—"}
            </div>
            <div className="t2k-eyebrow" style={{ fontSize: 10.5, marginTop: 2 }}>
              ANCHORED ON SUI
            </div>
          </div>
        </header>

        <div className="t2k-card overflow-hidden p-0">
          <div
            className={`grid ${gridCols} font-mono uppercase`}
            style={{
              gap: 16,
              padding: "10px 18px",
              borderBottom: "1px solid var(--ds-gray-alpha-300)",
              background: "var(--ds-gray-100)",
              fontSize: 10.5,
              color: "var(--fg-subtle)",
              letterSpacing: "0.08em",
            }}
          >
            <span>Receipt</span>
            <span className="hidden sm:block">Workload</span>
            <span>Anchor tx</span>
            <span className="hidden text-right sm:block">Status</span>
            <span className="text-right">When</span>
          </div>

          {rows.length > 0 ? (
            rows.map((r) => (
              <button
                type="button"
                key={r.txDigest}
                onClick={() => onPick(r.receiptId)}
                className={`grid ${gridCols} w-full cursor-pointer items-center border-0 text-left font-mono transition-colors hover:bg-[color:var(--ds-gray-alpha-100)]`}
                style={{
                  gap: 16,
                  padding: "11px 18px",
                  borderBottom: "1px dotted var(--ds-gray-alpha-300)",
                  background: "transparent",
                  fontSize: 12,
                }}
              >
                <span className="truncate" style={{ color: "var(--fg)" }}>
                  {short(r.receiptId, 10, 6)}
                </span>
                <span className="hidden truncate sm:block" style={{ color: "var(--fg-muted)" }}>
                  {short(r.workloadId.replace("sha256:", ""), 8, 4)}
                </span>
                <a
                  href={r.explorer}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="truncate no-underline hover:underline"
                  style={{ color: "var(--fg-subtle)" }}
                >
                  {short(r.txDigest, 4, 4)} ↗
                </a>
                <span className="hidden text-right sm:block" style={{ color: "var(--t2k-success)" }}>
                  ✓ anchored
                </span>
                <span className="text-right" style={{ color: "var(--fg-subtle)" }}>
                  {timeAgo(r.anchoredAtMs)}
                </span>
              </button>
            ))
          ) : (
            <div
              className="flex items-center justify-center font-mono"
              style={{ height: 120, color: "var(--fg-subtle)", fontSize: 13 }}
            >
              {feed ? "No anchored responses yet." : "Loading…"}
            </div>
          )}
        </div>
        <div
          className="text-center font-mono"
          style={{ marginTop: 18, fontSize: 11.5, color: "var(--fg-subtle)" }}
        >
          Showing the last {rows.length || LEDGER_ROWS}. Hashes only — no prompts, no identities.
        </div>
      </div>
    </section>
  );
}
