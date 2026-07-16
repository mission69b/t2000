import type { Metadata } from "next";

import { CodeCloser } from "../components/code/CodeCloser";
import { CodeHero } from "../components/code/CodeHero";
import { CodePrivacy } from "../components/code/CodePrivacy";
import { CodeScaffold } from "../components/code/CodeScaffold";
import { CodeFeatures } from "../components/code/CodeSections";
import { Nav } from "../components/site/Nav";
import { ProductStrip } from "../components/site/ProductStrip";
import { SiteFooter } from "../components/site/SiteFooter";

const DESC =
  "A terminal coding agent on open models — zero data retention, telemetry stripped at the source, three privacy modes, and a free daily allowance. Your code is not the product.";

export const metadata: Metadata = {
  title: "t2 code — the free private coding agent",
  description: DESC,
  openGraph: {
    title: "t2 code — the free private coding agent",
    description: DESC,
    url: "https://t2000.ai/code",
    type: "website",
    images: ["/og/og-t2000.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "t2 code — the free private coding agent",
    description: DESC,
    images: ["/og/og-t2000.png"],
  },
};

export default function CodePage() {
  return (
    <>
      <Nav currentPage="code" />
      <main>
        <CodeHero />
        <CodeScaffold />
        <CodePrivacy />
        <CodeFeatures />
        <ProductStrip currentPage="code" />
        <CodeCloser />
      </main>
      <SiteFooter />
    </>
  );
}
