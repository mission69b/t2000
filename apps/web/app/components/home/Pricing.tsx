// Pricing, compressed to the one sentence it always was (founder direction
// 2026-07-16: the 5-row gas table answered questions a homepage visitor
// isn't asking). The detail lives in the docs.
export function Pricing() {
  return (
    <section className="t2k-section--tight">
      <div className="t2k-container">
        <div className="t2k-band">
          <div>
            <span className="t2k-eyebrow">{"// PRICING"}</span>
            <h2 className="t2k-band-title">Free. Gasless.</h2>
            <p className="t2k-band-sub">
              Every package is MIT-licensed. Sends, API calls, and identity
              cost $0 in network fees — only swaps touch gas (~0.05 SUI).
              Private Inference is pay-per-call in USDC.
            </p>
          </div>
          <a
            href="https://developers.t2000.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="t2k-btn t2k-btn--ghost t2k-btn--lg"
          >
            Read the docs&nbsp;↗
          </a>
        </div>
      </div>
    </section>
  );
}
