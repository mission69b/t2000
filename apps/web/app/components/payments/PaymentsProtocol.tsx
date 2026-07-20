import type { ReactNode } from "react";

interface Step {
  n: string;
  title: string;
  body: ReactNode;
  note: string;
  accent: "blue" | "amber" | "success";
}

const STEPS: Step[] = [
  {
    n: "01",
    title: "Request",
    accent: "blue",
    body: (
      <>
        <span style={{ color: "var(--fg-subtle)" }}>POST </span>
        <span>/openai/v1/chat/completions</span>
      </>
    ),
    note: "Plain HTTP POST. No API key required.",
  },
  {
    n: "02",
    title: "402 Challenge",
    accent: "amber",
    body: (
      <>
        <span style={{ color: "var(--ds-amber-700)" }}>HTTP 402</span>
        {"\n"}
        <span style={{ color: "var(--fg-subtle)" }}>
          {"{ price: "}
          <b style={{ color: "var(--fg)" }}>0.012</b>
          {",\n  recipient: "}
          <span style={{ color: "var(--fg)" }}>0x4f…a01</span>
          {",\n  expiry: 30s }"}
        </span>
      </>
    ),
    note: "Gateway prices the call. 30 seconds to settle.",
  },
  {
    n: "03",
    title: "Sign + Retry",
    accent: "blue",
    body: (
      <>
        <span>splitCoins → transfer</span>
        {"\n"}
        <span style={{ color: "var(--fg-subtle)" }}>↳ </span>
        <span>Payment: 0x7a3b…</span>
      </>
    ),
    note: "USDC sent gasless. Same request, retried with the Payment header.",
  },
  {
    n: "04",
    title: "200 OK",
    accent: "success",
    body: (
      <>
        <span style={{ color: "var(--t2k-success)" }}>200 OK</span>
        {"\n"}
        <span style={{ color: "var(--fg-subtle)" }}>
          {"{ choices: [...] }"}
        </span>
      </>
    ),
    note: "Upstream response, forwarded.",
  },
];

const SPEC = [
  { label: "PROTOCOL", value: "x402", sub: "on Sui" },
  { label: "TOKEN", value: "USDC", sub: "Sui mainnet" },
  { label: "SPONSORED PTB", value: "splitCoins → transferObjects", sub: "gas paid by the sponsor" },
  { label: "SETTLE", value: "~400ms", sub: "Sui finality" },
];

export function PaymentsProtocol() {
  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header className="mb-12 max-w-[720px]">
          <span className="t2k-eyebrow">{"// HOW IT WORKS · HTTP 402"}</span>
          <h2 className="t2k-section-title mt-[22px]">
            Four steps.{" "}
            <span style={{ color: "var(--fg-muted)" }}>Under two seconds.</span>
          </h2>
          <p className="t2k-section-sub">
            Send. Get priced. Pay. Get the response.
          </p>
        </header>

        <div className="grid grid-cols-1 items-stretch gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <FlowStep key={s.n} step={s} isActive={i === 2} />
          ))}
        </div>

        <div
          className="mt-8 grid grid-cols-2 overflow-hidden rounded-lg border lg:grid-cols-4"
          style={{
            borderColor: "var(--ds-gray-alpha-300)",
            background: "var(--ds-background-200)",
          }}
        >
          {SPEC.map((s, i) => (
            <div
              key={s.label}
              className="flex flex-col gap-1.5"
              style={{
                padding: "16px 18px",
                borderRight:
                  i < 3 ? "1px solid var(--ds-gray-alpha-300)" : "none",
              }}
            >
              <span className="t2k-eyebrow" style={{ fontSize: 10 }}>
                {s.label}
              </span>
              <span
                className="font-mono text-[13.5px]"
                style={{
                  color: "var(--fg)",
                  wordBreak: "break-all",
                }}
              >
                {s.value}
              </span>
              <span
                className="text-[11.5px] leading-[1.4]"
                style={{ color: "var(--fg-subtle)" }}
              >
                {s.sub}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FlowStep({ step, isActive }: { step: Step; isActive: boolean }) {
  const borderLeftColor =
    step.accent === "amber"
      ? "var(--ds-amber-700)"
      : step.accent === "success"
        ? "var(--t2k-success)"
        : "var(--t2k-accent)";

  return (
    <div
      className="t2k-card relative flex flex-col gap-3"
      style={{ padding: "18px 18px 16px" }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="font-mono text-[11px]"
          style={{
            color: isActive ? "var(--t2k-accent)" : "var(--fg-subtle)",
            letterSpacing: "0.06em",
          }}
        >
          {step.n}
        </span>
        <span
          className="block"
          style={{
            width: 1,
            height: 12,
            background: "var(--ds-gray-alpha-400)",
          }}
        />
        <span
          className="text-[15px] font-semibold tracking-tight"
        >
          {step.title}
        </span>
      </div>

      <pre
        className="m-0 whitespace-pre-wrap break-words rounded font-mono text-[11px] leading-[1.65]"
        style={{
          padding: "10px 12px",
          background: "var(--ds-background-200)",
          border: "1px solid var(--ds-gray-alpha-300)",
          borderLeft: `2px solid ${borderLeftColor}`,
          color: "var(--fg)",
          minHeight: 84,
        }}
      >
        {step.body}
      </pre>

      <p
        className="m-0 text-[12.5px] leading-[1.5]"
        style={{ color: "var(--fg-muted)" }}
      >
        {step.note}
      </p>
    </div>
  );
}
