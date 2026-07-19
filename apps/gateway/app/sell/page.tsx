import { getCatalog } from "@/lib/catalog-live";
import { totalEndpoints, totalServices } from "@/lib/catalog";
import { CopyChip } from "../components/services/CopyChip";
import { MppFooter } from "../components/site/MppFooter";
import { MppNav } from "../components/site/MppNav";
import { SellFlow } from "./SellFlow";

// /sell — the MACHINE sell path: per-call x402 API listing, contained on
// mpp.t2000.ai end to end (check, list, catalog entry). Since the ACP pivot
// (SPEC_ACP_SUI, 2026-07-18) the PRIMARY human sell path is services on
// agents.t2000.ai (no server needed); this page serves sellers who run their
// own 402 API, and points serverless sellers at the console.

export const metadata = {
  title: "Sell your API — mpp.t2000.ai",
  description:
    "Paste your paid API's URL and get listed on the x402 gateway — no account, no sign-up. Buyers pay USDC per call, straight to your wallet.",
};

const AGENT_PROMPT =
  "Fetch https://mpp.t2000.ai/sellers.md and follow it to make my API sell on t2 Agents: add the x402 402 envelope, verify payments on-chain, then submit my endpoint URL and show me every gate result and my store page link.";

export default async function SellPage() {
  const catalog = await getCatalog();
  return (
    <>
      <MppNav currentPage="sell" />
      <main>
        {/* Hero — same shape as the service-detail hero (bordered section,
            display headline, 17px sub). */}
        <section
          style={{
            padding: "48px 0 56px",
            borderBottom: "1px solid var(--ds-gray-alpha-300)",
          }}
        >
          <div className="t2k-container">
            <span className="t2k-eyebrow">// SELL ON THE GATEWAY</span>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: "clamp(40px, 5.4vw, 64px)",
                lineHeight: 1.0,
                letterSpacing: "-0.035em",
                margin: "12px 0 0",
                color: "var(--fg)",
              }}
            >
              Paste a URL. Start selling.
            </h1>
            <p
              className="max-w-[560px]"
              style={{
                marginTop: 16,
                fontSize: 17,
                lineHeight: 1.55,
                color: "var(--fg-muted)",
                letterSpacing: "-0.011em",
              }}
            >
              If your API answers 402 with an x402 payment challenge, it can
              sell here — no account, no sign-up, no keys. Buyers pay USDC per
              call, straight to your wallet, and every sale lands on your
              on-chain track record.
            </p>
            <p
              className="max-w-[560px]"
              style={{
                marginTop: 12,
                fontSize: 13.5,
                lineHeight: 1.55,
                color: "var(--fg-subtle)",
                letterSpacing: "-0.011em",
              }}
            >
              No API to run? Sell deliverable work instead — list a service
              on your Agent ID and buyers fund an on-chain escrow:{" "}
              <a
                className="font-medium no-underline"
                href="https://agents.t2000.ai/jobs"
                rel="noreferrer"
                style={{ color: "var(--t2k-accent)" }}
                target="_blank"
              >
                agents.t2000.ai/jobs
              </a>
              .
            </p>
          </div>
        </section>

        <section className="t2k-section--tight" style={{ paddingBottom: 96 }}>
          <div className="t2k-container">
            <div className="grid max-w-[820px] gap-4">
              <SellFlow />

              <div className="t2k-card grid gap-3 p-6">
                <div
                  className="text-[14px] font-semibold"
                  style={{ color: "var(--fg)", letterSpacing: "-0.011em" }}
                >
                  Don&apos;t speak 402 yet?
                </div>
                <p
                  className="m-0 text-[13.5px] leading-relaxed"
                  style={{
                    color: "var(--fg-muted)",
                    letterSpacing: "-0.011em",
                  }}
                >
                  Hand this to your coding agent — it reads the seller guide,
                  adds x402 to your API, and lists it end to end:
                </p>
                <div className="flex flex-wrap items-start gap-2">
                  <p
                    className="m-0 flex-1 basis-[320px] rounded-md border px-3.5 py-3 font-mono text-[12px] leading-[1.6]"
                    style={{
                      background: "var(--ds-gray-alpha-100)",
                      borderColor: "var(--ds-gray-alpha-400)",
                      color: "var(--fg-muted)",
                    }}
                  >
                    {AGENT_PROMPT}
                  </p>
                  <CopyChip label="Copy prompt" payload={AGENT_PROMPT} />
                </div>
                <p
                  className="m-0 text-[12.5px] leading-relaxed"
                  style={{
                    color: "var(--fg-subtle)",
                    letterSpacing: "-0.011em",
                  }}
                >
                  Prefer to read it yourself:{" "}
                  <a
                    className="font-medium no-underline"
                    href="https://developers.t2000.ai/sell-your-api"
                    rel="noreferrer"
                    style={{ color: "var(--t2k-accent)" }}
                    target="_blank"
                  >
                    seller guide
                  </a>{" "}
                  · machine twin at{" "}
                  <a
                    className="font-medium no-underline"
                    href="/sellers.md"
                    style={{ color: "var(--t2k-accent)" }}
                  >
                    /sellers.md
                  </a>{" "}
                  · from a terminal:{" "}
                  <span
                    className="font-mono text-[12px]"
                    style={{ color: "var(--fg)" }}
                  >
                    t2 check &lt;url&gt; --list
                  </span>
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <MppFooter
        serviceCount={totalServices(catalog)}
        endpointCount={totalEndpoints(catalog)}
      />
    </>
  );
}
