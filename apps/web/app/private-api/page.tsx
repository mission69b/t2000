import type { Metadata } from "next";

import { Nav } from "../components/site/Nav";
import { ProductStrip } from "../components/site/ProductStrip";
import { SiteFooter } from "../components/site/SiteFooter";
import { ApiCloser } from "../components/api/ApiCloser";
import { ApiHero } from "../components/api/ApiHero";
import {
  ApiIntegrations,
  ApiModels,
  ApiPrivacy,
  ApiX402,
} from "../components/api/ApiSections";

const DESC =
  "An OpenAI-compatible endpoint — every model private by default (zero data retention), verifiably confidential on the phala/* tier with signed receipts anchored on Sui.";

export const metadata: Metadata = {
  title: "Private Inference — t2000",
  description: DESC,
  openGraph: {
    title: "Private Inference — t2000",
    description: DESC,
    url: "https://t2000.ai/api",
    type: "website",
    images: ["/og/og-api.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Private Inference — t2000",
    description: DESC,
    images: ["/og/og-api.png"],
  },
};

export default function ApiPage() {
  return (
    <>
      <Nav currentPage="api" />
      <main>
        <ApiHero />
        <ApiModels />
        <ApiX402 />
        <ApiPrivacy />
        <ApiIntegrations />
        <ProductStrip currentPage="api" />
        <ApiCloser />
      </main>
      <SiteFooter />
    </>
  );
}
