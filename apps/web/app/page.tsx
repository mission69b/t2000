import { Nav } from "./components/site/Nav";
import { SiteFooter } from "./components/site/SiteFooter";
import { Hero } from "./components/home/Hero";
import { CodeBand } from "./components/home/CodeBand";
import { StackBlocks } from "./components/home/StackBlocks";
import { Pricing } from "./components/home/Pricing";
import { Metrics } from "./components/home/Metrics";
import { CloserPrompt } from "./components/home/CloserPrompt";

export const revalidate = 60;

export default function HomePage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <CodeBand />
        <StackBlocks />
        <Metrics />
        <Pricing />
        <CloserPrompt />
      </main>
      <SiteFooter />
    </>
  );
}
