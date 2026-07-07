import type { Metadata } from "next";
import { Nav } from "../components/site/Nav";
import { VerifierCard } from "../components/verify/VerifierCard";
import { SiteFooter } from "../components/site/SiteFooter";
import { ProductStrip } from "../components/site/ProductStrip";
import { DEVELOPERS_URL, VERIFY_URL } from "../data/t2k";

const DESC =
  "Check any confidential AI response yourself — signed receipt, attested GPU-TEE, on-chain Sui anchor. The live explorer is verify.t2000.ai; the full check is one CLI command.";

export const metadata: Metadata = {
  title: "Verify — t2000",
  description: DESC,
  openGraph: {
    title: "Verify — t2000",
    description: DESC,
    url: "https://t2000.ai/verify",
    type: "website",
    images: ["/og/og-verify.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Verify — t2000",
    description: DESC,
    images: ["/og/og-verify.png"],
  },
};

// Thin explainer only — the real verifier lives at verify.t2000.ai (its own
// app with the live receipt feed + verification API). Per the repositioning
// rule, this page links out instead of duplicating a second verify hub.
const CHECKS = [
  {
    k: "01",
    name: "Signed receipt",
    desc: "Every confidential response returns an x-receipt-id. The receipt commits the request/response hashes — bodies are never stored.",
  },
  {
    k: "02",
    name: "Attested hardware",
    desc: "The receipt records the upstream GPU-TEE attestation — an Intel TDX quote checked before your prompt was forwarded, fail-closed.",
  },
  {
    k: "03",
    name: "Sui anchor",
    desc: "The receipt hash is committed on Sui — tamper-evident and publicly timestamped, read straight from a fullnode.",
  },
  {
    k: "04",
    name: "Check it yourself",
    desc: "verify.t2000.ai re-checks the anchor and signature for any receipt id; `t2 verify` runs the full check — including the TDX quote against Intel — on your machine.",
  },
] as const;

export default function VerifyExplainerPage() {
  return (
    <>
      <Nav currentPage="verify" />
      <main>
        <section
          className="relative overflow-hidden border-b"
          style={{ padding: "92px 0 72px", borderBottomColor: "var(--border)" }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute"
            style={{
              right: "-8%",
              top: "6%",
              width: 720,
              height: 520,
              background:
                "radial-gradient(45% 50% at 50% 50%, rgba(29,168,96,0.09) 0%, transparent 70%)",
              filter: "blur(24px)",
            }}
          />
          <div className="t2k-container relative">
            <div className="grid items-center gap-y-9 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,1fr)] lg:gap-x-14">
              <div>
                <div className="t2k-eyebrow mb-[22px]">
                  {"// VERIFY · verify.t2000.ai"}
                </div>
                <h1
                  className="t2k-display"
                  style={{ fontSize: "clamp(40px, 5.6vw, 74px)", color: "var(--fg)" }}
                >
                  Don&rsquo;t trust it.
                  <br />
                  <span style={{ color: "var(--t2k-success)" }}>Check it.</span>
                </h1>
                <p
                  className="m-0 max-w-[560px]"
                  style={{
                    marginTop: 26,
                    fontSize: 18,
                    lineHeight: 1.55,
                    color: "var(--fg-muted)",
                    letterSpacing: "-0.014em",
                  }}
                >
                  Every confidential response from the{" "}
                  <span style={{ color: "var(--fg)" }}>
                    Private &amp; Confidential API
                  </span>{" "}
                  carries a signed receipt anchored on Sui. Paste a receipt id
                  — or run the full check, including the Intel TDX quote, on
                  your own machine.
                </p>
              </div>

              <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
                <VerifierCard />
              </div>

              <div className="lg:col-start-1">
                <div className="flex flex-wrap gap-2.5">
                  <a
                    href={VERIFY_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="t2k-btn t2k-btn--blue t2k-btn--lg"
                  >
                    Open verify.t2000.ai&nbsp;↗
                  </a>
                  <a
                    href={`${DEVELOPERS_URL}/confidential-ai/verify`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="t2k-btn t2k-btn--ghost t2k-btn--lg"
                  >
                    How verification works&nbsp;↗
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="t2k-section">
          <div className="t2k-container">
            <header className="mb-10">
              <span className="t2k-eyebrow">{"// WHAT GETS CHECKED"}</span>
              <h2 className="t2k-section-title mt-3">Four checks per receipt.</h2>
            </header>
            <div className="grid gap-4 lg:grid-cols-2">
              {CHECKS.map((r) => (
                <div
                  key={r.k}
                  className="t2k-card flex gap-5"
                  style={{ padding: "26px 28px" }}
                >
                  <span
                    className="flex-none font-mono text-[13px]"
                    style={{ color: "var(--t2k-success)" }}
                  >
                    {r.k}
                  </span>
                  <div>
                    <h3
                      className="m-0 mb-2 text-[18px] font-semibold"
                      style={{ letterSpacing: "-0.017em" }}
                    >
                      {r.name}
                    </h3>
                    <p
                      className="m-0 text-[13.5px] leading-[1.6]"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      {r.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p
              className="mt-5 font-mono text-[12.5px]"
              style={{ color: "var(--fg-subtle)" }}
            >
              {"// The browser explorer re-checks the anchor + signature; the TDX quote check runs client-side via the CLI."}
            </p>
          </div>
        </section>

        <ProductStrip currentPage="verify" />
      </main>
      <SiteFooter />
    </>
  );
}
