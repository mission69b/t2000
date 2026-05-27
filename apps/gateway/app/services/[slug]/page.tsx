import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { services } from "@/lib/services";
import { totalServices, totalEndpoints } from "@/lib/catalog";
import { MppNav } from "../../components/site/MppNav";
import { MppFooter } from "../../components/site/MppFooter";
import { ServiceDetail } from "../../components/services/ServiceDetail";

export function generateStaticParams() {
  return services.map((s) => ({ slug: s.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const service = services.find((s) => s.id === slug);
  if (!service) {
    return {
      title: "Not found — mpp.t2000.ai",
    };
  }
  return {
    title: `${service.name} — mpp.t2000.ai`,
    description: service.description,
  };
}

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const service = services.find((s) => s.id === slug);
  if (!service) {
    notFound();
  }

  const primary = service.categories[0];
  const related = services
    .filter(
      (s) =>
        s.id !== service.id &&
        primary &&
        s.categories.includes(primary),
    )
    .slice(0, 3);

  return (
    <>
      <MppNav currentPage="services" />
      <ServiceDetail service={service} related={related} />
      <MppFooter
        serviceCount={totalServices()}
        endpointCount={totalEndpoints()}
      />
    </>
  );
}
