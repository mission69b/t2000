import { Nav } from "./components/site/Nav";
import { SiteFooter } from "./components/site/SiteFooter";
import { Hero } from "./components/home/Hero";
import { WhatCanIDo } from "./components/home/WhatCanIDo";
import { Products } from "./components/home/Products";
import { Catalog } from "./components/home/Catalog";
import { GettingStarted } from "./components/home/GettingStarted";
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
        <WhatCanIDo />
        <Products />
        <Catalog />
        <GettingStarted />
        <Pricing />
        <Metrics />
        <CloserPrompt />
      </main>
      <SiteFooter />
    </>
  );
}
