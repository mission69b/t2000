import { AUDRIC_URL, DEVELOPERS_URL } from "../../data/t2k";
import { CopyButton } from "../ui/CopyButton";

const SNIPPET = `import { AISDKEngine, T2000 } from '@t2000/engine';
import { anthropic } from '@ai-sdk/anthropic';

const engine = new AISDKEngine({
  wallet: new T2000(),
  model: anthropic('claude-sonnet-4'),
});

await engine.run('Compound my NAVI rewards.');`;

export function EngineCloser() {
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
          One config.
          <br />
          <span style={{ color: "var(--t2k-accent)" }}>Run the engine.</span>
        </h2>
        <p
          className="mx-auto mt-[22px] max-w-[540px] text-[17px] leading-[1.5]"
          style={{
            color: "var(--fg-muted)",
            letterSpacing: "-0.011em",
          }}
        >
          Plug a model. Plug a wallet. Ship.
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
              engine.ts
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
            <span style={{ color: "var(--ds-teal-700)" }}>AISDKEngine</span>
            {", "}
            <span style={{ color: "var(--ds-teal-700)" }}>T2000</span>
            {" } "}
            <span style={{ color: "var(--ds-blue-700)" }}>from</span>
            {" "}
            <span style={{ color: "var(--t2k-success)" }}>{"'@t2000/engine'"}</span>
            {";\n"}
            <span style={{ color: "var(--ds-blue-700)" }}>import</span>
            {" { anthropic } "}
            <span style={{ color: "var(--ds-blue-700)" }}>from</span>
            {" "}
            <span style={{ color: "var(--t2k-success)" }}>
              {"'@ai-sdk/anthropic'"}
            </span>
            {";\n\n"}
            <span style={{ color: "var(--ds-blue-700)" }}>const</span>
            {" engine = "}
            <span style={{ color: "var(--ds-blue-700)" }}>new</span>
            {" "}
            <span style={{ color: "var(--ds-teal-700)" }}>AISDKEngine</span>
            {"({\n  wallet: "}
            <span style={{ color: "var(--ds-blue-700)" }}>new</span>
            {" "}
            <span style={{ color: "var(--ds-teal-700)" }}>T2000</span>
            {"(),\n  model: "}
            <span style={{ color: "var(--ds-teal-700)" }}>anthropic</span>
            {"("}
            <span style={{ color: "var(--t2k-success)" }}>
              {"'claude-sonnet-4'"}
            </span>
            {"),\n});\n\n"}
            <span style={{ color: "var(--ds-blue-700)" }}>await</span>
            {" engine."}
            <span style={{ color: "var(--ds-teal-700)" }}>run</span>
            {"("}
            <span style={{ color: "var(--t2k-success)" }}>
              {"'Compound my NAVI rewards.'"}
            </span>
            {");"}
          </pre>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-2.5">
          <a
            href={`${DEVELOPERS_URL}/agent-engine`}
            target="_blank"
            rel="noopener noreferrer"
            className="t2k-btn t2k-btn--blue t2k-btn--lg"
          >
            Read the docs&nbsp;↗
          </a>
          <a
            href={AUDRIC_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="t2k-btn t2k-btn--ghost t2k-btn--lg"
          >
            See it in Audric&nbsp;↗
          </a>
        </div>
      </div>
    </section>
  );
}
