import type { Metadata } from "next";

import { EngineCloser } from "../components/engine/EngineCloser";
import { EngineCore } from "../components/engine/EngineCore";
import { EngineHero } from "../components/engine/EngineHero";
import { EngineMemory } from "../components/engine/EngineMemory";
import { EngineRuntime } from "../components/engine/EngineRuntime";
import { EngineSystems } from "../components/engine/EngineSystems";
import { Nav } from "../components/site/Nav";
import { ProductStrip } from "../components/site/ProductStrip";
import { SiteFooter } from "../components/site/SiteFooter";

export const metadata: Metadata = {
  title: "Agent Engine — t2000",
  description:
    "The engine behind Audric. Plug in any LLM. Get 26 financial tools, 12 safety guards, and a finance runtime ready to ship.",
  openGraph: {
    title: "Agent Engine — t2000",
    description:
      "Plug in any LLM. 26 financial tools, 12 safety guards, audit log. The engine behind Audric.",
    url: "https://t2000.ai/agent-engine",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent Engine — t2000",
    description:
      "Plug in any LLM. 26 financial tools, 12 safety guards, audit log. The engine behind Audric.",
  },
};

export default function AgentEnginePage() {
  return (
    <>
      <Nav currentPage="engine" />
      <main>
        <EngineHero />
        <EngineSystems />
        <EngineCore />
        <EngineMemory />
        <EngineRuntime />
        <ProductStrip currentPage="engine" />
        <EngineCloser />
      </main>
      <SiteFooter />
    </>
  );
}
