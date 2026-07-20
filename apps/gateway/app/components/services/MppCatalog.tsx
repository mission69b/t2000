"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Service } from "@/lib/services";
import { categoryLabel } from "@/lib/catalog";
import { formatUsd } from "@/lib/format";
import { sampleBodyFor } from "@/lib/sample-body";
import { CopyChip } from "./CopyChip";

type CategoryBucket = { id: string; label: string; count: number };

export function MppCatalog({
  services,
  categories,
}: {
  services: Service[];
  categories: CategoryBucket[];
}) {
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState<string>("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return services.filter((s) => {
      if (cat !== "all" && (s.categories[0] ?? "utility") !== cat) return false;
      if (!term) return true;
      return (
        s.name.toLowerCase().includes(term) ||
        s.description.toLowerCase().includes(term) ||
        s.categories.some((c) => c.toLowerCase().includes(term))
      );
    });
  }, [cat, q, services]);

  useEffect(() => setExpanded(null), [cat, q]);

  const total = services.length;
  const chips: CategoryBucket[] = [
    { id: "all", label: "All", count: total },
    ...categories,
  ];

  return (
    <section style={{ padding: "60px 0 96px" }}>
      <div className="t2k-container">
        <header style={{ marginBottom: 32 }}>
          <span className="t2k-eyebrow">// SERVICES</span>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
            <h1
              className="t2k-section-title m-0"
              style={{ lineHeight: 1.0 }}
            >
              Every service,
              <br />
              <span style={{ color: "var(--fg-muted)" }}>priced per call.</span>
            </h1>
            <CatalogSearch q={q} setQ={setQ} />
          </div>
          <p
            className="mb-0 mt-5 max-w-[560px]"
            style={{
              fontSize: 16,
              lineHeight: 1.55,
              color: "var(--fg-muted)",
              letterSpacing: "-0.011em",
            }}
          >
            {total} services. {services.reduce((sum, s) => sum + s.endpoints.length, 0)} endpoints. No signup. No API keys. Settled in USDC, gasless, on Sui.
          </p>
        </header>

        <div
          className="flex flex-nowrap gap-2 overflow-x-auto py-6 scrollbar-hide"
          style={{ borderTop: "1px solid var(--ds-gray-alpha-300)" }}
        >
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              className="mpp-chip shrink-0"
              aria-pressed={c.id === cat}
              onClick={() => setCat(c.id)}
            >
              {c.label}
              <span className="count">{c.count}</span>
            </button>
          ))}
        </div>

        <div
          className="flex items-center justify-between font-mono"
          style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--ds-gray-alpha-300)",
            borderBottom: "1px solid var(--ds-gray-alpha-300)",
            fontSize: 11.5,
            color: "var(--fg-muted)",
            letterSpacing: "0.01em",
          }}
        >
          <span>
            {filtered.length} {filtered.length === 1 ? "service" : "services"}
            {cat !== "all" && (
              <>
                {" in "}
                <span style={{ color: "var(--fg)" }}>
                  {chips.find((c) => c.id === cat)?.label}
                </span>
              </>
            )}
            {q && (
              <>
                {" matching "}
                <span style={{ color: "var(--fg)" }}>"{q}"</span>
              </>
            )}
          </span>
          <a
            href="https://mpp.t2000.ai/openapi.json"
            target="_blank"
            rel="noopener noreferrer"
            className="no-underline transition-colors"
            style={{
              color: "var(--t2k-accent)",
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              letterSpacing: "-0.011em",
            }}
          >
            OpenAPI ↗
          </a>
        </div>

        {filtered.length === 0 ? (
          <CatalogEmpty />
        ) : (
          <div role="list">
            {filtered.map((s) => (
              <CatalogRow
                key={s.id}
                service={s}
                isOpen={expanded === s.id}
                onToggle={() =>
                  setExpanded(expanded === s.id ? null : s.id)
                }
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function CatalogSearch({
  q,
  setQ,
}: {
  q: string;
  setQ: (v: string) => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-md border px-3 py-2"
      style={{
        background: "var(--ds-gray-alpha-100)",
        borderColor: "var(--ds-gray-alpha-400)",
        width: 280,
        transition: "border-color var(--dur-fast) var(--ease-out)",
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        style={{ color: "var(--fg-subtle)", flexShrink: 0 }}
      >
        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path
          d="M11 11 L14 14"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <input
        type="text"
        placeholder="Search services…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search services"
        className="flex-1 min-w-0 border-0 bg-transparent outline-none"
        style={{
          color: "var(--fg)",
          fontFamily: "var(--font-sans)",
          fontSize: 13.5,
          letterSpacing: "-0.011em",
        }}
      />
      {q && (
        <button
          type="button"
          onClick={() => setQ("")}
          aria-label="Clear search"
          className="appearance-none border-0 bg-transparent p-0 leading-none"
          style={{
            color: "var(--fg-subtle)",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

function CatalogRow({
  service,
  isOpen,
  onToggle,
}: {
  service: Service;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const primary = service.categories[0] ?? "utility";
  const cheapest = (() => {
    const ns = service.endpoints
      .map((e) => parseFloat(e.price))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (ns.length === 0) return "dynamic";
    return formatUsd(Math.min(...ns));
  })();

  return (
    <div role="listitem">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="mpp-svc-row"
      >
        <Caret open={isOpen} />

        <div className="flex items-center gap-2.5">
          <span
            className="font-semibold tracking-[-0.022em]"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 16,
              color: "var(--fg)",
            }}
          >
            {service.name}
          </span>
          {service.direct && <DirectBadge />}
        </div>

        <span
          className="font-mono uppercase"
          style={{
            fontSize: 11,
            letterSpacing: "0.10em",
            color: "var(--fg-subtle)",
          }}
        >
          {categoryLabel(primary)}
        </span>

        <span
          className="text-right font-mono"
          style={{
            fontSize: 12,
            color: "var(--fg-muted)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {service.endpoints.length}{" "}
          {service.endpoints.length === 1 ? "endpoint" : "endpoints"}
        </span>

        <span
          className="text-right font-mono"
          style={{
            fontSize: 12,
            color: "var(--fg)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          from {cheapest}
        </span>
      </button>

      {isOpen && (
        <div
          style={{
            borderBottom: "1px solid var(--ds-gray-alpha-300)",
            animation: "t2k-fade-in 150ms var(--ease-out)",
          }}
        >
          {service.endpoints.map((e, i) => (
            <CatalogEndpointRow key={i} endpoint={e} service={service} />
          ))}

          <div
            className="flex flex-wrap items-center justify-between gap-4 font-mono"
            style={{
              padding: "12px 20px",
              background: "var(--ds-background-200)",
              fontSize: 11.5,
              color: "var(--fg-subtle)",
            }}
          >
            <span>
              Base URL{" "}
              <span style={{ color: "var(--fg)" }}>{service.serviceUrl}</span>
              {service.direct && (
                <span style={{ display: "block", marginTop: 4 }}>
                  Direct seller — payment settles to the seller; delivery is the
                  seller's responsibility.
                </span>
              )}
            </span>
            <div className="flex gap-4">
              <Link
                href={`/services/${service.id}`}
                className="no-underline transition-colors"
                style={{ color: "var(--t2k-accent)" }}
              >
                View details →
              </Link>
              <a
                href={
                  service.direct
                    ? `${service.serviceUrl}/openapi.json`
                    : "https://mpp.t2000.ai/openapi.json"
                }
                target="_blank"
                rel="noopener noreferrer"
                className="no-underline transition-colors"
                style={{ color: "var(--fg-muted)" }}
              >
                OpenAPI ↗
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CatalogEndpointRow({
  endpoint,
  service,
}: {
  endpoint: Service["endpoints"][number];
  service: Service;
}) {
  const baseUrl = service.serviceUrl;
  const url = `${baseUrl}${endpoint.path}`;
  const sampleBody = sampleBodyFor(service.name, endpoint.path);

  const payloads = {
    t2: `t2 pay ${url} \\
  --data '${sampleBody}'`,
    prompt: `Use the t2000 MCP to call ${endpoint.method} ${endpoint.path} on ${service.name} (${baseUrl}). Body: ${sampleBody}`,
    curl: `curl -X ${endpoint.method} ${url} \\
  -H "Content-Type: application/json" \\
  -d '${sampleBody}'`,
  };

  return (
    <div className="mpp-ep-row">
      <span />
      <span
        style={{
          color: "var(--t2k-accent)",
          fontWeight: 600,
          letterSpacing: "0.04em",
        }}
      >
        {endpoint.method}
      </span>
      <div className="min-w-0">
        <div
          className="truncate"
          style={{ color: "var(--fg)" }}
        >
          {endpoint.path}
        </div>
        <div
          style={{
            color: "var(--fg-muted)",
            fontSize: 11,
            marginTop: 2,
            letterSpacing: 0,
            fontFamily: "var(--font-sans)",
          }}
        >
          {endpoint.description}
        </div>
      </div>
      <span
        className="text-right"
        style={{
          color: "var(--fg-muted)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {endpoint.price === "dynamic"
          ? "dynamic"
          : `from $${parseFloat(endpoint.price).toFixed(2)}`}
      </span>

      <div className="flex justify-end gap-1">
        <CopyChip label="t2" payload={payloads.t2} />
        <CopyChip label="prompt" payload={payloads.prompt} />
        <CopyChip label="curl" payload={payloads.curl} muted />
      </div>
    </div>
  );
}

function DirectBadge() {
  return (
    <span
      className="font-mono uppercase"
      style={{
        fontSize: 9.5,
        letterSpacing: "0.10em",
        color: "var(--t2k-accent)",
        border: "1px solid var(--t2k-accent)",
        borderRadius: 4,
        padding: "2px 6px",
        opacity: 0.9,
        whiteSpace: "nowrap",
      }}
      title="Direct seller — payment settles straight to the seller's wallet"
    >
      direct
    </span>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      style={{
        transition: "transform var(--dur-fast) var(--ease-out)",
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        color: "var(--fg-subtle)",
      }}
    >
      <path
        d="M4 2 L8 6 L4 10"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CatalogEmpty() {
  return (
    <div
      className="rounded-lg border border-dashed text-center"
      style={{
        padding: "60px 24px",
        borderColor: "var(--ds-gray-alpha-400)",
        marginTop: 16,
      }}
    >
      <div
        className="font-medium"
        style={{ fontSize: 15, color: "var(--fg)", marginBottom: 4 }}
      >
        No services match.
      </div>
      <div style={{ fontSize: 13, color: "var(--fg-muted)" }}>
        Try a different category or search term.
      </div>
    </div>
  );
}
