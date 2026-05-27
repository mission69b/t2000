import { services } from "@/lib/services";
import { categoryBuckets, totalServices, totalEndpoints } from "@/lib/catalog";
import { MppNav } from "../components/site/MppNav";
import { MppFooter } from "../components/site/MppFooter";
import { MppCatalog } from "../components/services/MppCatalog";

export const metadata = {
  title: "Services — mpp.t2000.ai",
  description: "40 services, 88 endpoints. Pay-per-request in USDC on Sui. Search and expand any service to see its endpoints.",
};

export default function ServicesPage() {
  return (
    <>
      <MppNav currentPage="services" />
      <MppCatalog services={services} categories={categoryBuckets()} />
      <MppFooter
        serviceCount={totalServices()}
        endpointCount={totalEndpoints()}
      />
    </>
  );
}
