import { Nav } from "./components/site/Nav";
import { SiteFooter } from "./components/site/SiteFooter";
import { Hero } from "./components/home/Hero";
import { ConsoleBand } from "./components/home/ConsoleBand";
import { StackBlocks } from "./components/home/StackBlocks";
import { Metrics } from "./components/home/Metrics";
import { CloserPrompt } from "./components/home/CloserPrompt";

export const revalidate = 60;

export default function HomePage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <ConsoleBand />
        <StackBlocks />
        <Metrics />
        <CloserPrompt />
      </main>
      <SiteFooter />
    </>
  );
}
