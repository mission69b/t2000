"use client";

import { useState } from "react";
import { CopyChip } from "../components/services/CopyChip";

// [SPEC_T2_AGENTS_STORE Phase 1, moved to the rail 2026-07-17 PM] The
// zero-friction sell flow: ONE input. Paste a paid-API URL → the gateway
// dry-runs every listing gate + grades the listing (nothing written) →
// "List it" runs the same checks and writes the entry. No account, no
// signature — the API's own 402 challenge names the payout wallet, and that
// wallet IS the seller identity/store page. Gates live gateway-side only
// (preview + submit share them), so this page can never disagree with
// `t2 check` or a raw curl. Same-origin now — the fetches are relative.

type Gate = { gate: string; ok: boolean; detail: string };
type Warning = { code: string; message: string; prompt: string };
type PreviewService = {
  id: string;
  name: string;
  description: string;
  endpoints: {
    method: string;
    path: string;
    price: string;
    description: string;
  }[];
};
type PreviewResponse = {
  ok?: boolean;
  gates?: Gate[];
  service?: PreviewService;
  payTo?: string;
  warnings?: Warning[];
  error?: string;
};
type SubmitResponse = PreviewResponse & {
  serviceId?: string;
  url?: string;
  storeUrl?: string;
};

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[14px] font-semibold"
      style={{ color: "var(--fg)", letterSpacing: "-0.011em" }}
    >
      {children}
    </div>
  );
}

