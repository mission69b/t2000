import { getCatalog } from "@/lib/catalog-live";
import { categoryBuckets, totalServices, totalEndpoints } from "@/lib/catalog";
import { MppNav } from "../components/site/MppNav";
import { MppFooter } from "../components/site/MppFooter";
import { MppCatalog } from "../components/services/MppCatalog";

// Merged catalog (static ⊕ self-listed direct sellers) — re-rendered on the
// same 60s cadence as /api/services.
export const revalidate = 60;

export const metadata = {
  title: "Services — mpp.t2000.ai",
  description: `${totalServices()} services, ${totalEndpoints()} endpoints. Pay-per-request in USDC on Sui. Search and expand any service to see its endpoints.`,
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
