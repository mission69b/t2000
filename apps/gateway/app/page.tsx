import { MppNav } from "./components/site/MppNav";
import { MppFooter } from "./components/site/MppFooter";
import { MppHero } from "./components/home/MppHero";
import { MppMetrics } from "./components/home/MppMetrics";
import { MppCatalogTeaser } from "./components/home/MppCatalogTeaser";
import { MppCloser } from "./components/home/MppCloser";
import { totalServices, totalEndpoints } from "@/lib/catalog";
import { getCatalog } from "@/lib/catalog-live";

// MppMetrics reads lifetime stats from Prisma. Statically rendered, the
// page freezes the build-time DB state (empty/unreachable → "—") into the
// HTML forever. Render dynamically so the counters always reflect the live
// DB — the query is cheap and the rest of the page is static content.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  // ONE live merged catalog (static ⊕ self-listed direct sellers) feeds every
  // count on the page — the home band and /services must never disagree
  // (founder catch 2026-07-26: 41/89 static vs 44/107 live).
  const catalog = await getCatalog();
  return (
    <>
      <MppNav />
      <main>
        <MppHero />
        <MppMetrics catalog={catalog} />
        <MppCatalogTeaser total={totalServices(catalog)} />
        <MppCloser catalog={catalog} />
      </main>
      <MppFooter
        serviceCount={totalServices(catalog)}
        endpointCount={totalEndpoints(catalog)}
      />
    </>
  );
}
