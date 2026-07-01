"use client";

import type { VerifyCheck, VerifyResult } from "@t2000/sdk";
import { useCallback, useEffect, useState } from "react";

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

function short(s: string, head = 10, tail = 6): string {
  return s.length > head + tail ? `${s.slice(0, head)}…${s.slice(-tail)}` : s;
}

function CheckRow({ check }: { check: VerifyCheck }) {
  const mark =
    check.status === "pass" ? (
      <span className="text-emerald">✓</span>
    ) : check.status === "fail" ? (
      <span className="text-red-400">✗</span>
    ) : (
      <span className="text-dim">•</span>
    );
  const isDeferredQuote =
    check.name.startsWith("TDX quote") && check.status === "skip";
  const detail = isDeferredQuote
    ? "Verified client-side by the CLI — run the command below to check the Intel TDX quote locally."
    : check.detail;
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="mt-0.5 w-3 shrink-0">{mark}</span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 font-medium">
          {check.name}
          {check.trust === "trustless" && (
            <span className="rounded bg-emerald/10 px-1 py-px text-[10px] text-emerald">
              trustless
            </span>
          )}
        </div>
        <div className="text-dim text-xs">{detail}</div>
      </div>
    </div>
  );
}

export function VerifyHub() {
  const [feed, setFeed] = useState<FeedData | null>(null);
  const [receiptInput, setReceiptInput] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

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

  const runVerify = useCallback(async (id: string) => {
    const trimmed = id.trim();
    if (!trimmed) {
      return;
    }
    setVerifying(true);
    setVerifyError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/verify?id=${encodeURIComponent(trimmed)}`);
      const json = await res.json();
      if (res.ok) {
        setResult(json as VerifyResult);
      } else {
        setVerifyError(json.error ?? "Verification failed.");
      }
    } catch {
      setVerifyError("Could not reach the verifier.");
    } finally {
      setVerifying(false);
    }
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      {/* Hero */}
      <div className="text-center">
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-emerald text-xs">
          🔒 Confidential AI · proven on Sui
        </div>
        <h1 className="font-semibold text-4xl tracking-tight sm:text-5xl">
          {feed ? (
            <>
              <span className="text-emerald">
                {feed.total.toLocaleString()}
                {feed.capped ? "+" : ""}
              </span>{" "}
              confidential responses
            </>
          ) : (
            "Confidential responses"
          )}
          <br />
          verified on Sui
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-muted">
          Every confidential inference on Audric runs inside a GPU-TEE and is
          anchored on Sui — a tamper-evident, public, permanent record. Hashes
          only: no prompts, no identities. Don't trust us — verify it yourself.
        </p>
      </div>

      {/* Paste-to-verify */}
      <div className="mt-10 rounded-2xl border border-border bg-surface p-5">
        <div className="font-medium text-sm">Verify a receipt</div>
        <div className="mt-1 text-dim text-xs">
          Paste any confidential receipt id (<code>rcpt-…</code>) to run the
          trustless checks.
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            runVerify(receiptInput);
          }}
        >
          <input
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-emerald/50"
            onChange={(e) => setReceiptInput(e.target.value)}
            placeholder="rcpt-…"
            value={receiptInput}
          />
          <button
            className="rounded-lg bg-emerald px-4 py-2 font-medium text-black text-sm disabled:opacity-50"
            disabled={verifying || !receiptInput.trim()}
            type="submit"
          >
            {verifying ? "Verifying…" : "Verify"}
          </button>
        </form>

        {verifyError && (
          <div className="mt-3 text-red-400 text-sm">{verifyError}</div>
        )}
        {result && (
          <div className="mt-4 flex flex-col gap-3">
            <div
              className={`rounded-lg px-3 py-2 text-sm ${
                result.verified
                  ? "bg-emerald/10 text-emerald"
                  : "bg-red-500/10 text-red-400"
              }`}
            >
              {result.verified
                ? "✓ Verified — TEE-signed receipt + trustless Sui anchor."
                : "✗ Not verified — see the failed check below."}
            </div>
            <div className="flex flex-col gap-2">
              {result.checks.map((c) => (
                <CheckRow check={c} key={c.name} />
              ))}
            </div>
            {result.anchor?.explorer && (
              <a
                className="text-dim text-xs underline underline-offset-2 hover:text-foreground"
                href={result.anchor.explorer}
                rel="noreferrer"
                target="_blank"
              >
                View the anchor on Suiscan ↗
              </a>
            )}
            <div className="rounded-lg border border-border bg-background p-3">
              <div className="mb-1 font-medium text-xs">
                Verify it yourself (fully trustless):
              </div>
              <code className="block select-all rounded bg-surface px-2 py-1 text-emerald text-xs">
                npx @t2000/cli verify {result.receiptId}
              </code>
              <div className="mt-1 text-[10px] text-dim">
                The CLI checks the Intel TDX quote client-side too — no trust in
                any server.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Live feed */}
      <div className="mt-12">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-medium text-sm">Latest verified responses</div>
          <div className="flex items-center gap-1.5 text-dim text-xs">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald" />
            live
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border">
          {feed?.receipts.length ? (
            feed.receipts.map((r) => (
              <button
                className="flex w-full items-center justify-between gap-3 border-border border-b px-4 py-3 text-left last:border-b-0 hover:bg-surface"
                key={r.txDigest}
                onClick={() => {
                  setReceiptInput(r.receiptId);
                  runVerify(r.receiptId);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                type="button"
              >
                <div className="min-w-0">
                  <div className="font-mono text-sm">{short(r.receiptId)}</div>
                  <div className="text-dim text-xs">
                    workload {short(r.workloadId.replace("sha256:", ""), 8, 4)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs">
                  <span className="text-dim">{timeAgo(r.anchoredAtMs)}</span>
                  <a
                    className="text-emerald underline-offset-2 hover:underline"
                    href={r.explorer}
                    onClick={(e) => e.stopPropagation()}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Suiscan ↗
                  </a>
                </div>
              </button>
            ))
          ) : (
            <div className="px-4 py-8 text-center text-dim text-sm">
              {feed ? "No anchored responses yet." : "Loading…"}
            </div>
          )}
        </div>
      </div>

      <footer className="mt-16 text-center text-dim text-xs">
        Anchored by t2000's signer on Sui mainnet · only hashes are public ·{" "}
        <a
          className="underline underline-offset-2 hover:text-foreground"
          href="https://developers.t2000.ai/confidential-ai/how-it-works"
          rel="noreferrer"
          target="_blank"
        >
          how it works
        </a>
      </footer>
    </main>
  );
}
