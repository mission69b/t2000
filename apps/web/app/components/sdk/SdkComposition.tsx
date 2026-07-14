interface CompositionStep {
  num: string;
  chain: string;
  title: string;
  desc: string;
  terminal?: boolean;
}

// The design's composed flow: send · swap · pay are plain sequential calls —
// top up, pay for intelligence, forward the payout. No batcher, no DeFi.
const STEPS: CompositionStep[] = [
  {
    num: "01",
    chain: "CETUS",
    title: "Swap to USDC",
    desc: "Top up stablecoins from SUI.",
  },
  {
    num: "02",
    chain: "PAYMENTS",
    title: "Pay an API",
    desc: "Per-call USDC over x402. No key.",
  },
  {
    num: "03",
    chain: "WALLET",
    title: "Send",
    desc: "$20 to sam.sui. Gasless.",
    terminal: true,
  },
];

export function SdkComposition() {
  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header className="mb-12 max-w-[720px]">
          <span className="t2k-eyebrow">{"// COMPOSE"}</span>
          <h2 className="t2k-section-title mt-[22px]">
            Chain the calls
            <br />
            <span style={{ color: "var(--fg-muted)" }}>into an agent loop.</span>
          </h2>
          <p className="t2k-section-sub">
            Swap to top up, pay for intelligence, send the payout — plain
            sequential code, no framework.
          </p>
        </header>

        <div className="grid items-stretch gap-7 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="t2k-card flex flex-col overflow-hidden">
            <header
              className="flex items-center gap-2 border-b px-4 py-3"
              style={{
                borderBottomColor: "var(--border)",
                background: "var(--bg-elevated)",
              }}
            >
              <span
                className="font-mono text-[11.5px]"
                style={{ color: "var(--fg)", letterSpacing: "0.01em" }}
              >
                agent-loop.ts
              </span>
              <span className="flex-1" />
              <span
                className="t2k-mono-tag"
                style={{ fontSize: 9.5, padding: "2px 7px" }}
              >
                SWAP → PAY → SEND
              </span>
            </header>
            <pre
              className="m-0 flex-1 whitespace-pre-wrap font-mono text-[12.5px] leading-[1.75]"
              style={{
                padding: "20px 18px",
                color: "var(--fg)",
                background: "var(--ds-background-200)",
              }}
            >
              <span style={{ color: "var(--fg-subtle)", fontStyle: "italic" }}>
                {"// 1 · top up USDC from SUI\n"}
              </span>
              <span style={{ color: "var(--ds-blue-700)" }}>await</span>
              {" t."}
              <span style={{ color: "var(--ds-teal-700)" }}>swap</span>
              {"({ from: "}
              <span style={{ color: "var(--t2k-success)" }}>{"'SUI'"}</span>
              {", to: "}
              <span style={{ color: "var(--t2k-success)" }}>{"'USDC'"}</span>
              {", amount: "}
              <span style={{ color: "var(--ds-amber-700)" }}>5</span>
              {" });\n\n"}
              <span style={{ color: "var(--fg-subtle)", fontStyle: "italic" }}>
                {"// 2 · pay any API, gasless\n"}
              </span>
              <span style={{ color: "var(--ds-blue-700)" }}>const</span>
              {" r = "}
              <span style={{ color: "var(--ds-blue-700)" }}>await</span>
              {" t."}
              <span style={{ color: "var(--ds-teal-700)" }}>pay</span>
              {"({\n  url: "}
              <span style={{ color: "var(--t2k-success)" }}>
                {"'mpp.t2000.ai/openai/…'"}
              </span>
              {",\n  body,\n  maxPrice: "}
              <span style={{ color: "var(--ds-amber-700)" }}>0.10</span>
              {",\n});\n\n"}
              <span style={{ color: "var(--fg-subtle)", fontStyle: "italic" }}>
                {"// 3 · forward the payout\n"}
              </span>
              <span style={{ color: "var(--ds-blue-700)" }}>await</span>
              {" t."}
              <span style={{ color: "var(--ds-teal-700)" }}>send</span>
              {"({ to: "}
              <span style={{ color: "var(--t2k-success)" }}>{"'sam.sui'"}</span>
              {", amount: "}
              <span style={{ color: "var(--ds-amber-700)" }}>20</span>
              {", asset: "}
              <span style={{ color: "var(--t2k-success)" }}>{"'USDC'"}</span>
              {" });"}
            </pre>
          </div>

          <div className="flex flex-col gap-3">
            {STEPS.map((s) => (
              <StepCard key={s.num} step={s} />
            ))}

            <div
              className="mt-auto flex items-center justify-between border-t border-dashed font-mono text-[12px]"
              style={{
                padding: "14px 16px",
                borderTopColor: "var(--border)",
                color: "var(--fg-muted)",
              }}
            >
              <span>3 calls · gasless where it counts</span>
              <span style={{ color: "var(--t2k-success)" }}>✓ composed</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StepCard({ step }: { step: CompositionStep }) {
  return (
    <div
      className="relative flex items-start gap-3.5 rounded-lg border"
      style={{
        padding: "14px 16px",
        borderColor: "var(--border)",
        background: "var(--bg-elevated)",
      }}
    >
      <span
        className="mt-0.5 font-mono text-[11px]"
        style={{
          color: step.terminal ? "var(--t2k-accent)" : "var(--fg-subtle)",
          letterSpacing: "0.06em",
          minWidth: 22,
        }}
      >
        {step.num}
      </span>

      <div className="flex-1">
        <div className="mb-0.5 flex items-center gap-2">
          <span
            className="text-[14px] font-semibold"
            style={{ letterSpacing: "-0.014em", color: "var(--fg)" }}
          >
            {step.title}
          </span>
          <span
            className="rounded-[3px] border font-mono"
            style={{
              fontSize: 9.5,
              color: "var(--fg-subtle)",
              letterSpacing: "0.10em",
              padding: "2px 6px",
              borderColor: "var(--border)",
            }}
          >
            {step.chain}
          </span>
        </div>
        <p
          className="m-0 text-[12.5px] leading-[1.5]"
          style={{ color: "var(--fg-muted)" }}
        >
          {step.desc}
        </p>
      </div>
    </div>
  );
}
