interface PricingRow {
  pkg: string;
  name: string;
  line: string;
  gasless: string[];
  withGas: string;
}

const ROWS: PricingRow[] = [
  {
    pkg: "@t2000/cli",
    name: "Agent Wallet",
    line: "Free · MIT",
    gasless: ["USDC sends", "USDsui sends", "x402 API calls"],
    withGas: "Swaps (~0.05 SUI per tx)",
  },
  {
    pkg: "@suimpp/mpp",
    name: "Agent Payments",
    line: "Free to use",
    gasless: ["Every paid request"],
    withGas: "Per-request fee to the upstream service",
  },
  {
    pkg: "@t2000/sdk",
    name: "Agent SDK",
    line: "Free · MIT",
    gasless: ["Same rails as Wallet"],
    withGas: "Same gas as Wallet",
  },
  {
    pkg: "@t2000/id",
    name: "Agent ID",
    line: "Free · MIT",
    gasless: ["Register", "Handle", "Profile"],
    withGas: "Nothing — identity is fully sponsored",
  },
  {
    pkg: "api.t2000.ai",
    name: "Private Inference",
    line: "Usage-based",
    gasless: ["Pay-per-call in USDC"],
    withGas: "Per-token model cost · confidential TEE tier",
  },
];

const ROW_GRID =
  "grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1.5fr_1.5fr_150px] lg:gap-6 lg:items-start";

export function Pricing() {
  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header className="mb-10 grid items-end gap-10 lg:grid-cols-2 lg:gap-12">
          <div>
            <span className="t2k-eyebrow">{"// PRICING"}</span>
            <h2 className="t2k-section-title mt-[22px]" style={{ lineHeight: 1 }}>
              Free.
              <br />
              <span style={{ color: "var(--fg-muted)" }}>Mostly gasless.</span>
            </h2>
          </div>
          <div>
            <p
              className="m-0 max-w-[480px] text-[16px] leading-[1.6]"
              style={{
                color: "var(--fg-muted)",
                letterSpacing: "-0.011em",
              }}
            >
              MIT-licensed. Sends and API calls are{" "}
              <span style={{ color: "var(--fg)" }}>gasless</span> — only swaps
              touch gas.
            </p>
          </div>
        </header>

        <div className="t2k-card overflow-hidden">
          <div
            className={
              ROW_GRID +
              " hidden lg:grid font-mono text-[10.5px] uppercase border-b"
            }
            style={{
              padding: "12px 22px",
              borderBottomColor: "var(--ds-gray-alpha-300)",
              background: "var(--ds-gray-100)",
              color: "var(--fg-subtle)",
              letterSpacing: "0.08em",
            }}
          >
            <span>Product</span>
            <span>Gasless</span>
            <span>You pay gas for</span>
            <span className="text-right">Price</span>
          </div>

          {ROWS.map((r) => (
            <div
              key={r.pkg}
              className={ROW_GRID + " border-b last:border-b-0"}
              style={{
                padding: "18px 22px",
                borderBottomColor: "var(--ds-gray-alpha-300)",
              }}
            >
              <div>
                <div
                  className="text-[15px] font-semibold"
                  style={{ letterSpacing: "-0.018em", color: "var(--fg)" }}
                >
                  {r.name}
                </div>
                <div
                  className="mt-0.5 font-mono text-[11px]"
                  style={{ color: "var(--fg-subtle)" }}
                >
                  {r.pkg}
                </div>
              </div>
              <div
                className="text-[13.5px] leading-[1.55]"
                style={{
                  color: "var(--fg-muted)",
                  letterSpacing: "-0.011em",
                }}
              >
                {r.gasless.map((g, i) => (
                  <div key={i} className="flex items-baseline gap-2">
                    <span style={{ color: "var(--t2k-success)" }}>✓</span>
                    <span>{g}</span>
                  </div>
                ))}
              </div>
              <div
                className="text-[13.5px] leading-[1.55]"
                style={{
                  color: "var(--fg-muted)",
                  letterSpacing: "-0.011em",
                }}
              >
                {r.withGas}
              </div>
              <div
                className="font-mono text-[12.5px] lg:text-right"
                style={{
                  color: "var(--fg)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {r.line}
              </div>
            </div>
          ))}
        </div>

        <p
          className="mt-4 font-mono text-[12.5px]"
          style={{
            color: "var(--fg-subtle)",
            letterSpacing: "0.01em",
          }}
        >
          {"// Gasless = $0 network fee via Sui\u2019s "}
          <span style={{ color: "var(--fg-muted)" }}>
            Gasless Stablecoin Transfers
          </span>
          . Swaps need ~0.05 SUI for chain gas.
        </p>
      </div>
    </section>
  );
}
