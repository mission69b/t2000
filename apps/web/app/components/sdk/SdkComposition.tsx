interface CompositionStep {
  num: string;
  chain: string;
  title: string;
  desc: string;
  terminal?: boolean;
}

const STEPS: CompositionStep[] = [
  {
    num: "01",
    chain: "NAVI",
    title: "Claim rewards",
    desc: "All pending rewards, harvested.",
  },
  {
    num: "02",
    chain: "CETUS",
    title: "Swap to USDC",
    desc: "Best price across pools.",
  },
  {
    num: "03",
    chain: "NAVI",
    title: "Save",
    desc: "Merged USDC back into savings.",
  },
  {
    num: "04",
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
          <span className="t2k-eyebrow">{"// PAYMENT INTENTS"}</span>
          <h2 className="t2k-section-title mt-[22px]">
            Many steps.
            <br />
            <span style={{ color: "var(--fg-muted)" }}>One transaction.</span>
          </h2>
          <p className="t2k-section-sub">
            Claim, swap, save, send. Bundled. Atomic. All in, all out.
          </p>
        </header>

        <div className="grid items-stretch gap-7 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="t2k-card flex flex-col overflow-hidden">
            <header
              className="flex items-center gap-2 border-b px-4 py-3"
              style={{
                borderBottomColor: "var(--ds-gray-alpha-300)",
                background: "var(--ds-gray-100)",
              }}
            >
              <span
                className="font-mono text-[11.5px]"
                style={{
                  color: "var(--fg)",
                  letterSpacing: "0.01em",
                }}
              >
                compound.ts
              </span>
              <span className="flex-1" />
              <span
                className="t2k-mono-tag"
                style={{ fontSize: 9.5, padding: "2px 7px" }}
              >
                1 INTENT · 1 SIGNATURE
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
              <span style={{ color: "var(--ds-blue-700)" }}>const</span>
              {" intent = "}
              <span style={{ color: "var(--ds-blue-700)" }}>await</span>
              {" t."}
              <span style={{ color: "var(--ds-teal-700)" }}>intent</span>
              {"({\n  steps: [\n    { "}
              <span style={{ color: "var(--fg-muted)" }}>type</span>
              {": "}
              <span style={{ color: "var(--t2k-success)" }}>{"'claim'"}</span>
              {",  protocol: "}
              <span style={{ color: "var(--t2k-success)" }}>{"'navi'"}</span>
              {" },\n    { "}
              <span style={{ color: "var(--fg-muted)" }}>type</span>
              {": "}
              <span style={{ color: "var(--t2k-success)" }}>{"'swap'"}</span>
              {",   from: "}
              <span style={{ color: "var(--t2k-success)" }}>{"'*'"}</span>
              {", to: "}
              <span style={{ color: "var(--t2k-success)" }}>{"'USDC'"}</span>
              {" },\n    { "}
              <span style={{ color: "var(--fg-muted)" }}>type</span>
              {": "}
              <span style={{ color: "var(--t2k-success)" }}>{"'save'"}</span>
              {",   protocol: "}
              <span style={{ color: "var(--t2k-success)" }}>{"'navi'"}</span>
              {", asset: "}
              <span style={{ color: "var(--t2k-success)" }}>{"'USDC'"}</span>
              {" },\n    { "}
              <span style={{ color: "var(--fg-muted)" }}>type</span>
              {": "}
              <span style={{ color: "var(--t2k-success)" }}>{"'send'"}</span>
              {",   to: "}
              <span style={{ color: "var(--t2k-success)" }}>{"'sam.sui'"}</span>
              {", amount: "}
              <span style={{ color: "var(--ds-amber-700)" }}>20</span>
              {", asset: "}
              <span style={{ color: "var(--t2k-success)" }}>{"'USDC'"}</span>
              {" },\n  ],\n});\n\n"}
              <span
                style={{
                  color: "var(--fg-subtle)",
                  fontStyle: "italic",
                }}
              >
                {"// preview the bundled tx before signing\n"}
              </span>
              {"console."}
              <span style={{ color: "var(--ds-teal-700)" }}>log</span>
              {"(intent.preview);\n\n"}
              <span style={{ color: "var(--ds-blue-700)" }}>const</span>
              {" tx = "}
              <span style={{ color: "var(--ds-blue-700)" }}>await</span>
              {" intent."}
              <span style={{ color: "var(--ds-teal-700)" }}>execute</span>
              {"();\n"}
              <span
                style={{
                  color: "var(--fg-subtle)",
                  fontStyle: "italic",
                }}
              >
                {"// tx.fee = ~$0.05 · ~500ms"}
              </span>
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
                borderTopColor: "var(--ds-gray-alpha-300)",
                color: "var(--fg-muted)",
              }}
            >
              <span>1 tap · 1 fee · ~500ms</span>
              <span style={{ color: "var(--t2k-success)" }}>✓ atomic</span>
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
        borderColor: "var(--ds-gray-alpha-300)",
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
            style={{
              letterSpacing: "-0.014em",
              color: "var(--fg)",
            }}
          >
            {step.title}
          </span>
          <span
            className="rounded font-mono text-[9.5px]"
            style={{
              color: "var(--fg-subtle)",
              letterSpacing: "0.10em",
              padding: "2px 6px",
              border: "1px solid var(--ds-gray-alpha-300)",
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
