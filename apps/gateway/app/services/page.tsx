import { getCatalog } from "@/lib/catalog-live";
import { categoryBuckets, totalServices, totalEndpoints } from "@/lib/catalog";
import { MppNav } from "../components/site/MppNav";
import { MppFooter } from "../components/site/MppFooter";
import { MppCatalog } from "../components/services/MppCatalog";

// Merged catalog (static ⊕ self-listed direct sellers) — re-rendered on the
// same 60s cadence as /api/services.
export const revalidate = 60;

// No counts in the meta description — build-baked numbers drift from the
// live merged catalog (the 41-vs-44 class); the on-page header carries the
// live figures.
export const metadata = {
  title: "Services — mpp.t2000.ai",
  description:
    "Pay-per-request APIs in USDC on Sui. Search and expand any service to see its endpoints.",
};

export default async function ServicesPage() {
  const catalog = await getCatalog();
  return (
    <>
      <MppNav currentPage="services" />
      <main>
        <MppCatalog services={catalog} categories={categoryBuckets(catalog)} />
      </main>
      <MppFooter
        serviceCount={totalServices(catalog)}
        endpointCount={totalEndpoints(catalog)}
      />
    </>
  );
}
