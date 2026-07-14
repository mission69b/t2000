import { DEVELOPERS_URL, GITHUB_URL } from "../../data/t2k";
import { CopyButton } from "../ui/CopyButton";

const SNIPPET = `import { T2000 } from '@t2000/sdk';

const t = new T2000();

await t.send({ to: 'alice.sui', amount: 10, asset: 'USDC' });
await t.pay({ url: 'mpp.t2000.ai/openai/v1/chat', body });
await t.swap({ from: 'SUI', to: 'USDC', amount: 50 });`;

export function SdkCloser() {
  return (
    <section
      className="relative overflow-hidden border-t"
      style={{
        padding: "112px 24px",
        borderTopColor: "var(--ds-gray-alpha-300)",
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          left: "50%",
          top: "50%",
          transform: "translate(-50%,-50%)",
          width: 800,
          height: 360,
          background:
            "radial-gradient(50% 50% at 50% 50%, rgba(0,114,245,0.10) 0%, transparent 70%)",
          filter: "blur(24px)",
        }}
      />

      <div className="relative mx-auto max-w-[900px] text-center">
        <span
          className="t2k-eyebrow mb-[18px] block"
        >
          {"// GET STARTED"}
        </span>
        <h2
          className="t2k-display"
          style={{
            fontSize: "clamp(40px, 5.6vw, 68px)",
            color: "var(--fg)",
          }}
        >
          Install it.
          <br />
          <span style={{ color: "var(--t2k-accent)" }}>Move money.</span>
        </h2>
        <p
          className="mx-auto mt-[22px] max-w-[540px] text-[17px] leading-[1.5]"
          style={{
            color: "var(--fg-muted)",
            letterSpacing: "-0.011em",
          }}
        >
          One npm install — your agent sends, pays, and swaps in the next ten
          lines.
        </p>

        <div
          className="mx-auto mt-10 max-w-[680px] overflow-hidden rounded-lg border text-left"
          style={{
            background: "var(--ds-background-200)",
            borderColor: "var(--ds-gray-alpha-400)",
          }}
        >
          <header
            className="flex items-center gap-2.5 border-b px-3.5 py-2.5"
            style={{
              borderBottomColor: "var(--ds-gray-alpha-300)",
              background: "var(--ds-gray-100)",
            }}
          >
            <span
              className="font-mono text-[11.5px]"
              style={{ color: "var(--fg)" }}
            >
              quickstart.ts
            </span>
            <span className="flex-1" />
            <CopyButton payload={SNIPPET} variant="outlined" />
          </header>
          <pre
            className="m-0 overflow-auto whitespace-pre font-mono text-[12.5px] leading-[1.85]"
            style={{
              padding: "18px 18px",
              color: "var(--fg)",
            }}
          >
            <span style={{ color: "var(--ds-blue-700)" }}>import</span>
            {" { "}
            <span style={{ color: "var(--ds-teal-700)" }}>T2000</span>
            {" } "}
            <span style={{ color: "var(--ds-blue-700)" }}>from</span>
            {" "}
            <span style={{ color: "var(--t2k-success)" }}>{"'@t2000/sdk'"}</span>
            {";\n\n"}
            <span style={{ color: "var(--ds-blue-700)" }}>const</span>
            {" t = "}
            <span style={{ color: "var(--ds-blue-700)" }}>new</span>
            {" "}
            <span style={{ color: "var(--ds-teal-700)" }}>T2000</span>
            {"();\n\n"}
            <span style={{ color: "var(--ds-blue-700)" }}>await</span>
            {" t."}
            <span style={{ color: "var(--ds-teal-700)" }}>send</span>
            {"({ to: "}
            <span style={{ color: "var(--t2k-success)" }}>{"'alice.sui'"}</span>
            {", amount: "}
            <span style={{ color: "var(--ds-amber-700)" }}>10</span>
            {", asset: "}
            <span style={{ color: "var(--t2k-success)" }}>{"'USDC'"}</span>
            {" });\n"}
            <span style={{ color: "var(--ds-blue-700)" }}>await</span>
            {" t."}
            <span style={{ color: "var(--ds-teal-700)" }}>pay</span>
            {"({ url: "}
            <span style={{ color: "var(--t2k-success)" }}>
              {"'mpp.t2000.ai/openai/v1/chat'"}
            </span>
            {", body });\n"}
            <span style={{ color: "var(--ds-blue-700)" }}>await</span>
            {" t."}
            <span style={{ color: "var(--ds-teal-700)" }}>swap</span>
            {"({ from: "}
            <span style={{ color: "var(--t2k-success)" }}>{"'SUI'"}</span>
            {", to: "}
            <span style={{ color: "var(--t2k-success)" }}>{"'USDC'"}</span>
            {", amount: "}
            <span style={{ color: "var(--ds-amber-700)" }}>50</span>
            {" });"}
          </pre>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-2.5">
          <a
            href={`${DEVELOPERS_URL}/agent-sdk`}
            target="_blank"
            rel="noopener noreferrer"
            className="t2k-btn t2k-btn--blue t2k-btn--lg"
          >
            Read the docs&nbsp;↗
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="t2k-btn t2k-btn--ghost t2k-btn--lg"
          >
            View on GitHub&nbsp;↗
          </a>
        </div>
      </div>
    </section>
  );
}
