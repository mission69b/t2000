import { CodeTokens, type CodeToken } from "./CodeTokens";

interface ExampleCardProps {
  num: string;
  tag: string;
  title: string;
  desc: string;
  code: CodeToken[];
  note: string;
}

const EXAMPLES: ExampleCardProps[] = [
  {
    num: "01",
    tag: "WALLET",
    title: "Send USDC",
    desc: "Gasless transfer to a SuiNS name.",
    code: [
      { p: "await", c: " t.send({\n" },
      { c: "  to: " },
      { s: "'alice.sui'" },
      { c: ",\n  amount: " },
      { n: "10" },
      { c: ",\n  asset: " },
      { s: "'USDC'" },
      { c: ",\n});" },
    ],
    note: "✓ Sent · gasless · 0.41s",
  },
  {
    num: "02",
    tag: "PAYMENTS",
    title: "Pay any API",
    desc: "Hit any x402 endpoint. No API key.",
    code: [
      { p: "const", c: " r = " },
      { p: "await", c: " t.pay({\n" },
      { c: "  url: " },
      { s: "'mpp.t2000.ai/openai/" },
      { c: "\n        " },
      { s: "v1/chat/completions'" },
      { c: ",\n  body,\n});" },
    ],
    note: "✓ Paid $0.02 · gasless · 200 OK",
  },
  {
    num: "03",
    tag: "CETUS",
    title: "Swap on Cetus",
    desc: "Best-price routing across pools.",
    code: [
      { p: "await", c: " t.swap({\n" },
      { c: "  from: " },
      { s: "'SUI'" },
      { c: ",\n  to: " },
      { s: "'USDC'" },
      { c: ",\n  amount: " },
      { n: "50" },
      { c: ",\n});" },
    ],
    note: "✓ Routed via Cetus · 200ms",
  },
  {
    num: "04",
    tag: "WALLET",
    title: "Check the balance",
    desc: "Every holding — stables first, USD-denominated.",
    code: [
      { p: "const", c: " b = " },
      { p: "await", c: " t.balance();\n" },
      { c: "b.stables.USDC;  " },
      { co: "// 547.2" },
    ],
    note: "✓ USDC 547.20 · USDsui 50.00",
  },
];

export function SdkExamples() {
  return (
    <section
      className="t2k-section border-t"
      style={{ borderTopColor: "var(--ds-gray-alpha-300)" }}
    >
      <div className="t2k-container">
        <header className="mb-12 max-w-[720px]">
          <span className="t2k-eyebrow">{"// EXAMPLES"}</span>
          <h2 className="t2k-section-title mt-[22px]">
            Stablecoins.
            <br />
            <span style={{ color: "var(--fg-muted)" }}>In code.</span>
          </h2>
          <p className="t2k-section-sub">
            Four primitives. One class. Every line below runs.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          {EXAMPLES.map((e) => (
            <ExampleCard key={e.num} {...e} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ExampleCard({ num, tag, title, desc, code, note }: ExampleCardProps) {
  return (
    <div className="t2k-card flex flex-col overflow-hidden">
      <header
        className="flex items-center justify-between border-b px-[18px] py-[14px]"
        style={{ borderBottomColor: "var(--ds-gray-alpha-300)" }}
      >
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-[11px]"
            style={{
              color: "var(--fg-subtle)",
              letterSpacing: "0.06em",
            }}
          >
            {num}
          </span>
          <span
            className="block"
            style={{
              width: 1,
              height: 12,
              background: "var(--ds-gray-alpha-400)",
            }}
          />
          <span className="text-[14px] font-medium tracking-tight">{title}</span>
        </div>
        <span className="t2k-eyebrow" style={{ fontSize: 10 }}>
          {tag}
        </span>
      </header>

      <div style={{ padding: "14px 18px 4px" }}>
        <p
          className="m-0 text-[13.5px] leading-[1.5]"
          style={{ color: "var(--fg-muted)" }}
        >
          {desc}
        </p>
      </div>

      <pre
        className="mt-3 overflow-hidden whitespace-pre font-mono text-[12.5px] leading-[1.75]"
        style={{
          margin: "12px 18px 0",
          padding: "14px 16px",
          background: "var(--ds-background-200)",
          border: "1px solid var(--ds-gray-alpha-300)",
          borderRadius: 6,
          color: "var(--fg)",
        }}
      >
        <CodeTokens tokens={code} />
      </pre>

      <div
        className="mt-auto font-mono text-[11.5px]"
        style={{
          padding: "12px 18px",
          color: "var(--t2k-success)",
          letterSpacing: "0.01em",
        }}
      >
        {note}
      </div>
    </div>
  );
}
