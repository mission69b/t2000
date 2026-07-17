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
        className="t2k-card grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (busy === "idle" && url.trim()) {
            check();
          }
        }}
      >
        <label className="grid gap-[7px]">
          <span
            className="text-[12.5px] font-medium"
            style={{ color: "var(--fg)" }}
          >
            Your paid API endpoint (https, answers 402)
          </span>
          <input
            className="w-full rounded-md border px-3 outline-none"
            maxLength={512}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.yourservice.com/v1/search"
            style={{
              background: "var(--bg-overlay)",
              borderColor: "var(--ds-gray-alpha-400)",
              color: "var(--fg)",
              fontFamily: "var(--font-mono)",
              fontSize: 12.5,
              height: 40,
            }}
            value={url}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="t2k-btn t2k-btn--primary disabled:opacity-50"
            disabled={busy !== "idle" || !url.trim()}
            type="submit"
          >
            {busy === "checking" ? "Running the checks…" : "Check it"}
          </button>
          {preview?.ok && !listed && (
            <button
              className="t2k-btn t2k-btn--blue disabled:opacity-50"
              disabled={busy !== "idle"}
              onClick={list}
              type="button"
            >
              {busy === "listing" ? "Listing…" : "List it"}
            </button>
          )}
          {error && (
            <span
              className="text-[12px]"
              style={{ color: "var(--ds-red-800)" }}
            >
              {error}
            </span>
          )}
        </div>
      </form>

      {gates.length > 0 && (
        <div className="t2k-card grid gap-3">
          <div
            className="text-[13px] font-semibold"
            style={{ color: "var(--fg)" }}
          >
            Checks
          </div>
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {gates.map((gate) => (
              <li
                className="font-mono text-[11.5px] leading-[1.5]"
                key={gate.gate}
                style={{
                  color: gate.ok ? "var(--t2k-success)" : "var(--ds-red-800)",
                }}
              >
                {gate.ok ? "✓" : "✗"} {gate.gate}: {gate.detail}
              </li>
            ))}
          </ul>
          {preview && !preview.ok && (
            <p
              className="m-0 text-[12.5px] leading-relaxed"
              style={{ color: "var(--fg-muted)" }}
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
        <div className="t2k-card grid gap-3">
          <div
            className="font-mono text-[12.5px] leading-[1.55]"
            style={{ color: "var(--t2k-success)" }}
          >
            ✓ Listed. Every sale settles on-chain to your wallet and shows on
            your store page as reputation.
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
            className="m-0 text-[12.5px] leading-relaxed"
            style={{ color: "var(--fg-muted)" }}
          >
            Manage by managing your API: price changes are picked up by the
            daily re-probe (or paste the URL here again to refresh instantly).
            Want a verified badge + custom name and links? Claim your store
            page — sign in at agents.t2000.ai with the wallet your 402 pays and
            register, or run{" "}
            <span className="font-mono" style={{ color: "var(--fg)" }}>
              t2 agent register
            </span>
            .
          </p>
        </div>
      )}

      {service && (preview?.ok || listed?.ok) && (
        <div className="t2k-card grid gap-3">
          <div
            className="text-[13px] font-semibold"
            style={{ color: "var(--fg)" }}
          >
            {listed ? "Your listing" : "What gets listed"}
          </div>
          <div className="grid gap-1">
            <div
              className="text-[15px] font-semibold"
              style={{ color: "var(--fg)" }}
            >
              {service.name}
            </div>
            <p
              className="m-0 text-[12.5px] leading-relaxed"
              style={{ color: "var(--fg-muted)" }}
            >
              {service.description}
            </p>
            {payTo && (
              <div
                className="mt-1 font-mono text-[11px]"
                style={{ color: "var(--fg-subtle)" }}
              >
                pays {payTo.slice(0, 8)}…{payTo.slice(-6)} · store page{" "}
                agents.t2000.ai/{payTo.slice(0, 8)}…
              </div>
            )}
          </div>
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {service.endpoints.map((ep) => (
              <li
                className="font-mono text-[11.5px] leading-[1.5]"
                key={`${ep.method} ${ep.path}`}
                style={{ color: "var(--fg-muted)" }}
              >
                {ep.method} {ep.path} — ${ep.price}
                {ep.description ? ` — ${ep.description}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="t2k-card grid gap-4">
          <div
            className="text-[13px] font-semibold"
            style={{ color: "var(--fg)" }}
          >
            Make the listing better{" "}
            <span className="font-normal" style={{ color: "var(--fg-subtle)" }}>
              — optional, improves how buyers&apos; agents use you
            </span>
          </div>
          {warnings.map((w) => (
            <div className="grid gap-2" key={w.code}>
              <p
                className="m-0 text-[12.5px] leading-relaxed"
                style={{ color: "var(--fg-muted)" }}
              >
                {w.message}
              </p>
              <div className="flex items-start gap-2">
                <p
                  className="m-0 flex-1 rounded-md border px-3 py-2 font-mono text-[11px] leading-[1.55]"
                  style={{
                    borderColor: "var(--ds-gray-alpha-400)",
                    color: "var(--fg-subtle)",
                  }}
                >
                  {w.prompt}
                </p>
                <CopyChip label="Copy prompt" payload={w.prompt} muted />
              </div>
            </div>
          ))}
          <p
            className="m-0 text-[12px] leading-relaxed"
            style={{ color: "var(--fg-subtle)" }}
          >
            Paste a prompt into your coding agent, ship the change, then paste
            your URL above again — the listing refreshes instantly.
          </p>
        </div>
      )}
    </div>
  );
}
