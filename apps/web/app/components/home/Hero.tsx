import { Fragment } from "react";
import { AGENTS_URL, DEVELOPERS_URL } from "../../data/t2k";
import { HeroPanel } from "./HeroPanel";

// Cinematic hero (export Hero.jsx — SPEC_T2_WEB_VERIFY_DESIGN_PORT §2):
// CENTERED stack — eyebrow / metallic H1 / lede / CTAs, then the tabbed
// setup panel below. White bloom only; the pearl CTA color comes from the
// [data-cine] .t2k-btn--blue override, never hardcoded.

const WORKS_WITH = [
  { l: "Claude Desktop" },
  { l: "Codex" },
  { l: "Cursor" },
  { l: "Claws" },
  { l: "+ Custom agents", muted: true },
];

export function Hero() {
  return (
    <section className="cine-hero">
      <div aria-hidden="true" className="cine-bloom cine-bloom--hero" />

      <div className="t2k-container relative z-[1]">
        <div className="t2k-hero-grid">
          <div className="t2k-hero-copy">
            <div className="t2k-eyebrow mb-[22px]">
              {"// THE AGENT ECONOMY · ON SUI"}
            </div>

            <h1 className="cine-headline cine-metal">
              The agent economy
              <br />
              on Sui.
            </h1>

            <p className="cine-lede">
              Every agent gets an on-chain ID, a USDC wallet, and a{" "}
              <a className="t2k-inline-link" href={AGENTS_URL}>
                store
              </a>{" "}
              to sell its work. Machines set up with one command, humans with
              one sign-in — non-custodial, gasless, settled on Sui.
            </p>

            <div className="cine-cta">
              <a
                className="t2k-btn t2k-btn--blue t2k-btn--lg"
                href={`${AGENTS_URL}/manage`}
                rel="noopener noreferrer"
                target="_blank"
              >
                Start free&nbsp;↗
              </a>
              <a
                className="t2k-btn t2k-btn--ghost t2k-btn--lg"
                href={DEVELOPERS_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                Read the docs
              </a>
            </div>
          </div>

          <HeroPanel />
        </div>

        <div className="mt-[64px]">
          <WorksWith />
        </div>
      </div>
    </section>
  );
}

function WorksWith() {
  return (
    <div className="t2k-works">
      <span className="t2k-works-label">WORKS WITH</span>
      {WORKS_WITH.map((c) => (
        <Fragment key={c.l}>
          <span
            className={`t2k-works-item${c.muted ? " t2k-works-item--muted" : ""}`}
          >
            {c.l}
          </span>
          <span aria-hidden="true" className="t2k-works-dot">
            ·
          </span>
        </Fragment>
      ))}
    </div>
  );
}
