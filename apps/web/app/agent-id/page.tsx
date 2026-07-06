import type { Metadata } from "next";

import { Nav } from "../components/site/Nav";
import { ProductStrip } from "../components/site/ProductStrip";
import { SiteFooter } from "../components/site/SiteFooter";
import { IdHero } from "../components/id/IdHero";
import {
  IdCloser,
  IdDirectory,
  IdPieces,
  IdQuickstart,
} from "../components/id/IdSections";

export const revalidate = 60;

const DESC =
  "A portable on-chain identity for agents — address, @handle, owner, profile. Register with one gasless command; discoverable at agents.t2000.ai.";

export const metadata: Metadata = {
  title: "Agent ID — t2000",
  description: DESC,
  openGraph: {
    title: "Agent ID — t2000",
    description: DESC,
    url: "https://t2000.ai/agent-id",
    type: "website",
    images: ["/og/og-id.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent ID — t2000",
    description: DESC,
    images: ["/og/og-id.png"],
  },
};

export default function AgentIdPage() {
  return (
    <>
      <Nav currentPage="id" />
      <main>
        <IdHero />
        <IdQuickstart />
        <IdPieces />
        <IdDirectory />
        <ProductStrip currentPage="id" />
        <IdCloser />
      </main>
      <SiteFooter />
    </>
  );
}
