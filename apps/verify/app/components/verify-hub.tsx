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
    <div className="flex items-start gap-3 text-sm">
      <span className="mt-0.5 w-3 shrink-0">{mark}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 font-medium tracking-tight">
          {check.name}
          {check.trust === "trustless" && (
            <span className="rounded border border-emerald/30 bg-emerald/10 px-1.5 py-px font-mono text-[9.5px] text-emerald tracking-[0.04em]">
              trustless
            </span>
          )}
        </div>
        <div className="mt-0.5 break-words font-mono text-dim text-xs leading-relaxed">
          {detail}
        </div>
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
    <main>
      {/* Hero + verifier — the designed layout (t2000-design/verify) */}
      <section className="relative overflow-hidden border-border border-b pt-20 pb-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            right: "-8%",
            top: "6%",
            width: 700,
            height: 500,
            background:
              "radial-gradient(45% 50% at 50% 50%, rgba(16,185,129,0.10) 0%, transparent 70%)",
            filter: "blur(24px)",
          }}
        />
        <div className="relative mx-auto max-w-3xl px-5">
          <div className="mx-auto mb-10 max-w-[700px] text-center">
            <div className="mb-5 font-medium font-mono text-[11px] text-dim uppercase tracking-[0.1em]">
              {"// VERIFY · verify.t2000.ai"}
            </div>
            <h1
              className="font-semibold text-foreground"
              style={{
                fontSize: "clamp(40px, 5.6vw, 68px)",
                lineHeight: 1.02,
                letterSpacing: "-0.045em",
                textWrap: "balance",
              }}
            >
              Trust nothing.
              <br />
              <span className="text-emerald">Verify everything.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-[520px] text-[16px] text-muted leading-relaxed tracking-tight">
              Every confidential response ships a signed receipt, anchored on
              Sui{feed ? (
                <>
                  {" — "}
                  <span className="text-foreground">
                    {feed.total.toLocaleString()}
                    {feed.capped ? "+" : ""} so far
                  </span>
                </>
              ) : null}
              . Paste one to check the anchor and signature here — or run the
              full check, TDX quote included, on your machine.
            </p>
          </div>

          {/* Verifier card */}
          <div className="mx-auto max-w-[760px] overflow-hidden rounded-xl border border-border bg-surface">
            <form
              className="flex flex-wrap gap-2.5 border-border border-b p-3.5"
              onSubmit={(e) => {
                e.preventDefault();
                runVerify(receiptInput);
              }}
            >
              <div className="flex min-w-[240px] flex-1 items-center gap-2.5 rounded-lg border border-border bg-background px-3.5">
                <span className="font-mono text-[12px] text-dim">receipt</span>
                <input
                  className="min-w-0 flex-1 border-0 bg-transparent py-3 font-mono text-[12.5px] text-foreground outline-none placeholder:text-dim"
                  onChange={(e) => setReceiptInput(e.target.value)}
                  placeholder="rcpt-…"
                  spellCheck={false}
                  value={receiptInput}
                />
              </div>
              <button
                className="whitespace-nowrap rounded-lg bg-emerald px-5 py-2.5 font-medium text-black text-sm disabled:opacity-50"
                disabled={verifying || !receiptInput.trim()}
                type="submit"
              >
                {verifying ? "Checking…" : "Verify →"}
              </button>
            </form>

            <div className="min-h-[180px] p-5">
              {verifyError && (
                <div className="rounded-lg bg-red-500/10 px-3 py-2 text-red-400 text-sm">
                  {verifyError}
                </div>
              )}
              {!(result || verifyError) && (
                <div className="flex h-[160px] items-center justify-center font-mono text-[13px] text-dim">
                  {verifying
                    ? "reading the Sui anchor…"
                    : "paste a receipt to verify — or click a row below"}
                </div>
              )}
              {result && (
                <div className="flex flex-col gap-4">
                  <div
                    className={`flex items-center gap-2.5 rounded-lg border px-4 py-3 font-medium text-sm tracking-tight ${
                      result.verified
                        ? "border-emerald/30 bg-emerald/10 text-emerald"
                        : "border-red-500/30 bg-red-500/10 text-red-400"
                    }`}
                  >
                    {result.verified
                      ? "✓ Verified — TEE-signed receipt + trustless Sui anchor."
                      : "✗ Not verified — see the failed check below."}
                  </div>
                  <div className="flex flex-col gap-3.5">
                    {result.checks.map((c) => (
                      <CheckRow check={c} key={c.name} />
                    ))}
                  </div>
                  {result.anchor?.explorer && (
                    <a
                      className="inline-flex w-fit items-center gap-1.5 border-border border-b pb-0.5 font-mono text-foreground text-xs no-underline transition-colors hover:text-emerald"
                      href={result.anchor.explorer}
                      rel="noreferrer"
                      target="_blank"
                    >
                      View the anchor on Suiscan ↗
                    </a>
                  )}
                  <div className="overflow-hidden rounded-lg border border-border bg-background">
                    <div className="px-4 pt-2.5 pb-1 font-medium text-foreground text-xs">
                      Verify it yourself (fully trustless):
                    </div>
                    <div className="px-4 pb-3.5 font-mono text-[12.5px]">
                      <span className="select-all text-emerald">
                        npx @t2000/cli verify {result.receiptId}
                      </span>
                      <div className="mt-1.5 font-mono text-[11px] text-dim">
                        The CLI checks the Intel TDX quote client-side too — no
                        trust in any server.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Public ledger — live anchored receipts */}
      <section className="mx-auto max-w-3xl px-5 pt-16">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="mb-3 flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-[11px] text-muted">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald" />
                Live
              </span>
              <span className="font-medium font-mono text-[11px] text-dim uppercase tracking-[0.1em]">
                {"// PUBLIC LEDGER"}
              </span>
            </div>
            <h2 className="font-semibold text-2xl tracking-tight">
              Every confidential response, anchored.
            </h2>
          </div>
          {feed && (
            <div className="text-right">
              <div
                className="font-semibold text-3xl text-foreground"
                style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em" }}
              >
                {feed.total.toLocaleString()}
                {feed.capped ? "+" : ""}
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-dim uppercase tracking-[0.1em]">
                anchored on Sui
              </div>
            </div>
          )}
        </header>

        <div className="overflow-hidden rounded-xl border border-border">
          <div className="grid grid-cols-[1.2fr_1fr_0.6fr] gap-4 border-border border-b bg-surface px-4 py-2.5 font-mono text-[10.5px] text-dim uppercase tracking-[0.08em] sm:grid-cols-[1.2fr_1.1fr_0.8fr_0.6fr]">
            <span>Receipt</span>
            <span className="hidden sm:block">Workload</span>
            <span>Anchor</span>
            <span className="text-right">When</span>
          </div>
          {feed?.receipts.length ? (
            feed.receipts.map((r) => (
              <button
                className="grid w-full grid-cols-[1.2fr_1fr_0.6fr] items-center gap-4 border-border border-b px-4 py-3 text-left font-mono text-[12px] last:border-b-0 hover:bg-surface sm:grid-cols-[1.2fr_1.1fr_0.8fr_0.6fr]"
                key={r.txDigest}
                onClick={() => {
                  setReceiptInput(r.receiptId);
                  runVerify(r.receiptId);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                type="button"
              >
                <span className="truncate text-foreground">
                  {short(r.receiptId)}
                </span>
                <span className="hidden truncate text-muted sm:block">
                  {short(r.workloadId.replace("sha256:", ""), 8, 4)}
                </span>
                <a
                  className="truncate text-emerald no-underline underline-offset-2 hover:underline"
                  href={r.explorer}
                  onClick={(e) => e.stopPropagation()}
                  rel="noreferrer"
                  target="_blank"
                >
                  {short(r.txDigest, 4, 4)} ↗
                </a>
                <span className="text-right text-dim">
                  {timeAgo(r.anchoredAtMs)}
                </span>
              </button>
            ))
          ) : (
            <div className="px-4 py-8 text-center text-dim text-sm">
              {feed ? "No anchored responses yet." : "Loading…"}
            </div>
          )}
        </div>
        <div className="mt-4 text-center font-mono text-[11.5px] text-dim">
          Hashes only — no prompts, no identities. Anchored by t2000&apos;s
          signer on Sui mainnet.
        </div>
      </section>
    </main>
  );
}
