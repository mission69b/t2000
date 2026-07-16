import Link from "next/link";
import type { Service } from "@/lib/services";
import { categoryLabel } from "@/lib/catalog";
import { formatUsd } from "@/lib/format";

export function ServiceDetail({
  service,
  related,
}: {
  service: Service;
  related: Service[];
}) {
  const primary = service.categories[0] ?? "utility";

  const cheapest = (() => {
    const ns = service.endpoints
      .map((e) => parseFloat(e.price))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (ns.length === 0) return "dynamic";
    return formatUsd(Math.min(...ns));
  })();

  const exampleEndpoint = service.endpoints[0];

  return (
    <>
      <section
        style={{
          padding: "48px 0 56px",
          borderBottom: "1px solid var(--ds-gray-alpha-300)",
        }}
      >
        <div className="t2k-container">
          <div
            className="mb-6 flex items-center gap-1.5 font-mono"
            style={{
              fontSize: 13,
              color: "var(--fg-muted)",
              letterSpacing: "0.01em",
            }}
          >
            <Link
              href="/services"
              className="no-underline transition-colors"
              style={{ color: "var(--fg-muted)" }}
            >
              Services
            </Link>
            <span className="opacity-50">/</span>
            <span style={{ color: "var(--fg)" }}>{service.name}</span>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-8">
            <div>
              <span className="t2k-eyebrow">
                // {categoryLabel(primary).toUpperCase()}
                {service.direct ? " · DIRECT SELLER" : ""}
              </span>
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  fontSize: "clamp(40px, 5.4vw, 64px)",
                  lineHeight: 1.0,
                  letterSpacing: "-0.035em",
                  margin: "12px 0 0",
                  color: "var(--fg)",
                }}
              >
                {service.name}
              </h1>
              <p
                className="max-w-[560px]"
                style={{
                  marginTop: 16,
                  fontSize: 17,
                  lineHeight: 1.55,
                  color: "var(--fg-muted)",
                  letterSpacing: "-0.011em",
                }}
              >
                {service.description}
              </p>
              {service.direct && (
                <p
                  className="max-w-[560px] font-mono"
                  style={{
                    marginTop: 12,
                    fontSize: 12,
                    lineHeight: 1.6,
                    color: "var(--fg-subtle)",
                  }}
                >
                  Direct seller: these endpoints live at the seller's origin and
                  payment settles straight to their wallet — t2000 is the
                  payment rail, not the operator. Delivery is the seller's
                  responsibility.
                </p>
              )}
            </div>

            <div
              className="grid gap-9 rounded-lg border"
              style={{
                gridTemplateColumns: "auto auto auto",
                padding: "16px 24px",
                borderColor: "var(--ds-gray-alpha-400)",
                background: "var(--ds-gray-alpha-100)",
              }}
            >
              <Stat label="Endpoints" value={service.endpoints.length.toString()} />
              <Stat label="From" value={cheapest} />
              <Stat label="Settle" value="~400ms" />
            </div>
          </div>
        </div>
      </section>

      <section className="t2k-section">
        <div className="t2k-container">
          <header style={{ marginBottom: 32 }}>
            <span className="t2k-eyebrow">// ENDPOINTS</span>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: 32,
                lineHeight: 1.1,
                letterSpacing: "-0.025em",
                margin: "12px 0 0",
                color: "var(--fg)",
              }}
            >
              All routes, one base URL.
            </h2>
            <p
              className="mt-3 font-mono"
              style={{
                fontSize: 13,
                color: "var(--fg-muted)",
              }}
            >
              <span style={{ color: "var(--fg-subtle)" }}>base </span>
              <span style={{ color: "var(--fg)" }}>{service.serviceUrl}</span>
            </p>
          </header>

          <div className="t2k-card overflow-hidden">
            <div
              className="grid gap-4 px-5 py-2.5 font-mono uppercase"
              style={{
                gridTemplateColumns: "70px 1fr 100px",
                borderBottom: "1px solid var(--ds-gray-alpha-300)",
                background: "var(--ds-gray-100)",
                fontSize: 10.5,
                color: "var(--fg-subtle)",
                letterSpacing: "0.08em",
              }}
            >
              <span>Method</span>
              <span>Path</span>
              <span className="text-right">From</span>
            </div>
            {service.endpoints.map((e) => (
              <div
                key={e.path}
                className="grid items-center gap-4 px-5 py-3.5"
                style={{
                  gridTemplateColumns: "70px 1fr 100px",
                  borderBottom: "1px solid var(--ds-gray-alpha-300)",
                }}
              >
                <span
                  className="font-mono font-semibold"
                  style={{
                    fontSize: 11,
                    color: "var(--t2k-accent)",
                    letterSpacing: "0.06em",
                  }}
                >
                  {e.method}
                </span>
                <div>
                  <div
                    className="font-mono"
                    style={{ fontSize: 13, color: "var(--fg)" }}
                  >
                    {e.path}
                  </div>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: "var(--fg-muted)",
                      marginTop: 2,
                      letterSpacing: "-0.011em",
                    }}
                  >
                    {e.description}
                  </div>
                </div>
                <span
                  className="t2k-tabular text-right font-mono"
                  style={{ fontSize: 12, color: "var(--fg-muted)" }}
                >
                  {e.price === "dynamic"
                    ? "dynamic"
                    : `$${parseFloat(e.price).toFixed(2)}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {exampleEndpoint && (
        <section
          className="t2k-section"
          style={{ borderTop: "1px solid var(--ds-gray-alpha-300)" }}
        >
          <div className="t2k-container">
            <header className="max-w-[720px]" style={{ marginBottom: 32 }}>
              <span className="t2k-eyebrow">// EXAMPLE</span>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  fontSize: 32,
                  lineHeight: 1.1,
                  letterSpacing: "-0.025em",
                  margin: "12px 0 0",
                  color: "var(--fg)",
                }}
              >
                Two requests. Gasless.
              </h2>
              <p
                className="max-w-[560px]"
                style={{
                  marginTop: 14,
                  fontSize: 15,
                  lineHeight: 1.55,
                  color: "var(--fg-muted)",
                  letterSpacing: "-0.011em",
                }}
              >
                First call returns a 402 with a payment quote. Pay it. Retry with the Payment header. The gateway forwards the response.
              </p>
            </header>

            <div className="grid gap-3 md:grid-cols-2">
              <CodeSnippet
                title="curl"
                code={`$ curl -X POST \\
    ${service.serviceUrl}${exampleEndpoint.path} \\
    -H "Content-Type: application/json" \\
    -d '{ "model": "…", "input": "…" }'

# → 402 Payment Required
# → Payment header { quote, recipient, expiry }

$ retry with Payment header
# → 200 OK · response forwarded`}
              />
              <CodeSnippet
                title="@t2000/sdk"
                code={`const r = await t.pay({
  url: '${service.serviceUrl}${exampleEndpoint.path}',
  body: { /* ${service.name} payload */ },
});

// → r.json() · 200 OK · gasless · ~400ms`}
              />
            </div>
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section
          className="t2k-section"
          style={{ borderTop: "1px solid var(--ds-gray-alpha-300)" }}
        >
          <div className="t2k-container">
            <header style={{ marginBottom: 28 }}>
              <span className="t2k-eyebrow">// SIMILAR</span>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  fontSize: 28,
                  lineHeight: 1.1,
                  letterSpacing: "-0.025em",
                  margin: "12px 0 0",
                  color: "var(--fg)",
                }}
              >
                Other {categoryLabel(primary)} services.
              </h2>
            </header>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((r) => {
                const min = (() => {
                  const ns = r.endpoints
                    .map((e) => parseFloat(e.price))
                    .filter((n) => Number.isFinite(n) && n > 0);
                  if (ns.length === 0) return "dynamic";
                  return formatUsd(Math.min(...ns));
                })();
                return (
                  <Link
                    key={r.id}
                    href={`/services/${r.id}`}
                    className="t2k-card t2k-card-hover flex flex-col gap-2 no-underline"
                    style={{ padding: "18px 18px", color: "var(--fg)" }}
                  >
                    <span
                      className="font-semibold tracking-[-0.022em]"
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: 16,
                      }}
                    >
                      {r.name}
                    </span>
                    <div
                      className="flex justify-between font-mono"
                      style={{ fontSize: 11, color: "var(--fg-muted)" }}
                    >
                      <span>from {min}</span>
                      <span>{r.endpoints.length} endpoints</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="t2k-eyebrow" style={{ fontSize: 10 }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: 22,
          marginTop: 4,
          letterSpacing: "-0.022em",
          color: "var(--fg)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function CodeSnippet({ title, code }: { title: string; code: string }) {
  return (
    <div
      className="overflow-hidden rounded-lg border"
      style={{
        background: "var(--ds-background-200)",
        borderColor: "var(--ds-gray-alpha-400)",
      }}
    >
      <div
        className="font-mono"
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--ds-gray-alpha-300)",
          background: "var(--ds-gray-100)",
          fontSize: 11.5,
          color: "var(--fg)",
        }}
      >
        {title}
      </div>
      <pre
        className="m-0 whitespace-pre-wrap font-mono"
        style={{
          padding: "16px 18px",
          fontSize: 12,
          lineHeight: 1.75,
          color: "var(--fg)",
        }}
      >
        {code}
      </pre>
    </div>
  );
}
