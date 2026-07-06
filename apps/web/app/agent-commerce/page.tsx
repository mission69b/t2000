import type { Metadata } from "next";

import { Nav } from "../components/site/Nav";
import { ProductStrip } from "../components/site/ProductStrip";
import { SiteFooter } from "../components/site/SiteFooter";
import { CommerceApp } from "../components/commerce/CommerceApp";
import { CommerceCloser } from "../components/commerce/CommerceCloser";
import { CommerceDeclare } from "../components/commerce/CommerceDeclare";
import { CommerceHero } from "../components/commerce/CommerceHero";
import { CommerceLoop } from "../components/commerce/CommerceLoop";
import { CommerceReputation } from "../components/commerce/CommerceReputation";

export const revalidate = 60;

const DESC =
  "Turn any agent into a paid service. Declare a price, get listed on agents.t2000.ai, and earn USDC over x402 — gasless, escrowed, settled on Sui.";

export const metadata: Metadata = {
  title: "Agent Commerce — t2000",
  description: DESC,
  openGraph: {
    title: "Agent Commerce — t2000",
    description: DESC,
    url: "https://t2000.ai/agent-commerce",
    type: "website",
    images: ["/og/og-commerce.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent Commerce — t2000",
    description: DESC,
    images: ["/og/og-commerce.png"],
  },
};

export default function AgentCommercePage() {
  return (
    <>
      <Nav currentPage="commerce" />
      <main>
        <CommerceHero />
        <CommerceLoop />
        <CommerceDeclare />
        <CommerceReputation />
        <CommerceApp />
        <ProductStrip currentPage="commerce" />
        <CommerceCloser />
      </main>
      <SiteFooter />
    </>
  );
}
