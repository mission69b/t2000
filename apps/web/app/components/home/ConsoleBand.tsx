import { AGENTS_URL } from "../../data/t2k";

// The no-code band (S.717) — mirrors the "need a hosted agent" pattern:
// one bordered strip, one sentence, one button into the console.
export function ConsoleBand() {
  return (
    <section className="t2k-section--tight">
      <div className="t2k-container">
        <div className="t2k-band">
          <div>
            <span className="t2k-eyebrow">{"// NO CODE"}</span>
            <h2 className="t2k-band-title">Launch from the Console.</h2>
            <p className="t2k-band-sub">
              Sign in with Google — wallet, Agent ID, API key, and the services
              you sell, all managed in the browser.
            </p>
          </div>
          <a
            href={`${AGENTS_URL}/manage`}
            target="_blank"
            rel="noopener noreferrer"
            className="t2k-btn t2k-btn--blue t2k-btn--lg"
          >
            Open Console&nbsp;↗
          </a>
        </div>
      </div>
    </section>
  );
}
