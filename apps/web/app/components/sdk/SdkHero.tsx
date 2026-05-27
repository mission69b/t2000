import { DEVELOPERS_URL, GITHUB_URL } from "../../data/t2k";
import { Breadcrumb } from "../site/Breadcrumb";
import { SdkHeroCode } from "./SdkHeroCode";

export function SdkHero() {
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
            "radial-gradient(45% 50% at 50% 50%, rgba(0,114,245,0.08) 0%, transparent 70%)",
          filter: "blur(24px)",
        }}
      />

      <div className="t2k-container relative">
        <Breadcrumb />

        <div
          className="grid items-center gap-10 lg:gap-14"
          style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.05fr)" }}
        >
          <div>
            <div className="t2k-eyebrow mb-[22px]">
              {"// AGENT SDK · @t2000/sdk"}
            </div>
            <h1
              className="t2k-display"
              style={{
                fontSize: "clamp(40px, 5.8vw, 76px)",
                color: "var(--fg)",
              }}
            >
              Build agentic
              <br />
              <span style={{ color: "var(--t2k-accent)" }}>finance.</span>
            </h1>
            <p
              className="m-0 mt-[26px] max-w-[500px] text-[19px] leading-[1.5]"
              style={{
                color: "var(--fg-muted)",
                letterSpacing: "-0.014em",
              }}
            >
              Wallet, Payments, Engine. One npm install. One class.
            </p>

            <div className="mt-8 flex flex-wrap gap-2.5">
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

            <div
              className="mt-[22px] inline-flex items-center gap-2.5 rounded-md border px-3 py-2 font-mono text-[12.5px]"
              style={{
                background: "var(--ds-gray-alpha-100)",
                borderColor: "var(--ds-gray-alpha-300)",
                color: "var(--fg)",
              }}
            >
              <span style={{ color: "var(--fg-subtle)" }}>$</span>
              <span>npm install @t2000/sdk</span>
            </div>

            <div
              className="mt-[18px] flex flex-wrap gap-3.5 font-mono text-[11px]"
              style={{
                color: "var(--fg-subtle)",
                letterSpacing: "0.02em",
              }}
            >
              <span>TypeScript 5.0+</span>
              <span className="opacity-40">·</span>
              <span>ESM + CJS</span>
              <span className="opacity-40">·</span>
              <span>Tree-shakable</span>
            </div>
          </div>

          <SdkHeroCode />
        </div>
      </div>
    </section>
  );
}
