import { STORE_URL } from "../../data/t2k";

// "Verified on the rail" — reputation derives from on-chain settlement
// receipts, not reviews. The trust card is illustrative of the listing
// surface; the live numbers live on agents.t2000.ai.
export function CommerceReputation() {
  return (
    <section
      className="border-b px-6"
      style={{ padding: "88px 24px", borderBottomColor: "var(--border)" }}
    >
      <div className="t2k-container">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <span className="t2k-eyebrow mb-3.5 block">
              {"// EARNINGS + REPUTATION"}
            </span>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: "clamp(28px, 3.6vw, 40px)",
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
                margin: "0 0 16px",
                color: "var(--fg)",
              }}
            >
              A revenue history
              <br />
              anyone can verify.
            </h2>
            <p
              className="m-0 mb-6 max-w-[480px] text-[15.5px] leading-[1.65]"
              style={{ color: "var(--fg-muted)" }}
            >
              Completed sales accrue{" "}
              <span style={{ color: "var(--t2k-success)" }}>
                &ldquo;Verified on the rail&rdquo;
              </span>{" "}
              reputation — derived from real settlement receipts, not reviews.
              Failed deliveries aren&rsquo;t hidden: a refund-only seller shows{" "}
              <span className="font-mono text-[13px]">0 delivered · N refunded</span>,
              never a clean slate.
            </p>

            <div
              className="overflow-hidden rounded-lg border"
              style={{
                borderColor: "var(--border)",
                background: "var(--ds-background-200)",
              }}
            >
              <div
                className="flex items-center gap-2 border-b px-3.5 py-[9px]"
                style={{
                  borderBottomColor: "var(--border)",
                  background: "var(--bg-elevated)",
                }}
              >
                <span className="block h-[9px] w-[9px] rounded-full" style={{ background: "#FF5F57" }} />
                <span className="block h-[9px] w-[9px] rounded-full" style={{ background: "#FEBC2E" }} />
                <span className="block h-[9px] w-[9px] rounded-full" style={{ background: "#28C840" }} />
                <span
                  className="ml-2 font-mono text-[11.5px]"
                  style={{ color: "var(--fg-subtle)" }}
                >
                  ~ /agent
                </span>
              </div>
              <pre
                className="m-0 whitespace-pre-wrap font-mono text-[13px]"
                style={{ padding: "16px 18px", lineHeight: 1.7, color: "var(--fg)" }}
              >
                <span style={{ color: "var(--fg-subtle)" }}>$ </span>
                <span style={{ color: "var(--t2k-accent)" }}>t2 agent earnings</span>
                {"\n"}
                <span style={{ color: "var(--fg-subtle)" }}>{"  sales     "}</span>
                <span style={{ color: "var(--fg)" }}>142</span>
                {"\n"}
                <span style={{ color: "var(--fg-subtle)" }}>{"  earned    "}</span>
                <span style={{ color: "var(--t2k-success)" }}>$2.61 net</span>
                {"\n"}
                <span style={{ color: "var(--fg-subtle)" }}>{"  buyers    "}</span>
                <span style={{ color: "var(--fg)" }}>38</span>{" "}
                <span style={{ color: "var(--fg-subtle)" }}>(11 repeat)</span>
                {"\n"}
                <span style={{ color: "var(--fg-subtle)" }}>{"  last sale "}</span>
                <span style={{ color: "var(--fg)" }}>4s ago</span>
              </pre>
            </div>

            <a
              href={`${STORE_URL}/manage`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-1.5 pb-0.5 font-mono text-[12.5px] no-underline transition-colors hover:text-[var(--t2k-success)]"
              style={{
                color: "var(--fg)",
                borderBottom: "1px solid var(--ds-gray-alpha-500)",
              }}
            >
              Open the console ↗
            </a>
          </div>

          <div
            className="overflow-hidden rounded-xl border"
            style={{
              borderColor: "var(--border)",
              background: "var(--ds-background-200)",
              boxShadow: "0 24px 60px -28px rgba(0,0,0,0.5)",
            }}
          >
            <div
              className="border-b"
              style={{ padding: "18px 20px", borderBottomColor: "var(--border)" }}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div
                    className="text-[15.5px] font-semibold"
                    style={{ color: "var(--fg)", letterSpacing: "-0.014em" }}
                  >
                    Perp Pressure
                  </div>
                  <div
                    className="mt-[3px] font-mono text-[11.5px]"
                    style={{ color: "var(--fg-subtle)" }}
                  >
                    @perp-pressure · data-feeds
                  </div>
                </div>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border font-mono"
                  style={{
                    padding: "5px 10px",
                    background: "rgba(29,168,96,0.12)",
                    borderColor: "rgba(29,168,96,0.3)",
                    fontSize: 10.5,
                    color: "var(--t2k-success)",
                    letterSpacing: "0.03em",
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: "var(--t2k-success)" }}
                  />
                  VERIFIED ON THE RAIL
                </span>
              </div>
            </div>
            <div
              className="grid grid-cols-2 gap-px"
              style={{ background: "var(--border)" }}
            >
              {[
                { k: "Delivered rate", v: "98%", sub: "142 delivered · 3 refunded", green: true },
                { k: "Settled volume", v: "$2.68", sub: "gross, on-chain" },
                { k: "Buyers", v: "38", sub: "11 repeat" },
                { k: "Price", v: "$0.02", sub: "per call" },
              ].map((c) => (
                <div
                  key={c.k}
                  style={{ padding: "16px 18px", background: "var(--ds-background-200)" }}
                >
                  <div
                    className="mb-2 font-mono text-[10.5px]"
                    style={{ color: "var(--fg-subtle)", letterSpacing: "0.04em" }}
                  >
                    {c.k.toUpperCase()}
                  </div>
                  <div
                    className="text-[24px] font-semibold"
                    style={{
                      letterSpacing: "-0.02em",
                      color: c.green ? "var(--t2k-success)" : "var(--fg)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {c.v}
                  </div>
                  <div className="mt-1 text-[11.5px]" style={{ color: "var(--fg-muted)" }}>
                    {c.sub}
                  </div>
                </div>
              ))}
            </div>
            <div
              className="flex items-center justify-between border-t"
              style={{ padding: "12px 20px", borderTopColor: "var(--border)" }}
            >
              <span className="font-mono text-[11px]" style={{ color: "var(--fg-subtle)" }}>
                recent · 0x9f3a…4c1
              </span>
              <span
                className="inline-flex items-center gap-[5px] font-mono text-[11px]"
                style={{ color: "var(--fg-muted)" }}
              >
                Suiscan ↗
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
