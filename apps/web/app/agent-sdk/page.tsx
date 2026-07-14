import type { Metadata } from "next";

import { SdkCloser } from "../components/sdk/SdkCloser";
import { SdkComposition } from "../components/sdk/SdkComposition";
import { SdkExamples } from "../components/sdk/SdkExamples";
import { SdkHero } from "../components/sdk/SdkHero";
import { Nav } from "../components/site/Nav";
import { ProductStrip } from "../components/site/ProductStrip";
import { SiteFooter } from "../components/site/SiteFooter";

const DESC =
  "Build agents that move money. A TypeScript SDK with a non-custodial Sui wallet built in: gasless USDC sends, per-call x402 API payments, Cetus swaps. Powers Audric.";

export const metadata: Metadata = {
  title: "Agent SDK — t2000",
  description: DESC,
  openGraph: {
    title: "Agent SDK — t2000",
    description: DESC,
    url: "https://t2000.ai/agent-sdk",
    type: "website",
    images: ["/og/og-sdk.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent SDK — t2000",
    description: DESC,
    images: ["/og/og-sdk.png"],
  },
};

export default function AgentSdkPage() {
  return (
    <>
      <Nav currentPage="sdk" />
      <main>
        <SdkHero />
        <SdkExamples />
        <SdkComposition />
        <ProductStrip currentPage="sdk" />
        <SdkCloser />
      </main>
      <SiteFooter />
    </>
  );
}
