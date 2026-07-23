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
  ApiRouter,
} from "../components/api/ApiSections";
import { ApiUsage } from "../components/api/ApiUsage";

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

async function getLiveTokens(): Promise<number | null> {
  const usage = (await fetch("https://api.t2000.ai/v1/usage/global", {
    next: { revalidate: 300 },
  })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)) as { all_time?: { tokens?: number } } | null;
  const t = usage?.all_time?.tokens;
  return typeof t === "number" && t > 0 ? t : null;
}

export default async function ApiPage() {
  const liveTokens = await getLiveTokens();
  return (
    <>
      <Nav currentPage="api" />
      <main>
        <ApiHero liveTokens={liveTokens} />
        <ApiRouter />
        <ApiModels />
        <ApiPrivacy />
        <ApiIntegrations />
        <ApiUsage />
        <ProductStrip currentPage="api" />
        <ApiCloser />
      </main>
      <SiteFooter />
    </>
  );
}
