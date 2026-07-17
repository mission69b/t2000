import { getCatalog } from "@/lib/catalog-live";
import { totalEndpoints, totalServices } from "@/lib/catalog";
import { CopyChip } from "../components/services/CopyChip";
import { MppFooter } from "../components/site/MppFooter";
import { MppNav } from "../components/site/MppNav";
import { SellFlow } from "./SellFlow";

// [SPEC_T2_AGENTS_STORE Phase 1] /sell — the ONE sell path (§2.1 invariant).
// Lives on the rail (founder decision 2026-07-17 PM): selling is contained on
// mpp.t2000.ai end to end — check, list, and the catalog entry all on one
// domain. agents.t2000.ai links here and keeps the buyer-facing store page.

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
        <div className="t2k-container">
          <div className="mx-auto max-w-[760px] pb-16">
            <section className="pt-14">
              <div className="t2k-eyebrow">{"// SELL ON THE GATEWAY"}</div>
              <h1
                className="t2k-display mt-2"
                style={{ fontSize: "clamp(30px, 4vw, 44px)" }}
              >
                Paste a URL. Start selling.
              </h1>
              <p
                className="mt-3 max-w-[560px] text-[14px] leading-relaxed"
                style={{ color: "var(--fg-muted)" }}
              >
                If your API answers 402 with an x402 payment challenge, it can
                sell here — no account, no sign-up, no keys. Buyers pay USDC
                per call, straight to your wallet, and every sale lands on your
                on-chain track record.
              </p>
            </section>

            <section className="pt-7">
              <SellFlow />
            </section>

            <section className="grid gap-3 pt-6 pb-4">
              <div className="t2k-card grid gap-3">
                <div
                  className="text-[13px] font-semibold"
                  style={{ color: "var(--fg)" }}
                >
                  Don&apos;t speak 402 yet?
                </div>
                <p
                  className="m-0 text-[12.5px] leading-relaxed"
                  style={{ color: "var(--fg-muted)" }}
                >
                  Hand this to your coding agent — it reads the seller guide,
                  adds x402 to your API, and lists it end to end:
                </p>
                <div className="flex items-start gap-2">
                  <p
                    className="m-0 flex-1 rounded-md border px-3 py-2 font-mono text-[11px] leading-[1.55]"
                    style={{
                      borderColor: "var(--ds-gray-alpha-400)",
                      color: "var(--fg-subtle)",
                    }}
                  >
                    {AGENT_PROMPT}
                  </p>
                  <CopyChip label="Copy prompt" payload={AGENT_PROMPT} muted />
                </div>
                <p
                  className="m-0 text-[12px] leading-relaxed"
                  style={{ color: "var(--fg-subtle)" }}
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
                  <span className="font-mono" style={{ color: "var(--fg)" }}>
                    t2 check &lt;url&gt; --list
                  </span>
                </p>
              </div>
            </section>
          </div>
        </div>
      </main>
      <MppFooter
        serviceCount={totalServices(catalog)}
        endpointCount={totalEndpoints(catalog)}
      />
    </>
  );
}
