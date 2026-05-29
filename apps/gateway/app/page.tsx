import { MppNav } from "./components/site/MppNav";
import { MppFooter } from "./components/site/MppFooter";
import { MppHero } from "./components/home/MppHero";
import { MppMetrics } from "./components/home/MppMetrics";
import { MppCatalogTeaser } from "./components/home/MppCatalogTeaser";
import { MppCloser } from "./components/home/MppCloser";
import { totalServices, totalEndpoints } from "@/lib/catalog";

// MppMetrics reads lifetime stats from Prisma. Statically rendered, the
// page freezes the build-time DB state (empty/unreachable → "—") into the
// HTML forever. Render dynamically so the counters always reflect the live
// DB — the query is cheap and the rest of the page is static content.
export const dynamic = "force-dynamic";

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
