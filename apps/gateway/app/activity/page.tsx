import { MppNav } from "../components/site/MppNav";
import { MppFooter } from "../components/site/MppFooter";
import { MppActivityPage } from "../components/activity/MppActivityPage";
import { totalServices, totalEndpoints } from "@/lib/catalog";

export const metadata = {
  title: "Activity — mpp.t2000.ai",
  description: "Live feed of pay-per-request API calls settled on Sui in USDC.",
};

export default function ActivityPage() {
  return (
    <>
      <MppNav currentPage="activity" />
      <MppActivityPage />
      <MppFooter
        serviceCount={totalServices()}
        endpointCount={totalEndpoints()}
      />
    </>
  );
}
