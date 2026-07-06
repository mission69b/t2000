import { DEVELOPERS_URL, T2000_URL } from "../data/site";

// Static sections from the designer's VerifyPage.jsx — How it works + the
// trust-loop closer. Copy per design; step 1 says "upstream" (the TEE host)
// rather than "gateway" for accuracy.

const STEPS = [
  {
    n: "1",
    t: "Attest",
    d: "The upstream proves it's a genuine GPU-TEE with a hardware attestation report — and publishes the keys it signs with.",
  },
  {
    n: "2",
    t: "Sign",
    d: "Each response gets a receipt binding your request + response hashes to that attested workload. Hashes, never bodies.",
  },
  {
    n: "3",
    t: "Anchor",
    d: "The receipt's hash is committed on Sui as a ReceiptAnchored event — public, tamper-evident, permanent.",
  },
  {
    n: "4",
    t: "Verify",
    d: "t2 verify recovers the signature and re-checks the Sui anchor + Intel TDX quote — all client-side. No trust in t2000.",
  },
] as const;

export function VerifyHow() {
  return (
    <section
      className="t2k-section"
      style={{
        background: "var(--ds-background-200)",
        borderTop: "1px solid var(--ds-gray-alpha-300)",
      }}
    >
      <div className="t2k-container">
        <header style={{ marginBottom: 44 }}>
          <span className="t2k-eyebrow">{"// HOW IT WORKS"}</span>
          <h2 className="t2k-section-title" style={{ marginTop: 12 }}>
            Four steps, zero trust.
          </h2>
        </header>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="t2k-card flex flex-col"
              style={{ padding: 24, background: "var(--ds-background-100)", gap: 12 }}
            >
              <span
                className="inline-flex items-center justify-center font-mono"
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: "var(--t2k-accent)",
                  color: "#fff",
                  fontSize: 12,
                }}
              >
                {s.n}
              </span>
              <h3
                style={{
                  fontWeight: 600,
                  fontSize: 17,
                  letterSpacing: "-0.014em",
                  margin: 0,
                  color: "var(--fg)",
                }}
              >
                {s.t}
              </h3>
              <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--fg-muted)", margin: 0 }}>
                {s.d}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function VerifyCloser() {
  return (
    <section
      className="t2k-section"
      style={{ borderTop: "1px solid var(--ds-gray-alpha-300)" }}
    >
      <div className="t2k-container text-center" style={{ maxWidth: 700 }}>
        <span className="t2k-eyebrow">{"// THE TRUST LOOP"}</span>
        <h2
          className="t2k-display mx-auto"
          style={{ fontSize: "clamp(36px, 4.8vw, 58px)", color: "var(--fg)", marginTop: 14 }}
        >
          Private is a claim.
          <br />
          <span style={{ color: "var(--t2k-success)" }}>Verifiable is a proof.</span>
        </h2>
        <p
          className="mx-auto"
          style={{
            fontSize: 17,
            lineHeight: 1.55,
            color: "var(--fg-muted)",
            margin: "20px auto 0",
            maxWidth: 500,
            letterSpacing: "-0.011em",
          }}
        >
          Every confidential response is one paste away from proof. Build on
          data you can check.
        </p>
        <div className="flex flex-wrap justify-center" style={{ gap: 10, marginTop: 28 }}>
          <a href={`${T2000_URL}/private-api`} className="t2k-btn t2k-btn--blue t2k-btn--lg">
            Private API&nbsp;→
          </a>
          <a
            href={`${DEVELOPERS_URL}/confidential-ai/how-it-works`}
            target="_blank"
            rel="noopener noreferrer"
            className="t2k-btn t2k-btn--ghost t2k-btn--lg"
          >
            How it works&nbsp;↗
          </a>
        </div>
      </div>
    </section>
  );
}
