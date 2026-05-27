import { Nav } from "./components/site/Nav";
import { SiteFooter } from "./components/site/SiteFooter";
import { Hero } from "./components/home/Hero";
import { Showcase } from "./components/home/Showcase";
import { Stories } from "./components/home/Stories";
import { Catalog } from "./components/home/Catalog";
import { Products } from "./components/home/Products";
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
        <Showcase />
        <Stories />
        <Catalog />
        <Products />
        <Pricing />
        <Metrics />
        <CloserPrompt />
      </main>
      <SiteFooter />
    </>
  );
}
