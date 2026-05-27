import { AUDRIC_URL, DEVELOPERS_URL } from "../../data/t2k";
import { Breadcrumb } from "../site/Breadcrumb";
import { EngineHeroTrace } from "./EngineHeroTrace";

export function EngineHero() {
  return (
    <section
      className="relative overflow-hidden border-b"
      style={{
        padding: "80px 0 64px",
        borderBottomColor: "var(--ds-gray-alpha-300)",
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          right: "-10%",
          top: "8%",
          width: 720,
          height: 540,
          background:
            "radial-gradient(45% 50% at 50% 50%, rgba(0,114,245,0.10) 0%, transparent 70%)",
          filter: "blur(24px)",
        }}
      />

      <div className="t2k-container relative">
        <Breadcrumb />

        <div className="grid items-center gap-10 lg:gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div>
            <div className="t2k-eyebrow mb-[22px]">
              {"// AGENT ENGINE · @t2000/engine"}
            </div>
            <h1
              className="t2k-display"
              style={{
                fontSize: "clamp(40px, 5.8vw, 76px)",
                color: "var(--fg)",
              }}
            >
              The engine that powers
              <br />
              <span style={{ color: "var(--t2k-accent)" }}>Audric.</span>
            </h1>
            <p
              className="m-0 mt-[26px] max-w-[500px] text-[19px] leading-[1.5]"
              style={{
                color: "var(--fg-muted)",
                letterSpacing: "-0.014em",
              }}
            >
              Plug in any LLM. Get 26 tools, 12 safety guards, and a finance
              runtime ready to ship.
            </p>

            <div className="mt-8 flex flex-wrap gap-2.5">
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
                Try Audric&nbsp;↗
              </a>
            </div>

            <div
              className="mt-[22px] inline-flex items-center gap-2.5 rounded-md border px-3 py-2 font-mono text-[12.5px]"
              style={{
                background: "var(--ds-gray-alpha-100)",
                borderColor: "var(--ds-gray-alpha-300)",
                color: "var(--fg)",
              }}
            >
              <span style={{ color: "var(--fg-subtle)" }}>$</span>
              <span>npm install @t2000/engine</span>
            </div>

            <div
              className="mt-[22px] flex flex-wrap gap-3.5 font-mono text-[11px]"
              style={{
                color: "var(--fg-subtle)",
                letterSpacing: "0.02em",
              }}
            >
              <span>26 tools</span>
              <span className="opacity-40">·</span>
              <span>12 guards</span>
              <span className="opacity-40">·</span>
              <span>Any provider</span>
            </div>
          </div>

          <EngineHeroTrace />
        </div>
      </div>
    </section>
  );
}