export function SellFlow() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"idle" | "checking" | "listing">("idle");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [listed, setListed] = useState<SubmitResponse | null>(null);
  const [error, setError] = useState("");

  async function post(route: "preview" | "submit"): Promise<SubmitResponse> {
    const res = await fetch(`/api/catalog/${route}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: url.trim() }),
    });
    return (await res.json().catch(() => ({}))) as SubmitResponse;
  }

  async function check() {
    setBusy("checking");
    setError("");
    setListed(null);
    setPreview(null);
    try {
      const out = await post("preview");
      if (out.error && !out.gates) {
        throw new Error(out.error);
      }
      setPreview(out);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The gateway is unreachable — try again.",
      );
    } finally {
      setBusy("idle");
    }
  }

  async function list() {
    setBusy("listing");
    setError("");
    try {
      const out = await post("submit");
      if (out.error && !out.gates) {
        throw new Error(out.error);
      }
      if (out.ok) {
        setListed(out);
      } else {
        // The endpoint changed between preview and submit — show the fresh gates.
        setPreview(out);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The gateway is unreachable — try again.",
      );
    } finally {
      setBusy("idle");
    }
  }

  const gates = (listed ?? preview)?.gates ?? [];
  const warnings = (listed ?? preview)?.warnings ?? [];
  const service = (listed ?? preview)?.service;
  const payTo = (listed ?? preview)?.payTo;

  return (
    <div className="grid gap-4">
      <form
        className="t2k-card grid gap-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (busy === "idle" && url.trim()) {
            check();
          }
        }}
      >
        <label className="grid gap-2">
          <span
            className="t2k-eyebrow"
            style={{ fontSize: 10.5, letterSpacing: "0.08em" }}
          >
            Your paid API endpoint · https · answers 402
          </span>
          <input
            className="w-full rounded-md border font-mono outline-none transition-colors"
            maxLength={512}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.yourservice.com/v1/search"
            style={{
              background: "var(--ds-gray-alpha-100)",
              borderColor: "var(--ds-gray-alpha-400)",
              color: "var(--fg)",
              fontSize: 13,
              height: 44,
              letterSpacing: "0.01em",
              padding: "0 14px",
            }}
            value={url}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="t2k-btn t2k-btn--primary disabled:cursor-default disabled:opacity-40"
            disabled={busy !== "idle" || !url.trim()}
            type="submit"
          >
            {busy === "checking" ? "Running the checks…" : "Check it"}
          </button>
          {preview?.ok && !listed && (
            <button
              className="t2k-btn t2k-btn--blue disabled:cursor-default disabled:opacity-40"
              disabled={busy !== "idle"}
              onClick={list}
              type="button"
            >
              {busy === "listing" ? "Listing…" : "List it"}
            </button>
          )}
          {error && (
            <span
              className="font-mono text-[12px]"
              style={{ color: "var(--ds-red-800)" }}
            >
              {error}
            </span>
          )}
        </div>
      </form>

      {gates.length > 0 && (
        <div className="t2k-card overflow-hidden">
          <div
            className="px-6 py-2.5 font-mono uppercase"
            style={{
              background: "var(--ds-gray-100)",
              borderBottom: "1px solid var(--ds-gray-alpha-300)",
              color: "var(--fg-subtle)",
              fontSize: 10.5,
              letterSpacing: "0.08em",
            }}
          >
            Checks
          </div>
          <ul className="m-0 grid list-none p-0">
            {gates.map((gate) => (
              <li
                className="flex items-baseline gap-3 px-6 py-3"
                key={gate.gate}
                style={{
                  borderBottom: "1px solid var(--ds-gray-alpha-200)",
                }}
              >
                <span
                  className="font-mono text-[12px] font-semibold"
                  style={{
                    color: gate.ok ? "var(--t2k-success)" : "var(--ds-red-800)",
                  }}
                >
                  {gate.ok ? "✓" : "✗"}
                </span>
                <span
                  className="w-[52px] shrink-0 font-mono text-[11px] uppercase"
                  style={{ color: "var(--fg-subtle)", letterSpacing: "0.06em" }}
                >
                  {gate.gate}
                </span>
                <span
                  className="text-[13px] leading-[1.55]"
                  style={{
                    color: gate.ok ? "var(--fg-muted)" : "var(--fg)",
                    letterSpacing: "-0.011em",
                  }}
                >
                  {gate.detail}
                </span>
              </li>
            ))}
          </ul>
          {preview && !preview.ok && (
            <p
              className="m-0 px-6 py-4 text-[13px] leading-relaxed"
              style={{
                color: "var(--fg-muted)",
                letterSpacing: "-0.011em",
              }}
            >
              Fix the failing check and run it again. Building the endpoint?{" "}
              <a
                className="font-medium no-underline"
                href="https://developers.t2000.ai/sell-your-api"
                rel="noreferrer"
                style={{ color: "var(--t2k-accent)" }}
                target="_blank"
              >
                Seller guide →
              </a>
            </p>
          )}
        </div>
      )}

      {listed?.ok && (
        <div className="t2k-card grid gap-4 p-6">
          <div className="flex items-center gap-2.5">
            <span className="t2k-dot" />
            <span
              className="text-[14px] font-semibold"
              style={{ color: "var(--fg)", letterSpacing: "-0.011em" }}
            >
              Listed. Every sale settles on-chain to your wallet.
            </span>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {listed.serviceId && (
              <a
                className="t2k-btn t2k-btn--primary no-underline"
                href={`/services/${listed.serviceId}`}
              >
                Your listing →
              </a>
            )}
            {listed.payTo && (
              <a
                className="t2k-btn t2k-btn--ghost no-underline"
                href={`https://agents.t2000.ai/${listed.payTo}`}
                rel="noreferrer"
                target="_blank"
              >
                Your store page ↗
              </a>
            )}
          </div>
          <p
            className="m-0 text-[13px] leading-relaxed"
            style={{ color: "var(--fg-muted)", letterSpacing: "-0.011em" }}
          >
            Manage by managing your API: price changes are picked up by the
            daily re-probe (or paste the URL here again to refresh instantly).
            Want a verified badge + custom name and links? Claim your store
            page — sign in at agents.t2000.ai with the wallet your 402 pays and
            register, or run{" "}
            <span
              className="font-mono text-[12px]"
              style={{ color: "var(--fg)" }}
            >
              t2 agent register
            </span>
            .
          </p>
        </div>
      )}

      {service && (preview?.ok || listed?.ok) && (
        <div className="t2k-card overflow-hidden">
          <div
            className="px-6 py-2.5 font-mono uppercase"
            style={{
              background: "var(--ds-gray-100)",
              borderBottom: "1px solid var(--ds-gray-alpha-300)",
              color: "var(--fg-subtle)",
              fontSize: 10.5,
              letterSpacing: "0.08em",
            }}
          >
            {listed ? "Your listing" : "What gets listed"}
          </div>
          <div className="grid gap-1.5 px-6 pt-5 pb-4">
            <div
              className="text-[17px] font-semibold"
              style={{ color: "var(--fg)", letterSpacing: "-0.02em" }}
            >
              {service.name}
            </div>
            <p
              className="m-0 max-w-[560px] text-[13.5px] leading-relaxed"
              style={{ color: "var(--fg-muted)", letterSpacing: "-0.011em" }}
            >
              {service.description}
            </p>
            {payTo && (
              <div
                className="mt-1 font-mono text-[11.5px]"
                style={{ color: "var(--fg-subtle)" }}
              >
                pays {payTo.slice(0, 8)}…{payTo.slice(-6)} · store page{" "}
                agents.t2000.ai/{payTo.slice(0, 8)}…
              </div>
            )}
          </div>
          <div>
            {service.endpoints.map((ep) => (
              <div
                className="grid items-center gap-4 px-6 py-3"
                key={`${ep.method} ${ep.path}`}
                style={{
                  borderTop: "1px solid var(--ds-gray-alpha-300)",
                  gridTemplateColumns: "56px 1fr 90px",
                }}
              >
                <span
                  className="font-mono font-semibold"
                  style={{
                    color: "var(--t2k-accent)",
                    fontSize: 11,
                    letterSpacing: "0.06em",
                  }}
                >
                  {ep.method}
                </span>
                <div>
                  <div
                    className="font-mono"
                    style={{ color: "var(--fg)", fontSize: 13 }}
                  >
                    {ep.path}
                  </div>
                  {ep.description && (
                    <div
                      style={{
                        color: "var(--fg-muted)",
                        fontSize: 12.5,
                        letterSpacing: "-0.011em",
                        marginTop: 2,
                      }}
                    >
                      {ep.description}
                    </div>
                  )}
                </div>
                <span
                  className="t2k-tabular text-right font-mono"
                  style={{ color: "var(--fg-muted)", fontSize: 12 }}
                >
                  {ep.price === "dynamic"
                    ? "dynamic"
                    : `$${parseFloat(ep.price).toFixed(2)}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="t2k-card grid gap-4 p-6">
          <CardTitle>
            Make the listing better{" "}
            <span
              className="font-normal"
              style={{ color: "var(--fg-subtle)" }}
            >
              — optional, improves how buyers&apos; agents use you
            </span>
          </CardTitle>
          {warnings.map((w) => (
            <div className="grid gap-2" key={w.code}>
              <p
                className="m-0 text-[13.5px] leading-relaxed"
                style={{ color: "var(--fg-muted)", letterSpacing: "-0.011em" }}
              >
                {w.message}
              </p>
              <div className="flex flex-wrap items-start gap-2">
                <p
                  className="m-0 flex-1 basis-[320px] rounded-md border px-3.5 py-3 font-mono text-[12px] leading-[1.6]"
                  style={{
                    background: "var(--ds-gray-alpha-100)",
                    borderColor: "var(--ds-gray-alpha-400)",
                    color: "var(--fg-muted)",
                  }}
                >
                  {w.prompt}
                </p>
                <CopyChip label="Copy prompt" payload={w.prompt} />
              </div>
            </div>
          ))}
          <p
            className="m-0 text-[12.5px] leading-relaxed"
            style={{ color: "var(--fg-subtle)", letterSpacing: "-0.011em" }}
          >
            Paste a prompt into your coding agent, ship the change, then paste
            your URL above again — the listing refreshes instantly.
          </p>
        </div>
      )}
    </div>
  );
}
