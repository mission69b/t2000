import Link from "next/link";

// t2 code's slot on the homepage (founder direction 2026-07-16: the stack
// blocks stay four; t2 code gets one band, not a muddled Private Inference
// merge). One strip, one sentence, one button into /code.
export function CodeBand() {
  return (
    <section className="t2k-section--tight">
      <div className="t2k-container">
        <div className="t2k-band">
          <div>
            <span className="t2k-eyebrow">{"// T2 CODE"}</span>
            <h2 className="t2k-band-title">The free private coding agent.</h2>
            <p className="t2k-band-sub">
              Open models, zero telemetry, a free daily allowance — your code
              is not the product.{" "}
              <code
                className="font-mono text-[13px]"
                style={{ color: "var(--fg)" }}
              >
                npm install -g @t2000/code
              </code>
            </p>
          </div>
          <Link href="/code" className="t2k-btn t2k-btn--blue t2k-btn--lg">
            Meet t2 code&nbsp;→
          </Link>
        </div>
      </div>
    </section>
  );
}
