import type { Metadata } from "next";

import { PaymentsCloser } from "../components/payments/PaymentsCloser";
import { PaymentsExamples } from "../components/payments/PaymentsExamples";
import { PaymentsHero } from "../components/payments/PaymentsHero";
import { PaymentsProtocol } from "../components/payments/PaymentsProtocol";
import { Nav } from "../components/site/Nav";
import { ProductStrip } from "../components/site/ProductStrip";
import { SiteFooter } from "../components/site/SiteFooter";

export const metadata: Metadata = {
  title: "Agent Payments — t2000",
  description:
    "Pay any x402 API in USDC — priced per call, gasless on Sui. No signup, no API keys.",
  openGraph: {
    title: "Agent Payments — t2000",
    description:
      "Pay any API in USDC. Your agent hits an endpoint, the seller prices it, USDC settles in under a second.",
    url: "https://t2000.ai/agent-payments",
    type: "website",
    images: ["/og/og-payments.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent Payments — t2000",
    description:
      "Pay any API in USDC. Your agent hits an endpoint, the seller prices it, USDC settles in under a second.",
    images: ["/og/og-payments.png"],
  },
};

export default function AgentPaymentsPage() {
  return (
    <>
      <Nav currentPage="payments" />
      <main>
        <PaymentsHero />
        <PaymentsExamples />
        <PaymentsProtocol />
        <ProductStrip currentPage="payments" />
        <PaymentsCloser />
      </main>
      <SiteFooter />
    </>
  );
}
