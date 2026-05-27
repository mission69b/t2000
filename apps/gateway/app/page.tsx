import { MppNav } from "./components/site/MppNav";
import { MppFooter } from "./components/site/MppFooter";
import { MppHero } from "./components/home/MppHero";
import { MppMetrics } from "./components/home/MppMetrics";
import { MppCatalogTeaser } from "./components/home/MppCatalogTeaser";
import { MppCloser } from "./components/home/MppCloser";
import { totalServices, totalEndpoints } from "@/lib/catalog";

export default function HomePage() {
  return (
    <>
      <MppNav />
      <main>
        <MppHero />
        <MppMetrics />
        <MppCatalogTeaser />
        <MppCloser />
      </main>
      <MppFooter
        serviceCount={totalServices()}
        endpointCount={totalEndpoints()}
      />
    </>
  );
}
